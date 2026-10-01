import type { Paragraph, Translation } from 'src/models/novel';
import type { SyncRevision, TranslationDeletion } from 'src/models/localized-data';
import { TOMBSTONE_TTL_MS } from 'src/models/manifest';
import { assertNewRevision, assertRevision, compareRevision } from './revision';

type Deletions = Record<string, TranslationDeletion>;

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
function withDeletions(paragraph: Paragraph, records: Deletions): Paragraph {
  const { deletedTranslations: _previous, ...rest } = paragraph;
  const ids = Object.keys(records).sort();
  if (!ids.length) return rest;
  return {
    ...rest,
    deletedTranslations: Object.fromEntries(ids.map((id) => [id, records[id]!])),
  };
}

/** 存活副本以更新的 revision 盖过删除记录（撤销或重新加回）。 */
function supersedes(value: Translation, record: TranslationDeletion): boolean {
  return value.revision !== undefined && compareRevision(value.revision, record.revision) > 0;
}

/** 校验删除记录；与存活版本同 ID 的记录说明写入路径漏了裁决，拒绝加载。 */
export function normalizeTranslationDeletions(paragraph: Paragraph): Paragraph {
  const value: unknown = paragraph.deletedTranslations;
  if (value === undefined) return paragraph;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('INVALID_TRANSLATION_DELETION');
  const records: Deletions = {};
  for (const [id, record] of Object.entries(value as Deletions)) {
    if (
      !id ||
      !record ||
      !Number.isFinite(record.deletedAt) ||
      record.deletedAt < 0 ||
      !validRevision(record.revision)
    )
      throw new Error('INVALID_TRANSLATION_DELETION');
    if (paragraph.translations.some((entry) => entry.id === id))
      throw new Error('TRANSLATION_DELETION_CONFLICT');
    records[id] = { revision: { ...record.revision }, deletedAt: record.deletedAt };
  }
  return withDeletions(paragraph, records);
}

/** 同 ID 两条记录取 revision 较新者；revision 相同是同一次删除，取较晚的时间保证对称。 */
export function mergeTranslationDeletions(a: Deletions = {}, b: Deletions = {}): Deletions {
  const result: Deletions = { ...a };
  for (const [id, record] of Object.entries(b)) {
    const existing = result[id];
    const order = existing ? compareRevision(record.revision, existing.revision) : 1;
    if (order > 0) result[id] = record;
    else if (order === 0 && record.deletedAt > existing!.deletedAt) result[id] = record;
  }
  return result;
}

function pruneDeletions(records: Deletions, paragraph: Paragraph): Deletions {
  const activity = Math.max(
    0,
    ...Object.values(records).map((record) => record.deletedAt),
    ...Object.values(paragraph.selectedTranslations ?? {}).map((slot) => slot.updatedAt),
  );
  return Object.fromEntries(
    Object.entries(records).filter(([, record]) => record.deletedAt >= activity - RETENTION_MS),
  );
}

/**
 * 让版本列表与删除记录一致：记录压过 revision 不新于它的同 ID 副本；副本 revision 更新，
 * 或仍被某语言选用（删除之后另一设备选用了它）时保留副本并撤销记录，不留下悬空选用。
 * 结果只取决于输入数据，两个方向合并得到相同结果。
 */
export function settleTranslationDeletions(paragraph: Paragraph): Paragraph {
  const records: Deletions = { ...paragraph.deletedTranslations };
  const selected = new Set(
    Object.values(paragraph.selectedTranslations ?? {}).map((slot) => slot.value),
  );
  const translations = paragraph.translations.filter((value) => {
    const record = records[value.id];
    if (!record) return true;
    const keep = selected.has(value.id) || supersedes(value, record);
    if (keep) delete records[value.id];
    return keep;
  });
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
  const records: Deletions = { ...after.deletedTranslations };
  for (const value of before.translations)
    if (!remaining.has(value.id)) records[value.id] ??= { revision: { ...revision }, deletedAt };
  const translations = after.translations.map((value) => {
    const record = records[value.id];
    if (!record || supersedes(value, record)) return value;
    assertNewRevision(revision, record.revision);
    return { ...value, revision: { ...revision } };
  });
  return settleTranslationDeletions({ ...after, translations, deletedTranslations: records });
}

/**
 * 明确覆盖（强制推送、快照恢复）：另一侧独有的版本按覆盖意图写入删除记录；保留的版本若在
 * 另一侧已被删除，以本次 revision 盖戳压过该记录。
 */
export function replaceTranslationDeletions(
  paragraph: Paragraph,
  prior: Paragraph | undefined,
  revision: SyncRevision,
  deletedAt: number,
): Paragraph {
  const others = prior?.deletedTranslations ?? {};
  const translations = paragraph.translations.map((value) => {
    const record = others[value.id];
    if (!record || supersedes(value, record)) return value;
    assertNewRevision(revision, record.revision);
    return { ...value, revision: { ...revision } };
  });
  const kept = new Set(translations.map((value) => value.id));
  const records: Deletions = { ...paragraph.deletedTranslations };
  for (const value of prior?.translations ?? []) {
    const existing = records[value.id];
    if (kept.has(value.id) || (existing && !supersedes(value, existing))) continue;
    records[value.id] = { revision: { ...revision }, deletedAt };
  }
  return withDeletions({ ...paragraph, translations }, records);
}
