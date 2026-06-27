import Fuse from 'fuse.js';
import { getDB } from 'src/utils/indexed-db';
import { loadChapterContent } from 'src/utils/chapter-content-loader';
import type { Novel, Chapter } from 'src/models/novel';
import type { ParagraphSearchResult } from 'src/models/paragraph-search';
import { findChapterById } from 'src/utils/novel-utils';
import { hasNonEmptyTranslation } from 'src/utils/text-utils';

/**
 * 索引文档结构
 */
interface IndexDocument {
  paragraphId: string;
  chapterId: string;
  volumeIndex: number;
  chapterIndex: number;
  paragraphIndex: number;
  originalText: string;
  translations: string[];
  chapterTitleOriginal: string;
  chapterTitleTranslation: string;
}

/**
 * 全文索引存储结构
 */
interface FullTextIndex {
  bookId: string;
  indexData: string; // 序列化的索引文档数组（JSON）
  lastUpdated: string; // ISO 日期字符串
}

/**
 * 搜索选项
 */
export interface SearchOptions {
  chapterId?: string;
  maxResults?: number;
  onlyWithTranslation?: boolean;
  searchInOriginal?: boolean; // 是否在原文中搜索（默认 true）
  searchInTranslations?: boolean; // 是否在翻译中搜索（默认 true）
  /**
   * 可选：直接提供当前的 novel 引用（例如 Pinia booksStore 中的对象），
   * 用于确保 search 返回的 paragraph/chapter 引用与调用方保持一致。
   *
   * 背景：如果不提供 novel，search 会通过 BookService.getBookById 重新加载一份数据，
   * 这会导致返回的对象与 UI/store 中的对象不是同一引用，进而引发“修改后保存没生效”的问题。
   */
  novel?: Novel;
}

/**
 * 对每个 keyword 分别用 Fuse.js 搜索（OR 语义），去重后按分值升序排序。
 */
function runFuseKeywordSearch(
  fuse: Fuse<IndexDocument>,
  keywords: string[],
  maxResults: number,
): Array<{ item: IndexDocument; score?: number }> {
  const all: Array<{ item: IndexDocument; score?: number }> = [];
  const seen = new Set<string>();
  for (const keyword of keywords) {
    const kwResults = fuse.search(keyword, { limit: maxResults * 2 });
    for (const result of kwResults) {
      if (seen.has(result.item.paragraphId)) continue;
      seen.add(result.item.paragraphId);
      all.push(result);
    }
  }
  return all.sort((a, b) => (a.score ?? 1) - (b.score ?? 1));
}

/**
 * Fuse.js 也会扫章节标题，因此需要按选项进一步验证匹配落在原文 / 翻译中（而非仅标题）。
 */
function keywordMatchesDocScope(
  doc: IndexDocument,
  keywords: string[],
  searchInOriginal: boolean,
  searchInTranslations: boolean,
): boolean {
  const inOriginal = (): boolean =>
    keywords.some((kw) => doc.originalText.toLowerCase().includes(kw.toLowerCase()));
  const inTranslations = (): boolean =>
    doc.translations.some((t) =>
      keywords.some((kw) => t.toLowerCase().includes(kw.toLowerCase())),
    );
  if (searchInOriginal && searchInTranslations) return inOriginal() || inTranslations();
  if (searchInOriginal) return inOriginal();
  if (searchInTranslations) return inTranslations();
  return false;
}

/**
 * 从索引文档还原 ParagraphSearchResult。先按 index 快速定位，ID 不一致时按 ID 再查找；
 * 按需加载章节内容；最终返回 null 表示应跳过。
 */
