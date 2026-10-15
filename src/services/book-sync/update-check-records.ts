import type { BookSyncChangeset } from 'src/models/book-sync';
import type { Chapter, Novel } from 'src/models/novel';

/**
 * 书架「检查更新」结果的本机记录（localStorage，不参与云同步），刷新页面后角标仍可显示。
 *
 * 不保存计数，而是保存检查时发现的新章节网址与待比对章节当时的本地日期，
 * 显示时按当前书籍重新计算：已导入 / 已跳过的新章节、本地日期已变化（已比对或已应用）
 * 或已删除的待比对章节都不再计数，应用更新后角标自然消失。
 */

const STORAGE_KEY = 'tsukuyomi-book-update-checks';

export interface UpdateCheckRecord {
  checkedAt: number;
  newUrls: string[];
  /** 待比对章节及其检查时的本地日期（lastUpdated，缺失时为 createdAt）毫秒值 */
  changed: { url: string; stamp: number }[];
}

export type UpdateCheckRecords = Record<string, UpdateCheckRecord>;

function chapters(book: Novel): Chapter[] {
  return (book.volumes ?? []).flatMap((volume) => volume.chapters ?? []);
}

/** 与 ChapterService.shouldUpdateChapter 一致：lastUpdated 为假值（含空字符串）时回退 createdAt */
function localStamp(chapter: Chapter): number {
  return new Date(chapter.lastUpdated || chapter.createdAt).getTime();
}

export function buildUpdateCheckRecord(
  book: Novel,
  result: BookSyncChangeset,
  checkedAt: number,
): UpdateCheckRecord {
  const byUrl = new Map(chapters(book).map((chapter) => [chapter.webUrl, chapter]));
  return {
    checkedAt,
    newUrls: result.new.map((chapter) => chapter.url),
    changed: result.dateNewer.flatMap((url) => {
      const chapter = byUrl.get(url);
      const stamp = chapter ? localStamp(chapter) : NaN;
      return Number.isFinite(stamp) ? [{ url, stamp }] : [];
    }),
  };
}

export function pendingUpdateCounts(
  book: Novel,
  record: UpdateCheckRecord,
): { newCount: number; changedCount: number } {
  const byUrl = new Map(chapters(book).map((chapter) => [chapter.webUrl, chapter]));
  const skipped = new Set(book.updateRecipe?.skippedUrls?.map((entry) => entry.url));
  const newCount = record.newUrls.filter((url) => !byUrl.has(url) && !skipped.has(url)).length;
  const changedCount = record.changed.filter((entry) => {
    const chapter = byUrl.get(entry.url);
    return !!chapter && localStamp(chapter) === entry.stamp;
  }).length;
  return { newCount, changedCount };
}

function isRecord(value: unknown): value is UpdateCheckRecord {
  if (!value || typeof value !== 'object') return false;
  const { checkedAt, newUrls, changed } = value as Partial<UpdateCheckRecord>;
  return (
    typeof checkedAt === 'number' &&
    Array.isArray(newUrls) &&
    newUrls.every((url) => typeof url === 'string') &&
    Array.isArray(changed) &&
    changed.every(
      (entry) => !!entry && typeof entry.url === 'string' && typeof entry.stamp === 'number',
    )
  );
}

export function loadUpdateCheckRecords(): UpdateCheckRecords {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(([, value]) => isRecord(value)),
    ) as UpdateCheckRecords;
  } catch {
    return {};
  }
}

export function saveUpdateCheckRecords(records: UpdateCheckRecords): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (error) {
    console.error('保存书架检查更新结果失败:', error);
  }
}
