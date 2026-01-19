import { getDB } from 'src/utils/indexed-db';
import type { Paragraph, Novel } from 'src/models/novel';

/**
 * 章节内容存储结构
 */
interface ChapterContent {
  chapterId: string;
  content: string; // 序列化为 JSON 字符串的段落数组
  lastModified: string; // ISO 日期字符串
}

/**
 * 章节内容服务类
 * 负责章节内容的独立存储和懒加载
 */
export class ChapterContentService {
  /**
   * 将章节内容序列化为 JSON 字符串。
   * 注意：我们使用“序列化快照”来做变更检测，避免“同一对象引用被就地修改”时无法发现变化。
   */
  private static serializeContent(content: Paragraph[]): string {
    return JSON.stringify(content);
  }

  /**
   * 缓存条目：同时保存解析后的对象与不可变序列化快照（用于变更检测）
   */
  private static contentCache = new Map<
    string,
    { parsed: Paragraph[]; serialized: string } | null
  >();
  private static readonly CACHE_MAX_SIZE = 100; // 最多缓存 100 个章节

  /**
   * 检查章节内容是否已修改（与缓存或已保存的内容比较）
   * @param chapterId 章节 ID
   * @param newContent 新的章节内容
   * @param newSerialized newContent 的序列化字符串（可选，用于避免重复 JSON.stringify）
   * @returns 如果内容已修改返回 true，否则返回 false
   */
  static async hasContentChanged(
    chapterId: string,
    newContent: Paragraph[],
    newSerialized?: string,
  ): Promise<boolean> {
    const serialized = newSerialized ?? this.serializeContent(newContent);
    // 先检查缓存
    if (this.contentCache.has(chapterId)) {
      const cached = this.contentCache.get(chapterId);
      // 更新访问顺序（LRU 行为）
      this.touchCacheEntry(chapterId);
      // 理论上 has() 为 true 时 get() 不应返回 undefined，但 TS 无法收窄，且这里兜底更安全
      if (cached === undefined) {
        return true;
      }
      // 如果缓存为 null（表示不存在），则认为已修改
      if (cached === null) {
        return true;
      }
      // 重要：缓存中的 parsed 可能与 UI/AI 工具共享引用并被就地修改，
      // 因此不能用对象深比较或引用相等来判断是否变化。
      // 必须对比不可变的序列化快照，才能同时正确处理：
      // - 同引用但未修改（应返回 false）
      // - 同引用但已就地修改（应返回 true）
      return cached.serialized !== serialized;
    }

    // 缓存中没有，从 IndexedDB 加载
    try {
      const db = await getDB();
      const chapterContent = await db.get('chapter-contents', chapterId);
      if (!chapterContent?.content) {
        // 不存在，缓存 null 表示不存在，避免重复查询
        this.contentCache.set(chapterId, null);
        this.evictCacheIfNeeded();
        return true;
      }
      const savedSerialized = chapterContent.content;
      // 反序列化并写入缓存（后续加载可直接复用解析结果）
      const saved = JSON.parse(savedSerialized) as Paragraph[];
      // 更新缓存，避免下次再次从 IndexedDB 加载
      this.contentCache.set(chapterId, { parsed: saved, serialized: savedSerialized });
      this.evictCacheIfNeeded();
      // 更新访问顺序（LRU 行为）
      this.touchCacheEntry(chapterId);
      // 使用序列化快照比较，避免“共享引用就地修改”导致的误判
      return savedSerialized !== serialized;
    } catch (error) {
      // 加载失败，为了安全起见，认为已修改
      // 缓存 null 表示加载失败，避免重复尝试
      console.warn(`Failed to check content changes for ${chapterId}:`, error);
      this.contentCache.set(chapterId, null);
      this.evictCacheIfNeeded();
      return true;
    }
  }

