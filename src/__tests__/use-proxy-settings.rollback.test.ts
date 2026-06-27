import './setup';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import * as SettingsStore from 'src/stores/settings';
import * as ToastHistory from '../composables/useToastHistory';
import { createProxySettingsContext } from '../composables/settings/useProxySettings';

// 覆盖代理站点映射「先删后加 + 失败回滚」逻辑（replaceSiteProxies / restoreSiteProxies /
// handleEditMappingFailure），针对：成功、替换失败回滚、enabled 回滚、回滚也失败四类场景。

interface MockStore {
  proxyList: unknown[];
  proxySiteMapping: Record<string, { enabled: boolean; proxies: string[] }>;
  proxyUrl: string;
  proxyEnabled: boolean;
  proxyAutoSwitch: boolean;
  proxyAutoAddMapping: boolean;
  isLoaded: boolean;
  loadSettings: ReturnType<typeof vi.fn>;
  addProxy: ReturnType<typeof vi.fn>;
  removeProxy: ReturnType<typeof vi.fn>;
  updateProxy: ReturnType<typeof vi.fn>;
  reorderProxies: ReturnType<typeof vi.fn>;
  setProxyUrl: ReturnType<typeof vi.fn>;
  setProxyEnabled: ReturnType<typeof vi.fn>;
  setProxyAutoSwitch: ReturnType<typeof vi.fn>;
  setProxyAutoAddMapping: ReturnType<typeof vi.fn>;
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
    proxyUrl: '',
    proxyEnabled: false,
    proxyAutoSwitch: false,
    proxyAutoAddMapping: false,
    isLoaded: true,
    loadSettings: vi.fn(async () => {}),
    addProxy: vi.fn(async () => {}),
    removeProxy: vi.fn(async () => {}),
    updateProxy: vi.fn(async () => {}),
    reorderProxies: vi.fn(async () => {}),
    setProxyUrl: vi.fn(async () => {}),
    setProxyEnabled: vi.fn(async () => {}),
    setProxyAutoSwitch: vi.fn(async () => {}),
    setProxyAutoAddMapping: vi.fn(async () => {}),
    addProxyForSite: vi.fn(async () => {}),
    removeProxyForSite: vi.fn(async () => {}),
    getProxiesForSite: vi.fn(() => ['p1', 'p2']),
    setProxySiteMappingEnabled: vi.fn(async () => {}),
  };
}

function startEdit(
  ctx: ReturnType<typeof createProxySettingsContext>,
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

describe('useProxySettings — confirmEditSiteMapping 回滚', () => {
  it('成功路径：先删旧代理再加新代理，提示成功并关闭编辑态', async () => {
    const ctx = createProxySettingsContext();
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
    const ctx = createProxySettingsContext();
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
    const ctx = createProxySettingsContext();
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
    const ctx = createProxySettingsContext();
    startEdit(ctx, ['p3'], false);

    await ctx.confirmEditSiteMapping();

    const errorCall = toastAdd.mock.calls.find((c) => c[0]?.severity === 'error');
    expect(errorCall).toBeDefined();
    expect(errorCall?.[0].detail).toContain('add failed');
    expect(errorCall?.[0].detail).toContain('rollback failed');
  });
});
