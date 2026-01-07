import { ref } from 'vue';
import { GistSyncService } from 'src/services/gist-sync-service';
import { SyncDataService, type RestorableItem } from 'src/services/sync-data-service';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';
import { MemoryService } from 'src/services/memory-service';
import type { SyncConfig } from 'src/models/sync';
import type { Novel } from 'src/models/novel';
import type { Memory } from 'src/models/memory';
import { useToastWithHistory } from 'src/composables/useToastHistory';

/**
 * Gist 同步 composable
 * 提供上传和下载的通用逻辑
 * 上传时会先下载远程数据并合并，确保不会丢失远程更改
 */
export function useGistSync() {
  const settingsStore = useSettingsStore();
  const aiModelsStore = useAIModelsStore();
  const booksStore = useBooksStore();
  const coverHistoryStore = useCoverHistoryStore();
  const toast = useToastWithHistory();
  const gistSyncService = new GistSyncService();
  
  // 用于跟踪待处理的上传（下载失败后等待确认）
  const pendingUploadData = ref<{
    config: SyncConfig;
    localData: {
      aiModels: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      appSettings: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      novels: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      coverHistory: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      memories: Memory[];
    };
    setSyncing: (value: boolean) => void;
    onSuccess: ((result: { gistId?: string; isRecreated?: boolean; message?: string }) => void) | undefined;
  } | null>(null);

  /**
   * 下载远程数据
   * @param config 同步配置
   * @param downloadPhaseMax 下载阶段在整体进度中的最大值（默认 30）
   * @param overallTotal 整体进度的总数值（默认 100）
   * @returns 下载的数据
   */
  const downloadRemoteData = async (
    config: SyncConfig,
    downloadPhaseMax: number = 30,
    overallTotal: number = 100,
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

      // 下载远程更改（传递进度回调）
      // 将下载阶段的进度映射到整体进度（0 到 downloadPhaseMax）
      let downloadPhaseTotal: number | undefined = undefined;
      const downloadResult = await gistSyncService.downloadFromGist(
        config,
        (progress) => {
          // 记录下载阶段的总数（第一次更新时）
          if (downloadPhaseTotal === undefined) {
            downloadPhaseTotal = progress.total;
          }

          // 将下载阶段的进度映射到整体进度
          // 下载阶段占整体进度的 0 到 downloadPhaseMax
          // 防止除零错误
          const mappedCurrent = progress.total > 0
            ? Math.round((progress.current / progress.total) * downloadPhaseMax)
            : 0;

          settingsStore.updateSyncProgress({
            stage: 'downloading',
            current: mappedCurrent,
            total: overallTotal,
            message: progress.message,
          });
        },
      );

      if (downloadResult.success && downloadResult.data) {
        // 进度已在回调中更新
        return { data: downloadResult.data };
      } else if (!downloadResult.success) {
        // 下载失败
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
   * 执行上传操作
   * @param config 同步配置
   * @param dataToUpload 要上传的数据
   * @param onSuccess 成功回调（可选），接收上传结果
   * @param onError 错误回调（可选），接收错误消息
   * @param uploadPhaseStart 上传阶段在整体进度中的起始位置（默认 0）
   * @param overallTotal 整体进度的总数值（默认使用上传阶段的 total）
   * @returns 上传结果
   */
  const performUpload = async (
    config: SyncConfig,
    dataToUpload: {
      aiModels: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      appSettings: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      novels: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      coverHistory: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      memories: Memory[];
    },
    onSuccess?: (result: { gistId?: string; isRecreated?: boolean; message?: string }) => void,
    onError?: (error: string) => void,
    uploadPhaseStart: number = 0,
    overallTotal: number | undefined = undefined,
  ): Promise<{
    success: boolean;
    gistId?: string;
    isRecreated?: boolean;
    message?: string;
    error?: string;
  }> => {
    try {
      // 更新进度：开始上传
      settingsStore.updateSyncProgress({
        stage: 'uploading',
        message: `正在上传数据 (${dataToUpload.novels.length} 本书籍)...`,
        current: uploadPhaseStart,
        total: overallTotal || 1, // 使用整体总进度，如果没有则使用初始值
      });

      // 上传数据（传递进度回调）
      // 将上传阶段的进度映射到整体进度
      let uploadPhaseTotal: number | undefined = undefined;
      const result = await gistSyncService.uploadToGist(
        config,
        dataToUpload,
        (progress) => {
          // 记录上传阶段的总数（第一次更新时）
          if (uploadPhaseTotal === undefined) {
            uploadPhaseTotal = progress.total;
          }

          // 将上传阶段的进度映射到整体进度
          // 上传阶段占整体进度的剩余部分（从 uploadPhaseStart 到 overallTotal）
          const uploadPhaseRange = (overallTotal || progress.total) - uploadPhaseStart;
          // 防止除零错误
          const mappedCurrent = progress.total > 0
            ? uploadPhaseStart + Math.round((progress.current / progress.total) * uploadPhaseRange)
            : uploadPhaseStart;
          const mappedTotal = overallTotal || progress.total;

          settingsStore.updateSyncProgress({
            stage: 'uploading',
            current: mappedCurrent,
            total: mappedTotal,
            message: progress.message,
          });
        },
      );

      if (result.success) {
        // 更新进度：上传完成
        // 使用整体总进度，确保进度达到 100%
        const finalTotal = overallTotal || settingsStore.syncProgress.total || 1;
        settingsStore.updateSyncProgress({
          message: '上传完成，正在更新状态...',
          current: finalTotal,
          total: finalTotal,
        });

        // 更新 Gist ID（等待完成）
        if (result.gistId) {
          try {
            await settingsStore.setGistId(result.gistId);
          } catch (error) {
            console.error('[useGistSync] 设置 Gist ID 失败:', error);
          }
        }

        // 更新同步时间（等待完成）
        try {
          await settingsStore.updateLastSyncTime();
          // 清理旧的删除记录（每次同步时都清理，避免记录无限增长）
          await settingsStore.cleanupOldDeletionRecords();
        } catch (error) {
          console.error('[useGistSync] 更新最后同步时间失败:', error);
        }

        if (onSuccess) {
          onSuccess(result);
        }
        return { ...result, success: true };
      } else {
        const errorMsg = result.error || '同步到 Gist 时发生未知错误';
        toast.add({
          severity: 'error',
          summary: '同步失败',
          detail: errorMsg,
          life: 5000,
        });
        if (onError) {
          onError(errorMsg);
        }
        return { success: false, error: errorMsg };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '同步时发生未知错误';
      toast.add({
        severity: 'error',
        summary: '同步失败',
        detail: errorMsg,
        life: 5000,
      });
      if (onError) {
        onError(errorMsg);
      }
      return { success: false, error: errorMsg };
    }
  };

  /**
   * 上传数据到 Gist
   * 上传前会先下载远程数据并合并，确保不会丢失远程更改
   * @param config 同步配置
   * @param setSyncing 设置同步状态的函数
   * @param onSuccess 成功回调（可选）
   * @param options 选项
   *   - forceLocalOnly: 强制使用本地数据（跳过下载），用于用户确认后重试
   */
  const uploadToGist = async (
    config: SyncConfig,
    setSyncing: (value: boolean) => void,
    onSuccess?: (result: { gistId?: string; isRecreated?: boolean; message?: string }) => void,
    options?: { forceLocalOnly?: boolean },
  ): Promise<void> => {
    setSyncing(true);
    try {
      // 准备本地数据
      // 使用批量加载方法加载所有 Memory 数据
      const bookIds = booksStore.books.map((book) => book.id);
      const memories = await MemoryService.getAllMemoriesForBooksFlat(bookIds);

      const localData = {
        aiModels: aiModelsStore.models,
        appSettings: settingsStore.getAllSettings(),
        novels: booksStore.books,
        coverHistory: coverHistoryStore.covers,
        memories,
      };

      // 计算整体流程的总进度
      // 流程：下载(30%) + 合并(10%) + 上传(60%)
      // 使用一个统一的 total 值，将各个阶段映射到这个 total
      const OVERALL_TOTAL = 100; // 使用 100 作为总进度单位
      const DOWNLOAD_PHASE_MAX = 30; // 下载阶段占 30%
      const MERGE_PHASE_MAX = 10; // 合并阶段占 10%
      // 上传阶段占剩余 60%（从 40% 到 100%）

      // 如果有 Gist ID 且不是强制本地模式，先下载远程数据并合并
      let dataToUpload = localData;
      if (config.syncParams.gistId && !options?.forceLocalOnly) {
        // 下载阶段：0-30%
        const { data: remoteData, error } = await downloadRemoteData(
          config,
          DOWNLOAD_PHASE_MAX,
          OVERALL_TOTAL,
        );

        if (error) {
          // 下载失败，显示警告让用户选择是否继续
          console.warn('[useGistSync] 下载远程数据失败:', error);
          
          // 保存待处理的上传数据，等待用户确认
          pendingUploadData.value = {
            config,
            localData,
            setSyncing,
            onSuccess,
          };
          
          // 显示确认对话框
          toast.add({
            severity: 'warn',
            summary: '下载远程数据失败',
            detail: `无法获取远程数据进行合并。继续上传可能会覆盖远程更改。错误: ${error}`,
            life: 10000,
          });
          
          // 返回，等待用户通过 confirmUploadWithLocalData 确认
          return;
        } else if (remoteData) {
          // 下载完成，进入合并阶段：30-40%
          settingsStore.updateSyncProgress({
            stage: 'merging',
            message: '正在合并本地和远程数据...',
            current: DOWNLOAD_PHASE_MAX,
            total: OVERALL_TOTAL,
          });

          // 合并本地和远程数据
          const lastSyncTime = settingsStore.gistSync.lastSyncTime ?? 0;
          dataToUpload = await SyncDataService.mergeDataForUpload(
            localData,
            remoteData,
            lastSyncTime,
          );

          // 合并完成，准备进入上传阶段：40%
          settingsStore.updateSyncProgress({
            stage: 'merging',
            message: '合并完成，准备上传...',
            current: DOWNLOAD_PHASE_MAX + MERGE_PHASE_MAX,
            total: OVERALL_TOTAL,
          });
        } else {
          // 没有远程数据，直接进入上传阶段：0-60%
          // 重置进度，从上传阶段开始
          settingsStore.updateSyncProgress({
            stage: 'uploading',
            message: '准备上传数据...',
            current: 0,
            total: OVERALL_TOTAL,
          });
        }
      } else {
        // 没有 Gist ID 或强制本地模式，直接上传：0-60%
        settingsStore.updateSyncProgress({
          stage: 'uploading',
          message: '准备上传数据...',
          current: 0,
          total: OVERALL_TOTAL,
        });
      }

      // 上传合并后的数据
      // 上传阶段：40-100%（如果有下载合并）或 0-60%（如果直接上传）
      const uploadPhaseStart = config.syncParams.gistId && !options?.forceLocalOnly
        ? DOWNLOAD_PHASE_MAX + MERGE_PHASE_MAX
        : 0;
      await performUpload(config, dataToUpload, onSuccess, undefined, uploadPhaseStart, OVERALL_TOTAL);
    } catch (error) {
      console.error('[useGistSync] 上传失败:', error);
    } finally {
      setSyncing(false);
    }
  };

  /**
   * 确认使用本地数据上传（当下载失败时）
   * 用户确认后调用此函数继续上传
   */
  const confirmUploadWithLocalData = async (): Promise<void> => {
    const pending = pendingUploadData.value;
    if (!pending) {
      console.warn('[useGistSync] 没有待处理的上传');
      return;
    }

    // 清除待处理数据
    pendingUploadData.value = null;

    // 使用强制本地模式重新上传
    await uploadToGist(
      pending.config,
      pending.setSyncing,
      pending.onSuccess,
      { forceLocalOnly: true },
    );
  };

  /**
   * 取消待处理的上传
   */
  const cancelPendingUpload = (): void => {
    if (pendingUploadData.value) {
      pendingUploadData.value.setSyncing(false);
      pendingUploadData.value = null;
      toast.add({
        severity: 'info',
        summary: '上传已取消',
        detail: '已取消上传操作',
        life: 3000,
      });
    }
  };

  /**
   * 检查是否有待处理的上传
   */
  const hasPendingUpload = (): boolean => {
    return pendingUploadData.value !== null;
  };

  /**
   * 恢复已删除的项目
   * @param items 要恢复的项目列表
   */
  const restoreDeletedItems = async (
    items: RestorableItem[],
  ): Promise<void> => {
    const settingsStore = useSettingsStore();
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

  /**
   * 下载并应用远程数据
   * 注意：此函数直接下载并应用远程数据，不进行冲突检查
   * @param config 同步配置
   * @param setSyncing 设置同步状态的函数
   * @returns 可恢复的项目列表（如果有）
   */
  const downloadFromGist = async (
    config: SyncConfig,
    setSyncing: (value: boolean) => void,
  ): Promise<RestorableItem[]> => {
    setSyncing(true);
    try {
      // 计算整体流程的总进度
      // 流程：下载(70%) + 应用(30%)
      const OVERALL_TOTAL = 100;
      const DOWNLOAD_PHASE_MAX = 70; // 下载阶段占 70%
      const APPLY_PHASE_MAX = 30; // 应用阶段占 30%

      // 下载阶段：0-70%
      const { data, error } = await downloadRemoteData(config, DOWNLOAD_PHASE_MAX, OVERALL_TOTAL);

      if (error) {
        return [];
      }

      // 应用下载的数据（总是使用最新的 lastEdited 时间）
      // 手动下载时，保留所有远程书籍，即使它们的 lastEdited 时间早于 lastSyncTime
      if (data) {
        // 更新进度：进入应用阶段，70-100%
        settingsStore.updateSyncProgress({
          stage: 'applying',
          message: '正在应用下载的数据...',
          current: DOWNLOAD_PHASE_MAX,
          total: OVERALL_TOTAL,
        });

        const restorableItems = await SyncDataService.applyDownloadedData(data, undefined, true);
        
        // 更新进度：应用完成，确保进度为 100%
        settingsStore.updateSyncProgress({
          current: OVERALL_TOTAL,
          total: OVERALL_TOTAL,
          message: '应用完成',
        });

        // 等待更新同步时间完成
        try {
          await settingsStore.updateLastSyncTime();
        } catch (updateError) {
          console.error('[useGistSync] 更新最后同步时间失败:', updateError);
        }

        // 如果有可恢复的项目，返回它们以便调用者显示对话框
        if (restorableItems.length > 0) {
          return restorableItems;
        }

        toast.add({
          severity: 'success',
          summary: '下载成功',
          detail: '从 Gist 下载数据成功',
          life: 3000,
        });
      }
      
      return [];
    } catch (downloadError) {
      console.error('[useGistSync] 下载失败:', downloadError);
      return [];
    } finally {
      setSyncing(false);
    }
  };

  return {
    uploadToGist,
    downloadFromGist,
    restoreDeletedItems,
    confirmUploadWithLocalData,
    cancelPendingUpload,
    hasPendingUpload,
    pendingUploadData,
  };
}
