import './setup';
import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest';
import * as SettingsStore from 'src/stores/settings';
import * as ToastHistory from '../composables/useToastHistory';
import { createSiteMappingSettingsContext } from '../composables/settings/useSiteMappingSettings';

// 覆盖网站映射「先删后加 + 失败回滚」逻辑（replaceSiteProxies / restoreSiteProxies /
// handleEditMappingFailure）与 Firecrawl 选项 / 平台生效规则。

interface MockStore {
  proxyList: unknown[];
  proxySiteMapping: Record<string, { enabled: boolean; proxies: string[] }>;
  firecrawlFallbackEnabled: boolean;
  firecrawlAutoAddMapping: boolean;
  isLoaded: boolean;
  loadSettings: ReturnType<typeof vi.fn>;
  setFirecrawlAutoAddMapping: ReturnType<typeof vi.fn>;
  removeSiteMapping: ReturnType<typeof vi.fn>;
  addProxyForSite: ReturnType<typeof vi.fn>;
  removeProxyForSite: ReturnType<typeof vi.fn>;
  getProxiesForSite: ReturnType<typeof vi.fn>;
  setProxySiteMappingEnabled: ReturnType<typeof vi.fn>;
}

let store: MockStore;
let toastAdd: ReturnType<typeof vi.fn>;

function makeStore(): MockStore {
  return {
    proxyList: [],
    proxySiteMapping: { 'a.com': { enabled: true, proxies: ['p1', 'p2'] } },
    firecrawlFallbackEnabled: true,
    firecrawlAutoAddMapping: true,
    isLoaded: true,
    loadSettings: vi.fn(async () => {}),
    setFirecrawlAutoAddMapping: vi.fn(async () => {}),
    removeSiteMapping: vi.fn(async () => {}),
    addProxyForSite: vi.fn(async () => {}),
    removeProxyForSite: vi.fn(async () => {}),
    getProxiesForSite: vi.fn(() => ['p1', 'p2']),
    setProxySiteMappingEnabled: vi.fn(async () => {}),
  };
}

function startEdit(
  ctx: ReturnType<typeof createSiteMappingSettingsContext>,
  selected: string[],
  enabled: boolean,
) {
  ctx.editingSiteMapping.value = { site: 'a.com', enabled: true, proxies: ['p1', 'p2'] };
  ctx.selectedProxiesForEdit.value = selected;
  ctx.enabledForEdit.value = enabled;
}

beforeEach(() => {
  store = makeStore();
  toastAdd = vi.fn();
  vi.spyOn(SettingsStore, 'useSettingsStore').mockReturnValue(store as never);
  vi.spyOn(ToastHistory, 'useToastWithHistory').mockReturnValue({ add: toastAdd } as never);
});

describe('useSiteMappingSettings — confirmEditSiteMapping 回滚', () => {
  it('成功路径：先删旧代理再加新代理，提示成功并关闭编辑态', async () => {
    const ctx = createSiteMappingSettingsContext();
    startEdit(ctx, ['p3'], true);

    await ctx.confirmEditSiteMapping();

    expect(store.removeProxyForSite).toHaveBeenCalledWith('a.com', 'p1');
    expect(store.removeProxyForSite).toHaveBeenCalledWith('a.com', 'p2');
    expect(store.addProxyForSite).toHaveBeenCalledWith('a.com', 'p3');
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
    expect(ctx.editingSiteMapping.value).toBeNull();
  });

  it('替换失败：回滚到原始代理列表，提示错误且不关闭编辑态', async () => {
    store.addProxyForSite = vi.fn((_site: string, url: string) =>
      url === 'p3' ? Promise.reject(new Error('add failed')) : Promise.resolve(),
    );
    const ctx = createSiteMappingSettingsContext();
    startEdit(ctx, ['p3'], true);

    await ctx.confirmEditSiteMapping();

    // 回滚时把 original（p1/p2）重新加回
    expect(store.addProxyForSite).toHaveBeenCalledWith('a.com', 'p1');
    expect(store.addProxyForSite).toHaveBeenCalledWith('a.com', 'p2');
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
    expect(ctx.editingSiteMapping.value).not.toBeNull();
  });

  it('启用状态变更后替换失败：回滚 enabled 到原值', async () => {
    store.addProxyForSite = vi.fn((_site: string, url: string) =>
      url === 'p3' ? Promise.reject(new Error('add failed')) : Promise.resolve(),
    );
    const ctx = createSiteMappingSettingsContext();
    startEdit(ctx, ['p3'], false); // enabled true -> false，enabledChanged = true

    await ctx.confirmEditSiteMapping();

    expect(store.setProxySiteMappingEnabled).toHaveBeenCalledWith('a.com', false); // 变更
    expect(store.setProxySiteMappingEnabled).toHaveBeenCalledWith('a.com', true); // 回滚到原值
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  });

  it('enabled 回滚也失败时，错误并入同一 Toast 不被吞掉', async () => {
    store.addProxyForSite = vi.fn((_site: string, url: string) =>
      url === 'p3' ? Promise.reject(new Error('add failed')) : Promise.resolve(),
    );
    // 回滚到原值(true)时失败
    store.setProxySiteMappingEnabled = vi.fn((_site: string, enabled: boolean) =>
      enabled === true ? Promise.reject(new Error('rollback failed')) : Promise.resolve(),
    );
    const ctx = createSiteMappingSettingsContext();
    startEdit(ctx, ['p3'], false);

    await ctx.confirmEditSiteMapping();

    const errorCall = toastAdd.mock.calls.find((c) => c[0]?.severity === 'error');
    expect(errorCall).toBeDefined();
    expect(errorCall?.[0].detail).toContain('add failed');
    expect(errorCall?.[0].detail).toContain('rollback failed');
  });
});

