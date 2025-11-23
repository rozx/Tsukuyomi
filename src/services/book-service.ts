import { getDB } from 'src/utils/indexed-db';
import type { Novel } from 'src/models/novel';

/**
 * 书籍服务
 * 负责书籍的 CRUD 操作和持久化
 */
export class BookService {
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
   * 获取所有书籍
   */
  static async getAllBooks(): Promise<Novel[]> {
    try {
      const db = await getDB();
      const books = await db.getAll('books');
      return books.map((book) => BookService.deserializeDatesFromDB(book));
    } catch (error) {
      console.error('Failed to load books:', error);
      return [];
    }
  }

  /**
   * 根据 ID 获取书籍
   */
  static async getBookById(id: string): Promise<Novel | undefined> {
    try {
      const db = await getDB();
      const book = await db.get('books', id);
      return BookService.deserializeDatesFromDB(book) as Novel;
    } catch (error) {
      console.error(`Failed to load book ${id}:`, error);
      return undefined;
    }
  }

  /**
   * 保存/更新书籍
   */
  static async saveBook(book: Novel): Promise<void> {
    const db = await getDB();
    const serializedBook = BookService.serializeDatesForDB(book);
    await db.put('books', serializedBook);
  }

  /**
   * 批量保存书籍
   */
  static async bulkSaveBooks(books: Novel[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction('books', 'readwrite');
    const store = tx.objectStore('books');

    for (const book of books) {
      const serializedBook = BookService.serializeDatesForDB(book);
      await store.put(serializedBook);
    }

    await tx.done;
  }

  /**
   * 删除书籍
   */
  static async deleteBook(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('books', id);
  }

  /**
   * 清空所有书籍
   */
  static async clearBooks(): Promise<void> {
    const db = await getDB();
    await db.clear('books');
  }
}

