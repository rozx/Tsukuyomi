import type { AIModel } from 'src/services/ai/types/ai-model';
import { normalizeModelId, positiveLimit } from './catalog-types';
import type { CatalogEntry, LimitsCatalog } from './catalog-types';

type ModelIdentity = Pick<AIModel, 'provider' | 'model'> & Partial<Pick<AIModel, 'baseUrl'>>;
type ModelLimitsInput = ModelIdentity &
  Pick<AIModel, 'maxInputTokens' | 'maxOutputTokens'> &
  Partial<Pick<AIModel, 'limitsSource'>>;
export interface EffectiveModelLimits {
  contextWindow?: number | undefined;
  maxOutput?: number | undefined;
  source: 'manual' | 'catalog' | 'probe' | 'stored';
}

let catalogPromise: Promise<LimitsCatalog> | undefined;
function loadCatalog(): Promise<LimitsCatalog> {
  return (catalogPromise ??= import('./catalog.json').then(
    ({ default: catalog }) => catalog as unknown as LimitsCatalog,
  ));
}

function providerFor(model: ModelIdentity): string | undefined {
  if (model.provider === 'gemini') return 'google';
  let hostname: string;
  try {
    hostname = new URL(model.baseUrl || 'https://api.openai.com').hostname;
  } catch {
    return undefined;
  }
  const providers: Record<string, string> = {
    'api.openai.com': 'openai',
    'api.deepseek.com': 'deepseek',
    'api.moonshot.ai': 'moonshotai',
    'api.moonshot.cn': 'moonshotai-cn',
    'openrouter.ai': 'openrouter',
    'api.openrouter.ai': 'openrouter',
    'generativelanguage.googleapis.com': 'google',
  };
  return providers[hostname];
}

function matchingEntries(
  models: Readonly<Record<string, CatalogEntry>>,
  id: string,
): CatalogEntry[] {
  const exact = Object.entries(models).filter(([name]) => name.toLowerCase() === id.toLowerCase());
  return (
    exact.length
      ? exact
      : Object.entries(models).filter(([name]) => normalizeModelId(name) === normalizeModelId(id))
  )
    .map(([, entry]) => entry)
    .filter((entry) => positiveLimit(entry[0]) !== undefined);
}

export async function lookupModelLimits(
  model: ModelIdentity,
  catalog?: LimitsCatalog,
): Promise<Omit<EffectiveModelLimits, 'source'> | undefined> {
  const source = catalog ?? (await loadCatalog());
  const provider = providerFor(model);
  const scoped = provider ? matchingEntries(source[provider] ?? {}, model.model) : [];
  const entries = scoped.length
    ? scoped
    : Object.values(source).flatMap((models) => matchingEntries(models, model.model));
  if (!entries.length) return undefined;
  const contextWindow = Math.min(
    ...entries.map(([context, , input]) => Math.min(context, positiveLimit(input) ?? context)),
  );
  const outputs = entries
    .map(([, output]) => positiveLimit(output))
    .filter((value): value is number => value !== undefined);
  return { contextWindow, ...(outputs.length ? { maxOutput: Math.min(...outputs) } : {}) };
}

export async function resolveModelLimits(
  model: ModelLimitsInput,
  catalog?: LimitsCatalog,
): Promise<EffectiveModelLimits> {
  if (model.limitsSource !== 'manual') {
    const found = await lookupModelLimits(model, catalog);
    if (found) return { ...found, source: 'catalog' };
  }
  const contextWindow = positiveLimit(model.maxInputTokens);
  const maxOutput = positiveLimit(model.maxOutputTokens);
  return {
    ...(contextWindow ? { contextWindow } : {}),
    ...(maxOutput ? { maxOutput } : {}),
    source: model.limitsSource ?? 'stored',
  };
}
