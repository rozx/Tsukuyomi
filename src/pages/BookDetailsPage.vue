<script setup lang="ts">
import { computed, ref, watch, nextTick, onUnmounted, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Popover from 'primevue/popover';
import TieredMenu from 'primevue/tieredmenu';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import Badge from 'primevue/badge';
import Button from 'primevue/button';
import SplitButton from 'primevue/splitbutton';
import Skeleton from 'primevue/skeleton';
import { useBooksStore } from 'src/stores/books';
import { useBookDetailsStore } from 'src/stores/book-details';
import { useContextStore } from 'src/stores/context';
import { CoverService } from 'src/services/cover-service';
import { ChapterService } from 'src/services/chapter-service';
import { CharacterSettingService } from 'src/services/character-setting-service';
import {
  formatWordCount,
  getNovelCharCountAsync,
  getTotalChapters,
  getChapterContentText,
  getVolumeDisplayTitle,
  getChapterDisplayTitle,
  normalizeTranslationSymbols,
  findUniqueTermsInText,
  findUniqueCharactersInText,
  calculateCharacterScores,
} from 'src/utils';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { cloneDeep } from 'lodash';
import type { Chapter, Novel, Terminology, CharacterSetting, Paragraph } from 'src/models/novel';
import BookDialog from 'src/components/dialogs/BookDialog.vue';
import NovelScraperDialog from 'src/components/dialogs/NovelScraperDialog.vue';
import TermEditDialog from 'src/components/dialogs/TermEditDialog.vue';
import CharacterEditDialog from 'src/components/dialogs/CharacterEditDialog.vue';
import TerminologyPanel from 'src/components/novel/TerminologyPanel.vue';
import CharacterSettingPanel from 'src/components/novel/CharacterSettingPanel.vue';
import TranslatableInput from 'src/components/translation/TranslatableInput.vue';
import SearchToolbar from 'src/components/novel/SearchToolbar.vue';
import TranslationProgress from 'src/components/novel/TranslationProgress.vue';
import ChapterContentPanel from 'src/components/novel/ChapterContentPanel.vue';
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

const route = useRoute();
const router = useRouter();
const booksStore = useBooksStore();
const bookDetailsStore = useBookDetailsStore();
const contextStore = useContextStore();
const toast = useToastWithHistory();

// 书籍编辑对话框状态
const showBookDialog = ref(false);
const showScraperDialog = ref(false);

// 设置菜单状态
const selectedSettingMenu = ref<'terms' | 'characters' | null>(null);

// 滚动容器引用
const scrollableContentRef = ref<HTMLElement | null>(null);

// 从路由参数获取书籍 ID
const bookId = computed(() => route.params.id as string);

// 切换卷的展开/折叠状态
const toggleVolume = (volumeId: string) => {
  if (!bookId.value) return;
  void bookDetailsStore.toggleVolume(bookId.value, volumeId);
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

// 撤销/重做功能
const { canUndo, canRedo, undoDescription, redoDescription, saveState, undo, redo, clearHistory } =
  useUndoRedo(book, async (updatedBook) => {
    if (updatedBook) {
      await booksStore.updateBook(updatedBook.id, updatedBook);

      // 同步更新 selectedChapterWithContent，确保撤销/重做后 UI 正确显示
      if (selectedChapterId.value && updatedBook.volumes) {
        // 查找更新后的章节
        let foundChapter = false;
        for (const volume of updatedBook.volumes) {
          if (volume.chapters) {
            const updatedChapter = volume.chapters.find((ch) => ch.id === selectedChapterId.value);
            if (updatedChapter) {
              foundChapter = true;
              // 如果章节内容已加载，更新 selectedChapterWithContent
              if (updatedChapter.content !== undefined) {
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
  });

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
  openEditVolumeDialog,
  openEditChapterDialog,
  handleEditVolume,
  handleEditChapter,
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

// 导航到章节详情页
const navigateToChapter = (chapter: Chapter) => {
  if (!bookId.value) return;
  // 设置选中的章节
  void bookDetailsStore.setSelectedChapter(bookId.value, chapter.id);
  // 清除设置菜单选中状态
  selectedSettingMenu.value = null;
  // 重置滚动位置到顶部
  void nextTick(() => {
    if (scrollableContentRef.value) {
      scrollableContentRef.value.scrollTop = 0;
    }
  });
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
    });
  }
};

// 导航到术语设置
const navigateToTermsSetting = () => {
  selectedSettingMenu.value = 'terms';
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
    });
  }
};

// 导航到角色设置
const navigateToCharactersSetting = () => {
  selectedSettingMenu.value = 'characters';
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

// 计算章节范围内的角色出现频率，用于消歧义
const chapterCharacterScores = computed(() => {
  if (!selectedChapterWithContent.value || !book.value?.characterSettings) {
    return undefined;
  }

  const chapterText = getChapterContentText(selectedChapterWithContent.value);
  return calculateCharacterScores(chapterText, book.value.characterSettings);
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
  useChapterExport(selectedChapter, selectedChapterParagraphs);

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
      return;
    }

    // 如果内容已加载，直接使用
    if (selectedChapter.value.content !== undefined) {
      selectedChapterWithContent.value = selectedChapter.value;
      resetParagraphNavigation();
      return;
    }

    // 加载章节内容
    isLoadingChapterContent.value = true;
    try {
      const chapterWithContent = await ChapterService.loadChapterContent(selectedChapter.value);
      selectedChapterWithContent.value = chapterWithContent;
      resetParagraphNavigation();
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
    } finally {
      isLoadingChapterContent.value = false;
    }
  },
  { immediate: true },
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

// 监听路由变化，离开书籍详情页时清除上下文
watch(
  () => route.path,
  (newPath, oldPath) => {
    // 如果从书籍详情页（/books/:id）导航到其他页面，清除上下文
    // 注意：从一本书切换到另一本书时，bookId watch 会处理，这里不需要清除
    const isBookDetailsPage = /^\/books\/[^/]+$/.test(newPath);
    const wasBookDetailsPage = oldPath && /^\/books\/[^/]+$/.test(oldPath);

    // 如果之前是书籍详情页，但现在不是了，清除上下文
    if (wasBookDetailsPage && !isBookDetailsPage) {
      contextStore.clearContext();
    }
  },
);

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
  window.addEventListener('keydown', handleKeydown);
});

// 组件卸载时清除上下文
onUnmounted(() => {
  contextStore.clearContext();
  // 清理段落导航相关的 timeout
  cleanupParagraphNavigation();
  // 移除键盘快捷键监听
  window.removeEventListener('keydown', handleKeydown);
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
} = useSearchReplace(book, selectedChapter, selectedChapterParagraphs, updateParagraphTranslation);

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
  // 函数
  polishParagraph,
  retranslateParagraph,
  cancelTranslation,
  cancelPolish,
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

// 获取段落的选中翻译文本
const getParagraphTranslationText = (paragraph: Paragraph): string => {
  if (!paragraph.selectedTranslationId || !paragraph.translations) {
    return '';
  }
  const selectedTranslation = paragraph.translations.find(
    (t) => t.id === paragraph.selectedTranslationId,
  );
  return selectedTranslation?.translation || '';
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
const termPopover = ref();
const showEditTermDialog = ref(false);
const editingTerm = ref<Terminology | null>(null);
const isSavingTerm = ref(false);

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
  termPopover.value.toggle(event);
};

// 角色设定弹出框状态
const characterPopover = ref();
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

  return findUniqueCharactersInText(
    text,
    book.value.characterSettings,
    chapterCharacterScores.value,
  );
});

