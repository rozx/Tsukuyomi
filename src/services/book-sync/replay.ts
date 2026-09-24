import { load } from 'cheerio';
import type { BookUpdateRecipe, CatalogEntry, SyncCatalog } from 'src/models/book-sync';
import { NovelScraperFactory } from 'src/services/scraper/novel-scraper-factory';
import { fetchScraperPage } from 'src/services/scraper/core/page-transport';
import { parseImportHtml } from 'src/services/import/import-html-parser';
import { ImportParsingClient } from 'src/services/import/import-parsing-client';
import { filterImportItems } from 'src/services/import/import-pattern-filter';
import { normalizeChapterText } from './normalize';
import { BookSyncError, cleanupError } from './errors';

type Failure = { ok: false; code: string; message: string };
type CatalogPage = { catalog: SyncCatalog; nextUrls: string[]; startUrl?: string };

function adapter(url: string) {
  const value = NovelScraperFactory.getScraper(url);
  if (!value) throw new BookSyncError('CATALOG_FETCH_FAILED', '来源网址不属于内置站点');
  return value;
}

function verify(html: string, url: string): void {
  if (parseImportHtml(html, {}, url).kind === 'verification')
    throw new BookSyncError('VERIFICATION_REQUIRED', '来源页面需要登录或验证');
}

/** 只回放给定快照；正则筛选复用隔离 Worker，不会发起网页请求。 */
export async function parseCatalog(
  html: string,
  url: string,
  recipe: BookUpdateRecipe,
  parser = new ImportParsingClient(),
  signal?: AbortSignal,
): Promise<CatalogPage> {
  verify(html, url);
  if (recipe.engine.kind === 'builtin') {
    const scraper = adapter(url);
    const page = scraper.parseNovelSnapshot(html, url);
    const { info } = page;
    const entries = info.chapters.map((chapter, index): CatalogEntry => {
      const group = info.volumes?.filter((volume) => volume.startIndex <= index).at(-1)?.title;
      // 站点日期是本地格式（如「2025年5月3日」），必须按站点规则解析，new Date 会得到无效日期
      const lastUpdated = scraper.parseCatalogDate(chapter.lastUpdated);
      return {
        url: chapter.url,
        title: chapter.title,
        ...(group ? { group } : {}),
        ...(lastUpdated ? { lastUpdated } : {}),
      };
    });
    return {
      catalog: {
        meta: {
          title: info.title,
          ...(info.author ? { author: info.author } : {}),
          ...(info.description ? { description: info.description } : {}),
          ...(info.tags ? { tags: info.tags } : {}),
          ...(info.cover ? { cover: { url: info.cover } } : {}),
        },
        entries,
      },
      nextUrls: page.nextPageUrls,
      startUrl: page.catalogStartUrl,
    };
  }
  const parsed = parseImportHtml(html, {}, url);
  let links = parsed.links.filter((link) => link.relation === 'chapter');
  if (recipe.engine.catalogSelector) {
    const $ = load(html);
    // 保留范围根节点及祖先语义，广告链接仍会被标为 metadata。
    const selected = $(recipe.engine.catalogSelector);
    const scoped = selected
      .toArray()
      .map((node) => $.html(node))
      .join('\n');
    links = parseImportHtml(scoped, {}, url).links.filter((link) => link.relation !== 'metadata');
  }
  try {
    links = await filterImportItems(
      links,
      [
        { pattern: recipe.engine.chapterFilter?.name, text: (link) => link.name },
        { pattern: recipe.engine.chapterFilter?.locator, text: (link) => link.href },
      ],
      parser,
      signal,
    );
  } catch (error) {
    cleanupError(error);
  }
  const meta = parsed.metadata;
  return {
    catalog: {
      meta: {
        title: meta.title ?? '未命名书籍',
        ...(meta.author ? { author: meta.author } : {}),
        ...(meta.description ? { description: meta.description } : {}),
        ...(meta.cover ? { cover: { url: meta.cover } } : {}),
      },
      entries: links.map((link) => ({ url: link.href, title: link.name })),
    },
    nextUrls: recipe.engine.followNext
      ? parsed.links.filter((link) => link.relation === 'next').map((link) => link.href)
      : [],
  };
}

/** 与导入器 prepareExtraction 一致，全部块按换行连接。 */
export function parseChapter(html: string, url: string, recipe: BookUpdateRecipe): string {
  verify(html, url);
  return recipe.engine.content
    ? parseImportHtml(html, recipe.engine.content, url)
        .blocks.map((block) => block.text)
        .join('\n')
    : adapter(url).parseChapterSnapshot(html).text;
}

