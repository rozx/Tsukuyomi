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
    } = {},
  ): string {
    const { skipProxy = false, skipInternalProxy = false } = options;
    if (skipProxy) return originalUrl;
    if (originalUrl.startsWith('/api/')) return originalUrl;

    const proxyEnabled = GlobalConfig.getProxyEnabled();
    if (proxyEnabled) {
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
    // 检查 axios 错误的状态码
    if (error && typeof error === 'object' && 'isAxiosError' in error) {
      const axiosError = error as { response?: { status?: number }; code?: string };
      const status = axiosError.response?.status;
      // 408 (Request Timeout), 429 (Too Many Requests), 500, 502, 503, 504 等服务器错误
      if (status && (status >= 400 || status === 408 || status === 429 || status >= 500)) {
        return true;
      }
      // 网络错误代码
      if (
        axiosError.code &&
        ['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ERR_FAILED'].includes(axiosError.code)
      ) {
        return true;
      }
    }

    if (!(error instanceof Error)) {
      return false;
    }

    const errorMessage = error.message.toLowerCase();
    const networkErrorKeywords = [
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

    return networkErrorKeywords.some((keyword) => errorMessage.includes(keyword));
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
      // 如果有网站特定代理且默认代理在其中，使用默认代理
      if (defaultProxyUrl && siteProxies.length > 0 && siteProxies.includes(defaultProxyUrl)) {
        return defaultProxyUrl;
      }
      // 如果有网站特定代理但默认代理不在其中，使用网站特定代理的第一个
      if (siteProxies.length > 0) {
        return siteProxies[0] ?? null;
      }
      // 否则使用默认代理
      return defaultProxyUrl || null;
    }

    // 后续尝试（attemptIndex > 0）
    // 构建所有可用的代理列表，按优先级排序：
    // 1. 网站特定代理（排除默认代理，如果默认代理已经在第一次尝试中使用）
    // 2. 全局代理列表中不在网站特定代理列表中的代理

    const siteProxyUrls = new Set(siteProxies);
    const allAvailableProxies: string[] = [];

    // 添加网站特定代理（排除默认代理，因为已经在第一次尝试中使用）
    if (siteProxies.length > 0) {
      const defaultIndex = defaultProxyUrl
        ? siteProxies.findIndex((url) => url === defaultProxyUrl)
        : -1;
      if (defaultIndex >= 0) {
        // 如果默认代理在网站特定列表中，从它之后开始
        allAvailableProxies.push(...siteProxies.slice(defaultIndex + 1));
        allAvailableProxies.push(...siteProxies.slice(0, defaultIndex));
      } else {
        // 如果默认代理不在网站特定列表中，从第一个开始
        allAvailableProxies.push(...siteProxies);
      }
    }

    // 添加全局代理列表中不在网站特定代理列表中的代理
    const globalProxies = proxyList
      .map((p) => p.url)
      .filter((url) => !siteProxyUrls.has(url) && url !== defaultProxyUrl);
    allAvailableProxies.push(...globalProxies);

    // 根据尝试索引选择代理
    if (allAvailableProxies.length > 0) {
      // attemptIndex = 1 表示第一次重试，应该使用 allAvailableProxies[0]
      const targetIndex = (attemptIndex - 1) % allAvailableProxies.length;
      return allAvailableProxies[targetIndex] ?? null;
    }

    // 如果没有可用代理，回退到默认代理
    return defaultProxyUrl || null;
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
       * 最大重试次数（包括初始请求）
       * @default 3
       */
      maxRetries?: number;
    } = {},
  ): Promise<T> {
    const { skipProxy = false, skipInternalProxy = false, maxRetries = 3 } = options;
    const settingsStore = useSettingsStore();
    await GlobalConfig.ensureInitialized({ ensureSettings: true, ensureBooks: false });
    const autoSwitch = GlobalConfig.getProxyAutoSwitch();
    const defaultProxyUrl = GlobalConfig.getProxyUrl();

    // 如果跳过代理或未启用代理，直接执行请求
    if (skipProxy || !GlobalConfig.getProxyEnabled()) {
      const proxiedUrl = this.getProxiedUrl(originalUrl, { skipProxy, skipInternalProxy });
      return await requestFn(proxiedUrl);
    }

    let lastError: Error | null = null;

    // 尝试请求，如果失败且启用了自动切换，尝试下一个代理服务
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // 获取当前尝试应该使用的代理 URL（不改变全局设置）
        const currentProxyUrl = this.getProxyUrlForAttempt(originalUrl, attempt);

        // 构建代理后的 URL
        let proxiedUrl: string;
        if (currentProxyUrl) {
          proxiedUrl = currentProxyUrl.replace('{url}', encodeURIComponent(originalUrl));
        } else {
          // 如果没有代理，直接使用原始 URL
          proxiedUrl = originalUrl;
        }

        // 执行请求
        const result = await requestFn(proxiedUrl);

        // 如果请求成功，且使用的不是默认代理，且启用了自动添加映射，记录到网站-代理映射中
        const autoAddMapping = GlobalConfig.getProxyAutoAddMapping();
        if (
          autoSwitch &&
          autoAddMapping &&
          currentProxyUrl &&
          currentProxyUrl !== defaultProxyUrl
        ) {
          const domain = this.extractDomain(originalUrl);
          if (domain) {
            // 提取根域名
            const rootDomain = extractRootDomain(domain);
            if (rootDomain) {
              // 静默添加映射，不显示 toast 通知
              await settingsStore.addProxyForSite(rootDomain, currentProxyUrl);
            }
          }
        }

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

        // 如果启用了自动切换且是网络错误，继续尝试下一个代理（在下次循环中）
        if (autoSwitch && isNetworkErr && attempt < maxRetries - 1) {
          // 等待一小段时间后继续重试
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }

        // 如果没有启用自动切换或已达到最大重试次数
        if (attempt === maxRetries - 1) {
          throw lastError;
        }

        // 等待后重试（指数退避）
        const retryDelay = (attempt + 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }

    // 理论上不会到达这里，但为了类型安全
    throw lastError || new Error('Request failed');
  }
}
