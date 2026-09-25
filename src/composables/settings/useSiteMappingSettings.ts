/**
 * 「网站映射」标签页业务逻辑 composable + provide/inject 辅助（从 useProxySettings 拆出）。
 *
 * 映射条目为按优先级排列的代理 URL，另可包含保留令牌 firecrawl（经 Firecrawl 抓取）。
 * Electron 端直连、不经 CORS 代理，因此只有 firecrawl 条目生效，CORS 条目显示为未生效。
 * SiteMappingSettingsTab 调用 provideSiteMappingSettings()，编辑对话框通过 inject 取同一份状态。
 */
import { ref, computed, onMounted, provide, inject, type InjectionKey } from 'vue';
import { useSettingsStore } from 'src/stores/settings';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { extractRootDomain } from 'src/utils/domain-utils';
import { FIRECRAWL_MAPPING_TOKEN } from 'src/constants/proxy';
import { isElectron } from 'src/utils/platform';

export type SiteMappingSettingsContext = ReturnType<typeof createSiteMappingSettingsContext>;

const SITE_MAPPING_SETTINGS_KEY: InjectionKey<SiteMappingSettingsContext> =
  Symbol('site-mapping-settings');

const MAX_MAPPING_ENTRIES = 3;
const FIRECRAWL_OPTION_ID = '__firecrawl__';

interface MappingOption {
  id: string;
  name: string;
  url: string;
  description?: string;
}

