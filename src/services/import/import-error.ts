import messages from 'src/i18n';
import { translateText } from 'src/i18n/translate';
import type importErrors from 'src/i18n/zh-CN/import-errors';
import type { AppLocale } from 'src/models/locale';
import type { ImportFailure, ImportNotice } from 'src/models/import-feedback';
import { LocalizedError } from 'src/utils/localized-error';
import type { MessageKey } from 'src/i18n/types';

export type ImportErrorKey = keyof typeof importErrors.aiImportErrors;
type Parameters = Record<string, string | number | Error>;

function parameterText(value: string | number | Error, locale: AppLocale): string | number {
  if (value instanceof LocalizedError) return `${value.code}: ${value.messageFor(locale)}`;
  return value instanceof Error ? value.message : value;
}

class ImportLocalizedError extends LocalizedError {
  readonly parameters: Readonly<Parameters>;
  constructor(code: string, messageKey: MessageKey, parameters: Parameters) {
    super(
      code,
      messageKey,
      Object.fromEntries(
        Object.entries(parameters).map(([name, value]) => [name, parameterText(value, 'zh-CN')]),
      ),
    );
    this.parameters = Object.freeze({ ...parameters });
    this.message = `${code}: ${this.message}`;
  }
  override messageFor(locale: AppLocale): string {
    return new LocalizedError(
      this.code,
      this.messageKey,
      Object.fromEntries(
        Object.entries(this.parameters).map(([name, value]) => [
          name,
          parameterText(value, locale),
        ]),
      ),
      locale,
    ).message;
  }
}

class ImportCancellation extends DOMException {
  constructor(readonly messageKey: MessageKey) {
    super(translateText('zh-CN', messageKey), 'AbortError');
  }
  messageFor(locale: AppLocale): string {
    return translateText(locale, this.messageKey);
  }
}
export function importCancelled(key: ImportErrorKey): DOMException {
  return new ImportCancellation(`aiImportErrors.${key}` as MessageKey);
}

/** 自有错误按语言显示；外部原始说明保持不变。 */
export function importErrorText(error: unknown, locale: AppLocale): string {
  if (error instanceof LocalizedError) return `${error.code}: ${error.messageFor(locale)}`;
  if (error instanceof ImportCancellation) return error.messageFor(locale);
  return error instanceof Error ? error.message : String(error);
}

/** 保留既有 CODE: 前缀；嵌套自有诊断保留身份，外部诊断保持原文。 */
export function importError(
  code: string,
  key: ImportErrorKey,
  values: Parameters = {},
  options?: ErrorOptions,
): LocalizedError {
  const error = new ImportLocalizedError(code, `aiImportErrors.${key}` as MessageKey, values);
  if (options && 'cause' in options) error.cause = options.cause;
  return error;
}

export function serializeImportError(
  error: unknown,
  fallback = 'IMPORT_FAILED',
  locale: AppLocale = 'zh-CN',
): ImportFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof ImportCancellation)
    return {
      code: 'ABORTED',
      message: error.messageFor(locale),
      localization: { key: error.messageKey, values: {} },
    };
  if (error instanceof LocalizedError) {
    const values =
      error instanceof ImportLocalizedError
        ? Object.fromEntries(
            Object.entries(error.parameters).map(([name, value]) => [
              name,
              value instanceof LocalizedError
                ? serializeImportError(value, value.code, locale)
                : parameterText(value, locale),
            ]),
          )
        : { ...error.values };
    return {
      code: error.code,
      message: `${error.code}: ${error.messageFor(locale)}`,
      localization: { key: error.messageKey, values },
    };
  }
  return { code: /^([A-Z_]+):/.exec(message)?.[1] ?? fallback, message };
}

/** 结构化冲突说明原本不带 CODE 前缀，投影时保留该显示形状。 */
export function importFailure(
  code: string,
  key: ImportErrorKey,
  values: Parameters = {},
): ImportFailure {
  const error = importError(code, key, values);
  return { ...serializeImportError(error), message: error.messageFor('zh-CN') };
}

function restoreParameters(values: unknown, depth: number): Parameters | undefined {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return;
  const result: Parameters = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)))
      result[key] = value;
    else if (
      value &&
      typeof value === 'object' &&
      typeof value.code === 'string' &&
      typeof value.message === 'string'
    )
      result[key] = restoreImportError(value as ImportFailure, depth + 1);
    else return;
  }
  return result;
}

/** 读取结果保留原异常身份；旧失败快照仍按原始诊断处理。 */
export function readImportError(failure: { message: string; error?: ImportFailure }): Error {
  return restoreImportError(
    failure.error ?? { code: 'BOOK_READ_FAILED', message: failure.message },
  );
}

/** 已知身份才恢复；损坏元数据、旧纯文字及外部诊断保留原文。 */
export function restoreImportError(record: ImportFailure, depth = 0): Error {
  const key = record.localization?.key;
  let entry: unknown = messages['zh-CN'];
  if (typeof key === 'string')
    for (const part of key.split('.')) {
      if (!entry || typeof entry !== 'object' || !Object.hasOwn(entry, part)) {
        entry = undefined;
        break;
      }
      entry = (entry as Record<string, unknown>)[part];
    }
  if (depth < 20 && typeof key === 'string' && typeof entry === 'string') {
    const values = restoreParameters(record.localization?.values, depth);
    if (values) return new ImportLocalizedError(record.code, key as MessageKey, values);
  }
  return new Error(record.message);
}

/** 工具与检查点共用语言投影；用户内容、Date、二进制及原始记录保持不变。 */
export function localizeImportFeedback<T>(value: T, locale: AppLocale): T {
  if (Array.isArray(value)) return value.map((item) => localizeImportFeedback(item, locale)) as T;
  if (!value || typeof value !== 'object') return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const object = value as Record<string, unknown>;
  if (
    typeof object.code === 'string' &&
    typeof object.message === 'string' &&
    object.localization
  ) {
    const record = object as unknown as ImportFailure;
    const error = restoreImportError(record);
    if (error instanceof LocalizedError) {
      const prefix = record.message.startsWith(`${record.code}:`) ? `${record.code}: ` : '';
      let message = prefix + error.messageFor(locale);
      const limit = record.localization?.maxLength;
      if (typeof limit === 'number' && Number.isSafeInteger(limit) && limit > 0)
        message = message.slice(0, limit);
      return { ...object, message } as T;
    }
  }
  return Object.fromEntries(
    Object.entries(object).map(([key, child]) => [key, localizeImportFeedback(child, locale)]),
  ) as T;
}

/** 展示已标识的自有提示；用户文字和旧记录不猜测重译。 */
export function importNoticeText(value: unknown, locale: AppLocale = 'zh-CN'): string {
  if (typeof value === 'string') return value;
  if (
    !value ||
    typeof value !== 'object' ||
    !('message' in value) ||
    typeof value.message !== 'string'
  )
    return '';
  return (localizeImportFeedback(value, locale) as { message: string }).message;
}

export function truncateImportNotice<T extends ImportNotice>(value: T, maxLength: number): T {
  if (typeof value === 'string') return value.slice(0, maxLength) as T;
  const notice = value as ImportFailure;
  return {
    ...notice,
    message: notice.message.slice(0, maxLength),
    ...(notice.localization ? { localization: { ...notice.localization, maxLength } } : {}),
  } as T;
}
