import { defineStore, acceptHMRUpdate } from 'pinia';
import type { AppSettings, ProxySiteMappingEntry } from 'src/models/settings';
import type { SyncConfig } from 'src/models/sync';
import { SyncType } from 'src/models/sync';
import type { AIModelDefaultTasks } from 'src/services/ai/types/ai-model';
import { DEFAULT_PROXY_LIST, DEFAULT_PROXY_SITE_MAPPING } from 'src/constants/proxy';
import { getDB } from 'src/utils/indexed-db';

// localStorage 仅用于向后兼容读取（历史版本曾使用 localStorage 存储 settings/syncs）
const SETTINGS_STORAGE_KEY = 'tsukuyomi-settings';
const SYNC_STORAGE_KEY = 'tsukuyomi-sync-configs';
// 旧版本/迁移逻辑曾使用的 key（见 src/utils/indexed-db.ts）
const LEGACY_SYNC_STORAGE_KEYS = ['luna-ai-sync', 'tsukuyomi-sync'] as const;

// IndexedDB 存储键（与 src/utils/indexed-db.ts 的 schema 一致）
const SETTINGS_DB_KEY = 'app';

/**
 * 默认设置
 * 注意：lastEdited 使用 epoch 时间（1970-01-01），这样在首次同步时远程设置会被优先应用
 * 当用户实际修改设置时，lastEdited 会被更新为当前时间
 */
const DEFAULT_SETTINGS: AppSettings = {
  lastEdited: new Date(0), // 使用 epoch 时间，确保远程设置优先
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
    deletedCoverUrls: [],
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
 * 标准化/迁移 settings（无论来自 localStorage 还是 IndexedDB）
 */
function normalizeLoadedSettings(raw: unknown): AppSettings {
  const settings = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;

  // 迁移 proxySiteMapping
  const migratedMapping = migrateProxySiteMapping(settings.proxySiteMapping as any);

  // 保留原有的 lastEdited（如果存在），这是 READ 操作，不应该更新 lastEdited
  // 如果不存在，使用 epoch 时间作为初始值，确保远程设置优先
  const existingLastEdited = settings.lastEdited ? new Date(settings.lastEdited as any) : new Date(0);

  // 合并默认映射和用户映射：用户配置优先，但未配置的网站使用默认值
  const mergedMapping: Record<string, ProxySiteMappingEntry> = {
    ...DEFAULT_PROXY_SITE_MAPPING,
    ...(migratedMapping || {}),
  };

  const loadedSettings: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...(settings as any),
    taskDefaultModels: {
      ...DEFAULT_SETTINGS.taskDefaultModels,
      ...(((settings as any).taskDefaultModels as Record<string, string | null | undefined>) || {}),
    },
    lastEdited: existingLastEdited,
    proxySiteMapping: mergedMapping,
  };

  return loadedSettings;
}

/**
 * 从 LocalStorage 加载设置（向后兼容）
 */
