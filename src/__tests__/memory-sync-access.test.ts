import './setup';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { MemoryService } from '../services/memory-service';
import { EmbeddingQueue } from '../services/embedding-queue';
import { normalizeMemoriesForSync } from '../utils/sync-strip';
import { hashJson } from '../utils/content-hash';
import { SyncDataService } from '../services/sync-data-service';

async function syncedMemories() {
  return normalizeMemoriesForSync({ book: await MemoryService.getAllMemories('book') }).book;
}

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
