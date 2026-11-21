import './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDB, __resetDbPromiseForTesting } from 'src/utils/indexed-db';

const DB_NAME = 'tsukuyomi';

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('delete failed'));
    request.onblocked = () => reject(new Error('blocked'));
  });
}

/** 模拟 v15 数据库：只建 books 仓库并写入一本书 */
function openV15WithBook(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 15);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('books', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('books', 'readwrite');
      tx.objectStore('books').put({ id: 'book-1', title: '月下旅人' });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error ?? new Error('write failed'));
    };
    request.onerror = () => reject(request.error ?? new Error('open failed'));
  });
}

describe('IndexedDB v16 · task-queue 仓库', () => {
  beforeEach(async () => {
    await __resetDbPromiseForTesting();
    await deleteDatabase();
  });

  it('从 v15 升级后新增 task-queue 仓库（含 by-status / by-order 索引），旧仓库数据完好', async () => {
    await openV15WithBook();
    const db = await getDB();
    expect(db.version).toBeGreaterThanOrEqual(16);
    expect(db.objectStoreNames.contains('task-queue')).toBe(true);
    const tx = db.transaction('task-queue', 'readonly');
    expect([...tx.store.indexNames]).toEqual(expect.arrayContaining(['by-status', 'by-order']));
    await tx.done;
    const book = await db.get('books', 'book-1');
    expect(book?.title).toBe('月下旅人');
  });

  it('新库直接创建 task-queue 仓库，可读写队列项', async () => {
    const db = await getDB();
    await db.put('task-queue', {
      id: 'q1',
      bookId: 'b',
      chapterId: 'c',
      kind: 'translation',
      mode: 'continue',
      origin: 'manual',
      status: 'queued',
      order: 1,
      completedParagraphIds: [],
      aiTaskIds: [],
      enqueuedAt: 1,
    });
    const all = await db.getAllFromIndex('task-queue', 'by-status', 'queued');
    expect(all.map((item) => item.id)).toEqual(['q1']);
  });
});
