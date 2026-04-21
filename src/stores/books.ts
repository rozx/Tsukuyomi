import { defineStore, acceptHMRUpdate } from 'pinia';
import type { Novel, Paragraph, Volume, Chapter } from 'src/models/novel';
import { BookService } from 'src/services/book-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { useSettingsStore } from 'src/stores/settings';

function collectRemovedChapterIds(
  previousVolumes: Volume[] | undefined,
  nextVolumes: Volume[] | undefined,
): string[] {
  if (!previousVolumes || !nextVolumes) {
    return [];
  }

  const nextChapterIds = new Set<string>();
  for (const volume of nextVolumes) {
    for (const chapter of volume.chapters || []) {
      nextChapterIds.add(chapter.id);
    }
  }

  const removedChapterIds: string[] = [];
  for (const volume of previousVolumes) {
    for (const chapter of volume.chapters || []) {
      if (!nextChapterIds.has(chapter.id)) {
        removedChapterIds.push(chapter.id);
      }
    }
  }

  return removedChapterIds;
}

async function cleanupRemovedChapterData(
  bookId: string,
  removedChapterIds: string[],
): Promise<void> {
  if (removedChapterIds.length === 0) {
    return;
  }

  await ChapterContentService.bulkDeleteChapterContent(removedChapterIds, { bookId });
}

/** 更新后的章节是否已携带完整内容（数组，含空数组），含则无需保留旧内容 */
function chapterHasFreshContent(chapter: Chapter): boolean {
  return (
    chapter.content !== undefined &&
    chapter.content !== null &&
    Array.isArray(chapter.content)
  );
}

/**
 * 为现有卷构建一个 chapterId→Chapter 的全书级查找表。
 * 用书级（非卷级）索引定位可以覆盖"章节跨卷移动"的场景 —— 章节被移到新卷后，
 * 按新 volumeId 查旧卷里的 chapter 会 miss，content 就被丢掉了。
 */
function buildExistingChapterLookup(existingVolumes: Volume[]): Map<string, Chapter> {
  const byId = new Map<string, Chapter>();
  for (const volume of existingVolumes) {
    if (!volume.chapters) continue;
    for (const ch of volume.chapters) {
      byId.set(ch.id, ch);
    }
  }
  return byId;
}

/** 收集需要从 IndexedDB 批量加载内容的章节 ID（existing 未加载且 updated 没带新内容） */
function collectChapterIdsNeedingContent(
  updatedVolumes: Volume[],
  chaptersById: Map<string, Chapter>,
): string[] {
  const ids: string[] = [];
  for (const updatedVolume of updatedVolumes) {
    if (!updatedVolume.chapters) continue;
    for (const updatedChapter of updatedVolume.chapters) {
      if (!updatedChapter) continue;
      const existingChapter = chaptersById.get(updatedChapter.id);
      if (!existingChapter) continue;
      // 新章节 / 已带新内容 → 无需保留
      if (chapterHasFreshContent(updatedChapter)) continue;
      if (existingChapter.content === undefined) {
        ids.push(updatedChapter.id);
      }
    }
  }
  return ids;
}

/** 按新卷结构重组，保留现有章节内容（若 updated 没带新内容） */
function mergePreservedChapterContents(
  updatedVolumes: Volume[],
  chaptersById: Map<string, Chapter>,
  contentMap: Map<string, Paragraph[] | undefined>,
): Volume[] {
  return updatedVolumes.map((updatedVolume) => {
    if (!updatedVolume.chapters) return updatedVolume;
    return {
      ...updatedVolume,
      chapters: updatedVolume.chapters.map((updatedChapter) => {
        const existingChapter = chaptersById.get(updatedChapter.id);
        if (!existingChapter) return updatedChapter;
        if (chapterHasFreshContent(updatedChapter)) return updatedChapter;

        // 优先现有章节的已加载内容，否则从批量结果拿
        const contentToPreserve =
          existingChapter.content !== undefined
            ? existingChapter.content
            : contentMap.get(updatedChapter.id);
        if (contentToPreserve !== undefined) {
          return { ...updatedChapter, content: contentToPreserve };
        }
        return updatedChapter;
      }),
    };
  });
}

