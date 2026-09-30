import type { MessageKey } from 'src/i18n/types';
import { LocalizedError } from './localized-error';

/**
 * 保留既有 `CODE: 说明` 消息形状的自有错误：
 * 旧调用方仍可从 message 前缀读取错误码，展示处用 messageFor(locale) 取得不带前缀的说明。
 */
export class CodedLocalizedError extends LocalizedError {
  constructor(
    code: string,
    messageKey: MessageKey,
    values: Record<string, string | number> = {},
    options?: ErrorOptions,
  ) {
    super(code, messageKey, values);
    this.message = `${code}: ${this.message}`;
    if (options && 'cause' in options) this.cause = options.cause;
  }
}
