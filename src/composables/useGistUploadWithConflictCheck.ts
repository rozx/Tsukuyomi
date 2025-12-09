import { ref } from 'vue';
import { GistSyncService } from 'src/services/gist-sync-service';
import { SyncDataService } from 'src/services/sync-data-service';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';
import type { SyncConfig } from 'src/models/sync';
import type { ConflictItem, ConflictResolution } from 'src/services/conflict-detection-service';
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

  // 冲突相关状态
  const showConflictDialog = ref(false);
  const detectedConflicts = ref<ConflictItem[]>([]);
  const pendingRemoteData = ref<{
    novels: any[];
    aiModels: any[];
    appSettings?: any;
    coverHistory?: any[];
  } | null>(null);

  /**
   * 检查冲突（如果存在 Gist ID）
   * @param config 同步配置
   * @returns 如果有冲突返回 true，否则返回 false
   */
  const checkConflicts = async (config: SyncConfig): Promise<boolean> => {
    if (!config.syncParams.gistId) {
      return false; // 没有 Gist ID，无需检查冲突
    }

    try {
      // 下载远程更改
      const downloadResult = await gistSyncService.downloadFromGist(config);

      if (downloadResult.success && downloadResult.data) {
        // 检测冲突
        const { hasConflicts, conflicts, safeRemoteData } =
          SyncDataService.detectConflictsAndCreateSafeData(downloadResult.data);

        if (hasConflicts) {
          // 有冲突，保存状态供后续处理
          detectedConflicts.value = conflicts;
          pendingRemoteData.value = safeRemoteData;
          return true;
        }
      } else if (!downloadResult.success) {
        // 下载失败
        toast.add({
          severity: 'error',
          summary: '检查冲突失败',
          detail: downloadResult.error || '从 Gist 下载数据时发生未知错误',
          life: 5000,
        });
        throw new Error(downloadResult.error || '从 Gist 下载数据时发生未知错误');
      }
    } catch (error) {
      toast.add({
        severity: 'error',
        summary: '检查冲突失败',
        detail: error instanceof Error ? error.message : '检查冲突时发生未知错误',
        life: 5000,
      });
      throw error;
    }

    return false; // 无冲突
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
  ): Promise<{ success: boolean; gistId?: string; isRecreated?: boolean; message?: string; error?: string }> => {
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
        return { success: true, ...result };
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
   * 上传前检查冲突并上传（如果无冲突）
   * @param config 同步配置
   * @param setSyncing 设置同步状态的函数
   * @param onSuccess 成功回调（可选）
   * @returns 如果有冲突返回 true，否则返回 false
   */
  const uploadWithConflictCheck = async (
    config: SyncConfig,
    setSyncing: (value: boolean) => void,
    onSuccess?: (result: { gistId?: string; isRecreated?: boolean; message?: string }) => void,
  ): Promise<boolean> => {
    // 检查冲突
    setSyncing(true);
    try {
      const hasConflicts = await checkConflicts(config);

      if (hasConflicts) {
        // 有冲突，显示对话框
        showConflictDialog.value = true;
        setSyncing(false);
        return true;
      }

      // 无冲突，直接上传
      await performUpload(config, onSuccess);
      return false;
    } catch (error) {
      setSyncing(false);
      return false; // 发生错误，不继续
    } finally {
      setSyncing(false);
    }
  };

  /**
   * 处理冲突解决后的上传
   * @param config 同步配置
   * @param resolutions 冲突解决结果
   * @param setSyncing 设置同步状态的函数
   * @param onSuccess 成功回调（可选），接收上传结果
   */
  const handleConflictResolveAndUpload = async (
    config: SyncConfig,
    resolutions: ConflictResolution[],
    setSyncing: (value: boolean) => void,
    onSuccess?: (result: { gistId?: string; isRecreated?: boolean; message?: string }) => void,
  ): Promise<void> => {
    if (!pendingRemoteData.value) {
      showConflictDialog.value = false;
      pendingRemoteData.value = null;
      detectedConflicts.value = [];
      return;
    }

    const safeRemoteData = SyncDataService.createSafeRemoteData(pendingRemoteData.value);
    setSyncing(true);
    showConflictDialog.value = false;

    try {
      // 应用冲突解决后的数据
      await SyncDataService.applyDownloadedData(safeRemoteData, resolutions);

      // 更新同步时间
      void co(function* () {
        try {
          yield settingsStore.updateLastSyncTime();
        } catch (error) {
          console.error('[useGistUploadWithConflictCheck] 更新最后同步时间失败:', error);
        }
      });

      // 上传最终状态
      if (config.enabled) {
        await performUpload(config, onSuccess);
      } else {
        toast.add({
          severity: 'success',
          summary: '同步完成',
          detail: '冲突已解决，数据已同步',
          life: 3000,
        });
      }
    } catch (error) {
      toast.add({
        severity: 'error',
        summary: '同步失败',
        detail: error instanceof Error ? error.message : '应用冲突解决时发生错误',
        life: 5000,
      });
    } finally {
      setSyncing(false);
      pendingRemoteData.value = null;
      detectedConflicts.value = [];
    }
  };

  /**
   * 取消冲突解决
   */
  const handleConflictCancel = (): void => {
    showConflictDialog.value = false;
    pendingRemoteData.value = null;
    detectedConflicts.value = [];
  };

  return {
    showConflictDialog,
    detectedConflicts,
    pendingRemoteData,
    uploadWithConflictCheck,
    handleConflictResolveAndUpload,
    handleConflictCancel,
  };
}