/**
 * 在 updateBook 替换 volumes 时保留所有章节内容（独立 IndexedDB 存储不能在元数据更新时丢失）。
 * 使用书级 chapterId 查找，覆盖章节跨卷移动、重排的场景。
 */
async function preserveChapterContentsOnVolumesUpdate(
  existingVolumes: Volume[],
  updatedVolumes: Volume[],
): Promise<Volume[]> {
  const chaptersById = buildExistingChapterLookup(existingVolumes);
  const chapterIdsToLoad = collectChapterIdsNeedingContent(updatedVolumes, chaptersById);

  const contentMap = new Map<string, Paragraph[] | undefined>();
  if (chapterIdsToLoad.length > 0) {
    const loaded = await ChapterContentService.loadChapterContentsBatch(chapterIdsToLoad);
    for (const [chapterId, content] of loaded) {
      contentMap.set(chapterId, content);
    }
  }

  return mergePreservedChapterContents(updatedVolumes, chaptersById, contentMap);
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
      const existingBooksMap = new Map(this.books.map((b) => [b.id, b]));
      const newBooksMap = new Map<string, Novel>();
      const removedChapterIdsByBook = new Map<string, string[]>();
      for (const book of books) {
        newBooksMap.set(book.id, book);
        const existingBook = existingBooksMap.get(book.id);
        if (existingBook && book.volumes !== undefined) {
          const removedChapterIds = collectRemovedChapterIds(existingBook.volumes, book.volumes);
          if (removedChapterIds.length > 0) {
            removedChapterIdsByBook.set(book.id, removedChapterIds);
          }
        }
      }

      // 保留现有书籍的顺序，如果在新数据中存在则更新，不存在则保留原样
      const ordered: Novel[] = this.books.map((b) =>
        newBooksMap.has(b.id) ? newBooksMap.get(b.id)! : b,
      );

      // 追加完全新增的书籍（不在现有列表中的）
      for (const book of newBooksMap.values()) {
        if (!existingBooksMap.has(book.id)) {
          ordered.push(book);
        }
      }

      this.books = ordered;

      // 优化：BookService.bulkSaveBooks 内部使用的是 put，具有 UPSERT 语义
      // 因此只需保存本次批量更新和新增的书籍（增量保存），大幅提升效率
      const booksToSave = Array.from(newBooksMap.values());
      await BookService.bulkSaveBooks(booksToSave);

      await Promise.all(
        Array.from(removedChapterIdsByBook, ([bookId, removedChapterIds]) =>
          cleanupRemovedChapterData(bookId, removedChapterIds),
        ),
      );
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
      const persist = options?.persist !== false;
      const removedChapterIds = collectRemovedChapterIds(existingBook?.volumes, updates.volumes);

      // 更新时自动设置 lastEdited 为当前时间（除非调用者明确提供了 lastEdited）
      const updatesWithLastEdited: Partial<Novel> = {
        ...updates,
        lastEdited: updates.lastEdited ?? new Date(),
      };
      const updatedBook = { ...existingBook, ...updatesWithLastEdited } as Novel;
      // 如果 cover 是 null，删除该属性
      if ('cover' in updates && updates.cover === null) {
        delete updatedBook.cover;
      }

      // 如果更新了 volumes，需要保留现有章节的 content（独立 IndexedDB 存储不应丢失）
      if (updates.volumes && existingBook && existingBook.volumes) {
        updatedBook.volumes = await preserveChapterContentsOnVolumesUpdate(
          existingBook.volumes,
          updates.volumes,
        );
      }

      this.books[index] = updatedBook;

      if (persist) {
        // 优化：只更新元数据（如 terminologies、characterSettings）时跳过保存章节内容
        const isOnlyMetadataUpdate = !updates.volumes;
        const saveChapterContent =
          options?.saveChapterContent ?? (isOnlyMetadataUpdate ? false : true);
        await BookService.saveBook(updatedBook, { saveChapterContent });
        await cleanupRemovedChapterData(id, removedChapterIds);
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
