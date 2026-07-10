import type { RestorableItem } from 'src/services/sync-data-service';
import { MemoryService } from 'src/services/memory-service';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';
import type { Novel } from 'src/models/novel';
import type { Memory } from 'src/models/memory';
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

  /** 按 type 把待恢复项分成 novels / models / covers / memories 四组 */
  function groupRestorableItems(
    items: RestorableItem[],
  ): { novels: unknown[]; models: unknown[]; covers: unknown[]; memories: unknown[] } {
    const novels: unknown[] = [];
    const models: unknown[] = [];
    const covers: unknown[] = [];
    const memories: unknown[] = [];
    for (const item of items) {
      if (item.type === 'novel') {
        novels.push(item.data);
      } else if (item.type === 'model') {
        models.push(item.data);
      } else if (item.type === 'cover') {
        covers.push(item.data);
      } else if (item.type === 'memory') {
        memories.push(item.data);
      }
    }
    return { novels, models, covers, memories };
  }

  /**
   * 把分组后的数据依次写回对应 store。
   *
   * 恢复时必须把时间戳刷新为当前时刻：data 携带的是删除前的旧时间戳，
   * 各设备墓碑的 deletedAt 都晚于它——若原样写回，manifest 复活规则会
   * 保留墓碑（entry.lastEdited < deletedAt），下轮同步就会把刚恢复的
   * 项目再次删除（"僵尸删除"）。刷新后墓碑在下次构建 manifest 时被
   * 复活规则自动修剪。
   */
  async function restoreGroupedItems(grouped: {
    novels: unknown[];
    models: unknown[];
    covers: unknown[];
    memories: unknown[];
  }): Promise<void> {
    const now = Date.now();
    for (const novel of grouped.novels) {
      await booksStore.addBook({ ...(novel as Novel), lastEdited: new Date(now) });
    }
    for (const model of grouped.models) {
      await aiModelsStore.addModel({
        ...(model as Parameters<typeof aiModelsStore.addModel>[0]),
        lastEdited: new Date(now),
      });
    }
    // 封面无需手动刷新时间戳：addCover 内部总会写入当前时刻的 addedAt
    for (const cover of grouped.covers) {
      await coverHistoryStore.addCover(cover as Parameters<typeof coverHistoryStore.addCover>[0]);
    }
    // Memory 恢复：data 是携带 bookId 的完整 Memory，走 upsertMemoryForSync 写回 IndexedDB
    for (const memory of grouped.memories) {
      await MemoryService.upsertMemoryForSync({ ...(memory as Memory), lastAccessedAt: now });
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
    const deletedMemoryIds = (gistSync.deletedMemoryIds || []).filter((record) =>
      keepDeletedRecord(record, items, 'memory'),
    );
    const restoredCoverUrls = collectRestoredCoverUrls(items);
    const deletedCoverUrls = (gistSync.deletedCoverUrls || []).filter(
      (record) => !restoredCoverUrls.has(String(record.url).trim()),
    );
    return {
      deletedNovelIds,
      deletedModelIds,
      deletedCoverIds,
      deletedMemoryIds,
      deletedCoverUrls,
      knownRemoteTombstones: pruneRestoredTombstones(gistSync.knownRemoteTombstones, items),
    };
  }

  /**
   * 清除已恢复项对应的远端墓碑快照（novel:<id> / memories:<bookId>），
   * 否则本地会在下轮上传时把旧墓碑重新写回 manifest
   */
  function pruneRestoredTombstones(
    knownRemoteTombstones: Record<string, string> | undefined,
    items: RestorableItem[],
  ): Record<string, string> {
    const restoredTombstoneKeys = new Set<string>();
    for (const item of items) {
      if (item.type === 'novel') {
        restoredTombstoneKeys.add(`novel:${item.id}`);
      } else if (item.type === 'memory' && item.data?.bookId) {
        restoredTombstoneKeys.add(`memories:${String(item.data.bookId)}`);
      }
    }
    const pruned: Record<string, string> = {};
    for (const [key, deletedAt] of Object.entries(knownRemoteTombstones || {})) {
      if (!restoredTombstoneKeys.has(key)) {
        pruned[key] = deletedAt;
      }
    }
    return pruned;
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
