import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchScraperPage } from 'src/services/scraper/core/page-transport';
import { FirecrawlClient } from 'src/services/firecrawl/firecrawl-client';
import { SyosetuScraper } from 'src/services/scraper/scrapers/syosetu-scraper';
import { NcodeSyosetuScraper } from 'src/services/scraper/scrapers/ncode-syosetu-scraper';
import { Novel18SyosetuScraper } from 'src/services/scraper/scrapers/novel18-syosetu-scraper';
import { KakuyomuScraper } from 'src/services/scraper/scrapers/kakuyomu-scraper';
import { useSettingsStore } from 'src/stores/settings';

const fixture = (name: string) =>
  readFileSync(join(__dirname, 'examplePages/firecrawl', name), 'utf8');

const SYOSETU_URL = 'https://syosetu.org/novel/375522/6.html';
const CORS = 'https://cors.rozx.moe/?{url}';

type ElectronFetch = (
  url: string,
  options?: unknown,
) => Promise<{ status: number; statusText: string; headers: Record<string, string>; data: string }>;

function installElectron(fetch: ElectronFetch) {
  (window as unknown as { electronAPI?: unknown }).electronAPI = { isElectron: true, fetch };
}

function axiosStatusError(status: number) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, headers: {}, data: '' },
  });
}

beforeEach(async () => {
  await useSettingsStore().updateSettings({
    proxyEnabled: true,
    proxyUrl: CORS,
    proxySiteMapping: {},
    firecrawlFallbackEnabled: true,
    firecrawlAutoAddMapping: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
});

describe('Firecrawl rawHtml 真实抓取样本可被各站点解析器解析', () => {
  const chapterCount = (info: unknown): number => {
    const value = info as { chapters?: unknown[]; volumes?: Array<{ chapters?: unknown[] }> };
    return (
      (value.chapters?.length ?? 0) +
      (value.volumes ?? []).reduce((sum, v) => sum + (v.chapters?.length ?? 0), 0)
    );
  };

  it.each([
    [
      'syosetu.org',
      new SyosetuScraper(),
      'syosetu-org-375522.html',
      'https://syosetu.org/novel/375522/',
      'syosetu-org-375522-chapter-1.html',
    ],
    [
      'ncode',
      new NcodeSyosetuScraper(),
      'ncode-n2032iz-p1.html',
      'https://ncode.syosetu.com/n2032iz/',
      'ncode-n2032iz-chapter-1.html',
    ],
    [
      'novel18',
      new Novel18SyosetuScraper(),
      'novel18-n7686kd-p1.html',
      'https://novel18.syosetu.com/n7686kd/',
      'novel18-n7686kd-chapter-1.html',
    ],
    [
      'kakuyomu',
      new KakuyomuScraper(),
      'kakuyomu-822139842947212336.html',
      'https://kakuyomu.jp/works/822139842947212336',
      'kakuyomu-822139842947212336-chapter-1.html',
    ],
  ])('%s：目录与正文均非空', (_site, scraper, tocFile, tocUrl, chapterFile) => {
    const toc = scraper.parseNovelSnapshot(fixture(tocFile), tocUrl);
    expect(toc.info.title).toBeTruthy();
    expect(chapterCount(toc.info)).toBeGreaterThan(0);
    const chapter = scraper.parseChapterSnapshot(fixture(chapterFile));
    expect(chapter.paragraphs.length).toBeGreaterThan(0);
    expect(chapter.text.length).toBeGreaterThan(100);
  });
});

describe('fetchScraperPage 的 Firecrawl 回退（Web）', () => {
  it('CORS 代理 403 → 经 Firecrawl rawHtml 返回快照，并置顶映射', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(axiosStatusError(403));
    const scrape = vi.spyOn(FirecrawlClient, 'scrape').mockResolvedValue({
      content: '<html><body><div id="honbun">正文</div></body></html>',
      statusCode: 200,
      url: SYOSETU_URL,
    });

    const snapshot = await fetchScraperPage(SYOSETU_URL);

    expect(scrape).toHaveBeenCalledWith(SYOSETU_URL, { format: 'rawHtml' });
    expect(snapshot).toEqual({
      html: '<html><body><div id="honbun">正文</div></body></html>',
      requestUrl: SYOSETU_URL,
      transportUrl: `firecrawl:${SYOSETU_URL}`,
      status: 200,
      contentType: 'text/html',
    });
    expect(useSettingsStore().settings.proxySiteMapping?.['syosetu.org']?.proxies).toEqual([
      'firecrawl',
    ]);
  });

  it('Firecrawl 报告不同的最终 URL 时写入 responseUrl', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(axiosStatusError(403));
    vi.spyOn(FirecrawlClient, 'scrape').mockResolvedValue({
      content: '<html></html>',
      statusCode: 200,
      url: 'https://syosetu.org/novel/375522/6.html?redirected=1',
    });
    const snapshot = await fetchScraperPage(SYOSETU_URL);
    expect(snapshot.responseUrl).toBe('https://syosetu.org/novel/375522/6.html?redirected=1');
  });

  it('CORS 代理返回 200 质询页 → 回退 Firecrawl', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: '<html><head><title>Just a moment...</title></head><body></body></html>',
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
    const scrape = vi
      .spyOn(FirecrawlClient, 'scrape')
      .mockResolvedValue({ content: '<html>ok</html>', statusCode: 200 });
    const snapshot = await fetchScraperPage(SYOSETU_URL);
    expect(scrape).toHaveBeenCalledTimes(1);
    expect(snapshot.html).toBe('<html>ok</html>');
  });

  it('novel18 经 Firecrawl 时通过 headers 转发年龄验证 Cookie', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(axiosStatusError(403));
    const scrape = vi
      .spyOn(FirecrawlClient, 'scrape')
      .mockResolvedValue({ content: '<html>ok</html>', statusCode: 200 });
    await new Novel18SyosetuScraper().fetchPageSnapshot('https://novel18.syosetu.com/n7686kd/');
    expect(scrape).toHaveBeenCalledWith('https://novel18.syosetu.com/n7686kd/', {
      format: 'rawHtml',
      headers: { Cookie: 'over18=yes' },
    });
  });

  it('回退关闭时抛出原始错误，不调用 Firecrawl', async () => {
    await useSettingsStore().setFirecrawlFallbackEnabled(false);
    vi.spyOn(axios, 'get').mockRejectedValue(axiosStatusError(403));
    const scrape = vi.spyOn(FirecrawlClient, 'scrape');
    await expect(fetchScraperPage(SYOSETU_URL)).rejects.toThrow('403');
    expect(scrape).not.toHaveBeenCalled();
  });
});

