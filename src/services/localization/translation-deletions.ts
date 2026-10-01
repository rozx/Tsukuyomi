import type { Paragraph, Translation } from 'src/models/novel';
import type { SyncRevision, TranslationDeletion } from 'src/models/localized-data';
import { TOMBSTONE_TTL_MS } from 'src/models/manifest';
import { assertNewRevision, assertRevision, compareRevision } from './revision';

type Deletions = Record<string, TranslationDeletion>;
/**
 * 内部一律用 Map：版本 ID 是任意非空字符串，可能与 Object.prototype 的属性同名
 * （`constructor`、`__proto__` 等），普通对象的读写会命中继承属性或原型 setter。
 */
type DeletionMap = Map<string, TranslationDeletion>;

function deletionMap(records: Deletions | undefined): DeletionMap {
  return new Map(Object.entries(records ?? {}));
}

/**
 * 删除记录的保留期，与 manifest 删除记录一致。以段落自身最近一次活动（选用写入或删除）为基准，
 * 不读取本机时钟，合并与哈希因此只取决于数据本身；代价是离线超过该期限的设备仍可能把早已
 * 清理掉记录的旧版本带回来。
 */
const RETENTION_MS = TOMBSTONE_TTL_MS;

function validRevision(value: SyncRevision): boolean {
  try {
    assertRevision(value);
    return true;
  } catch {
    return false;
  }
}

/** 按 ID 排序输出；没有记录时省略字段，旧数据规范化后保持原样。 */
function withDeletions(paragraph: Paragraph, records: DeletionMap): Paragraph {
  const { deletedTranslations: _previous, ...rest } = paragraph;
  if (!records.size) return rest;
  return {
    ...rest,
    deletedTranslations: Object.fromEntries(
      [...records].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ),
  };
}

/** 存活副本以更新的 revision 盖过删除记录（撤销或重新加回）。 */
function supersedes(value: Translation, record: TranslationDeletion): boolean {
  return value.revision !== undefined && compareRevision(value.revision, record.revision) > 0;
}

/**
 * 校验删除记录。同 ID 同时存在存活版本与记录（例如尚未升级的客户端按旧规则把副本合并回来）
 * 时按合并规则裁决而不是拒绝加载，否则该书会一直无法同步。
 */
export function normalizeTranslationDeletions(paragraph: Paragraph): Paragraph {
  const value: unknown = paragraph.deletedTranslations;
  if (value === undefined) return paragraph;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('INVALID_TRANSLATION_DELETION');
  const records: DeletionMap = new Map();
  for (const [id, record] of Object.entries(value as Deletions)) {
    // 键沿用译文版本 ID 的取值范围（任意字符串，含旧数据中的空串），否则删除后无法重新加载
    if (
      !record ||
      !Number.isFinite(record.deletedAt) ||
      record.deletedAt < 0 ||
      !validRevision(record.revision)
    )
      throw new Error('INVALID_TRANSLATION_DELETION');
    records.set(id, { revision: { ...record.revision }, deletedAt: record.deletedAt });
  }
  return withDeletions(
    { ...paragraph, translations: reconcileTranslations(paragraph, records) },
    records,
  );
}

/** 同 ID 两条记录取 revision 较新者；revision 相同是同一次删除，取较晚的时间保证对称。 */
export function mergeTranslationDeletions(a?: Deletions, b?: Deletions): Deletions {
  return Object.fromEntries(mergeDeletionMaps(deletionMap(a), deletionMap(b)));
}

function mergeDeletionMaps(a: DeletionMap, b: DeletionMap): DeletionMap {
  const result = new Map(a);
  for (const [id, record] of b) {
    const existing = result.get(id);
    const order = existing ? compareRevision(record.revision, existing.revision) : 1;
    if (order > 0 || (order === 0 && record.deletedAt > existing!.deletedAt))
      result.set(id, record);
  }
  return result;
}

