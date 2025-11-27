import { defineStore, acceptHMRUpdate } from 'pinia';
import type { AppSettings } from 'src/models/settings';
import type { SyncConfig } from 'src/models/sync';
import { SyncType } from 'src/models/sync';
import type { AIModelDefaultTasks } from 'src/services/ai/types/ai-model';
import { DEFAULT_PROXY_LIST } from 'src/constants/proxy';

const SETTINGS_STORAGE_KEY = 'luna-settings';
const SYNC_STORAGE_KEY = 'luna-sync-configs';

/**
 * 默认设置
 */
const DEFAULT_SETTINGS: AppSettings = {
  lastEdited: new Date(),
  scraperConcurrencyLimit: 3,
  taskDefaultModels: {},
  lastOpenedSettingsTab: 0,
  proxyEnabled: true,
  proxyUrl: 'https://api.allorigins.win/raw?url={url}',
  proxyAutoSwitch: false,
  proxyAutoAddMapping: true,
  proxyList: DEFAULT_PROXY_LIST,
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
 * 从 LocalStorage 加载设置
 */
function loadSettingsFromLocalStorage(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      const settings = JSON.parse(stored);
      // 合并默认设置，确保所有字段都存在
      const loadedSettings: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...settings,
        taskDefaultModels: {
          ...DEFAULT_SETTINGS.taskDefaultModels,
          ...(settings.taskDefaultModels || {}),
        },
        // 确保 lastEdited 是 Date 对象，如果不存在则使用当前时间
        lastEdited: settings.lastEdited ? new Date(settings.lastEdited) : new Date(),
      };
      return loadedSettings;
    }
  } catch (error) {
    console.error('Failed to load settings from LocalStorage:', error);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * 保存设置到 LocalStorage
 */
function saveSettingsToLocalStorage(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save settings to LocalStorage:', error);
  }
}

/**
 * 从 LocalStorage 加载同步配置
 */
function loadSyncFromLocalStorage(): SyncConfig[] {
  try {
    const stored = localStorage.getItem(SYNC_STORAGE_KEY);
    if (stored) {
      const syncs = JSON.parse(stored);
      if (Array.isArray(syncs)) {
        return syncs.map((syncConfig) => {
          return {
            ...createDefaultGistSyncConfig(),
            ...syncConfig,
            syncParams: {
              ...createDefaultGistSyncConfig().syncParams,
              ...(syncConfig.syncParams || {}),
            },
          };
        });
      }
    }
  } catch (error) {
    console.error('Failed to load sync from LocalStorage:', error);
  }
  return [];
}

/**
 * 保存同步配置到 LocalStorage
 */
