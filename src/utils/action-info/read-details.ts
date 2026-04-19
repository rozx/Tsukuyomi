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
type ReadToolHandler = (
  details: ActionDetail[],
  action: MessageAction,
  context: ActionDetailsContext,
) => void;

function appendKeywordsLine(
  details: ActionDetail[],
  keywords: string[] | undefined,
  label: string,
): void {
  if (!keywords || keywords.length === 0) return;
  details.push({ label, value: keywords.join('、') });
}

const READ_TOOL_HANDLERS: Record<string, ReadToolHandler> = {
  get_help_doc: (details, action) => {
    if (action.title) details.push({ label: '文档标题', value: action.title });
  },
  list_help_docs: (details) => {
    details.push({ label: '文档列表', value: '已获取' });
  },
  get_book_info: (details, action, context) => {
    if (action.book_id) appendBookInfo(details, action.book_id, context);
  },
  get_memory: (details, action) => {
    if (action.memory_id) details.push({ label: 'Memory ID', value: action.memory_id });
  },
  search_characters_by_keywords: (details, action) => {
    appendKeywordsLine(details, action.keywords, '搜索关键词');
  },
  search_terms_by_keywords: (details, action) => {
    appendKeywordsLine(details, action.keywords, '搜索关键词');
  },
  find_paragraph_by_keywords: (details, action, context) => {
    appendKeywordsLine(details, action.keywords, '原文关键词');
    appendKeywordsLine(details, action.translation_keywords, '翻译关键词');
    if (action.chapter_id) appendChapterDetailByChapterId(details, action.chapter_id, context);
  },
  search_paragraphs_by_regex: (details, action, context) => {
    if (action.regex_pattern) details.push({ label: '正则表达式', value: action.regex_pattern });
    if (action.chapter_id) appendChapterDetailByChapterId(details, action.chapter_id, context);
  },
  get_occurrences_by_keywords: (details, action) => {
    appendKeywordsLine(details, action.keywords, '关键词');
  },
};

function appendDefaultReadFields(
  details: ActionDetail[],
  action: MessageAction,
  context: ActionDetailsContext,
): void {
  appendKeywordsLine(details, action.keywords, '关键词');
  if (action.regex_pattern) details.push({ label: '正则表达式', value: action.regex_pattern });
  if (action.chapter_id) appendChapterDetailByChapterId(details, action.chapter_id, context);
}

function appendCommonReadFields(
  details: ActionDetail[],
  action: MessageAction,
  context: ActionDetailsContext,
): void {
  if (action.chapter_title) details.push({ label: '章节标题', value: action.chapter_title });
  if (action.paragraph_id) {
    details.push({ label: '段落 ID', value: action.paragraph_id });
    appendParagraphPreviewByPath(details, action, context);
  }
  if (action.character_name) details.push({ label: '角色名称', value: action.character_name });
  if (action.name) details.push({ label: '名称', value: action.name });
}

export function appendReadDetails(
  details: ActionDetail[],
  action: MessageAction,
  context: ActionDetailsContext,
): void {
  if (action.tool_name) details.push({ label: '工具', value: action.tool_name });
  const handler = action.tool_name ? READ_TOOL_HANDLERS[action.tool_name] : undefined;
  if (handler) handler(details, action, context);
  else appendDefaultReadFields(details, action, context);
  appendCommonReadFields(details, action, context);
}
