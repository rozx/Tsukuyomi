import { watch } from 'vue';
import { useSettingsStore } from 'src/stores/settings';
import { useSyncExecutor } from 'src/composables/useSyncExecutor';

// 单例状态（在模块级别共享）
let autoSyncInterval: ReturnType<typeof setInterval> | null = null;

// 单例 watch 清理函数
let watchStopHandle: (() => void) | null = null;

// 同步锁，防止并发同步
let syncLock = false;

/**
 * 自动同步 composable（单例模式）
 */
export function useAutoSync() {
  const settingsStore = useSettingsStore();
  const { executeSync } = useSyncExecutor();

  /**
   * 执行自动同步
   * 使用同步锁确保不会并发执行
   */
  const performAutoSync = async () => {
    const config = settingsStore.gistSync;
    if (
      !config.enabled ||
      !config.syncParams.gistId ||
      !config.syncParams.username ||
      !config.secret
    ) {
      return;
    }

    // 使用同步锁防止并发同步（双重检查）
    if (syncLock || settingsStore.isSyncing) {
      console.warn('[useAutoSync] 同步已在进行中，跳过此次自动同步');
      return;
    }

    // 获取同步锁
    syncLock = true;

    try {
      settingsStore.setSyncing(true);

      await executeSync({
        messagePrefix: '[自动同步] ',
        isManualRetrieval: false,
        onError: (summary, detail) => {
          console.error(`[useAutoSync] ${summary}: ${detail}`);
        },
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '自动同步时发生未知错误';
      console.error('[useAutoSync] 自动同步异常:', errorMsg, error);
      settingsStore.resetSyncProgress();
    } finally {
      settingsStore.setSyncing(false);
      // 释放同步锁
      syncLock = false;
    }
  };

  /**
   * 设置自动同步定时器
   */
  const setupAutoSync = () => {
    // 清除现有定时器
    if (autoSyncInterval) {
      clearInterval(autoSyncInterval);
      autoSyncInterval = null;
    }

    const config = settingsStore.gistSync;
    if (config.enabled && config.syncInterval > 0) {
      // 设置定时器
      autoSyncInterval = setInterval(() => {
        void performAutoSync();
      }, config.syncInterval);
    }
  };

  /**
   * 停止自动同步
   */
  const stopAutoSync = () => {
    if (autoSyncInterval) {
      clearInterval(autoSyncInterval);
      autoSyncInterval = null;
    }
  };

  /**
   * 清理所有资源（用于应用卸载时）
   */
  const cleanup = () => {
    stopAutoSync();
    if (watchStopHandle) {
      watchStopHandle();
      watchStopHandle = null;
    }
    syncLock = false;
  };

  // 只在第一次调用时设置 watch（单例模式）
  if (!watchStopHandle) {
    watchStopHandle = watch(
      () => settingsStore.gistSync,
      () => {
        setupAutoSync();
      },
      { deep: true },
    );
  }

  return {
    setupAutoSync,
    stopAutoSync,
    cleanup,
    performAutoSync, // 暴露用于手动触发
  };
}
