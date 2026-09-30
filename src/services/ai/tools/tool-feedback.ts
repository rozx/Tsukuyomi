import type { AppLocale } from 'src/models/locale';
import type { ToolContext } from './types';
export function fuzzyMatches<T>(matches: T[], max: number, name: string) {
  return {
    items: matches.slice(0, max),
    success: true,
    message: fuzzyMatchMessage(name, max, matches.length),
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
): { error: string } | (ToolContext & { bookId: string; language: AppLocale }) {
  return context.bookId
    ? {
        ...context,
        bookId: context.bookId,
        language: context.languages?.targetLanguage ?? 'zh-CN',
      }
    : { error: toolErrorJson('BOOK_ID_REQUIRED', 'aiEntityFeedback.bookRequired') };
}
import type { AgentMessageKey } from 'src/i18n/types';
import { AGENT_LOCALE, agentText, translateText } from 'src/i18n/translate';
import { agentErrorMessage, LocalizedError, localizedErrorCode } from 'src/utils/localized-error';

export function requireToolBookId(bookId: string | undefined): asserts bookId is string {
  if (!bookId) throw new LocalizedError('BOOK_ID_REQUIRED', 'aiEntityFeedback.bookRequired', {});
}

/** 保留统一错误协议，不把显示说明作为业务身份；说明只返回给模型，固定简中。 */
export function toolErrorJson(
  code: string,
  key: AgentMessageKey,
  values: Record<string, string | number> = {},
): string {
  return JSON.stringify({
    success: false,
    error_code: code,
    error: agentText(key, values),
  });
}

export function caughtToolErrorJson(error: unknown, code: string, key: AgentMessageKey): string {
  return JSON.stringify({
    success: false,
    error_code: localizedErrorCode(error, code),
    error: agentErrorMessage(error, key),
  });
}

export function bookToolContext(
  context: ToolContext,
): ToolContext & { bookId: string; language: AppLocale } {
  requireToolBookId(context.bookId);
  return {
    ...context,
    bookId: context.bookId,
    language: context.languages?.targetLanguage ?? 'zh-CN',
  };
}

export function fuzzyMatchMessage(name: string, max: number, total: number): string {
  return translateText(AGENT_LOCALE, 'aiEntityFeedback.fuzzy', {
    name,
    limit:
      total > max ? translateText(AGENT_LOCALE, 'aiEntityFeedback.fuzzyLimit', { max, total }) : '',
  });
}
