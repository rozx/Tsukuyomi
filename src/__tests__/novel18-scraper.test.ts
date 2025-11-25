import { describe, it, expect, beforeAll } from 'bun:test';
import { Novel18SyosetuScraper } from '../services/scraper/scrapers/novel18-syosetu-scraper';
import { join } from 'path';

const examplePagesDir = join(__dirname, 'examplePages');
const base = 'https://novel18.syosetu.com/n7686kd/';

class TestNovel18Scraper extends Novel18SyosetuScraper {
  private pages: Map<string, string> = new Map();

  async initialize() {
    const page1 = await Bun.file(join(examplePagesDir, 'novel18-n7686kd-p1.html')).text();
    const page2 = await Bun.file(join(examplePagesDir, 'novel18-n7686kd-p2.html')).text();
    const chapterPage = await Bun.file(
      join(examplePagesDir, 'novel18-n7686kd-p2-chapter-1.html'),
    ).text();

    this.pages.set('p1', page1);
    this.pages.set('p2', page2);
    this.pages.set('chapter', chapterPage);
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

describe('Novel18SyosetuScraper', () => {
  const scraper = new TestNovel18Scraper();

  beforeAll(async () => {
    await scraper.initialize();
  });

  it('validates URL patterns', () => {
    expect(scraper.isValidUrl(base)).toBe(true);
    expect(scraper.isValidUrl('https://novel18.syosetu.com/invalid/')).toBe(false);
  });

  it('fetches chapters across pages from real HTML', async () => {
    const res = await scraper.fetchNovel(base);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const novel = res.novel;
    expect(novel?.title).toBe(
      '異世界転移した息子を追ってきたら、そんな息子は異世界の英雄でした。そんな息子の仲間や恋人をいただきます。',
    );
    expect(novel?.volumes?.length).toBe(2);
    // Should include chapters from multiple pages
    const chapters = novel?.volumes?.[0]?.chapters || [];
    expect(chapters.length).toBe(100);

    let totalChapters = 0;
    novel?.volumes?.forEach((v) => (totalChapters += v.chapters?.length || 0));
    expect(totalChapters).toBe(196);
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
