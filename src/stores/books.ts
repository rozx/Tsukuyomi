import { defineStore, acceptHMRUpdate } from 'pinia';
import type { Novel } from 'src/models/novel';
import { BookService } from 'src/services/book-service';

export const useBooksStore = defineStore('books', {
  state: () => ({
    books: [] as Novel[],
    isLoaded: false,
    isLoading: false,
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

      this.isLoading = true;
      try {
        this.books = await BookService.getAllBooks();
        this.isLoaded = true;
      } finally {
        this.isLoading = false;
      }
    },

    /**
     * 添加新书籍
     */
    async addBook(book: Novel): Promise<void> {
      this.books.push(book);
      await BookService.saveBook(book);
    },

    /**
     * 批量添加书籍（一次性保存到 IndexedDB）
     */
    async bulkAddBooks(books: Novel[]): Promise<void> {
      // 去重：使用 Map 确保每个 ID 只出现一次
      const uniqueBooksMap = new Map<string, Novel>();
      for (const book of books) {
        uniqueBooksMap.set(book.id, book);
      }
      const uniqueBooks = Array.from(uniqueBooksMap.values());
      
      this.books = uniqueBooks;
      await BookService.bulkSaveBooks(uniqueBooks);
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
        await BookService.saveBook(updatedBook);
      }
    },

    /**
     * 删除书籍
     */
    async deleteBook(id: string): Promise<void> {
      const index = this.books.findIndex((book) => book.id === id);
      if (index > -1) {
        this.books.splice(index, 1);
        await BookService.deleteBook(id);
      }
    },

    /**
     * 清空所有书籍（用于重置）
     */
    async clearBooks(): Promise<void> {
      this.books = [];
      await BookService.clearBooks();
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useBooksStore, import.meta.hot));
}