describe('useSiteMappingSettings — Firecrawl 选项与平台规则', () => {
  const CORS = 'https://cors.rozx.moe/?{url}';

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  it('Web：选项含 Firecrawl 与全部代理，Firecrawl 存储令牌并显示为 Firecrawl', async () => {
    store.proxyList = [{ id: 'rozx.moe', name: 'CORS Tsukuyomi', url: CORS }];
    store.getProxiesForSite = vi.fn(() => []);
    store.addProxyForSite = vi.fn(() => Promise.resolve(true));
    const ctx = createSiteMappingSettingsContext();
    expect(ctx.mappingOptions.value.map((o) => o.name)).toEqual(['Firecrawl', 'CORS Tsukuyomi']);

    ctx.newSiteInput.value = 'https://syosetu.org/novel/1/';
    ctx.newProxyInput.value = ctx.mappingOptions.value[0]!.id;
    await ctx.addSiteMapping();

    expect(store.addProxyForSite).toHaveBeenCalledWith('syosetu.org', 'firecrawl');
    expect(ctx.getProxyDisplayName('firecrawl')).toBe('Firecrawl');
    expect(ctx.getProxyDisplayName(CORS)).toBe('CORS Tsukuyomi');
  });

  it('Electron：只提供 Firecrawl 选项，CORS 条目显示为未生效', () => {
    (window as unknown as { electronAPI?: unknown }).electronAPI = { isElectron: true };
    store.proxyList = [{ id: 'rozx.moe', name: 'CORS Tsukuyomi', url: CORS }];
    const ctx = createSiteMappingSettingsContext();
    expect(ctx.mappingOptions.value.map((o) => o.name)).toEqual(['Firecrawl']);
    expect(ctx.mappingTagSeverity(true, CORS)).toBe('secondary');
    expect(ctx.mappingTagTitle(CORS)).toContain('不生效');
    expect(ctx.mappingTagSeverity(true, 'firecrawl')).not.toBe('secondary');
  });

  it('自动添加映射在 Firecrawl 回退关闭时禁用', () => {
    store.firecrawlFallbackEnabled = false;
    const ctx = createSiteMappingSettingsContext();
    expect(ctx.autoAddDisabled.value).toBe(true);
  });

  it('自动添加映射开关写入 firecrawlAutoAddMapping', async () => {
    const ctx = createSiteMappingSettingsContext();
    await ctx.setAutoAddMapping(false);
    expect(store.setFirecrawlAutoAddMapping).toHaveBeenCalledWith(false);
  });
});

describe('useSiteMappingSettings — 删除映射', () => {
  it('删除整条映射并提示成功', async () => {
    const ctx = createSiteMappingSettingsContext();
    await ctx.deleteSiteMapping('a.com');
    expect(store.removeSiteMapping).toHaveBeenCalledWith('a.com');
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success', detail: expect.stringContaining('a.com') }),
    );
  });

  it('删除失败时提示错误', async () => {
    store.removeSiteMapping = vi.fn(() => Promise.reject(new Error('db failed')));
    const ctx = createSiteMappingSettingsContext();
    await ctx.deleteSiteMapping('a.com');
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', detail: expect.stringContaining('db failed') }),
    );
  });
});
