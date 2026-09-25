import { afterEach, beforeEach, describe, it, mock, spyOn } from 'bun:test';
import { expect, vi } from 'vitest';
import './setup';
import { BookSyncService } from '../services/book-sync/book-sync-service';
import { BookExecutionGuard } from '../services/book-execution-guard';
import { ImportLibraryReader } from '../services/import/import-library-reader';
import { NovelScraperFactory } from '../services/scraper/novel-scraper-factory';
import { FirecrawlQuotaError } from '../services/firecrawl/firecrawl-errors';
import { syncBook, syncSnapshot, saveSyncBook } from './book-sync-fixtures';
import { webLocksFixture } from './web-locks-fixture';

const ROOT = 'https://ncode.syosetu.com/n1234ab/';

beforeEach(() => vi.stubGlobal('navigator', { locks: webLocksFixture() }));
afterEach(() => {
  mock.restore();
  vi.unstubAllGlobals();
});

async function datedBook(remoteText: (url: string) => string) {
  const book = syncBook(2);
  delete book.updateRecipe;
  book.webUrl = [ROOT];
  book.volumes![0]!.chapters!.forEach((c, i) => {
    c.webUrl = `${ROOT}${i + 1}/`;
    c.lastUpdated = new Date('2026-09-20');
  });
  await saveSyncBook(book);
  const scraper = NovelScraperFactory.getScraper(ROOT)!;
  spyOn(scraper, 'parseNovelSnapshot').mockReturnValue({
    catalogStartUrl: ROOT,
    nextPageUrls: [],
    info: {
      title: '远端',
      webUrl: ROOT,
      chapters: [
        { title: '第一话', url: `${ROOT}1/`, lastUpdated: new Date('2026-09-21') },
        { title: '第二话', url: `${ROOT}2/`, lastUpdated: new Date('2026-09-22') },
      ],
    },
  });
  const fetch = spyOn(scraper, 'fetchPageSnapshot').mockImplementation((url) =>
    Promise.resolve(syncSnapshot(url, url)),
  );
  spyOn(scraper, 'parseChapterSnapshot').mockImplementation((html: string) => {
    const text = remoteText(html);
    return { text, paragraphs: [text] };
  });
  return { book, fetch };
}

async function chapterDates(): Promise<Record<string, string | undefined>> {
  const read = await ImportLibraryReader.readBook('book');
  if (read.kind !== 'loaded') throw new Error('读取失败');
  return Object.fromEntries(
    (read.book.volumes?.[0]?.chapters ?? []).map((c) => [
      c.id,
      c.lastUpdated ? new Date(c.lastUpdated).toISOString().slice(0, 10) : undefined,
    ]),
  );
}

describe('逐章比对确认正文未变的章节后记录远端日期', () => {
  it('未变章节写入远端日期，下次快速检查按日期判断无变化；有修订的章节保持原日期', async () => {
    const { fetch } = await datedBook((url) => (url.endsWith('1/') ? '旧正文' : '新正文'));

    const session = await BookSyncService.openSession({ target: { bookId: 'book' } });
    await session.quickCheck();
    const deep = await session.deepCheck();
    expect(deep.updated.map((e) => e.chapterId)).toEqual(['c2']);
    expect(await chapterDates()).toEqual({ c1: '2026-09-21', c2: '2026-09-20' });

    fetch.mockClear();
    const second = await (await BookSyncService.openSession({ target: { bookId: 'book' } })).quickCheck();
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([ROOT]);
    expect(second.dateUnchanged).toEqual([`${ROOT}1/`]);
    expect(second.dateNewer).toEqual([`${ROOT}2/`]);
  });

  it('书籍被占用时不写入日期，比对照常完成', async () => {
    await datedBook(() => '旧正文');
    const session = await BookSyncService.openSession({ target: { bookId: 'book' } });
    await session.quickCheck();
    let result;
    await BookExecutionGuard.write('book', { label: '整章翻译' }, async () => {
      result = await session.deepCheck();
    });
    expect(result!.status).toBe('ready');
    expect(await chapterDates()).toEqual({ c1: '2026-09-20', c2: '2026-09-20' });
  });

  it('快速检查不抓正文：日期较新的章节列为待比对（不算作「没有日期」）', async () => {
    const { fetch } = await datedBook(() => '旧正文');
    const result = await (await BookSyncService.openSession({ target: { bookId: 'book' } })).quickCheck();
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([ROOT]);
    expect(result.dateNewer).toEqual([`${ROOT}1/`, `${ROOT}2/`]);
    expect(result.dateUnchanged).toEqual([]);
  });

  it('逐章比对因额度中断时，未比对的章节仍列为日期较新待比对', async () => {
    const { fetch } = await datedBook(() => '旧正文');
    fetch.mockImplementation((url) =>
      url === ROOT
        ? Promise.resolve(syncSnapshot(url, url))
        : Promise.reject(new FirecrawlQuotaError(true)),
    );
    const session = await BookSyncService.openSession({ target: { bookId: 'book' } });
    await session.quickCheck();
    const result = await session.deepCheck();
    expect(result.dateNewer).toEqual(expect.arrayContaining([`${ROOT}1/`, `${ROOT}2/`]));
  });
});

describe('已抓取章节正文在 30 分钟内跨检查会话复用', () => {
  it('30 分钟内再次逐章比对不重新抓取正文，超过后重新抓取', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-25T00:00:00Z'));
    const { fetch } = await datedBook(() => '新正文');
    const deepCheck = async () => {
      const session = await BookSyncService.openSession({ target: { bookId: 'book' } });
      await session.quickCheck();
      return session.deepCheck();
    };
    await deepCheck();
    expect(fetch.mock.calls.map((c) => c[0]).sort()).toEqual([ROOT, `${ROOT}1/`, `${ROOT}2/`]);

    fetch.mockClear();
    vi.setSystemTime(new Date('2026-09-25T00:29:00Z'));
    const cached = await deepCheck();
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([ROOT]);
    expect(cached.updated.map((e) => e.chapterId).sort()).toEqual(['c1', 'c2']);

    fetch.mockClear();
    vi.setSystemTime(new Date('2026-09-25T00:31:00Z'));
    await deepCheck();
    expect(fetch.mock.calls.map((c) => c[0]).sort()).toEqual([ROOT, `${ROOT}1/`, `${ROOT}2/`]);
    vi.useRealTimers();
  });
});

describe('跨会话缓存按目录更新时间区分版本', () => {
  it('缓存期内目录日期变新的章节重新抓取，未变的仍用缓存', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-25T00:00:00Z'));
    const { fetch } = await datedBook(() => '新正文');
    const deep = async () => {
      const session = await BookSyncService.openSession({ target: { bookId: 'book' } });
      await session.quickCheck();
      return session.deepCheck();
    };
    await deep();

    const scraper = NovelScraperFactory.getScraper(ROOT)!;
    spyOn(scraper, 'parseNovelSnapshot').mockReturnValue({
      catalogStartUrl: ROOT,
      nextPageUrls: [],
      info: {
        title: '远端',
        webUrl: ROOT,
        chapters: [
          { title: '第一话', url: `${ROOT}1/`, lastUpdated: new Date('2026-09-24') },
          { title: '第二话', url: `${ROOT}2/`, lastUpdated: new Date('2026-09-22') },
        ],
      },
    });
    fetch.mockClear();
    vi.setSystemTime(new Date('2026-09-25T00:10:00Z'));
    await deep();
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([ROOT, `${ROOT}1/`]);
    vi.useRealTimers();
  });
});

