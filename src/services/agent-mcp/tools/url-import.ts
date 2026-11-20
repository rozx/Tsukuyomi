import { v4 } from 'uuid';
import type { AppLocale } from 'src/models/locale';
import { isAppLocale } from 'src/models/locale';
import type { Novel, Paragraph, Volume } from 'src/models/novel';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { titleOriginal } from 'src/services/localization/title-edit';
import { NovelScraperFactory, type NovelScraper } from 'src/services/scraper';
import { pickScraperConcurrency } from 'src/services/settings/settings-parsers';
import { useBooksStore } from 'src/stores/books';
import { useSettingsStore } from 'src/stores/settings';
import { mapConcurrent } from 'src/utils/map-concurrent';
import { agentMcpError, type AgentMcpToolSpec } from '../types';
import { describeChapters, loadChapterParagraphs, readTrimmedString } from './helpers';
import {
  buildParagraphs,
  countChaptersInVolumes,
  createEmptyVolume,
  splitTextToParagraphLines,
} from './library-helpers';

const DEFAULT_IMPORT_MAX_CHAPTERS = 20;
const MAX_IMPORT_CHAPTERS_PER_CALL = 50;
const URL_IMPORT_FALLBACK_HINT =
  'Fetch the novel content yourself and call create_book followed by add_chapters to import it directly.';
const URL_IMPORT_FALLBACK_TOOLS = ['create_book', 'add_chapters'] as const;
const EXISTING_BOOK_FALLBACK_TOOLS = ['add_chapters'] as const;

/** 同一规范化目录 URL 的在途导入锁，阻止重叠调用互相覆盖或重复抓取 */
const inFlightUrlImports = new Set<string>();

interface FailedChapterImport {
  title: string;
  url: string;
  error: string;
}

interface ChapterFetchTarget {
  chapterId: string;
  title: string;
  webUrl: string;
}

interface HydrateBatchResult {
  attemptedCount: number;
  fetchedByChapterId: Map<string, Paragraph[]>;
  pendingCount: number;
  failedChapters: FailedChapterImport[];
}

function normalizeComparableUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    parsed.hash = '';
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${pathname}${parsed.search}`;
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

function findExistingBookByUrls(
  books: readonly Novel[],
  candidates: readonly string[],
): Novel | undefined {
  const normalizedCandidates = new Set(candidates.map(normalizeComparableUrl).filter(Boolean));
  if (normalizedCandidates.size === 0) return undefined;
  return books.find((book) =>
    (book.webUrl ?? []).some((u) => normalizedCandidates.has(normalizeComparableUrl(u))),
  );
}

/**
 * 书仍留在书库时（已有书或已落盘部分章节）必须带回 book_id 并只建议 add_chapters，
 * 否则 Agent 按提示重新 create_book 会产生重复书。
 */
function buildUrlImportFailedError(
  url: string,
  message: string,
  extraDetails?: Record<string, unknown>,
  remainingBookId?: string | null,
) {
  if (remainingBookId) {
    return agentMcpError(
      'URL_IMPORT_FAILED',
      `${message} The book already exists in the library (book_id: ${remainingBookId}). Retry later, or fetch the missing chapter content yourself and call add_chapters with this book_id. Do not create the book again.`,
      {
        url,
        ...extraDetails,
        book_id: remainingBookId,
        fallback_tools: [...EXISTING_BOOK_FALLBACK_TOOLS],
      },
    );
  }
  return agentMcpError('URL_IMPORT_FAILED', `${message} ${URL_IMPORT_FALLBACK_HINT}`, {
    url,
    ...extraDetails,
    fallback_tools: [...URL_IMPORT_FALLBACK_TOOLS],
  });
}

function parseMaxChapters(value: unknown): number {
  if (value === undefined || value === null) return DEFAULT_IMPORT_MAX_CHAPTERS;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return DEFAULT_IMPORT_MAX_CHAPTERS;
  return Math.min(MAX_IMPORT_CHAPTERS_PER_CALL, Math.trunc(num));
}

async function fetchChapterTargets(
  targets: readonly ChapterFetchTarget[],
  scraper: NovelScraper,
  maxChapters: number,
): Promise<HydrateBatchResult> {
  const selected = targets.slice(0, maxChapters);
  const skippedCount = targets.length - selected.length;
  const failedChapters: FailedChapterImport[] = [];
  const fetchedByChapterId = new Map<string, Paragraph[]>();
  const concurrency = pickScraperConcurrency(useSettingsStore().settings.scraperConcurrencyLimit);

  await mapConcurrent(selected, concurrency, async (target) => {
    try {
      const text = await scraper.fetchChapterContent(target.webUrl);
      fetchedByChapterId.set(target.chapterId, buildParagraphs(splitTextToParagraphLines(text)));
    } catch (error) {
      failedChapters.push({
        title: target.title,
        url: target.webUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return {
    attemptedCount: selected.length,
    fetchedByChapterId,
    pendingCount: skippedCount + failedChapters.length,
    failedChapters,
  };
}

async function collectEmptyChapterTargets(
  volumes: readonly Volume[],
): Promise<ChapterFetchTarget[]> {
  const targets: ChapterFetchTarget[] = [];
  for (const vol of volumes) {
    for (const ch of vol.chapters ?? []) {
      if (!ch.webUrl) continue;
      if (ch.content && ch.content.length > 0) continue;
      const stored = await loadChapterParagraphs(ch);
      if (stored.length === 0) {
        targets.push({
          chapterId: ch.id,
          title: titleOriginal(ch.title),
          webUrl: ch.webUrl,
        });
      }
    }
  }
  return targets;
}

function collectBookChapterIds(book: Novel): Set<string> {
  const ids = new Set<string>();
  for (const vol of book.volumes ?? []) {
    for (const ch of vol.chapters ?? []) {
      ids.add(ch.id);
    }
  }
  return ids;
}

async function persistFetchedChapterContents(
  bookId: string,
  fetchedByChapterId: ReadonlyMap<string, Paragraph[]>,
): Promise<{ savedCount: number; bookDeleted: boolean }> {
  const booksStore = useBooksStore();
  const initialLiveBook = booksStore.getBookById(bookId);
  if (!initialLiveBook) {
    return { savedCount: 0, bookDeleted: true };
  }

  let savedCount = 0;
  for (const [chapterId, paragraphs] of fetchedByChapterId) {
    // 写入前确认目标书籍与章节仍然存在，防止导入中途删书/删章后写出孤儿记录
    const liveBook = booksStore.getBookById(bookId);
    if (!liveBook) {
      return { savedCount, bookDeleted: true };
    }
    if (!collectBookChapterIds(liveBook).has(chapterId)) continue;

    // 写入前再确认一次：若并发操作已写入该章正文/译文，绝不覆盖
    const existingContent = await ChapterContentService.loadChapterContent(chapterId);
    if (existingContent && existingContent.length > 0) continue;

    await ChapterContentService.saveChapterContent(chapterId, paragraphs, { bookId });
    savedCount += 1;
  }

  if (savedCount > 0 && booksStore.getBookById(bookId)) {
    await booksStore.refreshBookFromStorage(bookId);
  }
  return { savedCount, bookDeleted: !booksStore.getBookById(bookId) };
}

function indexExistingChaptersByUrl(volumes: readonly Volume[]): Set<string> {
  const index = new Set<string>();
  for (const vol of volumes) {
    for (const ch of vol.chapters ?? []) {
      const urlKey = ch.webUrl ? normalizeComparableUrl(ch.webUrl) : '';
      if (urlKey) index.add(urlKey);
    }
  }
  return index;
}

function findOrCreateVolumeByTitle(volumes: Volume[], title: string): Volume {
  const existing = volumes.find((v) => titleOriginal(v.title) === title);
  if (existing) return existing;
  const created = createEmptyVolume(title);
  volumes.push(created);
  return created;
}

function mergeUniqueUrls(
  baseUrls: readonly string[] | undefined,
  extraUrls: readonly string[],
): string[] {
  const merged = [...(baseUrls ?? [])];
  const seen = new Set(merged.map(normalizeComparableUrl));
  for (const candidate of extraUrls) {
    const key = normalizeComparableUrl(candidate);
    if (key && !seen.has(key)) {
      seen.add(key);
      merged.push(candidate);
    }
  }
  return merged;
}

function mergeCatalogIntoExistingVolumes(
  existing: Novel,
  fetched: Novel,
): { volumes: Volume[]; addedCount: number } {
  const volumes: Volume[] = (existing.volumes ?? []).map((v) => ({
    ...v,
    chapters: [...(v.chapters ?? [])],
  }));
  const existingChapterUrls = indexExistingChaptersByUrl(volumes);
  let addedCount = 0;

  for (const fetchedVol of fetched.volumes ?? []) {
    const volTitle = titleOriginal(fetchedVol.title);
    for (const fetchedCh of fetchedVol.chapters ?? []) {
      const urlKey = fetchedCh.webUrl ? normalizeComparableUrl(fetchedCh.webUrl) : '';
      if (urlKey && existingChapterUrls.has(urlKey)) continue;

      const targetVol = findOrCreateVolumeByTitle(volumes, volTitle);
      targetVol.chapters = [...(targetVol.chapters ?? []), { ...fetchedCh }];
      addedCount += 1;
      if (urlKey) existingChapterUrls.add(urlKey);
    }
  }

  return { volumes, addedCount };
}

async function prepareBookForUrlImport(
  fetchedNovel: Novel,
  url: string,
  catalogUrl: string,
  rawTargetLanguage: unknown,
): Promise<{
  bookId: string;
  isNewBook: boolean;
  addedCount: number;
  volumes: Volume[];
}> {
  const booksStore = useBooksStore();
  const existing = findExistingBookByUrls(booksStore.books, [
    url,
    catalogUrl,
    ...(fetchedNovel.webUrl ?? []),
  ]);

  if (existing) {
    const { volumes, addedCount } = mergeCatalogIntoExistingVolumes(existing, fetchedNovel);
    const mergedUrls = mergeUniqueUrls(existing.webUrl, [
      catalogUrl,
      ...(fetchedNovel.webUrl ?? []),
    ]);
    // 保留用户已编辑的书名、作者与简介，仅在本地为空时回填站点元数据
    await booksStore.updateBook(existing.id, {
      author: existing.author || fetchedNovel.author,
      description: existing.description || fetchedNovel.description,
      webUrl: mergedUrls,
      volumes,
      lastEdited: new Date(),
    });
    return { bookId: existing.id, isNewBook: false, addedCount, volumes };
  }

  const rawLang = typeof rawTargetLanguage === 'string' ? rawTargetLanguage : 'zh-CN';
  const targetLanguage: AppLocale = isAppLocale(rawLang) ? rawLang : 'zh-CN';
  const now = new Date();
  const volumes: Volume[] = (fetchedNovel.volumes ?? []).map((v) => ({
    ...v,
    chapters: (v.chapters ?? []).map((ch) => ({ ...ch })),
  }));
  const initialBook: Novel = {
    ...fetchedNovel,
    id: fetchedNovel.id || v4(),
    webUrl: mergeUniqueUrls(fetchedNovel.webUrl, [catalogUrl]),
    targetLanguage: fetchedNovel.targetLanguage ?? targetLanguage,
    volumes,
    createdAt: fetchedNovel.createdAt ?? now,
    lastEdited: now,
  };
  await booksStore.addBook(initialBook);
  return {
    bookId: initialBook.id,
    isNewBook: true,
    addedCount: countChaptersInVolumes(volumes),
    volumes,
  };
}

export const importBookFromUrlTool: AgentMcpToolSpec = {
  name: 'import_book_from_url',
  description:
    'Fetch and import (or incrementally update) a novel and its chapter contents from a supported site URL (syosetu.org, kakuyomu.jp, ncode.syosetu.com, novel18.syosetu.com). The result lists the chapters whose content was fetched in this call in fetched_chapters (chapter_id, volume_id, title_original, url). If unsupported or blocked by browser CORS, returns guidance to use create_book + add_chapters.',
  category: 'library',
  permission: 'translate_and_edit',
  readOnlyHint: false,
  requiresBookStore: true,
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Novel index page URL.' },
      target_language: {
        type: 'string',
        enum: ['zh-CN', 'zh-TW', 'en-US'],
        description: 'Target translation language (default zh-CN).',
      },
      max_chapters: {
        type: 'number',
        description:
          'Optional maximum number of missing chapters to fetch content for in this call (default 20, max 50). If pending_chapter_count > 0, call import_book_from_url again to resume remaining chapters.',
      },
    },
    required: ['url'],
  },
  execute: async (args) => {
    const url = readTrimmedString(args.url);
    if (!url) {
      return agentMcpError('INVALID_ARGS', 'url must be a non-empty string.');
    }

    const scraper = NovelScraperFactory.getScraper(url);
    if (!scraper) {
      return agentMcpError(
        'UNSUPPORTED_SITE',
        `URL is not supported by built-in scrapers (${NovelScraperFactory.getSupportedSites().join(', ')}). ${URL_IMPORT_FALLBACK_HINT}`,
        {
          url,
          supported_sites: NovelScraperFactory.getSupportedSites(),
          fallback_tools: [...URL_IMPORT_FALLBACK_TOOLS],
        },
      );
    }

    const catalogUrl = scraper.catalogUrl(url);
    const lockKey = normalizeComparableUrl(catalogUrl) || normalizeComparableUrl(url);
    if (inFlightUrlImports.has(lockKey)) {
      return agentMcpError(
        'IMPORT_IN_PROGRESS',
        'An import for this URL is already in progress. Wait for the active import to complete before retrying.',
        { url },
      );
    }

    let createdNewBookId: string | null = null;
    let preparedBookId: string | null = null;
    let savedAnyChapter = false;
    /** 失败返回前调用：书仍在书库则返回其 ID */
    const remainingBookId = (): string | null =>
      preparedBookId && useBooksStore().getBookById(preparedBookId) ? preparedBookId : null;

    inFlightUrlImports.add(lockKey);
    try {
      const fetched = await scraper.fetchNovel(url);
      if (!fetched.success || !fetched.novel) {
        return buildUrlImportFailedError(
          url,
          `Failed to fetch novel from URL: ${fetched.error ?? 'Unknown error'}.`,
          { reason: fetched.error ?? 'Unknown error' },
        );
      }

      const prepared = await prepareBookForUrlImport(
        fetched.novel,
        url,
        catalogUrl,
        args.target_language,
      );
      preparedBookId = prepared.bookId;
      if (prepared.isNewBook) {
        createdNewBookId = prepared.bookId;
      }

      const targets = await collectEmptyChapterTargets(prepared.volumes);
      const batch = await fetchChapterTargets(
        targets,
        scraper,
        parseMaxChapters(args.max_chapters),
      );

      if (batch.attemptedCount > 0 && batch.fetchedByChapterId.size === 0) {
        if (createdNewBookId && useBooksStore().getBookById(createdNewBookId)) {
          await useBooksStore().deleteBook(createdNewBookId);
          createdNewBookId = null;
        }
        return buildUrlImportFailedError(
          url,
          'Failed to fetch chapter contents from URL.',
          { failed_chapters: batch.failedChapters },
          remainingBookId(),
        );
      }

      const { savedCount, bookDeleted } = await persistFetchedChapterContents(
        prepared.bookId,
        batch.fetchedByChapterId,
      );
      savedAnyChapter = savedCount > 0;

      if (bookDeleted) {
        return agentMcpError(
          'BOOK_NOT_FOUND',
          `Book ${prepared.bookId} was deleted while importing chapter contents.`,
        );
      }

      const latestBook = useBooksStore().getBookById(prepared.bookId)!;
      const latestVolumes = latestBook.volumes ?? prepared.volumes;

      return {
        book_id: prepared.bookId,
        title: latestBook.title,
        author: latestBook.author ?? '',
        updated_existing: !prepared.isNewBook,
        volume_count: latestVolumes.length,
        chapter_count: countChaptersInVolumes(latestVolumes),
        added_chapter_count: prepared.addedCount,
        fetched_chapter_count: savedCount,
        // 本次抓到正文的章节，可直接拿去翻译
        fetched_chapters: describeChapters(latestBook, (chapter) =>
          batch.fetchedByChapterId.has(chapter.id),
        ),
        pending_chapter_count: batch.pendingCount,
        has_more: batch.pendingCount > 0,
        failed_chapters: batch.failedChapters,
      };
    } catch (error) {
      // 新建目录壳后若在落盘阶段意外抛错且尚无任何章节成功写入，则回滚删除空壳书避免产生重复书
      if (createdNewBookId && !savedAnyChapter && useBooksStore().getBookById(createdNewBookId)) {
        try {
          await useBooksStore().deleteBook(createdNewBookId);
        } catch {
          // 回滚失败不影响返回原始导入错误
        }
      }
      const reason = error instanceof Error ? error.message : String(error);
      return buildUrlImportFailedError(
        url,
        `Failed to import novel from URL: ${reason}.`,
        { reason },
        remainingBookId(),
      );
    } finally {
      inFlightUrlImports.delete(lockKey);
    }
  },
};
