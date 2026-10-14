import type { ImportPlan } from 'src/models/import';
import type { ImportReplacementRange } from 'src/models/import-matching';

/**
 * 方案中需要用户处理的项目：普通冲突 + 按受影响章节合并的多段替换。
 * 状态标签与待处理列表共用，保证两处数字一致。
 */

/** 由多段替换产生的冲突：已经以替换范围的形式出现，不再单独计数或列出 */
const REPLACEMENT_CONFLICT_CODES = new Set([
  'REPLACEMENT_REQUIRED',
  'AMBIGUOUS_PARAGRAPH',
  'MATCHING_LIMIT',
]);

/**
 * 受影响章节完全相同的全部未确认替换（按被替换段落所在的书内章节）。
 * 跨章替换（如合章后）单独成组并列出全部章节，确认时不会顺带确认只涉及其中一章的替换。
 */
export interface ReplacementGroup {
  /** 分组键：受影响章节 id 按出现顺序编码（JSON，章节 id 含逗号也不会碰撞） */
  key: string;
  /** 受影响章节，按出现顺序去重；旧方案缺少 oldKeys 时为空 */
  chapterIds: string[];
  signatures: string[];
  entries: ImportReplacementRange[];
  /** 替换处数 */
  ranges: number;
  /** 合计旧原文段数、新原文段数、会清空的译文版本数 */
  removed: number;
  added: number;
  versions: number;
}

export interface PlanPendingItems {
  conflicts: ImportPlan['conflicts'];
  replacementGroups: ReplacementGroup[];
  pending: number;
}

export function planPendingItems(plan: ImportPlan): PlanPendingItems {
  const conflicts = plan.conflicts.filter(
    (conflict) => !REPLACEMENT_CONFLICT_CODES.has(conflict.code),
  );
  const groups = new Map<string, ReplacementGroup>();
  for (const entry of plan.replacements ?? []) {
    if (entry.confirmed) continue;
    const chapterIds = [...new Set((entry.oldKeys ?? []).map((key) => key.chapterId))];
    const key = JSON.stringify(chapterIds);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        chapterIds,
        signatures: [],
        entries: [],
        ranges: 0,
        removed: 0,
        added: 0,
        versions: 0,
      };
      groups.set(key, group);
    }
    group.signatures.push(entry.signature);
    group.entries.push(entry);
    group.ranges++;
    group.removed += entry.oldKeys?.length ?? 0;
    group.added += entry.newKeys?.length ?? 0;
    group.versions += entry.clearedVersions ?? 0;
  }
  const replacementGroups = [...groups.values()];
  return { conflicts, replacementGroups, pending: conflicts.length + replacementGroups.length };
}
