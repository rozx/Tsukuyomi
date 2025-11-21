import { defineStore, acceptHMRUpdate } from 'pinia';
import type { AppSettings } from 'src/types/settings';
import type { SyncConfig } from 'src/types/sync';
import { SyncType } from 'src/types/sync';
import type { AIModelDefaultTasks } from 'src/types/ai/ai-model';
import { getDB } from 'src/utils/indexed-db';

/**
 * 默认设置
 */
const DEFAULT_SETTINGS: AppSettings = {
  scraperConcurrencyLimit: 3,
  taskDefaultModels: {},
  lastOpenedSettingsTab: 0,
};

/**
 * 默认 Gist 同步配置
 */
function createDefaultGistSyncConfig(): SyncConfig {
  return {
    enabled: false,
    lastSyncTime: 0,
    syncInterval: 300000, // 5 分钟
    syncType: SyncType.Gist,
    syncParams: {},
    secret: '',
    apiEndpoint: '',
    lastSyncedModelIds: [],
  };
}

/**
 * 从 IndexedDB 加载设置
 */
async function loadSettingsFromDB(): Promise<AppSettings> {
  try {
    const db = await getDB();
    const stored = await db.get('settings', 'app');
    if (stored) {
      const { key: _key, ...settings } = stored;
      // 合并默认设置，确保所有字段都存在
      return {
        ...DEFAULT_SETTINGS,
        ...settings,
        taskDefaultModels: {
          ...DEFAULT_SETTINGS.taskDefaultModels,
          ...(settings.taskDefaultModels || {}),
        },
      };
    }
  } catch (error) {
    console.error('Failed to load settings from DB:', error);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * 保存设置到 IndexedDB
 */
async function saveSettingsToDB(settings: AppSettings): Promise<void> {
  try {
    const db = await getDB();
    await db.put('settings', { key: 'app', ...settings });
  } catch (error) {
    console.error('Failed to save settings to DB:', error);
  }
}

/**
 * 从 IndexedDB 加载同步配置
 */
async function loadSyncFromDB(): Promise<SyncConfig[]> {
  try {
    const db = await getDB();
    const syncs = await db.getAll('sync-configs');
    return syncs.map((sync) => {
      const { id: _id, ...syncConfig } = sync;
      return {
        ...createDefaultGistSyncConfig(),
        ...syncConfig,
        syncParams: {
          ...createDefaultGistSyncConfig().syncParams,
          ...(syncConfig.syncParams || {}),
        },
      };
    });
  } catch (error) {
    console.error('Failed to load sync from DB:', error);
    return [];
  }
}

/**
 * 保存同步配置到 IndexedDB
 */
async function saveSyncToDB(syncs: SyncConfig[]): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('sync-configs', 'readwrite');
    const store = tx.objectStore('sync-configs');

    // 先清空现有配置
    await store.clear();

    // 保存新配置
    for (let i = 0; i < syncs.length; i++) {
      const sync = syncs[i];
      if (!sync) continue;
      await store.put({
        id: `sync-${i}`,
        enabled: sync.enabled,
        lastSyncTime: sync.lastSyncTime,
        syncInterval: sync.syncInterval,
        syncType: sync.syncType,
        syncParams: sync.syncParams,
        secret: sync.secret,
        apiEndpoint: sync.apiEndpoint,
        ...(sync.lastSyncedModelIds !== undefined ? { lastSyncedModelIds: sync.lastSyncedModelIds } : {}),
      });
    }

    await tx.done;
  } catch (error) {
    console.error('Failed to save sync to DB:', error);
  }
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    settings: { ...DEFAULT_SETTINGS } as AppSettings,
    syncs: [] as SyncConfig[],
    isSyncing: false, // 全局同步状态
    isLoaded: false,
  }),

  getters: {
    /**
     * 获取爬虫并发数限制
     */
    scraperConcurrencyLimit: (state): number => {
      return state.settings.scraperConcurrencyLimit;
    },

    /**
     * 获取任务的默认模型 ID
     */
    getTaskDefaultModelId: (state) => {
      return (task: keyof AIModelDefaultTasks): string | null | undefined => {
        return state.settings.taskDefaultModels?.[task];
      };
    },

    /**
     * 获取最后打开的设置标签页索引
     */
    lastOpenedSettingsTab: (state): number => {
      return state.settings.lastOpenedSettingsTab ?? 0;
    },

    /**
     * 获取 Gist 同步配置（第一个 Gist 类型的同步配置）
     */
    gistSync: (state): SyncConfig => {
      const gistSync = state.syncs.find((sync) => sync.syncType === SyncType.Gist);
      return gistSync ?? createDefaultGistSyncConfig();
    },
  },

  actions: {
    /**
     * 从 IndexedDB 加载设置和同步配置
     */
    async loadSettings(): Promise<void> {
      if (this.isLoaded) {
        return;
      }

      this.settings = await loadSettingsFromDB();
      this.syncs = await loadSyncFromDB();
      this.isLoaded = true;
    },

    /**
     * 更新设置
     * 需要深度合并 taskDefaultModels
     */
    async updateSettings(updates: Partial<AppSettings>): Promise<void> {
      // 深度合并 taskDefaultModels
      const mergedSettings: AppSettings = {
        ...this.settings,
        ...updates,
      };
      
      if (updates.taskDefaultModels !== undefined) {
        mergedSettings.taskDefaultModels = {
          ...this.settings.taskDefaultModels,
          ...updates.taskDefaultModels,
        };
      }
      
      this.settings = mergedSettings;
      await saveSettingsToDB(this.settings);
    },

    /**
     * 设置爬虫并发数限制
     */
    async setScraperConcurrencyLimit(limit: number): Promise<void> {
      if (limit < 1) {
        limit = 1;
      }
      if (limit > 10) {
        limit = 10;
      }
      await this.updateSettings({ scraperConcurrencyLimit: limit });
    },

    /**
     * 设置任务的默认模型 ID
     */
    async setTaskDefaultModelId(task: keyof AIModelDefaultTasks, modelId: string | null): Promise<void> {
      const taskDefaultModels = {
        ...this.settings.taskDefaultModels,
        [task]: modelId,
      };
      await this.updateSettings({ taskDefaultModels });
    },

    /**
     * 重置为默认设置
     */
    async resetToDefaults(): Promise<void> {
      this.settings = { ...DEFAULT_SETTINGS };
      await saveSettingsToDB(this.settings);
    },

    /**
     * 获取所有设置（用于导出）
     */
    getAllSettings(): AppSettings {
      return { ...this.settings };
    },

    /**
     * 导入设置（用于导入）
     * 需要深度合并 taskDefaultModels，避免覆盖现有配置
     */
    async importSettings(settings: Partial<AppSettings>): Promise<void> {
      // 深度合并 taskDefaultModels，确保不会丢失本地配置
      const mergedSettings: Partial<AppSettings> = {
        ...settings,
      };
      
      if (settings.taskDefaultModels !== undefined) {
        // 如果远程有 taskDefaultModels，深度合并
        mergedSettings.taskDefaultModels = {
          ...this.settings.taskDefaultModels,
          ...settings.taskDefaultModels,
        };
      }
      
      await this.updateSettings(mergedSettings);
    },

    /**
     * 设置最后打开的设置标签页索引
     */
    async setLastOpenedSettingsTab(tabIndex: number): Promise<void> {
      await this.updateSettings({ lastOpenedSettingsTab: tabIndex });
    },

    /**
     * 更新 Gist 同步配置
     */
    async updateGistSync(updates: Partial<SyncConfig>): Promise<void> {
      const index = this.syncs.findIndex((sync) => sync.syncType === SyncType.Gist);
      const defaultConfig = createDefaultGistSyncConfig();
      const existingConfig = index >= 0 ? this.syncs[index] : undefined;

      const lastSyncedModelIds = updates.lastSyncedModelIds ?? existingConfig?.lastSyncedModelIds ?? defaultConfig.lastSyncedModelIds;

      const updatedConfig: SyncConfig = {
        enabled: updates.enabled ?? existingConfig?.enabled ?? defaultConfig.enabled,
        lastSyncTime: updates.lastSyncTime !== undefined ? updates.lastSyncTime : (existingConfig?.lastSyncTime ?? defaultConfig.lastSyncTime),
        syncInterval: updates.syncInterval !== undefined ? updates.syncInterval : (existingConfig?.syncInterval ?? defaultConfig.syncInterval),
        syncType: updates.syncType ?? existingConfig?.syncType ?? defaultConfig.syncType,
        syncParams: {
          ...(existingConfig?.syncParams ?? defaultConfig.syncParams),
          ...(updates.syncParams || {}),
        },
        secret: updates.secret ?? existingConfig?.secret ?? defaultConfig.secret,
        apiEndpoint: updates.apiEndpoint ?? existingConfig?.apiEndpoint ?? defaultConfig.apiEndpoint,
        ...(lastSyncedModelIds !== undefined ? { lastSyncedModelIds } : {}),
      };

      if (index >= 0) {
        // 更新现有配置对象的所有属性，确保响应式更新
        const existing = this.syncs[index];
        if (existing) {
          Object.keys(updatedConfig).forEach((key) => {
            const typedKey = key as keyof SyncConfig;
            if (updatedConfig[typedKey] !== undefined) {
              (existing as Record<string, unknown>)[key] = updatedConfig[typedKey];
            }
          });
        } else {
          this.syncs[index] = updatedConfig;
        }
      } else {
        this.syncs.push(updatedConfig);
      }

      await saveSyncToDB(this.syncs);
    },

    /**
     * 设置 Gist 同步启用状态
     */
    async setGistSyncEnabled(enabled: boolean): Promise<void> {
      await this.updateGistSync({ enabled });
    },

    /**
     * 设置 Gist 用户名和 token
     */
    async setGistSyncCredentials(username: string, token: string): Promise<void> {
      await this.updateGistSync({
        syncParams: {
          username,
        },
        secret: token,
      });
    },

    /**
     * 设置 Gist ID
     */
    async setGistId(gistId: string): Promise<void> {
      await this.updateGistSync({
        syncParams: {
          gistId,
        },
      });
    },

    /**
     * 更新最后同步时间
     */
    async updateLastSyncTime(): Promise<void> {
      await this.updateGistSync({ lastSyncTime: Date.now() });
    },

    /**
     * 更新上次同步时的模型 ID 列表
     */
    async updateLastSyncedModelIds(modelIds: string[]): Promise<void> {
      await this.updateGistSync({ lastSyncedModelIds: modelIds });
    },

    /**
     * 设置同步间隔（毫秒）
     * 如果设置为 0，则禁用自动同步
     */
    async setSyncInterval(intervalMs: number): Promise<void> {
      if (intervalMs < 0) {
        intervalMs = 0;
      }
      // 最大 24 小时（1440 分钟）
      const maxInterval = 1440 * 60000;
      if (intervalMs > maxInterval) {
        intervalMs = maxInterval;
      }
      await this.updateGistSync({ syncInterval: intervalMs });
    },

    /**
     * 设置同步状态
     */
    setSyncing(syncing: boolean): void {
      this.isSyncing = syncing;
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSettingsStore, import.meta.hot));
}
