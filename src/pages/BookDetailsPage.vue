<script setup lang="ts">
import { computed, ref, watch, nextTick, onUnmounted, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TieredMenu from 'primevue/tieredmenu';
import Button from 'primevue/button';
import Skeleton from 'primevue/skeleton';
import ProgressSpinner from 'primevue/progressspinner';
import Popover from 'primevue/popover';
import { useBooksStore } from 'src/stores/books';
import { useBookDetailsStore } from 'src/stores/book-details';
import { useContextStore } from 'src/stores/context';
import { useUiStore } from 'src/stores/ui';
import { CoverService } from 'src/services/cover-service';
import { ChapterService } from 'src/services/chapter-service';
import { CharacterSettingService } from 'src/services/character-setting-service';
import { TerminologyService } from 'src/services/terminology-service';
import {
  formatWordCount,
  getNovelCharCountAsync,
  getTotalChapters,
  getChapterContentText,
  getVolumeDisplayTitle,
  getChapterDisplayTitle,
  findUniqueTermsInText,
  findUniqueCharactersInText,
  formatTranslationForDisplay,
} from 'src/utils';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { cloneDeep } from 'lodash';
import type { Chapter, Novel, Terminology, CharacterSetting, Paragraph } from 'src/models/novel';
import BookDialog from 'src/components/dialogs/BookDialog.vue';
import NovelScraperDialog from 'src/components/dialogs/NovelScraperDialog.vue';
import TermEditDialog from 'src/components/dialogs/TermEditDialog.vue';
import CharacterEditDialog from 'src/components/dialogs/CharacterEditDialog.vue';
import AddVolumeDialog from 'src/components/dialogs/AddVolumeDialog.vue';
import AddChapterDialog from 'src/components/dialogs/AddChapterDialog.vue';
import EditVolumeDialog from 'src/components/dialogs/EditVolumeDialog.vue';
import EditChapterDialog from 'src/components/dialogs/EditChapterDialog.vue';
import DeleteVolumeConfirmDialog from 'src/components/dialogs/DeleteVolumeConfirmDialog.vue';
import DeleteChapterConfirmDialog from 'src/components/dialogs/DeleteChapterConfirmDialog.vue';
import DeleteTermConfirmDialog from 'src/components/dialogs/DeleteTermConfirmDialog.vue';
import DeleteCharacterConfirmDialog from 'src/components/dialogs/DeleteCharacterConfirmDialog.vue';
import TerminologyPanel from 'src/components/novel/TerminologyPanel.vue';
import CharacterSettingPanel from 'src/components/novel/CharacterSettingPanel.vue';
import MemoryPanel from 'src/components/novel/MemoryPanel.vue';
import SearchToolbar from 'src/components/novel/SearchToolbar.vue';
import TranslationProgress from 'src/components/novel/TranslationProgress.vue';
import ChapterContentPanel from 'src/components/novel/ChapterContentPanel.vue';
import ChapterToolbar from 'src/components/novel/ChapterToolbar.vue';
import VolumesList from 'src/components/novel/VolumesList.vue';
import TermPopover from 'src/components/novel/TermPopover.vue';
import CharacterPopover from 'src/components/novel/CharacterPopover.vue';
import MemoryReferencePanel, {
  type MemoryReference,
} from 'src/components/novel/MemoryReferencePanel.vue';
import MemoryDetailDialog from 'src/components/novel/MemoryDetailDialog.vue';
import KeyboardShortcutsPopover from 'src/components/novel/KeyboardShortcutsPopover.vue';
import ChapterSettingsPopover from 'src/components/novel/ChapterSettingsPopover.vue';
import { useSearchReplace } from 'src/composables/book-details/useSearchReplace';
import { useChapterManagement } from 'src/composables/book-details/useChapterManagement';
import {
  useActionInfoToast,
  countUniqueActions,
} from 'src/composables/book-details/useActionInfoToast';
import { useChapterExport } from 'src/composables/book-details/useChapterExport';
import { useChapterDragDrop } from 'src/composables/book-details/useChapterDragDrop';
import { useParagraphTranslation } from 'src/composables/book-details/useParagraphTranslation';
import { useEditMode, type EditMode } from 'src/composables/book-details/useEditMode';
import { useParagraphNavigation } from 'src/composables/book-details/useParagraphNavigation';
import { useKeyboardShortcuts } from 'src/composables/book-details/useKeyboardShortcuts';
import { useChapterTranslation } from 'src/composables/book-details/useChapterTranslation';
import { useUndoRedo } from 'src/composables/useUndoRedo';
import { ChapterSummaryService } from 'src/services/ai/tasks/chapter-summary-service';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { MemoryService } from 'src/services/memory-service';
import type { Memory, MemoryAttachmentType } from 'src/models/memory';
import type { BookWorkspaceMode } from 'src/constants/responsive';

const route = useRoute();
const router = useRouter();
const booksStore = useBooksStore();
const bookDetailsStore = useBookDetailsStore();
const contextStore = useContextStore();
const uiStore = useUiStore();
const aiProcessingStore = useAIProcessingStore();
const toast = useToastWithHistory();

const isPhone = computed(() => uiStore.deviceType === 'phone');
const isTablet = computed(() => uiStore.deviceType === 'tablet');
const isSmallScreen = computed(() => isPhone.value || isTablet.value);

// 书籍编辑对话框状态
const showBookDialog = ref(false);
const showScraperDialog = ref(false);

// 设置菜单状态
const selectedSettingMenu = ref<'terms' | 'characters' | 'memory' | null>(null);

// 滚动容器引用
const scrollableContentRef = ref<HTMLElement | null>(null);
// 章节内容面板（真正的滚动容器是 `.chapter-content-panel`）
const chapterContentPanelRef = ref<HTMLElement | null>(null);

// 将当前内容滚动到顶部（优先使用章节内容面板，其次使用外层容器兜底）
const scrollCurrentContentToTop = async () => {
  await nextTick();
  const container = chapterContentPanelRef.value ?? scrollableContentRef.value;
  if (container) {
    container.scrollTop = 0;
  }
};

// 从路由参数获取书籍 ID
const bookId = computed(() => route.params.id as string);
const settingMenuFromRoute = computed(() => {
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

// VolumesList 的事件回调类型在 TS 下允许“0 参数/多参数调用”，这里用 wrapper 放宽参数避免类型报错
const onToggleVolume = (...args: unknown[]) => {
  const volumeId = args[0];
  if (typeof volumeId !== 'string') return;
  toggleVolumeById(volumeId);
};

// 检查卷是否展开
const isVolumeExpanded = (volumeId: string): boolean => {
  if (!bookId.value) return false;
  return bookDetailsStore.isVolumeExpanded(bookId.value, volumeId);
};

// 获取书籍信息
const book = computed(() => {
  if (!bookId.value) return undefined;
  return booksStore.getBookById(bookId.value);
});

// ActionInfo Toast 处理
const { handleActionInfoToast } = useActionInfoToast(book);

// 撤销/重做功能 - 创建一个增强函数来获取包含当前已加载章节内容的书籍对象
const getEnhancedBook = (): Novel | undefined => {
  if (!book.value) return undefined;

  // 如果当前有已加载的章节内容，将其合并到书籍对象中
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

const { canUndo, canRedo, undoDescription, redoDescription, saveState, undo, redo, clearHistory } =
  useUndoRedo(
    book,
    async (updatedBook) => {
      if (updatedBook) {
        await booksStore.updateBook(updatedBook.id, updatedBook);

        // 同步更新 selectedChapterWithContent，确保撤销/重做后 UI 正确显示
        if (selectedChapterId.value && updatedBook.volumes) {
          // 查找更新后的章节
          let foundChapter = false;
          for (const volume of updatedBook.volumes) {
            if (volume.chapters) {
              const updatedChapter = volume.chapters.find(
                (ch) => ch.id === selectedChapterId.value,
              );
              if (updatedChapter) {
                foundChapter = true;
                // 如果章节内容已加载，更新 selectedChapterWithContent
                if (updatedChapter.content !== undefined && Array.isArray(updatedChapter.content)) {
                  selectedChapterWithContent.value = updatedChapter;
                } else if (selectedChapterWithContent.value) {
                  // 如果章节内容未加载，但之前已加载，需要重新加载
                  // 或者保持当前内容（因为内容存储在独立存储中）
                  // 这里我们选择重新加载以确保一致性
                  try {
                    const chapterWithContent =
                      await ChapterService.loadChapterContent(updatedChapter);
                    selectedChapterWithContent.value = chapterWithContent;
                  } catch (error) {
                    console.error('Failed to reload chapter content after undo/redo:', error);
                    // 如果加载失败，至少更新章节的基本信息
                    selectedChapterWithContent.value = {
                      ...selectedChapterWithContent.value,
                      ...updatedChapter,
                    };
                  }
                }
                break;
              }
            }
          }
          // 如果章节不存在（可能被删除），清空 selectedChapterWithContent
          if (!foundChapter && selectedChapterWithContent.value) {
            selectedChapterWithContent.value = null;
          }
        }
      }
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

// Wrapper functions for dialog components
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
  translationInstructions?: string;
  polishInstructions?: string;
  proofreadingInstructions?: string;
}) => {
  editingChapterTitle.value = data.title;
  editingChapterTranslation.value = data.translation;
  editingChapterTargetVolumeId.value = data.targetVolumeId;
  editingChapterTranslationInstructions.value = data.translationInstructions || '';
  editingChapterPolishInstructions.value = data.polishInstructions || '';
  editingChapterProofreadingInstructions.value = data.proofreadingInstructions || '';
  void originalHandleEditChapter();
};

// 获取封面图片 URL
const getCoverUrl = (book: Novel): string => {
  return CoverService.getCoverUrl(book);
};

// 页面加载状态
const isPageLoading = ref(true);
const isStatsCalculating = ref(false);

// 计算统计信息（延迟计算以提升初始加载速度）
const stats = ref<{
  wordCount: number;
  chapterCount: number;
  volumeCount: number;
} | null>(null);

// 延迟计算统计信息
const calculateStats = async () => {
  if (!book.value || isStatsCalculating.value) return;

  isStatsCalculating.value = true;

  // 使用 setTimeout 将计算推迟到下一个事件循环，避免阻塞渲染
  await new Promise((resolve) => setTimeout(resolve, 0));

  // 使用异步版本加载字符数（从 IndexedDB 加载内容）
  const wordCount = await getNovelCharCountAsync(book.value);

  stats.value = {
    wordCount,
    chapterCount: getTotalChapters(book.value),
    volumeCount: book.value.volumes?.length || 0,
  };

  isStatsCalculating.value = false;
};

// 监听书籍变化，重新计算统计信息
watch(
  book,
  (newBook) => {
    if (newBook) {
      void calculateStats();
    } else {
      stats.value = null;
    }
  },
  { immediate: false },
);

// 获取卷列表
const volumes = computed(() => {
  if (!book.value || !book.value.volumes || book.value.volumes.length === 0) {
    return [];
  }
  return book.value.volumes;
});

// 卷选项（用于 Dropdown）
const volumeOptions = computed(() => {
  return volumes.value.map((volume) => ({
    label: getVolumeDisplayTitle(volume),
    value: volume.id,
  }));
});

const workspaceMode = computed({
  get: (): BookWorkspaceMode => uiStore.bookWorkspaceMode,
  set: (value: BookWorkspaceMode) => uiStore.setBookWorkspaceMode(value),
});

const isMovingChapter = ref(false);

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
  } else if (mode === 'progress' && !showTranslationProgress.value) {
    showTranslationProgress.value = true;
  }
};

// 导航到章节详情页
const navigateToChapterInternal = (chapter: Chapter) => {
  if (!bookId.value) return;
  // 设置选中的章节
  void bookDetailsStore.setSelectedChapter(bookId.value, chapter.id);
  // 清除设置菜单选中状态
  if (selectedSettingMenu.value) {
    void router.replace(`/books/${bookId.value}`);
  }
  selectedSettingMenu.value = null;
  if (isSmallScreen.value) {
    workspaceMode.value = 'content';
  }
  // 重置滚动位置到顶部（注意：真实滚动容器是章节内容面板）
  void scrollCurrentContentToTop();
};

const onNavigateToChapter = (...args: unknown[]) => {
  const chapter = args[0] as Chapter | undefined;
  if (!chapter) return;
  navigateToChapterInternal(chapter);
};

// 导航到章节列表（切换到目录视图）
const onNavigateToChapterList = () => {
  if (isSmallScreen.value) {
    workspaceMode.value = 'catalog';
  }
  // 清除选中的章节
  if (bookId.value) {
    void bookDetailsStore.setSelectedChapter(bookId.value, null);
  }
};

// VolumesList 的事件回调类型在 TS 下允许“0 参数调用”，这里用 wrapper 放宽参数避免类型报错
const onEditVolume = (...args: unknown[]) => {
  const volume = args[0];
  if (!volume) return;
  openEditVolumeDialog(volume as any);
};

const onDeleteVolume = (...args: unknown[]) => {
  const volume = args[0];
  if (!volume) return;
  openDeleteVolumeConfirm(volume as any);
};

const onEditChapter = (...args: unknown[]) => {
  const chapter = args[0];
  if (!chapter) return;
  openEditChapterDialog(chapter as any);
};

const onDeleteChapter = (...args: unknown[]) => {
  const chapter = args[0];
  if (!chapter) return;
  openDeleteChapterConfirm(chapter as any);
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

const onDragLeave = (...args: unknown[]) => {
  const event = args[0] as DragEvent | undefined;
  if (!event) return;
  handleDragLeave();
};

const onMoveChapter = async (...args: unknown[]) => {
  const payload = args[0] as
    | {
        chapter: Chapter;
        volumeId: string;
        index: number;
        direction: 'up' | 'down';
      }
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

    const updatedVolumes = ChapterService.moveChapter(book.value, chapter.id, volumeId, targetIndex);
    await booksStore.updateBook(book.value.id, {
      volumes: updatedVolumes,
      lastEdited: new Date(),
    });
  } finally {
    isMovingChapter.value = false;
  }
};

// 打开书籍编辑对话框
const openBookDialog = () => {
  showBookDialog.value = true;
  // 更新上下文：保留书籍，清除章节和段落
  if (bookId.value) {
    contextStore.setContext({
      currentBookId: bookId.value,
      currentChapterId: null,
      hoveredParagraphId: null,
      selectedParagraphId: null,
    });
  }
};

// 导航到术语设置
const navigateToTermsSetting = () => {
  if (bookId.value) {
    void router.replace(`/books/${bookId.value}/settings/terms`);
  }
  selectedSettingMenu.value = 'terms';
  if (isSmallScreen.value) {
    workspaceMode.value = 'settings';
  }
  // 清除章节选中状态
  if (bookId.value) {
    void bookDetailsStore.setSelectedChapter(bookId.value, null);
  }
  // 更新上下文：清除章节和段落，保留书籍
  if (bookId.value) {
    contextStore.setContext({
      currentBookId: bookId.value,
      currentChapterId: null,
      hoveredParagraphId: null,
      selectedParagraphId: null,
    });
  }
};

// 导航到角色设置
const navigateToCharactersSetting = () => {
  if (bookId.value) {
    void router.replace(`/books/${bookId.value}/settings/characters`);
  }
  selectedSettingMenu.value = 'characters';
  if (isSmallScreen.value) {
    workspaceMode.value = 'settings';
  }
  // 清除章节选中状态
  if (bookId.value) {
    void bookDetailsStore.setSelectedChapter(bookId.value, null);
  }
  // 更新上下文：清除章节和段落，保留书籍
  if (bookId.value) {
    contextStore.setContext({
      currentBookId: bookId.value,
      currentChapterId: null,
      hoveredParagraphId: null,
      selectedParagraphId: null,
    });
  }
};

// 导航到 Memory 设置
const navigateToMemorySetting = () => {
  if (bookId.value) {
    void router.replace(`/books/${bookId.value}/settings/memory`);
  }
  selectedSettingMenu.value = 'memory';
  if (isSmallScreen.value) {
    workspaceMode.value = 'settings';
  }
  // 清除章节选中状态
  if (bookId.value) {
    void bookDetailsStore.setSelectedChapter(bookId.value, null);
  }
  // 更新上下文：清除章节和段落，保留书籍
  if (bookId.value) {
    contextStore.setContext({
      currentBookId: bookId.value,
      currentChapterId: null,
      hoveredParagraphId: null,
      selectedParagraphId: null,
    });
  }
};

// 打开从在线获取更新对话框
const openScraperDialog = () => {
  showScraperDialog.value = true;
  // 更新上下文：清除章节和段落，保留书籍
  if (bookId.value) {
    contextStore.setContext({
      currentBookId: bookId.value,
      currentChapterId: null,
      hoveredParagraphId: null,
      selectedParagraphId: null,
    });
  }
};

// 处理从在线获取的更新
const handleScraperUpdate = async (novel: Novel) => {
  if (!book.value) {
    return;
  }

  try {
    // 保存原始数据用于撤销
    const oldBook = cloneDeep(book.value);

    // 使用 ChapterService 合并卷和章节
    const updatedBook = ChapterService.mergeNovelData(book.value, novel, {
      chapterUpdateStrategy: 'merge',
    });

    // 更新书籍
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

// 获取选中的章节 ID
const selectedChapterId = computed(() => {
  if (!bookId.value) return null;
  return bookDetailsStore.getSelectedChapter(bookId.value);
});

// 选中章节的完整数据（包含已加载的内容）
const selectedChapterWithContent = ref<Chapter | null>(null);
const isLoadingChapterContent = ref(false);

// 获取选中的章节对象（不包含内容）
const selectedChapter = computed(() => {
  if (!book.value || !selectedChapterId.value) return null;

  for (const volume of book.value.volumes || []) {
    if (volume.chapters) {
      const chapter = volume.chapters.find((ch) => ch.id === selectedChapterId.value);
      if (chapter) {
        return chapter;
      }
    }
  }
  return null;
});

// 获取上一章
const prevChapter = computed(() => {
  if (!book.value || !selectedChapterId.value) return null;
  const result = ChapterService.getPreviousChapter(book.value, selectedChapterId.value);
  return result?.chapter || null;
});

// 获取下一章
const nextChapter = computed(() => {
  if (!book.value || !selectedChapterId.value) return null;
  const result = ChapterService.getNextChapter(book.value, selectedChapterId.value);
  return result?.chapter || null;
});

// 获取选中章节的段落列表
const selectedChapterParagraphs = computed(() => {
  if (!selectedChapterWithContent.value || !selectedChapterWithContent.value.content) {
    return [];
  }
  return selectedChapterWithContent.value.content;
});

// 初始化段落翻译 composable
const {
  currentlyEditingParagraphId,
  updateParagraphTranslation,
  selectParagraphTranslation,
  updateSelectedChapterWithContent,
} = useParagraphTranslation(book, selectedChapterWithContent, saveState);

// 初始化编辑模式 composable
const {
  editMode,
  isEditingOriginalText,
  originalTextEditValue,
  originalTextEditChapterId,
  chapterOriginalText,
  editModeOptions,
  startEditingOriginalText,
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

// 初始化导出 composable
const { exportMenuRef, exportMenuItems, toggleExportMenu, exportChapter, copyAllTranslatedText } =
  useChapterExport(selectedChapter, selectedChapterParagraphs, book);

// 初始化拖拽 composable
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

// 初始化段落导航 composable
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
  scrollToElementFast,
  navigateToParagraph,
  handleParagraphClick,
  cancelCurrentEditing,
  handleParagraphEditStart,
  handleParagraphEditStop,
  startEditingSelectedParagraph,
  cleanup: cleanupParagraphNavigation,
} = useParagraphNavigation(
  selectedChapterParagraphs,
  scrollableContentRef,
  currentlyEditingParagraphId,
);

// 监听选中章节变化，懒加载内容
// 注意：这个 watch 必须在 resetParagraphNavigation 定义之后
watch(
  selectedChapterId,
  async (newChapterId, oldChapterId) => {
    // 如果章节切换了（不是初始化），清空撤销/重做历史记录
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

    // 如果内容已加载，直接使用
    if (selectedChapter.value.content !== undefined) {
      selectedChapterWithContent.value = selectedChapter.value;
      resetParagraphNavigation();
      void scrollCurrentContentToTop();
      return;
    }

    // 加载章节内容
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

// 监听书籍变化，处理章节删除和元数据同步
// 策略：
// 1. 如果章节被删除，清空选中状态
// 2. 如果章节存在且有元数据更新（如标题、webUrl等），根据情况决定是否同步更新：
//    - 如果用户正在编辑段落或原文，不更新元数据（避免覆盖本地编辑）
//    - 如果用户未在编辑，或者更新来自外部操作（如同步、在线获取更新），则更新元数据
// 3. 内容（content）的更新由专门的函数处理，不在此处更新
watch(
  book,
  (newBook, oldBook) => {
    // 只在书籍实际变化时触发（不是初始加载）
    if (!oldBook || !newBook) {
      return;
    }

    // 如果当前有打开的章节
    if (selectedChapterId.value && selectedChapterWithContent.value) {
      // 查找新书籍中的对应章节
      let updatedChapter: Chapter | undefined;
      for (const volume of newBook.volumes || []) {
        if (volume.chapters) {
          const chapter = volume.chapters.find((ch) => ch.id === selectedChapterId.value);
          if (chapter) {
            updatedChapter = chapter;
            break;
          }
        }
      }

      if (!updatedChapter) {
        // 章节不存在了，清空选中状态
        selectedChapterWithContent.value = null;
        if (bookId.value) {
          void bookDetailsStore.setSelectedChapter(bookId.value, null);
        }
        return;
      }

      // 章节存在，检查是否有元数据更新
      const currentChapter = selectedChapterWithContent.value;

      // 检查元数据是否有变化（不包括 content，因为 content 有独立的更新机制）
      const hasMetadataChanged =
        JSON.stringify(currentChapter.title) !== JSON.stringify(updatedChapter.title) ||
        currentChapter.webUrl !== updatedChapter.webUrl ||
        currentChapter.lastEdited.getTime() !== updatedChapter.lastEdited.getTime() ||
        currentChapter.createdAt.getTime() !== updatedChapter.createdAt.getTime() ||
        currentChapter.originalContent !== updatedChapter.originalContent ||
        currentChapter.contentLoaded !== updatedChapter.contentLoaded ||
        currentChapter.translationInstructions !== updatedChapter.translationInstructions ||
        currentChapter.polishInstructions !== updatedChapter.polishInstructions ||
        currentChapter.proofreadingInstructions !== updatedChapter.proofreadingInstructions;

      // 判断是否需要同步内容更新（当内容已加载且用户未编辑时）
      const hasContentUpdate =
        Array.isArray(updatedChapter.content) && updatedChapter.content !== currentChapter.content;

      // 判断是否应该更新元数据
      // 如果用户正在编辑段落或原文，不更新元数据（避免覆盖本地编辑）
      const isUserEditing =
        currentlyEditingParagraphId.value !== null || isEditingOriginalText.value;

      // 判断更新是否来自外部操作（如同步、在线获取更新）
      // 通过检查元数据变化类型来判断：
      // 1. webUrl、originalContent 的变化通常来自外部操作（在线获取更新）
      // 2. lastEdited 时间显著更新（超过当前时间或与当前时间接近）可能是外部操作
      const hasExternalMetadataChange =
        currentChapter.webUrl !== updatedChapter.webUrl ||
        currentChapter.originalContent !== updatedChapter.originalContent ||
        (updatedChapter.lastEdited.getTime() > currentChapter.lastEdited.getTime() &&
          Math.abs(updatedChapter.lastEdited.getTime() - Date.now()) < 10000); // 10秒内的更新可能是外部操作

      // 更新元数据的条件：
      // 1. 用户未在编辑，或者
      // 2. 更新来自外部操作（如同步、在线获取更新），此时即使正在编辑也允许更新元数据
      const shouldUpdateMetadata = !isUserEditing || hasExternalMetadataChange;

      const shouldUpdateContent = hasContentUpdate && !isUserEditing;

      if (!hasMetadataChanged && !shouldUpdateContent) {
        // 元数据和内容都没有需要同步的变化
        return;
      }

      if (shouldUpdateMetadata || shouldUpdateContent) {
        selectedChapterWithContent.value = {
          ...currentChapter,
          ...(shouldUpdateMetadata ? updatedChapter : {}),
          content: shouldUpdateContent
            ? updatedChapter.content
            : (currentChapter.content ?? updatedChapter.content),
          contentLoaded: shouldUpdateContent
            ? true
            : (currentChapter.contentLoaded ?? updatedChapter.contentLoaded),
          lastEdited: shouldUpdateMetadata ? updatedChapter.lastEdited : currentChapter.lastEdited,
        };
      }
      // 注意：如果用户正在编辑且不是外部更新，不更新元数据，避免覆盖本地编辑
      // 内容（content）的更新由 updateTitleTranslation 和 updateParagraphs* 函数处理
    }
  },
  { deep: true },
);

// 实时更新 context store - 监听书籍变化
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

// 实时更新 context store - 监听章节变化
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

// 实时更新 context store - 监听选中段落变化
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

// 监听路由变化，离开书籍详情页时清除上下文
watch(
  () => route.path,
  (newPath, oldPath) => {
    // 如果从书籍详情页（/books/:id）导航到其他页面，清除上下文
    // 注意：从一本书切换到另一本书时，bookId watch 会处理，这里不需要清除
    const isBookDetailsPage =
      /^\/books\/[^/]+$/.test(newPath) ||
      /^\/books\/[^/]+\/settings\/(terms|characters|memory)$/.test(newPath);
    const wasBookDetailsPage =
      !!oldPath &&
      (/^\/books\/[^/]+$/.test(oldPath) ||
        /^\/books\/[^/]+\/settings\/(terms|characters|memory)$/.test(oldPath));

    // 如果之前是书籍详情页，但现在不是了，清除上下文
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
      void bookDetailsStore.setSelectedChapter(currentBookId, null);
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

// 检测当前章节是否正在生成摘要（通过 AI 处理任务状态）
const isSummarizing = computed(() => {
  if (!selectedChapterId.value) return false;
  return aiProcessingStore.activeTasks.some(
    (task) =>
      task.type === 'chapter_summary' &&
      task.chapterId === selectedChapterId.value &&
      (task.status === 'thinking' || task.status === 'processing'),
  );
});

// 处理重新生成摘要
const handleReSummarizeChapter = async (chapterId: string) => {
  if (!bookId.value || !selectedChapterWithContent.value) return;

  const content = getChapterContentText(selectedChapterWithContent.value);
  if (!content) {
    toast.add({
      severity: 'warn',
      summary: '无法生成摘要',
      detail: '章节内容为空',
      life: 3000,
    });
    return;
  }

  try {
    toast.add({
      severity: 'info',
      summary: '正在生成摘要',
      detail: '请求已发送，请稍候...',
      life: 3000,
    });

    await ChapterSummaryService.generateSummary(chapterId, content, {
      bookId: bookId.value,
      chapterTitle: getChapterDisplayTitle(selectedChapterWithContent.value),
      aiProcessingStore,
      force: true,
      onSuccess: async (summary) => {
        toast.add({
          severity: 'success',
          summary: '摘要生成成功',
          detail: '摘要已经更新',
          life: 3000,
        });

        // Update local state if selected chapter matches
        if (selectedChapterWithContent.value && selectedChapterWithContent.value.id === chapterId) {
          selectedChapterWithContent.value = {
            ...selectedChapterWithContent.value,
            summary,
          };
        }

        // Reload book to ensure data consistency
        if (bookId.value && book.value) {
          const updatedVolumes = book.value.volumes?.map((v) => {
            const chIndex = v.chapters?.findIndex((c) => c.id === chapterId);
            if (chIndex !== undefined && chIndex !== -1 && v.chapters) {
              const newChapters = [...v.chapters];
              const targetChapter = newChapters[chIndex];
              if (targetChapter) {
                newChapters[chIndex] = { ...targetChapter, summary, lastEdited: new Date() };
              }
              return { ...v, chapters: newChapters };
            }
            return v;
          });
          if (updatedVolumes) {
            await booksStore.updateBook(bookId.value, { volumes: updatedVolumes });
          }
        }
      },
      onError: (error) => {
        toast.add({
          severity: 'error',
          summary: '生成摘要失败',
          detail: error instanceof Error ? error.message : '未知错误',
          life: 5000,
        });
      },
    });
  } catch (error) {
    // 错误已由 onError 处理
    console.error('Generative summary failed:', error);
  }
};

onMounted(() => {
  // 延迟计算统计信息，优先渲染 UI
  setTimeout(() => {
    isPageLoading.value = false;
    void calculateStats();
  }, 100);
  // 添加点击事件监听器
  window.addEventListener('click', handleClick);
  // 添加鼠标移动事件监听器
  window.addEventListener('mousemove', handleMouseMove);
  // 添加滚动事件监听器
  window.addEventListener('scroll', handleScroll, true); // 使用 capture 模式以捕获所有滚动事件

  // 注册键盘快捷键
  // 使用 capture 模式，确保即使子组件 stopPropagation 也能拦截默认滚动行为
  window.addEventListener('keydown', handleKeydown, true);
});

// 组件卸载时清除上下文
onUnmounted(() => {
  contextStore.clearContext();
  // 清理段落导航相关的 timeout
  cleanupParagraphNavigation();
  // 移除键盘快捷键监听
  window.removeEventListener('keydown', handleKeydown, true);
  // 移除点击事件监听器
  window.removeEventListener('click', handleClick);
  // 移除鼠标移动事件监听器
  window.removeEventListener('mousemove', handleMouseMove);
  // 移除滚动事件监听器
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

// 初始化键盘快捷键 composable
const { handleKeydown, handleClick, handleMouseMove, handleScroll } = useKeyboardShortcuts(
  // 搜索替换相关
  isSearchVisible,
  toggleSearch,
  showReplace,
  nextMatch,
  prevMatch,
  // 导出相关
  copyAllTranslatedText,
  selectedChapterWithContent,
  selectedChapterParagraphs,
  // 组件状态
  selectedChapter,
  selectedSettingMenu,
  editMode,
  // 段落导航相关
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
  // 撤销/重做
  canUndo,
  undo,
  canRedo,
  redo,
);

// 初始化章节翻译 composable
const {
  // 状态
  isTranslatingChapter,
  translationProgress,
  translatingParagraphIds,
  isPolishingChapter,
  polishProgress,
  polishingParagraphIds,
  isProofreadingChapter,
  proofreadingProgress,
  proofreadingParagraphIds,
  // 函数
  polishParagraph,
  proofreadParagraph,
  retranslateParagraph,
  cancelTranslation,
  cancelPolish,
  cancelProofreading,
  // 计算属性
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

// 翻译进度面板显示状态 - 从 store 获取，按书籍保存
const showTranslationProgress = computed({
  get: () => {
    if (!bookId.value) return false;
    return bookDetailsStore.getShowTranslationProgress(bookId.value);
  },
  set: (value: boolean) => {
    if (!bookId.value) return;
    bookDetailsStore.setShowTranslationProgress(bookId.value, value);
  },
});

// 切换翻译进度面板显示
const toggleTranslationProgress = (): void => {
  if (!bookId.value) return;
  bookDetailsStore.toggleShowTranslationProgress(bookId.value);
  if (isSmallScreen.value && showTranslationProgress.value) {
    workspaceMode.value = 'progress';
  }
};

// 当翻译/润色/校对开始时，自动显示进度面板
watch(
  () => isTranslatingChapter || isPolishingChapter || isProofreadingChapter,
  (isActive) => {
    if (isActive && bookId.value) {
      bookDetailsStore.setShowTranslationProgress(bookId.value, true);
      if (isSmallScreen.value) {
        workspaceMode.value = 'progress';
      }
    }
  },
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

// 获取段落的选中翻译文本（应用缩进过滤器）
const getParagraphTranslationText = (paragraph: Paragraph): string => {
  if (!paragraph.selectedTranslationId || !paragraph.translations) {
    return '';
  }
  const selectedTranslation = paragraph.translations.find(
    (t) => t.id === paragraph.selectedTranslationId,
  );
  const translation = selectedTranslation?.translation || '';
  // 应用显示层格式化（缩进过滤/符号规范化等）
  return formatTranslationForDisplay(translation, book.value, selectedChapter.value || undefined);
};

// 计算已翻译文本的总字符数
const translatedCharCount = computed(() => {
  if (!selectedChapterParagraphs.value.length) {
    return 0;
  }
  return selectedChapterParagraphs.value.reduce((total, paragraph) => {
    const translationText = getParagraphTranslationText(paragraph);
    return total + translationText.length;
  }, 0);
});

// 术语弹出框状态
const termPopover = ref<{ toggle: (event: Event) => void; hide: () => void } | null>(null);
const showEditTermDialog = ref(false);
const editingTerm = ref<Terminology | null>(null);
const isSavingTerm = ref(false);
const termDialogMode = ref<'add' | 'edit'>('edit');

// 计算当前章节使用的术语列表
const usedTerms = computed(() => {
  if (!selectedChapterWithContent.value || !book.value?.terminologies?.length) {
    return [];
  }

  const text = getChapterContentText(selectedChapterWithContent.value);
  if (!text) return [];

  return findUniqueTermsInText(text, book.value.terminologies);
});

const usedTermCount = computed(() => usedTerms.value.length);

const toggleTermPopover = (event: Event) => {
  termPopover.value?.toggle(event);
};

// 辅助函数：关闭popover
const closePopover = (popoverRef: { hide: () => void } | null) => {
  if (popoverRef) {
    popoverRef.hide();
  }
};

// 辅助函数：关闭popover并更新上下文
const closePopoverAndUpdateContext = (popoverRef: { hide: () => void } | null) => {
  closePopover(popoverRef);
  // 更新上下文：保留书籍，清除章节和段落
  if (bookId.value) {
    contextStore.setContext({
      currentBookId: bookId.value,
      currentChapterId: null,
      hoveredParagraphId: null,
      selectedParagraphId: null,
    });
  }
};

// 打开创建术语对话框
const openCreateTermDialog = () => {
  editingTerm.value = null;
  termDialogMode.value = 'add';
  showEditTermDialog.value = true;
  closePopoverAndUpdateContext(termPopover.value);
};

// 角色设定弹出框状态
const characterPopover = ref<{ toggle: (event: Event) => void; hide: () => void } | null>(null);
const showEditCharacterDialog = ref(false);
const editingCharacter = ref<CharacterSetting | null>(null);
const isSavingCharacter = ref(false);

// 计算当前章节使用的角色设定列表
const usedCharacters = computed(() => {
  if (!selectedChapterWithContent.value || !book.value?.characterSettings?.length) {
    return [];
  }

  const text = getChapterContentText(selectedChapterWithContent.value);
  if (!text) return [];

  return findUniqueCharactersInText(text, book.value.characterSettings);
});

const usedCharacterCount = computed(() => usedCharacters.value.length);

// 计算当前章节参考的记忆数量（去重）
const usedMemoryCount = computed(() => {
  if (!selectedChapterParagraphs.value.length) {
    return 0;
  }

  const memoryIds = new Set<string>();
  for (const paragraph of selectedChapterParagraphs.value) {
    if (!paragraph.selectedTranslationId || !paragraph.translations?.length) {
      continue;
    }

    const selectedTranslation = paragraph.translations.find(
      (translation) => translation.id === paragraph.selectedTranslationId,
    );
    selectedTranslation?.referencedMemories?.forEach((memoryId) => {
      if (memoryId) {
        memoryIds.add(memoryId);
      }
    });
  }

  return memoryIds.size;
});

// 记忆引用弹出框状态
const memoryPopover = ref<InstanceType<typeof Popover> | null>(null);
const isMemoryPopoverOpen = ref(false);
const usedMemoryReferences = ref<MemoryReference[]>([]);
const isLoadingMemoryReferences = ref(false);
const showMemoryDetailDialog = ref(false);
const detailMemory = ref<Memory | null>(null);

const referencedMemoryIds = computed(() => {
  if (!selectedChapterParagraphs.value.length) {
    return [];
  }

  const memoryIds = new Set<string>();
  for (const paragraph of selectedChapterParagraphs.value) {
    if (!paragraph.selectedTranslationId || !paragraph.translations?.length) {
      continue;
    }

    const selectedTranslation = paragraph.translations.find(
      (translation) => translation.id === paragraph.selectedTranslationId,
    );
    selectedTranslation?.referencedMemories?.forEach((memoryId) => {
      if (memoryId) {
        memoryIds.add(memoryId);
      }
    });
  }

  return Array.from(memoryIds);
});

const refreshReferencedMemories = async () => {
  const ids = referencedMemoryIds.value;
  if (!ids.length || !bookId.value) {
    usedMemoryReferences.value = [];
    return;
  }

  isLoadingMemoryReferences.value = true;
  try {
    const memoryPromises = ids.map((id) => MemoryService.getMemory(bookId.value, id));
    const memories = await Promise.all(memoryPromises);
    usedMemoryReferences.value = memories
      .filter((m): m is Memory => !!m)
      .map((m) => ({
        memoryId: m.id,
        summary: m.summary,
        accessedAt: m.lastAccessedAt,
        toolName: 'get_memory',
      }));
  } catch (error) {
    console.warn('Failed to fetch referenced memories:', error);
  } finally {
    isLoadingMemoryReferences.value = false;
  }
};

watch(
  referencedMemoryIds,
  () => {
    if (isMemoryPopoverOpen.value) {
      refreshReferencedMemories();
    }
  },
  { immediate: true },
);

const handleToggleMemoryPopover = (event: Event) => {
  memoryPopover.value?.toggle(event);
};

const handleMemoryPopoverShow = () => {
  isMemoryPopoverOpen.value = true;
  void refreshReferencedMemories();
};

const handleMemoryPopoverHide = () => {
  isMemoryPopoverOpen.value = false;
};

const closeMemoryPopover = () => {
  memoryPopover.value?.hide();
};

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

const handleMemoryNavigate = (type: MemoryAttachmentType, id: string) => {
  if (type === 'term') {
    closeMemoryPopover();
    navigateToTermsSetting();
    return;
  }
  if (type === 'character') {
    closeMemoryPopover();
    navigateToCharactersSetting();
    return;
  }
  if (type === 'chapter') {
    const chapter = book.value?.volumes
      ?.flatMap((volume) => volume.chapters || [])
      .find((item) => item.id === id);
    if (chapter) {
      closeMemoryPopover();
      navigateToChapterInternal(chapter);
    }
    return;
  }
  if (type === 'book') {
    closeMemoryPopover();
    navigateToMemorySetting();
  }
};

const toggleCharacterPopover = (event: Event) => {
  characterPopover.value?.toggle(event);
};

// 键盘快捷键弹出框状态
const keyboardShortcutsPopover = ref<{ toggle: (event: Event) => void } | null>(null);

const toggleKeyboardShortcutsPopover = (event: Event) => {
  keyboardShortcutsPopover.value?.toggle(event);
};

// 章节设置弹出框状态
const chapterSettingsPopover = ref<{ toggle: (event: Event) => void } | null>(null);

const toggleChapterSettingsPopover = (event: Event) => {
  chapterSettingsPopover.value?.toggle(event);
};

// 保存章节设置
const handleSaveChapterSettings = async (data: {
  // 全局设置（书籍级别）
  preserveIndents?: boolean;
  normalizeSymbolsOnDisplay?: boolean;
  normalizeTitleOnDisplay?: boolean;
  translationChunkSize?: number;
  skipAskUser?: boolean;
  // 章节设置（章节级别）
  translationInstructions?: string;
  polishInstructions?: string;
  proofreadingInstructions?: string;
}) => {
  if (!book.value) return;

  try {
    // 全局设置（书籍级别）
    // 默认保留缩进：未设置时不应过滤掉缩进
    const preserveIndents = data.preserveIndents ?? true;
    const normalizeSymbolsOnDisplay = data.normalizeSymbolsOnDisplay ?? false;
    const normalizeTitleOnDisplay = data.normalizeTitleOnDisplay ?? false;
    const translationChunkSize = data.translationChunkSize ?? 8000;
    const skipAskUser = data.skipAskUser ?? false;

    // 章节设置（章节级别）
    const translationInstructions = data.translationInstructions ?? '';
    const polishInstructions = data.polishInstructions ?? '';
    const proofreadingInstructions = data.proofreadingInstructions ?? '';

    // 准备更新数据
    const updates: Partial<Novel> = {
      preserveIndents,
      normalizeSymbolsOnDisplay,
      normalizeTitleOnDisplay,
      translationChunkSize,
      skipAskUser,
      lastEdited: new Date(),
    };

    // 如果有选中的章节，同时更新章节级别的特殊指令
    if (selectedChapter.value) {
      const updatedVolumes = ChapterService.updateChapter(book.value, selectedChapter.value.id, {
        translationInstructions,
        polishInstructions,
        proofreadingInstructions,
      });
      updates.volumes = updatedVolumes;

      // 更新 selectedChapterWithContent 中的特殊指令字段
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

    // 一次性保存所有设置（避免多个 updateBook 调用导致的竞态条件）
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

// 打开创建角色对话框
const openCreateCharacterDialog = () => {
  editingCharacter.value = null;
  showEditCharacterDialog.value = true;
  closePopoverAndUpdateContext(characterPopover.value);
};

// 打开编辑角色对话框
const openEditCharacterDialog = (character: CharacterSetting) => {
  editingCharacter.value = character;
  showEditCharacterDialog.value = true;
  closePopoverAndUpdateContext(characterPopover.value);
};

// 保存角色设定
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
      // 创建新角色
      // 保存状态用于撤销
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
      // 编辑现有角色
      // 保存状态用于撤销
      saveState('保存角色设定');

      const currentCharacterSettings = book.value.characterSettings || [];

      // 检查名称冲突 (排除自己)
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

// Add Delete Character Dialog State
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
    // 保存状态用于撤销
    saveState('删除角色设定');

    await CharacterSettingService.deleteCharacterSetting(book.value.id, deletingCharacter.value.id);

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

// 打开编辑术语对话框
const openEditTermDialog = (term: Terminology) => {
  editingTerm.value = term;
  termDialogMode.value = 'edit';
  showEditTermDialog.value = true;
  closePopoverAndUpdateContext(termPopover.value);
};

// 保存术语
const handleSaveTerm = async (data: { name: string; translation: string; description: string }) => {
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
      // 创建新术语
      // 保存状态用于撤销
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
      // 编辑现有术语
      if (!editingTerm.value) return;

      // 保存状态用于撤销
      saveState('保存术语');

      const currentTerminologies = book.value.terminologies || [];

      // 检查名称冲突 (排除自己)
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
            translation: {
              ...term.translation,
              translation: data.translation,
            },
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

// Add Delete Term Dialog State
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
    // 保存状态用于撤销
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

// 保存书籍（编辑）
const isSavingBook = ref(false);

const handleBookSave = async (formData: Partial<Novel>) => {
  if (!book.value || isSavingBook.value) return;

  isSavingBook.value = true;
  try {
    // 保存状态用于撤销
    saveState('编辑书籍信息');

    const updates: Partial<Novel> = {
      title: formData.title!,
      lastEdited: new Date(),
    };
    if (formData.alternateTitles && formData.alternateTitles.length > 0) {
      updates.alternateTitles = formData.alternateTitles;
    }
    if (formData.author?.trim()) {
      updates.author = formData.author.trim();
    }
    if (formData.description?.trim()) {
      updates.description = formData.description.trim();
    }
    if (formData.tags && formData.tags.length > 0) {
      updates.tags = formData.tags;
    }
    if (formData.webUrl && formData.webUrl.length > 0) {
      updates.webUrl = formData.webUrl;
    }
    // 处理封面：如果提供了封面就更新，如果为 null 就删除封面
    if (formData.cover !== undefined) {
      updates.cover = formData.cover;
    }
    // 处理 volumes：如果提供了 volumes 就更新
    if (formData.volumes !== undefined) {
      updates.volumes = formData.volumes;
    }
    // 处理特殊指令：始终包含这些字段（即使为空字符串，用于清除现有值）
    if (formData.translationInstructions !== undefined) {
      updates.translationInstructions = formData.translationInstructions;
    }
    if (formData.polishInstructions !== undefined) {
      updates.polishInstructions = formData.polishInstructions;
    }
    if (formData.proofreadingInstructions !== undefined) {
      updates.proofreadingInstructions = formData.proofreadingInstructions;
    }
    // 保存原始数据用于撤销
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
</script>

<template>
  <div class="book-details-layout">
    <!-- 加载指示器 -->
    <div v-if="!book" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <ProgressSpinner
          style="width: 50px; height: 50px"
          strokeWidth="4"
          animationDuration=".8s"
          aria-label="加载中"
        />
        <p class="text-moon/70 mt-4">正在加载书籍信息...</p>
      </div>
    </div>

    <!-- 书籍内容 -->
    <div v-else class="book-details-layout">
      <div v-if="isSmallScreen" class="mobile-workspace-switcher">
        <button
          class="workspace-switch-btn"
          :class="{ 'workspace-switch-btn-active': workspaceMode === 'catalog' }"
          @click="switchWorkspaceMode('catalog')"
        >
          <i class="pi pi-list"></i>
          <span>目录</span>
        </button>
        <button
          class="workspace-switch-btn"
          :class="{ 'workspace-switch-btn-active': workspaceMode === 'content' }"
          @click="switchWorkspaceMode('content')"
        >
          <i class="pi pi-file"></i>
          <span>内容</span>
        </button>
        <button
          class="workspace-switch-btn"
          :class="{ 'workspace-switch-btn-active': workspaceMode === 'settings' }"
          @click="switchWorkspaceMode('settings')"
        >
          <i class="pi pi-cog"></i>
          <span>设置</span>
        </button>
        <button
          class="workspace-switch-btn"
          :class="{ 'workspace-switch-btn-active': workspaceMode === 'progress' }"
          :disabled="!selectedChapter || !showTranslationProgress"
          @click="switchWorkspaceMode('progress')"
        >
          <i class="pi pi-chart-line"></i>
          <span>进度</span>
        </button>
      </div>

      <!-- 左侧卷/章节面板 -->
      <aside
        class="book-sidebar"
        :class="{
          'book-sidebar-mobile-hidden': isSmallScreen && workspaceMode !== 'catalog',
          'book-sidebar-mobile-visible': isSmallScreen && workspaceMode === 'catalog',
        }"
      >
        <div class="sidebar-content">
          <!-- 书籍封面和标题 -->
          <div v-if="book" class="book-header">
            <div class="book-header-content" @click="openBookDialog">
              <i class="pi pi-info-circle book-edit-icon"></i>
              <div class="book-cover-wrapper">
                <img
                  :src="book ? getCoverUrl(book) : ''"
                  :alt="book?.title || ''"
                  class="book-cover"
                  @error="
                    (e) => {
                      const target = e.target as HTMLImageElement;
                      if (book) {
                        target.src = getCoverUrl(book);
                      }
                    }
                  "
                />
              </div>
              <div class="book-info">
                <h3 class="book-title">{{ book.title }}</h3>
                <div v-if="stats" class="book-stats">
                  <div class="stat-item stat-item-volume">
                    <i class="pi pi-file stat-icon"></i>
                    <span class="stat-value">{{ stats.volumeCount }}</span>
                    <span class="stat-label">卷</span>
                  </div>
                  <span class="stat-separator">|</span>
                  <div class="stat-item stat-item-chapter">
                    <i class="pi pi-list stat-icon"></i>
                    <span class="stat-value">{{ stats.chapterCount }}</span>
                    <span class="stat-label">章</span>
                  </div>
                  <span class="stat-separator">|</span>
                  <div class="stat-item stat-item-wordcount">
                    <i class="pi pi-align-left stat-icon"></i>
                    <span class="stat-value">{{ formatWordCount(stats.wordCount) }}</span>
                  </div>
                </div>
                <div v-else-if="isStatsCalculating" class="book-stats">
                  <Skeleton width="120px" height="20px" />
                </div>
              </div>
            </div>
            <div class="book-separator"></div>
          </div>

          <!-- 设置菜单 -->
          <div class="settings-menu-wrapper">
            <div class="settings-menu-items">
              <button
                class="settings-menu-item"
                :class="{ 'settings-menu-item-selected': selectedSettingMenu === 'terms' }"
                @click="navigateToTermsSetting"
              >
                <i class="pi pi-bookmark settings-menu-icon"></i>
                <span class="settings-menu-label">术语设置</span>
              </button>
              <button
                class="settings-menu-item"
                :class="{ 'settings-menu-item-selected': selectedSettingMenu === 'characters' }"
                @click="navigateToCharactersSetting"
              >
                <i class="pi pi-users settings-menu-icon"></i>
                <span class="settings-menu-label">角色设置</span>
              </button>
              <button
                class="settings-menu-item"
                :class="{ 'settings-menu-item-selected': selectedSettingMenu === 'memory' }"
                @click="navigateToMemorySetting"
              >
                <i class="pi pi-database settings-menu-icon"></i>
                <span class="settings-menu-label">记忆管理</span>
              </button>
              <button class="settings-menu-item" @click="openScraperDialog">
                <i class="pi pi-download settings-menu-icon"></i>
                <span class="settings-menu-label">检查更新</span>
              </button>
            </div>
            <div class="settings-menu-separator"></div>
          </div>

          <!-- 目录标题和操作按钮 -->
          <div class="sidebar-title-wrapper">
            <h2 class="sidebar-title">目录</h2>
            <div class="sidebar-actions">
              <Button
                icon="pi pi-plus"
                label="新卷"
                class="p-button-text p-button-sm"
                size="small"
                title="添加新卷"
                @click="showAddVolumeDialog = true"
              />
              <Button
                icon="pi pi-plus-circle"
                label="新章节"
                class="p-button-text p-button-sm"
                size="small"
                title="添加新章节"
                @click="openAddChapterDialog"
              />
            </div>
          </div>

          <!-- 卷和章节列表 -->
          <VolumesList
            :volumes="volumes"
            :book="book || null"
            :selected-chapter-id="selectedChapterId"
            :is-page-loading="isPageLoading"
            :is-volume-expanded="isVolumeExpanded"
            :dragged-chapter="draggedChapter"
            :drag-over-volume-id="dragOverVolumeId"
            :drag-over-index="dragOverIndex"
            :touch-mode="isSmallScreen"
            :is-moving-chapter="isMovingChapter"
            @toggle-volume="onToggleVolume"
            @navigate-to-chapter="onNavigateToChapter"
            @edit-volume="onEditVolume"
            @delete-volume="onDeleteVolume"
            @edit-chapter="onEditChapter"
            @delete-chapter="onDeleteChapter"
            @drag-start="onDragStart"
            @drag-end="onDragEnd"
            @drag-over="onDragOver"
            @drop="onDrop"
            @drag-leave="onDragLeave"
            @move-chapter="onMoveChapter"
          />

          <!-- 返回链接 -->
          <div class="back-link-wrapper">
            <button class="back-link" @click="() => void router.push('/books')">
              <i class="pi pi-arrow-left"></i>
              <span>返回书籍列表</span>
            </button>
          </div>
        </div>
      </aside>

      <!-- 添加卷对话框 -->
      <AddVolumeDialog
        v-model:visible="showAddVolumeDialog"
        :loading="isAddingVolume"
        @save="handleAddVolume"
      />

      <!-- 添加章节对话框 -->
      <AddChapterDialog
        v-model:visible="showAddChapterDialog"
        :volume-options="volumeOptions"
        :loading="isAddingChapter"
        @save="handleAddChapter"
      />

      <!-- 编辑卷对话框 -->
      <EditVolumeDialog
        v-model:visible="showEditVolumeDialog"
        :title="editingVolumeTitle"
        :translation="editingVolumeTranslation"
        :loading="isEditingVolume"
        @save="handleEditVolume"
      />

      <!-- 编辑章节对话框 -->
      <EditChapterDialog
        v-model:visible="showEditChapterDialog"
        :title="editingChapterTitle || ''"
        :translation="editingChapterTranslation || ''"
        :target-volume-id="editingChapterTargetVolumeId || null"
        :volume-options="volumeOptions"
        :loading="isEditingChapter"
        :translation-instructions="editingChapterTranslationInstructions || ''"
        :polish-instructions="editingChapterPolishInstructions || ''"
        :proofreading-instructions="editingChapterProofreadingInstructions || ''"
        @save="handleEditChapter"
      />

      <!-- 删除卷确认对话框 -->
      <DeleteVolumeConfirmDialog
        v-model:visible="showDeleteVolumeConfirm"
        :volume-title="deletingVolumeTitle"
        :loading="isDeletingVolume"
        @confirm="handleDeleteVolume"
      />

      <!-- 删除章节确认对话框 -->
      <DeleteChapterConfirmDialog
        v-model:visible="showDeleteChapterConfirm"
        :chapter-title="deletingChapterTitle"
        :loading="isDeletingChapter"
        @confirm="handleDeleteChapter"
      />

      <!-- 书籍编辑对话框 -->
      <BookDialog
        v-model:visible="showBookDialog"
        mode="edit"
        :book="book || null"
        :loading="isSavingBook"
        @save="handleBookSave"
        @cancel="showBookDialog = false"
      />

      <!-- 从在线获取更新对话框 -->
      <NovelScraperDialog
        v-model:visible="showScraperDialog"
        :current-book="book || null"
        :initial-url="book?.webUrl?.[0] || ''"
        :show-novel-info="false"
        initialFilter="unimported"
        @apply="handleScraperUpdate"
      />

      <!-- 导出菜单 -->
      <TieredMenu ref="exportMenuRef" :model="exportMenuItems" popup />

      <!-- 术语列表 Popover -->
      <TermPopover
        ref="termPopover"
        :used-terms="usedTerms"
        @edit="openEditTermDialog"
        @delete="openDeleteTermConfirm"
        @create="openCreateTermDialog"
      />

      <!-- 角色设定列表 Popover -->
      <CharacterPopover
        ref="characterPopover"
        :used-characters="usedCharacters"
        @edit="openEditCharacterDialog"
        @delete="openDeleteCharacterConfirm"
        @create="openCreateCharacterDialog"
      />

      <!-- 记忆引用 Popover -->
      <Popover
        ref="memoryPopover"
        :dismissable="true"
        :show-close-icon="false"
        style="width: 24rem; max-width: 90vw"
        class="memory-reference-popover"
        @show="handleMemoryPopoverShow"
        @hide="handleMemoryPopoverHide"
      >
        <MemoryReferencePanel
          :references="usedMemoryReferences"
          :book-id="bookId"
          :loading="isLoadingMemoryReferences"
          :always-expanded="true"
          @view-memory="handleViewMemory"
        />
      </Popover>

      <!-- 键盘快捷键 Popover -->
      <KeyboardShortcutsPopover ref="keyboardShortcutsPopover" />

      <!-- 章节设置弹出框 -->
      <ChapterSettingsPopover
        ref="chapterSettingsPopover"
        :book="book || null"
        :chapter="selectedChapter || null"
        @save="handleSaveChapterSettings"
      />

      <!-- 记忆详情对话框 -->
      <MemoryDetailDialog
        v-if="bookId"
        :visible="showMemoryDetailDialog"
        :memory="detailMemory"
        :book-id="bookId"
        @update:visible="(val) => (showMemoryDetailDialog = val)"
        @save="handleMemorySave"
        @delete="handleMemoryDelete"
        @navigate="handleMemoryNavigate"
      />

      <!-- 编辑术语对话框 -->
      <TermEditDialog
        v-model:visible="showEditTermDialog"
        :mode="termDialogMode"
        :term="editingTerm"
        :loading="isSavingTerm"
        @save="handleSaveTerm"
      />

      <!-- 删除术语确认对话框 -->
      <DeleteTermConfirmDialog
        v-model:visible="showDeleteTermConfirm"
        :term-name="deletingTerm?.name || null"
        :loading="isDeletingTerm"
        @confirm="confirmDeleteTerm"
      />

      <!-- 编辑角色对话框 -->
      <CharacterEditDialog
        v-model:visible="showEditCharacterDialog"
        :character="editingCharacter"
        :loading="isSavingCharacter"
        @save="handleSaveCharacter"
      />

      <!-- 删除角色确认对话框 -->
      <DeleteCharacterConfirmDialog
        v-model:visible="showDeleteCharacterConfirm"
        :character-name="deletingCharacter?.name || null"
        :loading="isDeletingCharacter"
        @confirm="confirmDeleteCharacter"
      />

      <!-- 主内容区域 -->
      <div
        class="book-main-content"
        :class="{
          'overflow-hidden': !!selectedSettingMenu,
          'book-main-content-mobile-hidden': isSmallScreen && workspaceMode === 'catalog',
        }"
      >
        <!-- 章节阅读工具栏 -->
        <ChapterToolbar
          v-if="
            selectedChapter &&
            !selectedSettingMenu &&
            (!isSmallScreen || workspaceMode === 'content')
          "
          :selected-chapter="selectedChapter"
          :book="book || null"
          :can-undo="canUndo"
          :can-redo="canRedo"
          :undo-description="undoDescription || null"
          :redo-description="redoDescription || null"
          :edit-mode="editMode"
          :edit-mode-options="[...editModeOptions]"
          :selected-chapter-paragraphs="selectedChapterParagraphs"
          :used-term-count="usedTermCount"
          :used-character-count="usedCharacterCount"
          :used-memory-count="usedMemoryCount"
          :translation-status="translationStatus"
          :translation-button-label="translationButtonLabel"
          :translation-button-menu-items="translationButtonMenuItems"
          :is-translating-chapter="isTranslatingChapter"
          :is-polishing-chapter="isPolishingChapter"
          :is-search-visible="isSearchVisible"
          :show-translation-progress="showTranslationProgress"
          :can-show-translation-progress="
            isTranslatingChapter || isPolishingChapter || isProofreadingChapter
          "
          @undo="undo"
          @redo="redo"
          @update:edit-mode="
            (value: EditMode) => {
              editMode = value;
            }
          "
          @toggle-export="(event: Event) => toggleExportMenu(event)"
          @toggle-term-popover="(event: Event) => toggleTermPopover(event)"
          @toggle-character-popover="(event: Event) => toggleCharacterPopover(event)"
          @toggle-memory-popover="(event: Event) => handleToggleMemoryPopover(event)"
          @translation-button-click="translationButtonClick"
          @toggle-search="toggleSearch"
          @toggle-keyboard-shortcuts="toggleKeyboardShortcutsPopover"
          @toggle-special-instructions="toggleChapterSettingsPopover"
          @toggle-translation-progress="toggleTranslationProgress"
        />

        <!-- 搜索工具栏 -->
        <SearchToolbar
          v-if="
            selectedChapter &&
            !selectedSettingMenu &&
            (!isSmallScreen || workspaceMode === 'content')
          "
          v-model:visible="isSearchVisible"
          v-model:search-query="searchQuery"
          v-model:replace-query="replaceQuery"
          v-model:show-replace="showReplace"
          :matches-count="searchMatches.length"
          :current-match-index="currentSearchMatchIndex"
          @next="nextMatch"
          @prev="prevMatch"
          @replace="replaceCurrent"
          @replace-all="replaceAll"
        />

        <div
          ref="scrollableContentRef"
          class="scrollable-content"
          :class="{
            '!overflow-hidden': showTranslationProgress || !!selectedSettingMenu,
            'scrollable-content-mobile-hidden':
              isSmallScreen &&
              ((workspaceMode === 'settings' && !selectedSettingMenu) ||
                (workspaceMode === 'progress' && !showTranslationProgress)),
          }"
        >
          <div
            class="page-container"
            :class="{
              '!h-full !overflow-hidden !min-h-0 flex flex-col !p-0': !!selectedSettingMenu,
              '!h-full !overflow-hidden !min-h-0': selectedChapter,
              'page-container-split-active': selectedChapter && showTranslationProgress,
            }"
          >
            <!-- 术语设置面板 -->
            <TerminologyPanel
              v-if="
                selectedSettingMenu === 'terms' && (!isSmallScreen || workspaceMode === 'settings')
              "
              :book="book || null"
              class="flex-1 min-h-0"
            />

            <!-- 角色设置面板 -->
            <CharacterSettingPanel
              v-else-if="
                selectedSettingMenu === 'characters' &&
                (!isSmallScreen || workspaceMode === 'settings')
              "
              :book="book || null"
              class="flex-1 min-h-0"
            />

            <!-- Memory 设置面板 -->
            <MemoryPanel
              v-else-if="
                selectedSettingMenu === 'memory' && (!isSmallScreen || workspaceMode === 'settings')
              "
              :book="book || null"
              class="flex-1 min-h-0"
            />

            <!-- 章节内容和翻译进度分割布局 -->
            <div
              v-else-if="selectedChapter"
              class="chapter-content-split-layout split-layout-container"
              :class="{ 'split-layout-active': showTranslationProgress }"
            >
              <!-- 左侧：章节内容 -->
              <div
                ref="chapterContentPanelRef"
                class="chapter-content-panel"
                :class="{
                  'panel-with-split': showTranslationProgress,
                  'mobile-panel-hidden': isSmallScreen && workspaceMode === 'progress',
                }"
              >
                <ChapterContentPanel
                  :selected-chapter="selectedChapter"
                  :selected-chapter-with-content="selectedChapterWithContent"
                  :selected-chapter-paragraphs="selectedChapterParagraphs"
                  :is-loading-chapter-content="isLoadingChapterContent"
                  :edit-mode="editMode"
                  :original-text-edit-value="originalTextEditValue"
                  :translated-char-count="translatedCharCount"
                  :book="book || null"
                  :book-id="bookId"
                  :is-small-screen="isSmallScreen"
                  :selected-chapter-id="selectedChapterId"
                  :translating-paragraph-ids="translatingParagraphIds"
                  :polishing-paragraph-ids="polishingParagraphIds"
                  :proofreading-paragraph-ids="proofreadingParagraphIds"
                  :search-query="searchQuery"
                  :selected-paragraph-index="selectedParagraphIndex"
                  :is-keyboard-selected="isKeyboardSelected"
                  :is-click-selected="isClickSelected"
                  :paragraph-card-refs="paragraphCardRefs"
                  :is-summarizing="isSummarizing"
                  :prev-chapter="prevChapter"
                  :next-chapter="nextChapter"
                  @update:original-text-edit-value="
                    (value: string) => {
                      originalTextEditValue = value;
                    }
                  "
                  @open-edit-chapter-dialog="openEditChapterDialog"
                  @cancel-original-text-edit="cancelOriginalTextEdit"
                  @save-original-text-edit="saveOriginalTextEdit"
                  @update-translation="
                    (paragraphId: string, newTranslation: string) =>
                      updateParagraphTranslation(paragraphId, newTranslation)
                  "
                  @retranslate-paragraph="retranslateParagraph"
                  @polish-paragraph="polishParagraph"
                  @proofread-paragraph="proofreadParagraph"
                  @select-translation="
                    (paragraphId: string, translationId: string) =>
                      selectParagraphTranslation(paragraphId, translationId)
                  "
                  @paragraph-click="handleParagraphClick"
                  @paragraph-edit-start="handleParagraphEditStart"
                  @paragraph-edit-stop="handleParagraphEditStop"
                  @re-summarize-chapter="handleReSummarizeChapter"
                  @navigate-to-chapter="onNavigateToChapter"
                  @navigate-to-chapter-list="onNavigateToChapterList"
                />
              </div>

              <!-- 分割线 -->
              <div
                v-show="showTranslationProgress && (!isSmallScreen || workspaceMode === 'progress')"
                class="split-divider"
              ></div>

              <!-- 右侧：翻译进度 -->
              <div
                v-show="showTranslationProgress && (!isSmallScreen || workspaceMode === 'progress')"
                class="translation-progress-panel"
              >
                <div class="translation-progress-panel-inner">
                  <TranslationProgress
                    :is-translating="isTranslatingChapter"
                    :is-polishing="isPolishingChapter"
                    :is-proofreading="isProofreadingChapter"
                    :progress="
                      isProofreadingChapter
                        ? proofreadingProgress
                        : isPolishingChapter
                          ? polishProgress
                          : translationProgress
                    "
                    @cancel="
                      (taskType: string, chapterId?: string) => {
                        if (taskType === 'proofreading') cancelProofreading(chapterId);
                        else if (taskType === 'polish') cancelPolish(chapterId);
                        else cancelTranslation(chapterId);
                      }
                    "
                  />
                </div>
              </div>
            </div>

            <!-- 未选择章节时的提示（仅当没有选择设置菜单和章节时显示） -->
            <div v-else class="no-chapter-selected">
              <i class="pi pi-book-open no-selection-icon"></i>
              <p class="no-selection-text">请从左侧选择一个章节</p>
              <p class="no-selection-hint text-moon/60 text-sm">点击章节标题查看内容</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 书籍详情布局 */
.book-details-layout {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.mobile-workspace-switcher {
  display: none;
}

/* 左侧边栏 */
.book-sidebar {
  width: 18rem;
  min-width: 18rem;
  max-width: 18rem;
  border-right: 1px solid var(--white-opacity-10);
  background: var(--white-opacity-3);
  overflow-y: auto;
  overflow-x: hidden;
}

.sidebar-content {
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow-x: hidden;
}

.book-header {
  margin-bottom: 0.75rem;
}

.book-header-content {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.5rem;
  padding: 0.5rem;
  background: var(--white-opacity-5);
  border: 1px solid var(--white-opacity-10);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  min-width: 0;
  overflow: hidden;
}

.book-header-content:hover {
  background: var(--white-opacity-8);
  border-color: var(--primary-opacity-30);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px var(--black-opacity-10);
}

.book-edit-icon {
  position: absolute;
  top: 0.35rem;
  right: 0.35rem;
  font-size: 0.875rem;
  color: var(--moon-opacity-60);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1;
}

.book-header-content:hover .book-edit-icon {
  color: var(--primary-opacity-80);
  transform: scale(1.1);
}

.book-cover-wrapper {
  flex-shrink: 0;
  width: 3.25rem;
  aspect-ratio: 2/3;
  overflow: hidden;
  border-radius: 6px;
  background: var(--white-opacity-5);
  border: 1px solid var(--white-opacity-10);
}

.book-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.book-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.25rem;
  overflow: hidden;
}

.book-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--moon-opacity-95);
  line-height: 1.3;
  text-align: left;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  margin: 0;
}

.book-stats {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: nowrap;
  white-space: nowrap;
  min-width: 0;
  overflow: hidden;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  color: var(--moon-opacity-80);
  font-size: 0.75rem;
}

/* 统一颜色主题 - 使用渐变色系 */
.stat-item .stat-icon {
  color: #60a5fa; /* blue-400 */
  font-size: 0.7rem;
}

.stat-item .stat-value {
  color: #93c5fd; /* blue-300 */
  font-weight: 600;
}

.stat-item .stat-label {
  color: #bfdbfe; /* blue-200 */
  font-size: 0.7rem;
}

.stat-separator {
  color: var(--moon-opacity-40);
  font-size: 0.7rem;
  user-select: none;
}

.book-separator {
  width: 100%;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--white-opacity-20), transparent);
  margin-bottom: 0.5rem;
}

.sidebar-title-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.sidebar-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--moon-opacity-90);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

.sidebar-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

/* 设置菜单 */
.settings-menu-wrapper {
  margin-top: 0;
  margin-bottom: 0.75rem;
}

.settings-menu-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--moon-opacity-90);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 0.75rem 0;
  padding: 0;
}

.settings-menu-items {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.settings-menu-separator {
  width: 100%;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--white-opacity-20), transparent);
}

.settings-menu-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.625rem;
  background: var(--white-opacity-5);
  border: 1px solid var(--white-opacity-10);
  border-radius: 7px;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--moon-opacity-90);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: left;
  width: 100%;
}

.settings-menu-item:hover {
  background: var(--primary-opacity-15);
  color: var(--moon-opacity-95);
  border-color: var(--primary-opacity-40);
  transform: translateY(-1px);
  box-shadow: 0 2px 6px var(--black-opacity-10);
}

.settings-menu-item-selected {
  background: var(--primary-opacity-15) !important;
  border-color: var(--primary-opacity-50) !important;
  color: var(--moon-opacity-95) !important;
  box-shadow: 0 2px 8px var(--primary-opacity-15) !important;
}

.settings-menu-item-selected .settings-menu-icon {
  color: var(--primary-opacity-90) !important;
}

.settings-menu-icon {
  font-size: 0.8125rem;
  color: var(--primary-opacity-70);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
}

.settings-menu-item:hover .settings-menu-icon {
  color: var(--primary-opacity-90);
  transform: scale(1.05);
}

.settings-menu-label {
  flex: 1;
  line-height: 1.1;
}

.back-link-wrapper {
  margin-top: auto;
  padding-top: 1.5rem;
  border-top: 1px solid var(--white-opacity-10);
}

.back-link {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--primary-opacity-15);
  border: 1px solid var(--primary-opacity-40);
  border-radius: 8px;
  color: var(--moon-opacity-90);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 4px var(--primary-opacity-10);
}

.back-link:hover {
  background: var(--primary-opacity-20);
  border-color: var(--primary-opacity-50);
  color: var(--moon-opacity-95);
  transform: translateX(-2px);
  box-shadow: 0 2px 6px var(--primary-opacity-15);
}

.back-link:active {
  transform: translateX(0);
  box-shadow: 0 2px 4px var(--primary-opacity-10);
}

.back-link .pi {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--primary-opacity-80);
}

/* 主内容区域 */
.book-main-content {
  flex: 1;
  overflow-y: hidden; /* Changed from auto to hidden */
  overflow-x: hidden;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.scrollable-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 页面容器 - 确保有足够的空间 */
.page-container {
  padding-top: 1.5rem;
  padding-left: 1.5rem;
  padding-right: 1.5rem;
  padding-bottom: 1.5rem;
  min-height: 100%;
}

.page-container.page-container-split-active {
  padding-bottom: 0;
}

/* 章节内容和翻译进度分割布局 */
.chapter-content-split-layout {
  display: flex;
  height: 100%;
  min-height: 0;
  gap: 0;
  margin: -1.5rem -1.5rem 0 -1.5rem;
  padding: 1.5rem 1.5rem 0 1.5rem;
  flex-direction: row;
  align-items: stretch;
}

.chapter-content-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
  margin: -1.5rem;
  padding: 1.5rem;
  transition: padding-right 0.2s ease;
}

.chapter-content-panel.panel-with-split {
  padding-right: 2.25rem;
}

.split-divider {
  width: 1px;
  background: var(--white-opacity-20);
  flex-shrink: 0;
  margin: 0 1.5rem;
  transition: opacity 0.2s ease;
}

.translation-progress-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: opacity 0.2s ease;
  align-self: stretch;
  margin: -1.5rem;
  padding: 0;
}

