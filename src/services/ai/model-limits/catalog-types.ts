/** [总窗口, 最大输出, 可选的独立输入上限]。 */
export type CatalogEntry = readonly [number, number, number?];
export type LimitsCatalog = Readonly<Record<string, Readonly<Record<string, CatalogEntry>>>>;

/** models.dev 完整目录（CORS 开放，带 ETag，浏览器会自动条件请求）。 */
export const MODELS_DEV_API_URL = 'https://models.dev/api.json';

export const CATALOG_PROVIDERS = [
  'anthropic',
  'openai',
  'deepseek',
  'moonshotai',
  'moonshotai-cn',
  'google',
  'openrouter',
] as const;

export function normalizeModelId(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/^models\//, '')
    .replace(/^[^/]+\//, '')
    .replace(/\((?:none|minimal|low|medium|high|xhigh)\)$/, '');
}

export function positiveLimit(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

interface ModelsDevModel {
  limit?: { context?: unknown; output?: unknown; input?: unknown } | null;
}
/** models.dev /api.json 的结构（只声明用到的字段，其余字段忽略）。 */
export type ModelsDevDatabase = Record<
  string,
  { models?: Record<string, ModelsDevModel | null> | null } | null
>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function toCatalogEntry(model: unknown): CatalogEntry | undefined {
  const limit = isRecord(model) && isRecord(model.limit) ? model.limit : undefined;
  const context = positiveLimit(limit?.context);
  if (!context) return undefined;
  const output = positiveLimit(limit?.output) ?? 0;
  const input = positiveLimit(limit?.input);
  return input ? [context, output, input] : [context, output];
}

/** 把 models.dev 原始目录转换为按提供商分组的上限目录；容忍缺字段与损坏条目。 */
export function buildLimitsCatalog(
  data: ModelsDevDatabase,
): Record<string, Record<string, CatalogEntry>> {
  const catalog: Record<string, Record<string, CatalogEntry>> = {};
  if (!isRecord(data)) return catalog;
  for (const provider of Object.keys(data).sort()) {
    const raw = data[provider];
    const rawModels = isRecord(raw) && isRecord(raw.models) ? raw.models : {};
    const models: Record<string, CatalogEntry> = {};
    for (const id of Object.keys(rawModels).sort((a, b) => a.localeCompare(b))) {
      const entry = toCatalogEntry(rawModels[id]);
      if (entry) models[id] = entry;
    }
    if (Object.keys(models).length) catalog[provider] = models;
  }
  return catalog;
}
