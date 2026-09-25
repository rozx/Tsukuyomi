import { afterEach, beforeEach, describe, it, mock, spyOn } from 'bun:test';
import { expect, vi } from 'vitest';
import './setup';
import { BookSyncService } from '../services/book-sync/book-sync-service';
import { BookExecutionGuard } from '../services/book-execution-guard';
import { bookCommitBus } from '../services/book-commit-notifications';
import { LibraryPersistence } from '../services/library-persistence';
import { ImportLibraryReader } from '../services/import/import-library-reader';
import { getDB } from '../utils/indexed-db';
import * as transport from '../services/scraper/core/page-transport';
import {
  syncBook,
  syncRecipe,
  syncRoot,
  syncSnapshot,
  syncCatalogHtml,
  syncParagraph,
  saveSyncBook,
} from './book-sync-fixtures';
import { webLocksFixture } from './web-locks-fixture';

beforeEach(() => vi.stubGlobal('navigator', { locks: webLocksFixture() }));
afterEach(() => {
  mock.restore();
  vi.unstubAllGlobals();
});
function pages(count = 2, fail = '') {
  return spyOn(transport, 'fetchScraperPage').mockImplementation((url) => {
    if (url === fail) throw new Error('网页超时');
    return Promise.resolve(
      syncSnapshot(url === syncRoot ? syncCatalogHtml(count) : '<article>新正文</article>', url),
    );
  });
}
async function session(count = 2, fail = '') {
  await saveSyncBook();
  const fetch = pages(count, fail);
  const value = await BookSyncService.openSession({ target: { bookId: 'book' } });
  await value.quickCheck();
  return { value, fetch };
}

