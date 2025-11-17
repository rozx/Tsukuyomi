import { defineStore, acceptHMRUpdate } from 'pinia';
import type { Novel } from 'src/types/novel';

const STORAGE_KEY = 'luna-ai-books';

/**
 * 从本地存储加载书籍
 */
function loadBooksFromStorage(): Novel[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const books = JSON.parse(stored) as Novel[];
      // 将日期字符串转换回 Date 对象
      return books.map((book) => ({
        ...book,
        lastEdited: new Date(book.lastEdited),
        createdAt: new Date(book.createdAt),
      }));
    }
  } catch (error) {
    console.error('Failed to load books from storage:', error);
  }
  return [];
}

/**
 * 保存书籍到本地存储
 */
function saveBooksToStorage(books: Novel[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
  } catch (error) {
    console.error('Failed to save books to storage:', error);
  }
}

export const useBooksStore = defineStore('books', {
  state: () => ({
    books: loadBooksFromStorage(),
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
     * 添加新书籍
     */
    addBook(book: Novel): void {
      this.books.push(book);
      saveBooksToStorage(this.books);
    },

    /**
     * 更新书籍
     */
    updateBook(id: string, updates: Partial<Novel>): void {
      const index = this.books.findIndex((book) => book.id === id);
      if (index > -1) {
        this.books[index] = { ...this.books[index], ...updates } as Novel;
        saveBooksToStorage(this.books);
      }
    },

    /**
     * 删除书籍
     */
    deleteBook(id: string): void {
      const index = this.books.findIndex((book) => book.id === id);
      if (index > -1) {
        this.books.splice(index, 1);
        saveBooksToStorage(this.books);
      }
    },

    /**
     * 清空所有书籍（用于重置）
     */
    clearBooks(): void {
      this.books = [];
      saveBooksToStorage(this.books);
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useBooksStore, import.meta.hot));
}

