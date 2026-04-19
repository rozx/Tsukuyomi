import { describe, expect, it, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import './setup';

import { MemoryService } from '../services/memory-service';
import { EmbeddingQueue } from '../services/embedding-queue';
import { getDB } from '../utils/indexed-db';

describe('upsertMemoryForSync: embedding preservation', () => {
  const BOOK_ID = 'book-upsert-test';
  let enqueueSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    enqueueSpy = spyOn(EmbeddingQueue, 'enqueue').mockImplementation(() => undefined);

    // 清理残留
    const db = await getDB();
    const tx = db.transaction('memories', 'readwrite');
    const idx = tx.objectStore('memories').index('by-bookId');
    const all = await idx.getAll(BOOK_ID);
    for (const m of all) await tx.objectStore('memories').delete(m.id);
    await tx.done;
  });

  afterEach(() => {
    mock.restore();
  });

  it('同内容同摘要、incoming 无 embedding 时，保留本地 embedding 不入队重算', async () => {
    // 预置一条带 embedding 的本地记录
    const db = await getDB();
    const existingTx = db.transaction('memories', 'readwrite');
    await existingTx.objectStore('memories').put({
      id: 'm-1',
      bookId: BOOK_ID,
      content: '原内容',
      summary: '摘要',
      createdAt: 1000,
      lastAccessedAt: 1500,
      embedding: [0.1, 0.2, 0.3],
      embeddingModel: 'embeddinggemma-300m@256',
    });
    await existingTx.done;

    // 远端下载回来的 Memory 没有 embedding 字段（sync-strip 剥离过）
    await MemoryService.upsertMemoryForSync({
      id: 'm-1',
      bookId: BOOK_ID,
      content: '原内容',
      summary: '摘要',
      createdAt: 1000,
      lastAccessedAt: 2000,
    });

    const after = await (await getDB()).get('memories', 'm-1');
    expect(after?.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(after?.embeddingModel).toBe('embeddinggemma-300m@256');
    expect(after?.lastAccessedAt).toBe(2000);
    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  it('content 变化时，丢弃陈旧 embedding 并入队重算', async () => {
    const db = await getDB();
    const existingTx = db.transaction('memories', 'readwrite');
    await existingTx.objectStore('memories').put({
      id: 'm-2',
      bookId: BOOK_ID,
      content: '旧内容',
      summary: '摘要',
      createdAt: 1000,
      lastAccessedAt: 1500,
      embedding: [0.1, 0.2, 0.3],
      embeddingModel: 'embeddinggemma-300m@256',
    });
    await existingTx.done;

    await MemoryService.upsertMemoryForSync({
      id: 'm-2',
      bookId: BOOK_ID,
      content: '新内容',
      summary: '摘要',
      createdAt: 1000,
      lastAccessedAt: 2000,
    });

    const after = await (await getDB()).get('memories', 'm-2');
    expect(after?.embedding).toBeUndefined();
    expect(after?.embeddingModel).toBeUndefined();
    expect(after?.content).toBe('新内容');
    expect(enqueueSpy).toHaveBeenCalledWith('m-2', BOOK_ID);
  });

  it('同 id 但 bookId 不同时，必须抛错而不是静默改属主', async () => {
    // 回归保护：`memories` store 仅以 id 为主键，盲目 put 会把另一本书的记录悄悄
    // 改 bookId / 覆盖。Memory id 是 8 位 hex，跨书碰撞罕见但不是零。
    const db = await getDB();
    const existingTx = db.transaction('memories', 'readwrite');
    await existingTx.objectStore('memories').put({
      id: 'shared-id',
      bookId: 'book-A',
      content: 'A 的内容',
      summary: 'A 的摘要',
      createdAt: 1000,
      lastAccessedAt: 1500,
    });
    await existingTx.done;

    await (expect(
      MemoryService.upsertMemoryForSync({
        id: 'shared-id',
        bookId: 'book-B',
        content: 'B 的内容',
        summary: 'B 的摘要',
        createdAt: 2000,
        lastAccessedAt: 2500,
      }),
    ).rejects.toThrow(/Memory ID 冲突/) as unknown as Promise<void>);

    // 原记录保持不变，没有被改 bookId 或覆盖
    const untouched = await (await getDB()).get('memories', 'shared-id');
    expect(untouched?.bookId).toBe('book-A');
    expect(untouched?.content).toBe('A 的内容');
  });

  it('incoming 自带 embedding 时，按远端字段原样写入', async () => {
    await MemoryService.upsertMemoryForSync({
      id: 'm-3',
      bookId: BOOK_ID,
      content: '内容',
      summary: '摘要',
      createdAt: 1000,
      lastAccessedAt: 1500,
      embedding: [0.5, 0.6],
      embeddingModel: 'other-model',
    });

    const after = await (await getDB()).get('memories', 'm-3');
    expect(after?.embedding).toEqual([0.5, 0.6]);
    expect(after?.embeddingModel).toBe('other-model');
    expect(enqueueSpy).not.toHaveBeenCalled();
  });
});