const usedCharacterCount = computed(() => usedCharacters.value.length);

const toggleCharacterPopover = (event: Event) => {
  characterPopover.value.toggle(event);
};

// 键盘快捷键弹出框状态
const keyboardShortcutsPopover = ref();

const toggleKeyboardShortcutsPopover = (event: Event) => {
  keyboardShortcutsPopover.value.toggle(event);
};

// 规范化章节符号
const normalizeChapterSymbols = async () => {
  if (!book.value || !selectedChapterWithContent.value || !selectedChapterParagraphs.value.length) {
    return;
  }

  // 保存状态用于撤销
  saveState('规范化符号');

  try {
    let updatedCount = 0;
    let titleUpdated = false;

    // 更新章节内容
    const updatedVolumes = book.value.volumes?.map((volume) => {
      if (!volume.chapters) return volume;

      const updatedChapters = volume.chapters.map((chapter) => {
        if (chapter.id !== selectedChapterWithContent.value!.id) return chapter;

        // 规范化章节标题翻译
        let updatedTitle = chapter.title;
        if (chapter.title.translation.translation) {
          const normalizedTitle = normalizeTranslationSymbols(
            chapter.title.translation.translation,
          );
          if (normalizedTitle !== chapter.title.translation.translation) {
            updatedTitle = {
              original: chapter.title.original,
              translation: {
                ...chapter.title.translation,
                translation: normalizedTitle,
              },
            };
            titleUpdated = true;
          }
        }

        // 使用已加载的章节内容
        const content = ChapterService.getChapterContentForUpdate(
          chapter,
          selectedChapterWithContent.value,
        );

        // 规范化段落翻译
        let updatedContent = content;
        if (content) {
          updatedContent = content.map((para) => {
            if (!para.translations || para.translations.length === 0) {
              return para;
            }

            const updatedTranslations = para.translations.map((trans) => {
              const normalized = normalizeTranslationSymbols(trans.translation);
              if (normalized !== trans.translation) {
                updatedCount++;
                return {
                  ...trans,
                  translation: normalized,
                };
              }
              return trans;
            });

            // 如果翻译有更新，返回更新后的段落
            if (
              updatedTranslations.some(
                (t, i) => t.translation !== para.translations?.[i]?.translation,
              )
            ) {
              return {
                ...para,
                translations: updatedTranslations,
              };
            }

            return para;
          });
        }

        return {
          ...chapter,
          title: updatedTitle,
          content: updatedContent,
          lastEdited: new Date(),
        };
      });

      return {
        ...volume,
        chapters: updatedChapters,
      };
    });

    // 更新书籍
    await booksStore.updateBook(book.value.id, {
      volumes: updatedVolumes,
      lastEdited: new Date(),
    });

    // 更新 selectedChapterWithContent 以反映保存的更改
    updateSelectedChapterWithContent(updatedVolumes);

    // 显示成功消息
    const updateDetails: string[] = [];
    if (updatedCount > 0) {
      updateDetails.push(`${updatedCount} 个段落翻译`);
    }
    if (titleUpdated) {
      updateDetails.push('章节标题');
    }

    if (updateDetails.length > 0) {
      toast.add({
        severity: 'success',
        summary: '规范化完成',
        detail: `已规范化 ${updateDetails.join('和')} 中的符号`,
        life: 3000,
      });
    } else {
      toast.add({
        severity: 'info',
        summary: '无需更新',
        detail: '所有翻译中的符号已经规范化',
        life: 3000,
      });
    }
  } catch (error) {
    console.error('规范化符号失败:', error);
    toast.add({
      severity: 'error',
      summary: '规范化失败',
      detail: error instanceof Error ? error.message : '规范化符号时发生未知错误',
      life: 3000,
    });
  }
};

// 打开编辑角色对话框
const openEditCharacterDialog = (character: CharacterSetting) => {
  editingCharacter.value = character;
  showEditCharacterDialog.value = true;
  // Close popover
  if (characterPopover.value) {
    characterPopover.value.hide();
  }
  // 更新上下文：保留书籍，清除章节和段落
  if (bookId.value) {
    contextStore.setContext({
      currentBookId: bookId.value,
      currentChapterId: null,
      hoveredParagraphId: null,
    });
  }
};

// 保存角色设定
const handleSaveCharacter = async (data: {
  name: string;
  sex?: 'male' | 'female' | 'other' | undefined;
  translation: string;
  description: string;
  aliases: Array<{ name: string; translation: string }>;
}) => {
  if (!book.value || !editingCharacter.value) return;

  // 保存状态用于撤销
  saveState('保存角色设定');

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
  } catch (error) {
    console.error('保存角色失败:', error);
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: '保存角色时发生错误',
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
  if (characterPopover.value) {
    characterPopover.value.hide();
  }
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
  showEditTermDialog.value = true;
  // Close popover
  if (termPopover.value) {
    termPopover.value.hide();
  }
  // 更新上下文：保留书籍，清除章节和段落
  if (bookId.value) {
    contextStore.setContext({
      currentBookId: bookId.value,
      currentChapterId: null,
      hoveredParagraphId: null,
    });
  }
};

