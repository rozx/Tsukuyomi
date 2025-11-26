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
    } catch (error) {
      console.error(`Failed to save chapter content for ${chapterId}:`, error);
      throw error;
    }
  }

  /**
   * 加载章节内容
   * @param chapterId 章节 ID
   * @returns 章节内容，如果不存在则返回 undefined
   */
  static async loadChapterContent(chapterId: string): Promise<Paragraph[] | undefined> {
    try {
      const db = await getDB();
      const chapterContent = await db.get('chapter-contents', chapterId);
      if (!chapterContent?.content) {
        return undefined;
      }
      // 反序列化 JSON 字符串为段落数组
      return JSON.parse(chapterContent.content) as Paragraph[];
    } catch (error) {
      console.error(`Failed to load chapter content for ${chapterId}:`, error);
      return undefined;
    }
  }

  /**
   * 删除章节内容
   * @param chapterId 章节 ID
   */
  static async deleteChapterContent(chapterId: string): Promise<void> {
    try {
      const db = await getDB();
      await db.delete('chapter-contents', chapterId);
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
