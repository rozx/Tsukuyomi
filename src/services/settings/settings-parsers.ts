import type { AppSettings, Settings } from 'src/models/settings';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { Novel, CoverHistoryItem } from 'src/models/novel';
import type { Memory } from 'src/models/memory';
import type { SyncConfig } from 'src/models/sync';
import { SyncType } from 'src/models/sync';

/**
 * 将 Date / number / string 转成毫秒时间戳。
 */
function toTimestamp(value: Date | number | string): number {
  if (typeof value === 'number') return value;
  return new Date(value).getTime();
}

/**
 * 校验 settings 顶层结构。结构非法时返回错误消息，否则返回 null。
 */
export function validateSettingsShape(settings: Settings): string | null {
  if (!settings || typeof settings !== 'object') {
    return '无效的设置数据格式';
  }
  if (!Array.isArray(settings.aiModels)) {
    return '设置数据中缺少有效的 aiModels 数组';
  }
  if (settings.novels !== undefined && !Array.isArray(settings.novels)) {
    return '设置数据中的 novels 字段格式无效';
  }
  if (settings.coverHistory !== undefined && !Array.isArray(settings.coverHistory)) {
    return '设置数据中的 coverHistory 字段格式无效';
  }
  if (settings.memories !== undefined && !Array.isArray(settings.memories)) {
    return '设置数据中的 memories 字段格式无效';
  }
  if (settings.sync !== undefined && !Array.isArray(settings.sync)) {
    return '设置数据中的 sync 字段格式无效';
  }
  return null;
}

export function parseAiModels(raw: unknown[]): AIModel[] {
  const valid: AIModel[] = [];
  for (const model of raw) {
    if (
      typeof model === 'object' &&
      model !== null &&
      (model as AIModel).id &&
      (model as AIModel).name &&
      (model as AIModel).provider &&
      (model as AIModel).model &&
      (model as AIModel).apiKey
    ) {
      const m = model as AIModel;
      valid.push({
        ...m,
        lastEdited: m.lastEdited ? new Date(m.lastEdited) : new Date(),
      });
    }
  }
  return valid;
}

export function parseNovels(raw: unknown[] | undefined): Novel[] {
  if (!raw || !Array.isArray(raw)) return [];
  const valid: Novel[] = [];
  for (const novel of raw) {
    if (
      typeof novel === 'object' &&
      novel !== null &&
      (novel as Novel).id &&
      (novel as Novel).title &&
      (novel as Novel).createdAt &&
      (novel as Novel).lastEdited
    ) {
      const n = novel as Novel;
      valid.push({
        ...n,
        createdAt: new Date(n.createdAt),
        lastEdited: new Date(n.lastEdited),
      });
    }
  }
  return valid;
}

export function parseCoverHistory(raw: unknown[] | undefined): CoverHistoryItem[] {
  if (!raw || !Array.isArray(raw)) return [];
  const valid: CoverHistoryItem[] = [];
  for (const cover of raw) {
    if (
      typeof cover === 'object' &&
      cover !== null &&
      (cover as CoverHistoryItem).id &&
      (cover as CoverHistoryItem).url &&
      (cover as CoverHistoryItem).addedAt
    ) {
      const c = cover as CoverHistoryItem;
      valid.push({ ...c, addedAt: new Date(c.addedAt) });
    }
  }
  return valid;
}

export function parseMemories(raw: unknown[] | undefined): Memory[] {
  if (!raw || !Array.isArray(raw)) return [];
  const valid: Memory[] = [];
  for (const memory of raw) {
    if (
      typeof memory === 'object' &&
      memory !== null &&
      (memory as Memory).id &&
      (memory as Memory).bookId &&
      (memory as Memory).content &&
      typeof (memory as Memory).summary === 'string' &&
      (memory as Memory).createdAt &&
      (memory as Memory).lastAccessedAt
    ) {
      const m = memory as Memory;
      valid.push({
        ...m,
        createdAt: toTimestamp(m.createdAt as unknown as Date | number | string),
        lastAccessedAt: toTimestamp(m.lastAccessedAt as unknown as Date | number | string),
      });
    }
  }
  return valid;
}

function isValidSyncConfig(raw: unknown): raw is SyncConfig {
  if (typeof raw !== 'object' || raw === null) return false;
  const c = raw as SyncConfig;
  return (
    typeof c.enabled === 'boolean' &&
    typeof c.lastSyncTime === 'number' &&
    typeof c.syncInterval === 'number' &&
    typeof c.syncType === 'string' &&
    Object.values(SyncType).includes(c.syncType as SyncType) &&
    typeof c.syncParams === 'object' &&
    typeof c.secret === 'string' &&
    typeof c.apiEndpoint === 'string'
  );
}

