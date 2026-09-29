import { cloneDeep } from 'lodash';
import { v5 } from 'uuid';
import type { IDBPDatabase } from 'idb';
import type { TsukuyomiDB } from 'src/utils/indexed-db';
import type { Alias, CharacterSetting, Novel, Translation } from 'src/models/novel';
import type { LocalizedMap, SyncRevision } from 'src/models/localized-data';
import { canonicalStringify } from 'src/utils/canonical-json';
import { completeIdbTransaction } from 'src/utils/complete-idb-transaction';
import { normalizeBookLanguages } from './normalize';
import { collectBookRevisions } from './entity-edit';
import { reserveSyncRevision } from './clock';
import { mergeBookEntityState } from './entities';
import { createEntityDeletionRecorder } from './entity-identity';
import { replaceLanguageSlots as restoreSlots } from './versioned-values';
import { replaceBookLanguageSlots } from './book-slots';

export interface EntityRestoreOperation {
  id: string;
  scope: 'book' | 'library' | 'snapshot' | 'force-book';
  state: 'prepared' | 'applied';
  bookId?: string;
  signature: string;
  sourceSignature?: string;
  result?: Novel;
  identityMap?: Record<string, { id: string; parentId?: string }>;
}
interface OperationStore {
  get(id: string): Promise<EntityRestoreOperation | undefined>;
  put(value: EntityRestoreOperation): Promise<string>;
}
function restoreOperationKey(
  scope: EntityRestoreOperation['scope'],
  operationId: string,
  bookId?: string,
): string {
  return canonicalStringify([scope, operationId, bookId ?? null]);
}
function assertReceipt(
  receipt: EntityRestoreOperation,
  scope: EntityRestoreOperation['scope'],
  signature: string,
) {
  if (receipt.scope !== scope || receipt.signature !== signature)
    throw new Error('RESTORE_OPERATION_CONFLICT');
}
export async function restoreOperationApplied(
  store: Pick<OperationStore, 'get'>,
  scope: 'library' | 'snapshot',
  operationId: string,
  signature: string,
): Promise<boolean> {
  const receipt = await store.get(restoreOperationKey(scope, operationId));
  if (!receipt) return false;
  assertReceipt(receipt, scope, signature);
  return receipt.state === 'applied';
}
export async function markBookRestoreApplied(
  store: OperationStore,
  operationId: string,
  bookId: string,
): Promise<void> {
  const receipt = await store.get(restoreOperationKey('book', operationId, bookId));
  if (!receipt || receipt.scope !== 'book') throw new Error('RESTORE_RECEIPT_MISSING');
  await store.put({ ...receipt, state: 'applied' });
}
export async function completeRestoreOperation(
  store: OperationStore,
  scope: 'library' | 'snapshot',
  operationId: string,
  signature: string,
  bookIds: string[],
): Promise<void> {
  for (const bookId of bookIds) await markBookRestoreApplied(store, operationId, bookId);
  await store.put({
    id: restoreOperationKey(scope, operationId),
    scope,
    state: 'applied',
    signature,
  });
}

/** 外层整体回滚后保留已分配的身份，撤销子操作的完成标记。 */
export async function resetRestoreCompletion(
  db: IDBPDatabase<TsukuyomiDB>,
  operationId: string,
  bookIds: string[],
): Promise<void> {
  const tx = db.transaction('entity-operations', 'readwrite');
  await completeIdbTransaction(tx, async () => {
    await tx.store.delete(restoreOperationKey('library', operationId));
    for (const bookId of bookIds) {
      const key = restoreOperationKey('book', operationId, bookId);
      const receipt = await tx.store.get(key);
      if (receipt) await tx.store.put({ ...receipt, state: 'prepared' });
    }
  });
}
const RESTORE_NAMESPACE = '1f5afad0-c3ce-4e14-9d1e-26ae2b9ba514';

