import type { MessageAction } from 'src/stores/chat-sessions';
import type { AppLocale } from 'src/models/locale';
import type { ActionDetail, ActionDetailsContext } from './types';
import { appendDetail, detailText } from './types';
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

  appendDetail(details, locale, 'oldTitle', action.old_title);
  appendDetail(details, locale, 'newTitle', action.new_title);
  if (action.chapter_id) {
    appendChapterDetailByChapterId(details, action.chapter_id, context, locale, {
      language: action.language,
    });
  }
}

function appendHelpDocNavigateDetails(
  details: ActionDetail[],
  action: MessageAction,
  locale: AppLocale,
): void {
  appendDetail(details, locale, 'docId', action.doc_id);
  appendDetail(details, locale, 'docTitle', action.title);
  appendDetail(details, locale, 'sectionAnchor', action.section_id);
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
    appendChapterDetailByChapterId(details, action.chapter_id, context, locale, {
      bookIdOverride,
      language: action.language,
    });
  }

  appendDetail(details, locale, 'chapterTitle', action.chapter_title);
  appendDetail(details, locale, 'paragraphId', action.paragraph_id);

  if (action.entity === 'help_doc') {
    appendHelpDocNavigateDetails(details, action, locale);
  }
}
