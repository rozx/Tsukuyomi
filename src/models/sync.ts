export interface DeletionRecord {
  id: string;
  deletedAt: number; // 删除时间戳（毫秒）
}

/**
 * 基于 URL 的删除记录（用于跨设备去重：同一 URL 可能拥有不同的 id）
 */
export interface UrlDeletionRecord {
  url: string;
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
  // 封面删除记录（按 URL），用于跨设备场景：同一 URL 不同 id 时也能阻止“复活”
  deletedCoverUrls?: UrlDeletionRecord[];
}

export enum SyncType {
  Gist = 'gist',
}
