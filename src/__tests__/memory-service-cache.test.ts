import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import './setup';
import { MemoryService } from 'src/services/memory-service';
import { getDB } from 'src/utils/indexed-db';

const BOOK_A = 'book-a-cache';
const BOOK_B = 'book-b-cache';

async function seed(bookId: string, count: number) {
  const db = await getDB();
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    await db.put('memories', {
      id: `${bookId}-m${i}`,
      bookId,
      content: `content ${i}`,
      summary: `summary ${i}`,
      createdAt: now - i * 1000,
      lastAccessedAt: now - i * 1000,
    });
  }
}

async function clearMemories() {
  const db = await getDB();
  const tx = db.transaction('memories', 'readwrite');
  await tx.objectStore('memories').clear();
  await tx.done;
}

describe('MemoryService - getAllBookMemories cache', () => {
  beforeEach(async () => {
    // 清理内部 static 缓存
    (MemoryService as unknown as { bookMemoryCache: Map<string, unknown> }).bookMemoryCache.clear();
    (MemoryService as unknown as { memoryCache: Map<string, unknown> }).memoryCache.clear();
    // 确保 memories store 空白,避免跨测试污染
    await clearMemories();
  });

  afterEach(() => {
    mock.restore();
  });

  test('首次调用走数据库,第二次命中缓存', async () => {
    await seed(BOOK_A, 3);

    const first = await MemoryService.getAllBookMemories(BOOK_A);
    expect(first).toHaveLength(3);

    // 插入新记忆但不走 MemoryService(绕过失效逻辑)
    const db = await getDB();
    await db.put('memories', {
      id: `${BOOK_A}-m99`,
      bookId: BOOK_A,
      content: 'sneaky',
      summary: 'sneaky',
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    });

    // 第二次调用应该返回缓存的 3 条(不是 4)
    const second = await MemoryService.getAllBookMemories(BOOK_A);
    expect(second).toHaveLength(3);
  });

  test('不同 bookId 互不影响', async () => {
    await seed(BOOK_A, 2);
    await seed(BOOK_B, 5);

    const a = await MemoryService.getAllBookMemories(BOOK_A);
    const b = await MemoryService.getAllBookMemories(BOOK_B);

    expect(a).toHaveLength(2);
    expect(b).toHaveLength(5);
  });

  test('TTL 过期后重新从 DB 读取', async () => {
    await seed(BOOK_A, 2);

    const first = await MemoryService.getAllBookMemories(BOOK_A);
    expect(first).toHaveLength(2);

    // 手工将 expiresAt 设置为过去
    const cache = (
      MemoryService as unknown as {
        bookMemoryCache: Map<string, { data: unknown[]; expiresAt: number }>;
      }
    ).bookMemoryCache;
    const entry = cache.get(BOOK_A);
    expect(entry).toBeDefined();
    cache.set(BOOK_A, { data: entry!.data, expiresAt: Date.now() - 1 });

    // 插入新记忆
    const db = await getDB();
    await db.put('memories', {
      id: `${BOOK_A}-fresh`,
      bookId: BOOK_A,
      content: 'fresh',
      summary: 'fresh',
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    });

    const second = await MemoryService.getAllBookMemories(BOOK_A);
    expect(second).toHaveLength(3);
  });

  test('createMemory 使对应 bookId 缓存失效', async () => {
    await seed(BOOK_A, 2);
    await MemoryService.getAllBookMemories(BOOK_A);

    await MemoryService.createMemory(BOOK_A, 'new content', 'new summary');

    const after = await MemoryService.getAllBookMemories(BOOK_A);
    expect(after).toHaveLength(3);
  });

  test('updateMemory 使对应 bookId 缓存失效', async () => {
    await seed(BOOK_A, 1);
    await MemoryService.getAllBookMemories(BOOK_A);

    await MemoryService.updateMemory(BOOK_A, `${BOOK_A}-m0`, 'edited', 'edited summary');

    const after = await MemoryService.getAllBookMemories(BOOK_A);
    const edited = after.find((m) => m.id === `${BOOK_A}-m0`);
    expect(edited?.summary).toBe('edited summary');
  });

  test('deleteMemory 使对应 bookId 缓存失效', async () => {
    await seed(BOOK_A, 3);
    await MemoryService.getAllBookMemories(BOOK_A);

    await MemoryService.deleteMemory(BOOK_A, `${BOOK_A}-m0`);

    const after = await MemoryService.getAllBookMemories(BOOK_A);
    expect(after).toHaveLength(2);
  });
});

describe('MemoryService - updateMemoryEmbeddingOnly', () => {
  beforeEach(async () => {
    (MemoryService as unknown as { bookMemoryCache: Map<string, unknown> }).bookMemoryCache.clear();
    (MemoryService as unknown as { memoryCache: Map<string, unknown> }).memoryCache.clear();
    await clearMemories();
  });

  test('写入 embedding 不修改 lastAccessedAt', async () => {
    const db = await getDB();
    const originalTime = 1_000_000_000;
    await db.put('memories', {
      id: 'emb-m1',
      bookId: 'emb-book',
      content: 'c',
      summary: 's',
      createdAt: originalTime,
      lastAccessedAt: originalTime,
    });

    await MemoryService.updateMemoryEmbeddingOnly(
      'emb-m1',
      [0.1, 0.2, 0.3],
      'test-model@256',
    );

    const after = (await db.get('memories', 'emb-m1')) as {
      lastAccessedAt: number;
      embedding?: number[];
      embeddingModel?: string;
    };
    expect(after.lastAccessedAt).toBe(originalTime);
    expect(after.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(after.embeddingModel).toBe('test-model@256');
  });

  test('写入后书级缓存被原地更新,下次调用读到新 embedding', async () => {
    const db = await getDB();
    await db.put('memories', {
      id: 'emb-m2',
      bookId: 'emb-book-2',
      content: 'c',
      summary: 's',
      createdAt: 1,
      lastAccessedAt: 1,
    });

    const first = await MemoryService.getAllBookMemories('emb-book-2');
    expect(first[0]?.embedding).toBeUndefined();

    await MemoryService.updateMemoryEmbeddingOnly('emb-m2', [0.9, 0.1], 'v1');

    const second = await MemoryService.getAllBookMemories('emb-book-2');
    expect(second[0]?.embedding).toEqual([0.9, 0.1]);
    expect(second[0]?.embeddingModel).toBe('v1');
  });

  test('不存在的 memoryId 静默跳过', async () => {
    // 不应抛异常
    await MemoryService.updateMemoryEmbeddingOnly('nonexistent-id', [0.1], 'v1');
  });
});
