import type { Novel } from 'src/models/novel';
import type { BookUpdateRecipe } from 'src/models/book-sync';
import { NovelScraperFactory } from 'src/services/scraper/novel-scraper-factory';

type BuiltinSite = Extract<BookUpdateRecipe['engine'], { kind: 'builtin' }>['site'];

/** 网址属于内置站点时返回站点标识，否则返回 undefined。 */
export function builtinSite(url: string): BuiltinSite | undefined {
  if (!NovelScraperFactory.getScraper(url)) return undefined;
  const host = new URL(url).hostname;
  return host === 'novel18.syosetu.com'
    ? 'novel18'
    : host === 'ncode.syosetu.com'
      ? 'ncode'
      : host === 'kakuyomu.jp'
        ? 'kakuyomu'
        : 'syosetu-org';
}

export function resolveRecipe(book: Pick<Novel, 'updateRecipe' | 'webUrl'>): {
  recipe: BookUpdateRecipe;
  virtual: boolean;
} {
  if (book.updateRecipe) return { recipe: structuredClone(book.updateRecipe), virtual: false };
  const url = book.webUrl?.[0];
  const site = url ? builtinSite(url) : undefined;
  if (!url || !site) throw new Error('RECIPE_MISSING: 尚未建立更新配方');
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