async function locateParagraphFromDoc(
  novel: Novel,
  doc: IndexDocument,
): Promise<ParagraphSearchResult | null> {
  let volume = novel.volumes![doc.volumeIndex];
  let chapter: Chapter | undefined = volume?.chapters?.[doc.chapterIndex];
  if (!chapter || chapter.id !== doc.chapterId) {
    const chapterLocation = findChapterById(novel, doc.chapterId);
    if (!chapterLocation) return null;
    volume = chapterLocation.volume;
    chapter = chapterLocation.chapter;
  }
  if (!volume || !chapter) return null;

  if (chapter.content === undefined) {
    const content = await loadChapterContent(chapter.id);
    chapter.content = content || [];
    chapter.contentLoaded = true;
  }
  if (!chapter.content) return null;

  let paragraphIndex = doc.paragraphIndex;
  let paragraph = chapter.content[paragraphIndex];
  if (!paragraph || paragraph.id !== doc.paragraphId) {
    const idx = chapter.content.findIndex((p) => p?.id === doc.paragraphId);
    if (idx < 0) return null;
    paragraphIndex = idx;
    paragraph = chapter.content[paragraphIndex];
    if (!paragraph) return null;
  }
  return {
    paragraph,
    paragraphIndex,
    chapter,
    chapterIndex: volume.chapters ? volume.chapters.indexOf(chapter) : doc.chapterIndex,
    volume,
    volumeIndex: novel.volumes!.indexOf(volume),
  };
}

/**
 * 全文索引服务
 * 使用 Fuse.js 提供快速全文搜索功能
 */
export class FullTextIndexService {
  // LRU 内存缓存，避免重复加载
  private static indexCache = new Map<string, Fuse<IndexDocument>>();
  private static readonly CACHE_MAX_SIZE = 10; // 最多缓存 10 个索引

  /**
   * 清理缓存（当缓存过大时）
   */
  private static evictCacheIfNeeded(): void {
    if (this.indexCache.size > this.CACHE_MAX_SIZE) {
      // 删除最旧的 20% 的缓存项
      const entriesToDelete = Math.floor(this.CACHE_MAX_SIZE * 0.2);
      const keysToDelete = Array.from(this.indexCache.keys()).slice(0, entriesToDelete);
      for (const key of keysToDelete) {
        this.indexCache.delete(key);
      }
    }
  }

  /**
   * 更新缓存条目的访问顺序（LRU 行为）
   */
  private static touchCacheEntry(bookId: string): void {
    if (this.indexCache.has(bookId)) {
      const cached = this.indexCache.get(bookId)!;
      this.indexCache.delete(bookId);
      this.indexCache.set(bookId, cached);
    }
  }

  /**
   * 从章节和段落构建索引文档
   */
  private static collectChapterDocuments(
    chapter: Chapter,
    chapters: Map<string, Chapter>,
    volumeIndex: number,
    chapterIndex: number,
  ): IndexDocument[] {
    const chapterWithContent = chapters.get(chapter.id) || chapter;
    if (!chapterWithContent.content) return [];

    const chapterTitleOriginal =
      typeof chapter.title === 'string' ? chapter.title : chapter.title.original || '';
    const chapterTitleTranslation =
      typeof chapter.title === 'string' ? '' : chapter.title.translation?.translation || '';

    const docs: IndexDocument[] = [];
    for (let pIndex = 0; pIndex < chapterWithContent.content.length; pIndex++) {
      const paragraph = chapterWithContent.content[pIndex];
      if (!paragraph) continue;
      const translations = paragraph.translations
        ? paragraph.translations.map((t) => t.translation || '').filter((t) => t.trim())
        : [];
      docs.push({
        paragraphId: paragraph.id,
        chapterId: chapter.id,
        volumeIndex,
        chapterIndex,
        paragraphIndex: pIndex,
        originalText: paragraph.text || '',
        translations,
        chapterTitleOriginal,
        chapterTitleTranslation,
      });
    }
    return docs;
  }

  private static buildIndexDocuments(
    novel: Novel,
    chapters: Map<string, Chapter>,
  ): IndexDocument[] {
    if (!novel.volumes) return [];
    const documents: IndexDocument[] = [];
    for (let vIndex = 0; vIndex < novel.volumes.length; vIndex++) {
      const volume = novel.volumes[vIndex];
      if (!volume?.chapters) continue;
      for (let cIndex = 0; cIndex < volume.chapters.length; cIndex++) {
        const chapter = volume.chapters[cIndex];
        if (!chapter) continue;
        documents.push(...this.collectChapterDocuments(chapter, chapters, vIndex, cIndex));
      }
    }
    return documents;
  }

