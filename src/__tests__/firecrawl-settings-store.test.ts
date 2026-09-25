import './setup';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import { getDB } from 'src/utils/indexed-db';
import { FIRECRAWL_MAPPING_TOKEN } from 'src/constants/proxy';

const { useSettingsStore } = await import('src/stores/settings');

const LEGACY_PROXY_LIST = [
  { id: 'rozx.moe', name: 'CORS Tsukuyomi', url: 'https://cors.rozx.moe/?{url}' },
  { id: 'corslol', name: 'CORS.lol', url: 'https://api.cors.lol/?url={url}' },
  { id: 'allorigins', name: 'AllOrigins', url: 'https://api.allorigins.win/raw?url={url}' },
];

describe('Firecrawl 设置项（默认值 / 读写 / 同步）', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    mock.restore();
  });

  it('旧版本存储的设置没有 Firecrawl 字段时，加载后补齐默认值且不改动遗留代理数据', async () => {
    const db = await getDB();
    await db.put('settings', {
      key: 'app',
      lastEdited: new Date('2026-01-01').toISOString(),
      scraperConcurrencyLimit: 3,
      proxyEnabled: true,
      proxyUrl: 'https://api.cors.lol/?url={url}',
      proxyList: LEGACY_PROXY_LIST,
      proxySiteMapping: {
        'kakuyomu.jp': { enabled: true, proxies: ['https://api.cors.lol/?url={url}'] },
      },
    } as never);

    const store = useSettingsStore();
    await store.loadSettings();

    expect(store.firecrawlFallbackEnabled).toBe(true);
    expect(store.firecrawlAutoAddMapping).toBe(true);
    expect(store.firecrawlApiKey).toBeUndefined();
    expect(store.settings.proxyList).toEqual(LEGACY_PROXY_LIST);
    expect(store.settings.proxyUrl).toBe('https://api.cors.lol/?url={url}');
    expect(store.settings.proxySiteMapping?.['kakuyomu.jp']).toEqual({
      enabled: true,
      proxies: ['https://api.cors.lol/?url={url}'],
    });
  });

  it('setter 写入并持久化，重新加载后仍可读取；清空 Key 时移除字段', async () => {
    const store = useSettingsStore();
    await store.loadSettings();

    await store.setFirecrawlApiKey('fc-abc');
    await store.setFirecrawlFallbackEnabled(false);
    await store.setFirecrawlAutoAddMapping(false);

    setActivePinia(createPinia());
    const reloaded = useSettingsStore();
    await reloaded.loadSettings();
    expect(reloaded.firecrawlApiKey).toBe('fc-abc');
    expect(reloaded.firecrawlFallbackEnabled).toBe(false);
    expect(reloaded.firecrawlAutoAddMapping).toBe(false);

    await reloaded.setFirecrawlApiKey(undefined);
    expect(reloaded.firecrawlApiKey).toBeUndefined();
    expect('firecrawlApiKey' in reloaded.settings).toBe(false);
  });

  it('importSettings() 应用远端的 Firecrawl 字段', async () => {
    const store = useSettingsStore();
    await store.loadSettings();

    await store.importSettings({ firecrawlApiKey: 'fc-remote', firecrawlFallbackEnabled: false });

    expect(store.firecrawlApiKey).toBe('fc-remote');
    expect(store.firecrawlFallbackEnabled).toBe(false);
  });

  it('importSettings() 保留映射中的 firecrawl 令牌与顺序', async () => {
    const store = useSettingsStore();
    await store.loadSettings();

    await store.importSettings({
      proxySiteMapping: {
        'syosetu.org': {
          enabled: true,
          proxies: [FIRECRAWL_MAPPING_TOKEN, 'https://cors.rozx.moe/?{url}'],
        },
      },
    });

    expect(store.settings.proxySiteMapping?.['syosetu.org']?.proxies).toEqual([
      FIRECRAWL_MAPPING_TOKEN,
      'https://cors.rozx.moe/?{url}',
    ]);
  });
});

describe('promoteFirecrawlForSite', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    mock.restore();
  });

  it('域名尚无映射时创建 { enabled: true, proxies: [firecrawl] }', async () => {
    const store = useSettingsStore();
    await store.loadSettings();

    await store.promoteFirecrawlForSite('syosetu.org');

    expect(store.settings.proxySiteMapping?.['syosetu.org']).toEqual({
      enabled: true,
      proxies: [FIRECRAWL_MAPPING_TOKEN],
    });
  });

  it('已有映射时把 firecrawl 置顶，其余条目保持原顺序', async () => {
    const store = useSettingsStore();
    await store.loadSettings();
    await store.updateSettings({
      proxySiteMapping: {
        'kakuyomu.jp': { enabled: true, proxies: ['a', 'b', FIRECRAWL_MAPPING_TOKEN, 'c'] },
      },
    });

    await store.promoteFirecrawlForSite('kakuyomu.jp');

    expect(store.settings.proxySiteMapping?.['kakuyomu.jp']?.proxies).toEqual([
      FIRECRAWL_MAPPING_TOKEN,
      'a',
      'b',
      'c',
    ]);
  });

  it('禁用中的映射被置顶时同时启用', async () => {
    const store = useSettingsStore();
    await store.loadSettings();
    await store.updateSettings({
      proxySiteMapping: { 'kakuyomu.jp': { enabled: false, proxies: ['a'] } },
    });

    await store.promoteFirecrawlForSite('kakuyomu.jp');

    expect(store.settings.proxySiteMapping?.['kakuyomu.jp']).toEqual({
      enabled: true,
      proxies: [FIRECRAWL_MAPPING_TOKEN, 'a'],
    });
  });

  it('firecrawl 已在首位且映射已启用时不写入', async () => {
    const store = useSettingsStore();
    await store.loadSettings();
    await store.updateSettings({
      proxySiteMapping: {
        'syosetu.org': { enabled: true, proxies: [FIRECRAWL_MAPPING_TOKEN, 'a'] },
      },
    });
    const updateSpy = spyOn(store, 'updateSettings');

    await store.promoteFirecrawlForSite('syosetu.org');

    expect(updateSpy).not.toHaveBeenCalled();
  });
});

describe('removeSiteMapping', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('删除整条网站映射，其余映射保留', async () => {
    const store = useSettingsStore();
    await store.loadSettings();
    await store.updateSettings({
      proxySiteMapping: {
        'syosetu.org': { enabled: true, proxies: [FIRECRAWL_MAPPING_TOKEN] },
        'kakuyomu.jp': { enabled: false, proxies: ['a'] },
      },
    });

    await store.removeSiteMapping('syosetu.org');

    expect(store.settings.proxySiteMapping).toEqual({
      'kakuyomu.jp': { enabled: false, proxies: ['a'] },
    });
  });

  it('域名不存在时不写入', async () => {
    const store = useSettingsStore();
    await store.loadSettings();
    const updateSpy = spyOn(store, 'updateSettings');
    await store.removeSiteMapping('missing.example');
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
