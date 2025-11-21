import { defineStore, acceptHMRUpdate } from 'pinia';
import { getDB } from 'src/utils/indexed-db';

export interface ToastHistoryItem {
  id: string;
  severity: 'success' | 'error' | 'info' | 'warn';
  summary: string;
  detail: string;
  timestamp: number;
  life?: number;
  read?: boolean; // 标记该 toast 是否已被关闭/标记为已读
}

const MAX_HISTORY_ITEMS = 100;

/**
 * 从 IndexedDB 加载 Toast 历史记录
 */
async function loadHistoryFromDB(): Promise<ToastHistoryItem[]> {
  try {
    const db = await getDB();
    const items = await db.getAll('toast-history');
    // 确保所有旧数据都有 read 属性（向后兼容）
    return items.map((item) => ({
      ...item,
      read: item.read ?? false,
    }));
  } catch (error) {
    console.error('Failed to load toast history from DB:', error);
    return [];
  }
}

/**
 * 保存单个 Toast 历史记录到 IndexedDB
 */
async function saveHistoryItemToDB(item: ToastHistoryItem): Promise<void> {
  try {
    const db = await getDB();
    await db.put('toast-history', item);
  } catch (error) {
    console.error('Failed to save toast history item to DB:', error);
  }
}

/**
 * 从 IndexedDB 删除 Toast 历史记录
 */
async function deleteHistoryItemFromDB(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('toast-history', id);
  } catch (error) {
    console.error('Failed to delete toast history item from DB:', error);
  }
}

/**
 * 批量保存 Toast 历史记录到 IndexedDB
 */
async function bulkSaveHistoryToDB(items: ToastHistoryItem[]): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('toast-history', 'readwrite');
    const store = tx.objectStore('toast-history');

    for (const item of items) {
      await store.put(item);
    }

    await tx.done;
  } catch (error) {
    console.error('Failed to bulk save toast history to DB:', error);
  }
}

/**
 * 从 IndexedDB 加载最后查看时间戳
 */
async function loadLastViewedTimestampFromDB(): Promise<number> {
  try {
    const db = await getDB();
    const stored = await db.get('toast-last-viewed', 'last-viewed');
    if (stored) {
      return stored.timestamp;
    }
  } catch (error) {
    console.error('Failed to load last viewed timestamp from DB:', error);
  }
  return 0;
}

/**
 * 保存最后查看时间戳到 IndexedDB
 */
async function saveLastViewedTimestampToDB(timestamp: number): Promise<void> {
  try {
    const db = await getDB();
    await db.put('toast-last-viewed', {
      key: 'last-viewed',
      timestamp,
    });
  } catch (error) {
    console.error('Failed to save last viewed timestamp to DB:', error);
  }
}

// 用于将 toast 消息映射到时间戳的 Map (使用 summary + detail 作为 key)
// 注意：Map 不能存储在 Pinia state 中，因为它不能序列化
// 所以将这个 Map 放在 store 外部
const messageToTimestampMap = new Map<string, number>();

