import { afterEach, beforeEach, describe, it, mock, spyOn } from 'bun:test';
import { expect } from 'vitest';
import './setup';
import { MemoryService } from '../services/memory-service';
import { EmbeddingQueue } from '../services/embedding-queue';
import { memoryCache, bookMemoryCache } from '../services/memory-cache';
import { getDB } from '../utils/indexed-db';

async function revision(bookId = 'b') {
  return (await (await getDB()).get('book-revisions', bookId))?.revision ?? 0;
}

let cancelSpy: ReturnType<typeof spyOn>;
beforeEach(() => {
  memoryCache.clear();
  bookMemoryCache.clear();
  spyOn(EmbeddingQueue, 'enqueue').mockImplementation(() => undefined);
  cancelSpy = spyOn(EmbeddingQueue, 'cancel').mockImplementation(() => undefined);
});
afterEach(() => mock.restore());

describe('记忆语义修改接入书籍序号', () => {
  it('创建、修改、改后改回及删除都递增；无语义变化不递增', async () => {
    const memory = await MemoryService.createMemory('b', '原内容', '摘要');
    expect(await revision()).toBe(1);
    await MemoryService.updateMemory('b', memory.id, '原内容', '摘要');
    expect(await revision()).toBe(1);
    await MemoryService.updateMemory('b', memory.id, '新内容', '摘要');
    expect(await revision()).toBe(2);
    await MemoryService.updateMemory('b', memory.id, '原内容', '摘要');
    expect(await revision()).toBe(3);
    await MemoryService.deleteMemory('b', memory.id);
    expect(await revision()).toBe(4);
  });

  it('指定 ID 导入与同步更新计入修改，访问时间和嵌入不计入', async () => {
    await MemoryService.createMemoryWithId('b', 'm', '内容', '摘要', {
      createdAt: 100,
      lastAccessedAt: 200,
    });
    expect(await revision()).toBe(1);
    await MemoryService.createMemoryWithId('b', 'm', '内容', '摘要', {
      createdAt: 100,
      lastAccessedAt: 300,
    });
    await MemoryService.upsertMemoryForSync({
      id: 'm',
      bookId: 'b',
      content: '内容',
      summary: '摘要',
      createdAt: 100,
      lastAccessedAt: 400,
    });
    expect(await revision()).toBe(1);
    memoryCache.clear();
    await MemoryService.getMemory('b', 'm');
    await MemoryService.getRecentMemories('b', 5, 'lastAccessedAt', true);
    await MemoryService.updateMemoryEmbeddingOnly('m', [[0.1, 0.2]], 'test-model');
    expect(await revision()).toBe(1);
    await MemoryService.upsertMemoryForSync({
      id: 'm',
      bookId: 'b',
      content: '更新',
      summary: '',
      createdAt: 100,
      lastAccessedAt: 400,
    });
    expect(await revision()).toBe(2);
    await MemoryService.createMemoryWithId('b', 'm', '更新', '新的摘要');
    expect(await revision()).toBe(3);
  });

  it('按书清理语义变更，空清理不重复递增', async () => {
    await MemoryService.createMemoryWithId('a', 'a1', '甲', '甲');
    await MemoryService.createMemoryWithId('a', 'a2', '甲二', '甲二');
    await MemoryService.createMemoryWithId('b', 'b1', '乙', '乙');
    await MemoryService.clearAllMemories();
    expect(await revision('a')).toBe(3);
    expect(await revision('b')).toBe(2);
    await MemoryService.clearAllMemories();
    expect(await revision('a')).toBe(3);
  });

  it('修改序号失败回滚写入，不提前修改缓存或触发队列', async () => {
    await MemoryService.createMemoryWithId('b', 'm', '原文', '摘要');
    const db = await getDB();
    await db.put('book-revisions', { bookId: 'b', revision: Number.MAX_SAFE_INTEGER });
    const old = await db.get('memories', 'm');
    await expect(MemoryService.updateMemory('b', 'm', '新文', '摘要')).rejects.toThrow();
    expect(await db.get('memories', 'm')).toEqual(old);
    expect(memoryCache.get('b:m')?.content).toBe('原文');
    await expect(MemoryService.deleteMemory('b', 'm')).rejects.toThrow();
    expect(await db.get('memories', 'm')).toEqual(old);
    expect(cancelSpy).not.toHaveBeenCalled();
  });

  it('容量淘汰和新建同事务，失败不会提前删除旧记忆或其缓存', async () => {
    const db = await getDB();
    const tx = db.transaction('memories', 'readwrite');
    for (let i = 0; i < 500; i++)
      await tx.store.put({
        id: `m${i}`,
        bookId: 'b',
        content: `内容${i}`,
        summary: '摘要',
        createdAt: i,
        lastAccessedAt: i,
      });
    await tx.done;
    await MemoryService.getAllBookMemories('b');
    await db.put('book-revisions', { bookId: 'b', revision: Number.MAX_SAFE_INTEGER });
    await expect(MemoryService.createMemoryWithId('b', 'new', '新', '新')).rejects.toThrow();
    expect(await db.get('memories', 'm0')).toBeDefined();
    expect(await db.get('memories', 'new')).toBeUndefined();
    expect((await MemoryService.getAllBookMemories('b')).some((m) => m.id === 'm0')).toBe(true);
    await db.put('book-revisions', { bookId: 'b', revision: 5 });
    await MemoryService.createMemoryWithId('b', 'new', '新', '新');
    expect(await db.get('memories', 'm0')).toBeUndefined();
    expect(await revision()).toBe(6);
  });

  for (const operation of ['访问时间', '嵌入'] as const) {
    it(`${operation}更新不得用读到的旧快照覆盖并发语义修改`, async () => {
      await MemoryService.createMemoryWithId('b', 'm', '原内容', '摘要');
      memoryCache.clear();
      const db = await getDB();
      let interleaved = false;
      const update = () => MemoryService.updateMemory('b', 'm', '并发的新内容', '摘要');
      // 在旧版独立 get / put 的间隙插入语义写入；事务化之后该间隙不再存在。
      const read = spyOn(db, 'get').mockImplementationOnce(async () => {
        const snapshot = await db.transaction('memories').store.get('m');
        interleaved = true;
        await update();
        return snapshot;
      });
      if (operation === '访问时间') await MemoryService.getMemory('b', 'm');
      else await MemoryService.updateMemoryEmbeddingOnly('m', [[0.1, 0.2]], 'model');
      read.mockRestore();
      if (!interleaved) await update();
      expect((await db.get('memories', 'm'))?.content).toBe('并发的新内容');
      expect(await revision()).toBe(2);
    });
  }
});
