import { afterEach, describe, it, mock } from 'bun:test';
import { expect } from 'vitest';
import './setup';
import { createPinia } from 'pinia';
import { useSettingsStore } from '../stores/settings';
import { useBooksStore } from '../stores/books';
import { getDB } from '../utils/indexed-db';
import { mergeBookDeletionRecords } from '../services/sync-config-persistence';

afterEach(() => mock.restore());

describe('小说删除墓碑的定向事务合并', () => {
  it('合并最新配置，保留其他墓碑、同步设置、凭据及更新的同 ID 时间', async () => {
    const settings = useSettingsStore();
    await settings.updateGistSync({
      secret: 'latest-secret',
      syncParams: { gistId: 'latest' },
      deletedNovelIds: [
        { id: 'old', deletedAt: 900 },
        { id: 'same', deletedAt: 1000 },
      ],
      deletedMemoryIds: [{ id: 'memory', bookId: 'other', deletedAt: 50 }],
    });
    const db = await getDB();
    const tx = db.transaction('sync-configs', 'readwrite');
    await mergeBookDeletionRecords(tx.store, ['new', 'same'], 800);
    await tx.done;
    const saved = (await db.getAll('sync-configs'))[0]!;
    expect(saved.secret).toBe('latest-secret');
    expect(saved.syncParams.gistId).toBe('latest');
    expect(saved.deletedNovelIds).toEqual(
      expect.arrayContaining([
        { id: 'old', deletedAt: 900 },
        { id: 'same', deletedAt: 1000 },
        { id: 'new', deletedAt: 800 },
      ]),
    );
    expect(saved.deletedMemoryIds).toEqual([{ id: 'memory', bookId: 'other', deletedAt: 50 }]);
  });

  it('旧页面修改普通设置不会覆写其他页面添加的墓碑或新凭据', async () => {
    const a = useSettingsStore(createPinia());
    const b = useSettingsStore(createPinia());
    await a.loadSettings();
    await b.loadSettings();
    await a.updateGistSync({ secret: 'new-secret', syncParams: { gistId: 'new-gist' } });
    const db = await getDB();
    const tx = db.transaction('sync-configs', 'readwrite');
    await mergeBookDeletionRecords(tx.store, ['deleted'], 100);
    await tx.done;
    await b.updateGistSync({ syncInterval: 12345 });
    const saved = (await db.getAll('sync-configs'))[0]!;
    expect(saved.secret).toBe('new-secret');
    expect(saved.syncParams.gistId).toBe('new-gist');
    expect(saved.syncInterval).toBe(12345);
    expect(saved.deletedNovelIds).toContainEqual({ id: 'deleted', deletedAt: 100 });
  });

  it('普通并发删除两本小说不丢墓碑，事务失败不会先移除 UI 小说', async () => {
    const books = useBooksStore();
    const now = new Date();
    await books.bulkAddBooks(
      ['a', 'b', 'fail'].map((id) => ({ id, title: id, createdAt: now, lastEdited: now })),
    );
    await Promise.all([books.deleteBook('a'), books.deleteBook('b')]);
    const db = await getDB();
    expect(
      (await db.getAll('sync-configs'))[0]?.deletedNovelIds?.map((entry) => entry.id).sort(),
    ).toEqual(['a', 'b']);
    await db.put('book-revisions', { bookId: 'fail', revision: Number.MAX_SAFE_INTEGER });
    await expect(books.deleteBook('fail')).rejects.toThrow();
    expect(await db.get('books', 'fail')).toBeDefined();
    expect(books.books.some((book) => book.id === 'fail')).toBe(true);
    expect(
      (await db.getAll('sync-configs'))[0]?.deletedNovelIds?.some((entry) => entry.id === 'fail'),
    ).toBe(false);
  });

  it('墓碑与调用者使用同一事务，中止时不留下删除传播记录', async () => {
    const db = await getDB();
    const tx = db.transaction('sync-configs', 'readwrite');
    await mergeBookDeletionRecords(tx.store, ['rollback'], 100);
    tx.abort();
    await expect(tx.done).rejects.toThrow();
    expect(await db.count('sync-configs')).toBe(0);
  });
});
