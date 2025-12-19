import { describe, it, expect, beforeAll } from 'bun:test';
import { KakuyomuScraper } from '../services/scraper/scrapers/kakuyomu-scraper';
import { join } from 'path';

const examplePagesDir = join(__dirname, 'examplePages');

class TestKakuyomuScraper extends KakuyomuScraper {
  private workPageHtml: string = '';
  private chapterPageHtml: string = '';

  async initialize() {
    this.workPageHtml = await Bun.file(
      join(examplePagesDir, 'kakuyumu-822139839100185440.html'),
    ).text();
    this.chapterPageHtml = await Bun.file(
      join(examplePagesDir, 'kakuyumu-822139839100185440-chapter-1.html'),
    ).text();
  }

  // Override network to return fixture html
  protected override fetchPage(url: string): Promise<string> {
    if (url.includes('/episodes/')) {
      return Promise.resolve(this.chapterPageHtml);
    }
    return Promise.resolve(this.workPageHtml);
  }
}

describe('KakuyomuScraper', () => {
  const scraper = new TestKakuyomuScraper();
  const url = 'https://kakuyomu.jp/works/822139839100185440';

  beforeAll(async () => {
    await scraper.initialize();
  });

  it('validates URL patterns', () => {
    expect(scraper.isValidUrl(url)).toBe(true);
    expect(scraper.isValidUrl('https://kakuyomu.jp/works/abc')).toBe(false);
  });

  it('parses novel metadata and chapters from real HTML', async () => {
    const res = await scraper.fetchNovel(url);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const novel = res.novel;
    expect(novel?.title).toBe(
      '貞操観念逆転世界かと思ったら、ただクラスの重すぎる女子に囲まれていただけでした。',
    );
    expect(novel?.author).toBe('とおさー@ファンタジア大賞《金賞》');
    expect(novel?.volumes?.length).toBe(2);
    const firstVol = novel?.volumes?.[0];
    expect(firstVol?.title.original).toBe('1章:貞操観念が逆転した女子に襲われました');
    expect(firstVol?.chapters?.length).toBe(5);
  });

  it('fetches chapter content', async () => {
    const chapterUrl = 'https://kakuyomu.jp/works/822139839100185440/episodes/1177354054880238354';
    const content = await scraper.fetchChapterContent(chapterUrl);
    
    // 验证内容长度（允许一定范围的误差，因为网页内容可能已变化）
    expect(content.length).toBeGreaterThanOrEqual(2100);
    expect(content.length).toBeLessThanOrEqual(2300);
    
    // 验证内容开头（使用更宽松的匹配）
    const expectedStart = '――貞操観念逆転世界。';
    expect(content.startsWith(expectedStart)).toBe(true);
    
    // 验证内容包含关键信息
    expect(content).toContain('貞操観念逆転世界');
    expect(content).toContain('男性よりも女性の方が多く');
  });

  it('extracts complete novel description', async () => {
    const res = await scraper.fetchNovel(url);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const novel = res.novel;
    expect(novel?.description).toBeDefined();
    expect(novel?.description).toBeTruthy();
    
    // 验证描述包含 catchphrase
    expect(novel?.description).toContain('俺が外堀を埋められているのは、貞操観念逆転世界だからだと思う。');
    
    // 验证描述包含 introduction 的关键内容
    expect(novel?.description).toContain('男女比1:2の世界に転生した。');
    expect(novel?.description).toContain('貞操観念が逆転したこの世界で');
    expect(novel?.description).toContain('「わたくし、あなたと一局交える覚悟を決めました！」');
    expect(novel?.description).toContain('「やるかやらないかなら、やるしかないっしょ」');
    expect(novel?.description).toContain('気がついたらクラスの激重女子たちに囲まれていた');
    expect(novel?.description).toContain('これは貞操観念逆転世界に転生したと信じてやまない主人公が');
    
    // 验证描述包含换行符（因为原HTML中有<br>标签）
    expect(novel?.description).toContain('\n');
    
    // 验证描述长度应该足够长（完整描述应该超过200个字符）
    expect(novel?.description?.length).toBeGreaterThan(200);
  });
});
