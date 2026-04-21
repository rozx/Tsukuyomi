import type { MessageAction } from 'src/stores/chat-sessions';
import type { ActionDetail, ActionDetailsContext } from './types';
import { appendChapterDetailByChapterId } from './chapter-location';

/**
 * 章节更新类操作详情（update_chapter_title）。
 */
export function appendChapterUpdateDetails(
  details: ActionDetail[],
  action: MessageAction,
  context: ActionDetailsContext,
): void {
  if (action.tool_name !== 'update_chapter_title') return;

  if (action.old_title) {
    details.push({ label: '旧标题', value: action.old_title });
  }
  if (action.new_title) {
    details.push({ label: '新标题', value: action.new_title });
  }
  if (action.chapter_id) {
    appendChapterDetailByChapterId(details, action.chapter_id, context);
  }
}

/**
 * 导航类操作详情（navigate_to_book / chapter / paragraph / help_doc 等）。
 */
export function appendNavigateDetails(
  details: ActionDetail[],
  action: MessageAction,
  context: ActionDetailsContext,
): void {
  if (action.book_id) {
    const book = context.getBookById(action.book_id);
    if (book) {
      details.push({ label: '书籍', value: book.title });
    } else {
      details.push({ label: '书籍 ID', value: action.book_id });
    }
  }

  if (action.chapter_id) {
    const bookIdOverride = action.book_id ?? undefined;
    appendChapterDetailByChapterId(details, action.chapter_id, context, bookIdOverride);
  }

  if (action.chapter_title) {
    details.push({ label: '章节标题', value: action.chapter_title });
  }

  if (action.paragraph_id) {
    details.push({ label: '段落 ID', value: action.paragraph_id });
  }

  if (action.entity === 'help_doc') {
    if (action.doc_id) {
      details.push({ label: '文档 ID', value: action.doc_id });
    }
    if (action.title) {
      details.push({ label: '文档标题', value: action.title });
    }
    if (action.section_id) {
      details.push({ label: '章节锚点', value: action.section_id });
    }
  }
}