export const useToastHistoryStore = defineStore('toastHistory', {
  state: () => ({
    historyItems: [] as ToastHistoryItem[],
    lastViewedTimestamp: 0,
    isLoaded: false,
  }),

  getters: {
    /**
     * 未读消息数量（未标记为已读的消息）
     */
    unreadCount(state): number {
      return state.historyItems.filter((item) => !item.read).length;
    },
  },

  actions: {
    /**
     * 从 IndexedDB 加载 Toast 历史记录和最后查看时间戳
     */
    async loadHistory(): Promise<void> {
      if (this.isLoaded) {
        return;
      }

      this.historyItems = await loadHistoryFromDB();
      this.lastViewedTimestamp = await loadLastViewedTimestampFromDB();
      this.isLoaded = true;
    },

    /**
     * 添加新的 toast 到历史记录
     */
    async addToHistory(item: Omit<ToastHistoryItem, 'id' | 'timestamp'>): Promise<void> {
      const historyItem: ToastHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        read: false, // 新消息默认为未读
        ...item,
      };

      // 添加到数组开头
      this.historyItems.unshift(historyItem);

      // 限制历史记录数量
      if (this.historyItems.length > MAX_HISTORY_ITEMS) {
        // 删除超出限制的项目
        const itemsToDelete = this.historyItems.slice(MAX_HISTORY_ITEMS);
        this.historyItems = this.historyItems.slice(0, MAX_HISTORY_ITEMS);
        
        // 从 IndexedDB 删除超出限制的项目
        for (const itemToDelete of itemsToDelete) {
          await deleteHistoryItemFromDB(itemToDelete.id);
        }
      }

      // 保存到 IndexedDB
      await saveHistoryItemToDB(historyItem);
    },

    /**
     * 标记为已读（打开历史对话框时，标记所有消息为已读）
     */
    async markAsRead(): Promise<void> {
      // 标记所有消息为已读
      this.historyItems.forEach((item) => {
        item.read = true;
      });
      this.lastViewedTimestamp = Date.now();
      await saveLastViewedTimestampToDB(this.lastViewedTimestamp);
      await bulkSaveHistoryToDB(this.historyItems);
    },

    /**
     * 标记指定时间戳的消息为已读（已废弃，保留用于兼容）
     */
    async markAsReadByTimestamp(timestamp: number): Promise<void> {
      // 找到对应时间戳的消息并标记为已读
      const item = this.historyItems.find((item) => item.timestamp === timestamp);
      if (item) {
        item.read = true;
        await saveHistoryItemToDB(item);
      }
    },

    /**
     * 根据消息内容标记为已读（关闭单个 toast 时调用）
     */
    async markAsReadByMessage(message: { summary?: string; detail?: string }): Promise<void> {
      const summary = message.summary || '';
      const detail = message.detail || '';
      const messageKey = `${summary}:${detail}`;
      const timestamp = messageToTimestampMap.get(messageKey);

      if (timestamp !== undefined) {
        // 优先找到对应时间戳的未读消息并标记为已读
        // 如果找不到，则找最接近该时间戳的未读消息（处理相同内容的多条消息）
        let item = this.historyItems.find((item) => item.timestamp === timestamp && !item.read);
        
        if (!item) {
          // 如果找不到精确匹配的未读项，找最接近时间戳的未读项
          const unreadItems = this.historyItems.filter(
            (item) => !item.read && item.summary === summary && item.detail === detail
          );
          if (unreadItems.length > 0) {
            // 找时间戳最接近的项
            item = unreadItems.reduce((closest, current) => {
              const closestDiff = Math.abs(closest.timestamp - timestamp);
              const currentDiff = Math.abs(current.timestamp - timestamp);
              return currentDiff < closestDiff ? current : closest;
            });
          }
        }

        if (item) {
          item.read = true;
          await saveHistoryItemToDB(item);
        }
        // 清理映射（避免内存泄漏）
        messageToTimestampMap.delete(messageKey);
      }
    },

    /**
     * 将消息映射到时间戳
     */
    setMessageTimestamp(message: { summary?: string; detail?: string }, timestamp: number): void {
      const summary = message.summary || '';
      const detail = message.detail || '';
      const messageKey = `${summary}:${detail}`;
      messageToTimestampMap.set(messageKey, timestamp);
    },

    /**
     * 清空历史记录
     */
    async clearHistory(): Promise<void> {
      const db = await getDB();
      await db.clear('toast-history');
      this.historyItems = [];
      this.lastViewedTimestamp = Date.now();
      messageToTimestampMap.clear();
      await saveLastViewedTimestampToDB(this.lastViewedTimestamp);
    },

    /**
     * 删除指定的历史记录项
     */
    async removeHistoryItem(id: string): Promise<void> {
      const index = this.historyItems.findIndex((item) => item.id === id);
      if (index > -1) {
        this.historyItems.splice(index, 1);
        await deleteHistoryItemFromDB(id);
      }
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useToastHistoryStore, import.meta.hot));
}
