import { completeIdbTransaction } from 'src/utils/complete-idb-transaction';
import type { IDBPDatabase } from 'idb';
import type { TsukuyomiDB } from 'src/utils/indexed-db';
import type { SyncConfig } from 'src/models/sync';
import { SyncType } from 'src/models/sync';

type StoredConfig = SyncConfig & { id: string };
interface ConfigStore {
  getAll(): Promise<StoredConfig[]>;
  put(value: StoredConfig): Promise<string>;
}

export function createDefaultGistSyncConfig(): SyncConfig {
  return {
    enabled: false,
    lastSyncTime: 0,
    syncInterval: 300000,
    syncType: SyncType.Gist,
    syncParams: {},
    secret: '',
    apiEndpoint: '',
    lastSyncedModelIds: [],
    deletedNovelIds: [],
    deletedModelIds: [],
    deletedCoverIds: [],
    deletedCoverUrls: [],
    deletedMemoryIds: [],
  };
}

export function mergeGistSyncConfig(
  existing: SyncConfig | undefined,
  updates: Partial<SyncConfig>,
): SyncConfig {
  const defaults = createDefaultGistSyncConfig();
  const defined = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined),
  );
  const merged: SyncConfig = {
    ...defaults,
    ...existing,
    ...defined,
    syncParams: { ...defaults.syncParams, ...existing?.syncParams, ...updates.syncParams },
  };
  delete merged.lastRemoteUpdatedAt;
  return merged;
}

/** 使用调用者的事务，供普通删除及导入撤销共同提交。 */
export async function mergeBookDeletionRecords(
  store: ConfigStore,
  bookIds: string[],
  deletedAt: number,
): Promise<void> {
  if (!bookIds.length) return;
  if (!Number.isFinite(deletedAt) || bookIds.some((id) => !id))
    throw new Error('INVALID_DELETION: 删除记录无效');
  let configs = (await store.getAll()).filter((config) => config.syncType === SyncType.Gist);
  if (!configs.length) configs = [{ ...createDefaultGistSyncConfig(), id: 'sync-gist' }];
  for (const config of configs) {
    const records = new Map((config.deletedNovelIds ?? []).map((record) => [record.id, record]));
    for (const id of bookIds) {
      if ((records.get(id)?.deletedAt ?? -Infinity) < deletedAt) records.set(id, { id, deletedAt });
    }
    await store.put({ ...config, deletedNovelIds: [...records.values()] });
  }
}

/** 只补调用方明确提供的字段，不用旧页面的整份配置覆盖数据库。 */
export async function patchGistSyncConfig(
  db: IDBPDatabase<TsukuyomiDB>,
  updates: Partial<SyncConfig>,
  fallback?: SyncConfig,
): Promise<SyncConfig> {
  const tx = db.transaction('sync-configs', 'readwrite');
  return completeIdbTransaction(tx, async () => {
    const stored = (await tx.store.getAll()).find((config) => config.syncType === SyncType.Gist);
    const merged = mergeGistSyncConfig(stored ?? fallback, updates);
    const { id: _id, ...config } = merged as StoredConfig;
    await tx.store.put({ ...config, id: stored?.id ?? 'sync-gist' });
    return config;
  });
}