function loadSettingsFromLocalStorage(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      const settings = JSON.parse(stored);
      return normalizeLoadedSettings(settings);
    }
  } catch (error) {
    console.error('Failed to load settings from LocalStorage:', error);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * 从 IndexedDB 加载设置（主存储）
 */
async function loadSettingsFromDB(): Promise<AppSettings | null> {
  try {
    const db = await getDB();
    const stored = await db.get('settings', SETTINGS_DB_KEY);
    if (!stored) {
      return null;
    }
    // stored 形如 { key: 'app', ...AppSettings }
    const { key: _key, ...raw } = stored as any;
    return normalizeLoadedSettings(raw);
  } catch (error) {
    console.error('Failed to load settings from IndexedDB:', error);
    return null;
  }
}

/**
 * 保存设置到 IndexedDB（主存储）
 */
async function saveSettingsToDB(settings: AppSettings): Promise<void> {
  try {
    const db = await getDB();
    // 创建一个“纯净”的对象，避免 Proxy/响应式对象导致结构化克隆失败
    const clean: AppSettings = {
      lastEdited: settings.lastEdited,
      scraperConcurrencyLimit: settings.scraperConcurrencyLimit,
      ...(settings.taskDefaultModels !== undefined ? { taskDefaultModels: settings.taskDefaultModels } : {}),
      ...(settings.lastOpenedSettingsTab !== undefined ? { lastOpenedSettingsTab: settings.lastOpenedSettingsTab } : {}),
      ...(settings.proxyEnabled !== undefined ? { proxyEnabled: settings.proxyEnabled } : {}),
      ...(settings.proxyUrl !== undefined ? { proxyUrl: settings.proxyUrl } : {}),
      ...(settings.proxyAutoSwitch !== undefined ? { proxyAutoSwitch: settings.proxyAutoSwitch } : {}),
      ...(settings.proxyAutoAddMapping !== undefined ? { proxyAutoAddMapping: settings.proxyAutoAddMapping } : {}),
      ...(settings.proxySiteMapping !== undefined ? { proxySiteMapping: settings.proxySiteMapping } : {}),
      ...(settings.proxyList !== undefined ? { proxyList: settings.proxyList } : {}),
    };

    await db.put('settings', { key: SETTINGS_DB_KEY, ...clean });
  } catch (error) {
    console.error('Failed to save settings to IndexedDB:', error);
  }
}

/**
 * 从 LocalStorage 加载同步配置（向后兼容）
 */
function loadSyncFromLocalStorage(): SyncConfig[] {
  try {
    // 兼容多个历史 key：优先读取最新 key，再回退到迁移逻辑用过的旧 key
    const stored =
      localStorage.getItem(SYNC_STORAGE_KEY) ??
      LEGACY_SYNC_STORAGE_KEYS.map((k) => localStorage.getItem(k)).find((v) => v !== null) ??
      null;
    if (stored) {
      const syncs = JSON.parse(stored);
      if (Array.isArray(syncs)) {
        return syncs.map((syncConfig) => {
          const base = createDefaultGistSyncConfig();
          return {
            ...base,
            ...syncConfig,
            syncParams: {
              ...base.syncParams,
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
 * 从 IndexedDB 加载同步配置（主存储）
 */
async function loadSyncFromDB(): Promise<SyncConfig[]> {
  try {
    const db = await getDB();
    const stored = await db.getAll('sync-configs');
    // stored 形如 [{ id: 'sync-gist', ...SyncConfig }]
    return (stored as Array<Record<string, unknown>>).map((item) => {
      const { id: _id, ...raw } = item as any;
      const base = createDefaultGistSyncConfig();
      return {
        ...base,
        ...(raw as any),
        syncParams: {
          ...base.syncParams,
          ...(((raw as any).syncParams as Record<string, unknown>) || {}),
        },
      } as SyncConfig;
    });
  } catch (error) {
    console.error('Failed to load sync configs from IndexedDB:', error);
    return [];
  }
}

/**
 * 保存同步配置到 IndexedDB（主存储）
 */
async function saveSyncToDB(syncs: SyncConfig[]): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('sync-configs', 'readwrite');
    const store = tx.objectStore('sync-configs');

    // 简化：以当前内存状态为准，覆盖保存
    await store.clear();

    // 为 id 做稳定生成（同一种 syncType 理论上只有一个；如果出现多个则追加序号）
    const typeCounter = new Map<string, number>();
    for (const sync of syncs) {
      const type = String(sync.syncType ?? 'unknown');
      const nextIndex = (typeCounter.get(type) ?? 0) + 1;
      typeCounter.set(type, nextIndex);
      const id = nextIndex === 1 ? `sync-${type}` : `sync-${type}-${nextIndex}`;

      // 创建纯净对象，避免 Proxy 导致结构化克隆失败
      const clean: SyncConfig = {
        enabled: sync.enabled,
        lastSyncTime: sync.lastSyncTime,
        syncInterval: sync.syncInterval,
        syncType: sync.syncType,
        syncParams: sync.syncParams || {},
        secret: sync.secret,
        apiEndpoint: sync.apiEndpoint,
        ...(sync.lastSyncedModelIds !== undefined ? { lastSyncedModelIds: sync.lastSyncedModelIds } : {}),
        ...(sync.deletedNovelIds !== undefined ? { deletedNovelIds: sync.deletedNovelIds } : {}),
        ...(sync.deletedModelIds !== undefined ? { deletedModelIds: sync.deletedModelIds } : {}),
        ...(sync.deletedCoverIds !== undefined ? { deletedCoverIds: sync.deletedCoverIds } : {}),
        ...(sync.deletedCoverUrls !== undefined ? { deletedCoverUrls: sync.deletedCoverUrls } : {}),
      };

      await store.put({ id, ...clean });
    }

    await tx.done;
  } catch (error) {
    console.error('Failed to save sync configs to IndexedDB:', error);
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
     * 加载设置和同步配置
     * 优先从 IndexedDB 读取（与迁移逻辑一致），localStorage 仅作向后兼容回退
     */
    async loadSettings(): Promise<void> {
      if (this.isLoaded) {
        return;
      }

      const loadedSettingsFromDB = await loadSettingsFromDB();
      if (loadedSettingsFromDB) {
        this.settings = loadedSettingsFromDB;
      } else {
        // 兼容：旧版本可能还在 localStorage
        const loadedFromLocalStorage = loadSettingsFromLocalStorage();
        this.settings = loadedFromLocalStorage;
        // 写回 IndexedDB，确保后续一致
        await saveSettingsToDB(this.settings);
      }

      const loadedSyncsFromDB = await loadSyncFromDB();
      if (loadedSyncsFromDB.length > 0) {
        this.syncs = loadedSyncsFromDB;
      } else {
        const loadedSyncsFromLocalStorage = loadSyncFromLocalStorage();
        this.syncs = loadedSyncsFromLocalStorage;
        await saveSyncToDB(this.syncs);
      }

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
      await saveSettingsToDB(this.settings);
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
      await saveSettingsToDB(this.settings);
      await Promise.resolve();
    },

    /**
     * 获取所有设置（用于导出和同步）
     * 包含 syncs 配置，用于 Gist 同步时合并删除记录
     */
    getAllSettings(): AppSettings & { syncs: SyncConfig[] } {
      return { ...this.settings, syncs: this.syncs };
    },

    /**
     * 导入设置（用于导入）
     * 需要深度合并 taskDefaultModels，避免覆盖现有配置
     * 保留导入的 lastEdited 时间戳（如果存在）
     * 注意：syncs 配置不在此处处理，由同步逻辑单独处理
     */
    async importSettings(settings: Partial<AppSettings> & { syncs?: SyncConfig[] }): Promise<void> {
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
      // 先移除 lastEdited、proxySiteMapping 和 syncs（syncs 由同步逻辑单独处理），稍后单独处理
      const { lastEdited: _removed, proxySiteMapping: _proxyMapping, syncs: _syncs, ...settingsWithoutSpecial } = settings;
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
      await saveSettingsToDB(this.settings);
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
      const deletedCoverUrls =
        updates.deletedCoverUrls ??
        existingConfig?.deletedCoverUrls ??
        defaultConfig.deletedCoverUrls;

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
        ...(deletedCoverUrls !== undefined ? { deletedCoverUrls } : {}),
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

      // 清理封面删除记录（按 URL）
      if (config.deletedCoverUrls && config.deletedCoverUrls.length > 0) {
        const filtered = config.deletedCoverUrls.filter((record) => record.deletedAt > cutoffTime);
        if (filtered.length !== config.deletedCoverUrls.length) {
          config.deletedCoverUrls = filtered;
          hasChanges = true;
        }
      }

      if (hasChanges) {
        await saveSyncToDB(this.syncs);
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
     * 注意：当 stage 未变化时，百分比只会增加不会减少（防止进度回退）
     */
    updateSyncProgress(progress: {
      stage?: '' | 'downloading' | 'uploading' | 'applying' | 'merging';
      message?: string;
      current?: number;
      total?: number;
    }): void {
      // 检查 stage 是否变化（stage 变化时允许重置百分比）
      const stageChanged = progress.stage !== undefined && progress.stage !== this.syncProgress.stage;
      const previousPercentage = this.syncProgress.percentage;
      
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
        const newPercentage = Math.round(
          (this.syncProgress.current / this.syncProgress.total) * 100,
        );
        // 当 stage 未变化时，百分比只能增加不能减少（防止进度回退）
        if (stageChanged || newPercentage >= previousPercentage) {
          this.syncProgress.percentage = newPercentage;
        }
        // 如果新百分比更小且 stage 未变化，保持原百分比（但更新 current/total 用于调试）
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
      await saveSyncToDB(this.syncs);
      await Promise.resolve();
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSettingsStore, import.meta.hot));
}
