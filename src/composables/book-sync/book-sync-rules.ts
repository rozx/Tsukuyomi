import type { BookSyncChangeset, SyncNewChapter, SyncVolumeTarget } from 'src/models/book-sync';
import type { AppLocale } from 'src/models/locale';
import { translateText } from 'src/i18n/translate';

/** 结论里按数量变化的短语 */
type VerdictKey =
  | 'skipped'
  | 'importable'
  | 'catalogTotal'
  | 'imported'
  | 'dateUnchanged'
  | 'checkedUnchanged'
  | 'dateNewerMaybe'
  | 'notCompared'
  | 'newChapters'
  | 'revised'
  | 'hintDateNewer'
  | 'hintNoDate';

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

/** 检查结论：先回答「有没有更新」，再用一行说明各类数量。文字按界面语言生成。 */
export function syncVerdict(
  changeset: BookSyncChangeset,
  creating: boolean,
  locale: AppLocale = 'zh-CN',
): SyncVerdict {
  const t = (key: VerdictKey, count: number) =>
    translateText(locale, `bookUi.verdict.${key}`, { count });
  const skipped = changeset.skipped.length;
  const skippedText = skipped ? [t('skipped', skipped)] : [];
  if (creating)
    return {
      tone: changeset.new.length ? 'changes' : 'failed',
      title: changeset.new.length
        ? t('importable', changeset.new.length)
        : translateText(locale, 'bookUi.verdict.noneImportable'),
      details: [t('catalogTotal', changeset.new.length + skipped), ...skippedText],
    };
  const dated = new Set(changeset.dateUnchanged);
  const newer = new Set(changeset.dateNewer);
  const datedNewer = changeset.unchecked.filter((url) => newer.has(url)).length;
  const pending = changeset.unchecked.filter((url) => !dated.has(url) && !newer.has(url)).length;
  const unchanged = changeset.checked.length - changeset.updated.length;
  const details = [
    t('imported', changeset.unchecked.length + changeset.checked.length),
    ...(dated.size ? [t('dateUnchanged', dated.size)] : []),
    ...(unchanged > 0 ? [t('checkedUnchanged', unchanged)] : []),
    ...(datedNewer ? [t('dateNewerMaybe', datedNewer)] : []),
    ...(pending ? [t('notCompared', pending)] : []),
    ...skippedText,
  ];
  const changes = [
    ...(changeset.new.length ? [t('newChapters', changeset.new.length)] : []),
    ...(changeset.updated.length ? [t('revised', changeset.updated.length)] : []),
  ];
  const deepHint = !changeset.unchecked.length
    ? undefined
    : datedNewer || pending
      ? translateText(locale, 'bookUi.verdict.hintNeedsCompare', {
          reasons: [
            ...(datedNewer ? [t('hintDateNewer', datedNewer)] : []),
            ...(pending ? [t('hintNoDate', pending)] : []),
          ].join(translateText(locale, 'bookUi.verdict.hintJoin')),
        })
      : translateText(locale, 'bookUi.verdict.hintUnreliable');
  const verdict = (tone: SyncVerdict['tone'], title: string): SyncVerdict => ({
    tone,
    title,
    details,
    ...(deepHint ? { deepHint } : {}),
  });
  if (changes.length) return verdict('changes', changes.join(' · '));
  if (changeset.failed.length)
    return verdict('failed', translateText(locale, 'bookUi.verdict.someFailed'));
  return pending || datedNewer
    ? verdict('pending', translateText(locale, 'bookUi.verdict.noNew'))
    : verdict('latest', translateText(locale, 'bookUi.verdict.latest'));
}

/** 应用栏的一句话说明：本次会写入什么。 */
export function applyDescription(
  summary: { newCount: number; updatedCount: number },
  locale: AppLocale = 'zh-CN',
): string {
  const parts = [
    ...(summary.newCount
      ? [translateText(locale, 'bookUi.verdict.applyNew', { count: summary.newCount })]
      : []),
    ...(summary.updatedCount
      ? [translateText(locale, 'bookUi.verdict.applyUpdated', { count: summary.updatedCount })]
      : []),
  ];
  return parts.length
    ? translateText(locale, 'bookUi.verdict.applyDescription', {
        parts: parts.join(translateText(locale, 'bookUi.verdict.applyJoin')),
      })
    : translateText(locale, 'bookUi.verdict.applyNothing');
}
