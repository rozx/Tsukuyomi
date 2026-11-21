import type { AIModel } from 'src/services/ai/types/ai-model';
import { MODELS_DEV_API_URL, buildLimitsCatalog } from './catalog-types';
import type { LimitsCatalog, ModelsDevDatabase } from './catalog-types';
import { lookupModelLimits } from './resolve';
import type { EffectiveModelLimits } from './resolve';

type ModelIdentity = Pick<AIModel, 'provider' | 'model'> & Partial<Pick<AIModel, 'baseUrl'>>;

export interface LatestModelLimits {
  limits: Omit<EffectiveModelLimits, 'source'> | undefined;
  /** models.dev 在线目录不可达，limits 来自打包快照（可能过时）。 */
  offline: boolean;
}

const DEFAULT_TIMEOUT_MS = 20_000;

/** 下载 models.dev 完整目录；超时与调用方取消都会中止请求。 */
async function fetchLiveCatalog(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort);
  try {
    const response = await fetch(MODELS_DEV_API_URL, { signal: controller.signal });
    if (!response.ok) throw new Error(`models.dev HTTP ${response.status}`);
    const catalog = buildLimitsCatalog((await response.json()) as ModelsDevDatabase);
    if (!Object.keys(catalog).length) throw new Error('models.dev 返回空目录');
    return catalog as LimitsCatalog;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

/**
 * 用户主动获取模型资料时查询 models.dev 最新目录；网络不可用时回退打包快照。
 * 打包快照只在发版前手动刷新，新发布的模型只能靠在线目录查到。
 */
export async function lookupLatestModelLimits(
  model: ModelIdentity,
  options: { signal?: AbortSignal | undefined; timeoutMs?: number } = {},
): Promise<LatestModelLimits> {
  let live: LimitsCatalog | undefined;
  try {
    live = await fetchLiveCatalog(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  } catch (error) {
    if (options.signal?.aborted) throw error;
  }
  return live
    ? { limits: await lookupModelLimits(model, live), offline: false }
    : { limits: await lookupModelLimits(model), offline: true };
}
