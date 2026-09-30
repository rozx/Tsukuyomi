import { LocalizedError } from 'src/utils/localized-error';

export class BookSyncError extends LocalizedError {
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