  /**
   * 保存章节内容到独立存储
   * @param chapterId 章节 ID
   * @param content 章节内容（段落数组）
   * @param options 保存选项
   * @param options.skipIfUnchanged 如果内容未修改则跳过保存，默认为 false
   */
  static async saveChapterContent(
    chapterId: string,
    content: Paragraph[],
    options?: { skipIfUnchanged?: boolean },
  ): Promise<boolean> {
    const serialized = this.serializeContent(content);
    // 如果启用了 skipIfUnchanged，先检查内容是否已修改
    if (options?.skipIfUnchanged) {
      const hasChanged = await this.hasContentChanged(chapterId, content, serialized);
      if (!hasChanged) {
        // 内容未修改，跳过保存
        return false;
      }
    }
    try {
      const db = await getDB();

      const chapterContent: ChapterContent = {
        chapterId,
        content: serialized, // 序列化为 JSON 字符串
        lastModified: new Date().toISOString(),
      };

      await db.put('chapter-contents', chapterContent);
      // 更新缓存
      this.contentCache.set(chapterId, { parsed: content, serialized });
      this.evictCacheIfNeeded();

      // 使全文索引失效（异步，不阻塞保存操作）
      // 从章节内容中提取 bookId（需要从 books store 查找）
      try {
        const { FullTextIndexService } = await import('src/services/full-text-index-service');
        // 尝试从 books store 查找包含此章节的书籍
        const { BookService } = await import('src/services/book-service');
        const books = await BookService.getAllBooks();
        for (const book of books) {
          if (book.volumes) {
            for (const volume of book.volumes) {
              if (volume.chapters?.some((c) => c.id === chapterId)) {
                // 找到包含此章节的书籍，使索引失效
                await FullTextIndexService.updateIndexForChapter(book.id, chapterId);
                break;
              }
            }
          }
        }
      } catch (error) {
        // 索引更新失败不影响内容保存
        console.warn('Failed to update full-text index after saving chapter content:', error);
      }
      return true; // 保存成功
    } catch (error) {
      console.error(`Failed to save chapter content for ${chapterId}:`, error);
      throw error;
    }
  }

  // LRU 内存缓存，避免重复加载
  // 使用 Map 的插入顺序实现 LRU：最近访问的条目会被移动到末尾
  // （定义见文件顶部：contentCache 与 CACHE_MAX_SIZE）

  /**
   * 清理缓存（当缓存过大时）
   * 使用 LRU 策略：删除最久未使用的 20% 的缓存项（Map 开头的条目）
   */
  private static evictCacheIfNeeded(): void {
    if (this.contentCache.size > this.CACHE_MAX_SIZE) {
      // 删除最旧的 20% 的缓存项
      const entriesToDelete = Math.floor(this.CACHE_MAX_SIZE * 0.2);
      const keysToDelete = Array.from(this.contentCache.keys()).slice(0, entriesToDelete);
      for (const key of keysToDelete) {
        this.contentCache.delete(key);
      }
    }
  }

  /**
   * 更新缓存条目的访问顺序（LRU 行为）
   * 将指定的缓存条目移动到 Map 末尾，表示最近使用
   * @param chapterId 章节 ID
   */
  private static touchCacheEntry(chapterId: string): void {
    if (this.contentCache.has(chapterId)) {
      const cached = this.contentCache.get(chapterId)!;
      // 删除并重新添加，移动到末尾（最近使用）
      this.contentCache.delete(chapterId);
      this.contentCache.set(chapterId, cached);
    }
  }

  /**
   * 加载章节内容（带缓存）
   * @param chapterId 章节 ID
   * @returns 章节内容，如果不存在则返回 undefined
   */
  static async loadChapterContent(chapterId: string): Promise<Paragraph[] | undefined> {
    // 检查缓存
    if (this.contentCache.has(chapterId)) {
      const cached = this.contentCache.get(chapterId);
      // 更新访问顺序（LRU 行为）
      this.touchCacheEntry(chapterId);
      // 兜底：如果出现 has()==true 但 get()==undefined，则当作缓存未命中，继续走 DB 加载
      if (cached === undefined) {
        this.contentCache.delete(chapterId);
      } else {
        return cached === null ? undefined : cached.parsed;
      }
    }

    try {
      const db = await getDB();
      const chapterContent = await db.get('chapter-contents', chapterId);
      if (!chapterContent?.content) {
        // 缓存 null 表示不存在，避免重复查询
        this.contentCache.set(chapterId, null);
        this.evictCacheIfNeeded();
        return undefined;
      }
      // 反序列化 JSON 字符串为段落数组
      const serialized = chapterContent.content;
      const parsed = JSON.parse(serialized) as Paragraph[];
      // 缓存结果
      this.contentCache.set(chapterId, { parsed, serialized });
      this.evictCacheIfNeeded();
      return parsed;
    } catch (error) {
      console.error(`Failed to load chapter content for ${chapterId}:`, error);
      // 缓存 null 表示加载失败
      this.contentCache.set(chapterId, null);
      this.evictCacheIfNeeded();
      return undefined;
    }
  }

