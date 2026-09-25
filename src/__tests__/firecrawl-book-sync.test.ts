import { afterEach, beforeEach, describe, it, mock, spyOn } from 'bun:test';
import { expect, vi } from 'vitest';
import './setup';
import { BookSyncService } from '../services/book-sync/book-sync-service';
import * as transport from '../services/scraper/core/page-transport';
import { FirecrawlQuotaError } from '../services/firecrawl/firecrawl-errors';
import { syncBook, syncRoot, syncSnapshot, syncCatalogHtml, saveSyncBook } from './book-sync-fixtures';
import { webLocksFixture } from './web-locks-fixture';

beforeEach(() => vi.stubGlobal('navigator', { locks: webLocksFixture() }));
afterEach(() => {
  mock.restore();
  vi.unstubAllGlobals();
});

function pagesWithQuotaAt(count: number, quotaUrl: string, requests: string[]) {
  return spyOn(transport, 'fetchScraperPage').mockImplementation((url) => {
    if (url !== syncRoot) requests.push(url);
    if (url === quotaUrl) return Promise.reject(new FirecrawlQuotaError(true));
    return Promise.resolve(
      syncSnapshot(url === syncRoot ? syncCatalogHtml(count) : '<article>新正文</article>', url),
    );
  });
}

describe('书籍同步遇到 Firecrawl 额度耗尽时停止', () => {
  it('深度检查：不再抓取剩余章节，记录额度失败，不作废配方', async () => {
    await saveSyncBook(syncBook(6));
    const requests: string[] = [];
    pagesWithQuotaAt(6, 'https://example.com/2', requests);
    const session = await BookSyncService.openSession({ target: { bookId: 'book' } });
    await session.quickCheck();

    const result = await session.deepCheck();

    expect(requests).not.toContain('https://example.com/4');
    expect(requests).not.toContain('https://example.com/5');
    expect(requests).not.toContain('https://example.com/6');
    expect(result.status).not.toBe('invalid');
    expect(result.failed).toEqual([
      expect.objectContaining({ url: 'https://example.com/2', code: 'FIRECRAWL_QUOTA' }),
    ]);
    expect(result.unchecked).toEqual(
      expect.arrayContaining(['https://example.com/4', 'https://example.com/5']),
    );
  });

  it('应用：写入已抓取的章节，其余标记为额度失败且不再抓取', async () => {
    await saveSyncBook();
    const requests: string[] = [];
    pagesWithQuotaAt(6, 'https://example.com/3', requests);
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
    expect(result.failed.every((f) => f.code === 'FIRECRAWL_QUOTA')).toBe(true);
    expect(session.changeset.status).not.toBe('invalid');
  });
});
