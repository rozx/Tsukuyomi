/**
 * IDB v10 → v11 migration:chapter-embeddings 加 `kind` 字段、改复合 key。
 *
 * 测试策略:
 * - 不导入 `src/utils/indexed-db.ts`(它会以最新 DB_VERSION=11 开库)
 * - 用原生 indexedDB.open(... v10) 手工建出 v10 形态的 store + 写入旧记录
 * - 关库后 import 当前 indexed-db 模块,触发 upgrade 跑到 v11
 * - 校验:每条记录都有 `kind: 'content'`、key 形如 `${chapterId}:content:${chunkIndex}`
 */
import './setup';
import { describe, expect, it, beforeEach } from 'bun:test';
import { getErrorMessage } from '../utils/error-message';

const DB_NAME = 'tsukuyomi';

interface LegacyRecord {
  chapterId: string;
  bookId: string;
  chunkIndex: number;
  vector: number[];
  textSnippet: string;
  model: string;
  updatedAt: number;
}

function asError(err: unknown, fallback: string): Error {
  if (err instanceof Error) return err;
  return new Error(getErrorMessage(err, fallback));
}

/** 删除整个数据库,确保从 v0 开始测试 */
function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(asError(req.error, 'deleteDatabase failed'));
    req.onblocked = () => resolve();
  });
}

