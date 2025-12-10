import { GistSyncService } from 'src/services/gist-sync-service';
import { SyncDataService } from 'src/services/sync-data-service';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';
import type { SyncConfig } from 'src/models/sync';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import co from 'co';

/**
 * Gist 上传前冲突检查 composable
 * 提供冲突检查和上传的通用逻辑
 */
export function useGistUploadWithConflictCheck() {
  const settingsStore = useSettingsStore();
  const aiModelsStore = useAIModelsStore();
  const booksStore = useBooksStore();
  const coverHistoryStore = useCoverHistoryStore();
  const toast = useToastWithHistory();
  const gistSyncService = new GistSyncService();

  /**
   * 下载远程数据（不再检查冲突）
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
   * @param onSuccess 成功回调（可选），接收上传结果
   * @param onError 错误回调（可选），接收错误消息
   * @returns 上传结果
   */
  const performUpload = async (
    config: SyncConfig,
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
      const result = await gistSyncService.uploadToGist(config, {
        aiModels: aiModelsStore.models,
        appSettings: settingsStore.getAllSettings(),
        novels: booksStore.books,
        coverHistory: coverHistoryStore.covers,
      });

      if (result.success) {
        // 更新 Gist ID
        if (result.gistId) {
          const gistIdValue = result.gistId;
          void co(function* () {
            try {
              yield settingsStore.setGistId(gistIdValue);
            } catch (error) {
              console.error('[useGistUploadWithConflictCheck] 设置 Gist ID 失败:', error);
            }
          });
        }

        // 更新同步时间
        void co(function* () {
          try {
            yield settingsStore.updateLastSyncTime();
          } catch (error) {
            console.error('[useGistUploadWithConflictCheck] 更新最后同步时间失败:', error);
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
   * 上传前下载远程数据并上传（不再检查冲突）
   * @param config 同步配置
   * @param setSyncing 设置同步状态的函数
   * @param onSuccess 成功回调（可选）
   */
  const uploadWithConflictCheck = async (
    config: SyncConfig,
    setSyncing: (value: boolean) => void,
    onSuccess?: (result: { gistId?: string; isRecreated?: boolean; message?: string }) => void,
  ): Promise<void> => {
    setSyncing(true);
    try {
      // 先下载远程数据并应用（使用最新的 lastEdited 时间）
      const { data, error } = await downloadRemoteData(config);
      if (error) {
        // 下载失败，仍然尝试上传
        await performUpload(config, onSuccess);
        return;
      }

      if (data) {
        // 应用远程数据（总是使用最新的 lastEdited 时间）
        await SyncDataService.applyDownloadedData(data);
        void co(function* () {
          try {
            yield settingsStore.updateLastSyncTime();
          } catch (error) {
            console.error('[useGistUploadWithConflictCheck] 更新最后同步时间失败:', error);
          }
        });
      }

      // 然后上传本地数据（包含刚刚合并的远程数据）
      await performUpload(config, onSuccess);
    } catch (error) {
      console.error('[useGistUploadWithConflictCheck] 上传失败:', error);
    } finally {
      setSyncing(false);
    }
  };

  /**
   * 下载并应用远程数据（不再检查冲突）
   * @param config 同步配置
   * @param setSyncing 设置同步状态的函数
   */
  const downloadWithConflictCheck = async (
    config: SyncConfig,
    setSyncing: (value: boolean) => void,
  ): Promise<void> => {
    setSyncing(true);
    try {
      const { data, error } = await downloadRemoteData(config);

      if (error) {
        return;
      }

      // 应用下载的数据（总是使用最新的 lastEdited 时间）
      if (data) {
        await SyncDataService.applyDownloadedData(data);
        void co(function* () {
          try {
            yield settingsStore.updateLastSyncTime();
          } catch (error) {
            console.error('[useGistUploadWithConflictCheck] 更新最后同步时间失败:', error);
          }
        });
        toast.add({
          severity: 'success',
          summary: '下载成功',
          detail: '从 Gist 下载数据成功',
          life: 3000,
        });
      }
    } catch (error) {
      console.error('[useGistUploadWithConflictCheck] 下载失败:', error);
    } finally {
      setSyncing(false);
    }
  };

  return {
    uploadWithConflictCheck,
    downloadWithConflictCheck,
  };
}
