import { describe, it, expect, beforeAll } from 'vitest';
import { NcodeSyosetuScraper } from '../services/scraper/scrapers/ncode-syosetu-scraper';
import { join } from 'path';
import { readFileSync } from 'node:fs';

const examplePagesDir = join(__dirname, 'examplePages');
const base = 'https://ncode.syosetu.com/n2032iz/';

class TestNcodeScraper extends NcodeSyosetuScraper {
  private pages: Map<string, string> = new Map();

  initialize() {
    this.pages.set('p1', readFileSync(join(examplePagesDir, 'ncode-n2032iz-p1.html'), 'utf-8'));
    this.pages.set('p2', readFileSync(join(examplePagesDir, 'ncode-n2032iz-p2.html'), 'utf-8'));
    this.pages.set('p3', readFileSync(join(examplePagesDir, 'ncode-n2032iz-p3.html'), 'utf-8'));
    this.pages.set('p4', readFileSync(join(examplePagesDir, 'ncode-n2032iz-p4.html'), 'utf-8'));
    this.pages.set('p5', readFileSync(join(examplePagesDir, 'ncode-n2032iz-p5.html'), 'utf-8'));
    this.pages.set(
      'chapter',
      readFileSync(join(examplePagesDir, 'ncode-n2032iz-chapter-1.html'), 'utf-8'),
    );
  }

  // Some code paths call fetchPage directly for chapter content
  protected override fetchPage(url: string): Promise<string> {
    const u = new URL(url);
    const p = u.searchParams.get('p');

    // Handle pagination
    if (p) {
      if (p === '1') return Promise.resolve(this.pages.get('p1') || '');
      if (p === '2') return Promise.resolve(this.pages.get('p2') || '');
      if (p === '3') return Promise.resolve(this.pages.get('p3') || '');
      if (p === '4') return Promise.resolve(this.pages.get('p4') || '');
      if (p === '5') return Promise.resolve(this.pages.get('p5') || '');
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

describe('NcodeSyosetuScraper', () => {
  const scraper = new TestNcodeScraper();

  beforeAll(() => {
    scraper.initialize();
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
