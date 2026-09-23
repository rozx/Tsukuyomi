import { afterEach, describe, expect, it } from 'vitest';
import './setup';
import { deleteDB, openDB } from 'idb';
import { __resetDbPromiseForTesting, getDB } from '../utils/indexed-db';
import { getChapterBaselines, putChapterBaselines } from '../services/sync-chapter-baselines';
import { LibraryPersistence } from '../services/library-persistence';
import type { Novel } from '../models/novel';

const time = new Date('2026-01-01T00:00:00Z');

function book(id: string, chapterIds: string[]): Novel {
  return {
    id,
    title: id,
    createdAt: time,
    lastEdited: time,
    volumes: [
      {
        id: `${id}-v1`,
        title: '卷一',
        chapters: chapterIds.map((cid) => ({
          id: cid,
          title: cid,
          createdAt: time,
          lastEdited: time,
          content: [{ id: `${cid}-p1`, text: '原文', translations: [], selectedTranslationId: '' }],
        })),
      },
    ],
  };
}

afterEach(async () => {
  await __resetDbPromiseForTesting();
});

describe('同步章节结构基准存储', () => {
  it('数据库为 v13，新增基准存储与 by-bookId 索引', async () => {
    const db = await getDB();
    expect(db.version).toBe(13);
    expect(db.objectStoreNames.contains('sync-chapter-baselines')).toBe(true);
    expect(db.transaction('sync-chapter-baselines').store.indexNames.contains('by-bookId')).toBe(
      true,
    );
  });

  it('从 v12 升级保留原有数据', async () => {
    await __resetDbPromiseForTesting();
    await deleteDB('tsukuyomi');
    const old = await openDB('tsukuyomi', 12, {
      upgrade(db) {
        db.createObjectStore('books', { keyPath: 'id' });
        db.createObjectStore('chapter-contents', { keyPath: 'chapterId' });
        db.createObjectStore('book-revisions', { keyPath: 'bookId' });
      },
    });
    const record = { id: 'old', title: '旧书', custom: 'preserve' };
    const chapter = { chapterId: 'c1', content: '[]', lastModified: 'old' };
    await old.put('books', record);
    await old.put('chapter-contents', chapter);
    await old.put('book-revisions', { bookId: 'old', revision: 7 });
    old.close();

    const db = await getDB();
    expect(db.version).toBe(13);
    expect((await db.get('books', 'old')) as unknown).toEqual(record);
    expect(await db.get('chapter-contents', 'c1')).toEqual(chapter);
    expect(await db.get('book-revisions', 'old')).toEqual({ bookId: 'old', revision: 7 });
    expect(await db.count('sync-chapter-baselines')).toBe(0);
  });

  it('写入后按章节读取，覆盖写入以最新为准，未知章节不返回', async () => {
    await putChapterBaselines([
      { chapterId: 'c1', bookId: 'b1', hash: 'h1' },
      { chapterId: 'c2', bookId: 'b1', hash: 'h2' },
    ]);
    await putChapterBaselines([{ chapterId: 'c1', bookId: 'b1', hash: 'h1b' }]);
    const map = await getChapterBaselines(['c1', 'c2', 'missing']);
    expect(map.get('c1')).toBe('h1b');
    expect(map.get('c2')).toBe('h2');
    expect(map.has('missing')).toBe(false);
  });

  it('空列表写入与读取不报错', async () => {
    await putChapterBaselines([]);
    expect((await getChapterBaselines([])).size).toBe(0);
  });
});

describe('删除与清空时清理基准', () => {
  it('删除书籍时删除该书的基准，保留其他书的基准', async () => {
    const db = await getDB();
    await LibraryPersistence.saveBooks(db, [book('b1', ['b1-c1']), book('b2', ['b2-c1'])]);
    await putChapterBaselines([
      { chapterId: 'b1-c1', bookId: 'b1', hash: 'h' },
      { chapterId: 'b2-c1', bookId: 'b2', hash: 'h' },
    ]);
    await LibraryPersistence.deleteBook(db, 'b1');
    const map = await getChapterBaselines(['b1-c1', 'b2-c1']);
    expect(map.has('b1-c1')).toBe(false);
    expect(map.get('b2-c1')).toBe('h');
  });

  it('删除章节时删除这些章节的基准', async () => {
    const db = await getDB();
    await LibraryPersistence.saveBooks(db, [book('b1', ['b1-c1', 'b1-c2'])]);
    await putChapterBaselines([
      { chapterId: 'b1-c1', bookId: 'b1', hash: 'h' },
      { chapterId: 'b1-c2', bookId: 'b1', hash: 'h' },
    ]);
    await LibraryPersistence.deleteChapters(db, 'b1', ['b1-c1']);
    const map = await getChapterBaselines(['b1-c1', 'b1-c2']);
    expect(map.has('b1-c1')).toBe(false);
    expect(map.get('b1-c2')).toBe('h');
  });

  it('清空书库（含快照覆盖路径）时清空全部基准', async () => {
    const db = await getDB();
    await LibraryPersistence.saveBooks(db, [book('b1', ['b1-c1'])]);
    await putChapterBaselines([
      { chapterId: 'b1-c1', bookId: 'b1', hash: 'h' },
      { chapterId: 'orphan', bookId: 'gone', hash: 'h' },
    ]);
    await LibraryPersistence.clear(db, true);
    expect(await db.count('sync-chapter-baselines')).toBe(0);
  });

  it('只清空章节正文时也清空全部基准', async () => {
    const db = await getDB();
    await LibraryPersistence.saveBooks(db, [book('b1', ['b1-c1'])]);
    await putChapterBaselines([{ chapterId: 'b1-c1', bookId: 'b1', hash: 'h' }]);
    await LibraryPersistence.clear(db, false);
    expect(await db.count('sync-chapter-baselines')).toBe(0);
  });
});
