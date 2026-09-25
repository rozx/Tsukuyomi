import { describe, it, afterEach, beforeEach, mock, spyOn } from 'bun:test';
import { expect } from 'vitest';
import './setup';
import { ProxyService } from '../services/proxy-service';
import { GlobalConfig } from '../services/global-config-cache';
import { useSettingsStore } from '../stores/settings';

const NOVEL18_URL = 'https://novel18.syosetu.com/n2819do/';
const CORS_PROXY = 'https://cors.rozx.moe/?{url}';

describe('ProxyService skipExternalProxy', () => {
  afterEach(() => {
    mock.restore();
  });

  it('getProxiedUrl 在 skipExternalProxy 时不返回外部 CORS 包装 URL', () => {
    spyOn(GlobalConfig, 'getProxyEnabled').mockReturnValue(true);
    spyOn(GlobalConfig, 'getProxyUrl').mockReturnValue(CORS_PROXY);
    spyOn(GlobalConfig, 'getProxiesForSite').mockReturnValue([]);

    const proxied = ProxyService.getProxiedUrl(NOVEL18_URL, {
      skipExternalProxy: true,
      skipInternalProxy: true,
    });

    expect(proxied).toBe(NOVEL18_URL);
    expect(proxied).not.toContain('cors.rozx.moe');
  });

  it('executeWithAutoSwitch 在 skipExternalProxy 时不进入外部代理轮换', async () => {
    spyOn(GlobalConfig, 'ensureInitialized').mockResolvedValue(undefined);
    spyOn(GlobalConfig, 'getProxyEnabled').mockReturnValue(true);
    spyOn(GlobalConfig, 'getProxyUrl').mockReturnValue(CORS_PROXY);
    spyOn(GlobalConfig, 'getProxiesForSite').mockReturnValue([]);

    let callCount = 0;
    const requestFn = (proxiedUrl: string) => {
      callCount += 1;
      expect(proxiedUrl).toBe(NOVEL18_URL);
      expect(proxiedUrl).not.toContain('cors.rozx.moe');
      return Promise.resolve('ok');
    };

    const result = await ProxyService.executeWithAutoSwitch(NOVEL18_URL, requestFn, {
      skipExternalProxy: true,
      skipInternalProxy: true,
    });

    expect(result).toBe('ok');
    expect(callCount).toBe(1);
  });

  it('executeWithAutoSwitch 在 skipExternalProxy 时仍保留瞬时网络错误重试', async () => {
    spyOn(GlobalConfig, 'ensureInitialized').mockResolvedValue(undefined);
    spyOn(GlobalConfig, 'getProxyEnabled').mockReturnValue(true);
    spyOn(GlobalConfig, 'getProxyUrl').mockReturnValue(CORS_PROXY);
    spyOn(GlobalConfig, 'getProxiesForSite').mockReturnValue([]);

    let callCount = 0;
    const requestFn = (proxiedUrl: string) => {
      callCount += 1;
      expect(proxiedUrl).toBe(NOVEL18_URL);
      if (callCount === 1) return Promise.reject(new Error('timeout'));
      return Promise.resolve('ok');
    };

    const result = await ProxyService.executeWithAutoSwitch(NOVEL18_URL, requestFn, {
      skipExternalProxy: true,
      skipInternalProxy: true,
    });

    expect(result).toBe('ok');
    expect(callCount).toBe(2);
  }, 10_000);
});

