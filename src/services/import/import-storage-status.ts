import type { ImportFailure } from 'src/models/import-feedback';
import { importError, serializeImportError } from './import-error';
/**
 * 导入任务的本地保存状态（仅内存）。
 *
 * 写入失败时无法再把「保存失败」写进同一个数据库，因此在当前页记录，供工作台显示
 * 「尚未可靠保存」；同一任务下一次写入成功后清除。
 */
export interface ImportStorageIssue extends ImportFailure {
  code: 'STORAGE_FAILED';
  message: string;
  quota: boolean;
  at: number;
}

type Listener = (taskId: string) => void;

const STORAGE_ERRORS = new Set([
  'QuotaExceededError',
  'UnknownError',
  'InvalidStateError',
  'TransactionInactiveError',
  'ReadOnlyError',
  'DataCloneError',
  'VersionError',
]);

const issues = new Map<string, ImportStorageIssue>();
const listeners = new Set<Listener>();

function emit(taskId: string): void {
  for (const listener of listeners) {
    try {
      listener(taskId);
    } catch (error) {
      console.warn('导入保存状态通知失败:', error);
    }
  }
}

function storageError(error: unknown): DOMException | undefined {
  if (error instanceof DOMException && STORAGE_ERRORS.has(error.name)) return error;
  const cause = error instanceof Error ? error.cause : undefined;
  return cause instanceof DOMException && STORAGE_ERRORS.has(cause.name) ? cause : undefined;
}

export const ImportStorageStatus = {
  get(taskId: string): ImportStorageIssue | undefined {
    return issues.get(taskId);
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** 包装一次任务写入：存储错误转成 `STORAGE_FAILED` 并记录，成功则清除旧记录。 */
  async track<T>(taskId: string, write: () => Promise<T>): Promise<T> {
    try {
      const result = await write();
      if (issues.delete(taskId)) emit(taskId);
      return result;
    } catch (error) {
      const failure = storageError(error);
      if (!failure) throw error;
      const quota = failure.name === 'QuotaExceededError';
      const localized = importError(
        'STORAGE_FAILED',
        quota ? 'storageQuota' : 'storageFailed',
        { name: failure.name },
        { cause: error },
      );
      issues.set(taskId, {
        ...serializeImportError(localized),
        code: 'STORAGE_FAILED',
        quota,
        at: Date.now(),
      });
      emit(taskId);
      throw localized;
    }
  },
};
