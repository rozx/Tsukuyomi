/** [总窗口, 最大输出, 可选的独立输入上限]。 */
export type CatalogEntry = readonly [number, number, number?];
export type LimitsCatalog = Readonly<Record<string, Readonly<Record<string, CatalogEntry>>>>;

export const CATALOG_PROVIDERS = [
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
