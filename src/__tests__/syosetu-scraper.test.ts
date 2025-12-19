import { describe, it, expect, beforeAll } from 'bun:test';
import { SyosetuScraper } from '../services/scraper/scrapers/syosetu-scraper';
import { join } from 'path';

const examplePagesDir = join(__dirname, 'examplePages');

class TestSyosetuScraper extends SyosetuScraper {
  private indexPageHtml: string = '';
  private chapterPageHtml: string = '';

  async initialize() {
    this.indexPageHtml = await Bun.file(join(examplePagesDir, 'syosetu-org-375522.html')).text();
    this.chapterPageHtml = await Bun.file(
      join(examplePagesDir, 'syosetu-org-375522-chapter-1.html'),
    ).text();
  }

  protected override fetchPage(url: string): Promise<string> {
    if (url.includes('/1.html') || url.includes('/2.html')) {
      return Promise.resolve(this.chapterPageHtml);
    }
    return Promise.resolve(this.indexPageHtml);
  }
}

describe('SyosetuScraper', () => {
  const scraper = new TestSyosetuScraper();
  const idxUrl = 'https://syosetu.org/novel/375522/';

  beforeAll(async () => {
    await scraper.initialize();
  });

  it('validates URL patterns', () => {
    expect(scraper.isValidUrl(idxUrl)).toBe(true);
    expect(scraper.isValidUrl('https://syosetu.org/novel/abc/')).toBe(false);
  });

  it('parses volumes and chapters from table in real HTML', async () => {
    const res = await scraper.fetchNovel(idxUrl);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const novel = res.novel;
    expect(novel?.title).toBe('異世界転生周回プレイもの - ハーメルン');
    expect(novel?.volumes?.length).toBe(3);
    const v = novel?.volumes?.[0];
    expect(v?.title.original).toBe('転生前');
    expect(v?.chapters?.length).toBe(1);
  });

  it('fetches chapter content', async () => {
    const chapterUrl = 'https://syosetu.org/novel/375522/1.html';
    const content = await scraper.fetchChapterContent(chapterUrl);
    expect(content.length).toBe(3868);
    expect(
      content.startsWith(
        '　俺はどうやら死んだらしい、らしいというのは自分が未だに死んだ実感を得られていないからだ。\n　そして',
      ),
    ).toBe(true);
  });

  it('extracts novel description from second .ss div', async () => {
    const res = await scraper.fetchNovel(idxUrl);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const novel = res.novel;
    expect(novel?.description).toBeDefined();
    expect(novel?.description).toBeTruthy();
    // 验证描述包含预期内容
    expect(novel?.description).toContain('主人公「なぜ俺が選ばれたんですか？」');
    expect(novel?.description).toContain('女神様「貴方には素養があります');
    expect(novel?.description).toContain('貴方がどんなゲームも100％達成トロコンしないと納得できず');
    expect(novel?.description).toContain('主人公「なるほど！」');
    expect(novel?.description).toContain('▼ファンアート頂きました。');
    expect(novel?.description).toContain('ラノベ扉絵風');
    expect(novel?.description).toContain('流星ちゃんデザイン');
    // 验证描述应该包含换行符（因为原HTML中有<br>标签）
    expect(novel?.description).toContain('\n');
    // 验证描述长度应该足够长（完整描述应该超过100个字符）
    expect(novel?.description?.length).toBeGreaterThan(100);
  });

  it('extracts tags from alert_color links', async () => {
    const res = await scraper.fetchNovel(idxUrl);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const novel = res.novel;
    expect(novel?.tags).toBeDefined();
    expect(novel?.tags?.length).toBeGreaterThan(0);
    // 验证标签列表包含预期的标签
    expect(novel?.tags).toContain('R-15');
    expect(novel?.tags).toContain('神様転生');
    expect(novel?.tags).toContain('残酷な描写');
  });
});