.translation-progress-panel-inner {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--white-opacity-3);
  border-left: 1px solid var(--white-opacity-20);
  padding: 0;
  justify-content: flex-start;
  align-items: center;
}

/* 未选择章节状态 */
.no-chapter-selected {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
  min-height: 30rem;
}

.no-selection-icon {
  font-size: 4rem;
  color: var(--moon-opacity-30);
  margin-bottom: 1.5rem;
}

.no-selection-text {
  font-size: 1.25rem;
  font-weight: 500;
  color: var(--moon-opacity-70);
  margin: 0 0 0.5rem 0;
}

.no-selection-hint {
  margin: 0;
}

@media (max-width: 1279px) {
  .book-details-layout {
    flex-direction: column;
    max-width: 100%;
  }

  .mobile-workspace-switcher {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--white-opacity-10);
    background: var(--white-opacity-3);
    max-width: 100%;
    box-sizing: border-box;
    overflow: hidden;
    flex-shrink: 0;
  }

  .workspace-switch-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    border: 1px solid var(--white-opacity-15);
    background: var(--white-opacity-5);
    color: var(--moon-opacity-85);
    border-radius: 0.5rem;
    min-height: 2.5rem;
    font-size: 0.75rem;
    font-weight: 500;
    overflow: hidden;
    white-space: nowrap;
    min-width: 0;
  }

  .workspace-switch-btn-active {
    border-color: var(--primary-opacity-50);
    background: var(--primary-opacity-15);
    color: var(--moon-opacity-100);
  }

  .workspace-switch-btn:disabled {
    opacity: 0.45;
  }

  .workspace-switch-btn:active,
  .settings-menu-item:active,
  .book-header-content:active,
  .back-link:active {
    transform: scale(0.98);
  }

  .settings-menu-item {
    min-height: 2.5rem;
  }

  .sidebar-title-wrapper {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
    overflow: hidden;
    min-width: 0;
  }

  .sidebar-actions {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
    overflow: hidden;
  }

  .sidebar-actions :deep(.p-button) {
    width: 100%;
    justify-content: center;
    min-height: 2.125rem;
    font-size: 0.75rem;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
    overflow: hidden;
    box-sizing: border-box;
  }

  .sidebar-actions :deep(.p-button .p-button-icon) {
    margin-right: 0.25rem;
    font-size: 0.75rem;
  }

  .book-title {
    font-size: 0.95rem;
  }

  .book-stats {
    gap: 0.25rem;
    font-size: 0.7rem;
  }

  .stat-item {
    min-width: 0;
  }

  .book-sidebar {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--white-opacity-10);
  }

  .sidebar-content {
    max-width: 100%;
    box-sizing: border-box;
  }

  .book-sidebar-mobile-hidden {
    display: none;
  }

  .book-sidebar-mobile-visible {
    display: block;
  }

  .book-main-content-mobile-hidden {
    display: none;
  }

  .scrollable-content-mobile-hidden {
    display: none;
  }

  .mobile-panel-hidden {
    display: none;
  }

  .translation-progress-panel {
    margin: 0;
  }

  .split-divider {
    display: none;
  }

  .chapter-content-split-layout {
    /*
     * 移动端尽量吃满可用宽度：抵消 page-container 的 1.5rem 内边距后，
     * 保留 0.75rem 的内容安全边距，兼顾可读性与横向利用率。
     */
    margin: -1.5rem -1.5rem 0 -1.5rem;
    padding: 0.75rem 0.75rem 0 0.75rem;
  }

  /*
   * 移动端下父容器的内边距已缩小为 0.75rem，
   * 这里同步移除桌面用的负 margin/额外 padding，避免内容向右偏移与轻微溢出。
   */
  .chapter-content-panel {
    margin: 0;
    padding: 0;
  }

  .chapter-content-panel.panel-with-split {
    padding-right: 0;
  }
}
</style>
