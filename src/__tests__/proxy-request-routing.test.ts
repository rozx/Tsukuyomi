import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { ProxyService } from '../services/proxy-service';
import { HttpStatusError } from '../services/proxy-fetch-plan';
import { listModels } from '../services/ai/providers/ai-sdk/models';
import { useSettingsStore } from '../stores/settings';

const APP_ORIGIN = 'https://translator.example.com';

beforeEach(() => {
  vi.stubGlobal('window', { location: new URL(APP_ORIGIN) });
  const settings = useSettingsStore();
  settings.settings.proxyEnabled = true;
  settings.settings.proxyUrl = 'https://cors.rozx.moe/?{url}';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CORS 请求路由', () => {
  it.each([
    '/api/ai/vendor.example.com/v1/models',
    './api/models',
    'api/models',
    'https://translator.example.com/api/ai/vendor.example.com/v1/models',
  ])('同源 AI 请求不转发到外部 CORS 代理：%s', (url) => {
    expect(ProxyService.getProxiedUrlForAI(url)).toBe(url);
  });

  it.each([
    'http://localhost:11434/v1/models',
    'http://localhost.:11434/v1/models',
    'http://model.localhost:11434/v1/models',
    'http://127.0.0.1:1234/v1/models',
    'http://127.0.0.2:1234/v1/models',
    'http://0.0.0.0:1234/v1/models',
    'http://[::1]:1234/v1/models',
    'http://[::]:1234/v1/models',
    'http://[::ffff:127.0.0.1]:1234/v1/models',
    'http://[::ffff:192.168.1.2]:1234/v1/models',
    'http://10.0.0.2:1234/v1/models',
    'http://172.16.0.2:1234/v1/models',
    'http://172.31.255.254:1234/v1/models',
    'http://192.168.1.2:1234/v1/models',
    'http://169.254.1.2:1234/v1/models',
    'http://[fd00::2]:1234/v1/models',
    'http://[fe80::2]:1234/v1/models',
    'http://model.local:1234/v1/models',
  ])('本机和局域网 AI 请求不交给外部代理：%s', (url) => {
    expect(ProxyService.getProxiedUrlForAI(url)).toBe(url);
  });

  it.each([
    '/api/pages/article',
    './article',
    'https://translator.example.com/article',
    'http://localhost:8080/article',
    'http://192.168.1.2/article',
  ])('同源和本地网页抓取也直接请求：%s', (url) => {
    expect(ProxyService.getProxiedUrl(url)).toBe(url);
  });

  it('本地网页请求失败时，不再发送给远程 Firecrawl', async () => {
    const error = new HttpStatusError(403);
    const firecrawl = vi.fn(() => Promise.resolve('remote'));
    await expect(
      ProxyService.executeWithAutoSwitch(
        'http://localhost:8080/article',
        () => Promise.reject(error),
        { firecrawl },
      ),
    ).rejects.toBe(error);
    expect(firecrawl).not.toHaveBeenCalled();
  });

  it('Electron 的 file 页面仍保留公网抓取的 Firecrawl 回退', async () => {
    vi.stubGlobal('window', {
      location: new URL('file:///app/index.html'),
      electronAPI: { isElectron: true },
    });
    const firecrawl = vi.fn(() => Promise.resolve('remote'));
    expect(
      await ProxyService.executeWithAutoSwitch(
        'https://kakuyomu.jp/works/1',
        () => Promise.reject(new HttpStatusError(403)),
        { firecrawl },
      ),
    ).toBe('remote');
    expect(firecrawl).toHaveBeenCalledOnce();
  });

  it.each([
    'https://api.example.com/v1/models',
    'https://localhost.example.com/v1/models',
    'http://172.15.0.2/v1/models',
    'http://172.32.0.2/v1/models',
    'http://192.169.1.2/v1/models',
    'http://[2001:4860::1]/v1/models',
    'http://[::ffff:8.8.8.8]/v1/models',
    'https://translator.example.com:8443/v1/models',
    'http://translator.example.com/v1/models',
    '//api.example.com/v1/models',
  ])('公网目标仍遵循启用的 CORS 代理配置：%s', (url) => {
    const proxied = ProxyService.getProxiedUrlForAI(url);
    expect(proxied).toMatch(/^https:\/\/cors\.rozx\.moe\/\?/);
    expect(decodeURIComponent(proxied.split('?')[1]!)).toBe(url);
  });

  it('模型关闭代理时，公网 AI 请求直接发送', () => {
    const url = 'https://api.example.com/v1/models';
    expect(ProxyService.getProxiedUrlForAI(url, false)).toBe(url);
  });

  it('全局关闭代理时，公网 AI 请求直接发送', () => {
    useSettingsStore().settings.proxyEnabled = false;
    const url = 'https://api.example.com/v1/models';
    expect(ProxyService.getProxiedUrlForAI(url)).toBe(url);
  });

  it('Electron 的公网 AI 请求直接发送', () => {
    vi.stubGlobal('window', {
      location: new URL('file:///app/index.html'),
      electronAPI: { isElectron: true },
    });
    const url = 'https://api.example.com/v1/models';
    expect(ProxyService.getProxiedUrlForAI(url, true)).toBe(url);
  });

  it.each(['data:application/json,{}', 'blob:https://translator.example.com/test', 'http://['])(
    '不把非 HTTP 或无效目标转发给代理：%s',
    (url) => {
      expect(ProxyService.getProxiedUrlForAI(url)).toBe(url);
    },
  );

  it('模型列表通过同源 /api/ 请求时，SDK 规范化的绝对 URL 仍直接发送', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'test-model' }] })));
    const models = await listModels('openai', {
      apiKey: 'fixture-key',
      baseUrl: '/api/ai/vendor.example.com/v1',
      useCorsProxy: true,
    });
    expect(models).toMatchObject([{ id: 'test-model' }]);
    expect(fetch).toHaveBeenCalledWith(
      'https://translator.example.com/api/ai/vendor.example.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer fixture-key' }),
      }),
    );
  });
});
