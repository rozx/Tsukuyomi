import { defineStore, acceptHMRUpdate } from 'pinia';
import type {
  Novel,
  Paragraph,
  Volume,
  Chapter,
  Terminology,
  CharacterSetting,
} from 'src/models/novel';
import { BookService } from 'src/services/book-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { useSettingsStore } from 'src/stores/settings';
import { ImportLibraryReader } from 'src/services/import/import-library-reader';
import { deleteCacheEntry } from 'src/utils/chapter-content-loader';
import type { AppLocale } from 'src/models/locale';
import type { ParagraphTranslationEdit } from 'src/services/localization/paragraph-edit';
import type { TitleEdit } from 'src/services/localization/title-edit';
import { buildBookFieldPatch } from 'src/services/book-field-patch';

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
    chapter.content !== undefined && chapter.content !== null && Array.isArray(chapter.content)
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

/**
 * 保存书籍元数据。未修改目标语言的保存保留库中已存值（其他标签页可能刚改过）；
 * 保存后以库中合并后的记录（目标语言、卷章标题语言槽、术语角色）作为内存副本，
 * 只沿用内存中已加载的章节正文。
 */
async function saveBookMetadata(
  updatedBook: Novel,
  existingBook: Novel | undefined,
  updates: Partial<Novel>,
  saveChapterContent: boolean,
): Promise<Novel> {
  const changesTarget =
    'targetLanguage' in updates && updates.targetLanguage !== existingBook?.targetLanguage;
  await BookService.saveBook(updatedBook, {
    saveChapterContent,
    keepStoredTargetLanguage: !changesTarget,
  });
  const stored = await BookService.getBookById(updatedBook.id);
  return stored ? withLoadedContent(stored, updatedBook) : updatedBook;
}

/** 把内存副本里已加载的章节正文挂到库中读取的书籍记录上（库记录不含正文）。 */
function withLoadedContent(stored: Novel, inMemory: Novel): Novel {
  const loaded = new Map(
    (inMemory.volumes ?? []).flatMap((volume) =>
      (volume.chapters ?? [])
        .filter((chapter) => chapter.content !== undefined)
        .map((chapter) => [chapter.id, chapter] as const),
    ),
  );
  if (!stored.volumes || loaded.size === 0) return stored;
  return {
    ...stored,
    volumes: stored.volumes.map((volume) =>
      volume.chapters
        ? {
            ...volume,
            chapters: volume.chapters.map((chapter) => {
              const memory = loaded.get(chapter.id);
              return memory?.content
                ? { ...chapter, content: memory.content, contentLoaded: true }
                : chapter;
            }),
          }
        : volume,
    ),
  };
}

interface UpdateBookOptions {
  persist?: boolean;
  saveChapterContent?: boolean;
  targetLanguage?: AppLocale;
  expectedBookLanguage?: AppLocale;
}

/** 不涉及卷章结构和正文的更新走字段增量保存 */
function isFieldUpdate(updates: Partial<Novel>, options?: UpdateBookOptions): boolean {
  return options?.persist !== false && !updates.volumes && options?.saveChapterContent !== true;
}

/** 经 editEntities 按 revision 提交术语/角色修改 */
function editBookEntities(
  existingBook: Novel,
  updates: Partial<Novel>,
  options?: UpdateBookOptions,
): Promise<Novel> {
  return BookService.editEntities(
    existingBook,
    updates,
    options?.targetLanguage ?? existingBook.targetLanguage ?? 'zh-CN',
    options?.expectedBookLanguage,
  );
}

/** 已提交的书籍记录；revision 为该记录对应的书籍修改序号（实体编辑路径未提供） */
interface CommittedBook {
  book: Novel;
  revision?: number;
}

/**
 * 普通元数据更新：实体走 editEntities，其余字段只把相对内存快照真正改动的部分
 * 应用到事务内读取的最新记录，持有旧快照的标签页不会覆盖其他标签页刚写入的字段。
 * @returns 已提交的记录；库中没有该书时返回 undefined，由调用方回退整本写入
 */
