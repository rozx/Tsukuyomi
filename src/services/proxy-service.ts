import { DEFAULT_CORS_PROXY_FOR_AI } from 'src/constants/proxy';
import { extractRootDomain } from 'src/utils/domain-utils';
import { isElectron } from 'src/utils/platform';
import { GlobalConfig } from 'src/services/global-config-cache';
import { useSettingsStore } from 'src/stores/settings';

// 注意：代理列表现在从 settings store 中获取，不再使用硬编码的列表

const INTERNAL_PROXY_HOSTS: Record<string, string> = {
  'kakuyomu.jp': '/api/kakuyomu',
  'ncode.syosetu.com': '/api/ncode',
  'novel18.syosetu.com': '/api/novel18',
  'syosetu.org': '/api/syosetu',
  'p.sda1.dev': '/api/sda1',
};

function buildInternalProxyPath(originalUrl: string): string | null {
  const urlObj = new URL(originalUrl);
  const prefix = INTERNAL_PROXY_HOSTS[urlObj.hostname];
  if (!prefix) return null;
  return `${prefix}${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
}

/** axios 错误状态码是否被视为网络错误（4xx/5xx 均算） */
function isNetworkErrorStatus(status: number | undefined): boolean {
  return !!status && (status >= 400 || status === 408 || status === 429 || status >= 500);
}

/** axios 错误 code 是否被视为网络错误 */
function isNetworkErrorCode(code: string | undefined): boolean {
  return (
    !!code && ['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ERR_FAILED'].includes(code)
  );
}

/** Error.message 中触发"网络错误"判定的关键词列表 */
const NETWORK_ERROR_KEYWORDS: readonly string[] = [
  'cors',
  '408', // Request Timeout
  '429', // Too Many Requests
  '500', // Internal Server Error
  '502', // Bad Gateway
  '503', // Service Unavailable
  '504', // Gateway Timeout
  'network',
  'failed to fetch',
  'err_failed',
  'timeout',
  'econnrefused',
  'enotfound',
  'request failed with status code', // axios 错误消息
];

/** 根据当前代理 URL 构建本次尝试实际请求的 URL */
function buildAttemptProxiedUrl(originalUrl: string, currentProxyUrl: string | null): string {
  if (!currentProxyUrl) return originalUrl;
  return currentProxyUrl.replace('{url}', encodeURIComponent(originalUrl));
}

/** 第一次尝试（attemptIndex = 0）的代理选择策略 */
function pickFirstAttemptProxy(
  defaultProxyUrl: string,
  siteProxies: string[],
): string | null {
  if (defaultProxyUrl && siteProxies.length > 0 && siteProxies.includes(defaultProxyUrl)) {
    return defaultProxyUrl;
  }
  if (siteProxies.length > 0) return siteProxies[0] ?? null;
  return defaultProxyUrl || null;
}

/** 后续尝试的代理候选顺序（网站特定代理轮转 + 全局代理补足） */
function buildFallbackProxyOrder(
  defaultProxyUrl: string,
  siteProxies: string[],
  proxyList: { url: string }[],
): string[] {
  const siteProxyUrls = new Set(siteProxies);
  const ordered: string[] = [];

  if (siteProxies.length > 0) {
    const defaultIndex = defaultProxyUrl
      ? siteProxies.findIndex((url) => url === defaultProxyUrl)
      : -1;
    if (defaultIndex >= 0) {
      // 如果默认代理在网站特定列表中，从它之后开始轮转
      ordered.push(...siteProxies.slice(defaultIndex + 1));
      ordered.push(...siteProxies.slice(0, defaultIndex));
    } else {
      ordered.push(...siteProxies);
    }
  }

  // 全局代理列表中不在网站特定代理列表中的代理
  const globalProxies = proxyList
    .map((p) => p.url)
    .filter((url) => !siteProxyUrls.has(url) && url !== defaultProxyUrl);
  ordered.push(...globalProxies);
  return ordered;
}

/** executeWithAutoSwitch 的重试动作（继续等待或抛出） */
type RetryAction = { kind: 'throw' } | { kind: 'delay'; ms: number };
function computeRetryAction(
  autoSwitch: boolean,
  isNetworkErr: boolean,
  attempt: number,
  maxRetries: number,
): RetryAction {
  // 启用了自动切换且是网络错误 → 短暂等待后换下一个代理
  if (autoSwitch && isNetworkErr && attempt < maxRetries - 1) {
    return { kind: 'delay', ms: 500 };
  }
  // 已是最后一次尝试 → 抛出
  if (attempt === maxRetries - 1) return { kind: 'throw' };
  // 其它情况 → 指数退避后重试
  return { kind: 'delay', ms: (attempt + 1) * 1000 };
}

/**
 * 代理服务
 * 统一管理所有网络请求的代理设置
 */
export class ProxyService {
  /**
   * 获取代理后的 URL
   * 如果代理启用，返回代理 URL；否则返回原始 URL
   * @param originalUrl 原始 URL
   * @param options 选项
   * @returns 代理后的 URL 或原始 URL
   */
  static getProxiedUrl(
    originalUrl: string,
    options: {
      skipProxy?: boolean;
      skipInternalProxy?: boolean;
      /** 跳过外部 CORS 代理，仍可使用 /api/ 内部代理 */
      skipExternalProxy?: boolean;
    } = {},
  ): string {
    const { skipProxy = false, skipInternalProxy = false, skipExternalProxy = false } = options;
    if (skipProxy) return originalUrl;
    if (originalUrl.startsWith('/api/')) return originalUrl;

    const proxyEnabled = GlobalConfig.getProxyEnabled();
    if (proxyEnabled && !skipExternalProxy) {
      const resolvedProxyUrl = this.resolveExternalProxyUrl(originalUrl);
      if (resolvedProxyUrl) {
        return resolvedProxyUrl.replace('{url}', encodeURIComponent(originalUrl));
      }
    }

    if (!skipInternalProxy && !isElectron()) {
      const internal = buildInternalProxyPath(originalUrl);
      if (internal) return internal;
    }

    return originalUrl;
  }

  private static resolveExternalProxyUrl(originalUrl: string): string | null {
    let proxyUrl = GlobalConfig.getProxyUrl();
    const domain = this.extractDomain(originalUrl);
    const rootDomain = domain ? extractRootDomain(domain) : null;
    if (rootDomain) {
      const siteProxies = GlobalConfig.getProxiesForSite(rootDomain);
      if (siteProxies.length > 0 && !(proxyUrl && siteProxies.includes(proxyUrl))) {
        const siteProxy = siteProxies[0];
        if (siteProxy) proxyUrl = siteProxy;
      }
    }
    return proxyUrl && proxyUrl.trim() ? proxyUrl : null;
  }

  /**
   * 从 URL 中提取域名
   */
  private static extractDomain(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return null;
    }
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
   * 检查错误是否是网络错误（需要切换代理的错误）
   * @param error 错误对象
   * @returns 是否是网络错误
   */
  private static isNetworkError(error: unknown): boolean {
    // 检查 axios 错误的状态码 / code
    if (error && typeof error === 'object' && 'isAxiosError' in error) {
      const axiosError = error as { response?: { status?: number }; code?: string };
      if (isNetworkErrorStatus(axiosError.response?.status)) return true;
      if (isNetworkErrorCode(axiosError.code)) return true;
    }

    if (!(error instanceof Error)) {
      return false;
    }

    const errorMessage = error.message.toLowerCase();
    return NETWORK_ERROR_KEYWORDS.some((keyword) => errorMessage.includes(keyword));
  }

  /**
   * 获取当前尝试应该使用的代理 URL（不改变全局设置）
   * 策略：
   * 1. 第一次尝试（attemptIndex = 0）：优先使用默认代理，如果默认代理在网站特定列表中则使用它
   * 2. 后续尝试：先尝试网站特定代理列表中的所有代理（排除已尝试的）
   * 3. 如果网站特定代理都用完了，继续尝试全局代理列表中不在网站特定代理列表中的代理
   * @param originalUrl 原始 URL
   * @param attemptIndex 当前尝试索引（0 表示使用默认代理）
   * @returns 代理 URL 或 null
   */
  private static getProxyUrlForAttempt(originalUrl: string, attemptIndex: number): string | null {
    const defaultProxyUrl = GlobalConfig.getProxyUrl();
    const domain = this.extractDomain(originalUrl);
    const rootDomain = domain ? extractRootDomain(domain) : null;
    const siteProxies = rootDomain ? GlobalConfig.getProxiesForSite(rootDomain) : [];
    const proxyList = GlobalConfig.getProxyList();

    // 第一次尝试：优先使用默认代理
    if (attemptIndex === 0) {
      return pickFirstAttemptProxy(defaultProxyUrl, siteProxies);
    }

    // 后续尝试（attemptIndex > 0）：按优先级构建代理候选列表
    const ordered = buildFallbackProxyOrder(defaultProxyUrl, siteProxies, proxyList);
    if (ordered.length > 0) {
      // attemptIndex = 1 表示第一次重试，应该使用 ordered[0]
      const targetIndex = (attemptIndex - 1) % ordered.length;
      return ordered[targetIndex] ?? null;
    }

    // 如果没有可用代理，回退到默认代理
    return defaultProxyUrl || null;
  }

  /**
   * 请求成功后，若启用了自动添加映射且当前使用的不是默认代理，记录到网站-代理映射中。
   */
  private static async maybeRecordProxyMapping(
    originalUrl: string,
    currentProxyUrl: string | null,
    defaultProxyUrl: string,
    settingsStore: ReturnType<typeof useSettingsStore>,
    autoSwitch: boolean,
  ): Promise<void> {
    const autoAddMapping = GlobalConfig.getProxyAutoAddMapping();
    if (
      !autoSwitch ||
      !autoAddMapping ||
      !currentProxyUrl ||
      currentProxyUrl === defaultProxyUrl
    ) {
      return;
    }
    const domain = this.extractDomain(originalUrl);
    if (!domain) return;
    const rootDomain = extractRootDomain(domain);
    if (!rootDomain) return;
    // 静默添加映射，不显示 toast 通知
    await settingsStore.addProxyForSite(rootDomain, currentProxyUrl);
  }

  /**
   * 使用自动切换代理服务执行请求
   * 如果启用了自动切换且遇到网络错误，会自动尝试下一个代理服务
   * 注意：自动切换只针对当前请求，不会改变全局默认代理设置
   * @param originalUrl 原始 URL
   * @param requestFn 请求函数，接受代理后的 URL，返回 Promise<T>
   * @param options 选项
   * @returns Promise<T> 请求结果
   */
  static async executeWithAutoSwitch<T>(
    originalUrl: string,
    requestFn: (proxiedUrl: string) => Promise<T>,
    options: {
      /**
       * 是否跳过代理（用于内部 API 请求）
       * @default false
       */
      skipProxy?: boolean;
      /**
       * 是否跳过内部代理路径（用于浏览器环境的 /api/ 路径）
       * @default false
       */
      skipInternalProxy?: boolean;
      /**
       * 跳过外部 CORS 代理（保留 Cookie 等请求头），仍可使用 /api/ 内部代理
       * @default false
       */
      skipExternalProxy?: boolean;
      /**
       * 最大重试次数（包括初始请求）
       * @default 3
       */
      maxRetries?: number;
    } = {},
  ): Promise<T> {
    const {
      skipProxy = false,
      skipInternalProxy = false,
      skipExternalProxy = false,
      maxRetries = 3,
    } = options;
    const settingsStore = useSettingsStore();
    await GlobalConfig.ensureInitialized({ ensureSettings: true, ensureBooks: false });
    const autoSwitch = GlobalConfig.getProxyAutoSwitch();
    const defaultProxyUrl = GlobalConfig.getProxyUrl();

    // 跳过全部代理或未启用代理时，走 getProxiedUrl（可保留内部 /api/ 代理）
    if (skipProxy || !GlobalConfig.getProxyEnabled()) {
      const proxiedUrl = this.getProxiedUrl(originalUrl, {
        skipProxy,
        skipInternalProxy,
        skipExternalProxy,
      });
      return await requestFn(proxiedUrl);
    }

    // skipExternalProxy：不参与外部代理轮换，但保留下方瞬时错误重试循环
    const fixedProxiedUrl = skipExternalProxy
      ? this.getProxiedUrl(originalUrl, { skipProxy, skipInternalProxy, skipExternalProxy })
      : null;

    let lastError: Error | null = null;

    // 尝试请求，如果失败且启用了自动切换，尝试下一个代理服务
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (fixedProxiedUrl !== null) {
          // 固定 URL：不轮换代理、不记录网站-代理映射
          return await requestFn(fixedProxiedUrl);
        }

        // 获取当前尝试应该使用的代理 URL（不改变全局设置）
        const currentProxyUrl = this.getProxyUrlForAttempt(originalUrl, attempt);
        const proxiedUrl = buildAttemptProxiedUrl(originalUrl, currentProxyUrl);

        // 执行请求
        const result = await requestFn(proxiedUrl);

        // 如果请求成功，且使用的不是默认代理，且启用了自动添加映射，记录到网站-代理映射中
        await this.maybeRecordProxyMapping(
          originalUrl,
          currentProxyUrl,
          defaultProxyUrl,
          settingsStore,
          autoSwitch,
        );

        // 成功返回（不改变全局代理设置）
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        const isNetworkErr = this.isNetworkError(error);

        console.error(`[ProxyService] ❌ 请求失败 (尝试 ${attempt + 1}/${maxRetries})`, {
          originalUrl,
          error: lastError.message,
          isNetworkError: isNetworkErr,
          autoSwitch,
          canRetry: attempt < maxRetries - 1,
        });

        const action = computeRetryAction(autoSwitch, isNetworkErr, attempt, maxRetries);
        if (action.kind === 'throw') throw lastError;
        // 等待后进入下一次循环（可能换下一个代理）
        await new Promise((resolve) => setTimeout(resolve, action.ms));
      }
    }

    // 理论上不会到达这里，但为了类型安全
    throw lastError || new Error('Request failed');
  }
}
