import { describe, it, expect, beforeAll } from 'bun:test';
import { KakuyomuScraper } from '../services/scraper/scrapers/kakuyomu-scraper';
import { join } from 'path';

const examplePagesDir = join(__dirname, 'examplePages');

class TestKakuyomuScraper extends KakuyomuScraper {
  private workPageHtml: string = '';
  private chapterPageHtml: string = '';

  async initialize() {
    this.workPageHtml = await Bun.file(
      join(examplePagesDir, 'kakuyumu-822139842947212336.html'),
    ).text();
    this.chapterPageHtml = await Bun.file(
      join(examplePagesDir, 'kakuyumu-822139842947212336-chapter-1.html'),
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
  const url = 'https://kakuyomu.jp/works/822139842947212336';

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
    expect(novel?.title).toBe('守り抜いたヒロインたちが病んでいく件について');
    expect(novel?.author).toBe('天宮しろ');
    expect(novel?.volumes?.length).toBe(3);
    const firstVol = novel?.volumes?.[0];
    expect(typeof firstVol?.title === 'string' ? firstVol.title : firstVol?.title.original).toBe(
      '第一章',
    );
    expect(firstVol?.chapters?.length).toBe(25);
  });

  it('fetches chapter content', async () => {
    const chapterUrl = 'https://kakuyomu.jp/works/822139842947212336/episodes/822139842947254251';
    const content = await scraper.fetchChapterContent(chapterUrl);

    // 验证内容开头
    expect(content.startsWith('大切な妹を守りたかった。')).toBe(true);

    // 验证内容包含关键信息
    expect(content).toContain('大切な妹を守りたかった');
    expect(content).toContain('前世の記憶');
  });

  it('extracts complete novel description', async () => {
    const res = await scraper.fetchNovel(url);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const novel = res.novel;
    expect(novel?.description).toBeDefined();
    expect(novel?.description).toBeTruthy();

    // 验证描述包含 catchphrase
    expect(novel?.description).toContain('救った少女たちが病んでいく、曇らせ系激重感情ラブコメディ。');

    // 验证描述包含 introduction 的关键内容
    expect(novel?.description).toContain('前世で最愛の妹を守れなかった');
    expect(novel?.description).toContain('テオは純粋に皆が笑顔でいてくれることを願っていた');

    // 验证描述包含换行符
    expect(novel?.description).toContain('\n');

    // 验证描述长度应该足够长
    expect(novel?.description?.length).toBeGreaterThan(200);
  });
});
