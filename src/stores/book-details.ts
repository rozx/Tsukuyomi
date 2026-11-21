import { defineStore, acceptHMRUpdate } from 'pinia';

const STORAGE_KEY = 'tsukuyomi-book-details-ui';

/**
 * 任务详细过程（任务中心展开行）的默认界面状态
 */
const DEFAULT_TRANSLATION_PROGRESS_STATE = {
  autoScrollEnabled: {} as Record<string, boolean>,
  todoCollapsed: false,
};

/**
 * 书籍详情页面 UI 状态
 */
interface BookDetailsUiState {
  // 每个书籍的展开卷 ID 集合
  expandedVolumes: Record<string, string[]>;
  // 每个书籍的选中章节 ID
  selectedChapter: Record<string, string | null>;
  // 每个书籍的翻译进度面板显示状态
  showTranslationProgress: Record<string, boolean>;
  // 任务详细过程（任务中心展开行）的 UI 状态
  translationProgress: {
    // 每个任务的自动滚动状态
    autoScrollEnabled: Record<string, boolean>;
    // 待办区域折叠状态
    todoCollapsed: boolean;
  };
}

/**
 * 从 localStorage 加载状态
 */
type PersistedBookDetailsShape = Partial<
  BookDetailsUiState & {
    translationProgress?: Partial<BookDetailsUiState['translationProgress']>;
  }
>;

function buildEmptyBookDetailsState(): BookDetailsUiState {
  return {
    expandedVolumes: {},
    selectedChapter: {},
    showTranslationProgress: {},
    translationProgress: { ...DEFAULT_TRANSLATION_PROGRESS_STATE },
  };
}

function mergeTranslationProgress(
  tp: Partial<BookDetailsUiState['translationProgress']> = {},
): BookDetailsUiState['translationProgress'] {
  return {
    autoScrollEnabled: tp.autoScrollEnabled || {},
    todoCollapsed: tp.todoCollapsed || false,
  };
}

function mergeStoredBookDetailsState(parsed: PersistedBookDetailsShape): BookDetailsUiState {
  return {
    expandedVolumes: parsed.expandedVolumes || {},
    selectedChapter: parsed.selectedChapter || {},
    showTranslationProgress: parsed.showTranslationProgress || {},
    translationProgress: mergeTranslationProgress(parsed.translationProgress),
  };
}

function loadStateFromStorage(): BookDetailsUiState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return buildEmptyBookDetailsState();
    return mergeStoredBookDetailsState(JSON.parse(stored) as PersistedBookDetailsShape);
  } catch (error) {
    console.error('Failed to load book details UI state from storage:', error);
    return buildEmptyBookDetailsState();
  }
}

/**
 * 保存状态到 localStorage
 */
function saveStateToStorage(state: BookDetailsUiState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save book details UI state to storage:', error);
  }
}

export interface PendingParagraphTarget {
  bookId: string;
  chapterId: string;
  paragraphId: string;
}

export const useBookDetailsStore = defineStore('book-details', {
  state: (): BookDetailsUiState & {
    isLoaded: boolean;
    pendingParagraphTarget: PendingParagraphTarget | null;
  } => ({
    expandedVolumes: {},
    selectedChapter: {},
    showTranslationProgress: {},
    translationProgress: { ...DEFAULT_TRANSLATION_PROGRESS_STATE },
    isLoaded: false,
    pendingParagraphTarget: null,
  }),

  getters: {
    /**
     * 检查指定卷是否展开
     */
    isVolumeExpanded: (state) => {
      return (bookId: string, volumeId: string): boolean => {
        const volumeIds = state.expandedVolumes[bookId] || [];
        return volumeIds.includes(volumeId);
      };
    },

    /**
     * 获取指定书籍的选中章节 ID
     */
    getSelectedChapter: (state) => {
      return (bookId: string): string | null => {
        return state.selectedChapter[bookId] || null;
      };
    },
  },

  actions: {
    /**
     * 从 localStorage 加载状态
     */
    loadState(): void {
      if (this.isLoaded) {
        return;
      }

      const state = loadStateFromStorage();
      this.expandedVolumes = state.expandedVolumes;
      this.selectedChapter = state.selectedChapter;
      this.showTranslationProgress = state.showTranslationProgress;
      this.translationProgress = state.translationProgress;
      this.isLoaded = true;
    },

    /**
     * 切换卷的展开/折叠状态
     */
    toggleVolume(bookId: string, volumeId: string): void {
      const volumeIds = this.expandedVolumes[bookId] || [];
      const index = volumeIds.indexOf(volumeId);
      if (index > -1) {
        volumeIds.splice(index, 1);
      } else {
        volumeIds.push(volumeId);
      }
      this.expandedVolumes[bookId] = volumeIds;
      this.saveAllState();
    },

    /**
     * 设置选中的章节
     */
    setSelectedChapter(bookId: string, chapterId: string | null): void {
      this.selectedChapter[bookId] = chapterId;
      this.saveAllState();
    },

    /**
     * 请求书籍详情页打开指定章节后定位并滚动到目标段落（仅会话内存态，不持久化）
     */
    requestParagraphNavigation(target: PendingParagraphTarget): void {
      this.pendingParagraphTarget = { ...target };
    },

    /**
     * 消费或清空待定位的段落导航请求
     */
    clearPendingParagraphNavigation(): void {
      this.pendingParagraphTarget = null;
    },

    /**
     * 保存所有状态到 localStorage
     */
    saveAllState(): void {
      saveStateToStorage({
        expandedVolumes: this.expandedVolumes,
        selectedChapter: this.selectedChapter,
        showTranslationProgress: this.showTranslationProgress,
        translationProgress: this.translationProgress,
      });
    },

    /**
     * 设置任务的自动滚动状态
     */
    setTranslationProgressAutoScroll(taskId: string, enabled: boolean): void {
      this.translationProgress.autoScrollEnabled[taskId] = enabled;
      this.saveTranslationProgressState();
    },

    /**
     * 切换待办区域折叠状态
     */
    toggleTodoCollapsed(): void {
      this.translationProgress.todoCollapsed = !this.translationProgress.todoCollapsed;
      this.saveTranslationProgressState();
    },

    /**
     * 保存 TranslationProgress 状态（内部使用 saveAllState）
     */
    saveTranslationProgressState(): void {
      this.saveAllState();
    },

    /**
     * 清理废弃的 taskId 状态，需传入当前有效的 taskId 集合
     */
    cleanupStaleTaskState(activeTaskIds?: Set<string>): void {
      if (!activeTaskIds) return;
      const tp = this.translationProgress;
      let changed = false;

      for (const taskId of Object.keys(tp.autoScrollEnabled)) {
        if (!activeTaskIds.has(taskId)) {
          delete tp.autoScrollEnabled[taskId];
          changed = true;
        }
      }

      if (changed) this.saveAllState();
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useBookDetailsStore, import.meta.hot));
}
