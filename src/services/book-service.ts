import { getDB } from 'src/utils/indexed-db';
import type { Novel, Chapter } from 'src/models/novel';
import { ChapterContentService } from './chapter-content-service';

/**
 * 书籍服务
 * 负责书籍的 CRUD 操作和持久化
 */
export class BookService {
  /**
   * 从章节中剥离内容（用于存储优化）
   * @param chapter 章节对象
   * @returns 不包含 content 的章节对象
   */
  private static stripChapterContent(chapter: Chapter): Chapter {
    const { content, ...chapterWithoutContent } = chapter;
    return {
      ...chapterWithoutContent,
      contentLoaded: content !== undefined,
    };
  }

  /**
   * 从小说中剥离所有章节内容（用于存储优化）
   * @param novel 小说对象
   * @returns 不包含章节内容的小说对象
   */
  private static stripNovelChapterContent(novel: Novel): Novel {
    if (!novel.volumes) {
      return novel;
    }

    return {
      ...novel,
      volumes: novel.volumes.map((volume) => ({
        ...volume,
        chapters: volume.chapters?.map((chapter) => BookService.stripChapterContent(chapter)),
      })),
    };
  }
  /**
   * 将 Date 对象转换为可序列化的格式（用于 IndexedDB）
   */
  private static serializeDatesForDB<T>(obj: T): T {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (obj instanceof Date) {
      return obj.toISOString() as unknown as T;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => BookService.serializeDatesForDB(item)) as unknown as T;
    }

    if (typeof obj === 'object') {
      const serialized = {} as T;
      for (const [key, value] of Object.entries(obj)) {
        (serialized as Record<string, unknown>)[key] = BookService.serializeDatesForDB(value);
      }
      return serialized;
    }

    return obj;
  }

  /**
   * 将序列化的日期字符串转换回 Date 对象（从 IndexedDB 加载）
   */
  private static deserializeDatesFromDB<T>(obj: T): T {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(obj)) {
      return new Date(obj) as unknown as T;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => BookService.deserializeDatesFromDB(item)) as unknown as T;
    }

    if (typeof obj === 'object') {
      const deserialized = {} as T;
      for (const [key, value] of Object.entries(obj)) {
        (deserialized as Record<string, unknown>)[key] = BookService.deserializeDatesFromDB(value);
      }
      return deserialized;
    }

    return obj;
  }

  /**
   * 获取所有书籍（不包含章节内容）
   */
  static async getAllBooks(): Promise<Novel[]> {
    try {
      const db = await getDB();
      const books = await db.getAll('books');
      // 书籍列表不需要加载章节内容，直接返回
      return books.map((book) => BookService.deserializeDatesFromDB(book));
    } catch (error) {
      console.error('Failed to load books:', error);
      return [];
    }
  }

  /**
   * 根据 ID 获取书籍（不包含章节内容）
   * @param loadContent 是否加载章节内容，默认为 false
   */
  static async getBookById(id: string, loadContent = false): Promise<Novel | undefined> {
    try {
      const db = await getDB();
      const book = await db.get('books', id);
      if (!book) return undefined;

      const deserializedBook = BookService.deserializeDatesFromDB(book) as Novel;

      // 如果需要加载内容，遍历所有章节并加载
      if (loadContent && deserializedBook.volumes) {
        for (const volume of deserializedBook.volumes) {
          if (volume.chapters) {
            for (let i = 0; i < volume.chapters.length; i++) {
              const chapter = volume.chapters[i];
              if (chapter && !chapter.content) {
                // 从独立存储加载章节内容
                const content = await ChapterContentService.loadChapterContent(chapter.id);
                if (content) {
                  volume.chapters[i] = {
                    ...chapter,
                    content,
                    contentLoaded: true,
                  };
                }
              }
            }
          }
        }
      }

      return deserializedBook;
    } catch (error) {
      console.error(`Failed to load book ${id}:`, error);
      return undefined;
    }
  }

  /**
   * 保存/更新书籍
   * 章节内容会被剥离并单独存储
   */
  static async saveBook(book: Novel): Promise<void> {
    const db = await getDB();

    // 1. 先保存所有章节内容到独立存储
    if (book.volumes) {
      for (const volume of book.volumes) {
        if (volume.chapters) {
          for (const chapter of volume.chapters) {
            if (chapter.content && chapter.content.length > 0) {
              await ChapterContentService.saveChapterContent(chapter.id, chapter.content);
            }
          }
        }
      }
    }

    // 2. 剥离章节内容后保存书籍元数据
    const bookWithoutContent = BookService.stripNovelChapterContent(book);
    const serializedBook = BookService.serializeDatesForDB(bookWithoutContent);
    await db.put('books', serializedBook);
  }

  /**
   * 批量保存书籍
   * 章节内容会被剥离并单独存储
   */
  static async bulkSaveBooks(books: Novel[]): Promise<void> {
    const db = await getDB();

    // 1. 先保存所有章节内容到独立存储
    for (const book of books) {
      if (book.volumes) {
        for (const volume of book.volumes) {
          if (volume.chapters) {
            for (const chapter of volume.chapters) {
              if (chapter.content && chapter.content.length > 0) {
                await ChapterContentService.saveChapterContent(chapter.id, chapter.content);
              }
            }
          }
        }
      }
    }

    // 2. 剥离章节内容后批量保存书籍元数据
    const tx = db.transaction('books', 'readwrite');
    const store = tx.objectStore('books');

    for (const book of books) {
      const bookWithoutContent = BookService.stripNovelChapterContent(book);
      const serializedBook = BookService.serializeDatesForDB(bookWithoutContent);
      await store.put(serializedBook);
    }

    await tx.done;
  }

  /**
   * 删除书籍
   * 同时删除相关的章节内容
   */
  static async deleteBook(id: string): Promise<void> {
    const db = await getDB();

    // 1. 先获取书籍，收集所有章节 ID
    const book = await db.get('books', id);
    if (book?.volumes) {
      const chapterIds: string[] = [];
      for (const volume of book.volumes) {
        if (volume.chapters) {
          for (const chapter of volume.chapters) {
            if (chapter.id) {
              chapterIds.push(chapter.id);
            }
          }
        }
      }

      // 2. 删除所有章节内容
      if (chapterIds.length > 0) {
        await ChapterContentService.bulkDeleteChapterContent(chapterIds);
      }
    }

    // 3. 删除书籍元数据
    await db.delete('books', id);
  }

  /**
   * 清空所有书籍
   * 同时清空所有章节内容
   */
  static async clearBooks(): Promise<void> {
    const db = await getDB();
    await db.clear('books');
    await ChapterContentService.clearAllChapterContent();
  }

  /**
   * 加载指定章节的内容
   * @param book 小说对象
   * @param chapterId 章节 ID
   * @returns 包含内容的章节对象，如果找不到则返回 undefined
   */
  static async loadChapterContent(book: Novel, chapterId: string): Promise<Chapter | undefined> {
    if (!book.volumes) return undefined;

    // 查找章节
    for (const volume of book.volumes) {
      if (volume.chapters) {
        const chapter = volume.chapters.find((ch) => ch.id === chapterId);
        if (chapter) {
          // 如果内容已加载，直接返回
          if (chapter.content !== undefined) {
            return chapter;
          }

          // 从独立存储加载内容
          const content = await ChapterContentService.loadChapterContent(chapterId);
          return {
            ...chapter,
            content: content || [],
            contentLoaded: true,
          };
        }
      }
    }

    return undefined;
  }
}
