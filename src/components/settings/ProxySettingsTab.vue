<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import InputText from 'primevue/inputtext';
import ToggleSwitch from 'primevue/toggleswitch';
import Select from 'primevue/select';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import Dialog from 'primevue/dialog';
import { useSettingsStore } from 'src/stores/settings';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { extractRootDomain } from 'src/utils/domain-utils';
import { DEFAULT_CORS_PROXY_FOR_AI, DEFAULT_PROXY_LIST } from 'src/constants/proxy';
import axios from 'axios';

const settingsStore = useSettingsStore();
const toast = useToastWithHistory();

// 代理列表（从 store 获取）
const proxyList = computed(() => settingsStore.proxyList);

// 当前选中的代理 ID
const selectedProxyId = ref<string | null>(null);

// 根据当前代理 URL 查找对应的代理 ID
const findProxyIdByUrl = (url: string): string | null => {
  if (!url) return null;
  const proxy = proxyList.value.find((p) => p.url === url);
  return proxy ? proxy.id : null;
};

// 初始化：根据当前代理 URL 设置选中的代理
const initializeProxy = () => {
  const currentUrl = settingsStore.proxyUrl ?? '';
  if (!currentUrl) {
    // 如果代理 URL 为空，使用 DEFAULT_PROXY_LIST 的第一项作为默认代理
    const defaultProxyUrl = DEFAULT_CORS_PROXY_FOR_AI;
    // 先在当前代理列表中查找
    let defaultProxy = proxyList.value.find((p) => p.url === defaultProxyUrl);
    // 如果找不到，使用 DEFAULT_PROXY_LIST 的第一项
    if (!defaultProxy && DEFAULT_PROXY_LIST[0]) {
      defaultProxy = DEFAULT_PROXY_LIST[0];
    }
    if (defaultProxy) {
      selectedProxyId.value = defaultProxy.id;
      settingsStore.setProxyUrl(defaultProxy.url);
    }
  } else {
    const proxyId = findProxyIdByUrl(currentUrl);
    selectedProxyId.value = proxyId;
  }
};

// 处理代理选择变化
const handleProxyChange = (proxyId: string | null) => {
  selectedProxyId.value = proxyId;
  if (proxyId) {
    const proxy = proxyList.value.find((p) => p.id === proxyId);
    if (proxy) {
      settingsStore.setProxyUrl(proxy.url);
    }
  }
};

// 监听代理 URL 变化，更新选中的代理
watch(
  () => settingsStore.proxyUrl,
  (newUrl) => {
    const proxyId = findProxyIdByUrl(newUrl ?? '');
    if (proxyId !== selectedProxyId.value) {
      selectedProxyId.value = proxyId;
    }
  },
);

// 监听代理列表变化，重新初始化
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

// 添加新网站映射
const newSiteInput = ref('');
const newProxyInput = ref<string | null>(null);

