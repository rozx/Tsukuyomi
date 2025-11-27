import { useSettingsStore } from 'src/stores/settings';

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
 * 显示 toast 通知（在静态方法中使用）
 * 注意：这需要在 Vue 应用上下文中才能工作
 */
function showToast(message: {
  severity: 'success' | 'error' | 'info' | 'warn';
  summary: string;
  detail?: string;
  life?: number;
}): void {
  // 尝试在浏览器环境中获取 toast 实例
  if (typeof window !== 'undefined') {
    // 通过 window 对象获取全局 toast 函数（在 MainLayout 中注册）
    const toastFn = (window as unknown as { __lunaToast?: (msg: typeof message) => void })
      .__lunaToast;
    if (toastFn) {
      toastFn(message);
      return;
    }
  }
  // 如果无法显示 toast，至少记录到控制台
  console.log('[ProxyService] Toast:', message);
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

    console.log('[ProxyService] getProxiedUrl', {
      originalUrl,
      skipProxy,
      skipInternalProxy,
    });

    // 如果跳过代理，直接返回原始 URL
    if (skipProxy) {
      console.log('[ProxyService] 跳过代理，返回原始 URL');
      return originalUrl;
    }

    // 内部 API 请求（以 /api/ 开头）应该跳过代理
    if (originalUrl.startsWith('/api/')) {
      console.log('[ProxyService] 内部 API 请求，跳过代理');
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
        const siteProxies = settingsStore.getProxiesForSite(domain);
        if (siteProxies.length > 0) {
          // 如果当前代理在网站特定列表中，使用当前代理
          // 否则使用网站特定列表中的第一个
          if (proxyUrl && siteProxies.includes(proxyUrl)) {
            // 使用当前代理
          } else {
            const siteProxy = siteProxies[0];
            if (siteProxy) {
              proxyUrl = siteProxy;
              console.log('[ProxyService] 使用网站特定的代理', {
                domain,
                proxyUrl,
              });
            }
          }
        }
      }
    }

    console.log('[ProxyService] 代理状态', {
      proxyEnabled,
      proxyUrl,
      isElectron,
      skipInternalProxy,
    });

    // 如果启用了代理且代理 URL 不为空，使用代理
    if (proxyEnabled && proxyUrl && proxyUrl.trim()) {
      // 替换 {url} 占位符为实际 URL
      const proxiedUrl = proxyUrl.replace('{url}', encodeURIComponent(originalUrl));

      // 在纯浏览器环境中，直接使用代理 URL（代理服务本身就是为了解决 CORS 问题）
      // 在 Electron/Node.js 环境中，也可以直接使用代理 URL
      // 只有在开发环境且有后端服务器支持时，才使用 /api/proxy（但这不是必需的）
      // 为了简化逻辑，我们统一直接使用代理 URL，让代理服务处理 CORS
      console.log('[ProxyService] 使用代理 URL', {
        proxiedUrl,
        isElectron,
      });
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
        console.log('[ProxyService] 使用内部代理路径', {
          hostname: urlObj.hostname,
          internalProxyUrl,
        });
        return internalProxyUrl;
      }
    }

    // 默认返回原始 URL
    console.log('[ProxyService] 返回原始 URL（未使用代理）');
    return originalUrl;
  }

  /**
   * 检查代理是否启用
   * @returns 是否启用代理
   */
  static isProxyEnabled(): boolean {
    const settingsStore = useSettingsStore();
    const enabled = settingsStore.proxyEnabled ?? false;
    console.log('[ProxyService] isProxyEnabled', {
      enabled,
      proxyUrl: settingsStore.proxyUrl ?? '',
    });
    return enabled;
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
        const siteProxies = settingsStore.getProxiesForSite(domain);
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
    const currentUrl = settingsStore.proxyUrl ?? '';
    const nextProxyUrl = this.getNextProxyUrl(originalUrl);

    console.log('[ProxyService] switchToNextProxy', {
      currentUrl,
      nextProxyUrl,
      originalUrl,
    });

    if (nextProxyUrl) {
      void settingsStore.setProxyUrl(nextProxyUrl);
      console.log(`[ProxyService] ✅ 代理服务已自动切换: ${currentUrl} -> ${nextProxyUrl}`);
      return true;
    }

    console.log('[ProxyService] ❌ 无法切换到下一个代理服务（没有更多代理可用）');
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

    console.log('[ProxyService] handleProxyError', {
      autoSwitch,
      error: error instanceof Error ? error.message : String(error),
    });

    // 如果未启用自动切换，不处理
    if (!autoSwitch) {
      console.log('[ProxyService] 自动切换未启用，跳过处理');
      return false;
    }

    // 检查错误是否是网络错误
    const isNetworkErr = this.isNetworkError(error);
    if (!isNetworkErr) {
      console.log('[ProxyService] 不是网络错误，跳过处理');
      return false;
    }

    // 切换到下一个代理服务
    console.log('[ProxyService] 检测到网络错误，尝试切换代理');
    // 注意：handleProxyError 没有 originalUrl 参数，所以无法使用网站特定代理
    // 这个函数主要用于向后兼容，实际应该使用 executeWithAutoSwitch
    return this.switchToNextProxy();
  }

  /**
   * 获取当前尝试应该使用的代理 URL（不改变全局设置）
   * @param originalUrl 原始 URL
   * @param attemptIndex 当前尝试索引（0 表示使用默认代理）
   * @returns 代理 URL 或 null
   */
  private static getProxyUrlForAttempt(originalUrl: string, attemptIndex: number): string | null {
    const settingsStore = useSettingsStore();
    const defaultProxyUrl = settingsStore.proxyUrl ?? '';

    // 第一次尝试（attemptIndex === 0）使用默认代理或网站特定代理
    if (attemptIndex === 0) {
      // 检查是否有网站特定的代理
      const domain = this.extractDomain(originalUrl);
      if (domain) {
        const siteProxies = settingsStore.getProxiesForSite(domain);
        if (siteProxies.length > 0) {
          // 如果默认代理在网站特定列表中，使用默认代理
          if (defaultProxyUrl && siteProxies.includes(defaultProxyUrl)) {
            return defaultProxyUrl;
          }
          // 否则使用网站特定列表中的第一个
          const siteProxy = siteProxies[0];
          if (siteProxy) {
            return siteProxy;
          }
        }
      }
      return defaultProxyUrl || null;
    }

    // 后续尝试：切换到下一个代理
    // 首先尝试网站特定的代理列表
    const domain = this.extractDomain(originalUrl);
    if (domain) {
      const siteProxies = settingsStore.getProxiesForSite(domain);
      if (siteProxies.length > 0) {
        // 找到默认代理在列表中的位置
        const defaultIndex = defaultProxyUrl
          ? siteProxies.findIndex((url) => url === defaultProxyUrl)
          : -1;
        const startIndex = defaultIndex >= 0 ? defaultIndex : 0;
        // 计算当前尝试应该使用的索引（循环使用）
        const targetIndex = (startIndex + attemptIndex) % siteProxies.length;
        const targetProxy = siteProxies[targetIndex];
        if (targetProxy) {
          return targetProxy;
        }
      }
    }

    // 如果没有网站特定代理，使用代理列表
    const proxyList = settingsStore.proxyList;
    if (proxyList.length === 0) {
      return null;
    }
    const defaultProxyIndex = defaultProxyUrl
      ? proxyList.findIndex((proxy) => proxy.url === defaultProxyUrl)
      : -1;
    const startProxyIndex = defaultProxyIndex >= 0 ? defaultProxyIndex : 0;
    const targetProxyIndex = (startProxyIndex + attemptIndex) % proxyList.length;
    const targetProxy = proxyList[targetProxyIndex];
    if (targetProxy) {
      return targetProxy.url;
    }

    return null;
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

    console.log('[ProxyService] executeWithAutoSwitch 开始', {
      originalUrl,
      skipProxy,
      skipInternalProxy,
      maxRetries,
      autoSwitch,
      proxyEnabled: settingsStore.proxyEnabled ?? false,
      defaultProxyUrl,
    });

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

        console.log(`[ProxyService] 尝试请求 (${attempt + 1}/${maxRetries})`, {
          originalUrl,
          proxiedUrl,
          currentProxyUrl,
          isDefaultProxy: currentProxyUrl === defaultProxyUrl,
        });

        // 执行请求
        const result = await requestFn(proxiedUrl);
        console.log(`[ProxyService] ✅ 请求成功 (尝试 ${attempt + 1})`);

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
            void settingsStore.addProxyForSite(domain, currentProxyUrl);
            console.log(`[ProxyService] 📝 已记录网站-代理映射: ${domain} -> ${currentProxyUrl}`);
            // 显示 toast 通知
            const proxyName = getProxyDisplayName(currentProxyUrl);
            showToast({
              severity: 'success',
              summary: '代理映射已添加',
              detail: `${domain} 已映射到 ${proxyName}`,
              life: 3000,
            });
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
          console.log('[ProxyService] 等待 500ms 后尝试下一个代理...');
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }

        // 如果没有启用自动切换或已达到最大重试次数
        if (attempt === maxRetries - 1) {
          console.error('[ProxyService] ❌ 所有重试都失败，抛出错误');
          throw lastError;
        }

        // 等待后重试（指数退避）
        const retryDelay = (attempt + 1) * 1000;
        console.log(`[ProxyService] 等待 ${retryDelay}ms 后重试...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }

    // 理论上不会到达这里，但为了类型安全
    throw lastError || new Error('Request failed');
  }
}
