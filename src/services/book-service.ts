import { getDB } from 'src/utils/indexed-db';
import { serializeDates } from 'src/utils/serialize-dates';
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
    // 同时兜底清理已经被移除的 summary 字段(旧数据里仍可能残留)
    const { content, summary: _droppedSummary, ...chapterWithoutContent } = chapter as Chapter & {
      summary?: unknown;
    };
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

      const deserializedBook = BookService.deserializeDatesFromDB(book);

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
   * @param book 书籍对象
   * @param options 保存选项
   * @param options.saveChapterContent 是否保存章节内容，默认为 true。如果为 false，则只保存书籍元数据（适用于仅更新术语、角色设定等元数据的场景）
   */
  static async saveBook(
    this: void,
    book: Novel,
    options?: { saveChapterContent?: boolean },
  ): Promise<void> {
    const db = await getDB();
    const saveChapterContent = options?.saveChapterContent !== false;

    // 1. 先保存所有章节内容到独立存储（仅在需要时）
    // 优化：只保存修改过的章节内容
    if (saveChapterContent) {
      await BookService.saveChaptersContent(book, { skipIfUnchanged: true });
    }

    // 2. 剥离章节内容后保存书籍元数据
    const bookWithoutContent = BookService.stripNovelChapterContent(book);
    const serializedBook = serializeDates(bookWithoutContent);
    await db.put('books', serializedBook);
  }

  /**
   * 遍历 book.volumes[].chapters[]，把含有内容的章节写入独立存储。
   * 供 saveBook / bulkSaveBooks 复用，避免重复三层嵌套循环。
   */
  private static async saveChaptersContent(
    book: Novel,
    options: { skipIfUnchanged?: boolean } = {},
  ): Promise<void> {
    if (!book.volumes) return;
    for (const volume of book.volumes) {
      if (!volume.chapters) continue;
      for (const chapter of volume.chapters) {
        if (chapter.content && chapter.content.length > 0) {
          await ChapterContentService.saveChapterContent(chapter.id, chapter.content, {
            bookId: book.id,
            ...(options.skipIfUnchanged ? { skipIfUnchanged: true } : {}),
          });
        }
      }
    }
  }

  /**
   * 批量保存书籍
   * 章节内容会被剥离并单独存储
   */
  static async bulkSaveBooks(books: Novel[]): Promise<void> {
    const db = await getDB();

    // 1. 先保存所有章节内容到独立存储
    //    skipIfUnchanged: true 至关重要 —— 同步路径(applyPartialNovelEntry → bulkAddBooks)
    //    每次都会重新落盘整本书,若不跳过未变内容,saveChapterContent 会无条件触发
    //    markChapterDirty,导致同样内容在多设备来回同步后反复重算章节 embedding。
    for (const book of books) {
      await BookService.saveChaptersContent(book, { skipIfUnchanged: true });
    }

    // 2. 剥离章节内容后批量保存书籍元数据
    const tx = db.transaction('books', 'readwrite');
    const store = tx.objectStore('books');

    for (const book of books) {
      const bookWithoutContent = BookService.stripNovelChapterContent(book);
      const serializedBook = serializeDates(bookWithoutContent);
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
        await ChapterContentService.bulkDeleteChapterContent(chapterIds, { bookId: id });
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

}