const addSiteMapping = async () => {
  const inputSite = newSiteInput.value.trim();
  if (inputSite && newProxyInput.value) {
    const selectedProxy = proxyList.value.find((p) => p.id === newProxyInput.value);
    if (selectedProxy) {
      // 提取根域名
      const rootDomain = extractRootDomain(inputSite);
      if (!rootDomain) {
        toast.add({
          severity: 'error',
          summary: '无效的域名',
          detail: '无法从输入中提取有效的域名',
          life: 3000,
        });
        return;
      }

      // 检查是否已达到最大数量
      const currentProxies = settingsStore.getProxiesForSite(rootDomain);
      if (currentProxies.length >= 3) {
        toast.add({
          severity: 'warn',
          summary: '已达到最大数量',
          detail: '每个网站最多只能配置 3 个代理',
          life: 3000,
        });
        return;
      }

      // 检查代理是否已存在
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
        // 代理已存在，静默处理
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

// 切换网站映射规则的启用/禁用状态
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
    editingSiteMapping.value = {
      site,
      enabled: entry.enabled ?? true,
      proxies: [...(entry.proxies ?? [])],
    };
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
      toast.add({
        severity: 'warn',
        summary: '已达到最大数量',
        detail: '每个网站最多只能配置 3 个代理',
        life: 3000,
      });
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

const confirmEditSiteMapping = async () => {
  if (!editingSiteMapping.value) {
    return;
  }

  // 验证最大数量
  if (selectedProxiesForEdit.value.length > 3) {
    toast.add({
      severity: 'error',
      summary: '代理数量超限',
      detail: '每个网站最多只能配置 3 个代理',
      life: 3000,
    });
    return;
  }

  const site = editingSiteMapping.value.site;
  const currentEntry = siteMapping.value[site];
  const currentProxies = currentEntry?.proxies ?? [];

  // 更新启用状态
  if (enabledForEdit.value !== (currentEntry?.enabled ?? true)) {
    await settingsStore.setProxySiteMappingEnabled(site, enabledForEdit.value);
  }

  // 更新代理列表：先清除所有，然后按新顺序添加
  // 先移除所有现有代理
  for (const proxyUrl of currentProxies) {
    await settingsStore.removeProxyForSite(site, proxyUrl);
  }

  // 按新顺序添加所有代理（最多3个）
  const proxiesToAdd = selectedProxiesForEdit.value.slice(0, 3);
  for (const proxyUrl of proxiesToAdd) {
    await settingsStore.addProxyForSite(site, proxyUrl);
  }

  toast.add({
    severity: 'success',
    summary: '映射已更新',
    detail: `${site} 的代理映射已更新`,
    life: 2000,
  });

  cancelEditSiteMapping();
};

// 获取未选择的代理列表
const availableProxiesForEdit = computed(() => {
  const selectedUrls = new Set(selectedProxiesForEdit.value);
  return proxyList.value.filter((proxy) => proxy.url && !selectedUrls.has(proxy.url));
});

// 获取代理服务的显示名称
const getProxyDisplayName = (proxyUrl: string): string => {
  const proxy = proxyList.value.find((p) => p.url === proxyUrl);
  return proxy ? proxy.name : proxyUrl;
};

// 代理列表管理
const showProxyDialog = ref(false);
const editingProxy = ref<{ id: string; name: string; url: string; description?: string } | null>(
  null,
);
const newProxyName = ref('');
const newProxyUrl = ref('');
const newProxyDescription = ref('');

const openAddProxyDialog = () => {
  editingProxy.value = null;
  newProxyName.value = '';
  newProxyUrl.value = '';
  newProxyDescription.value = '';
  showProxyDialog.value = true;
};

const openEditProxyDialog = (proxy: {
  id: string;
  name: string;
  url: string;
  description?: string;
}) => {
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
  // 如果删除的是当前选中的代理，需要更新选中状态
  if (selectedProxyId.value === id) {
    const remainingProxies = proxyList.value.filter((p) => p.id !== id);
    if (remainingProxies.length > 0) {
      // 优先选择默认代理（DEFAULT_PROXY_LIST 的第一项），如果它在剩余列表中
      const defaultProxyUrl = DEFAULT_CORS_PROXY_FOR_AI;
      let selectedProxy = remainingProxies.find((p) => p.url === defaultProxyUrl);
      // 如果默认代理不在剩余列表中，选择第一个剩余的代理
      if (!selectedProxy) {
        selectedProxy = remainingProxies[0];
      }
      if (selectedProxy) {
        selectedProxyId.value = selectedProxy.id;
        await settingsStore.setProxyUrl(selectedProxy.url);
      }
    } else {
      // 如果没有剩余代理，清空选中状态和代理 URL
      selectedProxyId.value = null;
      await settingsStore.setProxyUrl('');
    }
  }
  await settingsStore.removeProxy(id);
};

// 处理行重新排序
const onRowReorder = async (event: {
  value: Array<{ id: string; name: string; url: string; description?: string }>;
  originalEvent?: Event;
  dragIndex?: number;
  dropIndex?: number;
}) => {
  await settingsStore.reorderProxies(event.value);
  toast.add({
    severity: 'success',
    summary: '代理列表已排序',
    detail: '代理列表的顺序已更新',
    life: 2000,
  });
};

// 测试代理
const testingProxies = ref<Set<string>>(new Set());

const testProxy = async (proxy: { id: string; name: string; url: string }) => {
  if (testingProxies.value.has(proxy.id)) {
    return; // 正在测试中，避免重复测试
  }

  testingProxies.value.add(proxy.id);

  try {
    // 使用一个简单的测试 URL
    const testUrl = 'https://www.duckduckgo.com';
    const proxiedUrl = proxy.url.replace('{url}', encodeURIComponent(testUrl));

    // 设置超时时间为 10 秒
    const response = await axios.get(proxiedUrl, {
      timeout: 10000,
      validateStatus: () => true, // 接受任何状态码
    });

    if (response.status >= 200 && response.status < 400) {
      toast.add({
        severity: 'success',
        summary: '代理测试成功',
        detail: `${proxy.name} 测试通过`,
        life: 3000,
      });
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    toast.add({
      severity: 'error',
      summary: '代理测试失败',
      detail: `${proxy.name}: ${errorMessage}`,
      life: 5000,
    });
  } finally {
    testingProxies.value.delete(proxy.id);
  }
};

// 确保 store 已加载
onMounted(async () => {
  if (!settingsStore.isLoaded) {
    await settingsStore.loadSettings();
  }
  initializeProxy();
});
</script>

<template>
  <div class="proxy-settings-tab p-4 space-y-3">
    <div>
      <h3 class="text-sm font-medium text-moon/90 mb-1">代理设置</h3>
      <p class="text-xs text-moon/70">
        配置代理服务器，用于爬虫和网络工具访问网页
      </p>
    </div>
    <div class="space-y-2">
      <div class="proxy-toggle-row flex items-center justify-between gap-3">
        <label class="text-xs text-moon/80">启用代理</label>
        <ToggleSwitch
          :model-value="settingsStore.proxyEnabled ?? false"
          @update:model-value="
            (value: boolean | undefined) => settingsStore.setProxyEnabled(Boolean(value ?? false))
          "
        />
      </div>
      <p class="text-xs text-moon/60">
        启用后，爬虫和网络工具将使用代理服务器访问网页
      </p>
      <div v-if="settingsStore.proxyEnabled" class="space-y-2 mt-2">
        <div class="proxy-toggle-row flex items-center justify-between gap-3">
          <label class="text-xs text-moon/80">自动切换代理服务</label>
          <ToggleSwitch
            :model-value="settingsStore.proxyAutoSwitch ?? false"
            @update:model-value="
              (value: boolean | undefined) =>
                settingsStore.setProxyAutoSwitch(Boolean(value ?? false))
            "
          />
        </div>
        <p class="text-xs text-moon/60">
          启用后，当代理服务遇到错误时会自动切换到下一个可用的代理服务
        </p>
        <div
          v-if="settingsStore.proxyAutoSwitch"
          class="proxy-toggle-row flex items-center justify-between gap-3"
        >
          <label class="text-xs text-moon/80">自动添加映射</label>
          <ToggleSwitch
            :model-value="settingsStore.proxyAutoAddMapping ?? true"
            @update:model-value="
              (value: boolean | undefined) =>
                settingsStore.setProxyAutoAddMapping(Boolean(value ?? true))
            "
          />
        </div>
        <p v-if="settingsStore.proxyAutoSwitch" class="text-xs text-moon/60">
          启用后，当自动切换代理成功时会自动记录到网站-代理映射中
        </p>
        <label class="text-xs text-moon/80">选择代理服务</label>
        <Select
          :model-value="selectedProxyId"
          :options="proxyList"
          option-label="name"
          option-value="id"
          placeholder="选择代理服务"
          class="w-full"
          @update:model-value="handleProxyChange"
        >
          <template #option="slotProps">
            <div class="flex flex-col">
              <span class="text-sm">{{ slotProps.option.name }}</span>
              <span v-if="slotProps.option.description" class="text-xs text-moon/60">
                {{ slotProps.option.description }}
              </span>
            </div>
          </template>
        </Select>
        <div class="space-y-2">
          <label class="text-xs text-moon/80">代理 URL</label>
          <InputText
            :model-value="settingsStore.proxyUrl ?? ''"
            placeholder="http://abc.xyz?url={url}"
            class="w-full"
            :disabled="selectedProxyId !== null"
            @update:model-value="
              (value: string | undefined) => {
                settingsStore.setProxyUrl(String(value ?? ''));
                // 检查是否匹配某个代理，如果匹配则自动切换
                const matchedProxyId = findProxyIdByUrl(String(value ?? ''));
                if (matchedProxyId) {
                  selectedProxyId = matchedProxyId;
                }
              }
            "
          />
        </div>
        <p class="text-xs text-moon/60">
          代理 URL 格式：http://abc.xyz?url={url}，其中 {url} 会被替换为实际要请求的 URL
        </p>

        <!-- 代理列表管理 -->
        <div class="space-y-2 mt-4 pt-4 border-t border-moon/20">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 class="text-sm font-medium text-moon/90 mb-1">代理列表</h4>
              <p class="text-xs text-moon/70">管理可用的代理服务列表</p>
            </div>
            <Button
              label="添加代理"
              size="small"
              class="w-full sm:w-auto"
              @click="openAddProxyDialog"
            />
          </div>

          <div class="proxy-table-wrapper">
            <DataTable
              :value="proxyList"
              :paginator="false"
              class="proxy-data-table text-xs"
              tableStyle="min-width: 44rem"
              row-reorder
              @row-reorder="onRowReorder"
            >
              <Column row-reorder-header="拖拽排序" :row-reorder="true" style="width: 3rem" />
              <Column field="name" header="名称" class="text-xs">
                <template #body="{ data }">
                  <span class="font-medium">{{ data.name }}</span>
                </template>
              </Column>
              <Column field="url" header="URL" class="text-xs">
                <template #body="{ data }">
                  <span class="text-moon/70 text-xs break-all">{{ data.url }}</span>
                </template>
              </Column>
              <Column field="description" header="描述" class="text-xs">
                <template #body="{ data }">
                  <span v-if="data.description" class="text-xs text-moon/60">{{
                    data.description
                  }}</span>
                  <span v-else class="text-xs text-moon/40 italic">无描述</span>
                </template>
              </Column>
              <Column header="操作" class="text-xs" style="width: 150px">
                <template #body="{ data }">
                  <div class="flex gap-1 flex-nowrap">
                    <Button
                      icon="pi pi-send"
                      size="small"
                      severity="info"
                      text
                      rounded
                      :title="testingProxies.has(data.id) ? '测试中...' : '测试代理'"
                      :loading="testingProxies.has(data.id)"
                      :disabled="testingProxies.has(data.id)"
                      @click="testProxy(data)"
                    />
                    <Button
                      icon="pi pi-pencil"
                      size="small"
                      severity="secondary"
                      text
                      rounded
                      title="编辑"
                      @click="openEditProxyDialog(data)"
                    />
                    <Button
                      icon="pi pi-trash"
                      size="small"
                      severity="danger"
                      text
                      rounded
                      title="删除"
                      @click="deleteProxy(data.id)"
                    />
                  </div>
                </template>
              </Column>
            </DataTable>
          </div>
        </div>
      </div>
    </div>

    <!-- 网站-代理映射管理 -->
    <div v-if="settingsStore.proxyEnabled" class="space-y-2 mt-4 pt-4 border-t border-moon/20">
      <div>
        <h4 class="text-sm font-medium text-moon/90 mb-1">网站-代理映射</h4>
        <p class="text-xs text-moon/70">
          为特定网站配置可用的代理服务。当自动切换代理时，会自动记录成功的代理服务。
        </p>
      </div>

      <!-- 添加新映射 -->
      <div class="space-y-2">
        <div class="flex flex-col gap-2 sm:flex-row">
          <InputText
            v-model="newSiteInput"
            placeholder="网站域名或URL（如：kakuyomu.jp 或 https://www.kakuyomu.jp）"
            class="w-full sm:flex-1"
          />
          <Select
            v-model="newProxyInput"
            :options="proxyList"
            option-label="name"
            option-value="id"
            placeholder="选择代理服务"
            class="w-full sm:flex-1"
          >
            <template #option="slotProps">
              <div class="flex flex-col">
                <span class="text-sm">{{ slotProps.option.name }}</span>
                <span v-if="slotProps.option.description" class="text-xs text-moon/60">
                  {{ slotProps.option.description }}
                </span>
              </div>
            </template>
          </Select>
          <Button
            label="添加"
            size="small"
            class="w-full sm:w-auto"
            :disabled="!newSiteInput.trim() || !newProxyInput"
            @click="addSiteMapping"
          />
        </div>
      </div>

      <!-- 映射列表 -->
      <div v-if="siteMappingEntries.length > 0" class="mt-3">
        <div class="proxy-table-wrapper">
          <DataTable
            :value="siteMappingEntries"
            :paginator="siteMappingEntries.length > 5"
            :rows="5"
            class="proxy-data-table text-xs"
            tableStyle="min-width: 38rem"
          >
            <Column field="site" header="网站" class="text-xs" style="width: 150px">
              <template #body="{ data }">
                <span class="font-medium">{{ data.site }}</span>
              </template>
            </Column>
            <Column header="启用" class="text-xs" style="width: 80px">
              <template #body="{ data }">
                <ToggleSwitch
                  :model-value="data.enabled"
                  @update:model-value="
                    (value: boolean) => toggleSiteMappingEnabled(data.site, value)
                  "
                />
              </template>
            </Column>
            <Column field="proxies" header="代理列表" class="text-xs">
              <template #body="{ data }">
                <div class="flex flex-wrap gap-1">
                  <Tag
                    v-for="(proxy, index) in data.proxies"
                    :key="index"
                    :value="getProxyDisplayName(proxy)"
                    :severity="data.enabled ? 'info' : 'secondary'"
                    class="text-xs"
                  />
                </div>
              </template>
            </Column>
            <Column header="操作" class="text-xs" style="width: 120px">
              <template #body="{ data }">
                <div class="flex gap-1 flex-nowrap justify-start sm:justify-end">
                  <Button
                    icon="pi pi-pencil"
                    size="small"
                    severity="secondary"
                    text
                    rounded
                    title="编辑映射"
                    @click="openEditSiteMappingDialog(data.site)"
                  />
                </div>
              </template>
            </Column>
          </DataTable>
        </div>
      </div>
      <p v-else class="text-xs text-moon/60 italic">
        暂无网站-代理映射。启用自动切换后，成功的代理服务会自动记录。
      </p>
    </div>

    <!-- 添加/编辑代理对话框 -->
    <Dialog
      v-model:visible="showProxyDialog"
      modal
      :header="editingProxy ? '编辑代理' : '添加代理'"
      :style="{ width: 'min(500px, 92vw)' }"
      @hide="showProxyDialog = false"
    >
      <div class="space-y-3">
        <div>
          <label class="text-xs text-moon/80 mb-1 block">名称</label>
          <InputText v-model="newProxyName" placeholder="代理服务名称" class="w-full" />
        </div>
        <div>
          <label class="text-xs text-moon/80 mb-1 block">URL</label>
          <InputText
            v-model="newProxyUrl"
            placeholder="http://abc.xyz?url={url}"
            class="w-full"
          />
          <p class="text-xs text-moon/60 mt-1">其中 {url} 会被替换为实际要请求的 URL</p>
        </div>
        <div>
          <label class="text-xs text-moon/80 mb-1 block">描述（可选）</label>
          <InputText
            v-model="newProxyDescription"
            placeholder="代理服务描述"
            class="w-full"
          />
        </div>
        <div class="flex justify-end gap-2">
          <Button label="取消" size="small" text @click="showProxyDialog = false" />
          <Button
            label="保存"
            size="small"
            :disabled="!newProxyName.trim() || !newProxyUrl.trim()"
            @click="saveProxy"
          />
        </div>
      </div>
    </Dialog>

    <!-- 编辑网站映射对话框 -->
    <Dialog
      v-model:visible="showEditSiteMappingDialog"
      modal
      header="编辑网站-代理映射"
      :style="{ width: 'min(700px, 94vw)' }"
      @hide="cancelEditSiteMapping"
    >
      <div class="space-y-4" v-if="editingSiteMapping">
        <div>
          <p class="text-sm text-moon/80 mb-2">
            网站：<span class="font-medium">{{ editingSiteMapping.site }}</span>
          </p>
        </div>

        <div class="flex items-center justify-between">
          <label class="text-xs text-moon/80">启用此映射规则</label>
          <ToggleSwitch v-model="enabledForEdit" />
        </div>

        <div class="border-t border-moon/20 pt-3">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-medium text-moon/90">已选择的代理</h4>
            <span class="text-xs text-moon/60">{{ selectedProxiesForEdit.length }}/3</span>
          </div>
          <div v-if="selectedProxiesForEdit.length === 0" class="text-xs text-moon/60 italic mb-3">
            暂无代理，请从下方添加（最多 3 个）
          </div>
          <div v-else class="space-y-2 mb-3">
            <div
              v-for="(proxyUrl, index) in selectedProxiesForEdit"
              :key="index"
              class="flex items-center gap-2 p-2 bg-white/5 rounded border border-white/10"
            >
              <div class="flex-1 flex items-center gap-2">
                <span class="text-xs text-moon/60 w-6">{{ index + 1 }}</span>
                <Tag
                  :value="getProxyDisplayName(proxyUrl)"
                  severity="info"
                  class="text-xs flex-1"
                />
              </div>
              <div class="flex gap-1">
                <Button
                  icon="pi pi-arrow-up"
                  size="small"
                  severity="secondary"
                  text
                  rounded
                  :disabled="index === 0"
                  :title="`上移`"
                  @click="moveProxyUp(index)"
                />
                <Button
                  icon="pi pi-arrow-down"
                  size="small"
                  severity="secondary"
                  text
                  rounded
                  :disabled="index === selectedProxiesForEdit.length - 1"
                  :title="`下移`"
                  @click="moveProxyDown(index)"
                />
                <Button
                  icon="pi pi-times"
                  size="small"
                  severity="danger"
                  text
                  rounded
                  :title="`移除`"
                  @click="removeProxyFromMapping(proxyUrl)"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="border-t border-moon/20 pt-3">
          <h4 class="text-sm font-medium text-moon/90 mb-3">可用代理</h4>
          <div v-if="availableProxiesForEdit.length === 0" class="text-xs text-moon/60 italic">
            所有代理已添加
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="proxy in availableProxiesForEdit"
              :key="proxy.id"
              class="flex items-center justify-between p-2 bg-white/5 rounded border border-white/10"
            >
              <div class="flex-1">
                <div class="text-sm font-medium">{{ proxy.name }}</div>
                <div v-if="proxy.description" class="text-xs text-moon/60">
                  {{ proxy.description }}
                </div>
                <div class="text-xs text-moon/50 mt-1 break-all">{{ proxy.url }}</div>
              </div>
              <Button
                icon="pi pi-plus"
                size="small"
                severity="success"
                text
                rounded
                :title="`添加 ${proxy.name}`"
                :disabled="selectedProxiesForEdit.length >= 3"
                @click="addProxyToMapping(proxy.url)"
              />
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-moon/20">
          <Button label="取消" size="small" text @click="cancelEditSiteMapping" />
          <Button label="保存" size="small" @click="confirmEditSiteMapping" />
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.proxy-table-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

@media (max-width: 640px) {
  .proxy-toggle-row {
    align-items: flex-start;
  }

  .proxy-toggle-row :deep(.p-toggleswitch) {
    margin-left: auto;
  }
}
</style>
