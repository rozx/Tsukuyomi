import Fuse from 'fuse.js';
import { getDB } from 'src/utils/indexed-db';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { BookService } from 'src/services/book-service';
import type { Novel, Chapter, Paragraph } from 'src/models/novel';
import type { ParagraphSearchResult } from 'src/services/chapter-service';

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
  private static buildIndexDocuments(
    novel: Novel,
    chapters: Map<string, Chapter>,
  ): IndexDocument[] {
    const documents: IndexDocument[] = [];

    if (!novel.volumes) {
      return documents;
    }

    for (let vIndex = 0; vIndex < novel.volumes.length; vIndex++) {
      const volume = novel.volumes[vIndex];
      if (!volume || !volume.chapters) continue;

      for (let cIndex = 0; cIndex < volume.chapters.length; cIndex++) {
        const chapter = volume.chapters[cIndex];
        if (!chapter) continue;

        // 获取章节内容（可能已加载或需要从独立存储加载）
        let chapterWithContent = chapters.get(chapter.id) || chapter;
        if (!chapterWithContent.content && chapter.contentLoaded !== false) {
          // 如果章节内容未加载，尝试从缓存中获取
          chapterWithContent = chapter;
        }

        const chapterTitleOriginal = chapter.title.original || '';
        const chapterTitleTranslation = chapter.title.translation?.translation || '';

        if (chapterWithContent.content) {
          for (let pIndex = 0; pIndex < chapterWithContent.content.length; pIndex++) {
            const paragraph = chapterWithContent.content[pIndex];
            if (!paragraph) continue;

            const translations = paragraph.translations
              ? paragraph.translations.map((t) => t.translation || '').filter((t) => t.trim())
              : [];

            documents.push({
              paragraphId: paragraph.id,
              chapterId: chapter.id,
              volumeIndex: vIndex,
              chapterIndex: cIndex,
              paragraphIndex: pIndex,
              originalText: paragraph.text || '',
              translations,
              chapterTitleOriginal,
              chapterTitleTranslation,
            });
          }
        }
      }
    }

    return documents;
  }

  /**
   * 构建全文索引
   */
  static async buildIndex(bookId: string, novel: Novel): Promise<Fuse<IndexDocument>> {
    // 加载所有章节内容
    await ChapterContentService.loadAllChapterContents(novel);

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
        console.warn('full-text-indexes store not found, skipping index save. Database may need to be upgraded.');
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
  static async loadIndex(bookId: string): Promise<Fuse<IndexDocument> | null> {
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

    // 如果索引不存在，尝试构建
    try {
      const novel = await BookService.getBookById(bookId, true);
      if (novel) {
        return await this.buildIndex(bookId, novel);
      }
    } catch (error) {
      console.error(`Failed to build index for ${bookId}:`, error);
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
    } = options;

    if (keywords.length === 0) {
      return [];
    }

    // 加载索引
    const fuse = await this.loadIndex(bookId);
    if (!fuse) {
      console.warn(`Index not available for book ${bookId}, falling back to linear search`);
      return [];
    }

    // 对每个关键词分别搜索（OR 逻辑），然后合并结果
    const allSearchResults: Array<{ item: IndexDocument; score?: number }> = [];
    const seenParagraphIds = new Set<string>();

    for (const keyword of keywords) {
      const keywordResults = fuse.search(keyword, {
        limit: maxResults * 2, // 获取更多结果以便过滤
      });

      for (const result of keywordResults) {
        // 去重：使用段落 ID
        if (!seenParagraphIds.has(result.item.paragraphId)) {
          seenParagraphIds.add(result.item.paragraphId);
          allSearchResults.push(result);
        }
      }
    }

    // 按分数排序（如果有）
    const searchResults = allSearchResults.sort((a, b) => {
      const scoreA = a.score ?? 1;
      const scoreB = b.score ?? 1;
      return scoreA - scoreB; // 分数越低越好
    });

    // 转换为 ParagraphSearchResult
    const results: ParagraphSearchResult[] = [];
    const novel = await BookService.getBookById(bookId, false);
    if (!novel || !novel.volumes) {
      return [];
    }

    for (const result of searchResults) {
      const doc = result.item;

      // 如果指定了章节 ID，只返回该章节的段落
      if (chapterId && doc.chapterId !== chapterId) {
        continue;
      }

      // 检查是否在原文或翻译中搜索
      // Fuse.js 已经做了匹配，但我们需要根据 searchInOriginal 和 searchInTranslations 选项进一步过滤
      let shouldInclude = false;
      
      if (searchInOriginal && searchInTranslations) {
        // 搜索两者，Fuse.js 结果已经匹配了
        shouldInclude = true;
      } else if (searchInOriginal) {
        // 只在原文中搜索，检查原文是否匹配任一关键词
        shouldInclude = keywords.some((kw) =>
          doc.originalText.toLowerCase().includes(kw.toLowerCase()),
        );
      } else if (searchInTranslations) {
        // 只在翻译中搜索，检查翻译是否匹配任一关键词
        shouldInclude = doc.translations.some((t) =>
          keywords.some((kw) => t.toLowerCase().includes(kw.toLowerCase())),
        );
      }

      if (!shouldInclude) {
        continue;
      }

      // 获取章节和段落对象
      const volume = novel.volumes[doc.volumeIndex];
      if (!volume || !volume.chapters) continue;

      const chapter = volume.chapters[doc.chapterIndex];
      if (!chapter) continue;

      // 如果章节内容未加载，加载它
      if (chapter.content === undefined) {
        const content = await ChapterContentService.loadChapterContent(chapter.id);
        chapter.content = content || [];
        chapter.contentLoaded = true;
      }

      if (!chapter.content) continue;

      const paragraph = chapter.content[doc.paragraphIndex];
      if (!paragraph) continue;

      // 如果要求只返回有翻译的段落，检查段落是否有翻译
      if (onlyWithTranslation) {
        const hasTranslation =
          paragraph.translations &&
          paragraph.translations.length > 0 &&
          paragraph.translations.some((t) => t.translation && t.translation.trim().length > 0);
        if (!hasTranslation) {
          continue;
        }
      }

      results.push({
        paragraph,
        paragraphIndex: doc.paragraphIndex,
        chapter,
        chapterIndex: doc.chapterIndex,
        volume,
        volumeIndex: doc.volumeIndex,
      });

      if (results.length >= maxResults) {
        break;
      }
    }

    return results;
  }

  /**
   * 更新索引（当章节内容改变时）
   */
  static async updateIndexForChapter(bookId: string, chapterId: string): Promise<void> {
    // 使索引失效，下次搜索时重建
    await this.invalidateIndex(bookId);
  }

  /**
   * 更新索引（当段落内容改变时）
   */
  static async updateIndexForParagraph(
    bookId: string,
    chapterId: string,
    paragraphId: string,
  ): Promise<void> {
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

  /**
   * 清除索引（从内存和 IndexedDB）
   */
  static async clearIndex(bookId: string): Promise<void> {
    await this.invalidateIndex(bookId);
  }

  /**
   * 清除所有缓存
   */
  static clearAllCache(): void {
    this.indexCache.clear();
  }
}

