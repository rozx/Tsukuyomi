import { afterEach, beforeEach, describe, it, mock, spyOn } from 'bun:test';
import { expect, vi } from 'vitest';
import './setup';
import { BookSyncService } from '../services/book-sync/book-sync-service';
import * as transport from '../services/scraper/core/page-transport';
import { FirecrawlQuotaError } from '../services/firecrawl/firecrawl-errors';
import { SiteRateLimitedError } from '../services/proxy-fetch-plan';
import {
  syncBook,
  syncRoot,
  syncSnapshot,
  syncCatalogHtml,
  saveSyncBook,
} from './book-sync-fixtures';
import { webLocksFixture } from './web-locks-fixture';

beforeEach(() => vi.stubGlobal('navigator', { locks: webLocksFixture() }));
afterEach(() => {
  mock.restore();
  vi.unstubAllGlobals();
});

/** 需停止整批请求的错误：Firecrawl 额度耗尽、目标站点熔断 */
const HALTS: Array<[string, () => Error]> = [
  ['FIRECRAWL_QUOTA', () => new FirecrawlQuotaError(true)],
  ['FETCH_SITE_RATE_LIMITED', () => new SiteRateLimitedError('example.com', 5)],
];

function pagesWithHaltAt(count: number, haltUrl: string, requests: string[], halt: () => Error) {
  return spyOn(transport, 'fetchScraperPage').mockImplementation((url) => {
    if (url !== syncRoot) requests.push(url);
    if (url === haltUrl) return Promise.reject(halt());
    return Promise.resolve(
      syncSnapshot(url === syncRoot ? syncCatalogHtml(count) : '<article>新正文</article>', url),
    );
  });
}

describe.each(HALTS)('书籍同步遇到 %s 时停止', (code, halt) => {
  it('深度检查：不再抓取剩余章节，记录停止原因，不作废配方', async () => {
    await saveSyncBook(syncBook(6));
    const requests: string[] = [];
    pagesWithHaltAt(6, 'https://example.com/2', requests, halt);
    const session = await BookSyncService.openSession({ target: { bookId: 'book' } });
    await session.quickCheck();

    const result = await session.deepCheck();

    expect(requests).not.toContain('https://example.com/4');
    expect(requests).not.toContain('https://example.com/5');
    expect(requests).not.toContain('https://example.com/6');
    expect(result.status).not.toBe('invalid');
    expect(result.failed).toEqual([
      expect.objectContaining({ url: 'https://example.com/2', code }),
    ]);
    expect(result.unchecked).toEqual(
      expect.arrayContaining(['https://example.com/4', 'https://example.com/5']),
    );
  });

  it('应用：写入已抓取的章节，其余记为同一失败且不再抓取', async () => {
    await saveSyncBook();
    const requests: string[] = [];
    pagesWithHaltAt(6, 'https://example.com/3', requests, halt);
    const session = await BookSyncService.openSession({ target: { bookId: 'book' } });
    await session.quickCheck();

    const result = await session.apply({ urls: session.changeset.new.map((e) => e.url) });

    expect(requests).not.toContain('https://example.com/5');
    expect(requests).not.toContain('https://example.com/6');
    expect(result.status).toBe('partial');
    expect(result.appliedUrls).toEqual(expect.arrayContaining(['https://example.com/2']));
    expect(result.failed.map((f) => f.url).sort()).toEqual([
      'https://example.com/3',
      'https://example.com/5',
      'https://example.com/6',
    ]);
    expect(result.failed.every((f) => f.code === code)).toBe(true);
    expect(session.changeset.status).not.toBe('invalid');
  });
});

describe.each(HALTS)('目录抓取遇到 %s', (code, halt) => {
  it('快速检查直接报错，不把配方标为失效', async () => {
    await saveSyncBook(syncBook(2));
    spyOn(transport, 'fetchScraperPage').mockImplementation(() => Promise.reject(halt()));
    const session = await BookSyncService.openSession({ target: { bookId: 'book' } });
    await expect(session.quickCheck()).rejects.toMatchObject({ code });
    expect(session.changeset.status).not.toBe('invalid');
  });
});
