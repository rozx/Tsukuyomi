import { describe, it, expect } from 'bun:test';
import { NcodeSyosetuScraper } from '../services/scraper/scrapers/ncode-syosetu-scraper';
import { KakuyomuScraper } from '../services/scraper/scrapers/kakuyomu-scraper';

const runLive = process.env.RUN_LIVE_SCRAPER_TESTS === '1';

const itLive = runLive ? it : it.skip;

describe('Live Scraper Tests (opt-in via RUN_LIVE_SCRAPER_TESTS=1)', () => {
  itLive(
    'ncode.syosetu.com: fetch n2032iz index with pagination',
    async () => {
      const scraper = new NcodeSyosetuScraper({} as any);
      const url = 'https://ncode.syosetu.com/n2032iz/';
      const res = await scraper.fetchNovel(url);
      expect(res.success).toBe(true);
      if (!res.success) return;
      const novel = res.novel;
      expect(novel.title.length).toBeGreaterThan(0);
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
      if (!res.success) return;
      const novel = res.novel;
      expect(novel.title.length).toBeGreaterThan(0);
      const totalChapters = novel.volumes.reduce((acc, v) => acc + (v.chapters?.length || 0), 0);
      expect(totalChapters).toBeGreaterThan(0);
    },
    120_000,
  );
});
