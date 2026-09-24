import { afterEach, describe, it, mock, spyOn } from 'bun:test';
import { expect, vi } from 'vitest';
import './setup';
import { BookSyncService } from '../services/book-sync/book-sync-service';
import * as transport from '../services/scraper/core/page-transport';
import { NovelScraperFactory } from '../services/scraper/novel-scraper-factory';
import { deferred, webLocksFixture } from './web-locks-fixture';
import {
  syncBook,
  syncRoot,
  syncSnapshot,
  syncCatalogHtml,
  saveSyncBook,
  syncRecipe,
} from './book-sync-fixtures';

afterEach(() => {
  mock.restore();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('书籍同步检查会话', () => {
  it('HTML 快速检查只取目录，区分新章节和跳过，已有正文未检查', async () => {
    const book = syncBook();
    book.updateRecipe!.skippedUrls = [{ url: 'https://example.com/3', title: '第三话' }];
    await saveSyncBook(book);
    const fetch = spyOn(transport, 'fetchScraperPage').mockImplementation((url) =>
      Promise.resolve(syncSnapshot(syncCatalogHtml(3), url)),
    );
    const session = await BookSyncService.openSession({ target: { bookId: book.id } });
    const result = await session.quickCheck();
    expect(result.new.map((e) => e.url)).toEqual(['https://example.com/2']);
    expect(result.skipped.map((e) => e.url)).toEqual(['https://example.com/3']);
    expect(result.unchecked).toEqual(['https://example.com/1']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('内置日期候选仅抓取较新的章节并用正文确认', async () => {
    const book = syncBook(2);
    delete book.updateRecipe;
    book.webUrl = ['https://ncode.syosetu.com/n1234ab/'];
    book.volumes![0]!.chapters!.forEach((c, i) => {
      c.webUrl = book.webUrl![0] + `${i + 1}/`;
      c.lastUpdated = new Date('2026-09-20');
    });
    await saveSyncBook(book);
    const scraper = NovelScraperFactory.getScraper(book.webUrl[0]!)!;
    spyOn(scraper, 'parseNovelSnapshot').mockReturnValue({
      catalogStartUrl: book.webUrl[0]!,
      nextPageUrls: [],
      info: {
        title: '远端',
        webUrl: book.webUrl[0]!,
        chapters: [
          { title: '第一话', url: book.webUrl[0] + '1/', lastUpdated: new Date('2026-09-21') },
          { title: '第二话', url: book.webUrl[0] + '2/', lastUpdated: new Date('2026-09-20') },
        ],
      },
    });
    const fetch = spyOn(scraper, 'fetchPageSnapshot').mockImplementation((url) =>
      Promise.resolve(syncSnapshot('<article>原文</article>', url)),
    );
    spyOn(scraper, 'parseChapterSnapshot').mockReturnValue({
      text: '新正文',
      paragraphs: ['新正文'],
    });
    const session = await BookSyncService.openSession({ target: { bookId: book.id } });
    expect((await session.quickCheck()).updated.map((e) => e.chapterId)).toEqual(['c1']);
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([book.webUrl[0]!, book.webUrl[0] + '1/']);
  });
  it('深度检查最多三路并发，取消保留已完成结果且固定章节从不请求', async () => {
    const book = syncBook(6);
    book.updateRecipe!.pinnedUrls = ['https://example.com/6'];
    await saveSyncBook(book);
    const requests: string[] = [];
    const gates = Array.from({ length: 6 }, () => deferred<string>());
    let active = 0;
    let maximum = 0;
    spyOn(transport, 'fetchScraperPage').mockImplementation(async (url, options) => {
      if (url === syncRoot) return syncSnapshot(syncCatalogHtml(6), url);
      requests.push(url);
      active++;
      maximum = Math.max(maximum, active);
      const gate = gates[Number(new URL(url).pathname.slice(1)) - 1]!;
      options?.signal?.addEventListener(
        'abort',
        () => gate.reject(new DOMException('取消', 'AbortError')),
        { once: true },
      );
      try {
        return syncSnapshot(await gate.promise, url);
      } finally {
        active--;
      }
    });
    const session = await BookSyncService.openSession({ target: { bookId: 'book' } });
    await session.quickCheck();
    vi.useFakeTimers();
    const controller = new AbortController();
    const progress: number[] = [];
    const pending = session.deepCheck({
      signal: controller.signal,
      onProgress: (done) => {
        progress.push(done);
        if (done === 1) controller.abort();
      },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(3);
    gates[0]!.resolve('<article>新正文</article>');
    await vi.advanceTimersByTimeAsync(10);
    const result = await pending;
    expect(maximum).toBe(3);
    expect(requests).toHaveLength(3);
    expect(result.status).toBe('cancelled');
    expect(result.updated.map((e) => e.chapterId)).toEqual(['c1']);
    expect(result.unchecked).toHaveLength(4);
    expect(progress).toEqual([1]);
    expect(requests).not.toContain('https://example.com/6');
  });
  it('正文为空属于配方失效，清除先前比对结果', async () => {
    await saveSyncBook(syncBook(2));
    spyOn(transport, 'fetchScraperPage').mockImplementation((url) =>
      Promise.resolve(
        syncSnapshot(
          url === syncRoot
            ? syncCatalogHtml(2)
            : url.endsWith('/1')
              ? '<article>新正文</article>'
              : '<article></article>',
          url,
        ),
      ),
    );
    const session = await BookSyncService.openSession({ target: { bookId: 'book' } });
    await session.quickCheck();
    const result = await session.deepCheck();
    expect(result.status).toBe('invalid');
    expect(result.updated).toEqual([]);
    expect(result.new).toEqual([]);
    expect(result.failed[0]?.code).toBe('CONTENT_EMPTY');
  });
  it('预览同一网址共用正在进行的请求和结果，调用方不能改坏缓存', async () => {
    await saveSyncBook();
    const fetch = spyOn(transport, 'fetchScraperPage').mockImplementation((url) =>
      Promise.resolve(
        syncSnapshot(url === syncRoot ? syncCatalogHtml(2) : '<article>远端</article>', url),
      ),
    );
    const session = await BookSyncService.openSession({ target: { bookId: 'book' } });
    await session.quickCheck();
    const [first, second] = await Promise.all([
      session.preview('https://example.com/2'),
      session.preview('https://example.com/2'),
    ]);
    first[0] = '不应进入缓存';
    expect(second).toEqual(['远端']);
    expect(await session.preview('https://example.com/2')).toEqual(['远端']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

it('同一会话再次快速检查读取最新跳过设置', async () => {
  vi.stubGlobal('navigator', { locks: (await import('./web-locks-fixture')).webLocksFixture() });
  try {
    await saveSyncBook();
    spyOn(transport, 'fetchScraperPage').mockImplementation((url) =>
      Promise.resolve(syncSnapshot(syncCatalogHtml(2), url)),
    );
    const value = await BookSyncService.openSession({ target: { bookId: 'book' } });
    await value.quickCheck();
    await BookSyncService.setSkipped(
      'book',
      [{ url: 'https://example.com/2', title: '第二话' }],
      true,
    );
    const result = await value.quickCheck();
    expect(result.new).toEqual([]);
    expect(result.skipped.map((e) => e.url)).toEqual(['https://example.com/2']);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('预览已导入章节遇到空正文会使整份变更集失效', async () => {
  await saveSyncBook();
  spyOn(transport, 'fetchScraperPage').mockImplementation((url) =>
    Promise.resolve(
      syncSnapshot(url === syncRoot ? syncCatalogHtml(2) : '<article></article>', url),
    ),
  );
  const value = await BookSyncService.openSession({ target: { bookId: 'book' } });
  await value.quickCheck();
  await expect(value.preview('https://example.com/1')).rejects.toThrow('CONTENT_EMPTY');
  expect(value.changeset.status).toBe('invalid');
  expect(value.changeset.new).toEqual([]);
});

describe('会话内跳过与取消跳过', () => {
  it('已有书籍跳过后写入配方并重新分类，保留深度检查结果', async () => {
    vi.stubGlobal('navigator', { locks: webLocksFixture() });
    const book = syncBook(1);
    await saveSyncBook(book);
    spyOn(transport, 'fetchScraperPage').mockImplementation((url) =>
      Promise.resolve(
        url === syncRoot
          ? syncSnapshot(syncCatalogHtml(3), url)
          : syncSnapshot('<article>新正文</article>', url),
      ),
    );
    const session = await BookSyncService.openSession({ target: { bookId: book.id } });
    await session.quickCheck();
    expect((await session.deepCheck()).updated.map((e) => e.url)).toEqual([
      'https://example.com/1',
    ]);

    const skipped = await session.setSkipped(
      [{ url: 'https://example.com/3', title: '第3话' }],
      true,
    );
    expect(skipped.new.map((e) => e.url)).toEqual(['https://example.com/2']);
    expect(skipped.skipped.map((e) => e.url)).toEqual(['https://example.com/3']);
    expect(skipped.updated.map((e) => e.url)).toEqual(['https://example.com/1']);

    const reopened = await BookSyncService.openSession({ target: { bookId: book.id } });
    expect((await reopened.quickCheck()).skipped.map((e) => e.url)).toEqual([
      'https://example.com/3',
    ]);

    const restored = await session.setSkipped(
      [{ url: 'https://example.com/3', title: '第3话' }],
      false,
    );
    expect(restored.new.map((e) => e.url)).toEqual([
      'https://example.com/2',
      'https://example.com/3',
    ]);
    expect(restored.skipped).toEqual([]);
  });

  it('新建书籍跳过只记在会话内，应用时写入配方的跳过列表', async () => {
    spyOn(transport, 'fetchScraperPage').mockImplementation((url) =>
      Promise.resolve(
        url === syncRoot
          ? syncSnapshot(syncCatalogHtml(2), url)
          : syncSnapshot('<article>正文</article>', url),
      ),
    );
    const session = await BookSyncService.openSession({
      target: { newFrom: syncRoot },
      recipe: structuredClone(syncRecipe),
    });
    await session.quickCheck();
    const changes = await session.setSkipped(
      [{ url: 'https://example.com/2', title: '第2话' }],
      true,
    );
    expect(changes.new.map((e) => e.url)).toEqual(['https://example.com/1']);
    expect(changes.skipped.map((e) => e.url)).toEqual(['https://example.com/2']);
    const unskipped = await session.setSkipped(
      [{ url: 'https://example.com/2', title: '第2话' }],
      false,
    );
    expect(unskipped.new.map((e) => e.url)).toEqual([
      'https://example.com/1',
      'https://example.com/2',
    ]);
  });

  it('尚未检查目录时拒绝跳过', async () => {
    await saveSyncBook(syncBook(1));
    const session = await BookSyncService.openSession({ target: { bookId: 'book' } });
    await expect(
      session.setSkipped([{ url: 'https://example.com/2', title: '第2话' }], true),
    ).rejects.toThrow('CHECK_REQUIRED');
  });
});

describe('已比对章节记录', () => {
  it('深度检查记录已比对的已导入章节，未变化的也计入', async () => {
    const book = syncBook(3);
    await saveSyncBook(book);
    spyOn(transport, 'fetchScraperPage').mockImplementation((url) =>
      Promise.resolve(
        url === syncRoot
          ? syncSnapshot(syncCatalogHtml(3), url)
          : syncSnapshot(
              url.endsWith('/1') ? '<article>新正文</article>' : '<article>旧正文</article>',
              url,
            ),
      ),
    );
    const session = await BookSyncService.openSession({ target: { bookId: book.id } });
    expect((await session.quickCheck()).checked).toEqual([]);
    const result = await session.deepCheck();
    expect([...result.checked].sort()).toEqual([
      'https://example.com/1',
      'https://example.com/2',
      'https://example.com/3',
    ]);
    expect(result.updated.map((e) => e.url)).toEqual(['https://example.com/1']);
  });
});
