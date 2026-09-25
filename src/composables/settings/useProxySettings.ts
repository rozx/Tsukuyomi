/**
 * ProxySettingsTab 业务逻辑 composable + provide/inject 辅助。
 *
 * 代理设置持有本地 UI 状态（启用 / 默认代理选择、代理列表 CRUD 与测试）。网站映射已拆到
 * useSiteMappingSettings（独立标签页）。本 composable 在 ProxySettingsTab 中调用一次并
 * provide；代理列表与编辑对话框片段通过 injectProxySettings() 取同一份状态。
 */
import { ref, computed, onMounted, watch, provide, inject, type InjectionKey } from 'vue';
import { useSettingsStore } from 'src/stores/settings';
import { useToastWithHistory } from 'src/composables/useToastHistory';
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
  const proxyUrl = computed(() => settingsStore.proxyUrl ?? '');
  // toggle 设置封装：吸收 Boolean(... ?? ...) 逻辑，保持模板零分支
  const setProxyEnabled = (v: boolean | undefined) => settingsStore.setProxyEnabled(Boolean(v ?? false));

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
    proxyUrl,
    setProxyEnabled,
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