describe('同步受保护应用', () => {
  it('占用时在抓取前拒绝并返回占用者标签', async () => {
    const { value, fetch } = await session();
    await BookExecutionGuard.write('book', { label: '整章翻译' }, async () => {
      await expect(value.apply({ urls: ['https://example.com/2'] })).rejects.toThrow('整章翻译');
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('预览后应用复用缓存，覆盖目标卷且保留书籍元信息，广播已提交序号', async () => {
    const { value, fetch } = await session();
    const notice = spyOn(bookCommitBus, 'publish').mockResolvedValue(undefined);
    const before = await value.preview('https://example.com/2');
    const key = value.changeset.new[0]!.groupKey;
    const result = await value.apply({
      urls: ['https://example.com/2'],
      volumeOverrides: new Map([[key, { newTitle: '指定新卷' }]]),
    });
    expect(result.status).toBe('success');
    expect(fetch).toHaveBeenCalledTimes(2);
    const read = await ImportLibraryReader.readBook('book');
    if (read.kind !== 'loaded') throw new Error('读取失败');
    expect(read.book.title).toBe('本地书名');
    expect(read.book.description).toBe('本地简介');
    expect(read.book.volumes?.[1]?.title).toBe('指定新卷');
    const added = read.book.volumes?.[1]?.chapters?.[0];
    expect(added?.originalContent).toBe(before.join('\n'));
    expect(added?.webUrl).toBe('https://example.com/2');
    expect(read.revision).toBe(2);
    expect(notice).toHaveBeenCalledWith({ bookId: 'book', revision: 2, chapterIds: [added!.id] });
    expect((await value.quickCheck()).new).toEqual([]);
  });
  it('新章节 5 章中 1 章失败仅写入成功四章，网络请求发生在锁外', async () => {
    const { value, fetch } = await session(6, 'https://example.com/5');
    const original = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, options) => {
      expect((await navigator.locks.query()).held).toHaveLength(0);
      return original(url, options);
    });
    const result = await value.apply({ urls: value.changeset.new.map((e) => e.url) });
    expect(result).toMatchObject({ status: 'partial', failed: [{ url: 'https://example.com/5' }] });
    expect(result.appliedUrls).toHaveLength(4);
    const read = await ImportLibraryReader.readBook('book');
    if (read.kind !== 'loaded') throw new Error('读取失败');
    expect(read.book.volumes?.[0]?.chapters).toHaveLength(5);
    expect(value.changeset.failed[0]?.url).toBe('https://example.com/5');
    fetch.mockImplementation((url) =>
      Promise.resolve(syncSnapshot('<article>重试成功</article>', url)),
    );
    expect((await value.apply({ urls: ['https://example.com/5'] })).status).toBe('success');
  });
  it('版本变化拒绝提交并以缓存重算，保留新增译文', async () => {
    const { value, fetch } = await session();
    await value.deepCheck();
    const db = await getDB();
    const changed = syncParagraph();
    changed.translations.push({ id: 't2', translation: '后加译文', aiModelId: 'm' });
    await LibraryPersistence.saveChapter(db, 'book', 'c1', [changed]);
    await expect(value.apply({ urls: ['https://example.com/1'] })).rejects.toThrow('BOOK_CHANGED');
    expect(value.changeset.baseRevision).toBe(2);
    expect(value.changeset.updated[0]?.clearedVersions).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    const read = await ImportLibraryReader.readChapter('c1');
    expect(read).toMatchObject({
      kind: 'loaded',
      content: [{ translations: [{ id: 't' }, { id: 't2' }] }],
    });
  });
  it('旧正文损坏时拒绝整个提交，序号和书籍不变', async () => {
    const { value } = await session();
    await value.deepCheck();
    const db = await getDB();
    await db.put('chapter-contents', {
      chapterId: 'c1',
      bookId: 'book',
      content: '{broken',
      lastModified: 'now',
    });
    await expect(
      value.apply({ urls: ['https://example.com/1', 'https://example.com/2'] }),
    ).rejects.toThrow('BOOK_READ_FAILED');
    expect((await db.get('book-revisions', 'book'))?.revision).toBe(1);
    expect((await db.get('books', 'book'))?.volumes?.[0]?.chapters).toHaveLength(1);
  });
  it('只导前 50 话创建书籍，未选章节进入跳过列表并返回封面', async () => {
    pages(100);
    const value = await BookSyncService.openSession({
      target: { newFrom: syncRoot },
      recipe: syncRecipe,
    });
    await value.quickCheck();
    const result = await value.apply({ urls: value.changeset.new.slice(0, 50).map((e) => e.url) });
    const read = await ImportLibraryReader.readBook(result.bookId);
    if (read.kind !== 'loaded') throw new Error('读取失败');
    expect(read.book.title).toBe('远端书名');
    expect(read.book.volumes?.[0]?.chapters).toHaveLength(50);
    expect(read.book.updateRecipe?.skippedUrls).toHaveLength(50);
    expect(result.cover).toEqual({ url: 'https://example.com/cover.jpg' });
  });
});

describe('同步撤销与跳过', () => {
  it('立即撤销恢复书籍记录和懒加载的全部译文', async () => {
    const { value } = await session();
    const db = await getDB();
    const bookBefore = await db.get('books', 'book');
    const chapterBefore = await db.get('chapter-contents', 'c1');
    await value.deepCheck();
    await value.apply({ urls: ['https://example.com/1', 'https://example.com/2'] });
    await value.undo();
    expect(await db.get('books', 'book')).toEqual(bookBefore);
    expect(await db.get('chapter-contents', 'c1')).toEqual(chapterBefore);
    expect(await db.count('chapter-contents')).toBe(1);
    expect((await db.get('book-revisions', 'book'))?.revision).toBe(3);
    await expect(value.undo()).rejects.toThrow('UNDO_UNAVAILABLE');
  });
  it('应用后翻译过的书拒绝撤销，占用者同样会阻止撤销', async () => {
    const { value } = await session();
    await value.apply({ urls: ['https://example.com/2'] });
    await BookExecutionGuard.write('book', { label: '译文保存中' }, async () => {
      await expect(value.undo()).rejects.toThrow('译文保存中');
    });
    await LibraryPersistence.saveChapter(await getDB(), 'book', 'c1', [syncParagraph('后续修改')]);
    await expect(value.undo()).rejects.toThrow('BOOK_CHANGED');
    const book = await ImportLibraryReader.readBook('book');
    if (book.kind !== 'loaded') throw new Error('读取失败');
    expect(book.book.volumes?.[0]?.chapters).toHaveLength(2);
  });
  it('新书撤销删除书籍和正文，修改序号仍递增', async () => {
    pages(2);
    const value = await BookSyncService.openSession({
      target: { newFrom: syncRoot },
      recipe: syncRecipe,
    });
    await value.quickCheck();
    const result = await value.apply({ urls: ['https://example.com/1'] });
    await value.undo();
    const db = await getDB();
    expect(await db.get('books', result.bookId)).toBeUndefined();
    expect(await db.count('chapter-contents')).toBe(0);
    expect((await db.get('book-revisions', result.bookId))?.revision).toBe(2);
    expect(value.changeset.new).toHaveLength(2);
  });
  it('虚拟配方跳过时才落地，每次跳过或取消都递增序号', async () => {
    const book = syncBook(0);
    delete book.updateRecipe;
    book.webUrl = ['https://ncode.syosetu.com/n1234ab/'];
    await saveSyncBook(book);
    const entries = [{ url: book.webUrl[0] + '1/', title: '第一话' }];
    expect(await BookSyncService.setSkipped('book', entries, true)).toBe(2);
    const db = await getDB();
    expect((await db.get('books', 'book'))?.updateRecipe).toMatchObject({
      engine: { kind: 'builtin', site: 'ncode' },
      skippedUrls: entries,
    });
    expect(await BookSyncService.setSkipped('book', entries, false)).toBe(3);
    expect((await db.get('books', 'book'))?.updateRecipe?.skippedUrls).toEqual([]);
  });
  it('导入已跳过章节后从配方跳过列表移除，可指定已有卷', async () => {
    const book = syncBook();
    book.updateRecipe!.skippedUrls = [{ url: 'https://example.com/2', title: '第二话' }];
    await saveSyncBook(book);
    pages();
    const value = await BookSyncService.openSession({ target: { bookId: 'book' } });
    await value.quickCheck();
    await value.apply({ urls: ['https://example.com/2'] });
    expect((await (await getDB()).get('books', 'book'))?.updateRecipe?.skippedUrls).toEqual([]);
  });
});

it('内置更新保存远端时间，下一次快速检查不再抓同章，虚拟配方不落地', async () => {
  const { NovelScraperFactory } = await import('../services/scraper/novel-scraper-factory');
  const book = syncBook();
  const root = 'https://ncode.syosetu.com/n1234ab/';
  delete book.updateRecipe;
  book.webUrl = [root];
  book.volumes![0]!.chapters![0]!.webUrl = root + '1/';
  await saveSyncBook(book);
  const scraper = NovelScraperFactory.getScraper(root)!;
  spyOn(scraper, 'parseNovelSnapshot').mockReturnValue({
    catalogStartUrl: root,
    nextPageUrls: [],
    info: {
      title: '远端',
      webUrl: root,
      chapters: [{ title: '第一话', url: root + '1/', lastUpdated: new Date('2026-09-22') }],
    },
  });
  const fetch = spyOn(scraper, 'fetchPageSnapshot').mockImplementation((url) =>
    Promise.resolve(syncSnapshot('<article>本文</article>', url)),
  );
  spyOn(scraper, 'parseChapterSnapshot').mockReturnValue({
    text: '新正文',
    paragraphs: ['新正文'],
  });
  const value = await BookSyncService.openSession({ target: { bookId: 'book' } });
  await value.quickCheck();
  await value.deepCheck();
  await value.apply({ urls: [root + '1/'] });
  fetch.mockClear();
  const next = await BookSyncService.openSession({ target: { bookId: 'book' } });
  const again = await next.quickCheck();
  expect(again.updated).toEqual([]);
  expect(again.dateNewer).toEqual([]);
  expect(again.dateUnchanged).toEqual([root + '1/']);
  expect(fetch.mock.calls.map((c) => c[0])).toEqual([root]);
  const saved = await (await getDB()).get('books', 'book');
  expect(saved?.updateRecipe).toBeUndefined();
  expect(saved?.volumes?.[0]?.chapters?.[0]).toMatchObject({
    originalContent: '新正文',
    webUrl: root + '1/',
    lastUpdated: '2026-09-22T00:00:00.000Z',
  });
});

it('已有卷覆盖优先于推断，不创建额外卷', async () => {
  const book = syncBook();
  book.volumes!.push({ id: 'other', title: '指定卷', chapters: [] });
  await saveSyncBook(book);
  pages();
  const value = await BookSyncService.openSession({ target: { bookId: 'book' } });
  await value.quickCheck();
  const key = value.changeset.new[0]!.groupKey;
  await value.apply({
    urls: ['https://example.com/2'],
    volumeOverrides: new Map([[key, { volumeId: 'other' }]]),
  });
  const saved = await (await getDB()).get('books', 'book');
  expect(saved?.volumes).toHaveLength(2);
  expect(saved?.volumes?.[1]?.chapters?.[0]?.webUrl).toBe('https://example.com/2');
});

it('事务提交后刷新失败仍返回应用成功并保留撤销能力', async () => {
  const { value } = await session();
  const read = spyOn(ImportLibraryReader, 'readBook').mockResolvedValue({
    kind: 'failed',
    message: '读取暂时失败',
  });
  const result = await value.apply({ urls: ['https://example.com/2'] });
  expect(result.status).toBe('success');
  expect(value.changeset.status).toBe('invalid');
  read.mockRestore();
  await value.undo();
  expect((await (await getDB()).get('books', 'book'))?.volumes?.[0]?.chapters).toHaveLength(1);
});
