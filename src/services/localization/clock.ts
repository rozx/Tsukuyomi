import { v4 } from 'uuid';
import type { IDBPDatabase } from 'idb';
import type { TsukuyomiDB } from 'src/utils/indexed-db';
import type { SyncRevision } from 'src/models/localized-data';
import { completeIdbTransaction } from 'src/utils/complete-idb-transaction';
import { assertRevision } from './revision';

interface ClockStore {
  get(key: string): Promise<TsukuyomiDB['sync-metadata']['value'] | undefined>;
  put(value: TsukuyomiDB['sync-metadata']['value']): Promise<string>;
}

async function readObservedClock(store: ClockStore, observed: readonly SyncRevision[]) {
  for (const revision of observed) assertRevision(revision);
  const prior = await store.get('clock');
  if (prior) assertRevision(prior);
  let counter = prior?.counter ?? 0;
  for (const revision of observed) counter = Math.max(counter, revision.counter);
  if (counter >= Number.MAX_SAFE_INTEGER) throw new Error('SYNC_COUNTER_OVERFLOW');
  return { key: 'clock' as const, counter, actorId: prior?.actorId ?? v4() };
}

/** 与接收远端数据的业务写入共用事务，本地身份不从远端记录读取。 */
export async function observeSyncRevisions(
  store: ClockStore,
  observed: readonly SyncRevision[],
): Promise<void> {
  if (!observed.length) return;
  await store.put(await readObservedClock(store, observed));
}

/**
 * 先在独立事务预留版本，再写业务事务。失败可产生空号，但绝不复用已分配版本。
 * IndexedDB 的读写锁覆盖同源其他标签页；actorId 只存在本地，不进入备份。
 */
export async function reserveSyncRevision(
  db: IDBPDatabase<TsukuyomiDB>,
  observed: readonly SyncRevision[] = [],
): Promise<SyncRevision> {
  const tx = db.transaction('sync-metadata', 'readwrite');
  return completeIdbTransaction(tx, async () => {
    const clock = await readObservedClock(tx.store, observed);
    const revision = { counter: clock.counter + 1, actorId: clock.actorId };
    await tx.store.put({ key: 'clock', ...revision });
    return revision;
  });
}
