import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import './setup';
import { openDB, deleteDB } from 'idb';
import {
  __resetDbPromiseForTesting,
  getDB,
  isDbBlocked,
  resetDbForTests,
} from '../utils/indexed-db';

const importStores = [
  'import-tasks',
  'import-sources',
  'import-resources',
  'import-events',
  'import-operations',
  'book-revisions',
] as const;

afterEach(async () => {
  await __resetDbPromiseForTesting();
});

describe('导入数据库 v12', () => {
  it('新建六个 store，按任务分页的索引存在', async () => {
    const db = await getDB();
    expect(db.version).toBeGreaterThanOrEqual(12);
    for (const name of importStores) expect(db.objectStoreNames.contains(name)).toBe(true);
    expect(db.transaction('import-sources').store.indexNames.contains('by-task')).toBe(true);
    expect(db.transaction('import-resources').store.indexNames.contains('by-task')).toBe(true);
    expect(db.transaction('import-events').store.indexNames.contains('by-task-sequence')).toBe(
      true,
    );
  });

  it('从 v11 升级不重写已有小说和正文，完整重置清理导入及序号', async () => {
    await __resetDbPromiseForTesting();
    await deleteDB('tsukuyomi');
    const old = await openDB('tsukuyomi', 11, {
      upgrade(db) {
        db.createObjectStore('books', { keyPath: 'id' });
        db.createObjectStore('chapter-contents', { keyPath: 'chapterId' });
      },
    });
    const book = { id: 'old', title: '旧书', createdAt: 'old timestamp', custom: 'preserve' };
    const chapter = { chapterId: 'c1', content: '[broken but untouched]', lastModified: 'old' };
    await old.put('books', book);
    await old.put('chapter-contents', chapter);
    old.close();
    const db = await getDB();
    expect((await db.get('books', 'old')) as unknown).toEqual(book);
    expect(await db.get('chapter-contents', 'c1')).toEqual(chapter);
    await db.put('book-revisions', { bookId: 'old', revision: 2 });
    await db.put('import-resources', {
      id: 'r1',
      taskId: 't1',
      sourceId: 's1',
      kind: 'input',
      blob: new Blob(['原文']),
      createdAt: 1,
    });
    await resetDbForTests();
    for (const name of importStores) expect(await db.count(name)).toBe(0);
  });

  it('旧标签页阻塞升级时给出状态，关闭后完成升级并清除阻塞状态', async () => {
    await __resetDbPromiseForTesting();
    await deleteDB('tsukuyomi');
    const old = await openDB('tsukuyomi', 11);
    const open = indexedDB.open.bind(indexedDB);
    let onBlocked: () => void = () => undefined;
    const blocked = new Promise<void>((resolve) => {
      onBlocked = resolve;
    });
    const openSpy = spyOn(indexedDB, 'open').mockImplementation((name, version) => {
      const request = open(name, version);
      request.addEventListener('blocked', onBlocked, { once: true });
      return request;
    });
    const upgrading = getDB();
    try {
      // 等待真实 blocked 事件，不能假定一个定时器 tick 后必定已经派发。
      await blocked;
      expect(isDbBlocked()).toBe(true);
    } finally {
      old.close();
      await upgrading;
      openSpy.mockRestore();
    }
    expect(isDbBlocked()).toBe(false);
  });
});
