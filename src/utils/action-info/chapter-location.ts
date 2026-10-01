import { ChapterService } from 'src/services/chapter-service';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';
import type { AppLocale } from 'src/models/locale';
import type { ActionDetail, ActionDetailsContext } from './types';
import { detailText } from './types';

/**
 * 根据 chapterId 解析章节标题并追加到 details。
 * 若能在当前书籍（或指定 bookIdOverride）中找到章节，输出「章节: <标题>」；
 * 否则输出「章节 ID: <id>」。
 * 标题按操作记录的执行语言读取，旧记录缺省时回退书籍目标语言。
 */
export function appendChapterDetailByChapterId(
  details: ActionDetail[],
  chapterId: string,
  context: ActionDetailsContext,
  locale: AppLocale,
  options: { bookIdOverride?: string | undefined; language?: AppLocale | undefined } = {},
): void {
  const idDetail = { label: detailText(locale, 'chapterId'), value: chapterId };
  const bookId = options.bookIdOverride ?? context.getCurrentBookId();
  const book = bookId ? context.getBookById(bookId) : undefined;
  const chapterResult = book ? ChapterService.findChapterById(book, chapterId) : null;
  if (chapterResult?.chapter) {
    details.push({
      label: detailText(locale, 'chapter'),
      value: getChapterDisplayTitle(chapterResult.chapter, book, options.language),
    });
  } else {
    details.push(idDetail);
  }
}