// 保存术语
const handleSaveTerm = async (data: { name: string; translation: string; description: string }) => {
  if (!book.value || !editingTerm.value) return;

  // 保存状态用于撤销
  saveState('保存术语');

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
  } catch (error) {
    console.error('保存术语失败:', error);
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: '保存术语时发生错误',
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
  if (termPopover.value) {
    termPopover.value.hide();
  }
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
    <!-- 左侧卷/章节面板 -->
    <aside class="book-sidebar">
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
        <div class="volumes-container">
          <!-- 加载状态 -->
          <div v-if="isPageLoading" class="volumes-loading">
            <Skeleton height="60px" class="mb-2" />
            <Skeleton height="40px" class="mb-2" />
            <Skeleton height="40px" class="mb-2" />
            <Skeleton height="40px" />
          </div>
          <!-- 卷列表 -->
          <div v-else-if="volumes.length > 0" class="volumes-list">
            <div v-for="volume in volumes" :key="volume.id" class="volume-item">
              <div class="volume-item">
                <div class="volume-header">
                  <div class="volume-header-content" @click="toggleVolume(volume.id)">
                    <i
                      :class="[
                        'pi volume-toggle-icon',
                        isVolumeExpanded(volume.id) ? 'pi-chevron-down' : 'pi-chevron-right',
                      ]"
                    ></i>
                    <i class="pi pi-book volume-icon"></i>
                    <span class="volume-title">{{ getVolumeDisplayTitle(volume) }}</span>
                    <span
                      v-if="volume.chapters && volume.chapters.length > 0"
                      class="volume-chapter-count"
                    >
                      ({{ volume.chapters.length }} 章)
                    </span>
                  </div>
                  <div class="volume-actions" @click.stop>
                    <Button
                      icon="pi pi-pencil"
                      class="p-button-text p-button-sm p-button-rounded action-button"
                      size="small"
                      title="编辑"
                      @click="openEditVolumeDialog(volume)"
                    />
                    <Button
                      icon="pi pi-trash"
                      class="p-button-text p-button-sm p-button-rounded p-button-danger action-button"
                      size="small"
                      title="删除"
                      @click="openDeleteVolumeConfirm(volume)"
                    />
                  </div>
                </div>
                <Transition name="slide-down">
                  <div
                    v-if="
                      volume.chapters && volume.chapters.length > 0 && isVolumeExpanded(volume.id)
                    "
                    class="chapters-list"
                    @dragover.prevent="handleDragOver($event, volume.id)"
                    @drop="handleDrop($event, volume.id)"
                    @dragleave="handleDragLeave"
                    :class="{
                      'drag-over': dragOverVolumeId === volume.id && dragOverIndex === null,
                    }"
                  >
                    <div
                      v-for="(chapter, index) in volume.chapters"
                      :key="chapter.id"
                      :class="[
                        'chapter-item',
                        { 'chapter-item-selected': selectedChapterId === chapter.id },
                        {
                          'drag-over': dragOverVolumeId === volume.id && dragOverIndex === index,
                        },
                        { dragging: draggedChapter?.chapter.id === chapter.id },
                      ]"
                      draggable="true"
                      @dragstart="handleDragStart($event, chapter, volume.id, index)"
                      @dragend="handleDragEnd($event)"
                      @dragover.prevent="handleDragOver($event, volume.id, index)"
                      @drop="handleDrop($event, volume.id, index)"
                    >
                      <div class="chapter-content" @click="navigateToChapter(chapter)">
                        <i class="pi pi-bars drag-handle"></i>
                        <i class="pi pi-file chapter-icon"></i>
                        <span class="chapter-title">{{ getChapterDisplayTitle(chapter) }}</span>
                      </div>
                      <div class="chapter-actions" @click.stop>
                        <Button
                          icon="pi pi-pencil"
                          class="p-button-text p-button-sm p-button-rounded action-button"
                          size="small"
                          title="编辑"
                          @click="openEditChapterDialog(chapter)"
                        />
                        <Button
                          icon="pi pi-trash"
                          class="p-button-text p-button-sm p-button-rounded p-button-danger action-button"
                          size="small"
                          title="删除"
                          @click="openDeleteChapterConfirm(chapter)"
                        />
                      </div>
                    </div>
                  </div>
                </Transition>
              </div>
            </div>
          </div>
          <div v-else-if="!isPageLoading" class="empty-state">
            <p class="text-moon/60 text-sm">暂无卷和章节</p>
          </div>
        </div>

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
    <Dialog
      v-model:visible="showAddVolumeDialog"
      modal
      header="添加新卷"
      :style="{ width: '25rem' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <div class="space-y-2">
          <label for="volume-title" class="block text-sm font-medium text-moon/90">卷标题</label>
          <InputText
            id="volume-title"
            v-model="newVolumeTitle"
            placeholder="输入卷标题..."
            class="w-full"
            autofocus
            @keyup.enter="handleAddVolume"
          />
        </div>
      </div>
      <template #footer>
        <Button
          label="取消"
          class="p-button-text"
          :disabled="isAddingVolume"
          @click="showAddVolumeDialog = false"
        />
        <Button
          label="添加"
          :loading="isAddingVolume"
          :disabled="!newVolumeTitle.trim() || isAddingVolume"
          @click="handleAddVolume"
        />
      </template>
    </Dialog>

    <!-- 添加章节对话框 -->
    <Dialog
      v-model:visible="showAddChapterDialog"
      modal
      header="添加新章节"
      :style="{ width: '25rem' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <div class="space-y-2">
          <label for="volume-select" class="block text-sm font-medium text-moon/90">选择卷</label>
          <Select
            id="volume-select"
            v-model="selectedVolumeId"
            :options="volumeOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="请选择卷"
            class="w-full"
          />
        </div>
        <div class="space-y-2">
          <label for="chapter-title" class="block text-sm font-medium text-moon/90">章节标题</label>
          <InputText
            id="chapter-title"
            v-model="newChapterTitle"
            placeholder="输入章节标题..."
            class="w-full"
            autofocus
            @keyup.enter="handleAddChapter"
          />
        </div>
      </div>
      <template #footer>
        <Button
          label="取消"
          class="p-button-text"
          :disabled="isAddingChapter"
          @click="showAddChapterDialog = false"
        />
        <Button
          label="添加"
          :loading="isAddingChapter"
          :disabled="!newChapterTitle.trim() || !selectedVolumeId || isAddingChapter"
          @click="handleAddChapter"
        />
      </template>
    </Dialog>

    <!-- 编辑卷对话框 -->
    <Dialog
      v-model:visible="showEditVolumeDialog"
      modal
      header="编辑卷标题"
      :style="{ width: '30rem' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <div class="space-y-2">
          <label for="edit-volume-title" class="block text-sm font-medium text-moon/90"
            >卷标题（原文）*</label
          >
          <TranslatableInput
            id="edit-volume-title"
            v-model="editingVolumeTitle"
            placeholder="输入卷标题..."
            type="input"
            :apply-translation-to-input="false"
            @translation-applied="
              (value: string) => {
                editingVolumeTranslation = value;
              }
            "
            @keyup.enter="handleEditVolume"
          />
        </div>
        <div class="space-y-2">
          <label for="edit-volume-translation" class="block text-sm font-medium text-moon/90"
            >翻译</label
          >
          <InputText
            id="edit-volume-translation"
            v-model="editingVolumeTranslation"
            placeholder="输入翻译（可选）"
            class="w-full"
            @keyup.enter="handleEditVolume"
          />
        </div>
      </div>
      <template #footer>
        <Button
          label="取消"
          class="p-button-text"
          :disabled="isEditingVolume"
          @click="showEditVolumeDialog = false"
        />
        <Button
          label="保存"
          :loading="isEditingVolume"
          :disabled="!editingVolumeTitle.trim() || isEditingVolume"
          @click="handleEditVolume"
        />
      </template>
    </Dialog>

    <!-- 编辑章节对话框 -->
    <Dialog
      v-model:visible="showEditChapterDialog"
      modal
      header="编辑章节"
      :style="{ width: '30rem' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <div class="space-y-2">
          <label for="edit-chapter-title" class="block text-sm font-medium text-moon/90"
            >章节标题（原文）*</label
          >
          <TranslatableInput
            id="edit-chapter-title"
            v-model="editingChapterTitle"
            placeholder="输入章节标题..."
            type="input"
            :apply-translation-to-input="false"
            @translation-applied="
              (value: string) => {
                editingChapterTranslation = value;
              }
            "
            @keyup.enter="handleEditChapter"
          />
        </div>
        <div class="space-y-2">
          <label for="edit-chapter-translation" class="block text-sm font-medium text-moon/90"
            >翻译</label
          >
          <InputText
            id="edit-chapter-translation"
            v-model="editingChapterTranslation"
            placeholder="输入翻译（可选）"
            class="w-full"
            @keyup.enter="handleEditChapter"
          />
        </div>
        <div class="space-y-2" v-if="volumes.length > 0">
          <label for="edit-chapter-volume" class="block text-sm font-medium text-moon/90"
            >所属卷</label
          >
          <Select
            id="edit-chapter-volume"
            v-model="editingChapterTargetVolumeId"
            :options="volumeOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="选择卷"
            class="w-full"
          />
        </div>
      </div>
      <template #footer>
        <Button
          label="取消"
          class="p-button-text"
          :disabled="isEditingChapter"
          @click="showEditChapterDialog = false"
        />
        <Button
          label="保存"
          :loading="isEditingChapter"
          :disabled="
            !editingChapterTitle.trim() || !editingChapterTargetVolumeId || isEditingChapter
          "
          @click="handleEditChapter"
        />
      </template>
    </Dialog>

    <!-- 删除卷确认对话框 -->
    <Dialog
      v-model:visible="showDeleteVolumeConfirm"
      modal
      header="确认删除"
      :style="{ width: '25rem' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <p class="text-moon/90">
          确定要删除卷 <strong>"{{ deletingVolumeTitle }}"</strong> 吗？
        </p>
        <p class="text-sm text-moon/70">此操作将同时删除该卷下的所有章节，且无法撤销。</p>
      </div>
      <template #footer>
        <Button
          label="取消"
          class="p-button-text"
          :disabled="isDeletingVolume"
          @click="showDeleteVolumeConfirm = false"
        />
        <Button
          label="删除"
          class="p-button-danger"
          :loading="isDeletingVolume"
          :disabled="isDeletingVolume"
          @click="handleDeleteVolume"
        />
      </template>
    </Dialog>

    <!-- 删除章节确认对话框 -->
    <Dialog
      v-model:visible="showDeleteChapterConfirm"
      modal
      header="确认删除"
      :style="{ width: '25rem' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <p class="text-moon/90">
          确定要删除章节 <strong>"{{ deletingChapterTitle }}"</strong> 吗？
        </p>
        <p class="text-sm text-moon/70">此操作无法撤销。</p>
      </div>
      <template #footer>
        <Button
          label="取消"
          class="p-button-text"
          :disabled="isDeletingChapter"
          @click="showDeleteChapterConfirm = false"
        />
        <Button
          label="删除"
          class="p-button-danger"
          :loading="isDeletingChapter"
          :disabled="isDeletingChapter"
          @click="handleDeleteChapter"
        />
      </template>
    </Dialog>

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
    <Popover ref="termPopover" style="width: 24rem; max-width: 90vw">
      <div class="flex flex-col max-h-[60vh] overflow-hidden">
        <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
          <DataView :value="usedTerms" data-key="id" layout="list" class="term-popover-dataview">
            <template #header>
              <div class="p-3">
                <h4 class="font-medium text-moon-100">本章使用的术语</h4>
                <p class="text-xs text-moon/60 mt-1">共 {{ usedTermCount }} 个</p>
              </div>
            </template>
            <template #list="slotProps">
              <div class="flex flex-col gap-2 p-2">
                <div
                  v-for="term in slotProps.items"
                  :key="term.id"
                  class="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                >
                  <div class="flex justify-between items-start gap-2 min-w-0">
                    <div class="min-w-0 flex-1 overflow-hidden">
                      <div class="font-medium text-sm text-moon-90 break-words">
                        {{ term.name }}
                      </div>
                      <div class="text-xs text-primary-400 mt-0.5 break-words">
                        {{ term.translation.translation }}
                      </div>
                      <div
                        v-if="term.description"
                        class="text-xs text-moon/50 mt-1 line-clamp-2 break-words"
                      >
                        {{ term.description }}
                      </div>
                    </div>
                    <div class="flex gap-1 flex-shrink-0">
                      <Button
                        icon="pi pi-pencil"
                        class="p-button-text p-button-sm !p-1 !w-7 !h-7"
                        @click="openEditTermDialog(term)"
                      />
                      <Button
                        icon="pi pi-trash"
                        class="p-button-text p-button-danger p-button-sm !p-1 !w-7 !h-7"
                        @click="openDeleteTermConfirm(term)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </template>
            <template #empty>
              <div class="text-center py-8 text-moon/50 text-sm">本章暂无术语</div>
            </template>
          </DataView>
        </div>
      </div>
    </Popover>

    <!-- 角色设定列表 Popover -->
    <Popover ref="characterPopover" style="width: 24rem; max-width: 90vw">
      <div class="flex flex-col max-h-[60vh] overflow-hidden">
        <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
          <DataView
            :value="usedCharacters"
            data-key="id"
            layout="list"
            class="character-popover-dataview"
          >
            <template #header>
              <div class="p-3">
                <h4 class="font-medium text-moon-100">本章使用的角色设定</h4>
                <p class="text-xs text-moon/60 mt-1">共 {{ usedCharacterCount }} 个</p>
              </div>
            </template>
            <template #list="slotProps">
              <div class="flex flex-col gap-2 p-2">
                <div
                  v-for="character in slotProps.items"
                  :key="character.id"
                  class="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                >
                  <div class="flex justify-between items-start gap-2 min-w-0">
                    <div class="min-w-0 flex-1 overflow-hidden">
                      <div class="flex items-center gap-2">
                        <div class="font-medium text-sm text-moon-90 break-words">
                          {{ character.name }}
                        </div>
                        <span
                          v-if="character.sex"
                          class="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary-400"
                        >
                          {{
                            character.sex === 'male'
                              ? '男'
                              : character.sex === 'female'
                                ? '女'
                                : '其他'
                          }}
                        </span>
                      </div>
                      <div class="text-xs text-primary-400 mt-0.5 break-words">
                        {{ character.translation.translation }}
                      </div>
                      <div
                        v-if="character.description"
                        class="text-xs text-moon/50 mt-1 line-clamp-2 break-words"
                      >
                        {{ character.description }}
                      </div>
                      <div
                        v-if="character.aliases && character.aliases.length > 0"
                        class="text-xs text-moon/60 mt-1"
                      >
                        <span class="text-moon/50">别名：</span>
                        <span class="break-words">
                          {{ character.aliases.map((a: { name: string }) => a.name).join('、') }}
                        </span>
                      </div>
                    </div>
                    <div class="flex gap-1 flex-shrink-0">
                      <Button
                        icon="pi pi-pencil"
                        class="p-button-text p-button-sm !p-1 !w-7 !h-7"
                        @click="openEditCharacterDialog(character)"
                      />
                      <Button
                        icon="pi pi-trash"
                        class="p-button-text p-button-danger p-button-sm !p-1 !w-7 !h-7"
                        @click="openDeleteCharacterConfirm(character)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </template>
            <template #empty>
              <div class="text-center py-8 text-moon/50 text-sm">本章暂无角色设定</div>
            </template>
          </DataView>
        </div>
      </div>
    </Popover>

    <!-- 键盘快捷键 Popover -->
    <Popover ref="keyboardShortcutsPopover" style="width: 28rem; max-width: 90vw">
      <div class="flex flex-col max-h-[70vh] overflow-hidden">
        <div class="p-3 border-b border-white/10">
          <h4 class="font-medium text-moon-100">键盘快捷键</h4>
          <p class="text-xs text-moon/60 mt-1">本页面可用的所有快捷键</p>
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto">
          <div class="p-3 flex flex-col gap-4">
            <!-- 搜索相关 -->
            <div class="flex flex-col gap-2">
              <div class="text-xs font-medium text-moon/70 uppercase tracking-wide">搜索与替换</div>
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center justify-between py-1">
                  <span class="text-sm text-moon-90">打开/关闭查找</span>
                  <kbd
                    class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded"
                  >
                    Ctrl+F
                  </kbd>
                </div>
                <div class="flex items-center justify-between py-1">
                  <span class="text-sm text-moon-90">打开/关闭替换</span>
                  <kbd
                    class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded"
                  >
                    Ctrl+H
                  </kbd>
                </div>
                <div class="flex items-center justify-between py-1">
                  <span class="text-sm text-moon-90">下一个匹配</span>
                  <kbd
                    class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded"
                  >
                    F3
                  </kbd>
                </div>
                <div class="flex items-center justify-between py-1">
                  <span class="text-sm text-moon-90">上一个匹配</span>
                  <kbd
                    class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded"
                  >
                    Shift+F3
                  </kbd>
                </div>
                <div class="flex items-center justify-between py-1">
                  <span class="text-sm text-moon-90">关闭搜索工具栏</span>
                  <kbd
                    class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded"
                  >
                    Esc
                  </kbd>
                </div>
              </div>
            </div>

            <!-- 编辑相关 -->
            <div class="flex flex-col gap-2">
              <div class="text-xs font-medium text-moon/70 uppercase tracking-wide">编辑操作</div>
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center justify-between py-1">
                  <span class="text-sm text-moon-90">撤销</span>
                  <kbd
                    class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded"
                  >
                    Ctrl+Z
                  </kbd>
                </div>
                <div class="flex items-center justify-between py-1">
                  <span class="text-sm text-moon-90">重做</span>
                  <kbd
                    class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded"
                  >
                    Ctrl+Y
                  </kbd>
                </div>
                <div class="flex items-center justify-between py-1">
                  <span class="text-sm text-moon-90">复制所有已翻译文本</span>
                  <kbd
                    class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded"
                  >
                    Ctrl+Shift+C
                  </kbd>
                </div>
              </div>
            </div>

            <!-- 导航相关 -->
            <div class="flex flex-col gap-2">
              <div class="text-xs font-medium text-moon/70 uppercase tracking-wide">段落导航</div>
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center justify-between py-1">
                  <span class="text-sm text-moon-90">上一个段落</span>
                  <kbd
                    class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded"
                  >
                    ↑
                  </kbd>
                </div>
                <div class="flex items-center justify-between py-1">
                  <span class="text-sm text-moon-90">下一个段落</span>
                  <kbd
                    class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded"
                  >
                    ↓
                  </kbd>
                </div>
                <div class="flex items-center justify-between py-1">
                  <span class="text-sm text-moon-90">开始编辑当前段落</span>
                  <kbd
                    class="px-2 py-1 text-xs font-mono bg-white/10 border border-white/20 rounded"
                  >
                    Enter
                  </kbd>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Popover>

    <!-- 编辑术语对话框 -->
    <TermEditDialog
      v-model:visible="showEditTermDialog"
      mode="edit"
      :term="editingTerm"
      :loading="isSavingTerm"
      @save="handleSaveTerm"
    />

    <!-- 删除术语确认对话框 -->
    <Dialog
      v-model:visible="showDeleteTermConfirm"
      modal
      header="确认删除术语"
      :style="{ width: '25rem' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <p class="text-moon/90">
          确定要删除术语 <strong>"{{ deletingTerm?.name }}"</strong> 吗？
        </p>
        <p class="text-sm text-moon/70">此操作无法撤销。</p>
      </div>
      <template #footer>
        <Button
          label="取消"
          class="p-button-text"
          :disabled="isDeletingTerm"
          @click="showDeleteTermConfirm = false"
        />
        <Button
          label="删除"
          class="p-button-danger"
          :loading="isDeletingTerm"
          :disabled="isDeletingTerm"
          @click="confirmDeleteTerm"
        />
      </template>
    </Dialog>

    <!-- 编辑角色对话框 -->
    <CharacterEditDialog
      v-model:visible="showEditCharacterDialog"
      :character="editingCharacter"
      :loading="isSavingCharacter"
      @save="handleSaveCharacter"
    />

    <!-- 删除角色确认对话框 -->
    <Dialog
      v-model:visible="showDeleteCharacterConfirm"
      modal
      header="确认删除角色"
      :style="{ width: '25rem' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <p class="text-moon/90">
          确定要删除角色 <strong>"{{ deletingCharacter?.name }}"</strong> 吗？
        </p>
        <p class="text-sm text-moon/70">此操作无法撤销。</p>
      </div>
      <template #footer>
        <Button
          label="取消"
          class="p-button-text"
          :disabled="isDeletingCharacter"
          @click="showDeleteCharacterConfirm = false"
        />
        <Button
          label="删除"
          class="p-button-danger"
          :loading="isDeletingCharacter"
          :disabled="isDeletingCharacter"
          @click="confirmDeleteCharacter"
        />
      </template>
    </Dialog>

    <!-- 主内容区域 -->
    <div class="book-main-content" :class="{ 'overflow-hidden': !!selectedSettingMenu }">
      <!-- 章节阅读工具栏 -->
      <Menubar
        v-if="selectedChapter && !selectedSettingMenu"
        :model="[]"
        class="chapter-toolbar !border-none !rounded-none !bg-white/5 !backdrop-blur-md !border-b !border-white/10 !p-2 !px-6"
      >
        <template #start>
          <div class="flex items-center gap-3 overflow-hidden max-w-[15rem]">
            <span
              class="text-sm font-bold truncate opacity-90"
              :title="getChapterDisplayTitle(selectedChapter)"
            >
              {{ getChapterDisplayTitle(selectedChapter) }}
            </span>
          </div>
        </template>

        <template #end>
          <div class="flex items-center gap-2">
            <div class="w-px h-4 bg-white/20 mx-2"></div>

            <!-- 撤销/重做按钮 -->
            <div class="flex items-center gap-1 mr-2">
              <Button
                icon="pi pi-undo"
                rounded
                text
                size="small"
                class="!w-8 !h-8 text-moon/70 hover:text-moon"
                :disabled="!canUndo"
                :title="undoDescription ? `撤销: ${undoDescription}` : '撤销 (Ctrl+Z)'"
                @click="undo"
              />
              <Button
                icon="pi pi-redo"
                rounded
                text
                size="small"
                class="!w-8 !h-8 text-moon/70 hover:text-moon"
                :disabled="!canRedo"
                :title="redoDescription ? `重做: ${redoDescription}` : '重做 (Ctrl+Y)'"
                @click="redo"
              />
            </div>

            <div class="w-px h-4 bg-white/20 mx-2"></div>

            <!-- 编辑模式切换 -->
            <div class="flex items-center bg-white/5 rounded-lg p-1 gap-1 mr-2">
              <Button
                v-for="option in editModeOptions"
                :key="option.value"
                :icon="option.icon"
                :title="option.title"
                rounded
                text
                size="small"
                :class="[
                  '!w-8 !h-8',
                  editMode === option.value
                    ? '!bg-primary/20 !text-primary'
                    : 'text-moon/70 hover:text-moon',
                ]"
                @click="editMode = option.value"
              />
            </div>

            <!-- 规范化按钮 -->
            <Button
              icon="pi pi-code"
              rounded
              text
              size="small"
              class="!w-8 !h-8 text-moon/70 hover:text-moon"
              title="规范化符号：格式化本章所有翻译中的符号（引号、标点、空格等）"
              :disabled="!selectedChapter || !selectedChapterParagraphs.length"
              @click="normalizeChapterSymbols"
            />

            <div class="w-px h-4 bg-white/20 mx-2"></div>

            <!-- 导出按钮 -->
            <Button
              icon="pi pi-file-export"
              rounded
              text
              size="small"
              class="!w-8 !h-8 text-moon/70 hover:text-moon"
              title="导出章节内容"
              @click="toggleExportMenu"
            />

            <div class="w-px h-4 bg-white/20 mx-2"></div>

            <!-- 术语统计 -->
            <div class="relative inline-flex">
              <Button
                icon="pi pi-bookmark"
                rounded
                text
                size="small"
                class="!w-8 !h-8 text-moon/70 hover:text-moon"
                :title="`本章共使用了 ${usedTermCount} 个术语`"
                @click="toggleTermPopover"
              />
              <Badge
                v-if="usedTermCount > 0"
                :value="usedTermCount > 99 ? '99+' : usedTermCount"
                severity="info"
                class="absolute -top-1 -right-1 !min-w-[1.25rem] !h-[1.25rem] !text-[0.75rem] !p-0 flex items-center justify-center"
              />
            </div>

            <!-- 角色统计 -->
            <div class="relative inline-flex">
              <Button
                icon="pi pi-user"
                rounded
                text
                size="small"
                class="!w-8 !h-8 text-moon/70 hover:text-moon"
                :title="`本章共使用了 ${usedCharacterCount} 个角色设定`"
                @click="toggleCharacterPopover"
              />
              <Badge
                v-if="usedCharacterCount > 0"
                :value="usedCharacterCount > 99 ? '99+' : usedCharacterCount"
                severity="info"
                class="absolute -top-1 -right-1 !min-w-[1.25rem] !h-[1.25rem] !text-[0.75rem] !p-0 flex items-center justify-center"
              />
            </div>

            <div class="w-px h-4 bg-white/20 mx-2"></div>

            <!-- 翻译按钮 -->
            <Button
              v-if="translationStatus.hasNone"
              :label="translationButtonLabel"
              icon="pi pi-language"
              size="small"
              class="!px-3"
              :loading="isTranslatingChapter || isPolishingChapter"
              :disabled="
                isTranslatingChapter || isPolishingChapter || !selectedChapterParagraphs.length
              "
              @click="translationButtonClick"
            />
            <SplitButton
              v-else
              :label="translationButtonLabel"
              :icon="translationStatus.hasAll ? 'pi pi-sparkles' : 'pi pi-language'"
              size="small"
              class="!px-3"
              :loading="isTranslatingChapter || isPolishingChapter"
              :disabled="
                isTranslatingChapter || isPolishingChapter || !selectedChapterParagraphs.length
              "
              :model="translationButtonMenuItems"
              @click="translationButtonClick"
            />

            <div class="w-px h-4 bg-white/20 mx-2"></div>

            <!-- 搜索按钮 -->
            <Button
              :icon="isSearchVisible ? 'pi pi-search-minus' : 'pi pi-search'"
              rounded
              text
              size="small"
              class="!w-8 !h-8 text-moon/70 hover:text-moon"
              :class="{ '!bg-primary/20 !text-primary': isSearchVisible }"
              :title="isSearchVisible ? '关闭搜索 (Ctrl+F)' : '搜索与替换 (Ctrl+F)'"
              @click="toggleSearch"
            />

            <!-- 键盘快捷键按钮 -->
            <Button
              icon="pi pi-info-circle"
              rounded
              text
              size="small"
              class="!w-8 !h-8 text-moon/70 hover:text-moon"
              title="键盘快捷键"
              @click="toggleKeyboardShortcutsPopover"
            />
          </div>
        </template>
      </Menubar>

      <!-- 搜索工具栏 -->
      <SearchToolbar
        v-if="selectedChapter && !selectedSettingMenu"
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

      <div ref="scrollableContentRef" class="scrollable-content">
        <div
          class="page-container"
          :class="{ '!h-full !overflow-hidden !min-h-0 flex flex-col': !!selectedSettingMenu }"
        >
          <!-- 术语设置面板 -->
          <TerminologyPanel
            v-if="selectedSettingMenu === 'terms'"
            :book="book || null"
            class="flex-1 min-h-0"
          />

          <!-- 角色设置面板 -->
          <CharacterSettingPanel
            v-else-if="selectedSettingMenu === 'characters'"
            :book="book || null"
            class="flex-1 min-h-0"
          />

          <!-- 章节内容 -->
          <ChapterContentPanel
            v-else-if="selectedChapter"
            :selected-chapter="selectedChapter"
            :selected-chapter-with-content="selectedChapterWithContent"
            :selected-chapter-paragraphs="selectedChapterParagraphs"
            :is-loading-chapter-content="isLoadingChapterContent"
            :edit-mode="editMode"
            :original-text-edit-value="originalTextEditValue"
            :translated-char-count="translatedCharCount"
            :book="book || null"
            :book-id="bookId"
            :chapter-character-scores="chapterCharacterScores"
            :selected-chapter-id="selectedChapterId"
            :translating-paragraph-ids="translatingParagraphIds"
            :polishing-paragraph-ids="polishingParagraphIds"
            :search-query="searchQuery"
            :selected-paragraph-index="selectedParagraphIndex"
            :is-keyboard-selected="isKeyboardSelected"
            :is-click-selected="isClickSelected"
            :paragraph-card-refs="paragraphCardRefs"
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
            @select-translation="
              (paragraphId: string, translationId: string) =>
                selectParagraphTranslation(paragraphId, translationId)
            "
            @paragraph-click="handleParagraphClick"
            @paragraph-edit-start="handleParagraphEditStart"
            @paragraph-edit-stop="handleParagraphEditStop"
          />

          <!-- 未选择章节时的提示 -->
          <div v-else class="no-chapter-selected">
            <i class="pi pi-book-open no-selection-icon"></i>
            <p class="no-selection-text">请从左侧选择一个章节</p>
            <p class="no-selection-hint text-moon/60 text-sm">点击章节标题查看内容</p>
          </div>
        </div>
      </div>

      <!-- 翻译/润色进度工具栏 -->
      <TranslationProgress
        :is-translating="isTranslatingChapter"
        :is-polishing="isPolishingChapter"
        :progress="isPolishingChapter ? polishProgress : translationProgress"
        @cancel="isPolishingChapter ? cancelPolish() : cancelTranslation()"
      />
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

