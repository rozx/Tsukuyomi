import { computed } from 'vue';
import { useToast } from 'primevue/usetoast';
import type { ToastMessageOptions } from 'primevue/toast';
import { useToastHistoryStore } from 'src/stores/toast-history';
import co from 'co';

// 重新导出类型供外部使用
export type { ToastHistoryItem } from 'src/stores/toast-history';

export interface ToastMessageWithHistoryOptions extends ToastMessageOptions {
  onRevert?: () => void | Promise<void>;
}

/**
 * Toast 历史记录管理 Composable
 */
export function useToastHistory() {
  const store = useToastHistoryStore();

  /**
   * 未读消息数量（在上次查看之后的消息）
   */
  const unreadCount = computed(() => store.unreadCount);

  /**
   * 格式化时间戳为可读格式
   */
  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) {
      return '刚刚';
    } else if (minutes < 60) {
      return `${minutes} 分钟前`;
    } else if (hours < 24) {
      return `${hours} 小时前`;
    } else if (days < 7) {
      return `${days} 天前`;
    } else {
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  };

  return {
    historyItems: computed(() => store.historyItems),
    unreadCount,
    markAsRead: () => store.markAsRead(),
    markAsReadByTimestamp: (timestamp: number) => store.markAsReadByTimestamp(timestamp),
    markAsReadByMessage: (message: { summary?: string; detail?: string }) =>
      store.markAsReadByMessage(message),
    clearHistory: () => store.clearHistory(),
    removeHistoryItem: (id: string) => store.removeHistoryItem(id),
    revert: (id: string) => store.revert(id),
    canRevert: (id: string) => store.canRevert(id),
    formatTimestamp,
  };
}

/**
 * 带历史记录的 useToast 包装器
 * 所有组件应该使用这个而不是直接使用 useToast
 */
export function useToastWithHistory() {
  const toast = useToast();
  const store = useToastHistoryStore();

  // 包装 add 方法，自动保存历史记录
  const originalAdd = toast.add.bind(toast);
  const wrappedAdd = (message: ToastMessageWithHistoryOptions) => {
    // 保存到历史记录
    // 确保 severity 是有效的类型
    const severityValue = message.severity;
    const severity: 'success' | 'error' | 'info' | 'warn' =
      severityValue === 'success' ||
      severityValue === 'error' ||
      severityValue === 'info' ||
      severityValue === 'warn'
        ? (severityValue as 'success' | 'error' | 'info' | 'warn')
        : 'info';

    // 计算一次时间戳，确保在 composable 和 store 中使用一致
    const timestamp = Date.now();
    const summary = message.summary || '';
    const detail = message.detail || '';

    // 添加到历史记录（store 会自动保存到 IndexedDB）
    // 传递时间戳以确保一致性
    void co(function* () {
      try {
        yield store.addToHistory(
          {
            severity,
            summary,
            detail,
            ...(message.life !== undefined ? { life: message.life } : {}),
          },
          message.onRevert,
          timestamp,
        );
      } catch (error) {
        console.error('[useToastHistory] 保存 toast 历史记录失败:', error);
      }
    });

    // 将消息映射到时间戳（用于关闭时标记为已读）
    store.setMessageTimestamp({ summary, detail }, timestamp);

    // 调用原始的 add 方法
    return originalAdd(message);
  };

  // 返回包装后的 toast 对象
  return {
    ...toast,
    add: wrappedAdd,
  };
}
