import { ref, watch } from 'vue';
import { useSettingsStore } from 'src/stores/settings';
import { GistSyncService } from 'src/services/gist-sync-service';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { SyncDataService } from 'src/services/sync-data-service';
import { isNewlyAdded as checkIsNewlyAdded } from 'src/utils/time-utils';
import type { Novel } from 'src/models/novel';
import co from 'co';

// 单例状态（在模块级别共享）
let autoSyncInterval: ReturnType<typeof setInterval> | null = null;

// 单例 watch 清理函数
let watchStopHandle: (() => void) | null = null;

/**
 * 自动同步 composable（单例模式）
 */
export function useAutoSync() {
  const settingsStore = useSettingsStore();
  const aiModelsStore = useAIModelsStore();
  const booksStore = useBooksStore();
  const coverHistoryStore = useCoverHistoryStore();
  const gistSyncService = new GistSyncService();


  /**
   * 执行自动同步
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

    // 检查是否已有同步在进行中，避免并发同步
    if (settingsStore.isSyncing) {
      console.warn('[useAutoSync] 同步已在进行中，跳过此次自动同步');
      return;
    }

    try {
      settingsStore.setSyncing(true);

      // 1. 先下载远程更改（避免覆盖）
      const result = await gistSyncService.downloadFromGist(config);

      if (result.success && result.data) {
        // 直接应用数据（总是使用最新的 lastEdited 时间）
        // 自动同步时，不返回可恢复的项目（因为 isManualRetrieval = false）
        await SyncDataService.applyDownloadedData(result.data);
        void co(function* () {
          try {
            yield settingsStore.updateLastSyncTime();
            // 更新上次同步时的模型 ID 列表（使用应用后的模型列表）
            yield settingsStore.updateLastSyncedModelIds(aiModelsStore.models.map((m) => m.id));
            // 清理旧的删除记录（每次同步时都清理，避免记录无限增长）
            yield settingsStore.cleanupOldDeletionRecords();
          } catch (error) {
            console.error('[useAutoSync] 更新同步状态失败:', error);
          }
        });

        // 检查是否需要上传（如果有本地更改）
        const shouldUpload = SyncDataService.hasChangesToUpload(
          {
            novels: booksStore.books,
            aiModels: aiModelsStore.models,
            appSettings: settingsStore.getAllSettings(),
            coverHistory: coverHistoryStore.covers,
          },
          result.data,
        );

        if (!shouldUpload) {
          return;
        }
      } else if (!result.success) {
        // 下载失败，记录错误但不继续上传
        const errorMsg = result.error || '从 Gist 下载数据时发生未知错误';
        console.error('[useAutoSync] 自动同步下载失败:', errorMsg);
        return;
      }

      // 2. 然后上传本地更改（包含刚刚合并的远程更改）
      // 注意：上传时使用当前的模型列表，这样远程会包含本地删除后的状态
      const uploadResult = await gistSyncService.uploadToGist(config, {
        aiModels: aiModelsStore.models,
        appSettings: settingsStore.getAllSettings(),
        novels: booksStore.books,
        coverHistory: coverHistoryStore.covers,
      });

      if (!uploadResult.success) {
        const errorMsg = uploadResult.error || '上传到 Gist 时发生未知错误';
        console.error('[useAutoSync] 自动同步上传失败:', errorMsg);
      }
    } catch (error) {
      // 记录错误日志，便于调试
      const errorMsg = error instanceof Error ? error.message : '自动同步时发生未知错误';
      console.error('[useAutoSync] 自动同步异常:', errorMsg, error);
    } finally {
      settingsStore.setSyncing(false);
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
      // 检查是否需要立即同步（但不要立即同步，避免在配置更新时触发）
      // 只在定时器触发时同步

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
  };
}
