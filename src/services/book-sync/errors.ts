import { LocalizedError } from 'src/utils/localized-error';
import type { AppLocale } from 'src/models/locale';

export class BookSyncError extends LocalizedError {
  /** 自有详情保留原错误，按语言渲染时交给它（可能覆盖了 messageFor） */
  private readonly detail: LocalizedError | undefined;
  constructor(code: string, detail: string | Error) {
    super(
      code,
      detail instanceof LocalizedError ? detail.messageKey : 'aiImportErrors.bookSyncRawDiagnostic',
      detail instanceof LocalizedError
        ? { ...detail.values }
        : { detail: detail instanceof Error ? detail.message : detail },
    );
    this.message = `${code}: ${this.message}`;
    this.name = 'BookSyncError';
    this.detail = detail instanceof LocalizedError ? detail : undefined;
  }
  override messageFor(locale: AppLocale): string {
    return this.detail ? this.detail.messageFor(locale) : super.messageFor(locale);
  }
}

export function cleanupError(error: unknown): never {
  if (error instanceof Error && error.name === 'AbortError') throw error;
  const message = error instanceof Error ? error.message : String(error);
  const timeout =
    error instanceof LocalizedError
      ? [
          'aiImportErrors.processingLimitWorkerParsingTimedOut',
          'aiImportErrors.processingLimitParsingExceededTheTimeLimit',
        ].includes(error.messageKey)
      : /超时|时间上限/.test(message);
  throw new BookSyncError(
    timeout ? 'CLEANUP_TIMEOUT' : 'CLEANUP_INVALID',
    error instanceof LocalizedError ? error : message,
  );
}