async function saveBookFieldUpdates(
  existingBook: Novel,
  updates: Partial<Novel>,
  options?: UpdateBookOptions,
): Promise<CommittedBook | undefined> {
  let committed: CommittedBook | undefined;
  if (updates.terminologies !== undefined || updates.characterSettings !== undefined) {
    committed = { book: await editBookEntities(existingBook, updates, options) };
  }
  const patch = buildBookFieldPatch(existingBook, updates);
  const { lastEdited: _time, ...fields } = patch;
  if (committed && Object.keys(fields).length === 0) return committed;
  return (await BookService.updateBookFields(existingBook.id, patch)) ?? committed;
}

/** 在内存快照上合并更新；更新了 volumes 时保留现有章节正文（独立 IndexedDB 存储不应丢失） */
async function mergeBookUpdates(existingBook: Novel, updates: Partial<Novel>): Promise<Novel> {
  // 更新时自动设置 lastEdited 为当前时间（除非调用者明确提供了 lastEdited）
  const updatedBook = {
    ...existingBook,
    ...updates,
    lastEdited: updates.lastEdited ?? new Date(),
  } as Novel;
  // 显式传入 cover 为 null / undefined 表示清除封面，删除该属性（与字段增量路径一致）
  if ('cover' in updates && updates.cover == null) {
    delete updatedBook.cover;
  }
  if (updates.volumes && existingBook.volumes) {
    updatedBook.volumes = await preserveChapterContentsOnVolumesUpdate(
      existingBook.volumes,
      updates.volumes,
    );
  }
  return updatedBook;
}

/**
 * 整本保存路径中的实体编辑：先经 editEntities 提交术语/角色。
 * @returns complete 为 true 表示没有其他字段需要整本保存
 */
async function commitSnapshotEntityEdit(
  existingBook: Novel,
  updates: Partial<Novel>,
  options?: UpdateBookOptions,
): Promise<{ book: Novel; complete: boolean }> {
  const committed = await editBookEntities(existingBook, updates, options);
  const {
    terminologies: _terms,
    characterSettings: _characters,
    lastEdited: _time,
    ...otherUpdates
  } = updates;
  const book = { ...committed, ...otherUpdates };
  const volumes = updates.volumes ?? committed.volumes;
  if (volumes) {
    book.volumes = await preserveChapterContentsOnVolumesUpdate(
      existingBook.volumes ?? [],
      volumes,
    );
  }
  return { book, complete: Object.keys(otherUpdates).length === 0 };
}

/** 卷章结构等整本保存路径（含正文），保持原有的整本写入语义 */
async function persistBookSnapshot(
  existingBook: Novel,
  updatedBook: Novel,
  updates: Partial<Novel>,
  options?: UpdateBookOptions,
): Promise<Novel> {
  let book = updatedBook;
  if (updates.terminologies !== undefined || updates.characterSettings !== undefined) {
    const edited = await commitSnapshotEntityEdit(existingBook, updates, options);
    if (edited.complete) return edited.book;
    book = edited.book;
  }
  // 优化：只更新元数据时跳过保存章节内容
  const saveChapterContent = options?.saveChapterContent ?? Boolean(updates.volumes);
  return saveBookMetadata(book, existingBook, updates, saveChapterContent);
}

