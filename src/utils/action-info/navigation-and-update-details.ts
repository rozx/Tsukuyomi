import type { MessageAction } from 'src/stores/chat-sessions';
import type { AppLocale } from 'src/models/locale';
import type { ActionDetail, ActionDetailsContext } from './types';
import { detailText } from './types';
import { appendChapterDetailByChapterId } from './chapter-location';

/**
 * 章节更新类操作详情（update_chapter_title）。
 */
export function appendChapterUpdateDetails(
  details: ActionDetail[],
  action: MessageAction,
  context: ActionDetailsContext,
  locale: AppLocale = 'zh-CN',
): void {
  if (action.tool_name !== 'update_chapter_title') return;

  if (action.old_title) {
    details.push({ label: detailText(locale, 'oldTitle'), value: action.old_title });
  }
  if (action.new_title) {
    details.push({ label: detailText(locale, 'newTitle'), value: action.new_title });
  }
  if (action.chapter_id) {
    appendChapterDetailByChapterId(details, action.chapter_id, context, locale);
  }
}

function appendHelpDocNavigateDetails(
  details: ActionDetail[],
  action: MessageAction,
  locale: AppLocale,
): void {
  if (action.doc_id) {
    details.push({ label: detailText(locale, 'docId'), value: action.doc_id });
  }
  if (action.title) {
    details.push({ label: detailText(locale, 'docTitle'), value: action.title });
  }
  if (action.section_id) {
    details.push({ label: detailText(locale, 'sectionAnchor'), value: action.section_id });
  }
}

/**
 * 导航类操作详情（navigate_to_book / chapter / paragraph / help_doc 等）。
 */
export function appendNavigateDetails(
  details: ActionDetail[],
  action: MessageAction,
  context: ActionDetailsContext,
  locale: AppLocale = 'zh-CN',
): void {
  if (action.book_id) {
    const book = context.getBookById(action.book_id);
    if (book) {
      details.push({ label: detailText(locale, 'book'), value: book.title });
    } else {
      details.push({ label: detailText(locale, 'bookId'), value: action.book_id });
    }
  }

  if (action.chapter_id) {
    const bookIdOverride = action.book_id ?? undefined;
    appendChapterDetailByChapterId(details, action.chapter_id, context, locale, bookIdOverride);
  }

  if (action.chapter_title) {
    details.push({ label: detailText(locale, 'chapterTitle'), value: action.chapter_title });
  }

  if (action.paragraph_id) {
    details.push({ label: detailText(locale, 'paragraphId'), value: action.paragraph_id });
  }

  if (action.entity === 'help_doc') {
    appendHelpDocNavigateDetails(details, action, locale);
  }
}
