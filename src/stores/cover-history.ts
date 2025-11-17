import { defineStore, acceptHMRUpdate } from 'pinia';
import type { CoverHistoryItem, CoverImage } from 'src/types/novel';

const STORAGE_KEY = 'luna-ai-cover-history';

/**
 * 从本地存储加载封面历史
 */
function loadCoverHistoryFromStorage(): CoverHistoryItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const history = JSON.parse(stored) as CoverHistoryItem[];
      // 将日期字符串转换回 Date 对象
      return history.map((item) => ({
        ...item,
        addedAt: new Date(item.addedAt),
      }));
    }
  } catch (error) {
    console.error('Failed to load cover history from storage:', error);
  }
  return [];
}

/**
 * 保存封面历史到本地存储
 */
function saveCoverHistoryToStorage(history: CoverHistoryItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Failed to save cover history to storage:', error);
  }
}

export const useCoverHistoryStore = defineStore('coverHistory', {
  state: () => ({
    covers: loadCoverHistoryFromStorage(),
  }),

  getters: {
    /**
     * 获取所有封面（按添加时间倒序）
     */
    allCovers: (state): CoverHistoryItem[] => {
      return [...state.covers].sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());
    },
  },

  actions: {
    /**
     * 添加封面到历史记录
     */
    addCover(cover: CoverImage): void {
      // 检查是否已存在（通过 URL）
      const existingIndex = this.covers.findIndex((c) => c.url === cover.url);

      if (existingIndex > -1) {
        // 如果已存在，更新添加时间
        const existingCover = this.covers[existingIndex];
        if (existingCover) {
          existingCover.addedAt = new Date();
        }
      } else {
        // 如果不存在，添加新记录
        const newItem: CoverHistoryItem = {
          ...cover,
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          addedAt: new Date(),
        };
        this.covers.push(newItem);
      }

      saveCoverHistoryToStorage(this.covers);
    },

    /**
     * 从历史记录中删除封面
     */
    removeCover(id: string): void {
      const index = this.covers.findIndex((c) => c.id === id);
      if (index > -1) {
        this.covers.splice(index, 1);
        saveCoverHistoryToStorage(this.covers);
      }
    },

    /**
     * 清空所有封面历史
     */
    clearHistory(): void {
      this.covers = [];
      saveCoverHistoryToStorage(this.covers);
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCoverHistoryStore, import.meta.hot));
}
