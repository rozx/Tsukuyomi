import './setup';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { MemoryService } from '../services/memory-service';
import { EmbeddingQueue } from '../services/embedding-queue';
import { normalizeMemoriesForSync } from '../utils/sync-strip';
import { hashJson } from '../utils/content-hash';
import { SyncDataService } from '../services/sync-data-service';
import { updateMemoryEmbeddingInDB } from '../utils/memory-embedding-lookup';

async function syncedMemories() {
  return normalizeMemoriesForSync({ book: await MemoryService.getAllMemories('book') }).book;
}

describe('同步导入接受空摘要记忆', () => {
  beforeEach(() => {
    spyOn(EmbeddingQueue, 'enqueue').mockImplementation(() => undefined);
  });
  afterEach(() => mock.restore());

  it('普通创建仍拒绝空摘要', async () => {
    await (expect(
      MemoryService.createMemoryWithId('book-empty', 'strict', '内容', ''),
    ).rejects.toThrow() as unknown as Promise<void>);
  });

  it('同步导入模式写入空摘要记忆而不抛错', async () => {
    await MemoryService.createMemoryWithId(
      'book-empty',
      'legacy',
      '旧版内容',
      '',
      { createdAt: 50, updatedAt: 50 },
      { allowEmptyText: true },
    );
    const stored = await MemoryService.getAllMemories('book-empty');
    expect(stored.map((m) => [m.id, m.summary, m.content])).toEqual([['legacy', '', '旧版内容']]);
  });
});

describe('同步导入仍校验正文与摘要类型', () => {
  beforeEach(() => {
    spyOn(EmbeddingQueue, 'enqueue').mockImplementation(() => undefined);
  });
  afterEach(() => mock.restore());

  it('同步导入模式拒绝非字符串正文或摘要', async () => {
    await (expect(
      MemoryService.createMemoryWithId(
        'book-corrupt',
        'no-content',
        undefined as unknown as string,
        '摘要',
        undefined,
        { allowEmptyText: true },
      ),
    ).rejects.toThrow() as unknown as Promise<void>);
    await (expect(
      MemoryService.createMemoryWithId(
        'book-corrupt',
        'object-summary',
        '内容',
        { text: 'x' } as unknown as string,
        undefined,
        { allowEmptyText: true },
      ),
    ).rejects.toThrow() as unknown as Promise<void>);
    expect(await MemoryService.getAllMemories('book-corrupt')).toEqual([]);
  });
});

describe('v6 记忆同步校验文本类型', () => {
  beforeEach(() => {
    spyOn(EmbeddingQueue, 'enqueue').mockImplementation(() => undefined);
  });
  afterEach(() => mock.restore());

  it('同步 upsert 拒绝非字符串正文，不写入损坏记录', async () => {
    await (expect(
      MemoryService.upsertMemoryForSync({
        id: 'bad-v6',
        bookId: 'book-v6',
        content: undefined as unknown as string,
        summary: '摘要',
        createdAt: 1,
        lastAccessedAt: 1,
      }),
    ).rejects.toThrow() as unknown as Promise<void>);
    expect(await MemoryService.getAllMemories('book-v6')).toEqual([]);
  });

  it('同步 upsert 接受空字符串摘要', async () => {
    await MemoryService.upsertMemoryForSync({
      id: 'empty-v6',
      bookId: 'book-v6b',
      content: '正文',
      summary: '',
      createdAt: 1,
      lastAccessedAt: 1,
    });
    expect((await MemoryService.getAllMemories('book-v6b'))[0]?.summary).toBe('');
  });
});

describe('向量写入校验记忆内容未变', () => {
  beforeEach(() => {
    spyOn(EmbeddingQueue, 'enqueue').mockImplementation(() => undefined);
  });
  afterEach(() => mock.restore());

  it('写入事务内发现正文已变化时不写入旧向量', async () => {
    await MemoryService.createMemoryWithId('book-vec', 'changed', '同步后的正文', '摘要');

    const written = await updateMemoryEmbeddingInDB('changed', [[1, 0]], 'model-v', {
      content: '同步前的正文',
      summary: '摘要',
    });

    expect(written).toBe(false);
    const stored = (await MemoryService.getAllMemories('book-vec'))[0];
    expect(stored?.embeddings).toBeUndefined();
  });

  it('内容一致时写入向量', async () => {
    await MemoryService.createMemoryWithId('book-vec2', 'same', '正文', '摘要');

    const written = await updateMemoryEmbeddingInDB('same', [[1, 0]], 'model-v', {
      content: '正文',
      summary: '摘要',
    });

    expect(written).toBe(true);
    const stored = (await MemoryService.getAllMemories('book-vec2'))[0];
    expect(stored?.embeddingModel).toBe('model-v');
  });
});

describe('Memory 访问与同步内容分离', () => {
  beforeEach(() => {
    spyOn(EmbeddingQueue, 'enqueue').mockImplementation(() => undefined);
  });
  afterEach(() => mock.restore());

  it('读取记忆只更新本地访问时间，不改变同步内容', async () => {
    spyOn(Date, 'now').mockReturnValue(2000);
    await MemoryService.createMemoryWithId('book', 'memory', '内容', '摘要');
    const before = await hashJson(await syncedMemories());

    spyOn(Date, 'now').mockReturnValue(8000);
    await MemoryService.getMemory('book', 'memory');

    expect((await MemoryService.getAllMemories('book'))[0]?.lastAccessedAt).toBe(8000);
    expect(await hashJson(await syncedMemories())).toBe(before);
  });

  it('保存相同内容不会产生同步变更', async () => {
    spyOn(Date, 'now').mockReturnValue(2000);
    await MemoryService.createMemoryWithId('book', 'memory', '内容', '摘要');
    const before = await hashJson(await syncedMemories());
    spyOn(Date, 'now').mockReturnValue(8000);
    await MemoryService.updateMemory('book', 'memory', '内容', '摘要');
    expect(await hashJson(await syncedMemories())).toBe(before);
  });

  it('较新的本地访问不会压过远端内容修改', async () => {
    spyOn(Date, 'now').mockReturnValue(2000);
    await MemoryService.createMemoryWithId('book', 'memory', '旧内容', '摘要');
    spyOn(Date, 'now').mockReturnValue(8000);
    await MemoryService.getRecentMemories('book');

    await SyncDataService.applyPartialRemoteData({
      'memories:book': {
        kind: 'memories',
        bookId: 'book',
        value: {
          memories: [
            {
              id: 'memory',
              bookId: 'book',
              content: '远端修改',
              summary: '摘要',
              createdAt: 2000,
              updatedAt: 4000,
              lastAccessedAt: 4000,
            },
          ],
        },
      },
    });

    const memory = (await MemoryService.getAllMemories('book'))[0];
    expect(memory?.content).toBe('远端修改');
    expect(memory?.lastAccessedAt).toBe(8000);
  });

  it('较新的本地访问不能使已被远端删除的记忆复活', async () => {
    spyOn(Date, 'now').mockReturnValue(2000);
    await MemoryService.createMemoryWithId('book', 'memory', '内容', '摘要');
    spyOn(Date, 'now').mockReturnValue(8000);
    await MemoryService.getRecentMemories('book');

    await SyncDataService.applyPartialRemoteData({
      'memories:book': {
        kind: 'memories',
        bookId: 'book',
        value: { memories: [], tombstones: [{ id: 'memory', deletedAt: 4000 }] },
      },
    });
    expect(await MemoryService.getAllMemories('book')).toEqual([]);
  });
});
