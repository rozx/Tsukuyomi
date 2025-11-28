import { useSettingsStore } from 'src/stores/settings';
import { DEFAULT_CORS_PROXY_FOR_AI } from 'src/constants/proxy';
import { extractRootDomain } from 'src/utils/domain-utils';
import co from 'co';

// 注意：代理列表现在从 settings store 中获取，不再使用硬编码的列表

/**
 * 获取代理显示名称
 */
function getProxyDisplayName(proxyUrl: string): string {
  const settingsStore = useSettingsStore();
  const proxyList = settingsStore.proxyList;
  const proxy = proxyList.find((p) => p.url === proxyUrl);
  return proxy ? proxy.name : proxyUrl;
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
    } = {},
  ): string {
    const { skipProxy = false, skipInternalProxy = false } = options;

    // 如果跳过代理，直接返回原始 URL
    if (skipProxy) {
      return originalUrl;
    }

    // 内部 API 请求（以 /api/ 开头）应该跳过代理
    if (originalUrl.startsWith('/api/')) {
      return originalUrl;
    }

    // 检测是否为 Electron 环境（静态方法中不能使用 composable）
    const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron === true;

    // 检查是否启用了代理
    const settingsStore = useSettingsStore();
    const proxyEnabled = settingsStore.proxyEnabled;
    let proxyUrl = settingsStore.proxyUrl;

    // 如果启用了代理，优先使用网站特定的代理
    if (proxyEnabled) {
      const domain = this.extractDomain(originalUrl);
      if (domain) {
        const rootDomain = extractRootDomain(domain);
        if (rootDomain) {
          const siteProxies = settingsStore.getProxiesForSite(rootDomain);
          if (siteProxies.length > 0) {
            // 如果当前代理在网站特定列表中，使用当前代理
            // 否则使用网站特定列表中的第一个
            if (proxyUrl && siteProxies.includes(proxyUrl)) {
              // 使用当前代理
            } else {
              const siteProxy = siteProxies[0];
              if (siteProxy) {
                proxyUrl = siteProxy;
              }
            }
          }
        }
      }
    }

    // 如果启用了代理且代理 URL 不为空，使用代理
    if (proxyEnabled && proxyUrl && proxyUrl.trim()) {
      // 替换 {url} 占位符为实际 URL
      const proxiedUrl = proxyUrl.replace('{url}', encodeURIComponent(originalUrl));

      // 在纯浏览器环境中，直接使用代理 URL（代理服务本身就是为了解决 CORS 问题）
      // 在 Electron/Node.js 环境中，也可以直接使用代理 URL
      // 只有在开发环境且有后端服务器支持时，才使用 /api/proxy（但这不是必需的）
      // 为了简化逻辑，我们统一直接使用代理 URL，让代理服务处理 CORS
      return proxiedUrl;
    }
    if (!skipInternalProxy && !isElectron) {
      // 在浏览器环境中（非 Electron），使用服务器代理路径
      const urlObj = new URL(originalUrl);
      let internalProxyUrl: string | null = null;

      if (urlObj.hostname === 'kakuyomu.jp') {
        internalProxyUrl = `/api/kakuyomu${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
      } else if (urlObj.hostname === 'ncode.syosetu.com') {
        internalProxyUrl = `/api/ncode${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
      } else if (urlObj.hostname === 'novel18.syosetu.com') {
        internalProxyUrl = `/api/novel18${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
      } else if (urlObj.hostname === 'syosetu.org') {
        internalProxyUrl = `/api/syosetu${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
      } else if (urlObj.hostname === 'p.sda1.dev') {
        internalProxyUrl = `/api/sda1${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
      }

      if (internalProxyUrl) {
        return internalProxyUrl;
      }
    }

    // 默认返回原始 URL
    return originalUrl;
  }

  /**
   * 检查代理是否启用
   * @returns 是否启用代理
   */
  static isProxyEnabled(): boolean {
    const settingsStore = useSettingsStore();
    return settingsStore.proxyEnabled ?? false;
  }

  /**
   * 获取代理 URL
   * @returns 代理 URL 或空字符串
   */
  static getProxyUrl(): string {
    const settingsStore = useSettingsStore();
    return settingsStore.proxyUrl ?? '';
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
   * 在浏览器模式下，使用默认的 CORS 代理来绕过 CORS 限制
   * @param originalUrl 原始 URL
   * @returns 代理后的 URL 或原始 URL
   */
  static getProxiedUrlForAI(originalUrl: string): string {
    // 检测是否为 Electron 环境
    const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron === true;

    // 仅在浏览器模式下使用 CORS 代理
    if (!isElectron) {
      const proxiedUrl = DEFAULT_CORS_PROXY_FOR_AI.replace(
        '{url}',
        encodeURIComponent(originalUrl),
      );
      return proxiedUrl;
    }

    // Electron 模式下直接返回原始 URL
    return originalUrl;
  }

  /**
   * 获取下一个代理服务 URL
   * @param originalUrl 原始 URL（用于查找网站特定的代理）
   * @returns 下一个代理服务 URL 或 null（如果没有更多代理服务）
   */
  static getNextProxyUrl(originalUrl?: string | null): string | null {
    const settingsStore = useSettingsStore();
    const currentUrl = settingsStore.proxyUrl ?? '';

    // 如果提供了原始 URL，优先使用网站特定的代理列表
    if (originalUrl) {
      const domain = this.extractDomain(originalUrl);
      if (domain) {
        const rootDomain = extractRootDomain(domain);
        if (rootDomain) {
          const siteProxies = settingsStore.getProxiesForSite(rootDomain);
          if (siteProxies.length > 0) {
            // 查找当前代理在网站特定列表中的索引
            const currentIndex = siteProxies.findIndex((url) => url === currentUrl);
            if (currentIndex >= 0) {
              // 切换到下一个网站特定的代理
              const nextIndex = (currentIndex + 1) % siteProxies.length;
              const nextProxy = siteProxies[nextIndex];
              return nextProxy ?? null;
            } else if (siteProxies.length > 0) {
              // 如果当前代理不在列表中，使用第一个
              const firstProxy = siteProxies[0];
              return firstProxy ?? null;
            }
          }
        }
      }
    }

    // 查找当前代理在代理列表中的索引
    const proxyList = settingsStore.proxyList;
    const currentIndex = proxyList.findIndex((proxy) => proxy.url === currentUrl);

    // 如果找到当前代理，切换到下一个
    if (currentIndex >= 0 && proxyList.length > 0) {
      const nextIndex = (currentIndex + 1) % proxyList.length;
      const nextProxy = proxyList[nextIndex];
      if (nextProxy) {
        return nextProxy.url;
      }
    }

    // 如果当前代理不在列表中，尝试使用第一个代理
    if (proxyList.length > 0) {
      const firstProxy = proxyList[0];
      if (firstProxy) {
        return firstProxy.url;
      }
    }

    return null;
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
   * 切换到下一个代理服务
   * @param originalUrl 原始 URL（用于查找网站特定的代理和记录映射）
   * @returns 是否成功切换
   */
  private static switchToNextProxy(originalUrl?: string): boolean {
    const settingsStore = useSettingsStore();
    const nextProxyUrl = this.getNextProxyUrl(originalUrl);

    if (nextProxyUrl) {
      void co(function* () {
        try {
          yield settingsStore.setProxyUrl(nextProxyUrl);
        } catch (error) {
          console.error('[ProxyService] 切换代理 URL 失败:', error);
        }
      });
      return true;
    }

    return false;
  }

  /**
   * 处理代理错误，如果启用了自动切换，切换到下一个代理服务
   * @param error 错误对象
   * @returns 是否已切换到下一个代理服务
   */
  static handleProxyError(error: unknown): boolean {
    const settingsStore = useSettingsStore();
    const autoSwitch = settingsStore.proxyAutoSwitch ?? false;

    // 如果未启用自动切换，不处理
    if (!autoSwitch) {
      return false;
    }

    // 检查错误是否是网络错误
    const isNetworkErr = this.isNetworkError(error);
    if (!isNetworkErr) {
      return false;
    }

    // 切换到下一个代理服务
    // 注意：handleProxyError 没有 originalUrl 参数，所以无法使用网站特定代理
    // 这个函数主要用于向后兼容，实际应该使用 executeWithAutoSwitch
    return this.switchToNextProxy();
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
    const settingsStore = useSettingsStore();
    const defaultProxyUrl = settingsStore.proxyUrl ?? '';
    const domain = this.extractDomain(originalUrl);
    const rootDomain = domain ? extractRootDomain(domain) : null;
    const siteProxies = rootDomain ? settingsStore.getProxiesForSite(rootDomain) : [];
    const proxyList = settingsStore.proxyList;

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
    const autoSwitch = settingsStore.proxyAutoSwitch ?? false;
    const defaultProxyUrl = settingsStore.proxyUrl ?? '';

    // 如果跳过代理或未启用代理，直接执行请求
    if (skipProxy || !settingsStore.proxyEnabled) {
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
        const autoAddMapping = settingsStore.proxyAutoAddMapping ?? true;
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
