import type { Novel } from 'src/models/novel';
import type { BookUpdateRecipe } from 'src/models/book-sync';
import { NovelScraperFactory } from 'src/services/scraper/novel-scraper-factory';

export function resolveRecipe(book: Pick<Novel, 'updateRecipe' | 'webUrl'>): {
  recipe: BookUpdateRecipe;
  virtual: boolean;
} {
  if (book.updateRecipe) return { recipe: structuredClone(book.updateRecipe), virtual: false };
  const url = book.webUrl?.[0];
  if (!url || !NovelScraperFactory.getScraper(url))
    throw new Error('RECIPE_MISSING: 尚未建立更新配方');
  const host = new URL(url).hostname;
  const site =
    host === 'novel18.syosetu.com'
      ? 'novel18'
      : host === 'ncode.syosetu.com'
        ? 'ncode'
        : host === 'kakuyomu.jp'
          ? 'kakuyomu'
          : 'syosetu-org';
  return {
    virtual: true,
    recipe: {
      version: 1,
      engine: { kind: 'builtin', site },
      catalogUrls: [url],
      verifiedChapterCount: 0,
      recordedAt: 0,
    },
  };
}
