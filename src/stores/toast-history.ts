import { defineStore, acceptHMRUpdate } from 'pinia';

export interface ToastHistoryItem {
  id: string;
  severity: 'success' | 'error' | 'info' | 'warn';
  summary: string;
  detail: string;
  timestamp: number;
  life?: number;
}

const STORAGE_KEY = 'luna-toast-history';
const STORAGE_KEY_LAST_VIEWED = 'luna-toast-last-viewed';
const MAX_HISTORY_ITEMS = 100;

/**
 * 从本地存储加载 Toast 历史记录
 */
function loadHistoryFromStorage(): ToastHistoryItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as ToastHistoryItem[];
    }
  } catch (error) {
    console.error('Failed to load toast history from storage:', error);
  }
  return [];
}

/**
 * 保存 Toast 历史记录到本地存储
 */
function saveHistoryToStorage(history: ToastHistoryItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Failed to save toast history to storage:', error);
  }
}

/**
 * 从本地存储加载最后查看时间戳
 */
function loadLastViewedTimestamp(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_LAST_VIEWED);
    if (stored) {
      return parseInt(stored, 10);
    }
  } catch (error) {
    console.error('Failed to load last viewed timestamp from storage:', error);
  }
  return 0;
}

/**
 * 保存最后查看时间戳到本地存储
 */
function saveLastViewedTimestamp(timestamp: number): void {
  try {
    localStorage.setItem(STORAGE_KEY_LAST_VIEWED, timestamp.toString());
  } catch (error) {
    console.error('Failed to save last viewed timestamp to storage:', error);
  }
}

// 用于将 toast 消息映射到时间戳的 Map (使用 summary + detail 作为 key)
// 注意：Map 不能存储在 Pinia state 中，因为它不能序列化
// 所以将这个 Map 放在 store 外部
const messageToTimestampMap = new Map<string, number>();

export const useToastHistoryStore = defineStore('toastHistory', {
  state: () => ({
    historyItems: loadHistoryFromStorage(),
    lastViewedTimestamp: loadLastViewedTimestamp(),
  }),

  getters: {
    /**
     * 未读消息数量（在上次查看之后的消息）
     */
    unreadCount(state): number {
      if (state.lastViewedTimestamp === 0) {
        // 如果从未查看过，显示所有消息
        return state.historyItems.length;
      }
      return state.historyItems.filter((item) => item.timestamp > state.lastViewedTimestamp).length;
    },
  },

  actions: {
    /**
     * 添加新的 toast 到历史记录
     */
    addToHistory(item: Omit<ToastHistoryItem, 'id' | 'timestamp'>): void {
      const historyItem: ToastHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        ...item,
      };

      // 添加到数组开头
      this.historyItems.unshift(historyItem);

      // 限制历史记录数量
      if (this.historyItems.length > MAX_HISTORY_ITEMS) {
        this.historyItems = this.historyItems.slice(0, MAX_HISTORY_ITEMS);
      }

      // 保存到本地存储
      saveHistoryToStorage(this.historyItems);
    },

    /**
     * 标记为已读（更新上次查看时间戳）
     */
    markAsRead(): void {
      this.lastViewedTimestamp = Date.now();
      saveLastViewedTimestamp(this.lastViewedTimestamp);
    },

    /**
     * 标记指定时间戳的消息为已读
     */
    markAsReadByTimestamp(timestamp: number): void {
      if (timestamp >= this.lastViewedTimestamp) {
        this.lastViewedTimestamp = timestamp;
        saveLastViewedTimestamp(this.lastViewedTimestamp);
      }
    },

    /**
     * 根据消息内容标记为已读
     */
    markAsReadByMessage(message: { summary?: string; detail?: string }): void {
      const summary = message.summary || '';
      const detail = message.detail || '';
      const messageKey = `${summary}:${detail}`;
      const timestamp = messageToTimestampMap.get(messageKey);

      if (timestamp !== undefined) {
        this.markAsReadByTimestamp(timestamp);
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
    clearHistory(): void {
      this.historyItems = [];
      this.lastViewedTimestamp = Date.now();
      messageToTimestampMap.clear();
      saveHistoryToStorage(this.historyItems);
      saveLastViewedTimestamp(this.lastViewedTimestamp);
    },

    /**
     * 删除指定的历史记录项
     */
    removeHistoryItem(id: string): void {
      const index = this.historyItems.findIndex((item) => item.id === id);
      if (index > -1) {
        this.historyItems.splice(index, 1);
        saveHistoryToStorage(this.historyItems);
      }
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useToastHistoryStore, import.meta.hot));
}
