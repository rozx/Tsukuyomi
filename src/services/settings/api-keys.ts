import type { AppSettings } from 'src/models/settings';

export const API_KEY_FIELDS = ['tavilyApiKey', 'firecrawlApiKey'] as const;
type ApiKeySettings = Pick<AppSettings, (typeof API_KEY_FIELDS)[number] | 'apiKeysUpdatedAt'>;
type Input = {
  lastEdited?: unknown;
  tavilyApiKey?: unknown;
  firecrawlApiKey?: unknown;
  apiKeysUpdatedAt?: unknown;
};

function validTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** 旧 Key 的时间只初始化一次；缺省不表示删除，有有效字段时间的缺省才是清空记录。 */
export function normalizeApiKeySettings(settings: Input): ApiKeySettings {
  const result: ApiKeySettings = {};
  const times: NonNullable<AppSettings['apiKeysUpdatedAt']> = {};
  const rawTimes = settings.apiKeysUpdatedAt;
  const timeRecord =
    rawTimes && typeof rawTimes === 'object' && !Array.isArray(rawTimes)
      ? (rawTimes as Record<string, unknown>)
      : {};
  const fallback =
    settings.lastEdited instanceof Date
      ? settings.lastEdited.getTime()
      : typeof settings.lastEdited === 'string'
        ? new Date(settings.lastEdited).getTime()
        : settings.lastEdited;

  for (const field of API_KEY_FIELDS) {
    const value = settings[field];
    const time = timeRecord[field];
    if (typeof value !== 'string' && !(value === undefined && validTime(time))) continue;
    result[field] = typeof value === 'string' ? value.trim() || undefined : undefined;
    times[field] = validTime(time) ? time : validTime(fallback) ? fallback : 0;
  }
  if (Object.keys(times).length) result.apiKeysUpdatedAt = times;
  return result;
}

/** 按 Key 合并；同刻清空优先，其他同刻冲突使用稳定顺序以保证双向收敛。 */
export function mergeApiKeySettings(local: Input, remote: Input): ApiKeySettings {
  const a = normalizeApiKeySettings(local);
  const b = normalizeApiKeySettings(remote);
  const result = { ...a };
  const times = { ...a.apiKeysUpdatedAt };
  for (const field of API_KEY_FIELDS) {
    const remoteTime = b.apiKeysUpdatedAt?.[field];
    if (remoteTime === undefined) continue;
    const localTime = times[field];
    const localValue = result[field];
    const remoteValue = b[field];
    if (
      localTime === undefined ||
      remoteTime > localTime ||
      (remoteTime === localTime &&
        (remoteValue === undefined || (localValue !== undefined && remoteValue > localValue)))
    ) {
      result[field] = remoteValue;
      times[field] = remoteTime;
    }
  }
  if (Object.keys(times).length) result.apiKeysUpdatedAt = times;
  return result;
}
