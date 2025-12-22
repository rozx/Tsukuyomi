import { defineStore, acceptHMRUpdate } from 'pinia';
import type { AppSettings, ProxySiteMappingEntry } from 'src/models/settings';
import type { SyncConfig } from 'src/models/sync';
import { SyncType } from 'src/models/sync';
import type { AIModelDefaultTasks } from 'src/services/ai/types/ai-model';
import { DEFAULT_PROXY_LIST, DEFAULT_PROXY_SITE_MAPPING } from 'src/constants/proxy';

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
  proxyUrl: DEFAULT_PROXY_LIST[0]!.url,
  proxyAutoSwitch: true,
  proxyAutoAddMapping: true,
  proxyList: DEFAULT_PROXY_LIST,
  proxySiteMapping: DEFAULT_PROXY_SITE_MAPPING,
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
    deletedNovelIds: [],
    deletedModelIds: [],
    deletedCoverIds: [],
  };
}

/**
 * 迁移旧的 proxySiteMapping 格式（string[]）到新格式（ProxySiteMappingEntry）
 */
function migrateProxySiteMapping(
  mapping: Record<string, string[] | ProxySiteMappingEntry> | undefined,
): Record<string, ProxySiteMappingEntry> | undefined {
  if (!mapping) {
    return undefined;
  }

  const migrated: Record<string, ProxySiteMappingEntry> = {};
  for (const [site, value] of Object.entries(mapping)) {
    // 检查是否是旧格式（string[]）
    if (Array.isArray(value)) {
      migrated[site] = {
        enabled: true,
        proxies: value,
      };
    } else {
      // 已经是新格式
      migrated[site] = {
        enabled: value.enabled ?? true,
        proxies: value.proxies ?? [],
      };
    }
  }
  return migrated;
}

/**
 * 从 LocalStorage 加载设置
 */