// 导出以便单测直接构造（驱动 confirmEditSiteMapping 的回滚路径）；运行时仍通过
// provideSiteMappingSettings / injectSiteMappingSettings 使用。
export function createSiteMappingSettingsContext() {
  const settingsStore = useSettingsStore();
  const toast = useToastWithHistory();
  const electron = isElectron();

  const proxyList = computed(() => settingsStore.proxyList);
  const firecrawlOption: MappingOption = {
    id: FIRECRAWL_OPTION_ID,
    name: 'Firecrawl',
    url: FIRECRAWL_MAPPING_TOKEN,
    description: '经 Firecrawl 抓取（消耗 Firecrawl 额度）',
  };
  // Electron 直连、CORS 条目不生效，但仍可维护（映射会同步到网页端），选项中注明不生效
  const mappingOptions = computed<MappingOption[]>(() => [
    firecrawlOption,
    ...proxyList.value.map((proxy) =>
      electron ? { ...proxy, description: '桌面端不生效，仅网页端使用' } : proxy,
    ),
  ]);

  const isFirecrawlEntry = (entry: string) => entry === FIRECRAWL_MAPPING_TOKEN;
  /** 条目在当前平台是否生效：Electron 仅 firecrawl 生效 */
  const isEntryActive = (entry: string) => !electron || isFirecrawlEntry(entry);

  // 自动添加映射（依赖 Firecrawl 回退总开关）
  const firecrawlFallbackEnabled = computed(() => settingsStore.firecrawlFallbackEnabled);
  const autoAddMapping = computed(() => settingsStore.firecrawlAutoAddMapping);
  const autoAddDisabled = computed(() => !firecrawlFallbackEnabled.value);
  const setAutoAddMapping = (v: boolean | undefined) =>
    settingsStore.setFirecrawlAutoAddMapping(Boolean(v ?? true));

  // 网站映射列表
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
  const addMappingDisabled = computed(() => !newSiteInput.value.trim() || !newProxyInput.value);

  const addSiteMapping = async () => {
    const inputSite = newSiteInput.value.trim();
    if (!inputSite || !newProxyInput.value) return;
    const selected = mappingOptions.value.find((p) => p.id === newProxyInput.value);
    if (!selected) return;
    const rootDomain = extractRootDomain(inputSite);
    if (!rootDomain) {
      toast.add({ severity: 'error', summary: '无效的域名', detail: '无法从输入中提取有效的域名', life: 3000 });
      return;
    }
    // 读取映射实际保存的条目（禁用映射的 getProxiesForSite 为空，不能据此判断上限）
    const currentProxies = siteMapping.value[rootDomain]?.proxies ?? [];
    if (currentProxies.length >= MAX_MAPPING_ENTRIES) {
      toast.add({ severity: 'warn', summary: '已达到最大数量', detail: '每个网站最多只能配置 3 项', life: 3000 });
      return;
    }
    const proxyExists = currentProxies.includes(selected.url);
    const wasAdded = await settingsStore.addProxyForSite(rootDomain, selected.url);
    if (wasAdded) {
      toast.add({
        severity: 'success',
        summary: proxyExists ? '映射已更新' : '映射已添加',
        detail: `${rootDomain} -> ${selected.name}`,
        life: 2000,
      });
      newSiteInput.value = '';
      newProxyInput.value = null;
    } else if (proxyExists) {
      toast.add({
        severity: 'info',
        summary: '条目已存在',
        detail: `${rootDomain} 已包含 ${selected.name}`,
        life: 2000,
      });
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

  const deleteSiteMapping = async (site: string) => {
    try {
      await settingsStore.removeSiteMapping(site);
    } catch (err) {
      console.error('[useSiteMappingSettings] 删除网站映射失败:', err);
      toast.add({ severity: 'error', summary: '删除失败', detail: formatErrorMessage(err), life: 5000 });
      return;
    }
    toast.add({ severity: 'success', summary: '映射已删除', detail: `已删除 ${site} 的网站映射`, life: 2000 });
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
      if (selectedProxiesForEdit.value.length < MAX_MAPPING_ENTRIES) {
        selectedProxiesForEdit.value.push(proxyUrl);
      } else {
        toast.add({ severity: 'warn', summary: '已达到最大数量', detail: '每个网站最多只能配置 3 项', life: 3000 });
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

  // 把网站映射的条目整体替换为 nextProxies（最多 3 个）。
  // store 未提供原子替换，只能「先删后加」；任一步失败时整体回滚到 currentProxies，
  // 避免留下半更新（旧映射已删、新映射只加了一部分）的损坏配置。失败时回滚后重新抛出。
  const replaceSiteProxies = async (site: string, currentProxies: string[], nextProxies: string[]) => {
    const original = [...currentProxies];
    try {
      // 用快照遍历，避免 store 原地更新代理数组导致漏删
      for (const proxyUrl of original) {
        await settingsStore.removeProxyForSite(site, proxyUrl);
      }
      for (const proxyUrl of nextProxies.slice(0, MAX_MAPPING_ENTRIES)) {
        await settingsStore.addProxyForSite(site, proxyUrl);
      }
    } catch (err) {
      // 回滚：先清掉本次已写入的任何条目，再恢复原始列表
      await restoreSiteProxies(site, original);
      throw err;
    }
  };

  // 把网站映射的条目恢复为 desiredProxies（用于回滚）。先移除当前残留再逐个加回。
  const restoreSiteProxies = async (site: string, desiredProxies: string[]) => {
    // 快照当前残留，避免遍历途中被 store 原地修改而漏删
    const leftover = [...settingsStore.getProxiesForSite(site)];
    for (const proxyUrl of leftover) {
      await settingsStore.removeProxyForSite(site, proxyUrl);
    }
    for (const proxyUrl of desiredProxies.slice(0, MAX_MAPPING_ENTRIES)) {
      await settingsStore.addProxyForSite(site, proxyUrl);
    }
  };

  // 提取可读错误消息：Error 取 message，字符串原样，其余尝试 JSON 序列化，
  // 避免对象被 String() 压成 '[object Object]'（同时满足 no-base-to-string）。
  const formatErrorMessage = (err: unknown): string => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    try {
      return JSON.stringify(err);
    } catch {
      return '未知错误';
    }
  };

  // 编辑映射失败时的统一处理：回滚启用状态（条目已由 replaceSiteProxies 自行回滚），
  // 记录日志并提示错误。抽出以降低 confirmEditSiteMapping 的复杂度。
  const handleEditMappingFailure = async (
    site: string,
    enabledChanged: boolean,
    originalEnabled: boolean,
    err: unknown,
  ) => {
    // 回滚启用状态的失败不再静默吞掉，并入同一个 Toast 通道一并提示
    let rollbackError: unknown = null;
    if (enabledChanged) {
      try {
        await settingsStore.setProxySiteMappingEnabled(site, originalEnabled);
      } catch (rollbackErr) {
        rollbackError = rollbackErr;
        console.error('[useSiteMappingSettings] 回滚启用状态失败:', rollbackErr);
      }
    }
    console.error('[useSiteMappingSettings] 更新网站映射失败:', err);
    const detail =
      rollbackError !== null
        ? `${formatErrorMessage(err)}；回滚启用状态也失败：${formatErrorMessage(rollbackError)}`
        : formatErrorMessage(err);
    toast.add({
      severity: 'error',
      summary: '映射更新失败',
      detail,
      life: 5000,
    });
  };

  const confirmEditSiteMapping = async () => {
    if (!editingSiteMapping.value) {
      return;
    }
    if (selectedProxiesForEdit.value.length > MAX_MAPPING_ENTRIES) {
      toast.add({ severity: 'error', summary: '数量超限', detail: '每个网站最多只能配置 3 项', life: 3000 });
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
      // 删除最后一个旧条目会移除整条映射，再添加会以启用状态重建：替换后重新应用目标启用状态
      if ((siteMapping.value[site]?.enabled ?? true) !== enabledForEdit.value) {
        await settingsStore.setProxySiteMappingEnabled(site, enabledForEdit.value);
      }
    } catch (err) {
      await handleEditMappingFailure(site, enabledChanged, originalEnabled, err);
      return;
    }
    toast.add({ severity: 'success', summary: '映射已更新', detail: `${site} 的网站映射已更新`, life: 2000 });
    cancelEditSiteMapping();
  };

  const availableProxiesForEdit = computed(() => {
    const selectedUrls = new Set(selectedProxiesForEdit.value);
    return mappingOptions.value.filter((proxy) => proxy.url && !selectedUrls.has(proxy.url));
  });
  const hasSelectedProxies = computed(() => selectedProxiesForEdit.value.length === 0);
  const hasAvailableProxies = computed(() => availableProxiesForEdit.value.length === 0);
  const selectedProxiesFull = computed(
    () => selectedProxiesForEdit.value.length >= MAX_MAPPING_ENTRIES,
  );

  const getProxyDisplayName = (proxyUrl: string): string => {
    if (isFirecrawlEntry(proxyUrl)) return 'Firecrawl';
    const proxy = proxyList.value.find((p) => p.url === proxyUrl);
    return proxy ? proxy.name : proxyUrl;
  };
  const mappingTagSeverity = (enabled: boolean, entry: string) => {
    if (!enabled || !isEntryActive(entry)) return 'secondary';
    return isFirecrawlEntry(entry) ? 'warn' : 'info';
  };
  const mappingTagTitle = (entry: string) =>
    isEntryActive(entry) ? '' : '桌面端直连网站，CORS 代理条目不生效';

  onMounted(async () => {
    if (!settingsStore.isLoaded) {
      await settingsStore.loadSettings();
    }
  });

  return {
    electron,
    mappingOptions,
    firecrawlFallbackEnabled,
    autoAddMapping,
    autoAddDisabled,
    setAutoAddMapping,
    siteMappingEntries,
    hasSiteMappings,
    mappingPaginator,
    newSiteInput,
    newProxyInput,
    addMappingDisabled,
    addSiteMapping,
    toggleSiteMappingEnabled,
    deleteSiteMapping,
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
    mappingTagTitle,
  };
}

export function provideSiteMappingSettings(): SiteMappingSettingsContext {
  const context = createSiteMappingSettingsContext();
  provide(SITE_MAPPING_SETTINGS_KEY, context);
  return context;
}

export function injectSiteMappingSettings(): SiteMappingSettingsContext {
  const context = inject(SITE_MAPPING_SETTINGS_KEY);
  if (!context) {
    throw new Error('injectSiteMappingSettings() called outside SiteMappingSettingsTab.');
  }
  return context;
}