function restoreBook(
  snapshot: Novel,
  current: Novel,
  operationId: string,
  revision: SyncRevision,
): Novel {
  const result = cloneDeep(snapshot);
  const now = Date.now();
  const tombstones = mergeBookEntityState(
    { ...snapshot, terminologies: [], characterSettings: [] },
    { ...current, terminologies: [], characterSettings: [] },
  ).entityTombstones!;
  const remove = createEntityDeletionRecorder(tombstones, revision, now);

  for (const term of current.terminologies ?? []) remove('term', term.id);
  for (const character of current.characterSettings ?? []) {
    remove('character', character.id);
    for (const alias of character.aliases) remove('alias', alias.id!, character.id);
  }
  const identity = (kind: string, id: string, parentId?: string) =>
    v5(
      canonicalStringify([operationId, snapshot.id, kind, parentId ?? null, id]),
      RESTORE_NAMESPACE,
    );
  function restoreName<
    T extends { translation: Translation; translationsByLanguage?: LocalizedMap<Translation> },
  >(value: T): T {
    const translationsByLanguage = restoreSlots(value.translationsByLanguage, {}, revision, now);
    return {
      ...value,
      translationsByLanguage,
      translation: translationsByLanguage['zh-CN']?.value ?? {
        id: '',
        translation: '',
        aiModelId: '',
        language: 'zh-CN',
      },
    };
  }
  function restoreEntity<
    T extends NonNullable<Novel['terminologies']>[number] | CharacterSetting | Alias,
  >(value: T, kind: string, parentId?: string): T {
    return {
      ...restoreName(value),
      id: identity(kind, value.id!, parentId),
      fieldRevisions: Object.fromEntries(
        Object.keys(value.fieldRevisions ?? {}).map((field) => [field, { ...revision }]),
      ),
    };
  }
  result.terminologies = snapshot.terminologies?.map((term) => restoreEntity(term, 'term')) ?? [];
  result.characterSettings =
    snapshot.characterSettings?.map((character) => ({
      ...restoreEntity(character, 'character'),
      aliases: character.aliases.map((alias) => restoreEntity(alias, 'alias', character.id)),
    })) ?? [];
  replaceBookLanguageSlots(result, current, revision, now);
  return { ...result, entityTombstones: tombstones };
}

/** 固定操作回执保留分配结果；业务回滚后重试沿用原来的身份和版本。 */
export async function prepareBookRestore(
  db: IDBPDatabase<TsukuyomiDB>,
  snapshot: Novel,
  current: Novel | undefined,
  operationId: string,
): Promise<Novel> {
  if (!operationId.trim()) throw new Error('INVALID_RESTORE_OPERATION');
  const desired = normalizeBookLanguages(snapshot);
  const previous = current ? normalizeBookLanguages(current) : undefined;
  const key = restoreOperationKey('book', operationId, snapshot.id);
  const signature = canonicalStringify(desired);
  const sourceSignature = canonicalStringify(previous ?? null);
  const cached = await db.get('entity-operations', key);
  const readReceipt = (receipt: EntityRestoreOperation) => {
    assertReceipt(receipt, 'book', signature);
    if (!receipt.result) throw new Error('RESTORE_RECEIPT_MISSING');
    if (receipt.state !== 'applied' && receipt.sourceSignature !== sourceSignature)
      throw new Error('RESTORE_SOURCE_CHANGED');
    return normalizeBookLanguages(receipt.result);
  };
  if (cached) return readReceipt(cached);
  const result = previous
    ? restoreBook(
        desired,
        previous,
        key,
        await reserveSyncRevision(db, [
          ...collectBookRevisions(previous),
          ...collectBookRevisions(desired),
        ]),
      )
    : desired;
  const tx = db.transaction('entity-operations', 'readwrite');
  return completeIdbTransaction(tx, async () => {
    const existing = await tx.store.get(key);
    if (existing) return readReceipt(existing);
    await tx.store.put({
      id: key,
      scope: 'book',
      state: 'prepared',
      bookId: snapshot.id,
      signature,
      sourceSignature,
      result,
    });
    return result;
  });
}
