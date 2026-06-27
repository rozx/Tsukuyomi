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
  const { executeSync, executeForceSync } = useSyncExecutor();

  /**
   * 构造传给 executeSync / executeForceSync 的选项
   * 两个入口共享相同的 toast 回调和默认参数，这里统一装配以消除重复
   */
  const buildExecutorOptions = (config?: SyncConfig) => ({
    messagePrefix: '',
    isManualRetrieval: true,
    ...(config ? { configOverride: config } : {}),
    onError: (summary: string, detail: string) => {
      toast.add({
        severity: 'error',
        summary,
        detail,
        life: 5000,
      });
    },
    onSuccess: (summary: string, detail: string) => {
      toast.add({
        severity: 'success',
        summary,
        detail,
        life: 3000,
      });
    },
  });

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
      const result = await executeSync(buildExecutorOptions(config));

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

    // 按类型分组并恢复
    const grouped = groupRestorableItems(items);
    await restoreGroupedItems(grouped);

    // 从删除记录中移除已恢复的项目
    await settingsStore.updateGistSync(recomputeDeletedRecords(gistSync, items));

    toast.add({
      severity: 'success',
      summary: '恢复成功',
      detail: `已恢复 ${items.length} 个项目`,
      life: 3000,
    });
  };

  /** 按 type 把待恢复项分成 novels / models / covers 三组 */
  function groupRestorableItems(
    items: RestorableItem[],
  ): { novels: unknown[]; models: unknown[]; covers: unknown[] } {
    const novels: unknown[] = [];
    const models: unknown[] = [];
    const covers: unknown[] = [];
    for (const item of items) {
      if (item.type === 'novel') {
        novels.push(item.data);
      } else if (item.type === 'model') {
        models.push(item.data);
      } else if (item.type === 'cover') {
        covers.push(item.data);
      }
    }
    return { novels, models, covers };
  }

  /** 把分组后的数据依次写回对应 store */
  async function restoreGroupedItems(grouped: {
    novels: unknown[];
    models: unknown[];
    covers: unknown[];
  }): Promise<void> {
    for (const novel of grouped.novels) {
      await booksStore.addBook(novel as Novel);
    }
    for (const model of grouped.models) {
      await aiModelsStore.addModel(model as Parameters<typeof aiModelsStore.addModel>[0]);
    }
    for (const cover of grouped.covers) {
      await coverHistoryStore.addCover(cover as Parameters<typeof coverHistoryStore.addCover>[0]);
    }
  }

  /** 判定某条删除记录是否应被保留（对应 type 的恢复项里不包含它） */
  function keepDeletedRecord(
    record: { id: string },
    items: RestorableItem[],
    type: RestorableItem['type'],
  ): boolean {
    return !items.some((item) => item.type === type && item.id === record.id);
  }

  /** 根据已恢复的 items 重新计算 gistSync 的各项删除记录字段 */
  function recomputeDeletedRecords(
    gistSync: typeof settingsStore.gistSync,
    items: RestorableItem[],
  ) {
    const deletedNovelIds = (gistSync.deletedNovelIds || []).filter((record) =>
      keepDeletedRecord(record, items, 'novel'),
    );
    const deletedModelIds = (gistSync.deletedModelIds || []).filter((record) =>
      keepDeletedRecord(record, items, 'model'),
    );
    const deletedCoverIds = (gistSync.deletedCoverIds || []).filter((record) =>
      keepDeletedRecord(record, items, 'cover'),
    );
    const restoredCoverUrls = collectRestoredCoverUrls(items);
    const deletedCoverUrls = (gistSync.deletedCoverUrls || []).filter(
      (record) => !restoredCoverUrls.has(String(record.url).trim()),
    );
    return { deletedNovelIds, deletedModelIds, deletedCoverIds, deletedCoverUrls };
  }

  /** 收集本次恢复的封面 URL（已 trim、非空） */
  function collectRestoredCoverUrls(items: RestorableItem[]): Set<string> {
    return new Set(
      items
        .filter((item) => item.type === 'cover')
        .map((item) => (item.data?.url ? String(item.data.url).trim() : ''))
        .filter((u) => u.length > 0),
    );
  }

  /**
   * 强制推送：用本地数据完全覆盖远端
   *
   * 与 sync() 的差异：
   *   - 不下载、不合并远端到本地
   *   - 远端上本地不存在的条目会被删除（严格镜像）
   *   - 跳过 pseudo-CAS 检查（用户已显式选择覆盖）
   *
   * 调用方（useForceSync）应在调用前已获得用户确认。
   * 成功时自动关闭 forceSyncMode；失败时保留 active=true 并写入 lastFailedAt。
   */
  const forceSync = async (config?: SyncConfig): Promise<void> => {
    if (settingsStore.isSyncing) {
      console.warn('[useGistSync] 同步已在进行中，跳过强制推送');
      return;
    }

    settingsStore.setSyncing(true);

    try {
      await executeForceSync(buildExecutorOptions(config));
    } catch (error) {
      console.error('[useGistSync] 强制推送异常:', error);
      const errorMsg = error instanceof Error ? error.message : '强制推送时发生未知错误';
      toast.add({
        severity: 'error',
        summary: '强制推送失败',
        detail: errorMsg,
        life: 5000,
      });
    } finally {
      settingsStore.setSyncing(false);
    }
  };

  return {
    sync,
    forceSync,
    restoreDeletedItems,
  };
}
