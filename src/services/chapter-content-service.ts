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
   * 保存章节内容到独立存储
   * @param chapterId 章节 ID
   * @param content 章节内容（段落数组）
   */
  static async saveChapterContent(chapterId: string, content: Paragraph[]): Promise<void> {
    try {
      const db = await getDB();

      const chapterContent: ChapterContent = {
        chapterId,
        content: JSON.stringify(content), // 序列化为 JSON 字符串
        lastModified: new Date().toISOString(),
      };

      await db.put('chapter-contents', chapterContent);
      // 更新缓存
      this.contentCache.set(chapterId, content);
      this.evictCacheIfNeeded();
    } catch (error) {
      console.error(`Failed to save chapter content for ${chapterId}:`, error);
      throw error;
    }
  }

  // LRU 内存缓存，避免重复加载
  // 使用 Map 的插入顺序实现 LRU：最近访问的条目会被移动到末尾
  private static contentCache = new Map<string, Paragraph[] | null>();
  private static readonly CACHE_MAX_SIZE = 100; // 最多缓存 100 个章节

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
      return cached === null ? undefined : cached;
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
      const parsed = JSON.parse(chapterContent.content) as Paragraph[];
      // 缓存结果
      this.contentCache.set(chapterId, parsed);
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
        result.set(chapterId, cached === null ? undefined : cached);
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
            const parsed = JSON.parse(chapterContent.content) as Paragraph[];
            this.contentCache.set(chapterId, parsed);
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