  /**
   * 批量加载章节内容（优化性能，使用单个事务）
   * @param chapterIds 章节 ID 数组
   * @returns 章节内容映射，key 为章节 ID，value 为段落数组或 undefined
   */
  static async loadChapterContentsBatch(
    chapterIds: string[],
  ): Promise<Map<string, Paragraph[] | undefined>> {
    const result = new Map<string, Paragraph[] | undefined>();
    const uncachedIds: string[] = [];

    // 先检查缓存
    for (const chapterId of chapterIds) {
      if (this.contentCache.has(chapterId)) {
        const cached = this.contentCache.get(chapterId);
        // 更新访问顺序（LRU 行为）
        this.touchCacheEntry(chapterId);
        // 兜底：如果出现 has()==true 但 get()==undefined，则当作缓存未命中
        if (cached === undefined) {
          this.contentCache.delete(chapterId);
          uncachedIds.push(chapterId);
        } else {
          result.set(chapterId, cached === null ? undefined : cached.parsed);
        }
      } else {
        uncachedIds.push(chapterId);
      }
    }

    // 如果所有章节都在缓存中，直接返回
    if (uncachedIds.length === 0) {
      return result;
    }

    try {
      const db = await getDB();
      // 使用单个事务批量读取（优化：使用 IDBKeyRange 和 getAll 如果可能）
      const tx = db.transaction('chapter-contents', 'readonly');
      const store = tx.objectStore('chapter-contents');

      // 优化：对于少量章节，使用并行 get；对于大量章节，可以考虑分批处理
      // 当前实现：并行获取所有章节（在单个事务中）
      const batchSize = 50; // 每批最多 50 个章节，避免一次性加载过多
      const batches: string[][] = [];
      for (let i = 0; i < uncachedIds.length; i += batchSize) {
        batches.push(uncachedIds.slice(i, i + batchSize));
      }

      // 分批处理，但每批内部并行
      for (const batch of batches) {
        const promises = batch.map(async (chapterId) => {
          try {
            const chapterContent = await store.get(chapterId);
            if (!chapterContent?.content) {
              this.contentCache.set(chapterId, null);
              return { chapterId, content: undefined };
            }
            const serialized = chapterContent.content;
            const parsed = JSON.parse(serialized) as Paragraph[];
            this.contentCache.set(chapterId, { parsed, serialized });
            return { chapterId, content: parsed };
          } catch (error) {
            console.error(`Failed to load chapter content for ${chapterId}:`, error);
            this.contentCache.set(chapterId, null);
            return { chapterId, content: undefined };
          }
        });

        const batchResults = await Promise.all(promises);
        // 将结果添加到映射中
        for (const { chapterId, content } of batchResults) {
          result.set(chapterId, content);
        }
      }

      await tx.done;

      // 清理缓存
      this.evictCacheIfNeeded();

      return result;
    } catch (error) {
      console.error('Failed to batch load chapter contents:', error);
      // 如果批量加载失败，回退到单个加载
      for (const chapterId of uncachedIds) {
        const content = await this.loadChapterContent(chapterId);
        result.set(chapterId, content);
      }
      return result;
    }
  }

  /**
   * 清除指定章节的缓存
   * @param chapterId 章节 ID
   */
  static clearCache(chapterId: string): void {
    this.contentCache.delete(chapterId);
  }

  /**
   * 清除所有缓存
   */
  static clearAllCache(): void {
    this.contentCache.clear();
  }