  /**
   * 构建全文索引
   */
  static async buildIndex(bookId: string, novel: Novel): Promise<Fuse<IndexDocument>> {
    // 加载所有未加载章节的内容（直接通过 loader 读，避免 import
    // chapter-content-service 形成循环依赖）
    if (novel.volumes) {
      for (const volume of novel.volumes) {
        if (!volume.chapters) continue;
        for (let i = 0; i < volume.chapters.length; i++) {
          const chapter = volume.chapters[i];
          if (chapter && chapter.content === undefined) {
            const content = await loadChapterContent(chapter.id);
            volume.chapters[i] = {
              ...chapter,
              content: content || [],
              contentLoaded: true,
            };
          }
        }
      }
    }

    // 构建章节映射（包含已加载的内容）
    const chaptersMap = new Map<string, Chapter>();
    if (novel.volumes) {
      for (const volume of novel.volumes) {
        if (volume.chapters) {
          for (const chapter of volume.chapters) {
            chaptersMap.set(chapter.id, chapter);
          }
        }
      }
    }

    // 构建索引文档
    const documents = this.buildIndexDocuments(novel, chaptersMap);

    // 创建 Fuse.js 索引
    const fuse = new Fuse<IndexDocument>(documents, {
      keys: [
        { name: 'originalText', weight: 1.0 },
        { name: 'translations', weight: 0.8 },
        { name: 'chapterTitleOriginal', weight: 0.3 },
        { name: 'chapterTitleTranslation', weight: 0.3 },
      ],
      threshold: 0.3, // 模糊匹配阈值
      includeScore: true,
      minMatchCharLength: 1,
      ignoreLocation: true, // 忽略位置，提高性能
    });

    // 保存到 IndexedDB
    await this.saveIndex(bookId, documents);

    // 更新内存缓存
    this.indexCache.set(bookId, fuse);
    this.evictCacheIfNeeded();

    return fuse;
  }

  /**
   * 保存索引到 IndexedDB
   */
  private static async saveIndex(bookId: string, documents: IndexDocument[]): Promise<void> {
    try {
      const db = await getDB();
      // 检查存储是否存在
      if (!db.objectStoreNames.contains('full-text-indexes')) {
        // 存储不存在，说明数据库还未升级，跳过保存
        console.warn(
          'full-text-indexes store not found, skipping index save. Database may need to be upgraded.',
        );
        return;
      }
      const indexData: FullTextIndex = {
        bookId,
        indexData: JSON.stringify(documents),
        lastUpdated: new Date().toISOString(),
      };
      await db.put('full-text-indexes', indexData);
    } catch (error) {
      // 如果存储不存在，只记录警告，不抛出错误
      if (error instanceof Error && error.name === 'NotFoundError') {
        console.warn('full-text-indexes store not found, skipping index save.');
        return;
      }
      console.error(`Failed to save full-text index for ${bookId}:`, error);
      // 不抛出错误，允许索引构建失败但不影响主流程
    }
  }

  /**
   * 从 IndexedDB 加载索引
   */
  private static async loadIndexFromDB(bookId: string): Promise<Fuse<IndexDocument> | null> {
    try {
      const db = await getDB();
      // 检查存储是否存在
      if (!db.objectStoreNames.contains('full-text-indexes')) {
        // 存储不存在，说明数据库还未升级
        return null;
      }
      const stored = await db.get('full-text-indexes', bookId);
      if (!stored?.indexData) {
        return null;
      }

      const documents = JSON.parse(stored.indexData) as IndexDocument[];

      // 创建 Fuse.js 索引
      const fuse = new Fuse<IndexDocument>(documents, {
        keys: [
          { name: 'originalText', weight: 1.0 },
          { name: 'translations', weight: 0.8 },
          { name: 'chapterTitleOriginal', weight: 0.3 },
          { name: 'chapterTitleTranslation', weight: 0.3 },
        ],
        threshold: 0.3,
        includeScore: true,
        minMatchCharLength: 1,
        ignoreLocation: true,
      });

      return fuse;
    } catch (error) {
      console.error(`Failed to load full-text index for ${bookId}:`, error);
      return null;
    }
  }

