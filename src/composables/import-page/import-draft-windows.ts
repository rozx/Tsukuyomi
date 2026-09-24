/**
 * 草稿卷章的分批渲染。上千章的草稿一次渲染全部行会让手机卡顿数秒，
 * 因此每卷默认只显示一页，默认总行数超过预算后，其余卷折叠；
 * 用户的展开、折叠与「显示更多」按卷记录，不影响其他卷的默认状态。
 */

export const DRAFT_PAGE = 50;
export const DRAFT_BUDGET = 100;

/** 各卷当前显示的章节数（0 表示折叠）。 */
export function draftChapterWindows(
  volumes: readonly { id: string; count: number }[],
  chosen: Readonly<Record<string, number>>,
  { page = DRAFT_PAGE, budget = DRAFT_BUDGET } = {},
): Record<string, number> {
  // 默认状态只由卷章数决定，用户对某卷的选择不会让其他卷跟着展开或折叠
  let used = 0;
  const shown: Record<string, number> = {};
  for (const { id, count } of volumes) {
    const fallback = used < budget ? Math.min(page, count) : 0;
    used += fallback;
    const choice = chosen[id];
    shown[id] = choice === undefined ? fallback : Math.min(choice, count);
  }
  return shown;
}

export function moreDraftChapters(shown: number, count: number, page = DRAFT_PAGE): number {
  return Math.min(count, shown + page);
}

export function toggleDraftVolume(shown: number, count: number, page = DRAFT_PAGE): number {
  return shown > 0 ? 0 : Math.min(page, count);
}
