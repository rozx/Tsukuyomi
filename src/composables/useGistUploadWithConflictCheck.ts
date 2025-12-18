import { GistSyncService } from 'src/services/gist-sync-service';
import { SyncDataService } from 'src/services/sync-data-service';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';
import type { SyncConfig } from 'src/models/sync';
import type { Novel } from 'src/models/novel';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import co from 'co';

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

  /**
   * 下载远程数据
   * @param config 同步配置
   * @returns 下载的数据
   */
  const downloadRemoteData = async (
    config: SyncConfig,
  ): Promise<{ data?: any; error?: string }> => {
    if (!config.syncParams.gistId) {
      return {}; // 没有 Gist ID，无需下载
    }

    try {
      // 下载远程更改
      const downloadResult = await gistSyncService.downloadFromGist(config);

      if (downloadResult.success && downloadResult.data) {
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
   * @returns 上传结果
   */
  const performUpload = async (
    config: SyncConfig,
    dataToUpload: {
      aiModels: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      appSettings: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      novels: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      coverHistory: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    },
    onSuccess?: (result: { gistId?: string; isRecreated?: boolean; message?: string }) => void,
    onError?: (error: string) => void,
  ): Promise<{
    success: boolean;
    gistId?: string;
    isRecreated?: boolean;
    message?: string;
    error?: string;
  }> => {
    try {
      const result = await gistSyncService.uploadToGist(config, dataToUpload);

      if (result.success) {
        // 更新 Gist ID
        if (result.gistId) {
          const gistIdValue = result.gistId;
          void co(function* () {
            try {
              yield settingsStore.setGistId(gistIdValue);
            } catch (error) {
              console.error('[useGistSync] 设置 Gist ID 失败:', error);
            }
          });
        }

        // 更新同步时间
        void co(function* () {
          try {
            yield settingsStore.updateLastSyncTime();
          } catch (error) {
            console.error('[useGistSync] 更新最后同步时间失败:', error);
          }
        });

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
   */
  const uploadToGist = async (
    config: SyncConfig,
    setSyncing: (value: boolean) => void,
    onSuccess?: (result: { gistId?: string; isRecreated?: boolean; message?: string }) => void,
  ): Promise<void> => {
    setSyncing(true);
    try {
      // 准备本地数据
      const localData = {
        aiModels: aiModelsStore.models,
        appSettings: settingsStore.getAllSettings(),
        novels: booksStore.books,
        coverHistory: coverHistoryStore.covers,
      };

      // 如果有 Gist ID，先下载远程数据并合并
      let dataToUpload = localData;
      if (config.syncParams.gistId) {
        const { data: remoteData, error } = await downloadRemoteData(config);

        if (error) {
          // 下载失败，但继续使用本地数据上传（可能是网络问题，不应该阻止上传）
          console.warn('[useGistSync] 下载远程数据失败，使用本地数据上传:', error);
        } else if (remoteData) {
          // 合并本地和远程数据
          const lastSyncTime = settingsStore.gistSync.lastSyncTime ?? 0;
          dataToUpload = await SyncDataService.mergeDataForUpload(
            localData,
            remoteData,
            lastSyncTime,
          );
        }
      }

      // 上传合并后的数据
      await performUpload(config, dataToUpload, onSuccess);
    } catch (error) {
      console.error('[useGistSync] 上传失败:', error);
    } finally {
      setSyncing(false);
    }
  };

  /**
   * 恢复已删除的项目
   * @param items 要恢复的项目列表
   */
  const restoreDeletedItems = async (
    items: SyncDataService.RestorableItem[],
  ): Promise<void> {
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

    await settingsStore.updateGistSync({
      deletedNovelIds,
      deletedModelIds,
      deletedCoverIds,
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
  ): Promise<SyncDataService.RestorableItem[]> => {
    setSyncing(true);
    try {
      const { data, error } = await downloadRemoteData(config);

      if (error) {
        return;
      }

      // 应用下载的数据（总是使用最新的 lastEdited 时间）
      // 手动下载时，保留所有远程书籍，即使它们的 lastEdited 时间早于 lastSyncTime
      if (data) {
        const restorableItems = await SyncDataService.applyDownloadedData(data, undefined, true);
        
        void co(function* () {
          try {
            yield settingsStore.updateLastSyncTime();
          } catch (error) {
            console.error('[useGistSync] 更新最后同步时间失败:', error);
          }
        });

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
    } catch (error) {
      console.error('[useGistSync] 下载失败:', error);
    } finally {
      setSyncing(false);
    }
  };

  return {
    uploadToGist,
    downloadFromGist,
    restoreDeletedItems,
  };
}
