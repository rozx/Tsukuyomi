import { describe, it, expect, beforeAll, afterEach, mock, spyOn } from 'bun:test';
import axios from 'axios';
import { Novel18SyosetuScraper } from '../services/scraper/scrapers/novel18-syosetu-scraper';
import { join } from 'path';
import { readFileSync } from 'node:fs';

const examplePagesDir = join(__dirname, 'examplePages');
const base = 'https://novel18.syosetu.com/n7686kd/';
const webNovelPage = `
  <!doctype html>
  <html lang="ja">
    <head><title>Web 代理测试小说</title></head>
    <body>
      <div class="l-container">
        <main>
          <article>
            <h1 class="p-novel__title">Web 代理测试小说</h1>
            <div class="p-eplist">
              <div class="p-eplist__sublist">
                <a class="p-eplist__subtitle" href="/n7686kd/1/">第一章</a>
              </div>
            </div>
          </article>
        </main>
      </div>
    </body>
  </html>
`;

class TestNovel18Scraper extends Novel18SyosetuScraper {
  exposeFetchExtraHeaders(url: string): Record<string, string> {
    return this.getFetchExtraHeaders(url);
  }

  exposeShouldSkipExternalProxy(): boolean {
    return this.shouldSkipExternalProxy();
  }

  private pages: Map<string, string> = new Map();

  initialize() {
    this.pages.set('p1', readFileSync(join(examplePagesDir, 'novel18-n7686kd-p1.html'), 'utf-8'));
    this.pages.set('p2', readFileSync(join(examplePagesDir, 'novel18-n7686kd-p2.html'), 'utf-8'));
    this.pages.set(
      'chapter',
      readFileSync(join(examplePagesDir, 'novel18-n7686kd-p2-chapter-1.html'), 'utf-8'),
    );
  }

  protected override fetchPage(url: string): Promise<string> {
    const u = new URL(url);
    const p = u.searchParams.get('p');

    // Handle pagination
    if (p) {
      if (p === '1') return Promise.resolve(this.pages.get('p1') || '');
      if (p === '2') return Promise.resolve(this.pages.get('p2') || '');
      return Promise.reject(new Error('404'));
    }

    // Handle chapter content
    if (url.includes('/1/') || url.includes('/2/') || url.includes('/3/')) {
      return Promise.resolve(this.pages.get('chapter') || '');
    }

    // Default to page 1
    return Promise.resolve(this.pages.get('p1') || '');
  }
}

class AgeGateNovel18Scraper extends Novel18SyosetuScraper {
  protected override fetchPage(): Promise<string> {
    return Promise.resolve(`
      <!doctype html>
      <html lang="ja">
        <head><title>年齢確認</title></head>
        <body>
          <h1>年齢確認</h1>
          <a id="yes18" data-url="${base}">Enter</a>
        </body>
      </html>
    `);
  }
}

describe('Novel18SyosetuScraper', () => {
  const scraper = new TestNovel18Scraper();

  beforeAll(() => {
    scraper.initialize();
  });

  afterEach(() => {
    mock.restore();
  });

  it('validates URL patterns', () => {
    expect(scraper.isValidUrl(base)).toBe(true);
    expect(scraper.isValidUrl('https://novel18.syosetu.com/invalid/')).toBe(false);
  });

  it('includes over18 cookie for age verification on novel18.syosetu.com', () => {
    expect(scraper.exposeFetchExtraHeaders(base)).toEqual({ Cookie: 'over18=yes' });
    expect(scraper.exposeFetchExtraHeaders('https://novel18.syosetu.com/n7686kd/1/')).toEqual({
      Cookie: 'over18=yes',
    });
    expect(scraper.exposeFetchExtraHeaders('https://xmypage.novel18.syosetu.com/n7686kd/')).toEqual(
      { Cookie: 'over18=yes' },
    );
    expect(scraper.exposeFetchExtraHeaders('https://ncode.syosetu.com/n7686kd/')).toEqual({});
    expect(scraper.exposeFetchExtraHeaders('not-a-url')).toEqual({});
  });

  it('rejects the age verification page instead of treating it as a novel', async () => {
    const result = await new AgeGateNovel18Scraper().fetchNovel(base);

    expect(result.success).toBe(false);
    expect(result.error).toBe('目标网站返回了年龄确认页，未能获取小说内容');
  });

  it('forwards the age verification cookie through the Web CORS proxy', async () => {
    const axiosGetSpy = spyOn(axios, 'get').mockResolvedValue({
      status: 200,
      statusText: 'OK',
      data: webNovelPage,
      headers: { 'content-type': 'text/html' },
    });

    const result = await new Novel18SyosetuScraper().fetchNovel(base);

    expect(result.success).toBe(true);
    expect(axiosGetSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://cors.rozx.moe/'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-cors-headers': JSON.stringify({ Cookie: 'over18=yes' }),
        }),
      }),
    );
  });

  it('skips external CORS proxy only in Electron', () => {
    const win = window as unknown as { electronAPI?: { isElectron?: boolean } };
    expect(scraper.exposeShouldSkipExternalProxy()).toBe(false);
    win.electronAPI = { isElectron: true };
    try {
      expect(scraper.exposeShouldSkipExternalProxy()).toBe(true);
    } finally {
      delete win.electronAPI;
    }
  });

  it('fetches chapters across pages from real HTML', async () => {
    const res = await scraper.fetchNovel(base);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const novel = res.novel;
    expect(novel?.title).toBe(
      '異世界転移した息子を追ってきたら、そんな息子は異世界の英雄でした。そんな息子の仲間や恋人をいただきます。',
    );
    expect(novel?.volumes?.length).toBe(1);
    // Should include chapters from multiple pages
    const chapters = novel?.volumes?.[0]?.chapters || [];
    expect(chapters.length).toBeGreaterThan(0);

    let totalChapters = 0;
    novel?.volumes?.forEach((v) => (totalChapters += v.chapters?.length || 0));
    expect(totalChapters).toBeGreaterThan(0);
  });

  it('fetches chapter content', async () => {
    const chapterUrl = 'https://novel18.syosetu.com/n7686kd/1/';
    const content = await scraper.fetchChapterContent(chapterUrl);
    expect(content.length).toBe(3743);
    expect(
      content.startsWith(
        '現実世界\n\n自宅のユーマの部屋。\nその父であるボクは、数日前に失踪したそのユーマの彼女である、サエキ',
      ),
    ).toBe(true);
  });
});
