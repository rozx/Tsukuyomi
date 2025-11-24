import { describe, it, expect, beforeAll } from 'bun:test';
import { NcodeSyosetuScraper } from '../services/scraper/scrapers/ncode-syosetu-scraper';
import { join } from 'path';

const examplePagesDir = join(__dirname, 'examplePages');
const base = 'https://ncode.syosetu.com/n2032iz/';

class TestNcodeScraper extends NcodeSyosetuScraper {
  private pages: Map<string, string> = new Map();

  async initialize() {
    // Load all pagination pages
    const page1 = await Bun.file(join(examplePagesDir, 'ncode-n2032iz-p1.html')).text();
    const page2 = await Bun.file(join(examplePagesDir, 'ncode-n2032iz-p2.html')).text();
    const page3 = await Bun.file(join(examplePagesDir, 'ncode-n2032iz-p3.html')).text();
    const page4 = await Bun.file(join(examplePagesDir, 'ncode-n2032iz-p4.html')).text();
    const page5 = await Bun.file(join(examplePagesDir, 'ncode-n2032iz-p5.html')).text();
    const chapterPage = await Bun.file(
      join(examplePagesDir, 'ncode-n2032iz-chapter-1.html'),
    ).text();

    this.pages.set('p1', page1);
    this.pages.set('p2', page2);
    this.pages.set('p3', page3);
    this.pages.set('p4', page4);
    this.pages.set('p5', page5);
    this.pages.set('chapter', chapterPage);
  }

  // Override fetchPageWithStatus used by pagination flow
  protected override fetchPageWithStatus(
    url: string,
  ): Promise<{ html: string; statusCode: number | null }> {
    const u = new URL(url);
    const p = u.searchParams.get('p');

    if (!p || p === '1') {
      return Promise.resolve({ html: this.pages.get('p1') || '', statusCode: 200 });
    }
    if (p === '2') {
      return Promise.resolve({ html: this.pages.get('p2') || '', statusCode: 200 });
    }
    if (p === '3') {
      return Promise.resolve({ html: this.pages.get('p3') || '', statusCode: 200 });
    }
    if (p === '4') {
      return Promise.resolve({ html: this.pages.get('p4') || '', statusCode: 200 });
    }
    if (p === '5') {
      return Promise.resolve({ html: this.pages.get('p5') || '', statusCode: 200 });
    }
    return Promise.resolve({ html: '', statusCode: 404 });
  }

  // Some code paths call fetchPage directly for chapter content
  protected override fetchPage(url: string): Promise<string> {
    if (url.includes('/1/') || url.includes('/2/') || url.includes('/3/')) {
      return Promise.resolve(this.pages.get('chapter') || '');
    }
    return Promise.resolve(this.pages.get('p1') || '');
  }
}

describe('NcodeSyosetuScraper', () => {
  const scraper = new TestNcodeScraper();

  beforeAll(async () => {
    await scraper.initialize();
  });

  it('validates URL patterns', () => {
    expect(scraper.isValidUrl(base)).toBe(true);
    expect(scraper.isValidUrl('https://ncode.syosetu.com/invalid/')).toBe(false);
  });

  it('fetches chapters across multiple pages from real HTML', async () => {
    const res = await scraper.fetchNovel(base);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const novel = res.novel;
    expect(novel?.title).toBe(
      'ユニコーンに懐かれたのでダンジョン配信します……女装しないと言うこと聞いてくれないので、女装して。',
    );
    expect(novel?.volumes?.length).toBe(16);
    // Should include chapters from multiple pages
    const chapters = novel?.volumes?.[0]?.chapters || [];
    expect(chapters.length).toBe(30);

    // Verify total chapters across all volumes
    let totalChapters = 0;
    novel?.volumes?.forEach((v) => (totalChapters += v.chapters?.length || 0));
    expect(totalChapters).toBe(499);
  });

  it('fetches chapter content', async () => {
    const chapterUrl = 'https://ncode.syosetu.com/n2032iz/1/';
    const content = await scraper.fetchChapterContent(chapterUrl);
    expect(content.length).toBe(3970);
    expect(
      content.startsWith(
        '「ありがとうございましたー……ふぅ」\n\n僕は時計を見上げ、あとちょっとでシフトが終わるって気が付いて',
      ),
    ).toBe(true);
  });
});