  /**
   * 加载索引（从内存缓存或 IndexedDB）
   */
  static async loadIndex(
    bookId: string,
    novelForBuild?: Novel,
  ): Promise<Fuse<IndexDocument> | null> {
    // 检查内存缓存
    if (this.indexCache.has(bookId)) {
      this.touchCacheEntry(bookId);
      return this.indexCache.get(bookId)!;
    }

    // 从 IndexedDB 加载
    const fuse = await this.loadIndexFromDB(bookId);
    if (fuse) {
      this.indexCache.set(bookId, fuse);
      this.evictCacheIfNeeded();
      return fuse;
    }

    // 如果索引不存在且调用方提供了 novel，尝试就地构建；
    // 否则返回 null，让调用方走降级路径或显式调 buildIndex。
    // （移除对 BookService.getBookById 的反向 lookup 是为了打破 ftis → book-service 的循环依赖）
    if (novelForBuild) {
      try {
        return await this.buildIndex(bookId, novelForBuild);
      } catch (error) {
        console.error(`Failed to build index for ${bookId}:`, error);
      }
    }

    return null;
  }

  /**
   * 搜索段落
   */
  static async search(
    bookId: string,
    keywords: string[],
    options: SearchOptions = {},
  ): Promise<ParagraphSearchResult[]> {
    const {
      chapterId,
      maxResults = 100,
      onlyWithTranslation = false,
      searchInOriginal = true,
      searchInTranslations = true,
      novel: novelOverride,
    } = options;

    if (keywords.length === 0) return [];

    // 加载索引（若不存在，传入 novelOverride 以供就地构建）
    const fuse = await this.loadIndex(bookId, novelOverride);
    if (!fuse) {
      console.warn(`Index not available for book ${bookId}, falling back to linear search`);
      return [];
    }

    const searchResults = runFuseKeywordSearch(fuse, keywords, maxResults);
    // novelOverride 应由调用方传入；若缺失则无法把索引匹配映射回具体段落/章节引用
    // (移除对 BookService.getBookById 的反向 lookup 是为了打破 ftis → book-service 的循环依赖)
    if (!novelOverride || !novelOverride.volumes) return [];
    const novel = novelOverride;

    const results: ParagraphSearchResult[] = [];
    for (const result of searchResults) {
      const doc = result.item;
      if (chapterId && doc.chapterId !== chapterId) continue;
      if (!keywordMatchesDocScope(doc, keywords, searchInOriginal, searchInTranslations)) continue;

      const located = await locateParagraphFromDoc(novel, doc);
      if (!located) continue;
      if (onlyWithTranslation && !hasNonEmptyTranslation(located.paragraph)) continue;

      results.push(located);
      if (results.length >= maxResults) break;
    }
    return results;
  }

  /**
   * 更新索引（当章节内容改变时）
   */
  static async updateIndexForChapter(bookId: string, _chapterId: string): Promise<void> {
    // 使索引失效，下次搜索时重建
    await this.invalidateIndex(bookId);
  }

  /**
   * 使索引失效（强制下次搜索时重建）
   */
  static async invalidateIndex(bookId: string): Promise<void> {
    // 从内存缓存中移除
    this.indexCache.delete(bookId);

    // 从 IndexedDB 中删除（如果存储存在）
    try {
      const db = await getDB();
      // 检查存储是否存在
      if (db.objectStoreNames.contains('full-text-indexes')) {
        await db.delete('full-text-indexes', bookId);
      }
      // 如果存储不存在，说明数据库还未升级，这是正常的，不需要报错
    } catch (error) {
      // 如果删除失败（例如存储不存在），只记录警告，不抛出错误
      // 这可能在数据库升级之前发生，是正常情况
      if (error instanceof Error && error.name === 'NotFoundError') {
        // 存储不存在，这是正常的（数据库可能还未升级）
        return;
      }
      console.warn(`Failed to invalidate index for ${bookId}:`, error);
    }
  }

}
