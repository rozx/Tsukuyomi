import { defineStore, acceptHMRUpdate } from 'pinia';
import { getDB } from 'src/utils/indexed-db';

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
 * 从 IndexedDB 加载状态
 */
async function loadStateFromDB(): Promise<BookDetailsUiState> {
  try {
    const db = await getDB();
    const stored = await db.get('book-details-ui', 'state');
    if (stored) {
      const { key: _key, ...state } = stored;
      return state;
    }
  } catch (error) {
    console.error('Failed to load book details UI state from DB:', error);
  }
  return {
    expandedVolumes: {},
    selectedChapter: {},
  };
}

/**
 * 保存状态到 IndexedDB
 */
async function saveStateToDB(state: BookDetailsUiState): Promise<void> {
  try {
    const db = await getDB();
    await db.put('book-details-ui', {
      key: 'state',
      ...state,
    });
  } catch (error) {
    console.error('Failed to save book details UI state to DB:', error);
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
     * 从 IndexedDB 加载状态
     */
    async loadState(): Promise<void> {
      if (this.isLoaded) {
        return;
      }

      const state = await loadStateFromDB();
      this.expandedVolumes = state.expandedVolumes;
      this.selectedChapter = state.selectedChapter;
      this.isLoaded = true;
    },

    /**
     * 切换卷的展开/折叠状态
     */
    async toggleVolume(bookId: string, volumeId: string): Promise<void> {
      const volumeIds = this.expandedVolumes[bookId] || [];
      const index = volumeIds.indexOf(volumeId);
      if (index > -1) {
        volumeIds.splice(index, 1);
      } else {
        volumeIds.push(volumeId);
      }
      this.expandedVolumes[bookId] = volumeIds;
      await saveStateToDB({
        expandedVolumes: this.expandedVolumes,
        selectedChapter: this.selectedChapter,
      });
    },

    /**
     * 设置卷的展开状态
     */
    async setVolumeExpanded(bookId: string, volumeId: string, expanded: boolean): Promise<void> {
      const volumeIds = this.expandedVolumes[bookId] || [];
      const index = volumeIds.indexOf(volumeId);
      if (expanded && index === -1) {
        volumeIds.push(volumeId);
      } else if (!expanded && index > -1) {
        volumeIds.splice(index, 1);
      }
      this.expandedVolumes[bookId] = volumeIds;
      await saveStateToDB({
        expandedVolumes: this.expandedVolumes,
        selectedChapter: this.selectedChapter,
      });
    },

    /**
     * 展开所有卷
     */
    async expandAllVolumes(bookId: string, volumeIds: string[]): Promise<void> {
      this.expandedVolumes[bookId] = [...volumeIds];
      await saveStateToDB({
        expandedVolumes: this.expandedVolumes,
        selectedChapter: this.selectedChapter,
      });
    },

    /**
     * 折叠所有卷
     */
    async collapseAllVolumes(bookId: string): Promise<void> {
      this.expandedVolumes[bookId] = [];
      await saveStateToDB({
        expandedVolumes: this.expandedVolumes,
        selectedChapter: this.selectedChapter,
      });
    },

    /**
     * 设置选中的章节
     */
    async setSelectedChapter(bookId: string, chapterId: string | null): Promise<void> {
      this.selectedChapter[bookId] = chapterId;
      await saveStateToDB({
        expandedVolumes: this.expandedVolumes,
        selectedChapter: this.selectedChapter,
      });
    },

    /**
     * 清除指定书籍的状态（当书籍被删除时）
     */
    async clearBookState(bookId: string): Promise<void> {
      delete this.expandedVolumes[bookId];
      delete this.selectedChapter[bookId];
      await saveStateToDB({
        expandedVolumes: this.expandedVolumes,
        selectedChapter: this.selectedChapter,
      });
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useBookDetailsStore, import.meta.hot));
}



