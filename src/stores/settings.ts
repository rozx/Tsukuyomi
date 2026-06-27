import { defineStore, acceptHMRUpdate } from 'pinia';
import { toRaw } from 'vue';
import { cloneDeep } from 'lodash';
import type {
  AppSettings,
  MemoryInjectionSettings,
  ProxySiteMappingEntry,
} from 'src/models/settings';
import type { SyncConfig } from 'src/models/sync';
import { SyncType } from 'src/models/sync';
import { TOMBSTONE_TTL_DAYS } from 'src/models/manifest';
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
const DEFAULT_MEMORY_INJECTION: MemoryInjectionSettings = {
  charBudget: 2000,
  enableSemantic: true,
  minScoreThreshold: 0.3,
  hasSeenIntro: false,
  embeddingModelCached: false,
};

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
  booksSortOption: 'default',
  quickStartDismissed: false,
  memoryInjection: { ...DEFAULT_MEMORY_INJECTION },
  enableLocalEmbedding: false, // 默认关闭,用户在设置页主动开启以触发模型下载
};

/**
 * 返回一个"清空所有主动传播删除字段"的 partial SyncConfig。
 *
 * 公开导出以便 SyncDataService 在恢复快照、文件导入等场景下能直接 spread 进
 * `updateGistSync({...currentSync, ...patch})` 单次调用，避免连续两次写入。
 *
 * 字段语义见 `clearSyncDeletionPropagationState`。
 */
export function getSyncDeletionPropagationStateClearedPatch(): Pick<
  SyncConfig,
  'deletedNovelIds' | 'deletedModelIds' | 'deletedMemoryIds' | 'knownRemoteTombstones'
> {
  return {
    deletedNovelIds: [],
    deletedModelIds: [],
    deletedMemoryIds: [],
    knownRemoteTombstones: {},
  };
}

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
    deletedMemoryIds: [],
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
  const settings = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  // 迁移 proxySiteMapping
  const migratedMapping = migrateProxySiteMapping(settings.proxySiteMapping as any);

  // 保留原有的 lastEdited（如果存在），这是 READ 操作，不应该更新 lastEdited
  // 如果不存在，使用 epoch 时间作为初始值，确保远程设置优先
  const existingLastEdited = settings.lastEdited
    ? new Date(settings.lastEdited as any)
    : new Date(0);

  // 合并默认映射和用户映射：用户配置优先，但未配置的网站使用默认值
  const mergedMapping: Record<string, ProxySiteMappingEntry> = {
    ...DEFAULT_PROXY_SITE_MAPPING,
    ...(migratedMapping || {}),
  };

  // 合并记忆注入设置：用户配置优先，缺失字段使用默认值
  const rawMemoryInjection = (settings as any).memoryInjection as
    | Partial<MemoryInjectionSettings>
    | undefined;
  const mergedMemoryInjection: MemoryInjectionSettings = {
    ...DEFAULT_MEMORY_INJECTION,
    ...(rawMemoryInjection ?? {}),
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
    quickStartDismissed:
      typeof (settings as any).quickStartDismissed === 'boolean'
        ? ((settings as any).quickStartDismissed as boolean)
        : false,
    memoryInjection: mergedMemoryInjection,
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
    // cloneDeep(toRaw(...)) 深度剥离 Vue 响应式包装，避免 Proxy 导致 structured clone 失败。
    // 依赖 AppSettings 类型作为单一事实来源：新增字段自动持久化，无需维护白名单。
    const clean = cloneDeep(toRaw(settings));
    // 保证 lastEdited 是普通 Date 实例（cloneDeep 会复制 Date，但防御历史数据里可能是字符串）
    clean.lastEdited =
      clean.lastEdited instanceof Date
        ? new Date(clean.lastEdited.getTime())
        : new Date((clean.lastEdited as unknown as string | number | undefined) || 0);

    await db.put('settings', { key: SETTINGS_DB_KEY, ...clean });
  } catch (error) {
    console.error('Failed to save settings to IndexedDB:', error);
  }
}