/* 左侧边栏 */
.book-sidebar {
  width: 20rem;
  min-width: 20rem;
  max-width: 20rem;
  border-right: 1px solid var(--white-opacity-10);
  background: var(--white-opacity-3);
  overflow-y: auto;
  overflow-x: hidden;
}

.sidebar-content {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.book-header {
  margin-bottom: 1.5rem;
}

.book-header-content {
  display: flex;
  gap: 0.75rem;
  align-items: stretch;
  margin-bottom: 0.75rem;
  padding: 0.75rem;
  background: var(--white-opacity-5);
  border: 1px solid var(--white-opacity-10);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.book-header-content:hover {
  background: var(--white-opacity-8);
  border-color: var(--primary-opacity-30);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px var(--black-opacity-10);
}

.book-edit-icon {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
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
  width: 4rem;
  aspect-ratio: 2/3;
  overflow: hidden;
  border-radius: 8px;
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
  justify-content: space-between;
}

.book-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--moon-opacity-95);
  line-height: 1.4;
  text-align: left;
  word-break: break-word;
  margin: 0;
}

.book-stats {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--moon-opacity-80);
  font-size: 0.8125rem;
}

/* 统一颜色主题 - 使用渐变色系 */
.stat-item .stat-icon {
  color: #60a5fa; /* blue-400 */
  font-size: 0.75rem;
}

