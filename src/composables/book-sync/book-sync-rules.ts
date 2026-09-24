import type { BookSyncChangeset, SyncNewChapter, SyncVolumeTarget } from 'src/models/book-sync';

/** 已比对章节中有更新的占比超过该值时，提示可能是站点改版或配方过期 */
const DRIFT_RATIO = 0.5;

export interface BookSyncConfirmSummary {
  newCount: number;
  updatedCount: number;
  clearedVersions: number;
  newVolumes: string[];
}

/**
 * 变更集刷新后重新计算勾选：
 * - 首次出现的新章节默认勾选；已出现过的新章节保留用户的选择
 * - 有更新章节从不自动勾选，只保留用户手动勾选的
 * - 已不在新章节或有更新中的条目（含已跳过）一律移除
 */
export function reconcileSelection(
  changeset: BookSyncChangeset,
  selected: ReadonlySet<string>,
  seenNew: ReadonlySet<string>,
): { selected: Set<string>; seenNew: Set<string> } {
  const next = new Set<string>();
  const seen = new Set(seenNew);
  for (const chapter of changeset.new) {
    if (!seen.has(chapter.url) || selected.has(chapter.url)) next.add(chapter.url);
    seen.add(chapter.url);
  }
  for (const chapter of changeset.updated) {
    if (selected.has(chapter.url)) next.add(chapter.url);
  }
  return { selected: next, seenNew: seen };
}

/** 已比对的已导入章节中，有更新的占比超过一半 */
export function driftWarning(changeset: BookSyncChangeset): boolean {
  const checked = changeset.checked.length;
  return checked > 0 && changeset.updated.length / checked > DRIFT_RATIO;
}

export function effectiveTarget(
  chapter: SyncNewChapter,
  overrides: ReadonlyMap<string, SyncVolumeTarget>,
): SyncVolumeTarget {
  return overrides.get(chapter.groupKey) ?? chapter.target;
}

/** 确认摘要：全部由变更集与勾选计算，不做估算 */
export function buildConfirmSummary(
  changeset: BookSyncChangeset,
  selected: ReadonlySet<string>,
  overrides: ReadonlyMap<string, SyncVolumeTarget>,
): BookSyncConfirmSummary {
  const added = changeset.new.filter((chapter) => selected.has(chapter.url));
  const updated = changeset.updated.filter((chapter) => selected.has(chapter.url));
  const newVolumes = new Set<string>();
  for (const chapter of added) {
    const target = effectiveTarget(chapter, overrides);
    if ('newTitle' in target) newVolumes.add(target.newTitle);
  }
  return {
    newCount: added.length,
    updatedCount: updated.length,
    clearedVersions: updated.reduce((sum, chapter) => sum + chapter.clearedVersions, 0),
    newVolumes: [...newVolumes],
  };
}