export function parseSyncConfigs(raw: unknown[] | undefined): SyncConfig[] {
  if (!raw || !Array.isArray(raw)) return [];
  const valid: SyncConfig[] = [];
  for (const item of raw) {
    if (!isValidSyncConfig(item)) continue;
    valid.push({
      enabled: item.enabled,
      lastSyncTime: item.lastSyncTime,
      syncInterval: item.syncInterval,
      syncType: item.syncType as SyncType,
      syncParams: item.syncParams || {},
      secret: item.secret,
      apiEndpoint: item.apiEndpoint,
      ...(item.lastSyncedModelIds && Array.isArray(item.lastSyncedModelIds)
        ? { lastSyncedModelIds: item.lastSyncedModelIds }
        : {}),
    });
  }
  return valid;
}

const TASK_DEFAULT_MODEL_KEYS = [
  'translation',
  'proofreading',
  'termsTranslation',
  'assistant',
] as const;

type TaskDefaultModels = NonNullable<AppSettings['taskDefaultModels']>;

function parseTaskDefaultModels(raw: unknown): TaskDefaultModels | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const source = raw as Record<string, unknown>;
  const result: TaskDefaultModels = {};

  for (const key of TASK_DEFAULT_MODEL_KEYS) {
    const modelId = source[key];
    if (modelId === null || (typeof modelId === 'string' && modelId.length > 0)) {
      result[key as keyof TaskDefaultModels] = modelId as string | null;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

const MIN_SCRAPER_CONCURRENCY = 1;
const MAX_SCRAPER_CONCURRENCY = 10;
const DEFAULT_SCRAPER_CONCURRENCY = 3;

function pickScraperConcurrency(value: unknown): number {
  if (
    typeof value === 'number' &&
    value >= MIN_SCRAPER_CONCURRENCY &&
    value <= MAX_SCRAPER_CONCURRENCY
  ) {
    return value;
  }
  return DEFAULT_SCRAPER_CONCURRENCY;
}

/**
 * 把已知的 AppSettings 可选字段从 source 透传到 target（仅当已定义）。
 * 任何新增的顶层 AppSettings 字段都需要在这里追加，否则导出/导入会静默丢失该字段。
 */
function copyOptionalAppSettingsFields(target: AppSettings, source: AppSettings): void {
  if (source.lastOpenedSettingsTab !== undefined) {
    target.lastOpenedSettingsTab = source.lastOpenedSettingsTab;
  }
  if (source.proxyEnabled !== undefined) target.proxyEnabled = source.proxyEnabled;
  if (source.proxyUrl !== undefined) target.proxyUrl = source.proxyUrl;
  if (source.proxyAutoSwitch !== undefined) target.proxyAutoSwitch = source.proxyAutoSwitch;
  if (source.proxyAutoAddMapping !== undefined) {
    target.proxyAutoAddMapping = source.proxyAutoAddMapping;
  }
  if (source.proxySiteMapping !== undefined) target.proxySiteMapping = source.proxySiteMapping;
  if (source.proxyList !== undefined) target.proxyList = source.proxyList;
  if (typeof source.quickStartDismissed === 'boolean') {
    target.quickStartDismissed = source.quickStartDismissed;
  }
  if (source.tavilyApiKey !== undefined) target.tavilyApiKey = source.tavilyApiKey;
  if (source.booksSortOption !== undefined) target.booksSortOption = source.booksSortOption;
  if (source.memoryInjection !== undefined) target.memoryInjection = source.memoryInjection;
  if (typeof source.enableLocalEmbedding === 'boolean') {
    target.enableLocalEmbedding = source.enableLocalEmbedding;
  }
}

export function parseAppSettings(raw: unknown): AppSettings | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const source = raw as AppSettings;

  const result: AppSettings = {
    lastEdited: source.lastEdited ? new Date(source.lastEdited) : new Date(),
    scraperConcurrencyLimit: pickScraperConcurrency(source.scraperConcurrencyLimit),
  };

  const taskDefaultModels = parseTaskDefaultModels(source.taskDefaultModels);
  if (taskDefaultModels) {
    result.taskDefaultModels = taskDefaultModels;
  }

  copyOptionalAppSettingsFields(result, source);

  return result;
}
