import { delayAbortable, runAbortable } from 'src/utils/abortable-operation';
import { DEFAULT_CORS_PROXY_FOR_AI } from 'src/constants/proxy';
import { extractRootDomain } from 'src/utils/domain-utils';
import { isElectron } from 'src/utils/platform';
import { GlobalConfig } from 'src/services/global-config-cache';
import { useSettingsStore } from 'src/stores/settings';
import { classifyFetchFailure, resolveFetchPlan } from 'src/services/proxy-fetch-plan';
import type { FetchPlan } from 'src/services/proxy-fetch-plan';

/** 瞬时错误（网络 / 超时 / 429 / 5xx）重试同一地址前的等待 */
const TRANSIENT_RETRY_DELAY_MS = 1000;

interface ProxyUrlOptions {
  skipProxy?: boolean;
  skipInternalProxy?: boolean;
  /** 跳过外部 CORS 代理，仍可使用 /api/ 内部代理与 Firecrawl 回退 */
  skipExternalProxy?: boolean;
}

function rootDomainOf(url: string): string | null {
  try {
    return extractRootDomain(new URL(url).hostname) || null;
  } catch {
    return null;
  }
}

function buildPlan(
  originalUrl: string,
  options: ProxyUrlOptions,
  firecrawlFallbackEnabled: boolean,
): FetchPlan {
  const rootDomain = rootDomainOf(originalUrl);
  return resolveFetchPlan({
    url: originalUrl,
    isElectron: isElectron(),
    proxyEnabled: GlobalConfig.getProxyEnabled(),
    defaultProxyUrl: GlobalConfig.getProxyUrl(),
    siteProxies: rootDomain ? GlobalConfig.getProxiesForSite(rootDomain) : [],
    firecrawlFallbackEnabled,
    ...options,
  });
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('操作已取消', 'AbortError');
}

/**
 * 依次执行首要尝试：瞬时错误重试同一地址一次；被拦截换下一个地址；致命错误直接抛出。
 * 全部被拦截时返回 { blocked: true, error }，由调用方决定是否回退 Firecrawl。
 */
async function runPrimaryAttempts<T>(
  attempts: string[],
  requestFn: (proxiedUrl: string) => Promise<T>,
  signal: AbortSignal | undefined,
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  let lastError: unknown = new Error('Request failed');
  for (const url of attempts) {
    for (let retry = 0; retry < 2; retry++) {
      try {
        return { ok: true, value: await runAbortable(signal, () => requestFn(url)) };
      } catch (error) {
        if (signal?.aborted) throw abortReason(signal);
        lastError = error;
        const kind = classifyFetchFailure(error);
        console.error('[ProxyService] ❌ 请求失败', {
          url,
          error: error instanceof Error ? error.message : String(error),
          kind,
        });
        if (kind === 'abort' || kind === 'fatal') throw error;
        if (kind === 'transient' && retry === 0) {
          await delayAbortable(TRANSIENT_RETRY_DELAY_MS, signal);
          continue;
        }
        break;
      }
    }
  }
  return { ok: false, error: lastError };
}

/**
 * 代理服务
 * 统一管理网页抓取的代理与 Firecrawl 回退，以及 AI 调用的 CORS 代理
 */
export class ProxyService {
  /**
   * 获取首要尝试使用的 URL（不含 Firecrawl：映射中的 firecrawl 令牌会被跳过）
   */
  static getProxiedUrl(originalUrl: string, options: ProxyUrlOptions = {}): string {
    return buildPlan(originalUrl, options, false).attempts[0] ?? originalUrl;
  }

  /**
   * 获取 AI 调用的 CORS 代理 URL（仅在浏览器模式下）
   * 在浏览器模式下，使用用户设置中的 CORS 代理来绕过 CORS 限制
   * @param originalUrl 原始 URL
   * @param useCorsProxy 是否使用 CORS 代理，undefined 或 true 表示启用，false 表示跳过
   * @returns 代理后的 URL 或原始 URL
   */
  static getProxiedUrlForAI(originalUrl: string, useCorsProxy?: boolean): string {
    // 如果模型级别显式禁用 CORS 代理，直接返回原始 URL
    if (useCorsProxy === false) {
      return originalUrl;
    }

    // 如果全局代理被禁用，直接返回原始 URL
    if (!GlobalConfig.getProxyEnabled()) {
      return originalUrl;
    }

    // 仅在浏览器模式下使用 CORS 代理
    if (!isElectron()) {
      // 使用用户设置中的代理 URL，回退到默认常量
      const proxyUrlTemplate = GlobalConfig.getProxyUrl() || DEFAULT_CORS_PROXY_FOR_AI;
      const proxiedUrl = proxyUrlTemplate.replace('{url}', encodeURIComponent(originalUrl));
      return proxiedUrl;
    }

    // Electron 模式下直接返回原始 URL
    return originalUrl;
  }

  /**
   * 回退成功且开启自动添加映射时，把 firecrawl 置顶写入该根域名映射（静默）。
   */
  private static async maybePromoteFirecrawl(originalUrl: string): Promise<void> {
    if (!GlobalConfig.getFirecrawlAutoAddMapping()) return;
    const rootDomain = rootDomainOf(originalUrl);
    if (!rootDomain) return;
    try {
      await useSettingsStore().promoteFirecrawlForSite(rootDomain);
    } catch (error) {
      console.warn('[ProxyService] 写入 Firecrawl 映射失败', error);
    }
  }

  /**
   * 按尝试链执行网页抓取（名称沿用历史，不再在代理列表中轮转）：
   * 1. 映射首位为 firecrawl 且回退开启 → 直接 Firecrawl
   * 2. 否则首要尝试（Web 代理开启：映射的 CORS 代理按序，否则默认代理；Web 代理关闭：内部 /api/ 或直连；
   *    Electron：直连），瞬时错误重试一次
   * 3. 首要尝试被拦截且回退开启 → Firecrawl，成功后按设置置顶映射
   * @param requestFn 首要尝试的请求函数，接受实际请求的 URL
   * @param options.firecrawl Firecrawl 抓取回调；未提供时不回退
   */
  static async executeWithAutoSwitch<T>(
    originalUrl: string,
    requestFn: (proxiedUrl: string) => Promise<T>,
    options: ProxyUrlOptions & {
      firecrawl?: () => Promise<T>;
      signal?: AbortSignal;
    } = {},
  ): Promise<T> {
    const { firecrawl, signal, ...urlOptions } = options;
    await GlobalConfig.ensureInitialized({ ensureSettings: true, ensureBooks: false });
    const fallbackEnabled = !!firecrawl && GlobalConfig.getFirecrawlFallbackEnabled();
    const plan = buildPlan(originalUrl, urlOptions, fallbackEnabled);

    if (plan.firecrawlFirst && firecrawl) {
      return await runAbortable(signal, firecrawl);
    }

    const primary = await runPrimaryAttempts(plan.attempts, requestFn, signal);
    if (primary.ok) return primary.value;
    if (!plan.firecrawlFallback || !firecrawl) throw primary.error;

    const result = await runAbortable(signal, firecrawl);
    await this.maybePromoteFirecrawl(originalUrl);
    return result;
  }
}