async function applyMemoryInjectionSemanticSideEffect(
  previousEnabled: boolean | undefined,
  nextEnabled: boolean | undefined,
): Promise<void> {
  if (previousEnabled === undefined || nextEnabled === undefined || previousEnabled === nextEnabled) {
    return;
  }

  try {
    const { EmbeddingQueue } = await import('src/services/embedding-queue');
    if (nextEnabled) {
      EmbeddingQueue.resume();
    } else {
      EmbeddingQueue.pause();
    }
  } catch {
    // 非致命：队列模块加载失败不影响设置持久化
  }
}

/**
 * 根据 isSyncing / isRestoringSyncSnapshot 控制 EmbeddingQueue 的运行状态。
 * 同步/恢复进行中时挂起队列(嵌入会写 memory / chapter 的 embedding 字段,与同步的增量 apply
 * 和 IDB 写入竞争),结束后再恢复。走 applySyncGate 而不是 pause/resume 是为了不抹掉用户手动
 * 点击的 pause 状态。
 */
async function applySyncEmbeddingGate(shouldPause: boolean): Promise<void> {
  try {
    const { EmbeddingQueue } = await import('src/services/embedding-queue');
    EmbeddingQueue.applySyncGate(shouldPause);
  } catch {
    // 非致命：队列模块加载失败不影响同步状态流转
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
    return (stored as unknown as Array<Record<string, unknown>>).map((item) => {
      const { id: _id, ...raw } = item as any;
      const base = createDefaultGistSyncConfig();
      return {
        ...base,
        ...raw,
        syncParams: {
          ...base.syncParams,
          ...((raw.syncParams as Record<string, unknown>) || {}),
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

      // cloneDeep(toRaw(...)) 深度剥离 Vue 响应式包装，避免 Proxy 导致 structured clone 失败。
      // 依赖 SyncConfig 类型作为单一事实来源：新增字段自动持久化。
      const clean = cloneDeep(toRaw(sync));
      // `lastRemoteUpdatedAt` 已由 `lastRemoteETag` 取代，写入时去掉（读取仍保留以兼容旧数据）
      delete clean.lastRemoteUpdatedAt;

      await store.put({ id, ...clean });
    }

    await tx.done;
  } catch (error) {
    console.error('Failed to save sync configs to IndexedDB:', error);
  }

  // localStorage 兜底写入（向后兼容 & 避免某些环境 IndexedDB 写入失败导致刷新后 lastSyncTime 回退）
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(syncs));
    }
  } catch (error) {
    console.warn('Failed to save sync configs to LocalStorage (fallback):', error);
  }
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    settings: { ...DEFAULT_SETTINGS } as AppSettings,
    syncs: [] as SyncConfig[],
    isSyncing: false, // 全局同步状态
    isRestoringSyncSnapshot: false, // 恢复历史快照中的共享状态
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
     * 获取 Tavily API Key
     */
    tavilyApiKey: (state): string | undefined => {
      return state.settings.tavilyApiKey;
    },

    /**
     * 获取书籍排序选项
     */
    booksSortOption: (state): string => {
      return state.settings.booksSortOption ?? 'default';
    },

    /**
     * 获取 Gist 同步配置（第一个 Gist 类型的同步配置）
     */
    gistSync: (state): SyncConfig => {
      const gistSync = state.syncs.find((sync) => sync.syncType === SyncType.Gist);
      return gistSync ?? createDefaultGistSyncConfig();
    },

    /**
     * 获取强制推送模式状态
     * 旧数据缺失时返回 { active: false }
     */
    forceSyncMode: (state): { active: boolean; lastFailedAt?: number } => {
      const gistSync = state.syncs.find((sync) => sync.syncType === SyncType.Gist);
      return gistSync?.forceSyncMode ?? { active: false };
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
      const previousEnableSemantic = this.settings.memoryInjection?.enableSemantic;

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
      const {
        lastEdited: _removed,
        proxySiteMapping: _proxyMapping,
        syncs: _syncs,
        ...settingsWithoutSpecial
      } = settings;
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

      // embeddingModelCached 是设备本地状态（浏览器是否缓存了模型文件），
      // 同步时应保留本地值,避免远程覆盖导致误判
      if (mergedSettings.memoryInjection && this.settings.memoryInjection) {
        mergedSettings.memoryInjection = {
          ...mergedSettings.memoryInjection,
          embeddingModelCached: this.settings.memoryInjection.embeddingModelCached,
        };
      }

      // 深度合并 taskDefaultModels
      const finalSettings: AppSettings = {
        ...this.settings,
        ...mergedSettings,
        // 如果有保留的 lastEdited，使用它；否则保留本地的 lastEdited（同步操作不应该更新 lastEdited）
        lastEdited: preservedLastEdited || this.settings.lastEdited,
        // 使用迁移后的 proxySiteMapping
        ...(migratedProxySiteMapping !== undefined
          ? { proxySiteMapping: migratedProxySiteMapping }
          : {}),
      };

      this.settings = finalSettings;
      await saveSettingsToDB(this.settings);
      await applyMemoryInjectionSemanticSideEffect(
        previousEnableSemantic,
        this.settings.memoryInjection?.enableSemantic,
      );
      await Promise.resolve();
    },

    /**
     * 使用同步快照完整替换应用设置。
     * 与 importSettings 不同：该方法会以默认值为基线重建 settings，
     * 避免旧的本地字段在“恢复到某个修订版本”时继续残留。
     *
     * 仍需保留设备本地状态：
     * - memoryInjection.embeddingModelCached
     */
    async replaceSettingsFromSyncSnapshot(settings: Partial<AppSettings>): Promise<void> {
      const previousEnableSemantic = this.settings.memoryInjection?.enableSemantic;
      const localEmbeddingModelCached =
        this.settings.memoryInjection?.embeddingModelCached ??
        DEFAULT_MEMORY_INJECTION.embeddingModelCached;

      const { syncs: _syncs, ...snapshotSettings } = settings as Partial<AppSettings> & {
        syncs?: SyncConfig[];
      };
      const normalized = normalizeLoadedSettings(snapshotSettings);

      // normalizeLoadedSettings 会始终补齐 memoryInjection 默认值，这里直接覆盖设备本地缓存状态。
      normalized.memoryInjection = {
        ...DEFAULT_MEMORY_INJECTION,
        ...normalized.memoryInjection,
        embeddingModelCached: localEmbeddingModelCached,
      };

      this.settings = normalized;
      await saveSettingsToDB(this.settings);
      await applyMemoryInjectionSemanticSideEffect(
        previousEnableSemantic,
        this.settings.memoryInjection?.enableSemantic,
      );
      await Promise.resolve();
    },

    /**
     * 设置最后打开的设置标签页索引
     */
    async setLastOpenedSettingsTab(tabIndex: number): Promise<void> {
      await this.updateSettings({ lastOpenedSettingsTab: tabIndex });
    },

    /**
     * 设置书籍排序选项
     */
    async setBooksSortOption(sortOption: string): Promise<void> {
      await this.updateSettings({ booksSortOption: sortOption });
    },

    /**
     * 设置首次启动快速开始弹窗关闭状态
     */
    async setQuickStartDismissed(dismissed: boolean): Promise<void> {
      await this.updateSettings({ quickStartDismissed: dismissed });
    },

    /**
     * 更新记忆注入设置(带范围约束和副作用)
     *
     * - charBudget: clamp 到 [500, 5000]
     * - minScoreThreshold: clamp 到 [0, 1.0]
     * - enableSemantic 切换时:true→resume / false→pause EmbeddingQueue
     */
    async updateMemoryInjection(updates: Partial<MemoryInjectionSettings>): Promise<void> {
      const current = this.settings.memoryInjection ?? { ...DEFAULT_MEMORY_INJECTION };
      const merged = { ...current, ...updates };

      // 范围约束
      merged.charBudget = Math.min(5000, Math.max(500, merged.charBudget));
      merged.minScoreThreshold = Math.min(1.0, Math.max(0, merged.minScoreThreshold));

      // 副作用:enableSemantic 变更时联动 EmbeddingQueue
      await applyMemoryInjectionSemanticSideEffect(current.enableSemantic, updates.enableSemantic);

      await this.updateSettings({ memoryInjection: merged });
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
    async reorderProxies(
      newOrder: Array<{ id: string; name: string; url: string; description?: string }>,
    ): Promise<void> {
      await this.updateSettings({ proxyList: newOrder });
    },

    /**
     * 更新 Gist 同步配置
     */
    async updateGistSync(updates: Partial<SyncConfig>): Promise<void> {
      const index = this.syncs.findIndex((sync) => sync.syncType === SyncType.Gist);
      const defaultConfig = createDefaultGistSyncConfig();
      const existingConfig = index >= 0 ? this.syncs[index] : undefined;

      // 三层优先级合并（updates > existing > default）。
      // Partial<T> 字段仅在调用方显式给 key 时才会写入，
      // `updates.syncTime = 0` 这类数字 0/false 的合法值不会被 `??` 意外回退。
      const updatedConfig: SyncConfig = {
        ...defaultConfig,
        ...(existingConfig ?? {}),
        ...updates,
        syncParams: {
          ...defaultConfig.syncParams,
          ...(existingConfig?.syncParams ?? {}),
          ...(updates.syncParams ?? {}),
        },
      };

      if (index >= 0 && this.syncs[index]) {
        // 原地更新以保持响应式引用不变
        const existing = this.syncs[index];
        for (const key of Object.keys(updatedConfig) as (keyof SyncConfig)[]) {
          if (updatedConfig[key] !== undefined) {
            (existing as Record<string, unknown>)[key] = updatedConfig[key];
          }
        }
      } else {
        this.syncs.push(updatedConfig);
      }

      await saveSyncToDB(this.syncs);
      await Promise.resolve();
    },

    /**
     * 清理旧的删除记录（超过指定天数的记录）。
     *
     * @param daysToKeep 保留天数；默认派生自 `TOMBSTONE_TTL_DAYS`，
     *   保证本地删除记录窗口与 manifest 墓碑窗口对齐。
     *
     * 修剪边界：当 `now - deletedAt >= ttl` 时丢弃，对齐 `buildLocalManifest`
     * 的墓碑修剪规则，避免临界点出现"本地清空但 manifest 仍带墓碑"的漂移。
     */
    async cleanupOldDeletionRecords(daysToKeep = TOMBSTONE_TTL_DAYS): Promise<void> {
      const config = this.syncs.find((sync) => sync.syncType === SyncType.Gist);
      if (!config) return;

      const ttlMs = daysToKeep * 24 * 60 * 60 * 1000;
      const cutoffTime = Date.now() - ttlMs;
      let prunedCount = 0;

      // 返回 null 表示"无变化"（input 缺失或没有过期记录），否则返回新数组
      const trim = <T extends { deletedAt: number }>(arr: T[] | undefined): T[] | null => {
        if (!arr || arr.length === 0) return null;
        const filtered = arr.filter((record) => record.deletedAt > cutoffTime);
        if (filtered.length === arr.length) return null;
        prunedCount += arr.length - filtered.length;
        return filtered;
      };

      const updates: Partial<SyncConfig> = {};
      const novel = trim(config.deletedNovelIds);
      if (novel) updates.deletedNovelIds = novel;
      const model = trim(config.deletedModelIds);
      if (model) updates.deletedModelIds = model;
      const cover = trim(config.deletedCoverIds);
      if (cover) updates.deletedCoverIds = cover;
      const coverUrl = trim(config.deletedCoverUrls);
      if (coverUrl) updates.deletedCoverUrls = coverUrl;
      const memory = trim(config.deletedMemoryIds);
      if (memory) updates.deletedMemoryIds = memory;

      if (Object.keys(updates).length === 0) return;

      console.debug(
        `[settings] cleanupOldDeletionRecords 修剪 ${prunedCount} 条记录 (cutoff=${new Date(cutoffTime).toISOString()})`,
      );
      await this.updateGistSync(updates);
    },

    /**
     * 设置 Gist 同步启用状态
     */
    async setGistSyncEnabled(enabled: boolean): Promise<void> {
      await this.updateGistSync({ enabled });
    },

    /**
     * 清空所有"主动传播删除"的同步状态（一次 updateGistSync 调用）。
     *
     * 在以下场景调用以避免恢复回来的条目被旧墓碑再次删除：
     *   - 修订快照恢复（overwriteFromSnapshot）
     *   - 文件导入覆盖（ImportExportTab，且导入文件没有 sync 字段时）
     *
     * 清空字段：
     *   - `deletedNovelIds`        → 写入 manifest.tombstones["novel:<id>"]
     *   - `deletedModelIds`        → 上传合并时过滤远端模型
     *   - `deletedMemoryIds`       → 写入 memories envelope.tombstones（v3+ 主动传播）
     *   - `knownRemoteTombstones`  → 与上面合并进 manifest.tombstones（旧远端状态残留）
     *
     * 保留字段（仅本地过滤、不主动跨设备传播）：deletedCoverIds / deletedCoverUrls
     */
    async clearSyncDeletionPropagationState(): Promise<void> {
      const config = this.syncs.find((sync) => sync.syncType === SyncType.Gist);
      if (!config) return;
      await this.updateGistSync(getSyncDeletionPropagationStateClearedPatch());
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
     * 更新上次远程 Gist 响应的 ETag（用于条件 GET 与伪 CAS）
     */
    async updateLastRemoteETag(etag: string): Promise<void> {
      await this.updateGistSync({ lastRemoteETag: etag });
    },

    /**
     * 更新已知的远程 manifest 哈希表（entryKey -> hash）
     */
    async updateKnownRemoteHashes(hashes: Record<string, string>): Promise<void> {
      await this.updateGistSync({ knownRemoteHashes: hashes });
    },

    /**
     * 更新已知的远程 manifest 条目元数据（entryKey -> { hash, chunks }）
     *
     * 与 updateKnownRemoteHashes 相比，额外记录每条目的 chunks 数；
     * 上传流程用它枚举每个 entry 在 Gist 上的所有文件名，避免删除/chunk 迁移后留下孤儿文件。
     */
    async updateKnownRemoteEntries(
      entries: Record<string, { hash: string; chunks?: number }>,
    ): Promise<void> {
      await this.updateGistSync({ knownRemoteEntries: entries });
    },

    /**
     * 更新已知的远程 manifest 墓碑表（entryKey -> deletedAt ISO）
     */
    async updateKnownRemoteTombstones(tombstones: Record<string, string>): Promise<void> {
      await this.updateGistSync({ knownRemoteTombstones: tombstones });
    },

    /**
     * 更新强制推送模式状态
     * 传 { active: false } 时会同时清除 lastFailedAt
     */
    async updateForceSyncMode(partial: {
      active: boolean;
      lastFailedAt?: number | undefined;
    }): Promise<void> {
      // active=false 时强制清除 lastFailedAt，保证语义：关闭 = 完全退出强制模式
      const next: { active: boolean; lastFailedAt?: number } = partial.active
        ? {
            active: true,
            ...(partial.lastFailedAt !== undefined ? { lastFailedAt: partial.lastFailedAt } : {}),
          }
        : { active: false };
      await this.updateGistSync({ forceSyncMode: next });
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
      void applySyncEmbeddingGate(syncing || this.isRestoringSyncSnapshot);
    },

    /**
     * 设置“恢复修订版本快照中”的共享状态
     * 供设置页与同步状态面板统一禁用相关操作按钮
     */
    setRestoringSyncSnapshot(restoring: boolean): void {
      this.isRestoringSyncSnapshot = restoring;
      void applySyncEmbeddingGate(this.isSyncing || restoring);
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
      const stageChanged =
        progress.stage !== undefined && progress.stage !== this.syncProgress.stage;
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
