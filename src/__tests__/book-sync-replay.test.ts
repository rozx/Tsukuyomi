import { expect } from 'vitest';
import { afterEach, describe, it, mock, spyOn } from 'bun:test';
import './setup';
import type { BookUpdateRecipe } from '../models/book-sync';
import { BookSyncReplay, parseCatalog, parseChapter } from '../services/book-sync/replay';
import { NovelScraperFactory } from '../services/scraper/novel-scraper-factory';
import { NcodeSyosetuScraper } from '../services/scraper/scrapers/ncode-syosetu-scraper';
import * as transport from '../services/scraper/core/page-transport';
import { parseImportHtml } from '../services/import/import-html-parser';
import { normalizeChapterText } from '../services/book-sync/normalize';

const root = 'https://ncode.syosetu.com/n1234ab/';
const builtin: BookUpdateRecipe = {
  version: 1,
  engine: { kind: 'builtin', site: 'ncode' },
  catalogUrls: [root],
  verifiedChapterCount: 0,
  recordedAt: 0,
};
const htmlRecipe: BookUpdateRecipe = {
  ...builtin,
  engine: {
    kind: 'html',
    content: { selector: 'article' },
    catalogSelector: '.chapter-list',
    followNext: true,
  },
  catalogUrls: ['https://example.com/book'],
};
const snapshot = (html: string, url = root) => ({
  html,
  requestUrl: url,
  transportUrl: url,
  status: 200,
  contentType: 'text/html',
});
const index = (number: number, next = false) =>
  `<html><head><title>作品</title></head><body><div class="l-container"><main><article><h1>作品</h1><div class="p-eplist"><div class="p-eplist__chapter-title">第一部</div><div class="p-eplist__sublist"><a class="p-eplist__subtitle" href="/n1234ab/${number}/">第${number}话</a><div class="p-eplist__update">2026/09/22 12:00</div></div></div>${next ? '<a rel="next" href="?p=2">次へ</a>' : ''}</article></main></div></body></html>`;
const body =
  '<div class="p-novel__body"><div class="p-novel__text p-novel__text--preface"><p>前書き</p></div><div class="p-novel__text"><p>　本文</p><p></p><p>続き</p></div><div class="p-novel__text p-novel__text--afterword"><p>後書き</p></div></div>';
afterEach(() => mock.restore());