.stat-item .stat-value {
  color: #93c5fd; /* blue-300 */
  font-weight: 600;
}

.stat-item .stat-label {
  color: #bfdbfe; /* blue-200 */
  font-size: 0.75rem;
}

.stat-separator {
  color: var(--moon-opacity-40);
  font-size: 0.75rem;
  user-select: none;
}

.book-separator {
  width: 100%;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--white-opacity-20), transparent);
  margin-bottom: 0.75rem;
}

.sidebar-title-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.sidebar-title {
  font-size: 0.875rem;
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

.volumes-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}

/* 加载状态 */
.volumes-loading {
  padding: 1rem;
}

.volumes-loading .mb-2 {
  margin-bottom: 0.5rem;
}

.volumes-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.volume-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.volume-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--white-opacity-5);
  border: 1px solid var(--white-opacity-10);
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--moon-opacity-90);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.volume-header:hover {
  background: var(--white-opacity-8);
  border-color: var(--primary-opacity-30);
}

.volume-header-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.volume-actions {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.volume-header:hover .volume-actions {
  opacity: 1;
}

.action-button {
  min-width: 1.5rem !important;
  width: 1.5rem !important;
  height: 1.5rem !important;
  padding: 0 !important;
}

.action-button .p-button-icon {
  font-size: 0.75rem !important;
}

.volume-toggle-icon {
  font-size: 0.75rem;
  color: var(--moon-opacity-70);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
}

.volume-icon {
  font-size: 0.75rem;
  color: var(--primary-opacity-70);
  flex-shrink: 0;
}

.volume-title {
  flex: 1;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.volume-chapter-count {
  font-size: 0.75rem;
  color: var(--moon-opacity-70);
  font-weight: 400;
}

.chapters-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-left: 1rem;
  padding-left: 0.75rem;
  border-left: 1px solid var(--white-opacity-10);
}

.chapter-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 0.8125rem;
  color: var(--moon-opacity-80);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: move;
}