/** 返回存活版本；被保留版本的记录从 `records` 中撤销。 */
function reconcileTranslations(paragraph: Paragraph, records: DeletionMap): Translation[] {
  const selected = new Set(
    Object.values(paragraph.selectedTranslations ?? {}).map((slot) => slot.value),
  );
  return paragraph.translations.filter((value) => {
    const record = records.get(value.id);
    if (!record) return true;
    const keep = selected.has(value.id) || supersedes(value, record);
    if (keep) records.delete(value.id);
    return keep;
  });
}

function pruneDeletions(records: DeletionMap, paragraph: Paragraph): DeletionMap {
  const activity = Math.max(
    0,
    ...[...records.values()].map((record) => record.deletedAt),
    ...Object.values(paragraph.selectedTranslations ?? {}).map((slot) => slot.updatedAt),
  );
  return new Map([...records].filter(([, record]) => record.deletedAt >= activity - RETENTION_MS));
}

/**
 * 让版本列表与删除记录一致：记录压过 revision 不新于它的同 ID 副本；副本 revision 更新，
 * 或仍被某语言选用（删除之后另一设备选用了它）时保留副本并撤销记录，不留下悬空选用。
 * 结果只取决于输入数据，两个方向合并得到相同结果。
 */
export function settleTranslationDeletions(paragraph: Paragraph): Paragraph {
  const records = deletionMap(paragraph.deletedTranslations);
  const translations = reconcileTranslations(paragraph, records);
  return withDeletions({ ...paragraph, translations }, pruneDeletions(records, paragraph));
}

/**
 * 本地编辑后的记账：编辑前存在、编辑后消失的版本（删除、历史上限逐出、撤销去掉的版本）
 * 写入删除记录；重新加回带删除记录的 ID 时以本次 revision 盖戳，使其压过该记录。
 */
export function recordTranslationDeletions(
  before: Paragraph,
  after: Paragraph,
  revision: SyncRevision,
  deletedAt: number,
): Paragraph {
  const remaining = new Set(after.translations.map((value) => value.id));
  const records = deletionMap(after.deletedTranslations);
  for (const value of before.translations)
    if (!remaining.has(value.id) && !records.has(value.id))
      records.set(value.id, { revision: { ...revision }, deletedAt });
  const translations = after.translations.map((value) => stampOver(value, records, revision));
  return settleTranslationDeletions(withDeletions({ ...after, translations }, records));
}

/** 版本带着删除记录存活时以本次 revision 盖戳，使其压过该记录。 */
function stampOver(value: Translation, records: DeletionMap, revision: SyncRevision): Translation {
  const record = records.get(value.id);
  if (!record || supersedes(value, record)) return value;
  assertNewRevision(revision, record.revision);
  return { ...value, revision: { ...revision } };
}

/**
 * 明确覆盖（强制推送、快照恢复）：另一侧独有的版本按覆盖意图写入删除记录；另一侧已有的删除
 * 记录一并保留（覆盖结果会成为对端的新状态，丢掉它们会让仍持有旧版本的设备把版本带回来）；
 * 保留的版本若在另一侧已被删除，以本次 revision 盖戳压过该记录。
 */
export function replaceTranslationDeletions(
  paragraph: Paragraph,
  prior: Paragraph | undefined,
  revision: SyncRevision,
  deletedAt: number,
): Paragraph {
  const records = mergeDeletionMaps(
    deletionMap(paragraph.deletedTranslations),
    deletionMap(prior?.deletedTranslations),
  );
  const translations = paragraph.translations.map((value) => stampOver(value, records, revision));
  for (const value of translations) records.delete(value.id);
  for (const value of prior?.translations ?? []) {
    const existing = records.get(value.id);
    if (translations.some((entry) => entry.id === value.id)) continue;
    if (existing && !supersedes(value, existing)) continue;
    records.set(value.id, { revision: { ...revision }, deletedAt });
  }
  return withDeletions({ ...paragraph, translations }, records);
}
