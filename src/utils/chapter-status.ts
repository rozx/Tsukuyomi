/**
 * 章节翻译状态公用逻辑。
 *
 * `useBookDetailsPage` 与 `BooksPageTablet` 都需要根据「已翻译段数 / 总段数」的 byChapter
 * 快照，把章节渲染成 icon + 颜色 + 百分比标签。为了避免状态函数在两处重复实现或漂移，
 * 这里把纯逻辑抽成独立函数；计算 byChapter 的过程仍然留在各自调用方（因为 loading
 * 的时机、缓存策略不同）。
 */

export type ChapterStatus = 'done' | 'inProgress' | 'pending';

export type ChapterProgress = { total: number; translated: number };
export type ChapterProgressMap = Map<string, ChapterProgress>;

export function getChapterStatus(
  byChapter: ChapterProgressMap | null | undefined,
  chapterId: string,
): ChapterStatus {
  if (!byChapter) return 'pending';
  const s = byChapter.get(chapterId);
  if (!s || s.total === 0) return 'pending';
  if (s.translated >= s.total) return 'done';
  if (s.translated > 0) return 'inProgress';
  return 'pending';
}

export function chapterStatusIcon(status: ChapterStatus): string {
  switch (status) {
    case 'done':
      return 'pi-check-circle';
    case 'inProgress':
      return 'pi-pencil';
    default:
      return 'pi-circle-off';
  }
}

export function chapterStatusColor(status: ChapterStatus): string {
  switch (status) {
    case 'done':
      return '#A7D1B0';
    case 'inProgress':
      return '#BAC9DB';
    default:
      return 'rgba(174,183,198,0.55)';
  }
}

export function chapterStatusTextColor(status: ChapterStatus): string {
  switch (status) {
    case 'inProgress':
      return '#A3B7CF';
    default:
      return 'rgba(247,244,236,0.55)';
  }
}

export function chapterStatusLabel(
  byChapter: ChapterProgressMap | null | undefined,
  chapterId: string,
): string {
  const s = byChapter?.get(chapterId);
  if (!s || s.total === 0) return '—';
  const pct = Math.round((s.translated / s.total) * 100);
  return `${pct}%`;
}
