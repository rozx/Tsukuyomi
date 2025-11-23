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
}

export enum SyncType {
  Gist = 'gist',
}
