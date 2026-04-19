import { ChapterService } from 'src/services/chapter-service';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';
import type { ActionDetail, ActionDetailsContext } from './types';

/**
 * 根据 chapterId 解析章节标题并追加到 details。
 * 若能在当前书籍（或指定 bookIdOverride）中找到章节，输出「章节: <标题>」；
 * 否则输出「章节 ID: <id>」。
 */
export function appendChapterDetailByChapterId(
  details: ActionDetail[],
  chapterId: string,
  context: ActionDetailsContext,
  bookIdOverride?: string,
): void {
  const bookId = bookIdOverride ?? context.getCurrentBookId();
  if (!bookId) {
    details.push({ label: '章节 ID', value: chapterId });
    return;
  }

  const book = context.getBookById(bookId);
  if (!book) {
    details.push({ label: '章节 ID', value: chapterId });
    return;
  }

  const chapterResult = ChapterService.findChapterById(book, chapterId);
  if (chapterResult?.chapter) {
    details.push({ label: '章节', value: getChapterDisplayTitle(chapterResult.chapter) });
  } else {
    details.push({ label: '章节 ID', value: chapterId });
  }
}
