import type { AppLocale } from 'src/models/locale';
import type { MessageKey } from 'src/i18n/types';
import { translateText } from 'src/i18n/translate';
import { getErrorMessage } from './error-message';

/** 错误业务身份与显示说明分离，不按第三方诊断文字猜测类型。 */
export class LocalizedError extends Error {
  readonly values: Readonly<Record<string, string | number>>;
  constructor(
    readonly code: string,
    readonly messageKey: MessageKey,
    values: Record<string, string | number> = {},
    locale: AppLocale = 'zh-CN',
  ) {
    super(translateText(locale, messageKey, values));
    this.name = 'LocalizedError';
    this.values = Object.freeze({ ...values });
  }
  messageFor(locale: AppLocale): string {
    return translateText(locale, this.messageKey, this.values);
  }
}

/** 只本地化已标识的自有错误，第三方 Error.message 保持原文。 */
export function localizedErrorMessage(
  error: unknown,
  locale: AppLocale,
  fallback: MessageKey,
): string {
  return error instanceof LocalizedError
    ? error.messageFor(locale)
    : getErrorMessage(error, translateText(locale, fallback));
}

export function localizedErrorCode(error: unknown, fallback = 'TOOL_FAILED'): string {
  const code = error instanceof Error ? (error as Error & { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : fallback;
}