describe('fetchScraperPage 的 Firecrawl 回退（Electron）', () => {
  it('忽略存储的 proxyEnabled，直连原始 URL', async () => {
    const fetch = vi.fn<ElectronFetch>().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: '<html><body>ok</body></html>',
    });
    installElectron(fetch);
    await fetchScraperPage('https://kakuyomu.jp/works/1');
    expect(fetch.mock.calls[0]![0]).toBe('https://kakuyomu.jp/works/1');
  });

  it('Electron 返回 403 → 回退 Firecrawl', async () => {
    installElectron(
      vi.fn<ElectronFetch>().mockResolvedValue({
        status: 403,
        statusText: 'Forbidden',
        headers: {},
        data: '<html>blocked</html>',
      }),
    );
    const scrape = vi
      .spyOn(FirecrawlClient, 'scrape')
      .mockResolvedValue({ content: '<html>ok</html>', statusCode: 200 });
    const snapshot = await fetchScraperPage(SYOSETU_URL);
    expect(scrape).toHaveBeenCalledTimes(1);
    expect(snapshot.html).toBe('<html>ok</html>');
  });

  it('Electron 返回 404 → 失败且不调用 Firecrawl', async () => {
    installElectron(
      vi.fn<ElectronFetch>().mockResolvedValue({
        status: 404,
        statusText: 'Not Found',
        headers: {},
        data: '<html>missing</html>',
      }),
    );
    const scrape = vi.spyOn(FirecrawlClient, 'scrape');
    await expect(fetchScraperPage(SYOSETU_URL)).rejects.toThrow('404');
    expect(scrape).not.toHaveBeenCalled();
  });

  it('Electron 返回 200 质询页 → 回退 Firecrawl', async () => {
    installElectron(
      vi.fn<ElectronFetch>().mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: '<html><head><title>Just a moment...</title></head></html>',
      }),
    );
    const scrape = vi
      .spyOn(FirecrawlClient, 'scrape')
      .mockResolvedValue({ content: '<html>ok</html>', statusCode: 200 });
    await fetchScraperPage(SYOSETU_URL);
    expect(scrape).toHaveBeenCalledTimes(1);
  });
});

describe('novel18 经 Firecrawl 返回年龄确认页时失败关闭', () => {
  it('fetchNovel 返回 success: false 与年龄确认页错误', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(axiosStatusError(403));
    vi.spyOn(FirecrawlClient, 'scrape').mockResolvedValue({
      content:
        '<html lang="ja"><head><title>年齢確認</title></head><body><h1>年齢確認</h1><a id="yes18">Enter</a></body></html>',
      statusCode: 200,
    });
    const result = await new Novel18SyosetuScraper().fetchNovel('https://novel18.syosetu.com/n7686kd/');
    expect(result.success).toBe(false);
    expect(result.error).toBe('目标网站返回了年龄确认页，未能获取小说内容');
  });
});
