import { watch } from 'vue';
import { useSettingsStore } from 'src/stores/settings';
import { GistSyncService } from 'src/services/gist-sync-service';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { MemoryService } from 'src/services/memory-service';
import { SyncDataService } from 'src/services/sync-data-service';
import type { Memory } from 'src/models/memory';

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
  const aiModelsStore = useAIModelsStore();
  const booksStore = useBooksStore();
  const coverHistoryStore = useCoverHistoryStore();
  const gistSyncService = new GistSyncService();

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

      // 计算整体流程的总进度
      // 流程：下载(50%) + 应用(10%) + 上传(40%)
      const OVERALL_TOTAL = 100;
      const DOWNLOAD_PHASE_MAX = 50; // 下载阶段占 50%
      const APPLY_PHASE_MAX = 10; // 应用阶段占 10%
      // 上传阶段占剩余 40%（从 60% 到 100%）

      // 1. 先下载远程更改（避免覆盖）
      // 下载阶段：0-50%
      let downloadPhaseTotal: number | undefined = undefined;
      const result = await gistSyncService.downloadFromGist(config, (progress) => {
        // 记录下载阶段的总数（第一次更新时）
        if (downloadPhaseTotal === undefined) {
          downloadPhaseTotal = progress.total;
        }

        // 将下载阶段的进度映射到整体进度（0 到 DOWNLOAD_PHASE_MAX）
        // 防止除零错误
        const mappedCurrent =
          progress.total > 0
            ? Math.round((progress.current / progress.total) * DOWNLOAD_PHASE_MAX)
            : 0;

        settingsStore.updateSyncProgress({
          stage: 'downloading',
          current: mappedCurrent,
          total: OVERALL_TOTAL,
          message: `[自动同步] ${progress.message}`,
        });
      });

      if (result.success && result.data) {
        // 更新进度：进入应用阶段，50-60%
        settingsStore.updateSyncProgress({
          stage: 'applying',
          message: '[自动同步] 正在应用下载的数据...',
          current: DOWNLOAD_PHASE_MAX,
          total: OVERALL_TOTAL,
        });

        // 直接应用数据（总是使用最新的 lastEdited 时间）
        // 自动同步时，不返回可恢复的项目（因为 isManualRetrieval = false）
        await SyncDataService.applyDownloadedData(result.data);

        // 更新进度：应用完成，60%
        settingsStore.updateSyncProgress({
          stage: 'applying',
          message: '[自动同步] 应用完成',
          current: DOWNLOAD_PHASE_MAX + APPLY_PHASE_MAX,
          total: OVERALL_TOTAL,
        });

        // 等待所有状态更新完成，避免竞态条件
        try {
          await settingsStore.updateLastSyncTime();
          // 更新上次同步时的模型 ID 列表（使用应用后的模型列表）
          await settingsStore.updateLastSyncedModelIds(aiModelsStore.models.map((m) => m.id));
          // 清理旧的删除记录（每次同步时都清理，避免记录无限增长）
          await settingsStore.cleanupOldDeletionRecords();
        } catch (error) {
          console.error('[useAutoSync] 更新同步状态失败:', error);
        }

        // 检查是否需要上传（如果有本地更改）
        // 使用批量加载方法加载所有 Memory 数据
        const bookIds = booksStore.books.map((book) => book.id);
        const memories = await MemoryService.getAllMemoriesForBooksFlat(bookIds);

        const shouldUpload = SyncDataService.hasChangesToUpload(
          {
            novels: booksStore.books,
            aiModels: aiModelsStore.models,
            appSettings: settingsStore.getAllSettings(),
            coverHistory: coverHistoryStore.covers,
            memories,
          },
          result.data,
        );

        if (!shouldUpload) {
          // 没有需要上传的更改，同步完成
          settingsStore.updateSyncProgress({
            stage: 'uploading',
            message: '[自动同步] 同步完成（无更改需要上传）',
            current: OVERALL_TOTAL,
            total: OVERALL_TOTAL,
          });
          return;
        }
      } else if (!result.success) {
        // 下载失败，记录错误但不继续上传
        const errorMsg = result.error || '从 Gist 下载数据时发生未知错误';
        console.error('[useAutoSync] 自动同步下载失败:', errorMsg);
        // 重置进度
        settingsStore.resetSyncProgress();
        return;
      } else {
        // result.success 为 true 但 result.data 为空（例如空 Gist）
        // 继续上传，但跳过不必要的日志
        console.info('[useAutoSync] 下载成功但无数据，继续尝试上传本地数据');
      }

      // 2. 然后上传本地更改（包含刚刚合并的远程更改）
      // 注意：上传时使用当前的模型列表，这样远程会包含本地删除后的状态
      // 上传阶段：60-100%
      const uploadPhaseStart = DOWNLOAD_PHASE_MAX + APPLY_PHASE_MAX;
      let uploadPhaseTotal: number | undefined = undefined;
      const uploadResult = await gistSyncService.uploadToGist(
        config,
        {
          aiModels: aiModelsStore.models,
          appSettings: settingsStore.getAllSettings(),
          novels: booksStore.books,
          coverHistory: coverHistoryStore.covers,
        },
        (progress) => {
          // 记录上传阶段的总数（第一次更新时）
          if (uploadPhaseTotal === undefined) {
            uploadPhaseTotal = progress.total;
          }

          // 将上传阶段的进度映射到整体进度
          // 上传阶段占整体进度的剩余部分（从 uploadPhaseStart 到 OVERALL_TOTAL）
          const uploadPhaseRange = OVERALL_TOTAL - uploadPhaseStart;
          // 防止除零错误
          const mappedCurrent =
            progress.total > 0
              ? uploadPhaseStart +
                Math.round((progress.current / progress.total) * uploadPhaseRange)
              : uploadPhaseStart;

          settingsStore.updateSyncProgress({
            stage: 'uploading',
            current: mappedCurrent,
            total: OVERALL_TOTAL,
            message: `[自动同步] ${progress.message}`,
          });
        },
      );

      if (uploadResult.success) {
        // 更新进度：上传完成，100%
        settingsStore.updateSyncProgress({
          stage: 'uploading',
          message: '[自动同步] 同步完成',
          current: OVERALL_TOTAL,
          total: OVERALL_TOTAL,
        });

        // 上传成功后再次更新同步时间
        await settingsStore.updateLastSyncTime();
      } else {
        const errorMsg = uploadResult.error || '上传到 Gist 时发生未知错误';
        console.error('[useAutoSync] 自动同步上传失败:', errorMsg);
        // 重置进度
        settingsStore.resetSyncProgress();
      }
    } catch (error) {
      // 记录错误日志，便于调试
      const errorMsg = error instanceof Error ? error.message : '自动同步时发生未知错误';
      console.error('[useAutoSync] 自动同步异常:', errorMsg, error);
      // 重置进度
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
