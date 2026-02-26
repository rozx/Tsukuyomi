import { GistSyncService } from 'src/services/gist-sync-service';
import { SyncDataService, type RestorableItem } from 'src/services/sync-data-service';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';
import { MemoryService } from 'src/services/memory-service';
import type { SyncConfig } from 'src/models/sync';
import type { Novel } from 'src/models/novel';
import { useToastWithHistory } from 'src/composables/useToastHistory';

/**
 * Gist 同步 composable
 * 提供统一的双向同步方法：下载远程 → 应用/合并 → 检测变更 → 有变更才上传
 */
export function useGistSync() {
  const settingsStore = useSettingsStore();
  const aiModelsStore = useAIModelsStore();
  const booksStore = useBooksStore();
  const coverHistoryStore = useCoverHistoryStore();
  const toast = useToastWithHistory();
  const gistSyncService = new GistSyncService();

  /**
   * 下载远程数据（内部辅助方法）
   * @param config 同步配置
   * @param downloadPhaseMax 下载阶段在整体进度中的最大值
   * @param overallTotal 整体进度的总数值
   * @returns 下载的数据，或 error 信息
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const downloadRemoteData = async (
    config: SyncConfig,
    downloadPhaseMax: number,
    overallTotal: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ data?: any; error?: string }> => {
    if (!config.syncParams.gistId) {
      return {}; // 没有 Gist ID，无需下载
    }

    try {
      // 更新进度：开始下载
      settingsStore.updateSyncProgress({
        stage: 'downloading',
        message: '正在下载远程数据...',
        current: 0,
        total: overallTotal,
      });

      // 下载远程数据（传递进度回调）
      let downloadPhaseTotal: number | undefined = undefined;
      const downloadResult = await gistSyncService.downloadFromGist(config, (progress) => {
        if (downloadPhaseTotal === undefined) {
          downloadPhaseTotal = progress.total;
        }

        const mappedCurrent =
          progress.total > 0
            ? Math.round((progress.current / progress.total) * downloadPhaseMax)
            : 0;

        settingsStore.updateSyncProgress({
          stage: 'downloading',
          current: mappedCurrent,
          total: overallTotal,
          message: progress.message,
        });
      });

      if (downloadResult.success && downloadResult.data) {
        return { data: downloadResult.data };
      } else if (!downloadResult.success) {
        const errorMsg = downloadResult.error || '从 Gist 下载数据时发生未知错误';
        toast.add({
          severity: 'error',
          summary: '下载失败',
          detail: errorMsg,
          life: 5000,
        });
        return { error: errorMsg };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '下载时发生未知错误';
      toast.add({
        severity: 'error',
        summary: '下载失败',
        detail: errorMsg,
        life: 5000,
      });
      return { error: errorMsg };
    }

    return {};
  };

  /**
   * 执行上传操作（内部辅助方法）
   * @param config 同步配置
   * @param dataToUpload 要上传的数据
   * @param uploadPhaseStart 上传阶段在整体进度中的起始位置
   * @param overallTotal 整体进度的总数值
   * @returns 上传是否成功
   */
  const performUpload = async (
    config: SyncConfig,
    dataToUpload: {
      aiModels: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      appSettings: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      novels: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      coverHistory: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      memories: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    },
    uploadPhaseStart: number,
    overallTotal: number,
  ): Promise<boolean> => {
    try {
      // 更新进度：开始上传
      settingsStore.updateSyncProgress({
        stage: 'uploading',
        message: `正在上传数据 (${dataToUpload.novels.length} 本书籍)...`,
        current: uploadPhaseStart,
        total: overallTotal,
      });

      let uploadPhaseTotal: number | undefined = undefined;
      const result = await gistSyncService.uploadToGist(config, dataToUpload, (progress) => {
        if (uploadPhaseTotal === undefined) {
          uploadPhaseTotal = progress.total;
        }

        const uploadPhaseRange = overallTotal - uploadPhaseStart;
        const mappedCurrent =
          progress.total > 0
            ? uploadPhaseStart + Math.round((progress.current / progress.total) * uploadPhaseRange)
            : uploadPhaseStart;

        settingsStore.updateSyncProgress({
          stage: 'uploading',
          current: mappedCurrent,
          total: overallTotal,
          message: progress.message,
        });
      });

      if (result.success) {
        // 更新进度：上传完成
        settingsStore.updateSyncProgress({
          message: '上传完成，正在更新状态...',
          current: overallTotal,
          total: overallTotal,
        });

        // 更新 Gist ID
        if (result.gistId) {
          try {
            await settingsStore.setGistId(result.gistId);
          } catch (error) {
            console.error('[useGistSync] 设置 Gist ID 失败:', error);
          }
        }

        // 更新同步时间 & 清理旧删除记录
        try {
          await settingsStore.updateLastSyncTime();
          await settingsStore.cleanupOldDeletionRecords();
        } catch (error) {
          console.error('[useGistSync] 更新最后同步时间失败:', error);
        }

        return true;
      } else {
        const errorMsg = result.error || '同步到 Gist 时发生未知错误';
        toast.add({
          severity: 'error',
          summary: '上传失败',
          detail: errorMsg,
          life: 5000,
        });
        return false;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '上传时发生未知错误';
      toast.add({
        severity: 'error',
        summary: '上传失败',
        detail: errorMsg,
        life: 5000,
      });
      return false;
    }
  };

  /**
   * 统一的双向同步操作
   * 流程：下载远程数据 → 应用/合并 → 检测本地变更 → 有变更才上传
   *
   * @param config 同步配置（可选，默认使用 store 中的配置）
   * @returns 可恢复的已删除项目列表（手动同步时返回，供 UI 展示恢复对话框）
   */
  const sync = async (config?: SyncConfig): Promise<RestorableItem[]> => {
    const syncConfig = config ?? settingsStore.gistSync;

    // 检查同步是否已在进行中
    if (settingsStore.isSyncing) {
      console.warn('[useGistSync] 同步已在进行中，跳过');
      return [];
    }

    settingsStore.setSyncing(true);

    try {
      // 进度阶段分配：下载(50%) + 应用/合并(10%) + 上传(40%)
      const OVERALL_TOTAL = 100;
      const DOWNLOAD_PHASE_MAX = 50;
      const APPLY_PHASE_MAX = 10;
      const UPLOAD_PHASE_START = DOWNLOAD_PHASE_MAX + APPLY_PHASE_MAX; // 60

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let remoteData: any = undefined;
      let restorableItems: RestorableItem[] = [];

      // ── 阶段 1：下载远程数据 ──
      if (syncConfig.syncParams.gistId) {
        const { data, error } = await downloadRemoteData(
          syncConfig,
          DOWNLOAD_PHASE_MAX,
          OVERALL_TOTAL,
        );

        if (error) {
          // 下载失败，终止同步（不继续上传）
          console.error('[useGistSync] 同步下载失败，终止同步:', error);
          return [];
        }

        remoteData = data;
      }

      // ── 阶段 2：应用远程数据 ──
      if (remoteData) {
        settingsStore.updateSyncProgress({
          stage: 'applying',
          message: '正在应用下载的数据...',
          current: DOWNLOAD_PHASE_MAX,
          total: OVERALL_TOTAL,
        });

        // 手动同步传入 isManualRetrieval=true，以返回 RestorableItem[]
        restorableItems = await SyncDataService.applyDownloadedData(remoteData, undefined, true);

        settingsStore.updateSyncProgress({
          stage: 'applying',
          message: '应用完成',
          current: UPLOAD_PHASE_START,
          total: OVERALL_TOTAL,
        });

        // 更新同步状态（参照 auto-sync 流程）
        try {
          await settingsStore.updateLastSyncTime();
          await settingsStore.updateLastSyncedModelIds(aiModelsStore.models.map((m) => m.id));
          await settingsStore.cleanupOldDeletionRecords();
        } catch (error) {
          console.error('[useGistSync] 更新同步状态失败:', error);
        }
      }

      // ── 阶段 3：检测变更并决定是否上传 ──
      const bookIds = booksStore.books.map((book) => book.id);
      const memories = await MemoryService.getAllMemoriesForBooksFlat(bookIds);

      const localData = {
        novels: booksStore.books,
        aiModels: aiModelsStore.models,
        appSettings: settingsStore.getAllSettings(),
        coverHistory: coverHistoryStore.covers,
        memories,
      };

      // 无论远程是否有数据，都使用 hasChangesToUpload 判断
      // 如果没有远程数据（首次同步或空 Gist），与空数据比较
      const remoteForComparison = remoteData ?? {
        novels: [],
        aiModels: [],
        appSettings: {},
        coverHistory: [],
        memories: [],
      };

      const shouldUpload = SyncDataService.hasChangesToUpload(localData, remoteForComparison);

      if (!shouldUpload) {
        // 无需上传，同步完成
        settingsStore.updateSyncProgress({
          stage: 'uploading',
          message: '同步完成（无更改需要上传）',
          current: OVERALL_TOTAL,
          total: OVERALL_TOTAL,
        });

        toast.add({
          severity: 'success',
          summary: '同步完成',
          detail: '数据已是最新，无需上传',
          life: 3000,
        });

        return restorableItems;
      }

      // ── 阶段 4：上传 ──
      const uploadSuccess = await performUpload(
        syncConfig,
        localData,
        UPLOAD_PHASE_START,
        OVERALL_TOTAL,
      );

      if (uploadSuccess) {
        toast.add({
          severity: 'success',
          summary: '同步完成',
          detail: '数据已同步到 Gist',
          life: 3000,
        });
      }

      return restorableItems;
    } catch (error) {
      console.error('[useGistSync] 同步异常:', error);
      const errorMsg = error instanceof Error ? error.message : '同步时发生未知错误';
      toast.add({
        severity: 'error',
        summary: '同步失败',
        detail: errorMsg,
        life: 5000,
      });
      return [];
    } finally {
      settingsStore.setSyncing(false);
    }
  };

  /**
   * 恢复已删除的项目
   * @param items 要恢复的项目列表
   */
  const restoreDeletedItems = async (items: RestorableItem[]): Promise<void> => {
    const gistSync = settingsStore.gistSync;

    // 按类型分组
    const novelsToRestore: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    const modelsToRestore: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    const coversToRestore: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any

    for (const item of items) {
      if (item.type === 'novel') {
        novelsToRestore.push(item.data);
      } else if (item.type === 'model') {
        modelsToRestore.push(item.data);
      } else if (item.type === 'cover') {
        coversToRestore.push(item.data);
      }
    }

    // 恢复书籍
    if (novelsToRestore.length > 0) {
      for (const novel of novelsToRestore) {
        await booksStore.addBook(novel as Novel);
      }
    }

    // 恢复模型
    if (modelsToRestore.length > 0) {
      for (const model of modelsToRestore) {
        await aiModelsStore.addModel(model);
      }
    }

    // 恢复封面
    if (coversToRestore.length > 0) {
      for (const cover of coversToRestore) {
        await coverHistoryStore.addCover(cover);
      }
    }

    // 从删除记录中移除已恢复的项目
    const deletedNovelIds = (gistSync.deletedNovelIds || []).filter(
      (record) => !items.some((item) => item.type === 'novel' && item.id === record.id),
    );
    const deletedModelIds = (gistSync.deletedModelIds || []).filter(
      (record) => !items.some((item) => item.type === 'model' && item.id === record.id),
    );
    const deletedCoverIds = (gistSync.deletedCoverIds || []).filter(
      (record) => !items.some((item) => item.type === 'cover' && item.id === record.id),
    );
    const restoredCoverUrls = new Set(
      items
        .filter((item) => item.type === 'cover')
        .map((item) => (item.data?.url ? String(item.data.url).trim() : ''))
        .filter((u) => u.length > 0),
    );
    const deletedCoverUrls = (gistSync.deletedCoverUrls || []).filter(
      (record) => !restoredCoverUrls.has(String(record.url).trim()),
    );

    await settingsStore.updateGistSync({
      deletedNovelIds,
      deletedModelIds,
      deletedCoverIds,
      deletedCoverUrls,
    });

    toast.add({
      severity: 'success',
      summary: '恢复成功',
      detail: `已恢复 ${items.length} 个项目`,
      life: 3000,
    });
  };

  return {
    sync,
    restoreDeletedItems,
  };
}
