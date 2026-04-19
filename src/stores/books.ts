import { defineStore, acceptHMRUpdate } from 'pinia';
import type { Novel, Paragraph, Volume, Chapter } from 'src/models/novel';
import { BookService } from 'src/services/book-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { useSettingsStore } from 'src/stores/settings';

function buildUpdatedBookShell(existingBook: Novel, updates: Partial<Novel>): Novel {
  const updatesWithLastEdited: Partial<Novel> = {
    ...updates,
    lastEdited: updates.lastEdited ?? new Date(),
  };
  const updated = { ...existingBook, ...updatesWithLastEdited } as Novel;
  if ('cover' in updates && updates.cover === null) {
    delete updated.cover;
  }
  return updated;
}

function collectChaptersNeedingContent(
  existingVolumesMap: Map<string, Volume>,
  existingChaptersMap: Map<string, Map<string, Chapter>>,
  updatedVolumes: Volume[],
): string[] {
  const ids: string[] = [];
  for (const updatedVolume of updatedVolumes) {
    if (!updatedVolume) continue;
    const existingVolume = existingVolumesMap.get(updatedVolume.id);
    const volumeChaptersMap = existingChaptersMap.get(updatedVolume.id);
    if (!existingVolume || !volumeChaptersMap || !updatedVolume.chapters) continue;
    for (const updatedChapter of updatedVolume.chapters) {
      if (!updatedChapter) continue;
      const existingChapter = volumeChaptersMap.get(updatedChapter.id);
      if (!existingChapter) continue;
      if (
        updatedChapter.content !== undefined &&
        updatedChapter.content !== null &&
        Array.isArray(updatedChapter.content)
      ) {
        continue;
      }
      if (existingChapter.content === undefined) {
        ids.push(updatedChapter.id);
      }
    }
  }
  return ids;
}

function applyPreservedContentToVolumes(
  existingVolumesMap: Map<string, Volume>,
  existingChaptersMap: Map<string, Map<string, Chapter>>,
  updatedVolumes: Volume[],
  contentMap: Map<string, Paragraph[] | undefined>,
): Volume[] {
  return updatedVolumes.map((updatedVolume) => {
    const existingVolume = existingVolumesMap.get(updatedVolume.id);
    const volumeChaptersMap = existingChaptersMap.get(updatedVolume.id);
    if (!existingVolume || !volumeChaptersMap || !updatedVolume.chapters) {
      return updatedVolume;
    }
    return {
      ...updatedVolume,
      chapters: updatedVolume.chapters.map((updatedChapter) => {
        const existingChapter = volumeChaptersMap.get(updatedChapter.id);
        if (!existingChapter) return updatedChapter;
        if (
          updatedChapter.content !== undefined &&
          updatedChapter.content !== null &&
          Array.isArray(updatedChapter.content)
        ) {
          return updatedChapter;
        }
        const contentToPreserve =
          existingChapter.content !== undefined
            ? existingChapter.content
            : contentMap.get(updatedChapter.id);
        if (contentToPreserve === undefined) return updatedChapter;
        return { ...updatedChapter, content: contentToPreserve };
      }),
    };
  });
}

async function preserveChapterContentInUpdatedVolumes(
  existingVolumes: Volume[],
  updatedVolumes: Volume[],
): Promise<Volume[]> {
  const existingVolumesMap = new Map<string, Volume>(existingVolumes.map((v) => [v.id, v]));
  const existingChaptersMap = new Map<string, Map<string, Chapter>>();
  for (const volume of existingVolumes) {
    if (volume.chapters) {
      existingChaptersMap.set(
        volume.id,
        new Map(volume.chapters.map((ch) => [ch.id, ch])),
      );
    }
  }

  const chapterIds = collectChaptersNeedingContent(
    existingVolumesMap,
    existingChaptersMap,
    updatedVolumes,
  );
  const contentMap = new Map<string, Paragraph[] | undefined>();
  if (chapterIds.length > 0) {
    const loaded = await ChapterContentService.loadChapterContentsBatch(chapterIds);
    for (const [id, content] of loaded) contentMap.set(id, content);
  }

  return applyPreservedContentToVolumes(
    existingVolumesMap,
    existingChaptersMap,
    updatedVolumes,
    contentMap,
  );
}

export const useBooksStore = defineStore('books', {
  state: () => ({
    books: [] as Novel[],
    isLoaded: false,
    isLoading: false,
  }),

  getters: {
    booksMap: (state): Map<string, Novel> => {
      return new Map(state.books.map((b) => [b.id, b]));
    },
    /**
     * 根据 ID 获取书籍（O(1)）
     */
    getBookById(): (id: string) => Novel | undefined {
      const map = this.booksMap;
      return (id: string): Novel | undefined => map.get(id);
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
      const newBooksMap = new Map<string, Novel>();
      for (const book of books) {
        newBooksMap.set(book.id, book);
      }

      const existingIds = new Set(this.books.map((b) => b.id));

      // 保留现有书籍的顺序，如果在新数据中存在则更新，不存在则保留原样
      const ordered: Novel[] = this.books.map((b) =>
        newBooksMap.has(b.id) ? newBooksMap.get(b.id)! : b,
      );

      // 追加完全新增的书籍（不在现有列表中的）
      for (const book of newBooksMap.values()) {
        if (!existingIds.has(book.id)) {
          ordered.push(book);
        }
      }

      this.books = ordered;

      // 优化：BookService.bulkSaveBooks 内部使用的是 put，具有 UPSERT 语义
      // 因此只需保存本次批量更新和新增的书籍（增量保存），大幅提升效率
      const booksToSave = Array.from(newBooksMap.values());
      await BookService.bulkSaveBooks(booksToSave);
    },

    /**
     * 更新书籍
     */
    async updateBook(
      id: string,
      updates: Partial<Novel>,
      options?: { persist?: boolean; saveChapterContent?: boolean },
    ): Promise<void> {
      const index = this.books.findIndex((book) => book.id === id);
      if (index < 0) return;
      const existingBook = this.books[index];
      if (!existingBook) return;
      const persist = options?.persist !== false;

      const updatedBook = buildUpdatedBookShell(existingBook, updates);

      if (updates.volumes && existingBook.volumes) {
        updatedBook.volumes = await preserveChapterContentInUpdatedVolumes(
          existingBook.volumes,
          updates.volumes,
        );
      }

      this.books[index] = updatedBook;

      if (persist) {
        const isOnlyMetadataUpdate = !updates.volumes;
        const saveChapterContent =
          options?.saveChapterContent ?? (isOnlyMetadataUpdate ? false : true);
        await BookService.saveBook(updatedBook, { saveChapterContent });
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

        const settingsStore = useSettingsStore();
        // 重新读取最新的 deletedNovelIds，避免并发删除时覆盖彼此的记录
        const currentDeleted = settingsStore.gistSync?.deletedNovelIds || [];
        if (!currentDeleted.find((record) => record.id === id)) {
          await settingsStore.updateGistSync({
            deletedNovelIds: [...currentDeleted, { id, deletedAt: Date.now() }],
          });
        }
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
