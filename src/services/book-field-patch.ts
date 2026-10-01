import type { Novel } from 'src/models/novel';
import { canonicalStringify } from 'src/utils/canonical-json';

/**
 * 不走字段增量的键：身份、卷章结构与实体状态由各自的专用流程（卷章保存、实体编辑、整本快照）负责合并。
 */
const NON_PATCH_KEYS: ReadonlySet<string> = new Set([
  'id',
  'createdAt',
  'volumes',
  'terminologies',
  'characterSettings',
  'entityTombstones',
  'entitySyncVersion',
]);

/** 书籍元数据字段补丁；值为 null / undefined 表示删除该字段，lastEdited 只在有实际修改时生效 */
export type BookFieldPatch = Omit<
  Partial<Novel>,
  | 'id'
  | 'createdAt'
  | 'volumes'
  | 'terminologies'
  | 'characterSettings'
  | 'entityTombstones'
  | 'entitySyncVersion'
>;

/** 与快照值相同即视为未改动；同一对象引用可能已被调用方原地修改，无法判断，按已改动处理 */
function unchangedFromBase(value: unknown, base: unknown): boolean {
  if (value === base && typeof value === 'object' && value !== null) return false;
  return canonicalStringify(value ?? null) === canonicalStringify(base ?? null);
}

/**
 * 只保留调用方相对自己持有的快照真正改动的字段：表单整体提交时未改动的字段
 * 不能把其他标签页或后台任务刚写入的值改回旧快照。
 */
export function buildBookFieldPatch(base: Novel, updates: Partial<Novel>): BookFieldPatch {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (NON_PATCH_KEYS.has(key)) continue;
    if (key !== 'lastEdited' && unchangedFromBase(value, base[key as keyof Novel])) continue;
    patch[key] = value;
  }
  return patch as BookFieldPatch;
}

/** 把补丁字段应用到记录副本上：null / undefined 删除字段，其余直接覆盖 */
export function applyBookFieldPatch<T extends object>(record: T, patch: BookFieldPatch): T {
  const next = { ...record } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) delete next[key];
    else next[key] = value;
  }
  return next as T;
}