export const useBooksStore = defineStore('books', {
  state: () => ({
    storageRevisions: {} as Record<string, number>,
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
    async editTitle(
      bookId: string,
      language: AppLocale,
      edit: TitleEdit,
      expectedBookLanguage?: AppLocale,
    ): Promise<void> {
      await BookService.editTitle(bookId, language, edit, expectedBookLanguage);
      await this.refreshBookFromStorage(bookId);
    },
    async editParagraphTranslations(
      bookId: string,
      chapterId: string,
      language: AppLocale,
      edits: readonly ParagraphTranslationEdit[],
      expectedBookLanguage?: AppLocale,
    ): Promise<Paragraph[]> {
      await BookService.editParagraphTranslations(
        bookId,
        chapterId,
        language,
        edits,
        expectedBookLanguage,
      );
      const fresh = await this.refreshBookFromStorage(bookId, chapterId);
      return (
        fresh?.volumes
          ?.flatMap((volume) => volume.chapters ?? [])
          .find((chapter) => chapter.id === chapterId)?.content ?? []
      );
    },
    async rollbackBooks(books: Novel[]): Promise<void> {
      await BookService.rollbackBooks(books);
      this.books = await BookService.getAllBooks();
    },

    async replaceBooks(books: Novel[], operationId: string): Promise<void> {
      await BookService.replaceBooks(books, operationId);
      this.books = await BookService.getAllBooks();
    },

    // 撤销 helper 通过传入的 store 参数调用，Fallow 不追踪该参数绑定。
    // fallow-ignore-next-line unused-store-member
    async restoreEntity<T extends Terminology | CharacterSetting>(
      bookId: string,
      kind: 'term' | 'character',
      entity: T,
      operationId: string,
    ): Promise<T> {
      const value = await BookService.restoreEntity(bookId, kind, entity, operationId);
      await this.refreshBookFromStorage(bookId);
      return value;
    },

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

    /** 读取已提交状态，不走 updateBook 的再次保存；执行前只加载需要的正文。 */
    async refreshBookFromStorage(id: string, chapterId?: string): Promise<Novel | undefined> {
      const loaded = await ImportLibraryReader.readBook(id, {
        chapterIds: chapterId ? [chapterId] : [],
      });
      if (loaded.kind === 'failed') throw new Error(`BOOK_READ_FAILED: ${loaded.message}`);
      if (loaded.kind === 'absent') {
        this.books = this.books.filter((book) => book.id !== id);
        delete this.storageRevisions[id];
        return undefined;
      }
      const content = chapterId ? loaded.chapters[chapterId] : undefined;
      if (content?.kind === 'failed') throw new Error(`BOOK_READ_FAILED: ${content.message}`);
      const fresh = loaded.book;
      for (const volume of fresh.volumes ?? [])
        for (const chapter of volume.chapters ?? []) {
          deleteCacheEntry(chapter.id);
          if (chapter.id === chapterId && content?.kind === 'loaded')
            chapter.content = content.content;
          else delete chapter.content;
          chapter.contentLoaded = chapter.content !== undefined;
        }
      const index = this.books.findIndex((book) => book.id === id);
      if (index >= 0) this.books[index] = fresh;
      else this.books.push(fresh);
      this.storageRevisions[id] = loaded.revision;
      return fresh;
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
     * 采用已提交的记录，并沿用内存中已加载的章节正文。并发保存时较晚返回的旧提交
     * （修改序号低于内存已采用的序号）不覆盖内存中更新的记录。
     */
    adoptCommittedBook(existingBook: Novel, committed: CommittedBook): void {
      const { id } = existingBook;
      const known = this.storageRevisions[id];
      if (committed.revision !== undefined && known !== undefined && committed.revision < known)
        return;
      const index = this.books.findIndex((book) => book.id === id);
      if (index >= 0) this.books[index] = withLoadedContent(committed.book, existingBook);
      if (committed.revision !== undefined) this.storageRevisions[id] = committed.revision;
    },

    /**
     * 更新书籍
     */
    async updateBook(
      id: string,
      updates: Partial<Novel>,
      options?: UpdateBookOptions,
    ): Promise<void> {
      const index = this.books.findIndex((book) => book.id === id);
      const existingBook = this.books[index];
      if (!existingBook) return;
      if (isFieldUpdate(updates, options)) {
        const committed = await saveBookFieldUpdates(existingBook, updates, options);
        if (committed) {
          this.adoptCommittedBook(existingBook, committed);
          return;
        }
      }
      const removedChapterIds = collectRemovedChapterIds(existingBook.volumes, updates.volumes);
      let updatedBook = await mergeBookUpdates(existingBook, updates);
      if (options?.persist !== false) {
        updatedBook = await persistBookSnapshot(existingBook, updatedBook, updates, options);
        await cleanupRemovedChapterData(id, removedChapterIds);
      }
      this.books[index] = updatedBook;
    },

    /**
     * 删除书籍
     */
    async deleteBook(id: string): Promise<void> {
      if (!this.books.some((book) => book.id === id)) return;
      await BookService.deleteBook(id, { recordDeletion: true });
      this.books = this.books.filter((book) => book.id !== id);
      const settingsStore = useSettingsStore();
      await settingsStore.reloadSyncConfigs();
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
