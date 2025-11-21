import { defineStore, acceptHMRUpdate } from 'pinia';

const STORAGE_KEY = 'luna-ai-book-details-ui';

/**
 * 书籍详情页面 UI 状态
 */
interface BookDetailsUiState {
  // 每个书籍的展开卷 ID 集合
  expandedVolumes: Record<string, string[]>;
  // 每个书籍的选中章节 ID
  selectedChapter: Record<string, string | null>;
}

/**
 * 从 localStorage 加载状态
 */
function loadStateFromStorage(): BookDetailsUiState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to load book details UI state from storage:', error);
  }
  return {
    expandedVolumes: {},
    selectedChapter: {},
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
      saveStateToStorage({
        expandedVolumes: this.expandedVolumes,
        selectedChapter: this.selectedChapter,
      });
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
      saveStateToStorage({
        expandedVolumes: this.expandedVolumes,
        selectedChapter: this.selectedChapter,
      });
    },

    /**
     * 展开所有卷
     */
    expandAllVolumes(bookId: string, volumeIds: string[]): void {
      this.expandedVolumes[bookId] = [...volumeIds];
      saveStateToStorage({
        expandedVolumes: this.expandedVolumes,
        selectedChapter: this.selectedChapter,
      });
    },

    /**
     * 折叠所有卷
     */
    collapseAllVolumes(bookId: string): void {
      this.expandedVolumes[bookId] = [];
      saveStateToStorage({
        expandedVolumes: this.expandedVolumes,
        selectedChapter: this.selectedChapter,
      });
    },

    /**
     * 设置选中的章节
     */
    setSelectedChapter(bookId: string, chapterId: string | null): void {
      this.selectedChapter[bookId] = chapterId;
      saveStateToStorage({
        expandedVolumes: this.expandedVolumes,
        selectedChapter: this.selectedChapter,
      });
    },

    /**
     * 清除指定书籍的状态（当书籍被删除时）
     */
    clearBookState(bookId: string): void {
      delete this.expandedVolumes[bookId];
      delete this.selectedChapter[bookId];
      saveStateToStorage({
        expandedVolumes: this.expandedVolumes,
        selectedChapter: this.selectedChapter,
      });
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useBookDetailsStore, import.meta.hot));
}