function saveSyncToLocalStorage(syncs: SyncConfig[]): void {
  try {
    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(syncs));
  } catch (error) {
    console.error('Failed to save sync to LocalStorage:', error);
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
     * 获取代理启用状态
     */
    proxyEnabled: (state): boolean => {
      return state.settings.proxyEnabled ?? false;
    },

    /**
     * 获取代理 URL
     */
    proxyUrl: (state): string => {
      return state.settings.proxyUrl ?? '';
    },

    /**
     * 获取代理自动切换状态
     */
    proxyAutoSwitch: (state): boolean => {
      return state.settings.proxyAutoSwitch ?? false;
    },

    /**
     * 获取自动添加映射状态
     */
    proxyAutoAddMapping: (state): boolean => {
      return state.settings.proxyAutoAddMapping ?? true;
    },

    /**
     * 获取网站-代理映射关系
     */
    proxySiteMapping: (state): Record<string, string[]> => {
      return state.settings.proxySiteMapping ?? {};
    },

    /**
     * 获取代理列表
     */
    proxyList: (state): Array<{ id: string; name: string; url: string; description?: string }> => {
      return state.settings.proxyList ?? DEFAULT_PROXY_LIST;
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
     * 从 LocalStorage 加载设置和同步配置
     */
    async loadSettings(): Promise<void> {
      if (this.isLoaded) {
        return;
      }

      this.settings = loadSettingsFromLocalStorage();
      this.syncs = loadSyncFromLocalStorage();
      this.isLoaded = true;
      await Promise.resolve();
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
        // 更新时自动设置 lastEdited 为当前时间
        lastEdited: new Date(),
      };

      if (updates.taskDefaultModels !== undefined) {
        mergedSettings.taskDefaultModels = {
          ...this.settings.taskDefaultModels,
          ...updates.taskDefaultModels,
        };
      }

      this.settings = mergedSettings;
      saveSettingsToLocalStorage(this.settings);
      await Promise.resolve();
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
    async setTaskDefaultModelId(
      task: keyof AIModelDefaultTasks,
      modelId: string | null,
    ): Promise<void> {
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
      this.settings = { ...DEFAULT_SETTINGS, lastEdited: new Date() };
      saveSettingsToLocalStorage(this.settings);
      await Promise.resolve();
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
     * 保留导入的 lastEdited 时间戳（如果存在）
     */
    async importSettings(settings: Partial<AppSettings>): Promise<void> {
      // 处理 lastEdited：如果导入的设置包含 lastEdited，转换为 Date 对象并保留它
      let preservedLastEdited: Date | undefined;
      if (settings.lastEdited) {
        preservedLastEdited =
          typeof settings.lastEdited === 'string'
            ? new Date(settings.lastEdited)
            : settings.lastEdited;
      }

      // 深度合并 taskDefaultModels，确保不会丢失本地配置
      // 先移除 lastEdited，稍后单独处理
      const { lastEdited: _removed, ...settingsWithoutLastEdited } = settings;
      const mergedSettings: Partial<AppSettings> = {
        ...settingsWithoutLastEdited,
      };

      if (settings.taskDefaultModels !== undefined) {
        // 如果远程有 taskDefaultModels，深度合并
        mergedSettings.taskDefaultModels = {
          ...this.settings.taskDefaultModels,
          ...settings.taskDefaultModels,
        };
      }

      // 深度合并 taskDefaultModels
      const finalSettings: AppSettings = {
        ...this.settings,
        ...mergedSettings,
        // 如果有保留的 lastEdited，使用它；否则使用当前时间
        lastEdited: preservedLastEdited || new Date(),
      };

      if (mergedSettings.taskDefaultModels !== undefined) {
        finalSettings.taskDefaultModels = {
          ...this.settings.taskDefaultModels,
          ...mergedSettings.taskDefaultModels,
        };
      }

      this.settings = finalSettings;
      saveSettingsToLocalStorage(this.settings);
      await Promise.resolve();
    },

    /**
     * 设置最后打开的设置标签页索引
     */
    async setLastOpenedSettingsTab(tabIndex: number): Promise<void> {
      await this.updateSettings({ lastOpenedSettingsTab: tabIndex });
    },

    /**
     * 设置代理启用状态
     */
    async setProxyEnabled(enabled: boolean): Promise<void> {
      await this.updateSettings({ proxyEnabled: enabled });
    },

    /**
     * 设置代理 URL
     */
    async setProxyUrl(url: string): Promise<void> {
      await this.updateSettings({ proxyUrl: url });
    },

    /**
     * 设置代理自动切换状态
     */
    async setProxyAutoSwitch(enabled: boolean): Promise<void> {
      await this.updateSettings({ proxyAutoSwitch: enabled });
    },

    /**
     * 设置自动添加映射状态
     */
    async setProxyAutoAddMapping(enabled: boolean): Promise<void> {
      await this.updateSettings({ proxyAutoAddMapping: enabled });
    },

    /**
     * 为网站添加可用的代理服务
     */
    async addProxyForSite(site: string, proxyUrl: string): Promise<void> {
      const mapping = { ...(this.settings.proxySiteMapping ?? {}) };
      if (!mapping[site]) {
        mapping[site] = [];
      }
      const siteProxies = mapping[site];
      if (siteProxies && !siteProxies.includes(proxyUrl)) {
        siteProxies.push(proxyUrl);
      }
      await this.updateSettings({ proxySiteMapping: mapping });
    },

    /**
     * 为网站移除代理服务
     */
    async removeProxyForSite(site: string, proxyUrl: string): Promise<void> {
      const mapping = { ...(this.settings.proxySiteMapping ?? {}) };
      const siteProxies = mapping[site];
      if (siteProxies) {
        const filtered = siteProxies.filter((url) => url !== proxyUrl);
        if (filtered.length === 0) {
          delete mapping[site];
        } else {
          mapping[site] = filtered;
        }
      }
      await this.updateSettings({ proxySiteMapping: mapping });
    },

    /**
     * 清除网站的所有代理映射
     */
    async clearProxyForSite(site: string): Promise<void> {
      const mapping = { ...(this.settings.proxySiteMapping ?? {}) };
      delete mapping[site];
      await this.updateSettings({ proxySiteMapping: mapping });
    },

    /**
     * 获取网站可用的代理服务列表
     */
    getProxiesForSite(site: string): string[] {
      return this.settings.proxySiteMapping?.[site] ?? [];
    },

    /**
     * 添加代理到列表
     */
    async addProxy(proxy: { name: string; url: string; description?: string }): Promise<void> {
      const list = [...(this.settings.proxyList ?? DEFAULT_PROXY_LIST)];
      const id = `custom-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      list.push({ id, ...proxy });
      await this.updateSettings({ proxyList: list });
    },

    /**
     * 更新代理
     */
    async updateProxy(
      id: string,
      updates: Partial<{ name: string; url: string; description?: string }>,
    ): Promise<void> {
      const list = [...(this.settings.proxyList ?? DEFAULT_PROXY_LIST)];
      const existing = list.find((p) => p.id === id);
      if (existing) {
        const updated: { id: string; name: string; url: string; description?: string } = {
          id: existing.id,
          name: updates.name ?? existing.name,
          url: updates.url ?? existing.url,
        };
        if (updates.description !== undefined) {
          updated.description = updates.description;
        } else if (existing.description !== undefined) {
          updated.description = existing.description;
        }
        const index = list.findIndex((p) => p.id === id);
        if (index >= 0) {
          list[index] = updated;
          await this.updateSettings({ proxyList: list });
        }
      }
    },

    /**
     * 删除代理
     */
    async removeProxy(id: string): Promise<void> {
      const list = [...(this.settings.proxyList ?? DEFAULT_PROXY_LIST)];
      const filtered = list.filter((p) => p.id !== id);
      await this.updateSettings({ proxyList: filtered });
    },

    /**
     * 重新排序代理列表
     */
    async reorderProxies(newOrder: Array<{ id: string; name: string; url: string; description?: string }>): Promise<void> {
      await this.updateSettings({ proxyList: newOrder });
    },

    /**
     * 更新 Gist 同步配置
     */
    async updateGistSync(updates: Partial<SyncConfig>): Promise<void> {
      const index = this.syncs.findIndex((sync) => sync.syncType === SyncType.Gist);
      const defaultConfig = createDefaultGistSyncConfig();
      const existingConfig = index >= 0 ? this.syncs[index] : undefined;

      const lastSyncedModelIds =
        updates.lastSyncedModelIds ??
        existingConfig?.lastSyncedModelIds ??
        defaultConfig.lastSyncedModelIds;

      const updatedConfig: SyncConfig = {
        enabled: updates.enabled ?? existingConfig?.enabled ?? defaultConfig.enabled,
        lastSyncTime:
          updates.lastSyncTime !== undefined
            ? updates.lastSyncTime
            : (existingConfig?.lastSyncTime ?? defaultConfig.lastSyncTime),
        syncInterval:
          updates.syncInterval !== undefined
            ? updates.syncInterval
            : (existingConfig?.syncInterval ?? defaultConfig.syncInterval),
        syncType: updates.syncType ?? existingConfig?.syncType ?? defaultConfig.syncType,
        syncParams: {
          ...(existingConfig?.syncParams ?? defaultConfig.syncParams),
          ...(updates.syncParams || {}),
        },
        secret: updates.secret ?? existingConfig?.secret ?? defaultConfig.secret,
        apiEndpoint:
          updates.apiEndpoint ?? existingConfig?.apiEndpoint ?? defaultConfig.apiEndpoint,
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

      saveSyncToLocalStorage(this.syncs);
      await Promise.resolve();
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

    /**
     * 导入同步配置（用于导入）
     */
    async importSyncs(syncs: SyncConfig[]): Promise<void> {
      this.syncs = syncs.map((syncConfig) => {
        return {
          ...createDefaultGistSyncConfig(),
          ...syncConfig,
          syncParams: {
            ...createDefaultGistSyncConfig().syncParams,
            ...(syncConfig.syncParams || {}),
          },
        };
      });
      saveSyncToLocalStorage(this.syncs);
      await Promise.resolve();
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSettingsStore, import.meta.hot));
}
