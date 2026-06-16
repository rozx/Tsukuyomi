import { describe, expect, it, afterEach, mock, spyOn } from 'bun:test';
import './setup';
import { ProxyService } from '../services/proxy-service';
import { GlobalConfig } from '../services/global-config-cache';

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
    spyOn(GlobalConfig, 'getProxyAutoSwitch').mockReturnValue(true);
    spyOn(GlobalConfig, 'getProxyUrl').mockReturnValue(CORS_PROXY);
    spyOn(GlobalConfig, 'getProxiesForSite').mockReturnValue([]);
    spyOn(GlobalConfig, 'getProxyList').mockReturnValue([
      { id: 'test-proxy', url: CORS_PROXY, name: 'test' },
    ]);

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
      maxRetries: 3,
    });

    expect(result).toBe('ok');
    expect(callCount).toBe(1);
  });
});
