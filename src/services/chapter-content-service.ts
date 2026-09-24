import { getDB } from 'src/utils/indexed-db';
import type { Paragraph, Novel } from 'src/models/novel';
import {
  loadChapterContent as loaderLoadChapterContent,
  loadChapterContentsBatch as loaderLoadChapterContentsBatch,
  peekCacheEntry,
  setCacheEntry,
  setCacheMiss,
  deleteCacheEntry,
  clearCache as loaderClearCache,
  touch,
} from 'src/utils/chapter-content-loader';

import { LibraryPersistence } from './library-persistence';
import { maintainLibraryChanges } from './chapter-content-maintenance';

/**
 * 章节内容服务类
 * 负责章节内容的独立存储和懒加载。
 *
 * 只读 + 缓存逻辑已下沉到叶子模块 `utils/chapter-content-loader`，
 * 本类只保留写路径（save / delete / 批处理）与依赖这些写操作触发的
 * 副作用编排（embedding 防抖、全文索引失效等）。缓存由 loader 模块独占
 * 管理，本类通过 `setCacheEntry` / `deleteCacheEntry` 等 API 保持一致。
 *
 * 叶子化的目的：让只读消费者（chapter-embedding-service / full-text-index-service /
 * novel-utils 等）可以直接 import loader 模块，不再 import 本服务，从而切断
 * 循环依赖。
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
    // 先检查 loader 缓存（loader 独占管理缓存 + LRU 顺序）
    const cached = peekCacheEntry(chapterId);
    if (cached !== undefined) {
      touch(chapterId);
      // 缓存 null 表示不存在 → 认为已修改
      if (cached === null) return true;
      // 对比序列化快照（parsed 可能与 UI/AI 工具共享引用并被就地修改，
      // 所以不能用引用/深比较，只有序列化快照能捕捉"同引用被就地改"的变化）
      return cached.serialized !== serialized;
    }

    // 缓存中没有，从 IndexedDB 加载
    try {
      const db = await getDB();
      const chapterContent = await db.get('chapter-contents', chapterId);
      if (!chapterContent?.content) {
        setCacheMiss(chapterId);
        return true;
      }
      const savedSerialized = chapterContent.content;
      const saved = JSON.parse(savedSerialized) as Paragraph[];
      setCacheEntry(chapterId, { parsed: saved, serialized: savedSerialized });
      touch(chapterId);
      return savedSerialized !== serialized;
    } catch (error) {
      console.warn(`Failed to check content changes for ${chapterId}:`, error);
      setCacheMiss(chapterId);
      return true;
    }
  }

  /**
   * 保存章节内容到独立存储
   * @param chapterId 章节 ID
   * @param content 章节内容（段落数组）
   * @param options 保存选项
   * @param options.bookId 所属书籍 ID（必填，用于让全文索引定向失效；
   *   由调用方显式传入以避免 chapter-content-service 反向 lookup books
   *   形成循环依赖）
   * @param options.skipIfUnchanged 如果内容未修改则跳过保存，默认为 false
   */
  static async saveChapterContent(
    chapterId: string,
    content: Paragraph[],
    options: { bookId: string; skipIfUnchanged?: boolean },
  ): Promise<boolean> {
    const changed = await LibraryPersistence.saveChapter(
      await getDB(),
      options.bookId,
      chapterId,
      content,
    );
    // 只有持久化成功后才更新缓存。实际比较始终以数据库为准。
    setCacheEntry(chapterId, { parsed: content, serialized: this.serializeContent(content) });
    if (changed) await maintainLibraryChanges(new Map([[options.bookId, [chapterId]]]));
    return changed || options.skipIfUnchanged !== true;
  }

  /**
   * 加载章节内容（带缓存）。代理给 loader 叶子模块。
   */
  static async loadChapterContent(chapterId: string): Promise<Paragraph[] | undefined> {
    return loaderLoadChapterContent(chapterId);
  }

  /**
   * 批量加载章节内容（优化性能，使用单个事务）。代理给 loader 叶子模块。
   */
  static async loadChapterContentsBatch(
    chapterIds: string[],
  ): Promise<Map<string, Paragraph[] | undefined>> {
    return loaderLoadChapterContentsBatch(chapterIds);
  }

  /**
   * 清除指定章节的缓存
   * @param chapterId 章节 ID
   */
  static clearCache(chapterId: string): void {
    deleteCacheEntry(chapterId);
  }

  /**
   * 清除所有缓存
   */
  static clearAllCache(): void {
    loaderClearCache();
  }

  /**
   * 删除章节内容
   * @param chapterId 章节 ID
   * @param options.bookId 所属书籍 ID（必填，用于全文索引失效；由调用
   *   方显式传入以避免循环依赖）
   */
  static async deleteChapterContent(chapterId: string, options: { bookId: string }): Promise<void> {
    await this.bulkDeleteChapterContent([chapterId], options);
  }

  /**
   * 批量删除章节内容
   * @param chapterIds 章节 ID 数组
   * @param options.bookId 所属书籍 ID（必填，用于全文索引失效）
   */
  static async bulkDeleteChapterContent(
    chapterIds: string[],
    options: { bookId: string },
  ): Promise<void> {
    await LibraryPersistence.deleteChapters(await getDB(), options.bookId, chapterIds);
    await maintainLibraryChanges(new Map([[options.bookId, chapterIds]]));
  }

  /**
   * 清空所有章节内容
   */
  static async clearAllChapterContent(): Promise<void> {
    const changes = await LibraryPersistence.clear(await getDB(), false);
    loaderClearCache();
    await maintainLibraryChanges(changes);
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
