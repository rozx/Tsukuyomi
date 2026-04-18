import { computed, ref, watch, inject, provide, type InjectionKey } from 'vue';
import { useRouter } from 'vue-router';
import { v4 as uuidv4 } from 'uuid';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';
import { useContextStore } from 'src/stores/context';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useNovelCharCount } from 'src/composables/useNovelCharCount';
import { CoverService } from 'src/services/cover-service';
import { MemoryService } from 'src/services/memory-service';
import { SettingsService } from 'src/services/settings-service';
import type { Novel } from 'src/models/novel';
import { formatWordCount, getTotalChapters as utilGetTotalChapters } from 'src/utils';
import { cloneDeep } from 'lodash';

export type BooksPageContext = ReturnType<typeof createBooksPageContext>;

const BOOKS_PAGE_KEY: InjectionKey<BooksPageContext> = Symbol('books-page');

export function provideBooksPage(): BooksPageContext {
  const ctx = createBooksPageContext();
  provide(BOOKS_PAGE_KEY, ctx);
  return ctx;
}

export function injectBooksPage(): BooksPageContext {
  const ctx = inject(BOOKS_PAGE_KEY);
  if (!ctx) {
    throw new Error(
      'injectBooksPage() called outside a BooksPage dispatcher — ensure the variant is mounted by BooksPage.vue.',
    );
  }
  return ctx;
}

