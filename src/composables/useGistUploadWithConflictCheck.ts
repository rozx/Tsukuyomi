import type { RestorableItem } from 'src/services/sync-data-service';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';
import type { Novel } from 'src/models/novel';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useSyncExecutor } from 'src/composables/useSyncExecutor';
import type { SyncConfig } from 'src/models/sync';

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
  const { executeSync } = useSyncExecutor();

  /**
   * 统一的双向同步操作
   * 流程：下载远程数据 → 应用/合并 → 检测本地变更 → 有变更才上传
   *
   * @param config 同步配置（可选，默认使用 store 中的配置）
   * @returns 可恢复的已删除项目列表（手动同步时返回，供 UI 展示恢复对话框）
   */
  const sync = async (config?: SyncConfig): Promise<RestorableItem[]> => {
    // 检查同步是否已在进行中
    if (settingsStore.isSyncing) {
      console.warn('[useGistSync] 同步已在进行中，跳过');
      return [];
    }

    settingsStore.setSyncing(true);

    try {
      const result = await executeSync({
        messagePrefix: '',
        isManualRetrieval: true,
        ...(config ? { configOverride: config } : {}),
        onError: (summary, detail) => {
          toast.add({
            severity: 'error',
            summary,
            detail,
            life: 5000,
          });
        },
        onSuccess: (summary, detail) => {
          toast.add({
            severity: 'success',
            summary,
            detail,
            life: 3000,
          });
        },
      });

      return result.restorableItems;
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