  /**
   * 删除章节内容
   * @param chapterId 章节 ID
   */
  static async deleteChapterContent(chapterId: string): Promise<void> {
    try {
      const db = await getDB();
      await db.delete('chapter-contents', chapterId);
      // 清除缓存
      this.contentCache.delete(chapterId);

      // 使全文索引失效（异步，不阻塞删除操作）
      try {
        const { FullTextIndexService } = await import('src/services/full-text-index-service');
        // 尝试从 books store 查找包含此章节的书籍
        const { BookService } = await import('src/services/book-service');
        const books = await BookService.getAllBooks();
        for (const book of books) {
          if (book.volumes) {
            for (const volume of book.volumes) {
              if (volume.chapters?.some((c) => c.id === chapterId)) {
                // 找到包含此章节的书籍，使索引失效
                await FullTextIndexService.updateIndexForChapter(book.id, chapterId);
                break;
              }
            }
          }
        }
      } catch (error) {
        // 索引更新失败不影响内容删除
        console.warn('Failed to update full-text index after deleting chapter content:', error);
      }
    } catch (error) {
      console.error(`Failed to delete chapter content for ${chapterId}:`, error);
      throw error;
    }
  }

  /**
   * 批量删除章节内容
   * @param chapterIds 章节 ID 数组
   */
  static async bulkDeleteChapterContent(chapterIds: string[]): Promise<void> {
    try {
      const db = await getDB();
      const tx = db.transaction('chapter-contents', 'readwrite');
      const store = tx.objectStore('chapter-contents');

      for (const chapterId of chapterIds) {
        await store.delete(chapterId);
        // 清除缓存
        this.contentCache.delete(chapterId);
      }

      await tx.done;
    } catch (error) {
      console.error('Failed to bulk delete chapter contents:', error);
      throw error;
    }
  }

  /**
   * 清空所有章节内容
   */
  static async clearAllChapterContent(): Promise<void> {
    try {
      const db = await getDB();
      await db.clear('chapter-contents');
      // 清除所有缓存
      this.contentCache.clear();
    } catch (error) {
      console.error('Failed to clear all chapter contents:', error);
      throw error;
    }
  }

  /**
   * 检查章节内容是否已在独立存储中
   * @param chapterId 章节 ID
   * @returns 是否存在
   */
  static async hasChapterContent(chapterId: string): Promise<boolean> {
    try {
      const content = await ChapterContentService.loadChapterContent(chapterId);
      return content !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * 为小说加载所有章节内容（用于同步等场景）
   * @param novel 小说对象
   * @returns 包含所有章节内容的小说对象
   */
  static async loadAllChapterContentsForNovel(novel: Novel): Promise<Novel> {
    if (!novel.volumes) {
      return novel;
    }

    const volumes = await Promise.all(
      novel.volumes.map(async (volume) => {
        if (!volume.chapters) {
          return volume;
        }

        const chapters = await Promise.all(
          volume.chapters.map(async (chapter) => {
            // 如果内容已加载，直接返回
            if (chapter.content !== undefined) {
              return chapter;
            }

            // 从独立存储加载内容
            const content = await ChapterContentService.loadChapterContent(chapter.id);
            return {
              ...chapter,
              // 显式保留章节摘要，避免在某些结构/Proxy 场景下丢失
              summary: chapter.summary,
              content: content || [],
              contentLoaded: true,
            };
          }),
        );

        return {
          ...volume,
          chapters,
        };
      }),
    );

    return {
      ...novel,
      volumes,
    };
  }

  /**
   * 为多个小说加载所有章节内容（用于同步等场景）
   * @param novels 小说数组
   * @returns 包含所有章节内容的小说数组
   */
  static async loadAllChapterContentsForNovels(novels: Novel[]): Promise<Novel[]> {
    return Promise.all(
      novels.map((novel) => ChapterContentService.loadAllChapterContentsForNovel(novel)),
    );
  }

  /**
   * 加载书籍的所有章节内容（如果需要）
   * 直接修改传入的 novel 对象，将未加载的章节内容从 IndexedDB 加载到内存中
   * @param novel 小说对象（会被直接修改）
   */
  static async loadAllChapterContents(novel: Novel): Promise<void> {
    if (!novel.volumes) {
      return;
    }

    for (const volume of novel.volumes) {
      if (volume.chapters) {
        for (let i = 0; i < volume.chapters.length; i++) {
          const chapter = volume.chapters[i];
          if (chapter && chapter.content === undefined) {
            const content = await ChapterContentService.loadChapterContent(chapter.id);
            volume.chapters[i] = {
              ...chapter,
              content: content || [],
              contentLoaded: true,
            };
          }
        }
      }
    }
  }
}
