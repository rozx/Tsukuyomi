import { CodedLocalizedError } from 'src/utils/coded-localized-error';
import type { BookRevision } from 'src/models/import';

interface RevisionStore {
  get(id: string): Promise<BookRevision | undefined>;
  put(value: BookRevision): Promise<string>;
}

/** 必须传入业务写入所在事务的 store；删除小说也保留此单调序号。 */
export async function bumpBookRevision(
  store: RevisionStore,
  bookId: string,
  operationId?: string,
): Promise<number> {
  const prior = (await store.get(bookId))?.revision ?? 0;
  if (!Number.isSafeInteger(prior) || prior < 0 || prior >= Number.MAX_SAFE_INTEGER)
    throw new CodedLocalizedError('REVISION_OVERFLOW', 'bookUi.execution.revisionOverflow');
  const revision = prior + 1;
  await store.put({ bookId, revision, ...(operationId ? { operationId } : {}) });
  return revision;
}
