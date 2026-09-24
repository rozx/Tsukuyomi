import type { BookSyncChangeset, SyncNewChapter, SyncVolumeTarget } from 'src/models/book-sync';

/** 已比对章节中有更新的占比超过该值时，提示可能是站点改版或配方过期 */
const DRIFT_MIN_CHECKED = 5;
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

/**
 * 已比对的已导入章节中，有更新的占比超过一半。样本太少时不提示：
 * 快速检查只抓更新日期变新的章节，它们本来就多半有修订，比例没有意义。
 */
export function driftWarning(changeset: BookSyncChangeset): boolean {
  const checked = changeset.checked.length;
  return checked >= DRIFT_MIN_CHECKED && changeset.updated.length / checked > DRIFT_RATIO;
}

/** 新章节按推断（或改选后）的目标卷分组 */
export interface NewChapterGroup {
  key: string;
  target: SyncVolumeTarget;
  overridden: boolean;
  chapters: SyncNewChapter[];
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

export interface SyncVerdict {
  tone: 'latest' | 'changes' | 'pending' | 'failed';
  title: string;
  /** 只含非零项的说明短语 */
  details: string[];
  /** 已有书籍仍有未比对正文的章节时，说明为什么可以逐章比对 */
  deepHint?: string;
}

/** 检查结论：先回答「有没有更新」，再用一行说明各类数量。 */
export function syncVerdict(changeset: BookSyncChangeset, creating: boolean): SyncVerdict {
  const skipped = changeset.skipped.length;
  const skippedText = skipped ? [`跳过 ${skipped} 章`] : [];
  if (creating)
    return {
      tone: changeset.new.length ? 'changes' : 'failed',
      title: changeset.new.length ? `可导入 ${changeset.new.length} 章` : '目录里没有可导入的章节',
      details: [`目录共 ${changeset.new.length + skipped} 章`, ...skippedText],
    };
  const dated = new Set(changeset.dateUnchanged);
  const pending = changeset.unchecked.filter((url) => !dated.has(url)).length;
  const unchanged = changeset.checked.length - changeset.updated.length;
  const details = [
    `已导入 ${changeset.unchecked.length + changeset.checked.length} 章`,
    ...(dated.size ? [`${dated.size} 章按更新日期无变化`] : []),
    ...(unchanged > 0 ? [`${unchanged} 章已比对无变化`] : []),
    ...(pending ? [`${pending} 章未比对正文`] : []),
    ...skippedText,
  ];
  const changes = [
    ...(changeset.new.length ? [`${changeset.new.length} 章新章节`] : []),
    ...(changeset.updated.length ? [`${changeset.updated.length} 章原文有修订`] : []),
  ];
  const deepHint = !changeset.unchecked.length
    ? undefined
    : pending
      ? `${pending} 章没有可用的更新日期，需要逐章比对正文才能确认是否有修订。`
      : '更新日期不一定可靠。想确认正文是否被悄悄改过，可以逐章比对。';
  const verdict = (tone: SyncVerdict['tone'], title: string): SyncVerdict => ({
    tone,
    title,
    details,
    ...(deepHint ? { deepHint } : {}),
  });
  if (changes.length) return verdict('changes', changes.join(' · '));
  if (changeset.failed.length) return verdict('failed', '部分章节检查失败');
  return pending ? verdict('pending', '没有新章节') : verdict('latest', '已是最新');
}

/** 应用栏的一句话说明：本次会写入什么。 */
export function applyDescription(summary: { newCount: number; updatedCount: number }): string {
  const parts = [
    ...(summary.newCount ? [`写入 ${summary.newCount} 章新章节`] : []),
    ...(summary.updatedCount ? [`更新 ${summary.updatedCount} 章`] : []),
  ];
  return parts.length ? `将${parts.join('，')}` : '还没有勾选章节';
}
