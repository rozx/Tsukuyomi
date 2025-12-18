export interface DeletionRecord {
  id: string;
  deletedAt: number; // 删除时间戳（毫秒）
}

export interface SyncConfig {
  enabled: boolean;
  lastSyncTime: number;
  syncInterval: number;
  syncType: SyncType;
  syncParams: Record<string, string>;
  secret: string;
  apiEndpoint: string;
  // 上次同步时的模型 ID 列表（用于检测本地删除）
  lastSyncedModelIds?: string[];
  // 删除记录列表（用于追踪删除操作）
  deletedNovelIds?: DeletionRecord[];
  deletedModelIds?: DeletionRecord[];
  deletedCoverIds?: DeletionRecord[];
}

export enum SyncType {
  Gist = 'gist',
}
