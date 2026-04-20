import {
  computed,
  ref,
  shallowRef,
  watch,
  watchEffect,
  nextTick,
  onUnmounted,
  onMounted,
  inject,
  provide,
  type ComputedRef,
  type Ref,
  type InjectionKey,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useBooksStore } from 'src/stores/books';
import { useBookDetailsStore } from 'src/stores/book-details';
import { useContextStore } from 'src/stores/context';
import { useUiStore } from 'src/stores/ui';
import { CoverService } from 'src/services/cover-service';
import { ChapterService } from 'src/services/chapter-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { CharacterSettingService } from 'src/services/character-setting-service';
import { TerminologyService } from 'src/services/terminology-service';
import { EmbeddingQueue } from 'src/services/embedding-queue';
import { EmbeddingService } from 'src/services/embedding-service';
import {
  formatWordCount,
  getNovelCharCountAsync,
  getTotalChapters,
  getChapterContentText,
  getVolumeDisplayTitle,
  getChapterDisplayTitle,
  findUniqueTermsInText,
  findUniqueCharactersInText,
  getChapterTranslationStats,
} from 'src/utils';
import { getSelectedParagraphTranslationText } from 'src/utils/translation-utils';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { toMillis } from 'src/utils/time-utils';
import { cloneDeep } from 'lodash';
import type {
  Chapter,
  Novel,
  Volume,
  Terminology,
  CharacterSetting,
  Paragraph,
  ScoreBreakdown,
} from 'src/models/novel';
import type { MemoryReference } from 'src/components/novel/memory-reference-types';
import { useSearchReplace } from 'src/composables/book-details/useSearchReplace';
import { useChapterManagement } from 'src/composables/book-details/useChapterManagement';
import {
  useActionInfoToast,
  countUniqueActions,
} from 'src/composables/book-details/useActionInfoToast';
import { useChapterExport } from 'src/composables/book-details/useChapterExport';
import { useChapterDragDrop } from 'src/composables/book-details/useChapterDragDrop';
import { useParagraphTranslation } from 'src/composables/book-details/useParagraphTranslation';
import { useEditMode } from 'src/composables/book-details/useEditMode';
import { useParagraphNavigation } from 'src/composables/book-details/useParagraphNavigation';
import { useKeyboardShortcuts } from 'src/composables/book-details/useKeyboardShortcuts';
import { useChapterTranslation } from 'src/composables/book-details/useChapterTranslation';
import { useUndoRedo } from 'src/composables/useUndoRedo';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { useAIModelsStore } from 'src/stores/ai-models';
import { MemoryService } from 'src/services/memory-service';
import { selectRelevantMemoriesForChunk } from 'src/services/ai/tasks/utils/context-builder';
import { resolveTaskChunkSize } from 'src/services/ai/tasks/utils/chunk-formatter';
import type { Memory } from 'src/models/memory';
import type { BookWorkspaceMode } from 'src/constants/responsive';
import type { MenuItem } from 'primevue/menuitem';
import type Popover from 'primevue/popover';
import {
  getChapterStatus as getChapterStatusPure,
  chapterStatusIcon as chapterStatusIconPure,
  chapterStatusColor as chapterStatusColorPure,
  chapterStatusTextColor as chapterStatusTextColorPure,
  chapterStatusLabel as chapterStatusLabelPure,
} from 'src/utils/chapter-status';
import { isPortrait } from 'src/utils/device-orientation';

/**
 * BookDetailsPage 业务逻辑 composable + provide/inject 辅助。
 *
 * BookDetailsPage 是最大、最复杂的 surface：约 2480 行脚本、~1000 行模板、
 * ~1440 行样式。为了满足"变体切换时状态必须保留"的约束，composable 在
 * **分派器**中调用一次，并通过 Vue provide/inject 把上下文注入给挂载的变体。
 * 变体调用 `injectBookDetailsPage()` 获取同一份状态与动作，不得重新声明。
 *
 * 大量底层业务逻辑已由 `composables/book-details/*` 细分 composable 承担
 * （useChapterManagement、useChapterTranslation、useParagraphNavigation 等），
 * 本 composable 负责把它们编排起来，并补上路由/导航/对话框/手机派生数据等黏合层。
 */
export type MobileActiveTab = 'chapters' | 'terms' | 'characters' | 'memory';
export type SettingMenu = 'terms' | 'characters' | 'memory';

export type BookDetailsPageContext = ReturnType<typeof createBookDetailsPageContext>;

const BOOK_DETAILS_PAGE_KEY: InjectionKey<BookDetailsPageContext> = Symbol('book-details-page');

function findChapterInBook(book: Novel, chapterId: string): Chapter | undefined {
  if (!book.volumes) return undefined;
  for (const volume of book.volumes) {
    const match = volume.chapters?.find((ch) => ch.id === chapterId);
    if (match) return match;
  }
  return undefined;
}

async function resolveChapterWithContent(
  updatedChapter: Chapter,
  previousChapter: Chapter,
): Promise<Chapter> {
  if (updatedChapter.content !== undefined && Array.isArray(updatedChapter.content)) {
    return updatedChapter;
  }
  try {
    return await ChapterService.loadChapterContent(updatedChapter);
  } catch (error) {
    console.error('Failed to reload chapter content after undo/redo:', error);
    return { ...previousChapter, ...updatedChapter };
  }
}

function hasChapterMetadataChanged(current: Chapter, updated: Chapter): boolean {
  return (
    current.title !== updated.title ||
    current.webUrl !== updated.webUrl ||
    toMillis(current.lastEdited) !== toMillis(updated.lastEdited) ||
    toMillis(current.createdAt) !== toMillis(updated.createdAt) ||
    current.originalContent !== updated.originalContent ||
    current.contentLoaded !== updated.contentLoaded ||
    current.translationInstructions !== updated.translationInstructions ||
    current.polishInstructions !== updated.polishInstructions ||
    current.proofreadingInstructions !== updated.proofreadingInstructions
  );
}

function detectExternalMetadataChange(current: Chapter, updated: Chapter): boolean {
  const currentMs = toMillis(current.lastEdited);
  const updatedMs = toMillis(updated.lastEdited);
  return (
    current.webUrl !== updated.webUrl ||
    current.originalContent !== updated.originalContent ||
    (updatedMs > currentMs && Math.abs(updatedMs - Date.now()) < 10000)
  );
}

function buildMergedSelectedChapter(
  current: Chapter,
  updated: Chapter,
  shouldUpdateMetadata: boolean,
  shouldUpdateContent: boolean,
): Chapter {
  return {
    ...current,
    ...(shouldUpdateMetadata ? updated : {}),
    content: shouldUpdateContent ? updated.content : (current.content ?? updated.content),
    contentLoaded: shouldUpdateContent
      ? true
      : (current.contentLoaded ?? updated.contentLoaded),
    lastEdited: shouldUpdateMetadata ? updated.lastEdited : current.lastEdited,
  };
}

async function syncSelectedChapterAfterUndoRedo(
  updatedBook: Novel,
  selectedChapterId: string | null,
  selectedChapterRef: Ref<Chapter | null>,
): Promise<void> {
  if (!selectedChapterId) return;
  const updatedChapter = findChapterInBook(updatedBook, selectedChapterId);
  if (!updatedChapter) {
    if (selectedChapterRef.value) selectedChapterRef.value = null;
    return;
  }
  if (!selectedChapterRef.value && updatedChapter.content === undefined) return;
  selectedChapterRef.value = await resolveChapterWithContent(
    updatedChapter,
    selectedChapterRef.value ?? updatedChapter,
  );
}

export function provideBookDetailsPage(): BookDetailsPageContext {
  const ctx = createBookDetailsPageContext();
  provide(BOOK_DETAILS_PAGE_KEY, ctx);
  return ctx;
}

export function injectBookDetailsPage(): BookDetailsPageContext {
  const ctx = inject(BOOK_DETAILS_PAGE_KEY);
  if (!ctx) {
    throw new Error(
      'injectBookDetailsPage() called outside a BookDetailsPage dispatcher — ensure the variant is mounted by BookDetailsPage.vue.',
    );
  }
  return ctx;
}

