import { defineStore, acceptHMRUpdate } from 'pinia';

const STORAGE_KEY = 'tsukuyomi-book-details-ui';

/**
 * TranslationProgress 组件的默认状态
 */
const DEFAULT_TRANSLATION_PROGRESS_STATE = {
  autoScrollEnabled: {},
  autoTabSwitchingEnabled: {},
  taskFolded: {},
  activeTab: {},
} as const;

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
  // TranslationProgress 组件的 toggle 状态
  translationProgress: {
    // 每个任务的自动滚动状态
    autoScrollEnabled: Record<string, boolean>;
    // 每个任务的自动标签页切换状态
    autoTabSwitchingEnabled: Record<string, boolean>;
    // 每个任务的折叠状态
    taskFolded: Record<string, boolean>;
    // 每个任务的活动标签页
    activeTab: Record<string, string>;
  };
}

/**
 * 从 localStorage 加载状态
 */
function loadStateFromStorage(): BookDetailsUiState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // 确保向后兼容性：如果旧数据没有某些字段，提供默认值
      return {
        expandedVolumes: parsed.expandedVolumes || {},
        selectedChapter: parsed.selectedChapter || {},
        showTranslationProgress: parsed.showTranslationProgress || {},
        translationProgress: parsed.translationProgress || { ...DEFAULT_TRANSLATION_PROGRESS_STATE },
      };
    }
  } catch (error) {
    console.error('Failed to load book details UI state from storage:', error);
  }
  return {
    expandedVolumes: {},
    selectedChapter: {},
    showTranslationProgress: {},
    translationProgress: { ...DEFAULT_TRANSLATION_PROGRESS_STATE },
  };
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

export const useBookDetailsStore = defineStore('book-details', {
  state: (): BookDetailsUiState & { isLoaded: boolean } => ({
    expandedVolumes: {},
    selectedChapter: {},
    showTranslationProgress: {},
    translationProgress: { ...DEFAULT_TRANSLATION_PROGRESS_STATE },
    isLoaded: false,
  }),

  getters: {
    /**
     * 获取指定书籍的展开卷 ID 集合
     */
    getExpandedVolumes: (state) => {
      return (bookId: string): Set<string> => {
        const volumeIds = state.expandedVolumes[bookId] || [];
        return new Set(volumeIds);
      };
    },

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

    /**
     * 获取指定书籍的翻译进度面板显示状态
     */
    getShowTranslationProgress: (state) => {
      return (bookId: string): boolean => {
        return state.showTranslationProgress[bookId] || false;
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
     * 设置卷的展开状态
     */
    setVolumeExpanded(bookId: string, volumeId: string, expanded: boolean): void {
      const volumeIds = this.expandedVolumes[bookId] || [];
      const index = volumeIds.indexOf(volumeId);
      if (expanded && index === -1) {
        volumeIds.push(volumeId);
      } else if (!expanded && index > -1) {
        volumeIds.splice(index, 1);
      }
      this.expandedVolumes[bookId] = volumeIds;
      this.saveAllState();
    },

    /**
     * 展开所有卷
     */
    expandAllVolumes(bookId: string, volumeIds: string[]): void {
      this.expandedVolumes[bookId] = [...volumeIds];
      this.saveAllState();
    },

    /**
     * 折叠所有卷
     */
    collapseAllVolumes(bookId: string): void {
      this.expandedVolumes[bookId] = [];
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
     * 设置翻译进度面板显示状态
     */
    setShowTranslationProgress(bookId: string, show: boolean): void {
      this.showTranslationProgress[bookId] = show;
      this.saveAllState();
    },

    /**
     * 切换翻译进度面板显示状态
     */
    toggleShowTranslationProgress(bookId: string): void {
      const current = this.showTranslationProgress[bookId] || false;
      this.setShowTranslationProgress(bookId, !current);
    },

    /**
     * 清除指定书籍的状态（当书籍被删除时）
     */
    clearBookState(bookId: string): void {
      delete this.expandedVolumes[bookId];
      delete this.selectedChapter[bookId];
      delete this.showTranslationProgress[bookId];
      this.saveAllState();
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
     * 设置任务的自动标签页切换状态
     */
    setTranslationProgressAutoTabSwitching(taskId: string, enabled: boolean): void {
      this.translationProgress.autoTabSwitchingEnabled[taskId] = enabled;
      this.saveTranslationProgressState();
    },

    /**
     * 设置任务的折叠状态
     */
    setTranslationProgressTaskFolded(taskId: string, folded: boolean): void {
      this.translationProgress.taskFolded[taskId] = folded;
      this.saveTranslationProgressState();
    },

    /**
     * 设置任务的活动标签页
     */
    setTranslationProgressActiveTab(taskId: string, tab: string): void {
      this.translationProgress.activeTab[taskId] = tab;
      this.saveTranslationProgressState();
    },

    /**
     * 清除任务的活动标签页
     */
    clearTranslationProgressActiveTab(taskId: string): void {
      delete this.translationProgress.activeTab[taskId];
      this.saveTranslationProgressState();
    },

    /**
     * 保存 TranslationProgress 状态（内部使用 saveAllState）
     */
    saveTranslationProgressState(): void {
      this.saveAllState();
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useBookDetailsStore, import.meta.hot));
}



