/* eslint-disable @typescript-eslint/require-await */
import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import './setup';
import { MemoryService } from 'src/services/memory-service';
import { EmbeddingQueue } from 'src/services/embedding-queue';
import { getDB } from 'src/utils/indexed-db';

async function clearMemories() {
  const db = await getDB();
  const tx = db.transaction('memories', 'readwrite');
  await tx.objectStore('memories').clear();
  await tx.done;
}

describe('MemoryService - EmbeddingQueue 联动', () => {
  let enqueueSpy: ReturnType<typeof spyOn>;
  let cancelSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    await clearMemories();
    EmbeddingQueue.__resetForTesting();
    enqueueSpy = spyOn(EmbeddingQueue, 'enqueue').mockImplementation(() => {});
    cancelSpy = spyOn(EmbeddingQueue, 'cancel').mockImplementation(() => {});
  });

  afterEach(() => {
    mock.restore();
    EmbeddingQueue.__resetForTesting();
  });

  test('createMemory 成功后 enqueue 新记忆 id', async () => {
    const mem = await MemoryService.createMemory('book-q', '内容', '摘要');
    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    expect(enqueueSpy).toHaveBeenCalledWith(mem.id);
  });

  test('updateMemory 文本变化时 enqueue', async () => {
    const mem = await MemoryService.createMemory('book-q', '原始内容', '原始摘要');
    enqueueSpy.mockClear();

    await MemoryService.updateMemory('book-q', mem.id, '新内容', '新摘要');
    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    expect(enqueueSpy).toHaveBeenCalledWith(mem.id);
  });

  test('updateMemory 文本未变时不 enqueue', async () => {
    const mem = await MemoryService.createMemory('book-q', '不变内容', '不变摘要');
    enqueueSpy.mockClear();

    // 用相同的 content/summary 更新(仅 lastAccessedAt 变化)
    await MemoryService.updateMemory('book-q', mem.id, '不变内容', '不变摘要');
    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  test('deleteMemory 调用 cancel', async () => {
    const mem = await MemoryService.createMemory('book-q', '待删除', '摘要');
    cancelSpy.mockClear();

    await MemoryService.deleteMemory('book-q', mem.id);
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(cancelSpy).toHaveBeenCalledWith(mem.id);
  });

  test('updateMemoryEmbeddingOnly 不触发 enqueue(避免死循环)', async () => {
    const db = await getDB();
    await db.put('memories', {
      id: 'emb-loop-test',
      bookId: 'book-q',
      content: 'c',
      summary: 's',
      createdAt: 1,
      lastAccessedAt: 1,
    });
    enqueueSpy.mockClear();

    await MemoryService.updateMemoryEmbeddingOnly('emb-loop-test', [0.1], 'v1');
    expect(enqueueSpy).not.toHaveBeenCalled();
  });
});
