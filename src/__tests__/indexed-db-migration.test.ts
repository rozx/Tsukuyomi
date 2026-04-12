import { describe, expect, test, beforeEach } from 'bun:test';
import './setup';
import { getDB, __resetDbPromiseForTesting } from 'src/utils/indexed-db';

const DB_NAME = 'tsukuyomi';

/**
 * 直接使用原生 IndexedDB API 以模拟 v8 状态,然后调用 getDB() 触发 v8→v9 升级。
 * fake-indexeddb 在全局挂载为 indexedDB。
 */
function openDatabaseAtVersion(version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);
    request.onupgradeneeded = () => {
      const db = request.result;
      // 只在没有 memories store 时创建(模拟 v8 状态)
      if (!db.objectStoreNames.contains('memories')) {
        const memoriesStore = db.createObjectStore('memories', { keyPath: 'id' });
        memoriesStore.createIndex('by-bookId', 'bookId', { unique: false });
        memoriesStore.createIndex('by-lastAccessedAt', 'lastAccessedAt', { unique: false });
      }
      // 为了测试需要,其他 store 不必创建(v9 upgrade 不会碰它们)
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('open failed'));
    request.onblocked = () => reject(new Error('blocked'));
  });
}

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('delete failed'));
    request.onblocked = () => reject(new Error('blocked'));
  });
}

describe('IndexedDB v9 硬迁移', () => {
  beforeEach(async () => {
    await __resetDbPromiseForTesting();
    await deleteDatabase();
  });

  test('从 v8 含 attachedTo 的记忆升级到 v9 应物理删除字段', async () => {
    // 1. 在 v8 上手动插入带 attachedTo 的记忆
    const v8db = await openDatabaseAtVersion(8);
    const tx = v8db.transaction('memories', 'readwrite');
    const store = tx.objectStore('memories');
    store.add({
      id: 'mem_001',
      bookId: 'book_a',
      content: 'content 1',
      summary: 'summary 1',
      attachedTo: [{ type: 'character', id: 'char_1' }],
      createdAt: 1000,
      lastAccessedAt: 2000,
    });
    store.add({
      id: 'mem_002',
      bookId: 'book_a',
      content: 'content 2',
      summary: 'summary 2',
      attachedTo: [
        { type: 'term', id: 'term_1' },
        { type: 'book', id: 'book_a' },
      ],
      createdAt: 1500,
      lastAccessedAt: 2500,
    });
    store.add({
      id: 'mem_003',
      bookId: 'book_b',
      content: 'content 3',
      summary: 'summary 3',
      // 这一条模拟没有 attachedTo 字段的记录
      createdAt: 1800,
      lastAccessedAt: 2800,
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('tx failed'));
    });
    v8db.close();

    // 2. 触发 getDB() 执行 v8→v9 升级
    const db = await getDB();

    // 3. 读回所有记忆,验证 attachedTo 字段已被清理
    const all = await db.getAll('memories');
    expect(all).toHaveLength(3);

    for (const mem of all) {
      expect('attachedTo' in mem).toBe(false);
      // 其他字段应完整保留
      expect(mem.id).toBeTruthy();
      expect(mem.bookId).toBeTruthy();
      expect(mem.content).toBeTruthy();
      expect(mem.summary).toBeTruthy();
      expect(typeof mem.createdAt).toBe('number');
      expect(typeof mem.lastAccessedAt).toBe('number');
    }

    // 按 id 查找,验证每条都正确
    const m1 = all.find((m) => m.id === 'mem_001');
    expect(m1?.content).toBe('content 1');
    const m2 = all.find((m) => m.id === 'mem_002');
    expect(m2?.content).toBe('content 2');
    const m3 = all.find((m) => m.id === 'mem_003');
    expect(m3?.content).toBe('content 3');
  });

  test('空 memories store 升级应正常完成', async () => {
    // 1. 创建空的 v8 库
    const v8db = await openDatabaseAtVersion(8);
    v8db.close();

    // 2. 升级到 v9
    const db = await getDB();

    // 3. memories store 应存在且为空
    const all = await db.getAll('memories');
    expect(all).toHaveLength(0);
  });

  test('全新库(无历史版本)直接以 v9 打开应正常工作', async () => {
    // 这是首次安装场景:直接 getDB() 打开 v9
    const db = await getDB();
    const all = await db.getAll('memories');
    expect(all).toHaveLength(0);
    // 能正常写入新记忆
    await db.add('memories', {
      id: 'new_mem',
      bookId: 'book_x',
      content: 'fresh content',
      summary: 'fresh summary',
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      embedding: [0.1, 0.2, 0.3],
      embeddingModel: 'test@256',
    });
    const fetched = await db.get('memories', 'new_mem');
    expect(fetched?.content).toBe('fresh content');
    expect(fetched?.embedding).toHaveLength(3);
  });
});
