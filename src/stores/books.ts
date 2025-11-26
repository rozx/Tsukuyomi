import { defineStore, acceptHMRUpdate } from 'pinia';
import type { Novel, Paragraph } from 'src/models/novel';
import { BookService } from 'src/services/book-service';
import { ChapterContentService } from 'src/services/chapter-content-service';

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
        const existingBook = this.books[index];
        const updatedBook = { ...existingBook, ...updates } as Novel;

        // 如果 cover 是 null，删除该属性
        if ('cover' in updates && updates.cover === null) {
          delete updatedBook.cover;
        }

        // 重要：如果更新了 volumes，需要保留现有章节的 content
        // 因为 content 存储在独立的 IndexedDB 表中，不应该在更新时丢失
        if (updates.volumes && existingBook && existingBook.volumes) {
          // 遍历更新的 volumes，为每个章节保留现有的 content
          updatedBook.volumes = await Promise.all(
            updates.volumes.map(async (updatedVolume) => {
              // 查找对应的现有卷
              const existingVolume = existingBook.volumes?.find((v) => v.id === updatedVolume.id);

              if (existingVolume && existingVolume.chapters && updatedVolume.chapters) {
                // 为每个更新的章节保留现有的 content
                updatedVolume.chapters = await Promise.all(
                  updatedVolume.chapters.map(async (updatedChapter) => {
                    const existingChapter = existingVolume.chapters?.find(
                      (ch) => ch.id === updatedChapter.id,
                    );

                    // 如果更新的章节没有 content，尝试从多个来源获取：
                    // 1. 现有章节的 content（如果已加载）
                    // 2. 从 IndexedDB 加载
                    if (
                      updatedChapter.content === undefined ||
                      updatedChapter.content === null ||
                      (Array.isArray(updatedChapter.content) && updatedChapter.content.length === 0)
                    ) {
                      let contentToPreserve: Paragraph[] | undefined = undefined;

                      // 首先尝试从现有章节获取（如果已加载）
                      if (existingChapter && existingChapter.content !== undefined) {
                        contentToPreserve = existingChapter.content;
                      } else {
                        // 如果现有章节没有 content，从 IndexedDB 加载
                        contentToPreserve = await ChapterContentService.loadChapterContent(
                          updatedChapter.id,
                        );
                      }

                      // 如果找到了内容，保留它
                      if (contentToPreserve !== undefined) {
                        return {
                          ...updatedChapter,
                          content: contentToPreserve,
                        };
                      }
                    }

                    return updatedChapter;
                  }),
                );
              }

              return updatedVolume;
            }),
          );
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