/** 用原生 IDB 在 v10 形态下建库并写入旧记录 */
function seedV10Database(records: Array<{ key: string; value: LegacyRecord }>): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 10);
    req.onupgradeneeded = () => {
      const db = req.result;
      // 简化:只建 chapter-embeddings store,迁移测试只关心这一个
      if (!db.objectStoreNames.contains('chapter-embeddings')) {
        const store = db.createObjectStore('chapter-embeddings');
        store.createIndex('by-chapterId', 'chapterId', { unique: false });
        store.createIndex('by-bookId', 'bookId', { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('chapter-embeddings', 'readwrite');
      const store = tx.objectStore('chapter-embeddings');
      for (const r of records) store.put(r.value, r.key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(asError(tx.error, 'seed tx failed'));
    };
    req.onerror = () => reject(asError(req.error, 'open v10 failed'));
  });
}

/** 触发 v10→v11 upgrade,然后回读全部记录 */
async function openV11AndDumpAll(): Promise<Array<{ key: string; value: any }>> {
  const { __resetDbPromiseForTesting, getDB } = await import('src/utils/indexed-db');
  await __resetDbPromiseForTesting();
  const db = await getDB();
  const tx = db.transaction('chapter-embeddings', 'readonly');
  const store = tx.objectStore('chapter-embeddings');
  const out: Array<{ key: string; value: any }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursor = await (store as any).openCursor();
  while (cursor) {
    out.push({ key: cursor.key, value: cursor.value });
    cursor = await cursor.continue();
  }
  await tx.done;
  return out;
}

describe('chapter-embeddings v10 → v11 migration', () => {
  beforeEach(async () => {
    const { __resetDbPromiseForTesting } = await import('src/utils/indexed-db');
    await __resetDbPromiseForTesting();
    await deleteDatabase();
  });

  it('空 store:upgrade 后无记录、不抛错', async () => {
    await seedV10Database([]);
    const all = await openV11AndDumpAll();
    expect(all).toHaveLength(0);
  });

  it('全量旧 chunk:每条都被回填 kind 并迁移到新 key', async () => {
    const legacy: LegacyRecord = {
      chapterId: 'ch-1',
      bookId: 'book-1',
      chunkIndex: 0,
      vector: [0.1, 0.2, 0.3],
      textSnippet: 'snippet-1',
      model: 'model-x',
      updatedAt: 1000,
    };
    await seedV10Database([
      { key: 'ch-1:0', value: legacy },
      {
        key: 'ch-1:1',
        value: { ...legacy, chunkIndex: 1, textSnippet: 'snippet-2', updatedAt: 1100 },
      },
      {
        key: 'ch-2:0',
        value: { ...legacy, chapterId: 'ch-2', textSnippet: 'snippet-3', updatedAt: 1200 },
      },
    ]);

    const all = await openV11AndDumpAll();

    expect(all).toHaveLength(3);
    for (const { value } of all) {
      expect(value.kind).toBe('content');
    }
    const keys = all.map((r) => r.key).sort();
    expect(keys).toEqual(['ch-1:content:0', 'ch-1:content:1', 'ch-2:content:0']);
    // 字段完整性:除了新增 kind,其它字段保留原值
    const ch1c0 = all.find((r) => r.key === 'ch-1:content:0')!.value;
    expect(ch1c0).toMatchObject({
      chapterId: 'ch-1',
      bookId: 'book-1',
      chunkIndex: 0,
      kind: 'content',
      vector: [0.1, 0.2, 0.3],
      textSnippet: 'snippet-1',
      model: 'model-x',
      updatedAt: 1000,
    });
  });

  it('部分章节有数据(混合多 book 多 chapter):全部正确迁移', async () => {
    const mk = (chId: string, bookId: string, idx: number, snippet: string): LegacyRecord => ({
      chapterId: chId,
      bookId,
      chunkIndex: idx,
      vector: [0.5],
      textSnippet: snippet,
      model: 'm',
      updatedAt: idx,
    });
    await seedV10Database([
      { key: 'cA:0', value: mk('cA', 'b1', 0, 'a0') },
      { key: 'cA:1', value: mk('cA', 'b1', 1, 'a1') },
      { key: 'cA:2', value: mk('cA', 'b1', 2, 'a2') },
      { key: 'cB:0', value: mk('cB', 'b1', 0, 'b0') },
      { key: 'cC:0', value: mk('cC', 'b2', 0, 'c0') },
      { key: 'cC:1', value: mk('cC', 'b2', 1, 'c1') },
    ]);

    const all = await openV11AndDumpAll();

    expect(all).toHaveLength(6);
    expect(all.every((r) => (r.value as any).kind === 'content')).toBe(true);
    const keys = all.map((r) => r.key).sort();
    expect(keys).toEqual([
      'cA:content:0',
      'cA:content:1',
      'cA:content:2',
      'cB:content:0',
      'cC:content:0',
      'cC:content:1',
    ]);
  });

  it('索引 by-chapterId / by-bookId 在迁移后仍可正常查询', async () => {
    await seedV10Database([
      {
        key: 'ch-1:0',
        value: {
          chapterId: 'ch-1',
          bookId: 'book-1',
          chunkIndex: 0,
          vector: [0.1],
          textSnippet: 's0',
          model: 'm',
          updatedAt: 1,
        },
      },
      {
        key: 'ch-1:1',
        value: {
          chapterId: 'ch-1',
          bookId: 'book-1',
          chunkIndex: 1,
          vector: [0.2],
          textSnippet: 's1',
          model: 'm',
          updatedAt: 2,
        },
      },
      {
        key: 'ch-2:0',
        value: {
          chapterId: 'ch-2',
          bookId: 'book-2',
          chunkIndex: 0,
          vector: [0.3],
          textSnippet: 's2',
          model: 'm',
          updatedAt: 3,
        },
      },
    ]);

    const { __resetDbPromiseForTesting, getDB } = await import('src/utils/indexed-db');
    await __resetDbPromiseForTesting();
    const db = await getDB();
    const tx = db.transaction('chapter-embeddings', 'readonly');
    const ch1 = await tx.store.index('by-chapterId').getAll('ch-1');
    const book2 = await tx.store.index('by-bookId').getAll('book-2');
    expect(ch1).toHaveLength(2);
    expect(ch1.every((r) => r.kind === 'content')).toBe(true);
    expect(book2).toHaveLength(1);
    expect(book2[0]?.chapterId).toBe('ch-2');
  });
});
