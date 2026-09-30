import type { AppLocale } from 'src/models/locale';
import type { ToolContext } from './types';
export function fuzzyMatches<T>(matches: T[], max: number, uiLocale: AppLocale, name: string) {
  return {
    items: matches.slice(0, max),
    success: true,
    message: fuzzyMatchMessage(uiLocale, name, max, matches.length),
    total_matches: matches.length,
    truncated: matches.length > max,
  };
}

export function validToolQuery(query: unknown, logLabel: string): query is string {
  if (!query || typeof query !== 'string') {
    console.error('[' + logLabel + '] Invalid search query', { query, queryType: typeof query });
    return false;
  }
  return true;
}

export function checkedToolBookContext(
  context: ToolContext,
):
  | { error: string }
  | (ToolContext & { bookId: string; uiLocale: AppLocale; language: AppLocale }) {
  const uiLocale = context.languages?.uiLocale ?? 'zh-CN';
  return context.bookId
    ? {
        ...context,
        bookId: context.bookId,
        uiLocale,
        language: context.languages?.targetLanguage ?? 'zh-CN',
      }
    : { error: toolErrorJson('BOOK_ID_REQUIRED', 'aiEntityFeedback.bookRequired', uiLocale) };
}
import type { MessageKey } from 'src/i18n/types';
import { translateText } from 'src/i18n/translate';
import {
  LocalizedError,
  localizedErrorCode,
  localizedErrorMessage,
} from 'src/utils/localized-error';

export function requireToolBookId(
  bookId: string | undefined,
  uiLocale: AppLocale,
): asserts bookId is string {
  if (!bookId)
    throw new LocalizedError('BOOK_ID_REQUIRED', 'aiEntityFeedback.bookRequired', {}, uiLocale);
}

/** 保留统一错误协议，不把显示说明作为业务身份。 */
export function toolErrorJson(
  code: string,
  key: MessageKey,
  uiLocale: AppLocale,
  values: Record<string, string | number> = {},
): string {
  return JSON.stringify({
    success: false,
    error_code: code,
    error: translateText(uiLocale, key, values),
  });
}

export function caughtToolErrorJson(
  error: unknown,
  uiLocale: AppLocale,
  code: string,
  key: MessageKey,
): string {
  return JSON.stringify({
    success: false,
    error_code: localizedErrorCode(error, code),
    error: localizedErrorMessage(error, uiLocale, key),
  });
}

export function bookToolContext(
  context: ToolContext,
): ToolContext & { bookId: string; uiLocale: AppLocale; language: AppLocale } {
  const uiLocale = context.languages?.uiLocale ?? 'zh-CN';
  requireToolBookId(context.bookId, uiLocale);
  return {
    ...context,
    bookId: context.bookId,
    uiLocale,
    language: context.languages?.targetLanguage ?? 'zh-CN',
  };
}

export function fuzzyMatchMessage(
  uiLocale: AppLocale,
  name: string,
  max: number,
  total: number,
): string {
  return translateText(uiLocale, 'aiEntityFeedback.fuzzy', {
    name,
    limit:
      total > max ? translateText(uiLocale, 'aiEntityFeedback.fuzzyLimit', { max, total }) : '',
  });
}
