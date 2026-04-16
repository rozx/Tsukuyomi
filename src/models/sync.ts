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
  // 封面删除记录（按 URL），用于跨设备场景：同一 URL 不同 id 时也能阻止"复活"
  deletedCoverUrls?: UrlDeletionRecord[];
  // Memory 删除记录（用于防止远程同步恢复已删除的 Memory）
  deletedMemoryIds?: DeletionRecord[];
  /**
   * @deprecated 由 `lastRemoteETag` 取代。保留仅用于读取旧配置以实现平滑升级。
   * 新代码路径不再读写此字段。
   */
  lastRemoteUpdatedAt?: string;
  // 上次成功同步时远程 Gist 响应的 ETag，用于条件 GET 与伪 CAS
  lastRemoteETag?: string;
  // 上次已知的远程 manifest 条目哈希表（entryKey -> sha256 hex）
  // 用于增量上传/下载的 diff 计算
  knownRemoteHashes?: Record<string, string>;
}

export enum SyncType {
  Gist = 'gist',
}
