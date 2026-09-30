import { ChapterService } from 'src/services/chapter-service';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';
import type { MessageAction } from 'src/stores/chat-sessions';
import type { AppLocale } from 'src/models/locale';
import type { ActionDetail, ActionDetailsContext } from './types';
import { appendDetail, detailText, joinList, preview } from './types';
import { appendChapterDetailByChapterId } from './chapter-location';

function appendBookInfo(
  details: ActionDetail[],
  bookId: string,
  context: ActionDetailsContext,
  locale: AppLocale,
): void {
  const book = context.getBookById(bookId);
  if (!book) return;
  details.push({ label: detailText(locale, 'book'), value: book.title });
  if (book.author) {
    details.push({ label: detailText(locale, 'author'), value: book.author });
  }
  if (book.description) {
    details.push({ label: detailText(locale, 'synopsis'), value: preview(book.description, 100) });
  }
}

function appendParagraphPreviewByPath(
  details: ActionDetail[],
  action: MessageAction,
  context: ActionDetailsContext,
  locale: AppLocale,
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
  const chapterLabel = detailText(locale, 'chapter');
  if (!details.some((d) => d.label === chapterLabel)) {
    details.push({ label: chapterLabel, value: getChapterDisplayTitle(chapter) });
  }
  if (paragraph.text) {
    details.push({
      label: detailText(locale, 'sourcePreview'),
      value: preview(paragraph.text, 50),
    });
  }
}

/**
 * 处理 action.type === 'read' 下所有工具的详情。
 */
type ReadToolHandler = (
  details: ActionDetail[],
  action: MessageAction,
  context: ActionDetailsContext,
  locale: AppLocale,
) => void;

type LabelKey = Parameters<typeof detailText>[1];

function appendKeywordsLine(
  details: ActionDetail[],
  keywords: string[] | undefined,
  label: LabelKey,
  locale: AppLocale,
): void {
  if (!keywords || keywords.length === 0) return;
  details.push({ label: detailText(locale, label), value: joinList(locale, keywords) });
}

function appendRegexLine(details: ActionDetail[], action: MessageAction, locale: AppLocale): void {
  if (action.regex_pattern) {
    details.push({ label: detailText(locale, 'regex'), value: action.regex_pattern });
  }
}

const READ_TOOL_HANDLERS: Record<string, ReadToolHandler> = {
  get_help_doc: (details, action, _context, locale) => {
    if (action.title) details.push({ label: detailText(locale, 'docTitle'), value: action.title });
  },
  list_help_docs: (details, _action, _context, locale) => {
    details.push({ label: detailText(locale, 'docList'), value: detailText(locale, 'fetched') });
  },
  get_book_info: (details, action, context, locale) => {
    if (action.book_id) appendBookInfo(details, action.book_id, context, locale);
  },
  get_memory: (details, action, _context, locale) => {
    if (action.memory_id) {
      details.push({ label: detailText(locale, 'memoryId'), value: action.memory_id });
    }
  },
  search_characters_by_keywords: (details, action, _context, locale) => {
    appendKeywordsLine(details, action.keywords, 'searchKeywords', locale);
  },
  search_terms_by_keywords: (details, action, _context, locale) => {
    appendKeywordsLine(details, action.keywords, 'searchKeywords', locale);
  },
  find_paragraph_by_keywords: (details, action, context, locale) => {
    appendKeywordsLine(details, action.keywords, 'originalKeywords', locale);
    appendKeywordsLine(details, action.translation_keywords, 'translationKeywords', locale);
    if (action.chapter_id) {
      appendChapterDetailByChapterId(details, action.chapter_id, context, locale);
    }
  },
  search_paragraphs_by_regex: (details, action, context, locale) => {
    appendRegexLine(details, action, locale);
    if (action.chapter_id) {
      appendChapterDetailByChapterId(details, action.chapter_id, context, locale);
    }
  },
  get_occurrences_by_keywords: (details, action, _context, locale) => {
    appendKeywordsLine(details, action.keywords, 'keywords', locale);
  },
};

function appendDefaultReadFields(
  details: ActionDetail[],
  action: MessageAction,
  context: ActionDetailsContext,
  locale: AppLocale,
): void {
  appendKeywordsLine(details, action.keywords, 'keywords', locale);
  appendRegexLine(details, action, locale);
  if (action.chapter_id) {
    appendChapterDetailByChapterId(details, action.chapter_id, context, locale);
  }
}

function appendCommonReadFields(
  details: ActionDetail[],
  action: MessageAction,
  context: ActionDetailsContext,
  locale: AppLocale,
): void {
  appendDetail(details, locale, 'chapterTitle', action.chapter_title);
  if (action.paragraph_id) {
    appendDetail(details, locale, 'paragraphId', action.paragraph_id);
    appendParagraphPreviewByPath(details, action, context, locale);
  }
  appendDetail(details, locale, 'characterName', action.character_name);
  appendDetail(details, locale, 'name', action.name);
}

export function appendReadDetails(
  details: ActionDetail[],
  action: MessageAction,
  context: ActionDetailsContext,
  locale: AppLocale = 'zh-CN',
): void {
  if (action.tool_name) {
    details.push({ label: detailText(locale, 'tool'), value: action.tool_name });
  }
  const handler = action.tool_name ? READ_TOOL_HANDLERS[action.tool_name] : undefined;
  if (handler) handler(details, action, context, locale);
  else appendDefaultReadFields(details, action, context, locale);
  appendCommonReadFields(details, action, context, locale);
}