function loadSettingsFromLocalStorage(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      const settings = JSON.parse(stored);
      // 迁移 proxySiteMapping
      const migratedMapping = migrateProxySiteMapping(settings.proxySiteMapping);

      // 合并默认设置，确保所有字段都存在
      // 保留原有的 lastEdited（如果存在），这是 READ 操作，不应该更新 lastEdited
      // 如果不存在，使用当前时间作为初始值（这是初始化，不是编辑）
      const existingLastEdited = settings.lastEdited
        ? new Date(settings.lastEdited)
        : new Date();

      // 合并默认映射和用户映射：用户配置优先，但未配置的网站使用默认值
      const mergedMapping: Record<string, ProxySiteMappingEntry> = {
        ...DEFAULT_PROXY_SITE_MAPPING,
        ...(migratedMapping || {}),
      };

      const loadedSettings: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...settings,
        taskDefaultModels: {
          ...DEFAULT_SETTINGS.taskDefaultModels,
          ...(settings.taskDefaultModels || {}),
        },
        // 保留原有的 lastEdited，如果不存在则使用当前时间（这是初始化，不是编辑）
        lastEdited: existingLastEdited,
        // 使用合并后的映射（默认值 + 用户配置）
        proxySiteMapping: mergedMapping,
      };

      // 如果进行了迁移，保存回 LocalStorage（但不更新 lastEdited，因为这是自动迁移，不是用户编辑）
      if (migratedMapping && migratedMapping !== settings.proxySiteMapping) {
        saveSettingsToLocalStorage(loadedSettings);
      }

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
    // 同步进度状态
    syncProgress: {
      stage: '' as '' | 'downloading' | 'uploading' | 'applying' | 'merging',
      message: '',
      current: 0, // 当前进度
      total: 0, // 总数
      percentage: 0, // 百分比 0-100
    },
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
     * 获取网站-代理映射关系（新格式）
     */
    proxySiteMapping: (state): Record<string, ProxySiteMappingEntry> => {
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
      // 更新时自动设置 lastEdited 为当前时间（除非调用者明确提供了 lastEdited）
      const mergedSettings: AppSettings = {
        ...this.settings,
        ...updates,
        lastEdited: updates.lastEdited ?? new Date(),
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

      // 迁移 proxySiteMapping（如果存在）
      let migratedProxySiteMapping: Record<string, ProxySiteMappingEntry> | undefined;
      if (settings.proxySiteMapping !== undefined) {
        migratedProxySiteMapping = migrateProxySiteMapping(settings.proxySiteMapping);
      }

      // 深度合并 taskDefaultModels，确保不会丢失本地配置
      // 先移除 lastEdited 和 proxySiteMapping，稍后单独处理
      const { lastEdited: _removed, proxySiteMapping: _proxyMapping, ...settingsWithoutSpecial } = settings;
      const mergedSettings: Partial<AppSettings> = {
        ...settingsWithoutSpecial,
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
        // 如果有保留的 lastEdited，使用它；否则保留本地的 lastEdited（同步操作不应该更新 lastEdited）
        lastEdited: preservedLastEdited || this.settings.lastEdited,
        // 使用迁移后的 proxySiteMapping
        ...(migratedProxySiteMapping !== undefined ? { proxySiteMapping: migratedProxySiteMapping } : {}),
      };

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
     * @returns 如果代理已成功添加返回 true，如果已存在返回 false
     */
    async addProxyForSite(site: string, proxyUrl: string): Promise<boolean> {
      const mapping = { ...(this.settings.proxySiteMapping ?? {}) };
      if (!mapping[site]) {
        mapping[site] = { enabled: true, proxies: [] };
      }
      const siteEntry = mapping[site];
      // 检查是否已存在相同的代理 URL
      if (siteEntry.proxies.includes(proxyUrl)) {
        // 已存在，不添加
        return false;
      }
      // 添加新的代理 URL
      siteEntry.proxies.push(proxyUrl);
      await this.updateSettings({ proxySiteMapping: mapping });
      return true;
    },

    /**
     * 为网站移除代理服务
     */
    async removeProxyForSite(site: string, proxyUrl: string): Promise<void> {
      const mapping = { ...(this.settings.proxySiteMapping ?? {}) };
      const siteEntry = mapping[site];
      if (siteEntry) {
        const filtered = siteEntry.proxies.filter((url) => url !== proxyUrl);
        if (filtered.length === 0) {
          delete mapping[site];
        } else {
          siteEntry.proxies = filtered;
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
      const entry = this.settings.proxySiteMapping?.[site];
      if (!entry || !entry.enabled) {
        return [];
      }
      return entry.proxies ?? [];
    },

    /**
     * 设置网站映射规则的启用/禁用状态
     */
    async setProxySiteMappingEnabled(site: string, enabled: boolean): Promise<void> {
      const mapping = { ...(this.settings.proxySiteMapping ?? {}) };
      if (!mapping[site]) {
        mapping[site] = { enabled, proxies: [] };
      } else {
        mapping[site] = { ...mapping[site], enabled };
      }
      await this.updateSettings({ proxySiteMapping: mapping });
    },

    /**
     * 更换网站映射中的代理 URL
     * @param site 网站域名
     * @param oldProxyUrl 旧的代理 URL
     * @param newProxyUrl 新的代理 URL
     */
    async changeProxyForSite(site: string, oldProxyUrl: string, newProxyUrl: string): Promise<void> {
      const mapping = { ...(this.settings.proxySiteMapping ?? {}) };
      if (!mapping[site]) {
        mapping[site] = { enabled: true, proxies: [] };
      }
      const siteEntry = mapping[site];
      const index = siteEntry.proxies.indexOf(oldProxyUrl);
      if (index >= 0) {
        siteEntry.proxies[index] = newProxyUrl;
        await this.updateSettings({ proxySiteMapping: mapping });
      }
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

      const deletedNovelIds =
        updates.deletedNovelIds ??
        existingConfig?.deletedNovelIds ??
        defaultConfig.deletedNovelIds;
      const deletedModelIds =
        updates.deletedModelIds ??
        existingConfig?.deletedModelIds ??
        defaultConfig.deletedModelIds;
      const deletedCoverIds =
        updates.deletedCoverIds ??
        existingConfig?.deletedCoverIds ??
        defaultConfig.deletedCoverIds;

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
        ...(deletedNovelIds !== undefined ? { deletedNovelIds } : {}),
        ...(deletedModelIds !== undefined ? { deletedModelIds } : {}),
        ...(deletedCoverIds !== undefined ? { deletedCoverIds } : {}),
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
     * 清理旧的删除记录（超过指定天数的记录）
     * @param daysToKeep 保留天数，默认 30 天
     */
    async cleanupOldDeletionRecords(daysToKeep = 30): Promise<void> {
      const index = this.syncs.findIndex((sync) => sync.syncType === SyncType.Gist);
      if (index < 0) {
        return;
      }

      const config = this.syncs[index];
      if (!config) {
        return;
      }

      const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
      let hasChanges = false;

      // 清理书籍删除记录
      if (config.deletedNovelIds && config.deletedNovelIds.length > 0) {
        const filtered = config.deletedNovelIds.filter((record) => record.deletedAt > cutoffTime);
        if (filtered.length !== config.deletedNovelIds.length) {
          config.deletedNovelIds = filtered;
          hasChanges = true;
        }
      }

      // 清理模型删除记录
      if (config.deletedModelIds && config.deletedModelIds.length > 0) {
        const filtered = config.deletedModelIds.filter((record) => record.deletedAt > cutoffTime);
        if (filtered.length !== config.deletedModelIds.length) {
          config.deletedModelIds = filtered;
          hasChanges = true;
        }
      }

      // 清理封面删除记录
      if (config.deletedCoverIds && config.deletedCoverIds.length > 0) {
        const filtered = config.deletedCoverIds.filter((record) => record.deletedAt > cutoffTime);
        if (filtered.length !== config.deletedCoverIds.length) {
          config.deletedCoverIds = filtered;
          hasChanges = true;
        }
      }

      if (hasChanges) {
        saveSyncToLocalStorage(this.syncs);
        await Promise.resolve();
      }
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
      // 如果同步结束，重置进度
      if (!syncing) {
        this.resetSyncProgress();
      }
    },

    /**
     * 更新同步进度
     */
    updateSyncProgress(progress: {
      stage?: '' | 'downloading' | 'uploading' | 'applying' | 'merging';
      message?: string;
      current?: number;
      total?: number;
    }): void {
      if (progress.stage !== undefined) {
        this.syncProgress.stage = progress.stage;
      }
      if (progress.message !== undefined) {
        this.syncProgress.message = progress.message;
      }
      if (progress.current !== undefined) {
        this.syncProgress.current = progress.current;
      }
      if (progress.total !== undefined) {
        this.syncProgress.total = progress.total;
      }
      // 计算百分比
      if (this.syncProgress.total > 0) {
        this.syncProgress.percentage = Math.round(
          (this.syncProgress.current / this.syncProgress.total) * 100,
        );
      } else {
        this.syncProgress.percentage = 0;
      }
    },

    /**
     * 重置同步进度
     */
    resetSyncProgress(): void {
      this.syncProgress = {
        stage: '',
        message: '',
        current: 0,
        total: 0,
        percentage: 0,
      };
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
