import { getDB } from 'src/utils/indexed-db';
import type { Paragraph } from 'src/models/novel';

/**
 * 章节内容存储结构
 */
interface ChapterContent {
  chapterId: string;
  content: Paragraph[];
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
        content,
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
      return chapterContent?.content as Paragraph[] | undefined;
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
}
