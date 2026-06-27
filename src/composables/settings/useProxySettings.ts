/**
 * ProxySettingsTab 业务逻辑 composable + provide/inject 辅助。
 *
 * 代理设置持有大量本地 UI 状态（启用 / 自动切换 / 选中代理、代理列表 CRUD、
 * 网站-代理映射及其编辑对话框的选中代理集合等）。为把超大模板拆成片段
 * （代理列表、映射列表、两个编辑对话框）而不在手传大量 prop，本 composable 在
 * ProxySettingsTab 中调用一次并 provide；片段通过 injectProxySettings() 取同一份状态。
 */
import { ref, computed, onMounted, watch, provide, inject, type InjectionKey } from 'vue';
import { useSettingsStore } from 'src/stores/settings';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { extractRootDomain } from 'src/utils/domain-utils';
import { DEFAULT_CORS_PROXY_FOR_AI, DEFAULT_PROXY_LIST } from 'src/constants/proxy';
import axios from 'axios';

export type ProxySettingsContext = ReturnType<typeof createProxySettingsContext>;

const PROXY_SETTINGS_KEY: InjectionKey<ProxySettingsContext> = Symbol('proxy-settings');

function createProxySettingsContext() {
  const settingsStore = useSettingsStore();
  const toast = useToastWithHistory();

  const proxyList = computed(() => settingsStore.proxyList);
  const selectedProxyId = ref<string | null>(null);

  const findProxyIdByUrl = (url: string): string | null => {
    if (!url) return null;
    const proxy = proxyList.value.find((p) => p.url === url);
    return proxy ? proxy.id : null;
  };

  const initializeProxy = () => {
    const currentUrl = settingsStore.proxyUrl ?? '';
    if (!currentUrl) {
      const defaultProxyUrl = DEFAULT_CORS_PROXY_FOR_AI;
      let defaultProxy = proxyList.value.find((p) => p.url === defaultProxyUrl);
      if (!defaultProxy && DEFAULT_PROXY_LIST[0]) {
        defaultProxy = DEFAULT_PROXY_LIST[0];
      }
      if (defaultProxy) {
        selectedProxyId.value = defaultProxy.id;
        settingsStore.setProxyUrl(defaultProxy.url);
      }
    } else {
      selectedProxyId.value = findProxyIdByUrl(currentUrl);
    }
  };

  const handleProxyChange = (proxyId: string | null) => {
    selectedProxyId.value = proxyId;
    if (proxyId) {
      const proxy = proxyList.value.find((p) => p.id === proxyId);
      if (proxy) {
        settingsStore.setProxyUrl(proxy.url);
      }
    }
  };

  watch(
    () => settingsStore.proxyUrl,
    (newUrl) => {
      const proxyId = findProxyIdByUrl(newUrl ?? '');
      if (proxyId !== selectedProxyId.value) {
        selectedProxyId.value = proxyId;
      }
    },
  );
  watch(
    () => proxyList.value,
    () => {
      initializeProxy();
    },
  );

  // 网站-代理映射管理
  const siteMapping = computed(() => settingsStore.proxySiteMapping);
  const siteMappingEntries = computed(() => {
    return Object.entries(siteMapping.value).map(([site, entry]) => ({
      site,
      enabled: entry.enabled ?? true,
      proxies: [...(entry.proxies ?? [])],
    }));
  });
  const hasSiteMappings = computed(() => siteMappingEntries.value.length > 0);
  const mappingPaginator = computed(() => siteMappingEntries.value.length > 5);

  const newSiteInput = ref('');
  const newProxyInput = ref<string | null>(null);
  const addMappingDisabled = computed(
    () => !newSiteInput.value.trim() || !newProxyInput.value,
  );

  const addSiteMapping = async () => {
    const inputSite = newSiteInput.value.trim();
    if (inputSite && newProxyInput.value) {
      const selectedProxy = proxyList.value.find((p) => p.id === newProxyInput.value);
      if (selectedProxy) {
        const rootDomain = extractRootDomain(inputSite);
        if (!rootDomain) {
          toast.add({ severity: 'error', summary: '无效的域名', detail: '无法从输入中提取有效的域名', life: 3000 });
          return;
        }
        const currentProxies = settingsStore.getProxiesForSite(rootDomain);
        if (currentProxies.length >= 3) {
          toast.add({ severity: 'warn', summary: '已达到最大数量', detail: '每个网站最多只能配置 3 个代理', life: 3000 });
          return;
        }
        const proxyExists = currentProxies.includes(selectedProxy.url);
        const wasAdded = await settingsStore.addProxyForSite(rootDomain, selectedProxy.url);
        if (wasAdded) {
          toast.add({
            severity: 'success',
            summary: proxyExists ? '映射已更新' : '映射已添加',
            detail: `${rootDomain} -> ${selectedProxy.name}`,
            life: 2000,
          });
          newSiteInput.value = '';
          newProxyInput.value = null;
        } else if (proxyExists) {
          toast.add({
            severity: 'info',
            summary: '代理已存在',
            detail: `${rootDomain} 已包含代理 ${selectedProxy.name}`,
            life: 2000,
          });
        }
      }
    }
  };

  const toggleSiteMappingEnabled = async (site: string, enabled: boolean) => {
    await settingsStore.setProxySiteMappingEnabled(site, enabled);
    toast.add({
      severity: 'success',
      summary: enabled ? '规则已启用' : '规则已禁用',
      detail: `${site} 的映射规则已${enabled ? '启用' : '禁用'}`,
      life: 2000,
    });
  };

  // 编辑网站映射
  const editingSiteMapping = ref<{ site: string; enabled: boolean; proxies: string[] } | null>(null);
  const showEditSiteMappingDialog = ref(false);
  const selectedProxiesForEdit = ref<string[]>([]);
  const enabledForEdit = ref(false);

  const openEditSiteMappingDialog = (site: string) => {
    const entry = siteMapping.value[site];
    if (entry) {
      editingSiteMapping.value = { site, enabled: entry.enabled ?? true, proxies: [...(entry.proxies ?? [])] };
      selectedProxiesForEdit.value = [...(entry.proxies ?? [])];
      enabledForEdit.value = entry.enabled ?? true;
      showEditSiteMappingDialog.value = true;
    }
  };

  const cancelEditSiteMapping = () => {
    editingSiteMapping.value = null;
    selectedProxiesForEdit.value = [];
    enabledForEdit.value = false;
    showEditSiteMappingDialog.value = false;
  };

  const addProxyToMapping = (proxyUrl: string | undefined) => {
    if (proxyUrl && !selectedProxiesForEdit.value.includes(proxyUrl)) {
      if (selectedProxiesForEdit.value.length < 3) {
        selectedProxiesForEdit.value.push(proxyUrl);
      } else {
        toast.add({ severity: 'warn', summary: '已达到最大数量', detail: '每个网站最多只能配置 3 个代理', life: 3000 });
      }
    }
  };

  const removeProxyFromMapping = (proxyUrl: string) => {
    const index = selectedProxiesForEdit.value.indexOf(proxyUrl);
    if (index >= 0) {
      selectedProxiesForEdit.value.splice(index, 1);
    }
  };

  const moveProxyUp = (index: number) => {
    if (index > 0 && index < selectedProxiesForEdit.value.length) {
      const temp = selectedProxiesForEdit.value[index];
      if (temp) {
        selectedProxiesForEdit.value[index] = selectedProxiesForEdit.value[index - 1] ?? temp;
        selectedProxiesForEdit.value[index - 1] = temp;
      }
    }
  };

  const moveProxyDown = (index: number) => {
    if (index >= 0 && index < selectedProxiesForEdit.value.length - 1) {
      const temp = selectedProxiesForEdit.value[index];
      if (temp) {
        selectedProxiesForEdit.value[index] = selectedProxiesForEdit.value[index + 1] ?? temp;
        selectedProxiesForEdit.value[index + 1] = temp;
      }
    }
  };

  // 把网站映射的代理列表整体替换为 nextProxies（最多 3 个）。
  // store 未提供原子替换，只能「先删后加」；任一步失败时整体回滚到 currentProxies，
  // 避免留下半更新（旧映射已删、新映射只加了一部分）的损坏配置。失败时回滚后重新抛出。
  const replaceSiteProxies = async (site: string, currentProxies: string[], nextProxies: string[]) => {
    const original = [...currentProxies];
    try {
      for (const proxyUrl of currentProxies) {
        await settingsStore.removeProxyForSite(site, proxyUrl);
      }
      const proxiesToAdd = nextProxies.slice(0, 3);
      for (const proxyUrl of proxiesToAdd) {
        await settingsStore.addProxyForSite(site, proxyUrl);
      }
    } catch (err) {
      // 回滚：先清掉本次已写入的任何代理，再恢复原始列表
      await restoreSiteProxies(site, original);
      throw err;
    }
  };

  // 把网站映射的代理列表恢复为 desiredProxies（用于回滚）。先移除当前残留再逐个加回。
  const restoreSiteProxies = async (site: string, desiredProxies: string[]) => {
    const leftover = settingsStore.getProxiesForSite(site);
    for (const proxyUrl of leftover) {
      await settingsStore.removeProxyForSite(site, proxyUrl);
    }
    for (const proxyUrl of desiredProxies.slice(0, 3)) {
      await settingsStore.addProxyForSite(site, proxyUrl);
    }
  };

  // 编辑映射失败时的统一处理：回滚启用状态（代理列表已由 replaceSiteProxies 自行回滚），
  // 记录日志并提示错误。抽出以降低 confirmEditSiteMapping 的复杂度。
  const handleEditMappingFailure = async (
    site: string,
    enabledChanged: boolean,
    originalEnabled: boolean,
    err: unknown,
  ) => {
    if (enabledChanged) {
      await settingsStore.setProxySiteMappingEnabled(site, originalEnabled).catch((rollbackErr) => {
        console.error('[useProxySettings] 回滚启用状态失败:', rollbackErr);
      });
    }
    console.error('[useProxySettings] 更新代理映射失败:', err);
    toast.add({
      severity: 'error',
      summary: '映射更新失败',
      detail: err instanceof Error ? err.message : String(err),
      life: 5000,
    });
  };

  const confirmEditSiteMapping = async () => {
    if (!editingSiteMapping.value) {
      return;
    }
    if (selectedProxiesForEdit.value.length > 3) {
      toast.add({ severity: 'error', summary: '代理数量超限', detail: '每个网站最多只能配置 3 个代理', life: 3000 });
      return;
    }
    const site = editingSiteMapping.value.site;
    const currentEntry = siteMapping.value[site];
    const currentProxies = currentEntry?.proxies ?? [];
    const originalEnabled = currentEntry?.enabled ?? true;
    const enabledChanged = enabledForEdit.value !== originalEnabled;
    try {
      if (enabledChanged) {
        await settingsStore.setProxySiteMappingEnabled(site, enabledForEdit.value);
      }
      await replaceSiteProxies(site, currentProxies, selectedProxiesForEdit.value);
    } catch (err) {
      await handleEditMappingFailure(site, enabledChanged, originalEnabled, err);
      return;
    }
    toast.add({ severity: 'success', summary: '映射已更新', detail: `${site} 的代理映射已更新`, life: 2000 });
    cancelEditSiteMapping();
  };

  const availableProxiesForEdit = computed(() => {
    const selectedUrls = new Set(selectedProxiesForEdit.value);
    return proxyList.value.filter((proxy) => proxy.url && !selectedUrls.has(proxy.url));
  });
  const hasSelectedProxies = computed(() => selectedProxiesForEdit.value.length === 0);
  const hasAvailableProxies = computed(() => availableProxiesForEdit.value.length === 0);
  const selectedProxiesFull = computed(() => selectedProxiesForEdit.value.length >= 3);

  const getProxyDisplayName = (proxyUrl: string): string => {
    const proxy = proxyList.value.find((p) => p.url === proxyUrl);
    return proxy ? proxy.name : proxyUrl;
  };
  const mappingTagSeverity = (enabled: boolean) => (enabled ? 'info' : 'secondary');

  // 代理列表管理
  const showProxyDialog = ref(false);
  const editingProxy = ref<{ id: string; name: string; url: string; description?: string } | null>(null);
  const newProxyName = ref('');
  const newProxyUrl = ref('');
  const newProxyDescription = ref('');
  const proxyDialogHeader = computed(() => (editingProxy.value ? '编辑代理' : '添加代理'));

  const openAddProxyDialog = () => {
    editingProxy.value = null;
    newProxyName.value = '';
    newProxyUrl.value = '';
    newProxyDescription.value = '';
    showProxyDialog.value = true;
  };

  const openEditProxyDialog = (proxy: { id: string; name: string; url: string; description?: string }) => {
    editingProxy.value = proxy;
    newProxyName.value = proxy.name;
    newProxyUrl.value = proxy.url;
    newProxyDescription.value = proxy.description ?? '';
    showProxyDialog.value = true;
  };

  const saveProxy = async () => {
    if (!newProxyName.value.trim() || !newProxyUrl.value.trim()) {
      return;
    }
    const trimmedDescription = newProxyDescription.value.trim();
    const proxyData: { name: string; url: string; description?: string } = {
      name: newProxyName.value.trim(),
      url: newProxyUrl.value.trim(),
    };
    if (trimmedDescription) {
      proxyData.description = trimmedDescription;
    }
    if (editingProxy.value) {
      await settingsStore.updateProxy(editingProxy.value.id, proxyData);
    } else {
      await settingsStore.addProxy(proxyData);
    }
    showProxyDialog.value = false;
  };

  const deleteProxy = async (id: string) => {
    if (selectedProxyId.value === id) {
      const remainingProxies = proxyList.value.filter((p) => p.id !== id);
      if (remainingProxies.length > 0) {
        const defaultProxyUrl = DEFAULT_CORS_PROXY_FOR_AI;
        let selectedProxy = remainingProxies.find((p) => p.url === defaultProxyUrl);
        if (!selectedProxy) {
          selectedProxy = remainingProxies[0];
        }
        if (selectedProxy) {
          selectedProxyId.value = selectedProxy.id;
          await settingsStore.setProxyUrl(selectedProxy.url);
        }
      } else {
        selectedProxyId.value = null;
        await settingsStore.setProxyUrl('');
      }
    }
    await settingsStore.removeProxy(id);
  };

  const onRowReorder = async (event: {
    value: Array<{ id: string; name: string; url: string; description?: string }>;
  }) => {
    await settingsStore.reorderProxies(event.value);
    toast.add({ severity: 'success', summary: '代理列表已排序', detail: '代理列表的顺序已更新', life: 2000 });
  };

  // 测试代理
  const testingProxies = ref<Set<string>>(new Set());
  const isTestingProxy = (id: string) => testingProxies.value.has(id);
  const testProxyTitle = (id: string) => (testingProxies.value.has(id) ? '测试中...' : '测试代理');

  const testProxy = async (proxy: { id: string; name: string; url: string }) => {
    if (testingProxies.value.has(proxy.id)) {
      return;
    }
    testingProxies.value.add(proxy.id);
    try {
      const testUrl = 'https://www.duckduckgo.com';
      const proxiedUrl = proxy.url.replace('{url}', encodeURIComponent(testUrl));
      const response = await axios.get(proxiedUrl, { timeout: 10000, validateStatus: () => true });
      if (response.status >= 200 && response.status < 400) {
        toast.add({ severity: 'success', summary: '代理测试成功', detail: `${proxy.name} 测试通过`, life: 3000 });
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      toast.add({ severity: 'error', summary: '代理测试失败', detail: `${proxy.name}: ${errorMessage}`, life: 5000 });
    } finally {
      testingProxies.value.delete(proxy.id);
    }
  };

  // URL 输入：匹配代理时自动切换 selectedProxyId
  const onProxyUrlInput = (value: string | undefined) => {
    const url = String(value ?? '');
    settingsStore.setProxyUrl(url);
    const matchedProxyId = findProxyIdByUrl(url);
    if (matchedProxyId) {
      selectedProxyId.value = matchedProxyId;
    }
  };
  const urlDisabled = computed(() => selectedProxyId.value !== null);

  const proxyEnabled = computed(() => settingsStore.proxyEnabled);
  const proxyAutoSwitch = computed(() => settingsStore.proxyAutoSwitch);
  const proxyAutoAddMapping = computed(() => settingsStore.proxyAutoAddMapping ?? true);
  const proxyUrl = computed(() => settingsStore.proxyUrl ?? '');
  // toggle 设置封装：吸收 Boolean(... ?? ...) 逻辑，保持模板零分支
  const setProxyEnabled = (v: boolean | undefined) => settingsStore.setProxyEnabled(Boolean(v ?? false));
  const setProxyAutoSwitch = (v: boolean | undefined) =>
    settingsStore.setProxyAutoSwitch(Boolean(v ?? false));
  const setProxyAutoAddMapping = (v: boolean | undefined) =>
    settingsStore.setProxyAutoAddMapping(Boolean(v ?? true));

  onMounted(async () => {
    if (!settingsStore.isLoaded) {
      await settingsStore.loadSettings();
    }
    initializeProxy();
  });

  return {
    settingsStore,
    proxyList,
    selectedProxyId,
    handleProxyChange,
    findProxyIdByUrl,
    siteMappingEntries,
    hasSiteMappings,
    mappingPaginator,
    newSiteInput,
    newProxyInput,
    addMappingDisabled,
    addSiteMapping,
    toggleSiteMappingEnabled,
    editingSiteMapping,
    showEditSiteMappingDialog,
    selectedProxiesForEdit,
    enabledForEdit,
    openEditSiteMappingDialog,
    cancelEditSiteMapping,
    addProxyToMapping,
    removeProxyFromMapping,
    moveProxyUp,
    moveProxyDown,
    confirmEditSiteMapping,
    availableProxiesForEdit,
    hasSelectedProxies,
    hasAvailableProxies,
    selectedProxiesFull,
    getProxyDisplayName,
    mappingTagSeverity,
    showProxyDialog,
    editingProxy,
    newProxyName,
    newProxyUrl,
    newProxyDescription,
    proxyDialogHeader,
    openAddProxyDialog,
    openEditProxyDialog,
    saveProxy,
    deleteProxy,
    onRowReorder,
    testingProxies,
    isTestingProxy,
    testProxyTitle,
    testProxy,
    onProxyUrlInput,
    urlDisabled,
    proxyEnabled,
    proxyAutoSwitch,
    proxyAutoAddMapping,
    proxyUrl,
    setProxyEnabled,
    setProxyAutoSwitch,
    setProxyAutoAddMapping,
  };
}

export function provideProxySettings(): ProxySettingsContext {
  const context = createProxySettingsContext();
  provide(PROXY_SETTINGS_KEY, context);
  return context;
}

export function injectProxySettings(): ProxySettingsContext {
  const context = inject(PROXY_SETTINGS_KEY);
  if (!context) {
    throw new Error('injectProxySettings() called outside ProxySettingsTab.');
  }
  return context;
}
