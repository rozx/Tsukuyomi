import { defineStore, acceptHMRUpdate } from 'pinia';
import type { Novel } from 'src/types/novel';
import { getDB } from 'src/utils/indexed-db';

/**
 * 从 IndexedDB 加载所有书籍
 */
async function loadBooksFromDB(): Promise<Novel[]> {
  try {
    const db = await getDB();
    const books = await db.getAll('books');
    return books;
  } catch {
    return [];
  }
}

/**
 * 保存单本书籍到 IndexedDB
 */
async function saveBookToDB(book: Novel): Promise<void> {
  const db = await getDB();
  await db.put('books', book);
}

/**
 * 从 IndexedDB 删除书籍
 */
async function deleteBookFromDB(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('books', id);
}

/**
 * 清空 IndexedDB 中的所有书籍
 */
async function clearBooksInDB(): Promise<void> {
  const db = await getDB();
  await db.clear('books');
}

/**
 * 批量保存书籍到 IndexedDB
 */
async function bulkSaveBooksToDB(books: Novel[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('books', 'readwrite');
  const store = tx.objectStore('books');

  for (const book of books) {
    await store.put(book);
  }

  await tx.done;
}

export const useBooksStore = defineStore('books', {
  state: () => ({
    books: [] as Novel[],
    isLoaded: false,
  }),

  getters: {
    /**
     * 根据 ID 获取书籍
     */
    getBookById: (state) => {
      return (id: string): Novel | undefined => {
        return state.books.find((book) => book.id === id);
      };
    },
  },

  actions: {
    /**
     * 从 IndexedDB 加载所有书籍
     */
    async loadBooks(): Promise<void> {
      if (this.isLoaded) {
        return; // 已加载，跳过
      }

      this.books = await loadBooksFromDB();
      this.isLoaded = true;
    },

    /**
     * 添加新书籍
     */
    async addBook(book: Novel): Promise<void> {
      this.books.push(book);
      await saveBookToDB(book);
    },

    /**
     * 批量添加书籍（一次性保存到 IndexedDB）
     */
    async bulkAddBooks(books: Novel[]): Promise<void> {
      this.books.push(...books);
      await bulkSaveBooksToDB(books);
    },

    /**
     * 更新书籍
     */
    async updateBook(id: string, updates: Partial<Novel>): Promise<void> {
      const index = this.books.findIndex((book) => book.id === id);
      if (index > -1) {
        const updatedBook = { ...this.books[index], ...updates } as Novel;
        // 如果 cover 是 null，删除该属性
        if ('cover' in updates && updates.cover === null) {
          delete updatedBook.cover;
        }
        this.books[index] = updatedBook;
        await saveBookToDB(updatedBook);
      }
    },

    /**
     * 删除书籍
     */
    async deleteBook(id: string): Promise<void> {
      const index = this.books.findIndex((book) => book.id === id);
      if (index > -1) {
        this.books.splice(index, 1);
        await deleteBookFromDB(id);
      }
    },

    /**
     * 清空所有书籍（用于重置）
     */
    async clearBooks(): Promise<void> {
      this.books = [];
      await clearBooksInDB();
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useBooksStore, import.meta.hot));
}

