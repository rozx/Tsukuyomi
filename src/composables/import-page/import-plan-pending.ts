import type { ImportPlan } from 'src/models/import';
import type { ImportReplacementRange } from 'src/models/import-matching';

/**
 * 方案中需要用户处理的项目：普通冲突 + 按章节合并的多段替换。
 * 状态标签与待处理列表共用，保证两处数字一致。
 */

/** 由多段替换产生的冲突：已经以替换范围的形式出现，不再单独计数或列出 */
const REPLACEMENT_CONFLICT_CODES = new Set([
  'REPLACEMENT_REQUIRED',
  'AMBIGUOUS_PARAGRAPH',
  'MATCHING_LIMIT',
]);

/** 同一章（按被替换段落所在的书内章节）的全部未确认替换 */
export interface ReplacementGroup {
  chapterId: string;
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
    const chapterId = entry.oldKeys?.[0]?.chapterId ?? '';
    let group = groups.get(chapterId);
    if (!group) {
      group = {
        chapterId,
        signatures: [],
        entries: [],
        ranges: 0,
        removed: 0,
        added: 0,
        versions: 0,
      };
      groups.set(chapterId, group);
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
