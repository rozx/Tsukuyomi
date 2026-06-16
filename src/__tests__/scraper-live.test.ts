// @vitest-environment node
import axios from 'axios';
import { describe, it, expect } from 'bun:test';
import { NcodeSyosetuScraper } from '../services/scraper/scrapers/ncode-syosetu-scraper';
import { KakuyomuScraper } from '../services/scraper/scrapers/kakuyomu-scraper';
import { Novel18SyosetuScraper } from '../services/scraper/scrapers/novel18-syosetu-scraper';

const runLive = process.env.RUN_LIVE_SCRAPER_TESTS === '1';

const itLive = runLive ? it : it.skip;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** live 测试在 Node 中直连目标站，不走 /api/novel18 相对路径 */
class LiveNovel18Scraper extends Novel18SyosetuScraper {
  protected override async fetchPage(url: string): Promise<string> {
    const extraHeaders = this.getFetchExtraHeaders(url);
    const response = await axios.get(url, {
      timeout: 60_000,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        Referer: new URL(url).origin,
        ...extraHeaders,
      },
      validateStatus: (status) => status >= 200 && status < 400,
    });
    if (!response.data) {
      throw new Error('返回的内容为空');
    }
    return response.data;
  }
}

describe('Live Scraper Tests (opt-in via RUN_LIVE_SCRAPER_TESTS=1)', () => {
  itLive(
    'ncode.syosetu.com: fetch n2032iz index with pagination',
    async () => {
      const scraper = new NcodeSyosetuScraper();
      const url = 'https://ncode.syosetu.com/n2032iz/';
      const res = await scraper.fetchNovel(url);
      expect(res.success).toBe(true);
      if (!res.success || !res.novel) return;
      const novel = res.novel;
      expect(novel.title.length).toBeGreaterThan(0);
      expect(novel.volumes).toBeDefined();
      if (!novel.volumes) return;
      expect(novel.volumes.length).toBeGreaterThan(0);
      const totalChapters = novel.volumes.reduce((acc, v) => acc + (v.chapters?.length || 0), 0);
      expect(totalChapters).toBeGreaterThan(2);
    },
    120_000,
  );

  itLive(
    'kakuyomu.jp: fetch a known work index',
    async () => {
      const scraper = new KakuyomuScraper();
      // Popular sample: 16818093077341782899 is often used in examples, OK if replaced
      const url = 'https://kakuyomu.jp/works/16818093077341782899';
      const res = await scraper.fetchNovel(url);
      expect(res.success).toBe(true);
      if (!res.success || !res.novel) return;
      const novel = res.novel;
      expect(novel.title.length).toBeGreaterThan(0);
      expect(novel.volumes).toBeDefined();
      if (!novel.volumes) return;
      const totalChapters = novel.volumes.reduce((acc, v) => acc + (v.chapters?.length || 0), 0);
      expect(totalChapters).toBeGreaterThan(0);
    },
    120_000,
  );

  itLive(
    'novel18.syosetu.com: fetch n2819do index with age verification cookie',
    async () => {
      const scraper = new LiveNovel18Scraper();
      const url = 'https://novel18.syosetu.com/n2819do/';
      const res = await scraper.fetchNovel(url);
      expect(res.success, res.error ?? 'fetchNovel failed').toBe(true);
      if (!res.success || !res.novel) return;
      const novel = res.novel;
      expect(novel.title.length).toBeGreaterThan(0);
      expect(novel.volumes).toBeDefined();
      if (!novel.volumes) return;
      expect(novel.volumes.length).toBeGreaterThan(0);
      const totalChapters = novel.volumes.reduce((acc, v) => acc + (v.chapters?.length || 0), 0);
      expect(totalChapters).toBeGreaterThan(0);

      const firstChapter = novel.volumes[0]?.chapters?.[0];
      expect(firstChapter?.webUrl).toBeTruthy();
      if (!firstChapter?.webUrl) return;
      const content = await scraper.fetchChapterContent(firstChapter.webUrl);
      expect(content.length).toBeGreaterThan(100);
    },
    120_000,
  );
});