describe('ProxyService 抓取尝试链（Firecrawl 回退）', () => {
  const KAKUYOMU_URL = 'https://kakuyomu.jp/works/1/episodes/2';
  const SYOSETU_URL = 'https://syosetu.org/novel/375522/6.html';
  const OTHER_PROXY = 'https://other.proxy/?u={url}';
  const wrap = (template: string, url: string) =>
    template.replace('{url}', encodeURIComponent(url));

  let siteProxies: string[];
  let fallbackEnabled: boolean;
  let autoAddEnabled: boolean;
  let promoted: string[];

  beforeEach(() => {
    siteProxies = [];
    fallbackEnabled = true;
    autoAddEnabled = true;
    promoted = [];
    spyOn(GlobalConfig, 'ensureInitialized').mockResolvedValue(undefined);
    spyOn(GlobalConfig, 'getProxyEnabled').mockReturnValue(true);
    spyOn(GlobalConfig, 'getProxyUrl').mockReturnValue(CORS_PROXY);
    spyOn(GlobalConfig, 'getProxiesForSite').mockImplementation(() => siteProxies);
    spyOn(GlobalConfig, 'getFirecrawlFallbackEnabled').mockImplementation(() => fallbackEnabled);
    spyOn(GlobalConfig, 'getFirecrawlAutoAddMapping').mockImplementation(() => autoAddEnabled);
    const store = useSettingsStore();
    spyOn(store, 'promoteFirecrawlForSite').mockImplementation((site: string) => {
      promoted.push(site);
      return Promise.resolve();
    });
  });

  afterEach(() => {
    mock.restore();
  });

  const statusError = (status: number) =>
    Object.assign(new Error(`Request failed with status code ${status}`), {
      isAxiosError: true,
      response: { status },
    });

  it('默认代理成功：只请求一次，不调用 Firecrawl', async () => {
    const calls: string[] = [];
    let firecrawlCalls = 0;
    const result = await ProxyService.executeWithAutoSwitch(
      KAKUYOMU_URL,
      (url) => {
        calls.push(url);
        return Promise.resolve('ok');
      },
      {
        firecrawl: () => {
          firecrawlCalls++;
          return Promise.resolve('fc');
        },
      },
    );
    expect(result).toBe('ok');
    expect(calls).toEqual([wrap(CORS_PROXY, KAKUYOMU_URL)]);
    expect(firecrawlCalls).toBe(0);
    expect(promoted).toEqual([]);
  });

  it('403 被拦截：不重试同一代理，直接回退 Firecrawl 并置顶映射', async () => {
    const calls: string[] = [];
    const result = await ProxyService.executeWithAutoSwitch(
      SYOSETU_URL,
      (url) => {
        calls.push(url);
        return Promise.reject(statusError(403));
      },
      { firecrawl: () => Promise.resolve('fc') },
    );
    expect(result).toBe('fc');
    expect(calls).toHaveLength(1);
    expect(promoted).toEqual(['syosetu.org']);
  });

  it('自动添加映射关闭：回退成功但不写映射', async () => {
    autoAddEnabled = false;
    await ProxyService.executeWithAutoSwitch(
      SYOSETU_URL,
      () => Promise.reject(statusError(403)),
      { firecrawl: () => Promise.resolve('fc') },
    );
    expect(promoted).toEqual([]);
  });

  it('503 两次后视为被拦截并回退；未映射的其它代理不被请求', async () => {
    const calls: string[] = [];
    const result = await ProxyService.executeWithAutoSwitch(
      KAKUYOMU_URL,
      (url) => {
        calls.push(url);
        return Promise.reject(statusError(503));
      },
      { firecrawl: () => Promise.resolve('fc') },
    );
    expect(result).toBe('fc');
    expect(calls).toEqual([wrap(CORS_PROXY, KAKUYOMU_URL), wrap(CORS_PROXY, KAKUYOMU_URL)]);
  }, 10_000);

  it('404 不回退、不消耗 Firecrawl', async () => {
    let firecrawlCalls = 0;
    await expect(
      ProxyService.executeWithAutoSwitch(KAKUYOMU_URL, () => Promise.reject(statusError(404)), {
        firecrawl: () => {
          firecrawlCalls++;
          return Promise.resolve('fc');
        },
      }),
    ).rejects.toThrow('404');
    expect(firecrawlCalls).toBe(0);
  });

  it('回退关闭：抛出原始 403 错误', async () => {
    fallbackEnabled = false;
    let firecrawlCalls = 0;
    await expect(
      ProxyService.executeWithAutoSwitch(SYOSETU_URL, () => Promise.reject(statusError(403)), {
        firecrawl: () => {
          firecrawlCalls++;
          return Promise.resolve('fc');
        },
      }),
    ).rejects.toThrow('403');
    expect(firecrawlCalls).toBe(0);
  });

  it('映射按序尝试：第一个被拦截后尝试第二个，成功则不回退', async () => {
    siteProxies = [OTHER_PROXY, CORS_PROXY];
    const calls: string[] = [];
    const result = await ProxyService.executeWithAutoSwitch(
      KAKUYOMU_URL,
      (url) => {
        calls.push(url);
        return calls.length === 1 ? Promise.reject(statusError(403)) : Promise.resolve('ok');
      },
      { firecrawl: () => Promise.resolve('fc') },
    );
    expect(result).toBe('ok');
    expect(calls).toEqual([wrap(OTHER_PROXY, KAKUYOMU_URL), wrap(CORS_PROXY, KAKUYOMU_URL)]);
    expect(promoted).toEqual([]);
  });

  it('firecrawl 首位映射：直接 Firecrawl；Firecrawl 失败时不尝试其余 CORS 条目', async () => {
    siteProxies = ['firecrawl', CORS_PROXY];
    const calls: string[] = [];
    await expect(
      ProxyService.executeWithAutoSwitch(
        SYOSETU_URL,
        (url) => {
          calls.push(url);
          return Promise.resolve('ok');
        },
        { firecrawl: () => Promise.reject(new Error('Firecrawl 请求失败: 500')) },
      ),
    ).rejects.toThrow('Firecrawl');
    expect(calls).toEqual([]);
    expect(promoted).toEqual([]);
  });

  it('未提供 firecrawl 回调时不回退', async () => {
    await expect(
      ProxyService.executeWithAutoSwitch(SYOSETU_URL, () => Promise.reject(statusError(403))),
    ).rejects.toThrow('403');
  });

  it('skipExternalProxy 被拦截时仍回退 Firecrawl', async () => {
    const calls: string[] = [];
    const result = await ProxyService.executeWithAutoSwitch(
      NOVEL18_URL,
      (url) => {
        calls.push(url);
        return Promise.reject(statusError(403));
      },
      { skipExternalProxy: true, skipInternalProxy: true, firecrawl: () => Promise.resolve('fc') },
    );
    expect(result).toBe('fc');
    expect(calls).toEqual([NOVEL18_URL]);
  });
});

describe('ProxyService.getProxiedUrl 跳过 firecrawl 令牌', () => {
  afterEach(() => {
    mock.restore();
  });

  it("映射为 ['firecrawl', CORS] 时解析为 CORS 包装 URL，且不含 firecrawl", () => {
    spyOn(GlobalConfig, 'getProxyEnabled').mockReturnValue(true);
    spyOn(GlobalConfig, 'getProxyUrl').mockReturnValue('https://default.proxy/?{url}');
    spyOn(GlobalConfig, 'getProxiesForSite').mockReturnValue(['firecrawl', CORS_PROXY]);
    spyOn(GlobalConfig, 'getFirecrawlFallbackEnabled').mockReturnValue(true);

    const url = 'https://syosetu.org/novel/375522/6.html';
    const proxied = ProxyService.getProxiedUrl(url);
    expect(proxied).toBe(CORS_PROXY.replace('{url}', encodeURIComponent(url)));
    expect(proxied).not.toContain('firecrawl');
  });
});
