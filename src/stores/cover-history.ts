import { defineStore, acceptHMRUpdate } from 'pinia';
import type { CoverHistoryItem, CoverImage } from 'src/models/novel';
import { getDB } from 'src/utils/indexed-db';
import { useSettingsStore } from 'src/stores/settings';

/**
 * 从 IndexedDB 加载封面历史
 */
async function loadCoverHistoryFromDB(): Promise<CoverHistoryItem[]> {
  try {
    const db = await getDB();
    const history = await db.getAll('cover-history');
    // 将日期字符串转换回 Date 对象
    return history.map((item) => ({
      ...item,
      addedAt: item.addedAt instanceof Date ? item.addedAt : new Date(item.addedAt),
    }));
  } catch (error) {
    console.error('Failed to load cover history from DB:', error);
    return [];
  }
}

/**
 * 保存单个封面历史到 IndexedDB
 */
async function saveCoverHistoryItemToDB(item: CoverHistoryItem): Promise<void> {
  try {
    const db = await getDB();
    // 创建一个纯净的对象以避免 Proxy 相关的克隆错误
    // 使用 structuredClone 进行深拷贝，或者手动构建对象
    const plainItem: CoverHistoryItem = {
      id: item.id,
      url: item.url,
      addedAt: item.addedAt,
      ...(item.deleteUrl ? { deleteUrl: item.deleteUrl } : {}),
    };
    await db.put('cover-history', plainItem);
  } catch (error) {
    console.error('Failed to save cover history item to DB:', error);
  }
}

/**
 * 从 IndexedDB 删除封面历史
 */
async function deleteCoverHistoryItemFromDB(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('cover-history', id);
  } catch (error) {
    console.error('Failed to delete cover history item from DB:', error);
  }
}

export const useCoverHistoryStore = defineStore('coverHistory', {
  state: () => ({
    covers: [] as CoverHistoryItem[],
    isLoaded: false,
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
     * 从 IndexedDB 加载封面历史
     */
    async loadCoverHistory(): Promise<void> {
      if (this.isLoaded) {
        return;
      }

      this.covers = await loadCoverHistoryFromDB();
      this.isLoaded = true;
    },

    /**
     * 添加封面到历史记录
     */
    async addCover(cover: CoverImage): Promise<void> {
      // 检查是否已存在（通过 URL）
      const existingIndex = this.covers.findIndex((c) => c.url === cover.url);

      if (existingIndex > -1) {
        // 如果已存在，更新添加时间
        const existingCover = this.covers[existingIndex];
        if (existingCover) {
          existingCover.addedAt = new Date();
          await saveCoverHistoryItemToDB(existingCover);
        }
      } else {
        // 如果不存在，添加新记录
        const newItem: CoverHistoryItem = {
          ...cover,
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          addedAt: new Date(),
        };
        this.covers.push(newItem);
        await saveCoverHistoryItemToDB(newItem);
      }
    },

    /**
     * 从历史记录中删除封面
     */
    async removeCover(id: string): Promise<void> {
      const index = this.covers.findIndex((c) => c.id === id);
      if (index > -1) {
        const coverUrl = this.covers[index]?.url;
        this.covers.splice(index, 1);
        await deleteCoverHistoryItemFromDB(id);

        // 记录到删除列表
        const settingsStore = useSettingsStore();
        const gistSync = settingsStore.gistSync;
        const deletedCoverIds = gistSync.deletedCoverIds || [];
        const deletedCoverUrls = gistSync.deletedCoverUrls || [];
        
        // 检查是否已存在（避免重复）
        if (!deletedCoverIds.find((record) => record.id === id)) {
          deletedCoverIds.push({
            id,
            deletedAt: Date.now(),
          });
          await settingsStore.updateGistSync({
            deletedCoverIds,
          });
        }

        // 同时按 URL 记录删除（跨设备：同一 URL 可能拥有不同的 id）
        const normalizedUrl = typeof coverUrl === 'string' ? coverUrl.trim() : '';
        if (normalizedUrl.length > 0) {
          if (!deletedCoverUrls.find((record) => record.url === normalizedUrl)) {
            deletedCoverUrls.push({
              url: normalizedUrl,
              deletedAt: Date.now(),
            });
            await settingsStore.updateGistSync({
              deletedCoverUrls,
            });
          }
        }
      }
    },

    /**
     * 清空所有封面历史
     */
    async clearHistory(): Promise<void> {
      const db = await getDB();
      await db.clear('cover-history');
      this.covers = [];
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCoverHistoryStore, import.meta.hot));
}