function createBooksPageContext() {
  const router = useRouter();
  const booksStore = useBooksStore();
  const coverHistoryStore = useCoverHistoryStore();
  const settingsStore = useSettingsStore();
  const contextStore = useContextStore();
  const toast = useToastWithHistory();

  // 对话框状态
  const showAddDialog = ref(false);
  const showEditDialog = ref(false);
  const showImportDialog = ref(false);
  const selectedBook = ref<Novel | null>(null);

  // 删除确认对话框状态
  const showDeleteConfirm = ref(false);
  const deleteConfirmInput = ref('');
  const bookToDelete = ref<Novel | null>(null);

  // 文件输入引用
  const fileInputRef = ref<HTMLInputElement | null>(null);

  // 排序菜单
  const sortMenuRef = ref<{
    toggle: (event: Event) => void;
    show: (event: Event) => void;
    hide: () => void;
  } | null>(null);
  const sortMenuItems = computed(() =>
    sortOptions.map((option) => ({
      label: option.label,
      icon: selectedSort.value === option.value ? 'pi pi-check' : '',
      command: () => {
        selectedSort.value = option.value;
      },
    })),
  );

  const searchQuery = ref('');

  const getTotalChapters = utilGetTotalChapters;
  const { loadBookCharCount, getTotalWords, isLoadingCharCount } = useNovelCharCount();

  type SortOption = {
    label: string;
    value: string;
    sortFn: (a: Novel, b: Novel) => number;
  };

  const sortOptions: SortOption[] = [
    {
      label: '默认',
      value: 'default',
      sortFn: (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    },
    {
      label: '标题 (A-Z)',
      value: 'title-asc',
      sortFn: (a, b) => a.title.localeCompare(b.title, 'zh-CN'),
    },
    {
      label: '标题 (Z-A)',
      value: 'title-desc',
      sortFn: (a, b) => b.title.localeCompare(a.title, 'zh-CN'),
    },
    {
      label: '创建时间 (最新)',
      value: 'created-desc',
      sortFn: (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    },
    {
      label: '创建时间 (最早)',
      value: 'created-asc',
      sortFn: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    },
    {
      label: '更新时间 (最新)',
      value: 'updated-desc',
      sortFn: (a, b) => new Date(b.lastEdited).getTime() - new Date(a.lastEdited).getTime(),
    },
    {
      label: '更新时间 (最早)',
      value: 'updated-asc',
      sortFn: (a, b) => new Date(a.lastEdited).getTime() - new Date(b.lastEdited).getTime(),
    },
    {
      label: '章节数 (多→少)',
      value: 'chapters-desc',
      sortFn: (a, b) => getTotalChapters(b) - getTotalChapters(a),
    },
    {
      label: '章节数 (少→多)',
      value: 'chapters-asc',
      sortFn: (a, b) => getTotalChapters(a) - getTotalChapters(b),
    },
    {
      label: '字数 (多→少)',
      value: 'words-desc',
      sortFn: (a, b) => getTotalWords(b) - getTotalWords(a),
    },
    {
      label: '字数 (少→多)',
      value: 'words-asc',
      sortFn: (a, b) => getTotalWords(a) - getTotalWords(b),
    },
    {
      label: '收藏优先',
      value: 'starred',
      sortFn: (a, b) => {
        const aStarred = a.starred || false;
        const bStarred = b.starred || false;
        if (aStarred === bStarred) {
          return new Date(b.lastEdited).getTime() - new Date(a.lastEdited).getTime();
        }
        return aStarred ? -1 : 1;
      },
    },
  ];

  const selectedSort = computed({
    get: () => settingsStore.booksSortOption || 'default',
    set: (value: string) => {
      void settingsStore.setBooksSortOption(value);
    },
  });

  // 分割按钮菜单项
  const addBookMenuItems = computed(() => [
    {
      label: '从网站导入',
      icon: 'pi pi-globe',
      command: () => importBookFromWeb(),
    },
    {
      label: '从 JSON 导入',
      icon: 'pi pi-file-import',
      command: () => importBookFromJson(),
    },
  ]);

  const filteredBooks = computed(() => {
    let books = booksStore.books;

    if (searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase().trim();
      books = books.filter((book) => {
        const title = book.title.toLowerCase();
        const alternateTitles = book.alternateTitles?.join(' ').toLowerCase() || '';
        const author = book.author?.toLowerCase() || '';
        const description = book.description?.toLowerCase() || '';
        const tags = book.tags?.join(' ').toLowerCase() || '';
        return (
          title.includes(query) ||
          alternateTitles.includes(query) ||
          author.includes(query) ||
          description.includes(query) ||
          tags.includes(query)
        );
      });
    }

    const sortedBooks = [...books];
    const sortOption = sortOptions.find((opt) => opt.value === selectedSort.value);
    if (sortOption) {
      sortedBooks.sort(sortOption.sortFn);
    }

    return sortedBooks;
  });

  const loadAllBookCharCounts = async () => {
    const books = booksStore.books;
    const loadPromises = books.map((book) => loadBookCharCount(book));
    await Promise.all(loadPromises);
  };

  watch(
    () => booksStore.books.length,
    async () => {
      await loadAllBookCharCounts();
    },
    { immediate: true },
  );

  const getCoverUrl = (book: Novel): string => CoverService.getCoverUrl(book);

  const formatDate = (date: Date): string => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return '今天';
    if (days === 1) return '昨天';
    if (days < 7) return `${days}天前`;
    if (days < 30) return `${Math.floor(days / 7)}周前`;
    if (days < 365) return `${Math.floor(days / 30)}个月前`;

    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const addBook = () => {
    selectedBook.value = null;
    showAddDialog.value = true;
    contextStore.clearContext();
  };

  const importBookFromWeb = () => {
    showImportDialog.value = true;
  };

  const importBookFromJson = () => {
    fileInputRef.value?.click();
  };

  const handleFileSelect = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) return;

    try {
      const data = await SettingsService.readJsonFile(file);
      const { novels: importedBooks, memoriesByBookId } = SettingsService.parseBookImportData(data);

      const now = new Date();
      let successCount = 0;
      let errorCount = 0;
      const importedIds: string[] = [];
      const oldIdToNewId = new Map<string, string>();

      for (const bookData of importedBooks) {
        try {
          if (!bookData.title || typeof bookData.title !== 'string') {
            errorCount++;
            continue;
          }

          const newBook: Novel = {
            ...bookData,
            id: uuidv4(),
            createdAt: bookData.createdAt ? new Date(bookData.createdAt) : now,
            lastEdited: bookData.lastEdited ? new Date(bookData.lastEdited) : now,
          };

          await booksStore.addBook(newBook);
          importedIds.push(newBook.id);

          if (bookData.id) {
            oldIdToNewId.set(bookData.id, newBook.id);
          }

          if (newBook.cover) {
            void coverHistoryStore.addCover(newBook.cover);
          }

          successCount++;
        } catch (error) {
          console.error('导入书籍时出错:', error);
          errorCount++;
        }
      }

      let importedMemoryCount = 0;
      let memoryErrorCount = 0;
      for (const [oldBookId, memories] of memoriesByBookId) {
        const newBookId = oldIdToNewId.get(oldBookId);
        if (!newBookId) continue;
        for (const mem of memories) {
          try {
            await MemoryService.createMemoryWithId(newBookId, mem.id, mem.content, mem.summary, {
              createdAt: mem.createdAt,
              lastAccessedAt: mem.lastAccessedAt,
            });
            importedMemoryCount++;
          } catch (e) {
            console.error(`导入记忆 ${mem.id} 失败:`, e);
            memoryErrorCount++;
          }
        }
      }

      if (successCount > 0) {
        const idsToDelete = [...importedIds];
        const memSummary =
          importedMemoryCount > 0
            ? `（含 ${importedMemoryCount} 条记忆${memoryErrorCount > 0 ? `，${memoryErrorCount} 条失败` : ''}）`
            : memoryErrorCount > 0
              ? `（${memoryErrorCount} 条记忆导入失败）`
              : '';
        toast.add({
          severity: 'success',
          summary: '导入成功',
          detail: `成功导入 ${successCount} 本书籍${memSummary}${errorCount > 0 ? `，${errorCount} 本失败` : ''}`,
          life: 3000,
          onRevert: async () => {
            for (const id of idsToDelete) {
              await booksStore.deleteBook(id);
            }
          },
        });
      } else {
        toast.add({
          severity: 'error',
          summary: '导入失败',
          detail: `未能导入任何书籍${errorCount > 0 ? `（${errorCount} 本失败）` : ''}`,
          life: 3000,
        });
      }
    } catch (error) {
      toast.add({
        severity: 'error',
        summary: '导入失败',
        detail: error instanceof Error ? error.message : '解析文件时发生未知错误',
        life: 5000,
      });
    }

    target.value = '';
  };

  const handleImportBook = async (novel: Novel) => {
    const now = new Date();
    const newBook: Novel = {
      ...novel,
      id: uuidv4(),
      createdAt: now,
      lastEdited: now,
    };
    await booksStore.addBook(newBook);

    if (newBook.cover) {
      void coverHistoryStore.addCover(newBook.cover);
    }

    showImportDialog.value = false;
    toast.add({
      severity: 'success',
      summary: '导入成功',
      detail: `已成功从网站导入书籍 "${newBook.title}"`,
      life: 3000,
      onRevert: () => booksStore.deleteBook(newBook.id),
    });
  };

  const editBook = (book: Novel) => {
    selectedBook.value = { ...book };
    showEditDialog.value = true;
    contextStore.setContext({
      currentBookId: book.id,
      currentChapterId: null,
      hoveredParagraphId: null,
      selectedParagraphId: null,
    });
  };

  const deleteBook = (book: Novel) => {
    bookToDelete.value = book;
    deleteConfirmInput.value = '';
    showDeleteConfirm.value = true;
  };

  const isDeletingBook = ref(false);

  const confirmDeleteBook = async () => {
    if (!bookToDelete.value || isDeletingBook.value) return;

    const bookTitle = bookToDelete.value.title;
    const inputTitle = deleteConfirmInput.value.trim();
    if (inputTitle !== bookTitle) {
      toast.add({
        severity: 'error',
        summary: '标题不匹配',
        detail: '输入的标题与书籍标题不一致，请重新输入',
        life: 3000,
      });
      return;
    }

    isDeletingBook.value = true;
    try {
      const bookToRestore = cloneDeep(bookToDelete.value);
      await booksStore.deleteBook(bookToDelete.value.id);

      showDeleteConfirm.value = false;
      deleteConfirmInput.value = '';
      bookToDelete.value = null;

      toast.add({
        severity: 'success',
        summary: '删除成功',
        detail: `已成功删除书籍 "${bookTitle}"`,
        life: 3000,
        onRevert: () => booksStore.addBook(bookToRestore),
      });
    } finally {
      isDeletingBook.value = false;
    }
  };

  const cancelDeleteBook = () => {
    showDeleteConfirm.value = false;
    deleteConfirmInput.value = '';
    bookToDelete.value = null;
  };

  const copyBookTitle = async () => {
    if (!bookToDelete.value) return;

    const title = bookToDelete.value.title;

    try {
      await navigator.clipboard.writeText(title);
      deleteConfirmInput.value = title;
      toast.add({
        severity: 'success',
        summary: '已复制',
        detail: '书籍标题已复制并填充到输入框',
        life: 2000,
      });
    } catch {
      deleteConfirmInput.value = title;
      toast.add({
        severity: 'info',
        summary: '已填充',
        detail: '书籍标题已填充到输入框（复制到剪贴板失败）',
        life: 2000,
      });
    }
  };

  const isDeleteDisabled = computed(() => {
    if (!bookToDelete.value) return true;
    return deleteConfirmInput.value.trim() !== bookToDelete.value.title;
  });

  const toggleStar = async (book: Novel) => {
    const isStarred = book.starred || false;
    await booksStore.updateBook(book.id, { starred: !isStarred });
    toast.add({
      severity: 'success',
      summary: isStarred ? '已取消收藏' : '已收藏',
      detail: `已${isStarred ? '取消收藏' : '收藏'}书籍 "${book.title}"`,
      life: 2000,
    });
  };

  const navigateToBookDetails = (book: Novel) => {
    void router.push(`/books/${book.id}`);
  };

  const handleSave = async (formData: Partial<Novel>) => {
    if (showAddDialog.value) {
      const now = new Date();
      const newBook: Novel = {
        id: uuidv4(),
        title: formData.title!,
        ...(formData.alternateTitles && formData.alternateTitles.length > 0
          ? { alternateTitles: formData.alternateTitles }
          : {}),
        ...(formData.author?.trim() ? { author: formData.author.trim() } : {}),
        ...(formData.description?.trim() ? { description: formData.description.trim() } : {}),
        ...(formData.tags && formData.tags.length > 0 ? { tags: formData.tags } : {}),
        ...(formData.webUrl && formData.webUrl.length > 0 ? { webUrl: formData.webUrl } : {}),
        ...(formData.cover ? { cover: formData.cover } : {}),
        ...(formData.volumes && formData.volumes.length > 0 ? { volumes: formData.volumes } : {}),
        createdAt: now,
        lastEdited: now,
      };
      await booksStore.addBook(newBook);

      if (newBook.cover) {
        void coverHistoryStore.addCover(newBook.cover);
      }

      showAddDialog.value = false;
      toast.add({
        severity: 'success',
        summary: '添加成功',
        detail: `已成功添加书籍 "${newBook.title}"`,
        life: 3000,
        onRevert: () => booksStore.deleteBook(newBook.id),
      });
    } else if (showEditDialog.value && selectedBook.value) {
      const updates: Partial<Novel> = {
        title: formData.title!,
        lastEdited: new Date(),
      };
      if (formData.alternateTitles && formData.alternateTitles.length > 0) {
        updates.alternateTitles = formData.alternateTitles;
      }
      if (formData.author?.trim()) updates.author = formData.author.trim();
      if (formData.description?.trim()) updates.description = formData.description.trim();
      if (formData.tags && formData.tags.length > 0) updates.tags = formData.tags;
      if (formData.webUrl && formData.webUrl.length > 0) updates.webUrl = formData.webUrl;
      if (formData.cover !== undefined) updates.cover = formData.cover;
      if (formData.volumes !== undefined) updates.volumes = formData.volumes;
      if (formData.translationInstructions !== undefined) {
        updates.translationInstructions = formData.translationInstructions;
      }
      if (formData.polishInstructions !== undefined) {
        updates.polishInstructions = formData.polishInstructions;
      }
      if (formData.proofreadingInstructions !== undefined) {
        updates.proofreadingInstructions = formData.proofreadingInstructions;
      }

      const oldBook = cloneDeep(selectedBook.value);
      await booksStore.updateBook(selectedBook.value.id, updates);
      showEditDialog.value = false;
      const bookTitle = updates.title || selectedBook.value.title;
      selectedBook.value = null;
      toast.add({
        severity: 'success',
        summary: '更新成功',
        detail: `已成功更新书籍 "${bookTitle}"`,
        life: 3000,
        onRevert: () => booksStore.updateBook(oldBook.id, oldBook),
      });
    }
  };

  return {
    booksStore,
    // dialogs
    showAddDialog,
    showEditDialog,
    showImportDialog,
    selectedBook,
    showDeleteConfirm,
    deleteConfirmInput,
    bookToDelete,
    isDeletingBook,
    isDeleteDisabled,
    // refs
    fileInputRef,
    sortMenuRef,
    // data
    searchQuery,
    sortOptions,
    selectedSort,
    sortMenuItems,
    addBookMenuItems,
    filteredBooks,
    // helpers
    formatWordCount,
    getTotalChapters,
    getTotalWords,
    isLoadingCharCount,
    getCoverUrl,
    formatDate,
    // actions
    addBook,
    importBookFromWeb,
    importBookFromJson,
    handleFileSelect,
    handleImportBook,
    editBook,
    deleteBook,
    confirmDeleteBook,
    cancelDeleteBook,
    copyBookTitle,
    toggleStar,
    navigateToBookDetails,
    handleSave,
  };
}
