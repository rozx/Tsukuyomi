import { ChapterService } from 'src/services/chapter-service';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';
import type { MessageAction } from 'src/stores/chat-sessions';
import type { ActionDetail, ActionDetailsContext } from './types';
import { preview } from './types';
import { appendChapterDetailByChapterId } from './chapter-location';

function appendBookInfo(
  details: ActionDetail[],
  bookId: string,
  context: ActionDetailsContext,
): void {
  const book = context.getBookById(bookId);
  if (!book) return;
  details.push({ label: '书籍', value: book.title });
  if (book.author) {
    details.push({ label: '作者', value: book.author });
  }
  if (book.description) {
    details.push({ label: '简介', value: preview(book.description, 100) });
  }
}

function appendParagraphPreviewByPath(
  details: ActionDetail[],
  action: MessageAction,
  context: ActionDetailsContext,
): void {
  const isParagraphQuery =
    action.tool_name === 'get_paragraph_info' ||
    action.tool_name === 'get_previous_paragraphs' ||
    action.tool_name === 'get_next_paragraphs';
  if (!isParagraphQuery || !action.paragraph_id) return;

  const currentBookId = context.getCurrentBookId();
  if (!currentBookId) return;
  const book = context.getBookById(currentBookId);
  if (!book) return;

  const location = ChapterService.findParagraphLocation(book, action.paragraph_id);
  if (!location) return;

  const { paragraph, chapter } = location;
  if (!details.some((d) => d.label === '章节')) {
    details.push({ label: '章节', value: getChapterDisplayTitle(chapter) });
  }
  if (paragraph.text) {
    details.push({ label: '原文预览', value: preview(paragraph.text, 50) });
  }
}

/**
 * 处理 action.type === 'read' 下所有工具的详情。
 */
export function appendReadDetails(
  details: ActionDetail[],
  action: MessageAction,
  context: ActionDetailsContext,
): void {
  if (action.tool_name) {
    details.push({ label: '工具', value: action.tool_name });
  }

  // 按 tool_name 分支
  switch (action.tool_name) {
    case 'get_help_doc':
      if (action.title) details.push({ label: '文档标题', value: action.title });
      break;
    case 'list_help_docs':
      details.push({ label: '文档列表', value: '已获取' });
      break;
    case 'get_book_info':
      if (action.book_id) appendBookInfo(details, action.book_id, context);
      break;
    case 'get_memory':
      if (action.memory_id) {
        details.push({ label: 'Memory ID', value: action.memory_id });
      }
      break;
    case 'search_characters_by_keywords':
    case 'search_terms_by_keywords':
      if (action.keywords && action.keywords.length > 0) {
        details.push({ label: '搜索关键词', value: action.keywords.join('、') });
      }
      break;
    case 'find_paragraph_by_keywords':
      if (action.keywords && action.keywords.length > 0) {
        details.push({ label: '原文关键词', value: action.keywords.join('、') });
      }
      if (action.translation_keywords && action.translation_keywords.length > 0) {
        details.push({ label: '翻译关键词', value: action.translation_keywords.join('、') });
      }
      if (action.chapter_id) {
        appendChapterDetailByChapterId(details, action.chapter_id, context);
      }
      break;
    case 'search_paragraphs_by_regex':
      if (action.regex_pattern) {
        details.push({ label: '正则表达式', value: action.regex_pattern });
      }
      if (action.chapter_id) {
        appendChapterDetailByChapterId(details, action.chapter_id, context);
      }
      break;
    case 'get_occurrences_by_keywords':
      if (action.keywords && action.keywords.length > 0) {
        details.push({ label: '关键词', value: action.keywords.join('、') });
      }
      break;
    default:
      // 其他工具的通用字段
      if (action.keywords && action.keywords.length > 0) {
        details.push({ label: '关键词', value: action.keywords.join('、') });
      }
      if (action.regex_pattern) {
        details.push({ label: '正则表达式', value: action.regex_pattern });
      }
      if (action.chapter_id) {
        appendChapterDetailByChapterId(details, action.chapter_id, context);
      }
      break;
  }

  if (action.chapter_title) {
    details.push({ label: '章节标题', value: action.chapter_title });
  }

  if (action.paragraph_id) {
    details.push({ label: '段落 ID', value: action.paragraph_id });
    appendParagraphPreviewByPath(details, action, context);
  }

  if (action.character_name) {
    details.push({ label: '角色名称', value: action.character_name });
  }

  if (action.name) {
    details.push({ label: '名称', value: action.name });
  }
}