describe('配方回放', () => {
  it('内置目录严格逐页回放并保留分组和时间', async () => {
    const scraper = new NcodeSyosetuScraper();
    const fetch = spyOn(scraper, 'fetchPageSnapshot').mockImplementation((url) =>
      Promise.resolve(snapshot(index(url.includes('p=2') ? 2 : 1, !url.includes('p=2')), url)),
    );
    spyOn(NovelScraperFactory, 'getScraper').mockReturnValue(scraper);
    const result = await new BookSyncReplay(builtin).fetchCatalog();
    expect(result).toMatchObject({
      ok: true,
      catalog: {
        entries: [
          { url: root + '1/', group: '第一部' },
          { url: root + '2/', group: '第一部' },
        ],
      },
    });
    if (result.ok) expect(result.catalog.entries[0]?.lastUpdated).toBeInstanceOf(Date);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('第二页请求失败时没有部分目录', async () => {
    const scraper = new NcodeSyosetuScraper();
    spyOn(scraper, 'fetchPageSnapshot').mockImplementation((url) => {
      if (url.includes('p=2')) throw new Error('网络失败');
      return Promise.resolve(snapshot(index(1, true)));
    });
    spyOn(NovelScraperFactory, 'getScraper').mockReturnValue(scraper);
    expect(await new BookSyncReplay(builtin).fetchCatalog()).toMatchObject({
      ok: false,
      code: 'CATALOG_FETCH_FAILED',
    });
  });
  it('内置正文两种提取口径分别复用对应解析器', async () => {
    const scraper = new NcodeSyosetuScraper();
    const fetch = spyOn(scraper, 'fetchPageSnapshot').mockResolvedValue(snapshot(body));
    spyOn(NovelScraperFactory, 'getScraper').mockReturnValue(scraper);
    const imported = {
      ...builtin,
      engine: {
        kind: 'builtin' as const,
        site: 'ncode' as const,
        content: { preset: 'ncode' as const },
      },
    };
    expect(parseChapter(body, root, builtin)).toBe(scraper.parseChapterSnapshot(body).text);
    expect(parseChapter(body, root, imported)).toBe(
      parseImportHtml(body, { preset: 'ncode' }, root)
        .blocks.map((b) => b.text)
        .join('\n'),
    );
    expect(
      await new BookSyncReplay(imported).fetchChapter({ url: root + '1/', title: '第一话' }, true),
    ).toMatchObject({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('HTML 目录范围识别非标准链接、排除广告并按名称筛选', async () => {
    const recipe: BookUpdateRecipe = {
      ...htmlRecipe,
      engine: {
        ...htmlRecipe.engine,
        kind: 'html',
        content: {},
        chapterFilter: { name: { mode: 'literal', pattern: '话' } },
        catalogSelector: '.chapter-list',
      },
    };
    const result = await parseCatalog(
      '<h1>作品</h1><a href="/outside">外部话</a><section class="chapter-list"><a href="/1">第一话</a><div class="ad"><a href="/ad">广告话</a></div><a href="/extra">设定集</a></section>',
      'https://example.com/book',
      recipe,
    );
    expect(result.catalog.entries).toEqual([{ url: 'https://example.com/1', title: '第一话' }]);
  });
  it('无目录范围时只取 chapter，分页检测循环', async () => {
    const recipe: BookUpdateRecipe = {
      ...htmlRecipe,
      engine: { kind: 'html', content: {}, followNext: true },
    };
    const fetch = spyOn(transport, 'fetchScraperPage').mockImplementation((url) =>
      Promise.resolve(
        snapshot(
          '<nav><a href="/1">第一话</a></nav><a href="/unrelated">其他</a><a rel="next" href="/book">次へ</a>',
          url,
        ),
      ),
    );
    const result = await new BookSyncReplay(recipe).fetchCatalog();
    expect(result).toMatchObject({
      ok: true,
      catalog: { entries: [{ url: 'https://example.com/1' }] },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('HTML 分页最多 50 页', async () => {
    let count = 0;
    spyOn(transport, 'fetchScraperPage').mockImplementation((url) =>
      Promise.resolve(
        snapshot(
          `<div class="chapter-list"><a href="/chapter/${++count}">第${count}话</a></div><a rel="next" href="/book?p=${count + 1}">次へ</a>`,
          url,
        ),
      ),
    );
    const result = await new BookSyncReplay(htmlRecipe).fetchCatalog();
    expect(count).toBe(50);
    if (!result.ok) throw new Error(result.message);
    expect(result.catalog.entries).toHaveLength(50);
  });
  it.each([
    ['<title>Just a moment</title><form id="challenge-form"></form>', 'VERIFICATION_REQUIRED'],
    ['<h1>作品</h1>', 'CATALOG_EMPTY'],
  ])('目录失效 %s', async (html, code) => {
    spyOn(transport, 'fetchScraperPage').mockResolvedValue(snapshot(html));
    const result = await new BookSyncReplay(htmlRecipe).fetchCatalog();
    expect(result).toMatchObject({ ok: false, code });
    expect(result).not.toHaveProperty('catalog');
  });
  it('目录复现不到半数已导入同站章节时整体失效', async () => {
    spyOn(transport, 'fetchScraperPage').mockResolvedValue(
      snapshot('<div class="chapter-list"><a href="/1">第一话</a></div>'),
    );
    const result = await new BookSyncReplay(htmlRecipe).fetchCatalog([
      'https://example.com/1',
      'https://example.com/2',
      'https://example.com/3',
      'https://other.test/1',
    ]);
    expect(result).toMatchObject({ ok: false, code: 'CATALOG_UNRECOGNIZED' });
  });
  it('已导入章节正文为空时返回 CONTENT_EMPTY', async () => {
    spyOn(transport, 'fetchScraperPage').mockResolvedValue(snapshot('<article> </article>'));
    expect(
      await new BookSyncReplay(htmlRecipe).fetchChapter(
        { url: 'https://example.com/1', title: '第一话' },
        true,
      ),
    ).toMatchObject({ ok: false, code: 'CONTENT_EMPTY' });
  });
  it('固定 HTML 解析和清理输出快照', async () => {
    const parsed = parseImportHtml(body, { preset: 'ncode' }, root);
    expect({ blocks: parsed.blocks, links: parsed.links, kind: parsed.kind }).toMatchSnapshot();
    expect(
      await normalizeChapterText(parsed.blocks.map((b) => b.text).join('\n'), builtin),
    ).toMatchSnapshot();
  });
});

it.each([false, true])('回放正文与导入器实际提取结果逐字一致，内置站点=%s', async (isBuiltin) => {
  const { ImportExtractionService } = await import('../services/import/import-extraction-service');
  const { ImportParsingClient } = await import('../services/import/import-parsing-client');
  const { ImportRepository } = await import('../services/import/import-repository');
  const { ImportSourceService } = await import('../services/import/import-source-service');
  const { ImportContentService } = await import('../services/import/import-content-service');
  const { Blob } = await import('node:buffer');
  const { vi } = await import('vitest');
  vi.stubGlobal('Blob', Blob);
  try {
    const url = isBuiltin ? root + '1/' : 'https://example.com/chapter';
    const html = isBuiltin
      ? body
      : '<article><h1>第一话</h1><p>　本文</p><p></p><p>続き</p></article>';
    const recipe: BookUpdateRecipe = isBuiltin
      ? { ...builtin, engine: { kind: 'builtin', site: 'ncode', content: { preset: 'ncode' } } }
      : htmlRecipe;
    if (isBuiltin)
      spyOn(NovelScraperFactory.getScraper(url)!, 'fetchPageSnapshot').mockResolvedValue(
        snapshot(html, url),
      );
    else spyOn(transport, 'fetchScraperPage').mockResolvedValue(snapshot(html, url));
    const task = await ImportRepository.createTask();
    const source = await ImportSourceService.registerUrl(task.id, url);
    const importer = new ImportExtractionService(new ImportParsingClient(() => undefined));
    const prepared = await importer.prepareExtraction(task.id, [
      { sourceId: source.id, rules: recipe.engine.content! },
    ]);
    expect(prepared.results[0]?.success).toBe(true);
    await ImportRepository.saveStep(task.id, prepared);
    const imported = await ImportContentService.read(task.id, prepared.results[0]!.contentId!);
    const replayed = await new BookSyncReplay(recipe).fetchChapter({ url, title: '第一话' }, false);
    if (!replayed.ok) throw new Error(replayed.message);
    expect(replayed.paragraphs.join('\n')).toBe(imported.text);
  } finally {
    vi.unstubAllGlobals();
  }
});