function createBookDetailsPageContext() {
  const route = useRoute();
  const router = useRouter();
  const booksStore = useBooksStore();
  const bookDetailsStore = useBookDetailsStore();
  const contextStore = useContextStore();
  const uiStore = useUiStore();
  const aiProcessingStore = useAIProcessingStore();
  const aiModelsStore = useAIModelsStore();
  const toast = useToastWithHistory();

  const isPhone = computed(() => uiStore.deviceType === 'phone');
  const isTablet = computed(() => uiStore.deviceType === 'tablet');
  const isSmallScreen = computed(() => isPhone.value || isTablet.value);

  // 书籍编辑对话框状态
  const showBookDialog = ref(false);
  const showScraperDialog = ref(false);

  // 设置菜单状态
  const selectedSettingMenu = ref<SettingMenu | null>(null);

  // 平板端侧边栏可折叠——竖屏 17rem 宽度下，读者想要更多阅读空间时折叠目录。
  // 桌面 / 手机不走这个状态（桌面始终有侧栏，手机用 workspace mode 切换）。
  // 初始化时根据当前朝向决定默认：竖屏默认关闭（避免 overlay 挡住正文），
  // 横屏默认打开（list 参与 flex 布局，不影响阅读）。
  const isTabletSidebarOpen = ref(!isPortrait());
  const toggleTabletSidebar = () => {
    isTabletSidebarOpen.value = !isTabletSidebarOpen.value;
  };

  // 滚动容器引用
  const scrollableContentRef = ref<HTMLElement | null>(null);
  const chapterContentPanelRef = ref<HTMLElement | null>(null);

  // 将当前内容滚动到顶部（优先使用章节内容面板，其次使用外层容器兜底）
  const scrollCurrentContentToTop = async () => {
    await nextTick();
    const container = chapterContentPanelRef.value ?? scrollableContentRef.value;
    if (container) {
      container.scrollTop = 0;
      container.focus({ preventScroll: true });
    }
  };

  // 从路由参数获取书籍 ID
  const bookId = computed(() => route.params.id as string);
  const settingMenuFromRoute = computed<SettingMenu | null>(() => {
    const setting = route.params.setting;
    if (setting === 'terms' || setting === 'characters' || setting === 'memory') {
      return setting;
    }
    return null;
  });

  // 切换卷的展开/折叠状态
  const toggleVolumeById = (volumeId: string) => {
    if (!bookId.value) return;
    void bookDetailsStore.toggleVolume(bookId.value, volumeId);
  };

  const onToggleVolume = (...args: unknown[]) => {
    const volumeId = args[0];
    if (typeof volumeId !== 'string') return;
    toggleVolumeById(volumeId);
  };

  const isVolumeExpanded = (volumeId: string): boolean => {
    if (!bookId.value) return false;
    return bookDetailsStore.isVolumeExpanded(bookId.value, volumeId);
  };

  // 获取书籍信息
  const book = computed(() => {
    if (!bookId.value) return undefined;
    return booksStore.getBookById(bookId.value);
  });

  // 稳定化的术语/角色引用
  const EMPTY_TERMS: Terminology[] = [];
  const EMPTY_CHARS: CharacterSetting[] = [];
  const stableTerminologies = shallowRef<Terminology[]>(EMPTY_TERMS);
  const stableCharacterSettings = shallowRef<CharacterSetting[]>(EMPTY_CHARS);
  watchEffect(() => {
    const terms = book.value?.terminologies;
    stableTerminologies.value = terms && terms.length > 0 ? terms : EMPTY_TERMS;
    const chars = book.value?.characterSettings;
    stableCharacterSettings.value = chars && chars.length > 0 ? chars : EMPTY_CHARS;
  });

  // ActionInfo Toast 处理
  const { handleActionInfoToast } = useActionInfoToast(book);

  // 撤销/重做功能 - 创建一个增强函数来获取包含当前已加载章节内容的书籍对象
  const getEnhancedBook = (): Novel | undefined => {
    if (!book.value) return undefined;

    if (
      selectedChapterWithContent.value?.content &&
      selectedChapterWithContent.value?.id &&
      book.value.volumes
    ) {
      return {
        ...book.value,
        volumes: book.value.volumes.map((volume) => {
          if (!volume.chapters) return volume;
          return {
            ...volume,
            chapters: volume.chapters.map((chapter) => {
              if (chapter.id === selectedChapterWithContent.value?.id) {
                return {
                  ...chapter,
                  content: selectedChapterWithContent.value.content,
                };
              }
              return chapter;
            }),
          };
        }),
      };
    }

    return book.value;
  };

  const {
    canUndo,
    canRedo,
    undoDescription,
    redoDescription,
    saveState,
    undo,
    redo,
    clearHistory,
  } = useUndoRedo(
    book,
    async (updatedBook) => {
      if (!updatedBook) return;
      await booksStore.updateBook(updatedBook.id, updatedBook);
      await syncSelectedChapterAfterUndoRedo(
        updatedBook,
        selectedChapterId.value,
        selectedChapterWithContent,
      );
    },
    getEnhancedBook,
  );

  // 监听书籍ID变化，切换书籍时清空历史记录
  watch(
    bookId,
    () => {
      clearHistory();
    },
    { immediate: false },
  );

  const {
    showAddVolumeDialog,
    showAddChapterDialog,
    newVolumeTitle,
    newChapterTitle,
    selectedVolumeId,
    handleAddVolume: originalHandleAddVolume,
    handleAddChapter: originalHandleAddChapter,
    openAddChapterDialog,
    showEditVolumeDialog,
    showEditChapterDialog,
    editingVolumeTitle,
    editingVolumeTranslation,
    editingChapterTitle,
    editingChapterTranslation,
    editingChapterTargetVolumeId,
    editingChapterTranslationInstructions,
    editingChapterPolishInstructions,
    editingChapterProofreadingInstructions,
    editingChapterWebUrl,
    editingChapterLastUpdated,
    editingChapterLastEdited,
    editingChapterCreatedAt,
    openEditVolumeDialog,
    openEditChapterDialog,
    handleEditVolume: originalHandleEditVolume,
    handleEditChapter: originalHandleEditChapter,
    showDeleteVolumeConfirm,
    showDeleteChapterConfirm,
    deletingVolumeTitle,
    deletingChapterTitle,
    openDeleteVolumeConfirm,
    openDeleteChapterConfirm,
    handleDeleteVolume,
    handleDeleteChapter,
    isAddingVolume,
    isAddingChapter,
    isEditingVolume,
    isEditingChapter,
    isDeletingVolume,
    isDeletingChapter,
  } = useChapterManagement(book, saveState);

  const handleAddVolume = (title: string) => {
    newVolumeTitle.value = title;
    void originalHandleAddVolume();
  };

  const handleAddChapter = (data: { title: string; volumeId: string }) => {
    newChapterTitle.value = data.title;
    selectedVolumeId.value = data.volumeId;
    void originalHandleAddChapter();
  };

  const handleEditVolume = (data: { title: string; translation: string }) => {
    editingVolumeTitle.value = data.title;
    editingVolumeTranslation.value = data.translation;
    void originalHandleEditVolume();
  };

  const handleEditChapter = (data: {
    title: string;
    translation: string;
    targetVolumeId: string;
    webUrl?: string | undefined;
    translationInstructions?: string;
    polishInstructions?: string;
    proofreadingInstructions?: string;
  }) => {
    editingChapterTitle.value = data.title;
    editingChapterTranslation.value = data.translation;
    editingChapterTargetVolumeId.value = data.targetVolumeId;
    editingChapterWebUrl.value = data.webUrl || '';
    editingChapterTranslationInstructions.value = data.translationInstructions || '';
    editingChapterPolishInstructions.value = data.polishInstructions || '';
    editingChapterProofreadingInstructions.value = data.proofreadingInstructions || '';
    void originalHandleEditChapter();
  };

  const getCoverUrl = (b: Novel): string => CoverService.getCoverUrl(b);

  // 页面加载状态
  const isPageLoading = ref(true);
  const isStatsCalculating = ref(false);

  const stats = ref<{ wordCount: number; chapterCount: number; volumeCount: number } | null>(null);

  const calculateStats = async () => {
    if (!book.value || isStatsCalculating.value) return;

    isStatsCalculating.value = true;
    await new Promise((resolve) => setTimeout(resolve, 0));

    const wordCount = await getNovelCharCountAsync(book.value);

    stats.value = {
      wordCount,
      chapterCount: getTotalChapters(book.value),
      volumeCount: book.value.volumes?.length || 0,
    };

    isStatsCalculating.value = false;
  };

  watch(
    book,
    (newBook) => {
      if (newBook) {
        void calculateStats();
        void calculateTranslationProgress();
      } else {
        stats.value = null;
        translationProgressState.value = null;
      }
    },
    { immediate: false },
  );

  const volumes = computed(() => {
    if (!book.value || !book.value.volumes || book.value.volumes.length === 0) {
      return [];
    }
    return book.value.volumes;
  });

  const volumeOptions = computed(() => {
    return volumes.value.map((volume) => ({
      label: getVolumeDisplayTitle(volume),
      value: volume.id,
    }));
  });

  const workspaceMode = computed<BookWorkspaceMode>({
    get: () => uiStore.bookWorkspaceMode,
    set: (value: BookWorkspaceMode) => uiStore.setBookWorkspaceMode(value),
  });

  const isMovingChapter = ref(false);

  const activeTranslationTaskCount = computed(() => aiProcessingStore.activeTranslationTaskCount);

  const switchWorkspaceMode = (mode: BookWorkspaceMode) => {
    workspaceMode.value = mode;
    if (mode === 'content') {
      if (bookId.value && selectedSettingMenu.value) {
        void router.replace(`/books/${bookId.value}`);
      }
      selectedSettingMenu.value = null;
    } else if (mode === 'settings' && !selectedSettingMenu.value) {
      selectedSettingMenu.value = 'terms';
      if (bookId.value) {
        void router.replace(`/books/${bookId.value}/settings/terms`);
      }
    }
  };

  const navigateToChapterInternal = (chapter: Chapter) => {
    if (!bookId.value) return;
    void bookDetailsStore.setSelectedChapter(bookId.value, chapter.id);
    if (selectedSettingMenu.value) {
      void router.replace(`/books/${bookId.value}`);
    }
    selectedSettingMenu.value = null;
    if (isSmallScreen.value) {
      workspaceMode.value = 'content';
    }
    void scrollCurrentContentToTop();
  };

  const onNavigateToChapter = (...args: unknown[]) => {
    const chapter = args[0] as Chapter | undefined;
    if (!chapter) return;
    navigateToChapterInternal(chapter);
  };

  const onNavigateToChapterList = () => {
    if (isSmallScreen.value) {
      workspaceMode.value = 'catalog';
    }
    if (bookId.value) {
      void bookDetailsStore.setSelectedChapter(bookId.value, null);
    }
  };

  const onEditVolume = (...args: unknown[]) => {
    const volume = args[0];
    if (!volume) return;
    openEditVolumeDialog(volume as Volume);
  };

  const onDeleteVolume = (...args: unknown[]) => {
    const volume = args[0];
    if (!volume) return;
    openDeleteVolumeConfirm(volume as Volume);
  };

  const onEditChapter = (...args: unknown[]) => {
    const chapter = args[0];
    if (!chapter) return;
    openEditChapterDialog(chapter as Chapter);
  };

  const onDeleteChapter = (...args: unknown[]) => {
    const chapter = args[0];
    if (!chapter) return;
    openDeleteChapterConfirm(chapter as Chapter);
  };

  const onDragStart = (...args: unknown[]) => {
    const event = args[0] as DragEvent | undefined;
    const chapter = args[1] as Chapter | undefined;
    const volumeId = args[2] as string | undefined;
    const index = args[3] as number | undefined;
    if (!event || !chapter || !volumeId || typeof index !== 'number') return;
    handleDragStart(event, chapter, volumeId, index);
  };

  const onDragEnd = (...args: unknown[]) => {
    const event = args[0] as DragEvent | undefined;
    if (!event) return;
    handleDragEnd(event);
  };

  const onDragOver = (...args: unknown[]) => {
    const event = args[0] as DragEvent | undefined;
    const volumeId = args[1] as string | undefined;
    const index = args[2] as number | undefined;
    if (!event || !volumeId) return;
    handleDragOver(event, volumeId, index);
  };

  const onDrop = (...args: unknown[]) => {
    const event = args[0] as DragEvent | undefined;
    const targetVolumeId = args[1] as string | undefined;
    const targetIndex = args[2] as number | undefined;
    if (!event || !targetVolumeId) return;
    void handleDrop(event, targetVolumeId, targetIndex);
  };

  const onDragLeave = (..._args: unknown[]) => {
    handleDragLeave();
  };

  const onMoveChapter = async (...args: unknown[]) => {
    const payload = args[0] as
      | { chapter: Chapter; volumeId: string; index: number; direction: 'up' | 'down' }
      | undefined;

    if (!payload || !book.value || isMovingChapter.value) return;

    const { chapter, volumeId, index, direction } = payload;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0) return;

    const targetVolume = book.value.volumes?.find((volume) => volume.id === volumeId);
    if (!targetVolume?.chapters) return;
    if (targetIndex >= targetVolume.chapters.length) return;

    isMovingChapter.value = true;
    try {
      saveState?.('触控排序章节');

      const updatedVolumes = ChapterService.moveChapter(
        book.value,
        chapter.id,
        volumeId,
        targetIndex,
      );
      await booksStore.updateBook(book.value.id, {
        volumes: updatedVolumes,
        lastEdited: new Date(),
      });
    } finally {
      isMovingChapter.value = false;
    }
  };

  const openBookDialog = () => {
    showBookDialog.value = true;
    if (bookId.value) {
      contextStore.setContext({
        currentBookId: bookId.value,
        currentChapterId: null,
        hoveredParagraphId: null,
        selectedParagraphId: null,
      });
    }
  };

  const navigateToTermsSetting = () => {
    if (bookId.value) {
      void router.replace(`/books/${bookId.value}/settings/terms`);
    }
    selectedSettingMenu.value = 'terms';
    if (isSmallScreen.value) {
      workspaceMode.value = 'settings';
    }
    if (bookId.value) {
      contextStore.setContext({
        currentBookId: bookId.value,
        currentChapterId: null,
        hoveredParagraphId: null,
        selectedParagraphId: null,
      });
    }
  };

  const navigateToCharactersSetting = () => {
    if (bookId.value) {
      void router.replace(`/books/${bookId.value}/settings/characters`);
    }
    selectedSettingMenu.value = 'characters';
    if (isSmallScreen.value) {
      workspaceMode.value = 'settings';
    }
    if (bookId.value) {
      contextStore.setContext({
        currentBookId: bookId.value,
        currentChapterId: null,
        hoveredParagraphId: null,
        selectedParagraphId: null,
      });
    }
  };

  const navigateToMemorySetting = () => {
    if (bookId.value) {
      void router.replace(`/books/${bookId.value}/settings/memory`);
    }
    selectedSettingMenu.value = 'memory';
    if (isSmallScreen.value) {
      workspaceMode.value = 'settings';
    }
    if (bookId.value) {
      contextStore.setContext({
        currentBookId: bookId.value,
        currentChapterId: null,
        hoveredParagraphId: null,
        selectedParagraphId: null,
      });
    }
  };

  const openScraperDialog = () => {
    showScraperDialog.value = true;
    if (bookId.value) {
      contextStore.setContext({
        currentBookId: bookId.value,
        currentChapterId: null,
        hoveredParagraphId: null,
        selectedParagraphId: null,
      });
    }
  };

  const handleScraperUpdate = async (novel: Novel) => {
    if (!book.value) return;

    try {
      const oldBook = cloneDeep(book.value);
      const updatedBook = ChapterService.mergeNovelData(book.value, novel, {
        chapterUpdateStrategy: 'merge',
      });
      await booksStore.updateBook(book.value.id, {
        ...updatedBook,
        lastEdited: new Date(),
      });
      showScraperDialog.value = false;
      toast.add({
        severity: 'success',
        summary: '更新成功',
        detail: '已从在线获取并更新章节数据',
        life: 3000,
        onRevert: async () => {
          if (book.value) {
            await booksStore.updateBook(book.value.id, oldBook);
          }
        },
      });
    } catch (error) {
      console.error('更新失败:', error);
      toast.add({
        severity: 'error',
        summary: '更新失败',
        detail: error instanceof Error ? error.message : '从在线获取更新时发生错误',
        life: 5000,
      });
    }
  };

  const selectedChapterId = computed(() => {
    if (!bookId.value) return null;
    return bookDetailsStore.getSelectedChapter(bookId.value);
  });

  watch(selectedChapterId, (newId, oldId) => {
    if (oldId && !newId) {
      void calculateTranslationProgress();
    }
  });

  const selectedChapterWithContent = ref<Chapter | null>(null);
  const isLoadingChapterContent = ref(false);

  const selectedChapter = computed(() => {
    if (!book.value || !selectedChapterId.value) return null;

    for (const volume of book.value.volumes || []) {
      if (volume.chapters) {
        const chapter = volume.chapters.find((ch) => ch.id === selectedChapterId.value);
        if (chapter) return chapter;
      }
    }
    return null;
  });

  const prevChapter = computed(() => {
    if (!book.value || !selectedChapterId.value) return null;
    const result = ChapterService.getPreviousChapter(book.value, selectedChapterId.value);
    return result?.chapter || null;
  });

  const nextChapter = computed(() => {
    if (!book.value || !selectedChapterId.value) return null;
    const result = ChapterService.getNextChapter(book.value, selectedChapterId.value);
    return result?.chapter || null;
  });

  const translationProgressState = ref<{
    total: number;
    translated: number;
    firstIncompleteChapterId: string | null;
    byChapter: Map<string, { total: number; translated: number }>;
  } | null>(null);
  const isCalculatingTranslationProgress = ref(false);

  async function calculateTranslationProgress() {
    if (!book.value || isCalculatingTranslationProgress.value) return;
    isCalculatingTranslationProgress.value = true;

    try {
      const chapterOrder: { id: string; chapter: Chapter }[] = [];
      for (const vol of book.value.volumes || []) {
        for (const ch of vol.chapters || []) {
          chapterOrder.push({ id: ch.id, chapter: ch });
        }
      }

      if (chapterOrder.length === 0) {
        translationProgressState.value = {
          total: 0,
          translated: 0,
          firstIncompleteChapterId: null,
          byChapter: new Map(),
        };
        return;
      }

      const contentsMap = await ChapterContentService.loadChapterContentsBatch(
        chapterOrder.map((c) => c.id),
      );

      let total = 0;
      let translated = 0;
      let firstIncompleteChapterId: string | null = null;
      const byChapter = new Map<string, { total: number; translated: number }>();

      for (const { id } of chapterOrder) {
        const content = contentsMap.get(id);
        const paras = content ?? [];
        const nonEmpty = paras.filter((p) => (p.text ?? '').trim().length > 0);
        const paraTotal = nonEmpty.length;
        const paraDone = nonEmpty.filter((p) => (p.translations?.length ?? 0) > 0).length;
        total += paraTotal;
        translated += paraDone;
        byChapter.set(id, { total: paraTotal, translated: paraDone });
        if (firstIncompleteChapterId === null && (paraTotal === 0 || paraDone < paraTotal)) {
          firstIncompleteChapterId = id;
        }
      }

      translationProgressState.value = { total, translated, firstIncompleteChapterId, byChapter };
    } finally {
      isCalculatingTranslationProgress.value = false;
    }
  }

  const continueReadingChapter = computed<Chapter | null>(() => {
    if (!book.value) return null;
    if (selectedChapterId.value) {
      for (const vol of book.value.volumes || []) {
        const c = vol.chapters?.find((ch) => ch.id === selectedChapterId.value);
        if (c) return c;
      }
    }
    const firstIncompleteId = translationProgressState.value?.firstIncompleteChapterId;
    if (firstIncompleteId) {
      for (const vol of book.value.volumes || []) {
        const c = vol.chapters?.find((ch) => ch.id === firstIncompleteId);
        if (c) return c;
      }
    }
    for (const vol of book.value.volumes || []) {
      for (const ch of vol.chapters || []) return ch;
    }
    return null;
  });

  const formatRelativeDate = (date: Date | string | number | null | undefined): string => {
    if (date === null || date === undefined) return '—';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '—';
    const now = new Date();
    const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
    if (days <= 0) return '今天';
    if (days === 1) return '昨天';
    if (days < 7) return `${days} 天前`;
    if (days < 30) return `${Math.floor(days / 7)} 周前`;
    if (days < 365) return `${Math.floor(days / 30)} 个月前`;
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const continueReadingOnPhone = () => {
    const chapter = continueReadingChapter.value;
    if (!chapter) return;
    navigateToChapterInternal(chapter);
  };

  const mobileActiveTab = computed<MobileActiveTab>(() => {
    if (selectedSettingMenu.value === 'terms') return 'terms';
    if (selectedSettingMenu.value === 'characters') return 'characters';
    if (selectedSettingMenu.value === 'memory') return 'memory';
    return 'chapters';
  });

  const switchMobileTab = (tab: MobileActiveTab) => {
    if (tab === 'chapters') {
      selectedSettingMenu.value = null;
      if (bookId.value && route.params.setting) {
        void router.replace(`/books/${bookId.value}`);
      }
      onNavigateToChapterList();
      return;
    }
    if (tab === 'terms') {
      navigateToTermsSetting();
      return;
    }
    if (tab === 'characters') {
      navigateToCharactersSetting();
      return;
    }
    if (tab === 'memory') {
      navigateToMemorySetting();
      return;
    }
  };

  const mobileBookProgress = computed<number>(() => {
    const s = translationProgressState.value;
    if (!s || s.total === 0) return 0;
    return Math.round((s.translated / s.total) * 100);
  });

  const chapterStatusIcon = (chapterId: string): string =>
    chapterStatusIconPure(getChapterStatusPure(translationProgressState.value?.byChapter, chapterId));

  const chapterStatusColor = (chapterId: string): string =>
    chapterStatusColorPure(getChapterStatusPure(translationProgressState.value?.byChapter, chapterId));

  const chapterStatusTextColor = (chapterId: string): string =>
    chapterStatusTextColorPure(
      getChapterStatusPure(translationProgressState.value?.byChapter, chapterId),
    );

  const chapterStatusLabel = (chapterId: string): string =>
    chapterStatusLabelPure(translationProgressState.value?.byChapter, chapterId);

  const mobileSelectedParagraphId = ref<string | null>(null);
  // 手机端"批量"按钮改为底部抽屉 picker；之前依赖 PrimeVue TieredMenu 的
  // popup-ref 在 `<script setup>` 变体里无法自动 bind（ref 只对顶层脚本变量生效，
  // ctx.mobileBatchMenuRef 永远是 null），所以直接换成受控 state。
  const showMobileBatchPicker = ref(false);

  const selectedChapterParagraphs = computed(() => {
    if (!selectedChapterWithContent.value || !selectedChapterWithContent.value.content) {
      return [];
    }
    return selectedChapterWithContent.value.content;
  });

  const getParagraphModelName = (paragraph: Paragraph): string | null => {
    const list = paragraph.translations ?? [];
    if (list.length === 0) return null;
    const sel = list.find((t) => t.id === paragraph.selectedTranslationId) ?? list[0];
    if (!sel) return null;
    const model = aiModelsStore.models.find((m) => m.id === sel.aiModelId);
    return model?.name ?? null;
  };

  const mobileReaderModelName = computed<string>(() => {
    const model = aiModelsStore.getDefaultModelForTask('translation');
    return model?.name ?? '未配置模型';
  });

  const mobileReaderStats = computed(() =>
    getChapterTranslationStats(selectedChapterParagraphs.value),
  );

  // 段落翻译 composable
  const {
    currentlyEditingParagraphId,
    updateParagraphTranslation,
    selectParagraphTranslation,
    updateSelectedChapterWithContent,
  } = useParagraphTranslation(book, selectedChapterWithContent, saveState);

  // 编辑模式 composable
  const {
    editMode,
    isEditingOriginalText,
    originalTextEditValue,
    originalTextEditChapterId: _originalTextEditChapterId,
    chapterOriginalText: _chapterOriginalText,
    editModeOptions,
    startEditingOriginalText: _startEditingOriginalText,
    saveOriginalTextEdit,
    cancelOriginalTextEdit,
  } = useEditMode(
    book,
    selectedChapterWithContent,
    selectedChapterParagraphs,
    selectedChapterId,
    updateSelectedChapterWithContent,
    saveState,
  );

  // 导出 composable
  const { exportMenuRef, exportMenuItems, toggleExportMenu, exportChapter, copyAllTranslatedText } =
    useChapterExport(selectedChapter, selectedChapterParagraphs, book);
  void exportChapter; // 部分变体不直接调用

  // 拖拽 composable
  const {
    draggedChapter,
    dragOverVolumeId,
    dragOverIndex,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
    handleDragLeave,
  } = useChapterDragDrop(book, saveState);

  // 段落导航 composable
  const {
    selectedParagraphIndex,
    paragraphCardRefs,
    isKeyboardSelected,
    isClickSelected,
    isKeyboardNavigating,
    isProgrammaticScrolling,
    lastKeyboardNavigationTime,
    resetNavigationTimeoutId,
    resetParagraphNavigation,
    getNonEmptyParagraphIndices,
    findNextNonEmptyParagraph,
    scrollToElementFast: _scrollToElementFast,
    navigateToParagraph,
    handleParagraphClick,
    cancelCurrentEditing: _cancelCurrentEditing,
    handleParagraphEditStart,
    handleParagraphEditStop,
    startEditingSelectedParagraph,
    cleanup: cleanupParagraphNavigation,
  } = useParagraphNavigation(
    selectedChapterParagraphs,
    scrollableContentRef,
    currentlyEditingParagraphId,
  );

  // 选中章节 watcher — 懒加载内容
  watch(
    selectedChapterId,
    async (newChapterId, oldChapterId) => {
      if (oldChapterId !== null && newChapterId !== oldChapterId) {
        clearHistory();
      }

      if (!newChapterId || !selectedChapter.value) {
        selectedChapterWithContent.value = null;
        resetParagraphNavigation();
        void scrollCurrentContentToTop();
        return;
      }

      if (isSmallScreen.value && !selectedSettingMenu.value && workspaceMode.value === 'catalog') {
        workspaceMode.value = 'content';
      }

      if (selectedChapter.value.content !== undefined) {
        selectedChapterWithContent.value = selectedChapter.value;
        resetParagraphNavigation();
        void scrollCurrentContentToTop();
        return;
      }

      isLoadingChapterContent.value = true;
      try {
        const chapterWithContent = await ChapterService.loadChapterContent(selectedChapter.value);
        selectedChapterWithContent.value = chapterWithContent;
        resetParagraphNavigation();
        void scrollCurrentContentToTop();
      } catch (error) {
        console.error('Failed to load chapter content:', error);
        toast.add({
          severity: 'error',
          summary: '加载失败',
          detail: '无法加载章节内容',
          life: 3000,
        });
        selectedChapterWithContent.value = null;
        resetParagraphNavigation();
        void scrollCurrentContentToTop();
      } finally {
        isLoadingChapterContent.value = false;
      }
    },
    { immediate: true },
  );

  const currentChapterInBook = computed<Chapter | null>(() => {
    if (!book.value || !selectedChapterId.value) return null;
    for (const volume of book.value.volumes || []) {
      const chapter = volume.chapters?.find((ch) => ch.id === selectedChapterId.value);
      if (chapter) return chapter;
    }
    return null;
  });

  watch(currentChapterInBook, (updatedChapter, oldChapter) => {
    if (oldChapter === undefined) return;
    if (!selectedChapterId.value || !selectedChapterWithContent.value) return;

    if (!updatedChapter) {
      selectedChapterWithContent.value = null;
      if (bookId.value) {
        void bookDetailsStore.setSelectedChapter(bookId.value, null);
      }
      return;
    }

    if (updatedChapter === oldChapter) return;

    const currentChapter = selectedChapterWithContent.value;
    const isUserEditing = isEditingOriginalText.value;
    const hasMetadataChanged = hasChapterMetadataChanged(currentChapter, updatedChapter);
    const hasContentUpdate =
      Array.isArray(updatedChapter.content) && updatedChapter.content !== currentChapter.content;
    const hasExternalMetadataChange = detectExternalMetadataChange(currentChapter, updatedChapter);

    const shouldUpdateMetadata = !isUserEditing || hasExternalMetadataChange;
    const shouldUpdateContent = hasContentUpdate && !isUserEditing;

    if (!hasMetadataChanged && !shouldUpdateContent) return;
    if (!shouldUpdateMetadata && !shouldUpdateContent) return;

    selectedChapterWithContent.value = buildMergedSelectedChapter(
      currentChapter,
      updatedChapter,
      shouldUpdateMetadata,
      shouldUpdateContent,
    );
  });

  watch(
    bookId,
    (newBookId) => {
      if (newBookId) {
        contextStore.setCurrentBook(newBookId);
      } else {
        contextStore.setCurrentBook(null);
      }
    },
    { immediate: true },
  );

  watch(
    selectedChapterId,
    (newChapterId) => {
      if (newChapterId && bookId.value) {
        contextStore.setCurrentChapter(newChapterId);
      } else {
        contextStore.setCurrentChapter(null);
      }
    },
    { immediate: true },
  );

  watch(
    () => [selectedParagraphIndex.value, selectedChapterParagraphs.value] as const,
    ([index, paragraphs]) => {
      if (index !== null && paragraphs.length > 0 && index >= 0 && index < paragraphs.length) {
        const paragraph = paragraphs[index];
        if (paragraph) {
          contextStore.setSelectedParagraph(paragraph.id);
        } else {
          contextStore.setSelectedParagraph(null);
        }
      } else {
        contextStore.setSelectedParagraph(null);
      }
    },
    { immediate: true },
  );

  watch(
    () => route.path,
    (newPath, oldPath) => {
      const isBookDetailsPage =
        /^\/books\/[^/]+$/.test(newPath) ||
        /^\/books\/[^/]+\/settings\/(terms|characters|memory)$/.test(newPath);
      const wasBookDetailsPage =
        !!oldPath &&
        (/^\/books\/[^/]+$/.test(oldPath) ||
          /^\/books\/[^/]+\/settings\/(terms|characters|memory)$/.test(oldPath));

      if (wasBookDetailsPage && !isBookDetailsPage) {
        contextStore.clearContext();
      }
    },
  );

  watch(
    [bookId, settingMenuFromRoute],
    ([currentBookId, menu]) => {
      if (!currentBookId) {
        selectedSettingMenu.value = null;
        return;
      }
      if (menu) {
        selectedSettingMenu.value = menu;
        if (isSmallScreen.value) {
          workspaceMode.value = 'settings';
        }
        contextStore.setContext({
          currentBookId,
          currentChapterId: null,
          hoveredParagraphId: null,
          selectedParagraphId: null,
        });
        return;
      }
      if (route.path === `/books/${currentBookId}`) {
        selectedSettingMenu.value = null;
      }
    },
    { immediate: true },
  );

  const embeddingUnsubscribers: Array<() => void> = [];

  const triggerBackfill = () => {
    if (bookId.value) {
      void EmbeddingQueue.enqueueBacklog(bookId.value);
      void EmbeddingQueue.enqueueChapterBacklog(bookId.value);
    }
  };

  let memoryPreviewTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleMemoryPreview = (delayMs = 500) => {
    if (memoryPreviewTimer) clearTimeout(memoryPreviewTimer);
    if (selectedChapterParagraphs.value.length === 0) {
      usedMemoryReferences.value = [];
      mergedScoreBreakdowns.value = {};
      return;
    }
    memoryPreviewTimer = setTimeout(() => {
      void refreshReferencedMemories();
    }, delayMs);
  };

  onMounted(() => {
    setTimeout(() => {
      isPageLoading.value = false;
      void calculateStats();
      void calculateTranslationProgress();
    }, 100);
    window.addEventListener('click', handleClick);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('keydown', handleKeydown, true);

    if (EmbeddingService.isReady()) {
      triggerBackfill();
    }
    embeddingUnsubscribers.push(
      EmbeddingService.addEventListener('ready', () => {
        triggerBackfill();
        scheduleMemoryPreview();
      }),
      EmbeddingQueue.addEventListener('idle', () => scheduleMemoryPreview()),
    );
  });

  onUnmounted(() => {
    contextStore.clearContext();
    embeddingUnsubscribers.forEach((u) => u());
    embeddingUnsubscribers.length = 0;
    if (memoryPreviewTimer) {
      clearTimeout(memoryPreviewTimer);
      memoryPreviewTimer = null;
    }
    cleanupParagraphNavigation();
    window.removeEventListener('keydown', handleKeydown, true);
    window.removeEventListener('click', handleClick);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('scroll', handleScroll, true);
  });

  const {
    isSearchVisible,
    showReplace,
    searchQuery,
    replaceQuery,
    searchMatches,
    currentSearchMatchIndex,
    toggleSearch,
    nextMatch,
    prevMatch,
    replaceCurrent,
    replaceAll,
  } = useSearchReplace(
    book,
    selectedChapter,
    selectedChapterParagraphs,
    updateParagraphTranslation,
    currentlyEditingParagraphId,
    saveState,
    updateSelectedChapterWithContent,
  );

  const debouncedSearchQuery = ref('');
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  watch(
    searchQuery,
    (val) => {
      if (searchDebounceTimer !== null) {
        clearTimeout(searchDebounceTimer);
      }
      if (!val) {
        debouncedSearchQuery.value = '';
        searchDebounceTimer = null;
        return;
      }
      searchDebounceTimer = setTimeout(() => {
        debouncedSearchQuery.value = val;
        searchDebounceTimer = null;
      }, 150);
    },
    { immediate: true },
  );
  onUnmounted(() => {
    if (searchDebounceTimer !== null) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
  });

  const { handleKeydown, handleClick, handleMouseMove, handleScroll } = useKeyboardShortcuts(
    isSearchVisible,
    toggleSearch,
    showReplace,
    nextMatch,
    prevMatch,
    copyAllTranslatedText,
    selectedChapterWithContent,
    selectedChapterParagraphs,
    selectedChapter,
    selectedSettingMenu,
    editMode,
    selectedParagraphIndex,
    isKeyboardNavigating,
    isKeyboardSelected,
    isClickSelected,
    isProgrammaticScrolling,
    lastKeyboardNavigationTime,
    resetNavigationTimeoutId,
    getNonEmptyParagraphIndices,
    findNextNonEmptyParagraph,
    navigateToParagraph,
    startEditingSelectedParagraph,
    canUndo,
    undo,
    canRedo,
    redo,
  );

  const {
    isTranslatingChapter,
    translationProgress: _translationProgress,
    translatingParagraphIds,
    isPolishingChapter,
    polishProgress: _polishProgress,
    polishingParagraphIds,
    isProofreadingChapter,
    proofreadingProgress: _proofreadingProgress,
    proofreadingParagraphIds,
    polishParagraph,
    proofreadParagraph,
    retranslateParagraph,
    translateAllParagraphs,
    continueTranslation,
    retranslateAllParagraphs,
    polishAllParagraphs,
    proofreadAllParagraphs,
    cancelTranslation: _cancelTranslation,
    cancelPolish: _cancelPolish,
    cancelProofreading: _cancelProofreading,
    translationStatus,
    translationButtonLabel,
    translationButtonMenuItems,
    translationButtonClick,
  } = useChapterTranslation(
    book,
    selectedChapter,
    selectedChapterWithContent,
    selectedChapterParagraphs,
    updateSelectedChapterWithContent,
    handleActionInfoToast,
    countUniqueActions,
    saveState,
  );

  watch(
    isSmallScreen,
    (small) => {
      if (!small) {
        workspaceMode.value = 'content';
        return;
      }
      if (selectedSettingMenu.value) {
        workspaceMode.value = 'settings';
      }
    },
    { immediate: true },
  );

  watch(selectedSettingMenu, (menu) => {
    if (!isSmallScreen.value) return;
    if (menu) {
      workspaceMode.value = 'settings';
    }
  });

  const getParagraphTranslationText = (paragraph: Paragraph): string =>
    getSelectedParagraphTranslationText(paragraph, book.value, selectedChapter.value);

  const translatedCharCount = computed(() => {
    if (!selectedChapterParagraphs.value.length) return 0;
    return selectedChapterParagraphs.value.reduce((total, paragraph) => {
      const translationText = getParagraphTranslationText(paragraph);
      return total + translationText.length;
    }, 0);
  });

  const termPopover = ref<{ toggle: (event: Event) => void; hide: () => void } | null>(null);
  const showEditTermDialog = ref(false);
  const editingTerm = ref<Terminology | null>(null);
  const isSavingTerm = ref(false);
  const termDialogMode = ref<'add' | 'edit'>('edit');

  let cachedChapterText: { content: unknown; text: string } | null = null;
  const getCachedChapterContentText = (chapter: Chapter | null): string => {
    if (!chapter || !Array.isArray(chapter.content)) return '';
    if (cachedChapterText && cachedChapterText.content === chapter.content) {
      return cachedChapterText.text;
    }
    const text = getChapterContentText(chapter);
    cachedChapterText = { content: chapter.content, text };
    return text;
  };

  let usedTermsCache: {
    content: unknown;
    terms: Terminology[];
    result: Terminology[];
  } | null = null;
  const usedTerms = computed(() => {
    const chapter = selectedChapterWithContent.value;
    const terms = stableTerminologies.value;
    if (!chapter || terms.length === 0 || !Array.isArray(chapter.content)) return [];
    if (
      usedTermsCache &&
      usedTermsCache.content === chapter.content &&
      usedTermsCache.terms === terms
    ) {
      return usedTermsCache.result;
    }
    const text = getCachedChapterContentText(chapter);
    if (!text) return [];
    const result = findUniqueTermsInText(text, terms);
    usedTermsCache = { content: chapter.content, terms, result };
    return result;
  });

  const usedTermCount = computed(() => usedTerms.value.length);

  const toggleTermPopover = (event: Event) => {
    termPopover.value?.toggle(event);
  };

  const closePopover = (popoverRef: { hide: () => void } | null) => {
    if (popoverRef) popoverRef.hide();
  };

  const closePopoverAndUpdateContext = (popoverRef: { hide: () => void } | null) => {
    closePopover(popoverRef);
    if (bookId.value) {
      contextStore.setContext({
        currentBookId: bookId.value,
        currentChapterId: null,
        hoveredParagraphId: null,
        selectedParagraphId: null,
      });
    }
  };

  const openCreateTermDialog = () => {
    editingTerm.value = null;
    termDialogMode.value = 'add';
    showEditTermDialog.value = true;
    closePopoverAndUpdateContext(termPopover.value);
  };

  const characterPopover = ref<{ toggle: (event: Event) => void; hide: () => void } | null>(null);
  const showEditCharacterDialog = ref(false);
  const editingCharacter = ref<CharacterSetting | null>(null);
  const isSavingCharacter = ref(false);

  let usedCharactersCache: {
    content: unknown;
    chars: CharacterSetting[];
    result: CharacterSetting[];
  } | null = null;
  const usedCharacters = computed(() => {
    const chapter = selectedChapterWithContent.value;
    const chars = stableCharacterSettings.value;
    if (!chapter || chars.length === 0 || !Array.isArray(chapter.content)) return [];
    if (
      usedCharactersCache &&
      usedCharactersCache.content === chapter.content &&
      usedCharactersCache.chars === chars
    ) {
      return usedCharactersCache.result;
    }
    const text = getCachedChapterContentText(chapter);
    if (!text) return [];
    const result = findUniqueCharactersInText(text, chars);
    usedCharactersCache = { content: chapter.content, chars, result };
    return result;
  });

  const usedCharacterCount = computed(() => usedCharacters.value.length);
  const usedMemoryCount = computed(() => usedMemoryReferences.value.length);

  const memoryPopover = ref<InstanceType<typeof Popover> | null>(null);
  const isMemoryPopoverOpen = ref(false);
  const usedMemoryReferences = ref<MemoryReference[]>([]);
  const isLoadingMemoryReferences = ref(false);
  const showMemoryDetailDialog = ref(false);
  const detailMemory = ref<Memory | null>(null);
  const mergedScoreBreakdowns = ref<Record<string, ScoreBreakdown>>({});

  const refreshReferencedMemories = async () => {
    if (!bookId.value || !selectedChapterParagraphs.value.length) {
      usedMemoryReferences.value = [];
      mergedScoreBreakdowns.value = {};
      return;
    }

    isLoadingMemoryReferences.value = true;
    try {
      const chunkText = selectedChapterParagraphs.value.map((p) => p.text).join('\n');
      if (!chunkText.trim()) {
        usedMemoryReferences.value = [];
        mergedScoreBreakdowns.value = {};
        return;
      }

      const { memories, breakdowns } = await selectRelevantMemoriesForChunk(
        bookId.value,
        chunkText,
        usedTerms.value,
        usedCharacters.value,
      );

      mergedScoreBreakdowns.value = breakdowns;
      usedMemoryReferences.value = memories.map((m) => ({
        memoryId: m.id,
        summary: m.summary,
        accessedAt: m.lastAccessedAt,
        toolName: 'search_memories' as const,
      }));
    } catch (error) {
      console.warn('Failed to compute memory preview:', error);
    } finally {
      isLoadingMemoryReferences.value = false;
    }
  };

  const handleToggleMemoryPopover = (event: Event) => {
    memoryPopover.value?.toggle(event);
  };

  const handleMemoryPopoverShow = () => {
    isMemoryPopoverOpen.value = true;
  };

  const handleMemoryPopoverHide = () => {
    isMemoryPopoverOpen.value = false;
  };

  watch(
    () => [selectedChapterId.value, selectedChapterParagraphs.value.length] as const,
    () => scheduleMemoryPreview(),
    { immediate: true },
  );

  const closeMemoryPopover = () => {
    memoryPopover.value?.hide();
  };
  void closeMemoryPopover;

  const handleViewMemory = async (memoryId: string) => {
    if (!bookId.value) return;
    try {
      const memory = await MemoryService.getMemory(bookId.value, memoryId);
      if (memory) {
        detailMemory.value = memory;
        showMemoryDetailDialog.value = true;
      }
    } catch (error) {
      console.error('Failed to load memory detail:', error);
    }
  };

  const handleMemorySave = async (memoryId: string, summary: string, content: string) => {
    if (!bookId.value) return;
    try {
      await MemoryService.updateMemory(bookId.value, memoryId, content, summary);
      if (detailMemory.value?.id === memoryId) {
        detailMemory.value = { ...detailMemory.value, summary, content };
      }
      await refreshReferencedMemories();
    } catch (error) {
      console.error('Failed to save memory:', error);
    }
  };

  const handleMemoryDelete = async (memory: Memory) => {
    if (!bookId.value) return;
    try {
      await MemoryService.deleteMemory(bookId.value, memory.id);
      showMemoryDetailDialog.value = false;
      await refreshReferencedMemories();
    } catch (error) {
      console.error('Failed to delete memory:', error);
    }
  };

  const toggleCharacterPopover = (event: Event) => {
    characterPopover.value?.toggle(event);
  };

  const keyboardShortcutsPopover = ref<{ toggle: (event: Event) => void } | null>(null);

  const toggleKeyboardShortcutsPopover = (event: Event) => {
    keyboardShortcutsPopover.value?.toggle(event);
  };

  const chapterSettingsPopover = ref<{ toggle: (event: Event) => void } | null>(null);

  const toggleChapterSettingsPopover = (event: Event) => {
    chapterSettingsPopover.value?.toggle(event);
  };

  const handleSaveChapterSettings = async (data: {
    preserveIndents?: boolean;
    normalizeSymbolsOnDisplay?: boolean;
    normalizeTitleOnDisplay?: boolean;
    translationChunkSize?: number;
    skipAskUser?: boolean;
    enableOriginalTextValidation?: boolean;
    translationInstructions?: string;
    polishInstructions?: string;
    proofreadingInstructions?: string;
  }) => {
    if (!book.value) return;

    try {
      const preserveIndents = data.preserveIndents ?? true;
      const normalizeSymbolsOnDisplay = data.normalizeSymbolsOnDisplay ?? false;
      const normalizeTitleOnDisplay = data.normalizeTitleOnDisplay ?? false;
      const translationChunkSize = resolveTaskChunkSize(data.translationChunkSize);
      const skipAskUser = data.skipAskUser ?? false;
      const enableOriginalTextValidation = data.enableOriginalTextValidation ?? false;

      const translationInstructions = data.translationInstructions ?? '';
      const polishInstructions = data.polishInstructions ?? '';
      const proofreadingInstructions = data.proofreadingInstructions ?? '';

      const updates: Partial<Novel> = {
        preserveIndents,
        normalizeSymbolsOnDisplay,
        normalizeTitleOnDisplay,
        translationChunkSize,
        skipAskUser,
        enableOriginalTextValidation,
        lastEdited: new Date(),
      };

      if (selectedChapter.value) {
        const updatedVolumes = ChapterService.updateChapter(book.value, selectedChapter.value.id, {
          translationInstructions,
          polishInstructions,
          proofreadingInstructions,
        });
        updates.volumes = updatedVolumes;

        if (
          selectedChapterWithContent.value &&
          selectedChapterWithContent.value.id === selectedChapter.value.id
        ) {
          selectedChapterWithContent.value = {
            ...selectedChapterWithContent.value,
            translationInstructions,
            polishInstructions,
            proofreadingInstructions,
          };
        }
      }

      await booksStore.updateBook(book.value.id, updates);

      const savedItems: string[] = [];
      savedItems.push('全局设置');
      if (selectedChapter.value) {
        savedItems.push('章节特殊指令');
      }

      toast.add({
        severity: 'success',
        summary: '保存成功',
        detail: `已保存 ${savedItems.join('和')}`,
        life: 3000,
      });
    } catch (error) {
      console.error('保存设置失败:', error);
      toast.add({
        severity: 'error',
        summary: '保存失败',
        detail: error instanceof Error ? error.message : '保存设置时发生错误',
        life: 3000,
      });
    }
  };

  const openCreateCharacterDialog = () => {
    editingCharacter.value = null;
    showEditCharacterDialog.value = true;
    closePopoverAndUpdateContext(characterPopover.value);
  };

  const openEditCharacterDialog = (character: CharacterSetting) => {
    editingCharacter.value = character;
    showEditCharacterDialog.value = true;
    closePopoverAndUpdateContext(characterPopover.value);
  };

  const handleSaveCharacter = async (data: {
    name: string;
    sex?: 'male' | 'female' | 'other' | undefined;
    translation: string;
    description: string;
    speakingStyle: string;
    aliases: Array<{ name: string; translation: string }>;
  }) => {
    if (!book.value) return;

    if (!data.name) {
      toast.add({
        severity: 'error',
        summary: '保存失败',
        detail: '角色名称不能为空',
        life: 3000,
      });
      return;
    }

    isSavingCharacter.value = true;

    try {
      if (!editingCharacter.value) {
        saveState('添加角色设定');
        await CharacterSettingService.addCharacterSetting(book.value.id, {
          name: data.name,
          sex: data.sex,
          ...(data.translation ? { translation: data.translation } : {}),
          ...(data.description ? { description: data.description } : {}),
          ...(data.speakingStyle ? { speakingStyle: data.speakingStyle } : {}),
          ...(data.aliases ? { aliases: data.aliases } : {}),
        });
        toast.add({
          severity: 'success',
          summary: '保存成功',
          detail: `已添加角色 "${data.name}"`,
          life: 3000,
        });
        showEditCharacterDialog.value = false;
        editingCharacter.value = null;
      } else {
        saveState('保存角色设定');
        const currentCharacterSettings = book.value.characterSettings || [];
        const nameConflict = currentCharacterSettings.find(
          (c) => c.id !== editingCharacter.value!.id && c.name === data.name,
        );
        if (nameConflict) {
          toast.add({
            severity: 'warn',
            summary: '保存失败',
            detail: `角色 "${data.name}" 已存在`,
            life: 3000,
          });
          isSavingCharacter.value = false;
          return;
        }
        await CharacterSettingService.updateCharacterSetting(
          book.value.id,
          editingCharacter.value.id,
          data,
        );
        toast.add({
          severity: 'success',
          summary: '保存成功',
          detail: `已更新角色 "${data.name}"`,
          life: 3000,
        });
        showEditCharacterDialog.value = false;
        editingCharacter.value = null;
      }
    } catch (error) {
      console.error('保存角色失败:', error);
      const errorMessage = error instanceof Error ? error.message : '保存角色时发生错误';
      toast.add({
        severity: 'error',
        summary: '保存失败',
        detail: errorMessage,
        life: 3000,
      });
    } finally {
      isSavingCharacter.value = false;
    }
  };

  const showDeleteCharacterConfirm = ref(false);
  const deletingCharacter = ref<CharacterSetting | null>(null);
  const isDeletingCharacter = ref(false);

  const openDeleteCharacterConfirm = (character: CharacterSetting) => {
    deletingCharacter.value = character;
    showDeleteCharacterConfirm.value = true;
    closePopover(characterPopover.value);
  };

  const confirmDeleteCharacter = async () => {
    if (!book.value || !deletingCharacter.value || isDeletingCharacter.value) return;

    isDeletingCharacter.value = true;
    try {
      saveState('删除角色设定');
      await CharacterSettingService.deleteCharacterSetting(
        book.value.id,
        deletingCharacter.value.id,
      );
      toast.add({
        severity: 'success',
        summary: '删除成功',
        detail: `已删除角色 "${deletingCharacter.value.name}"`,
        life: 3000,
      });
      showDeleteCharacterConfirm.value = false;
      deletingCharacter.value = null;
    } catch (error) {
      console.error('删除角色失败:', error);
      toast.add({
        severity: 'error',
        summary: '删除失败',
        detail: '删除角色时发生错误',
        life: 3000,
      });
    } finally {
      isDeletingCharacter.value = false;
    }
  };

  const openEditTermDialog = (term: Terminology) => {
    editingTerm.value = term;
    termDialogMode.value = 'edit';
    showEditTermDialog.value = true;
    closePopoverAndUpdateContext(termPopover.value);
  };

  const handleSaveTerm = async (data: {
    name: string;
    translation: string;
    description: string;
  }) => {
    if (!book.value) return;

    if (!data.name) {
      toast.add({
        severity: 'error',
        summary: '保存失败',
        detail: '术语名称不能为空',
        life: 3000,
      });
      return;
    }

    isSavingTerm.value = true;

    try {
      if (termDialogMode.value === 'add') {
        saveState('添加术语');
        await TerminologyService.addTerminology(book.value.id, {
          name: data.name,
          ...(data.translation ? { translation: data.translation } : {}),
          ...(data.description ? { description: data.description } : {}),
        });
        toast.add({
          severity: 'success',
          summary: '保存成功',
          detail: `已添加术语 "${data.name}"`,
          life: 3000,
        });
        showEditTermDialog.value = false;
        editingTerm.value = null;
        termDialogMode.value = 'edit';
      } else {
        if (!editingTerm.value) return;
        saveState('保存术语');
        const currentTerminologies = book.value.terminologies || [];
        const nameConflict = currentTerminologies.find(
          (t) => t.id !== editingTerm.value!.id && t.name === data.name,
        );
        if (nameConflict) {
          toast.add({
            severity: 'warn',
            summary: '保存失败',
            detail: `术语 "${data.name}" 已存在`,
            life: 3000,
          });
          isSavingTerm.value = false;
          return;
        }
        const updatedTerminologies = currentTerminologies.map((term) => {
          if (term.id === editingTerm.value!.id) {
            const updated: Terminology = {
              ...term,
              name: data.name,
              translation: { ...term.translation, translation: data.translation },
            };
            if (data.description) {
              updated.description = data.description;
            } else {
              delete updated.description;
            }
            return updated;
          }
          return term;
        });
        await booksStore.updateBook(book.value.id, {
          terminologies: updatedTerminologies,
          lastEdited: new Date(),
        });
        toast.add({
          severity: 'success',
          summary: '保存成功',
          detail: `已更新术语 "${data.name}"`,
          life: 3000,
        });
        showEditTermDialog.value = false;
        editingTerm.value = null;
      }
    } catch (error) {
      console.error('保存术语失败:', error);
      const errorMessage = error instanceof Error ? error.message : '保存术语时发生错误';
      toast.add({
        severity: 'error',
        summary: '保存失败',
        detail: errorMessage,
        life: 3000,
      });
    } finally {
      isSavingTerm.value = false;
    }
  };

  const showDeleteTermConfirm = ref(false);
  const deletingTerm = ref<Terminology | null>(null);
  const isDeletingTerm = ref(false);

  const openDeleteTermConfirm = (term: Terminology) => {
    deletingTerm.value = term;
    showDeleteTermConfirm.value = true;
    closePopover(termPopover.value);
  };

  const confirmDeleteTerm = async () => {
    if (!book.value || !deletingTerm.value || isDeletingTerm.value) return;

    isDeletingTerm.value = true;
    try {
      saveState('删除术语');
      const updatedTerminologies = (book.value.terminologies || []).filter(
        (t) => t.id !== deletingTerm.value!.id,
      );
      await booksStore.updateBook(book.value.id, {
        terminologies: updatedTerminologies,
        lastEdited: new Date(),
      });
      toast.add({
        severity: 'success',
        summary: '删除成功',
        detail: `已删除术语 "${deletingTerm.value.name}"`,
        life: 3000,
      });
      showDeleteTermConfirm.value = false;
      deletingTerm.value = null;
    } catch (error) {
      console.error('删除术语失败:', error);
      toast.add({
        severity: 'error',
        summary: '删除失败',
        detail: '删除术语时发生错误',
        life: 3000,
      });
    } finally {
      isDeletingTerm.value = false;
    }
  };

  const isSavingBook = ref(false);

  const handleBookSave = async (formData: Partial<Novel>) => {
    if (!book.value || isSavingBook.value) return;

    isSavingBook.value = true;
    try {
      saveState('编辑书籍信息');

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
      const oldBook = cloneDeep(book.value);
      await booksStore.updateBook(book.value.id, updates);
      showBookDialog.value = false;
      const bookTitle = updates.title || book.value.title;
      toast.add({
        severity: 'success',
        summary: '更新成功',
        detail: `已成功更新书籍 "${bookTitle}"`,
        life: 3000,
        onRevert: async () => {
          if (book.value) {
            await booksStore.updateBook(book.value.id, oldBook);
          }
        },
      });
    } finally {
      isSavingBook.value = false;
    }
  };

  return {
    // stores + router
    router,
    booksStore,
    aiProcessingStore,
    aiModelsStore,
    uiStore,
    // device state
    isPhone,
    isTablet,
    isSmallScreen,
    // book + chapter
    book,
    bookId,
    volumes,
    volumeOptions,
    selectedChapter,
    selectedChapterId,
    selectedChapterWithContent,
    selectedChapterParagraphs,
    prevChapter,
    nextChapter,
    isLoadingChapterContent,
    // workspace mode + settings menu + page loading
    workspaceMode,
    selectedSettingMenu,
    isTabletSidebarOpen,
    toggleTabletSidebar,
    isPageLoading,
    isStatsCalculating,
    stats,
    // refs
    scrollableContentRef,
    chapterContentPanelRef,
    // volume / chapter operations
    isVolumeExpanded,
    toggleVolumeById,
    onToggleVolume,
    onNavigateToChapter,
    onNavigateToChapterList,
    onEditVolume,
    onDeleteVolume,
    onEditChapter,
    onDeleteChapter,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDrop,
    onDragLeave,
    onMoveChapter,
    isMovingChapter,
    draggedChapter,
    dragOverVolumeId,
    dragOverIndex,
    // dialog state (chapter/volume management)
    showAddVolumeDialog,
    showAddChapterDialog,
    isAddingVolume,
    isAddingChapter,
    handleAddVolume,
    handleAddChapter,
    openAddChapterDialog,
    showEditVolumeDialog,
    showEditChapterDialog,
    editingVolumeTitle,
    editingVolumeTranslation,
    editingChapterTitle,
    editingChapterTranslation,
    editingChapterTargetVolumeId,
    editingChapterTranslationInstructions,
    editingChapterPolishInstructions,
    editingChapterProofreadingInstructions,
    editingChapterWebUrl,
    editingChapterLastUpdated,
    editingChapterLastEdited,
    editingChapterCreatedAt,
    openEditChapterDialog,
    handleEditVolume,
    handleEditChapter,
    showDeleteVolumeConfirm,
    showDeleteChapterConfirm,
    deletingVolumeTitle,
    deletingChapterTitle,
    handleDeleteVolume,
    handleDeleteChapter,
    isEditingVolume,
    isEditingChapter,
    isDeletingVolume,
    isDeletingChapter,
    // book / scraper dialog
    showBookDialog,
    showScraperDialog,
    isSavingBook,
    openBookDialog,
    openScraperDialog,
    handleBookSave,
    handleScraperUpdate,
    getCoverUrl,
    // settings navigation
    navigateToTermsSetting,
    navigateToCharactersSetting,
    navigateToMemorySetting,
    // workspace switcher
    switchWorkspaceMode,
    activeTranslationTaskCount,
    // mobile-specific derived
    mobileActiveTab,
    switchMobileTab,
    mobileBookProgress,
    mobileSelectedParagraphId,
    showMobileBatchPicker,
    mobileReaderModelName,
    mobileReaderStats,
    mobileBatchBusy: computed(
      () => isTranslatingChapter.value || isPolishingChapter.value || isProofreadingChapter.value,
    ),
    mobileBatchMenuItems: computed<MenuItem[]>(() => {
      const items: MenuItem[] = [];
      const status = translationStatus.value;

      if (status.hasNone) {
        items.push({
          label: '翻译本章',
          icon: 'pi pi-sparkles',
          command: () => void translateAllParagraphs(),
        });
      } else if (status.hasPartial) {
        items.push({
          label: '继续翻译',
          icon: 'pi pi-play',
          command: () => void continueTranslation(),
        });
      }
      if (status.hasPartial || status.hasAll) {
        items.push({
          label: '润色本章',
          icon: 'pi pi-pencil',
          command: () => void polishAllParagraphs(),
        });
        items.push({
          label: '校对本章',
          icon: 'pi pi-check-circle',
          command: () => void proofreadAllParagraphs(),
        });
      }
      if (status.hasPartial || status.hasAll) {
        items.push({ separator: true });
        items.push({
          label: '重新翻译',
          icon: 'pi pi-refresh',
          class: 'mbr-menu-danger',
          command: () => void retranslateAllParagraphs(),
        });
      }
      return items;
    }),
    openMobileBatchPicker: () => {
      showMobileBatchPicker.value = true;
    },
    closeMobileBatchPicker: () => {
      showMobileBatchPicker.value = false;
    },
    runMobileBatchItem: (item: MenuItem) => {
      // 关闭抽屉再执行 item.command —— picker 里所有条目都是用箭头函数
      // 写成 `() => void someAction()`，忽略 event 参数，所以传个空的占位即可
      showMobileBatchPicker.value = false;
      if (typeof item.command === 'function') {
        item.command({ originalEvent: new Event('click'), item });
      }
    },
    openMobileTranslationProgress: () => {
      uiStore.setActiveRightTab('progress');
      if (!uiStore.rightPanelOpen) uiStore.openRightPanel();
    },
    continueReadingChapter,
    formatRelativeDate,
    continueReadingOnPhone,
    formatWordCount,
    getVolumeDisplayTitle,
    getChapterDisplayTitle,
    chapterStatusIcon,
    chapterStatusColor,
    chapterStatusTextColor,
    chapterStatusLabel,
    stableTerminologies,
    stableCharacterSettings,
    // content panel (desktop) state
    editMode,
    editModeOptions,
    originalTextEditValue,
    translatedCharCount,
    // popovers & exports
    exportMenuRef,
    exportMenuItems,
    toggleExportMenu,
    termPopover,
    characterPopover,
    memoryPopover,
    keyboardShortcutsPopover,
    chapterSettingsPopover,
    // memory
    isMemoryPopoverOpen,
    usedMemoryReferences,
    isLoadingMemoryReferences,
    mergedScoreBreakdowns,
    showMemoryDetailDialog,
    detailMemory,
    handleToggleMemoryPopover,
    handleMemoryPopoverShow,
    handleMemoryPopoverHide,
    handleViewMemory,
    handleMemorySave,
    handleMemoryDelete,
    // term & character
    showEditTermDialog,
    editingTerm,
    isSavingTerm,
    termDialogMode,
    showEditCharacterDialog,
    editingCharacter,
    isSavingCharacter,
    showDeleteCharacterConfirm,
    deletingCharacter,
    isDeletingCharacter,
    showDeleteTermConfirm,
    deletingTerm,
    isDeletingTerm,
    toggleTermPopover,
    toggleCharacterPopover,
    openCreateTermDialog,
    openEditTermDialog,
    openCreateCharacterDialog,
    openEditCharacterDialog,
    openDeleteCharacterConfirm,
    openDeleteTermConfirm,
    handleSaveTerm,
    handleSaveCharacter,
    confirmDeleteCharacter,
    confirmDeleteTerm,
    toggleKeyboardShortcutsPopover,
    toggleChapterSettingsPopover,
    handleSaveChapterSettings,
    // undo/redo
    canUndo,
    canRedo,
    undoDescription,
    redoDescription,
    undo,
    redo,
    // edit mode actions
    cancelOriginalTextEdit,
    saveOriginalTextEdit,
    // paragraph translation / navigation
    updateParagraphTranslation,
    selectParagraphTranslation,
    retranslateParagraph,
    polishParagraph,
    proofreadParagraph,
    handleParagraphClick,
    handleParagraphEditStart,
    handleParagraphEditStop,
    paragraphCardRefs,
    selectedParagraphIndex,
    isKeyboardSelected,
    isClickSelected,
    // chapter translation status
    translatingParagraphIds,
    polishingParagraphIds,
    proofreadingParagraphIds,
    isTranslatingChapter,
    isPolishingChapter,
    translationStatus,
    translationButtonLabel,
    translationButtonMenuItems,
    translationButtonClick,
    // search
    isSearchVisible,
    showReplace,
    searchQuery,
    replaceQuery,
    searchMatches,
    currentSearchMatchIndex,
    debouncedSearchQuery,
    toggleSearch,
    nextMatch,
    prevMatch,
    replaceCurrent,
    replaceAll,
    // paragraph translation text helpers
    getParagraphModelName,
    getParagraphTranslationText,
    // used terms / characters
    usedTerms,
    usedTermCount,
    usedCharacters,
    usedCharacterCount,
    usedMemoryCount,
  };
}

// Convenience alias so variants can type-import without importing the function
export type { Ref, ComputedRef };
