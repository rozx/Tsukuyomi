import { defineStore, acceptHMRUpdate } from 'pinia';
import type { AppSettings } from 'src/types/settings';
import type { SyncConfig } from 'src/types/sync';
import { SyncType } from 'src/types/sync';
import type { AIModelDefaultTasks } from 'src/types/ai/ai-model';

const STORAGE_KEY = 'luna-ai-settings';
const SYNC_STORAGE_KEY = 'luna-ai-sync';

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
  };
}

/**
 * 从本地存储加载同步配置
 */
function loadSyncFromStorage(): SyncConfig[] {
  try {
    const stored = localStorage.getItem(SYNC_STORAGE_KEY);
    if (stored) {
      const syncs = JSON.parse(stored) as SyncConfig[];
      return syncs.map((sync) => ({
        ...createDefaultGistSyncConfig(),
        ...sync,
        syncParams: {
          ...createDefaultGistSyncConfig().syncParams,
          ...(sync.syncParams || {}),
        },
      }));
    }
  } catch (error) {
    console.error('Failed to load sync from storage:', error);
  }
  return [];
}

/**
 * 保存同步配置到本地存储
 */
function saveSyncToStorage(syncs: SyncConfig[]): void {
  try {
    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(syncs));
  } catch (error) {
    console.error('Failed to save sync to storage:', error);
  }
}

/**
 * 从本地存储加载设置
 */
function loadSettingsFromStorage(): AppSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const settings = JSON.parse(stored) as Partial<AppSettings>;
      // 合并默认设置，确保所有字段都存在
      // 特别处理 taskDefaultModels，需要深度合并
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
    console.error('Failed to load settings from storage:', error);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * 保存设置到本地存储
 */
function saveSettingsToStorage(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save settings to storage:', error);
  }
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    settings: loadSettingsFromStorage(),
    syncs: loadSyncFromStorage(),
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
     * 更新设置
     */
    updateSettings(updates: Partial<AppSettings>): void {
      this.settings = {
        ...this.settings,
        ...updates,
      };
      saveSettingsToStorage(this.settings);
    },

    /**
     * 设置爬虫并发数限制
     */
    setScraperConcurrencyLimit(limit: number): void {
      if (limit < 1) {
        limit = 1;
      }
      if (limit > 10) {
        limit = 10;
      }
      this.updateSettings({ scraperConcurrencyLimit: limit });
    },

    /**
     * 设置任务的默认模型 ID
     */
    setTaskDefaultModelId(task: keyof AIModelDefaultTasks, modelId: string | null): void {
      const taskDefaultModels = {
        ...this.settings.taskDefaultModels,
        [task]: modelId,
      };
      this.updateSettings({ taskDefaultModels });
    },

    /**
     * 重置为默认设置
     */
    resetToDefaults(): void {
      this.settings = { ...DEFAULT_SETTINGS };
      saveSettingsToStorage(this.settings);
    },

    /**
     * 获取所有设置（用于导出）
     */
    getAllSettings(): AppSettings {
      return { ...this.settings };
    },

    /**
     * 导入设置（用于导入）
     */
    importSettings(settings: Partial<AppSettings>): void {
      this.updateSettings(settings);
    },

    /**
     * 设置最后打开的设置标签页索引
     */
    setLastOpenedSettingsTab(tabIndex: number): void {
      this.updateSettings({ lastOpenedSettingsTab: tabIndex });
    },

    /**
     * 更新 Gist 同步配置
     */
    updateGistSync(updates: Partial<SyncConfig>): void {
      const index = this.syncs.findIndex((sync) => sync.syncType === SyncType.Gist);
      const defaultConfig = createDefaultGistSyncConfig();
      const existingConfig = index >= 0 ? this.syncs[index] : undefined;

      const updatedConfig: SyncConfig = {
        enabled: updates.enabled ?? existingConfig?.enabled ?? defaultConfig.enabled,
        lastSyncTime: updates.lastSyncTime ?? existingConfig?.lastSyncTime ?? defaultConfig.lastSyncTime,
        syncInterval: updates.syncInterval ?? existingConfig?.syncInterval ?? defaultConfig.syncInterval,
        syncType: updates.syncType ?? existingConfig?.syncType ?? defaultConfig.syncType,
        syncParams: {
          ...(existingConfig?.syncParams ?? defaultConfig.syncParams),
          ...(updates.syncParams || {}),
        },
        secret: updates.secret ?? existingConfig?.secret ?? defaultConfig.secret,
        apiEndpoint: updates.apiEndpoint ?? existingConfig?.apiEndpoint ?? defaultConfig.apiEndpoint,
      };

      if (index >= 0) {
        this.syncs[index] = updatedConfig;
      } else {
        this.syncs.push(updatedConfig);
      }

      saveSyncToStorage(this.syncs);
    },

    /**
     * 设置 Gist 同步启用状态
     */
    setGistSyncEnabled(enabled: boolean): void {
      this.updateGistSync({ enabled });
    },

    /**
     * 设置 Gist 用户名和 token
     */
    setGistSyncCredentials(username: string, token: string): void {
      this.updateGistSync({
        syncParams: {
          username,
        },
        secret: token,
      });
    },

    /**
     * 设置 Gist ID
     */
    setGistId(gistId: string): void {
      this.updateGistSync({
        syncParams: {
          gistId,
        },
      });
    },

    /**
     * 更新最后同步时间
     */
    updateLastSyncTime(): void {
      this.updateGistSync({ lastSyncTime: Date.now() });
    },

    /**
     * 设置同步间隔（毫秒）
     * 如果设置为 0，则禁用自动同步
     */
    setSyncInterval(intervalMs: number): void {
      if (intervalMs < 0) {
        intervalMs = 0;
      }
      // 最大 24 小时（1440 分钟）
      const maxInterval = 1440 * 60000;
      if (intervalMs > maxInterval) {
        intervalMs = maxInterval;
      }
      this.updateGistSync({ syncInterval: intervalMs });
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSettingsStore, import.meta.hot));
}
