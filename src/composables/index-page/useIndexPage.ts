import { computed, onMounted, watch, ref, inject, provide, type InjectionKey } from 'vue';
import { useRouter } from 'vue-router';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import {
  getTotalChapters,
  getAssetUrl,
  formatWordCount,
  formatRelativeBookDate,
} from 'src/utils';
import { useNovelCharCount } from 'src/composables/useNovelCharCount';
import { CoverService } from 'src/services/cover-service';
import type { Novel } from 'src/models/novel';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { createImportBookHandler } from 'src/composables/shared/useBookImportActions';
import { v4 as uuidv4 } from 'uuid';

/**
 * IndexPage 业务逻辑 composable + provide/inject 辅助。
 *
 * 分派器调用 `provideIndexPage()`，变体通过 `injectIndexPage()` 获取同一份
 * 数据与动作。
 */
export type IndexPageContext = ReturnType<typeof createIndexPageContext>;

const INDEX_PAGE_KEY: InjectionKey<IndexPageContext> = Symbol('index-page');

export function provideIndexPage(): IndexPageContext {
  const ctx = createIndexPageContext();
  provide(INDEX_PAGE_KEY, ctx);
  return ctx;
}

export function injectIndexPage(): IndexPageContext {
  const ctx = inject(INDEX_PAGE_KEY);
  if (!ctx) {
    throw new Error(
      'injectIndexPage() called outside an IndexPage dispatcher — ensure the variant is mounted by IndexPage.vue.',
    );
  }
  return ctx;
}

function createIndexPageContext() {
  const router = useRouter();
  const booksStore = useBooksStore();
  const coverHistoryStore = useCoverHistoryStore();
  const toast = useToastWithHistory();

  const logoPath = getAssetUrl('icons/android-chrome-512x512.png');

  const showAddDialog = ref(false);
  const showImportDialog = ref(false);

  const { loadBookCharCount, getTotalWords, isLoadingCharCount } = useNovelCharCount();

  const totalBooks = computed(() => booksStore.books.length);
  const totalChapters = computed(() =>
    booksStore.books.reduce((total, book) => total + getTotalChapters(book), 0),
  );
  const starredBooks = computed(() => booksStore.books.filter((book) => book.starred).length);
  const totalWords = computed(() =>
    booksStore.books.reduce((total, book) => total + getTotalWords(book), 0),
  );
  const totalTerms = computed(() =>
    booksStore.books.reduce((total, book) => total + (book.terminologies?.length ?? 0), 0),
  );

  const recentBooks = computed(() =>
    [...booksStore.books]
      .sort((a, b) => new Date(b.lastEdited).getTime() - new Date(a.lastEdited).getTime())
      .slice(0, 6),
  );

  const continueReadingBook = computed<Novel | null>(() => recentBooks.value[0] ?? null);

  const greeting = computed(() => {
    const h = new Date().getHours();
    if (h < 5) return '夜深了';
    if (h < 11) return '早安';
    if (h < 14) return '午安';
    if (h < 18) return '下午好';
    return '晚上好';
  });

  const formatDate = formatRelativeBookDate;

  const getCoverUrl = (book: Novel): string => CoverService.getCoverUrl(book);

  const addBook = () => {
    showAddDialog.value = true;
  };

  const importBookFromWeb = () => {
    showImportDialog.value = true;
  };

  const handleImportBook = createImportBookHandler({
    booksStore,
    coverHistoryStore,
    toast,
    onAfterImport: () => {
      showImportDialog.value = false;
    },
  });

  const handleSave = async (formData: Partial<Novel>) => {
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
      ...(formData.translationInstructions !== undefined
        ? { translationInstructions: formData.translationInstructions }
        : {}),
      ...(formData.polishInstructions !== undefined
        ? { polishInstructions: formData.polishInstructions }
        : {}),
      ...(formData.proofreadingInstructions !== undefined
        ? { proofreadingInstructions: formData.proofreadingInstructions }
        : {}),
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
  };

  const navigateToBookDetails = (book: Novel) => {
    void router.push(`/books/${book.id}`);
  };

  const navigateToBooks = () => {
    void router.push('/books');
  };

  const navigateToAI = () => {
    void router.push('/ai');
  };

  const loadAllBookCharCounts = async () => {
    const books = recentBooks.value;
    const loadPromises = books.map((book) => loadBookCharCount(book));
    await Promise.all(loadPromises);
  };

  // immediate: true 让此 watcher 负责"首批字数加载"与"后续增删改"两种场景：
  //   - 页面首次进入、books 还没加载：立即以空数组跑一次（no-op），随后
  //     onMounted 里 loadBooks() 完成触发第二次（填充真实计数）
  //   - 页面再次进入、books 已在 store 里：立即以当前书单触发加载，无需依赖
  //     loadBooks() 的变更信号；避免过去 onMounted 里再显式 await 一次造成
  //     与本 watcher 并发重复加载
  watch(
    () => recentBooks.value,
    async () => {
      await loadAllBookCharCounts();
    },
    { immediate: true },
  );

  onMounted(async () => {
    await booksStore.loadBooks();
  });

  return {
    router,
    booksStore,
    logoPath,
    showAddDialog,
    showImportDialog,
    isLoadingCharCount,
    getTotalWords,
    getTotalChapters,
    formatWordCount,
    totalBooks,
    totalChapters,
    starredBooks,
    totalWords,
    totalTerms,
    recentBooks,
    continueReadingBook,
    greeting,
    formatDate,
    getCoverUrl,
    addBook,
    importBookFromWeb,
    handleImportBook,
    handleSave,
    navigateToBookDetails,
    navigateToBooks,
    navigateToAI,
  };
}
