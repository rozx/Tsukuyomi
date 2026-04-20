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

  await ChapterContentService.bulkDeleteChapterContent(removedChapterIds);
  const { FullTextIndexService } = await import('src/services/full-text-index-service');
  await FullTextIndexService.invalidateIndex(bookId);
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
      if (index > -1) {
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

        // 重要：如果更新了 volumes，需要保留现有章节的 content
        // 因为 content 存储在独立的 IndexedDB 表中，不应该在更新时丢失
        if (updates.volumes && existingBook && existingBook.volumes) {
          // 优化：为现有卷和章节创建 Map 以快速查找，避免 O(n) 查找
          const existingVolumesMap = new Map<string, Volume>(
            existingBook.volumes.map((v) => [v.id, v]),
          );
          const existingChaptersMap = new Map<string, Map<string, Chapter>>();

          // 为每个卷创建章节 Map
          for (const volume of existingBook.volumes) {
            if (volume.chapters) {
              existingChaptersMap.set(volume.id, new Map(volume.chapters.map((ch) => [ch.id, ch])));
            }
          }

          // 优化：先收集需要加载内容的章节，批量处理
          const chaptersNeedingContent: Array<{
            volumeIndex: number;
            chapterIndex: number;
            chapterId: string;
            existingChapter: Chapter;
          }> = [];

          // 第一遍：识别需要保留内容的章节
          for (let vIndex = 0; vIndex < updates.volumes.length; vIndex++) {
            const updatedVolume = updates.volumes[vIndex];
            if (!updatedVolume) continue;

            const existingVolume = existingVolumesMap.get(updatedVolume.id);
            const volumeChaptersMap = existingChaptersMap.get(updatedVolume.id);

            if (existingVolume && volumeChaptersMap && updatedVolume.chapters) {
              for (let cIndex = 0; cIndex < updatedVolume.chapters.length; cIndex++) {
                const updatedChapter = updatedVolume.chapters[cIndex];
                if (!updatedChapter) continue;

                const existingChapter = volumeChaptersMap.get(updatedChapter.id);

                // 如果是新章节，跳过（新章节不需要保留内容）
                if (!existingChapter) {
                  continue;
                }

                // 优化：如果更新的章节已经有完整的内容（是数组），跳过
                // 这意味着内容已经被更新，不需要从 IndexedDB 加载
                if (
                  updatedChapter.content !== undefined &&
                  updatedChapter.content !== null &&
                  Array.isArray(updatedChapter.content)
                ) {
                  // 即使数组为空，也认为内容已更新，不需要保留
                  continue;
                }

                // 如果现有章节也没有内容（未加载），需要从 IndexedDB 加载
                if (existingChapter.content === undefined) {
                  chaptersNeedingContent.push({
                    volumeIndex: vIndex,
                    chapterIndex: cIndex,
                    chapterId: updatedChapter.id,
                    existingChapter,
                  });
                }
              }
            }
          }

          // 批量加载需要的内容（如果有）
          const contentMap = new Map<string, Paragraph[] | undefined>();
          if (chaptersNeedingContent.length > 0) {
            const chapterIds = chaptersNeedingContent.map((c) => c.chapterId);
            const loadedContents = await ChapterContentService.loadChapterContentsBatch(chapterIds);
            for (const [chapterId, content] of loadedContents) {
              contentMap.set(chapterId, content);
            }
          }

          // 第二遍：应用保留的内容
          updatedBook.volumes = updates.volumes.map((updatedVolume, vIndex) => {
            const existingVolume = existingVolumesMap.get(updatedVolume.id);
            const volumeChaptersMap = existingChaptersMap.get(updatedVolume.id);

            if (existingVolume && volumeChaptersMap && updatedVolume.chapters) {
              return {
                ...updatedVolume,
                chapters: updatedVolume.chapters.map((updatedChapter, cIndex) => {
                  const existingChapter = volumeChaptersMap.get(updatedChapter.id);

                  // 如果是新章节，直接返回
                  if (!existingChapter) {
                    return updatedChapter;
                  }

                  // 优化：如果更新的章节已经有完整的内容（是数组），直接返回
                  // 这意味着内容已经被更新，不需要保留
                  if (
                    updatedChapter.content !== undefined &&
                    updatedChapter.content !== null &&
                    Array.isArray(updatedChapter.content)
                  ) {
                    // 即使数组为空，也认为内容已更新，不需要保留
                    return updatedChapter;
                  }

                  // 尝试获取要保留的内容
                  let contentToPreserve: Paragraph[] | undefined = undefined;

                  // 首先尝试从现有章节获取（如果已加载）
                  if (existingChapter.content !== undefined) {
                    contentToPreserve = existingChapter.content;
                  } else {
                    // 从批量加载的结果中获取
                    contentToPreserve = contentMap.get(updatedChapter.id);
                  }

                  // 如果找到了内容，保留它
                  if (contentToPreserve !== undefined) {
                    return {
                      ...updatedChapter,
                      content: contentToPreserve,
                    };
                  }

                  return updatedChapter;
                }),
              };
            }

            return updatedVolume;
          });
        }

        this.books[index] = updatedBook;

        if (persist) {
          // 优化：如果只更新元数据（如 terminologies、characterSettings 等），不更新 volumes，
          // 则跳过保存章节内容，提高性能
          const isOnlyMetadataUpdate = !updates.volumes;
          const saveChapterContent =
            options?.saveChapterContent ?? (isOnlyMetadataUpdate ? false : true);
          await BookService.saveBook(updatedBook, {
            saveChapterContent,
          });

          await cleanupRemovedChapterData(id, removedChapterIds);
        }
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
