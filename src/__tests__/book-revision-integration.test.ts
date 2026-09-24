import { afterEach, beforeEach, describe, it, mock, spyOn } from 'bun:test';
import { expect } from 'vitest';
import './setup';
import { BookService } from '../services/book-service';
import { SyncDataService } from '../services/sync-data-service';
import { ImportRepository } from '../services/import/import-repository';
import { getDB, migrateFromLocalStorage, resetDbForTests } from '../utils/indexed-db';
import { useBooksStore } from '../stores/books';
import { useSettingsStore } from '../stores/settings';
import * as debouncer from '../utils/chapter-embedding-debouncer';
import type { Novel } from '../models/novel';

function novel(title: string, edited = '2026-01-01T00:00:00Z'): Novel {
  return {
    id: 'book',
    title,
    lastEdited: new Date(edited),
    createdAt: new Date('2025-01-01T00:00:00Z'),
    volumes: [
      {
        id: 'v',
        title: '卷',
        chapters: [
          {
            id: 'c',
            title: '章',
            lastEdited: new Date(edited),
            createdAt: new Date(edited),
            content: [{ id: 'p', text: title, translations: [], selectedTranslationId: '' }],
          },
        ],
      },
    ],
  };
}
async function revision() {
  return (await (await getDB()).get('book-revisions', 'book'))?.revision ?? 0;
}

beforeEach(() => {
  spyOn(debouncer, 'markChapterDirty').mockImplementation(() => undefined);
});
afterEach(() => mock.restore());

describe('书籍序号覆盖实际同步和恢复入口', () => {
  it('localStorage 迁移也更新序号，并把正文保存到独立存储', async () => {
    await BookService.saveBook(novel('已有小说'));
    const before = await revision();
    localStorage.setItem('tsukuyomi-books', JSON.stringify([novel('迁移内容')]));
    await migrateFromLocalStorage();
    expect(await revision()).toBeGreaterThan(before);
    const db = await getDB();
    expect((await db.get('chapter-contents', 'c'))?.content).toContain('迁移内容');
    expect((await db.get('books', 'book'))?.volumes?.[0]?.chapters?.[0]?.content).toBeUndefined();
    expect(localStorage.getItem('tsukuyomi-books')).toBeNull();
  });

  it('真实同步下载和历史快照恢复都会使旧序号失效，不删除导入任务', async () => {
    const books = useBooksStore();
    await useSettingsStore().loadSettings();
    await books.bulkAddBooks([novel('原书')]);
    const task = await ImportRepository.createTask();
    const before = await revision();
    const failures = await SyncDataService.applyPartialRemoteData({
      'novel:book': { kind: 'novel', value: novel('远端新标题', '2026-02-01T00:00:00Z') },
    });
    expect(failures).toEqual([]);
    expect(await revision()).toBeGreaterThan(before);
    expect((await BookService.getBookById('book'))?.title).toBe('远端新标题');
    const afterSync = await revision();
    await SyncDataService.overwriteFromSnapshot({ novels: [novel('恢复旧快照')] });
    expect(await revision()).toBeGreaterThan(afterSync);
    expect((await BookService.getBookById('book'))?.title).toBe('恢复旧快照');
    expect(await ImportRepository.getTask(task.id)).toBeDefined();
  });

  it('完整工作区重置同时清理导入和修改序号', async () => {
    await BookService.saveBook(novel('原书'));
    const task = await ImportRepository.createTask();
    await resetDbForTests();
    expect(await ImportRepository.getTask(task.id)).toBeUndefined();
    expect(await revision()).toBe(0);
    expect(await BookService.getBookById('book')).toBeUndefined();
  });
});