.chapter-item:hover {
  background: var(--primary-opacity-15);
  color: var(--moon-opacity-95);
  border-color: var(--primary-opacity-30);
  transform: translateX(2px);
}

.chapter-item.dragging {
  opacity: 0.5;
  cursor: grabbing;
}

.chapter-item.drag-over {
  background: var(--primary-opacity-20) !important;
  border-color: var(--primary-opacity-50) !important;
  border-style: dashed !important;
}

.chapter-item-selected {
  background: var(--primary-opacity-15) !important;
  border-color: var(--primary-opacity-40) !important;
  color: var(--moon-opacity-95) !important;
}

.chapter-item-selected .chapter-icon {
  color: var(--primary-opacity-90) !important;
}

.chapters-list.drag-over {
  background: var(--primary-opacity-10);
  border-radius: 6px;
  border: 2px dashed var(--primary-opacity-40);
}

.chapter-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.drag-handle {
  font-size: 0.75rem;
  color: var(--moon-opacity-50);
  cursor: grab;
  flex-shrink: 0;
  transition: color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.chapter-item:hover .drag-handle {
  color: var(--primary-opacity-70);
}

.chapter-item.dragging .drag-handle {
  cursor: grabbing;
}

.chapter-actions {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.chapter-item:hover .chapter-actions {
  opacity: 1;
}

.chapter-icon {
  font-size: 0.75rem;
  color: var(--primary-opacity-60);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.chapter-item:hover .chapter-icon {
  color: var(--primary-opacity-85);
  transform: scale(1.1);
}

.chapter-content .chapter-title {
  flex: 1;
  font-size: inherit;
}

/* 折叠/展开动画 */
.slide-down-enter-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.slide-down-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.slide-down-enter-from {
  opacity: 0;
  max-height: 0;
  transform: translateY(-10px);
}

.slide-down-enter-to {
  opacity: 1;
  max-height: 1000px;
  transform: translateY(0);
}

.slide-down-leave-from {
  opacity: 1;
  max-height: 1000px;
  transform: translateY(0);
}

.slide-down-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-10px);
}

.empty-state {
  padding: 2rem 1rem;
  text-align: center;
}

/* 设置菜单 */
.settings-menu-wrapper {
  margin-top: -1rem;
  margin-bottom: 1.5rem;
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
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
}

.settings-menu-separator {
  width: 100%;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--white-opacity-20), transparent);
}

.settings-menu-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.75rem 1rem;
  background: var(--white-opacity-5);
  border: 1px solid var(--white-opacity-10);
  border-radius: 8px;
  font-size: 0.875rem;
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
  transform: translateX(2px);
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
  font-size: 0.875rem;
  color: var(--primary-opacity-70);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
}

.settings-menu-item:hover .settings-menu-icon {
  color: var(--primary-opacity-90);
  transform: scale(1.1);
}

.settings-menu-label {
  flex: 1;
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

/* Term Popover DataView - ensure header stays fixed and content scrolls */
:deep(.term-popover-dataview),
:deep(.character-popover-dataview) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
  background: transparent !important;
}

:deep(.term-popover-dataview .p-dataview-content),
:deep(.character-popover-dataview .p-dataview-content) {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  background: transparent !important;
}
</style>
