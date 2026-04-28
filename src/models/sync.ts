export interface DeletionRecord {
  id: string;
  deletedAt: number; // 删除时间戳（毫秒）
  /**
   * 仅 memory 删除记录使用：归属书籍 id。
   *
   * 上传时根据它把墓碑写入对应的 `memories:<bookId>` envelope；
   * 缺失（旧版本写入的记录）会跳过 envelope 注入，仅参与 TTL 修剪。
   */
  bookId?: string;
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
  // 上次已知的远程 manifest 条目完整元数据（entryKey -> { hash, chunks }）
  // 用于在上传时无需额外 GET 也能枚举一个 entry 的所有 Gist 文件名
  //（停止依赖 remoteFilesSnapshot：单独 hashes 不足以知道每本书的 chunk 数）
  knownRemoteEntries?: Record<string, { hash: string; chunks?: number }>;
  // 上次已知的远程墓碑（entryKey -> deletedAt ISO 字符串）
  // 用于在多设备间保留墓碑，避免单设备上传时丢失其他设备记录的删除
  knownRemoteTombstones?: Record<string, string>;
  // 强制推送模式状态（本地覆盖远端）
  // active=true 时，点击"同步"执行单向强制推送；成功后自动置回 false
  // lastFailedAt 仅在上次强制推送失败后保留，用于 UI 展示失败 badge
  // 旧数据缺失该字段时等同 { active: false }
  forceSyncMode?: {
    active: boolean;
    lastFailedAt?: number;
  };
}

export enum SyncType {
  Gist = 'gist',
}
