import { completeIdbTransaction } from 'src/utils/complete-idb-transaction';
import type { IDBPObjectStore } from 'idb';
import { getDB } from 'src/utils/indexed-db';
import type { TsukuyomiDB } from 'src/utils/indexed-db';
import { bumpBookRevision } from './book-revision';

type MemoryRecord = TsukuyomiDB['memories']['value'];
type Store = IDBPObjectStore<TsukuyomiDB, ['memories', 'book-revisions'], 'memories', 'readwrite'>;
export type MemoryWriteStore = Pick<Store, 'get' | 'getAll' | 'index' | 'put' | 'delete' | 'clear'>;

function semanticChange(before: MemoryRecord | undefined, after: MemoryRecord): boolean {
  return (
    !before ||
    before.bookId !== after.bookId ||
    before.content !== after.content ||
    before.summary !== after.summary ||
    before.createdAt !== after.createdAt
  );
}

/** 在持久化边界跟踪语义变化；访问时间和派生向量不改变书籍序号。 */
export async function withMemoryWrite<T>(
  work: (store: MemoryWriteStore) => Promise<T>,
): Promise<T> {
  const db = await getDB();
  const tx = db.transaction(['memories', 'book-revisions'], 'readwrite');
  const store = tx.objectStore('memories');
  const changedBooks = new Set<string>();
  const tracked: MemoryWriteStore = {
    get: store.get.bind(store),
    getAll: store.getAll.bind(store),
    index: store.index.bind(store),
    async put(value) {
      const old = await store.get(value.id);
      if (semanticChange(old, value)) {
        changedBooks.add(value.bookId);
        if (old) changedBooks.add(old.bookId);
      }
      return store.put(value);
    },
    async delete(id) {
      const old = await store.get(id);
      if (old) changedBooks.add(old.bookId);
      await store.delete(id);
    },
    async clear() {
      for (const memory of await store.getAll()) changedBooks.add(memory.bookId);
      await store.clear();
    },
  };
  return completeIdbTransaction(tx, async () => {
    const result = await work(tracked);
    for (const bookId of changedBooks)
      await bumpBookRevision(tx.objectStore('book-revisions'), bookId);
    return result;
  });
}