function failure(error: unknown, fallback: string): Failure {
  if (error instanceof Error && error.name === 'AbortError') throw error;
  return {
    ok: false,
    code: error instanceof BookSyncError ? error.code : fallback,
    message: error instanceof Error ? error.message : String(error),
  };
}

function sameSite(url: string, catalogs: string[]): boolean {
  try {
    return catalogs.some((catalog) => new URL(catalog).hostname === new URL(url).hostname);
  } catch {
    return false;
  }
}

function appendCatalogEntries(
  entries: Map<string, CatalogEntry>,
  page: CatalogEntry[],
  builtin: boolean,
  priorGroup?: string,
): string | undefined {
  for (const entry of page) {
    const group =
      builtin && (!entry.group || entry.group === '正文')
        ? (priorGroup ?? entry.group)
        : entry.group;
    if (group) priorGroup = group;
    if (!entries.has(entry.url)) entries.set(entry.url, { ...entry, ...(group ? { group } : {}) });
  }
  return priorGroup;
}

export class BookSyncReplay {
  constructor(
    readonly recipe: BookUpdateRecipe,
    private readonly parser = new ImportParsingClient(),
  ) {}

  private fetch(url: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    return this.recipe.engine.kind === 'builtin'
      ? adapter(url).fetchPageSnapshot(url, signal)
      : fetchScraperPage(url, signal ? { signal } : {});
  }

  async fetchCatalog(
    importedUrls: string[] = [],
    signal?: AbortSignal,
  ): Promise<{ ok: true; catalog: SyncCatalog } | Failure> {
    try {
      const catalog = await this.collectCatalog(signal);
      const known = [
        ...new Set(importedUrls.filter((url) => sameSite(url, this.recipe.catalogUrls))),
      ];
      const found = new Set(catalog.entries.map((entry) => entry.url));
      if (known.length && known.filter((url) => found.has(url)).length < known.length / 2)
        throw new BookSyncError('CATALOG_UNRECOGNIZED', '目录无法复现至少半数已导入章节');
      return { ok: true, catalog };
    } catch (error) {
      return failure(error, 'CATALOG_FETCH_FAILED');
    }
  }

  private async collectCatalog(signal?: AbortSignal): Promise<SyncCatalog> {
    const pending = [...this.recipe.catalogUrls];
    const visited = new Set<string>();
    const entries = new Map<string, CatalogEntry>();
    const builtin = this.recipe.engine.kind === 'builtin';
    const limit = builtin ? 500 : 50;
    let meta: SyncCatalog['meta'] | undefined;
    let priorGroup: string | undefined;
    while (pending.length && visited.size < limit) {
      signal?.throwIfAborted();
      const url = pending.shift()!;
      if (visited.has(url)) continue;
      visited.add(url);
      const snapshot = await this.fetch(url, signal);
      signal?.throwIfAborted();
      const page = await parseCatalog(
        snapshot.html,
        snapshot.responseUrl ?? url,
        this.recipe,
        this.parser,
        signal,
      );
      if (!meta && page.startUrl && page.startUrl !== url && !visited.has(page.startUrl)) {
        pending.unshift(page.startUrl);
        continue;
      }
      if (!page.catalog.entries.length)
        throw new BookSyncError('CATALOG_EMPTY', '目录未识别出章节');
      meta ??= page.catalog.meta;
      priorGroup = appendCatalogEntries(entries, page.catalog.entries, builtin, priorGroup);
      pending.push(...page.nextUrls.filter((next) => !visited.has(next)));
    }
    if (builtin && pending.some((url) => !visited.has(url)))
      throw new BookSyncError('CATALOG_FETCH_FAILED', '目录超过分页上限，无法确认完整性');
    if (!meta || !entries.size) throw new BookSyncError('CATALOG_EMPTY', '目录未识别出章节');
    return { meta, entries: [...entries.values()] };
  }

  async fetchChapter(
    entry: CatalogEntry,
    _imported: boolean,
    signal?: AbortSignal,
  ): Promise<{ ok: true; paragraphs: string[] } | Failure> {
    try {
      const snapshot = await this.fetch(entry.url, signal);
      signal?.throwIfAborted();
      const raw = parseChapter(snapshot.html, snapshot.responseUrl ?? entry.url, this.recipe);
      const paragraphs = await normalizeChapterText(raw, this.recipe, {
        title: entry.title,
        parser: this.parser,
        ...(signal ? { signal } : {}),
      });
      if (!paragraphs.some((text) => text.trim()))
        throw new BookSyncError('CONTENT_EMPTY', '来源章节正文为空');
      return { ok: true, paragraphs };
    } catch (error) {
      return failure(error, 'CONTENT_FETCH_FAILED');
    }
  }
}
