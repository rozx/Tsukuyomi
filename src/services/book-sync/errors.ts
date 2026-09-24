export class BookSyncError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'BookSyncError';
  }
}

export function cleanupError(error: unknown): never {
  if (error instanceof Error && error.name === 'AbortError') throw error;
  const message = error instanceof Error ? error.message : String(error);
  throw new BookSyncError(
    /超时|时间上限/.test(message) ? 'CLEANUP_TIMEOUT' : 'CLEANUP_INVALID',
    message,
  );
}
