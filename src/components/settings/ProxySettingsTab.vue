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
    // 如果代理 URL 为空，默认选择第一个代理
    const firstProxy = proxyList.value[0];
    if (firstProxy) {
      selectedProxyId.value = firstProxy.id;
      settingsStore.setProxyUrl(firstProxy.url);
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
  return Object.entries(siteMapping.value).map(([site, proxies]) => ({
    site,
    proxies: [...proxies],
  }));
});

// 添加新网站映射
const newSiteInput = ref('');
const newProxyInput = ref<string | null>(null);

const addSiteMapping = async () => {
  const site = newSiteInput.value.trim();
  if (site && newProxyInput.value) {
    const selectedProxy = proxyList.value.find((p) => p.id === newProxyInput.value);
    if (selectedProxy) {
      await settingsStore.addProxyForSite(site, selectedProxy.url);
      newSiteInput.value = '';
      newProxyInput.value = null;
    }
  }
};

// 删除网站映射
const removeSiteMapping = async (site: string, proxyUrl: string) => {
  await settingsStore.removeProxyForSite(site, proxyUrl);
};

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
      // 选择第一个剩余的代理
      const firstProxy = remainingProxies[0];
      if (firstProxy) {
        selectedProxyId.value = firstProxy.id;
        await settingsStore.setProxyUrl(firstProxy.url);
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
    const testUrl = 'https://www.google.com';
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
  <div class="p-4 space-y-3">
    <div>
      <h3 class="text-sm font-medium text-moon/90 mb-1">代理设置</h3>
      <p class="text-xs text-moon/70">配置代理服务器，用于爬虫和网络工具访问网页</p>
    </div>
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <label class="text-xs text-moon/80">启用代理</label>
        <ToggleSwitch
          :model-value="settingsStore.proxyEnabled ?? false"
          @update:model-value="
            (value: boolean | undefined) => settingsStore.setProxyEnabled(Boolean(value ?? false))
          "
        />
      </div>
      <p class="text-xs text-moon/60">启用后，爬虫和网络工具将使用代理服务器访问网页</p>
      <div v-if="settingsStore.proxyEnabled" class="space-y-2 mt-2">
        <div class="flex items-center justify-between">
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
        <div v-if="settingsStore.proxyAutoSwitch" class="flex items-center justify-between">
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
          <div class="flex items-center justify-between">
            <div>
              <h4 class="text-sm font-medium text-moon/90 mb-1">代理列表</h4>
              <p class="text-xs text-moon/70">管理可用的代理服务列表</p>
            </div>
            <Button label="添加代理" size="small" @click="openAddProxyDialog" />
          </div>

          <DataTable
            :value="proxyList"
            :paginator="proxyList.length > 5"
            :rows="5"
            class="text-xs"
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
        <div class="flex gap-2">
          <InputText
            v-model="newSiteInput"
            placeholder="网站域名（如：kakuyomu.jp）"
            class="flex-1"
          />
          <Select
            v-model="newProxyInput"
            :options="proxyList"
            option-label="name"
            option-value="id"
            placeholder="选择代理服务"
            class="flex-1"
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
            :disabled="!newSiteInput.trim() || !newProxyInput"
            @click="addSiteMapping"
          />
        </div>
      </div>

      <!-- 映射列表 -->
      <div v-if="siteMappingEntries.length > 0" class="mt-3">
        <DataTable
          :value="siteMappingEntries"
          :paginator="siteMappingEntries.length > 5"
          :rows="5"
          class="text-xs"
        >
          <Column field="site" header="网站" class="text-xs">
            <template #body="{ data }">
              <span class="font-medium">{{ data.site }}</span>
            </template>
          </Column>
          <Column field="proxies" header="可用代理" class="text-xs">
            <template #body="{ data }">
              <div class="flex flex-wrap gap-1">
                <Tag
                  v-for="(proxy, index) in data.proxies"
                  :key="index"
                  :value="getProxyDisplayName(proxy)"
                  severity="info"
                  class="text-xs"
                />
              </div>
            </template>
          </Column>
          <Column header="操作" class="text-xs" style="width: 150px">
            <template #body="{ data }">
              <div class="flex gap-1 flex-nowrap">
                <Button
                  v-for="(proxy, index) in data.proxies"
                  :key="index"
                  icon="pi pi-times"
                  size="small"
                  severity="danger"
                  text
                  rounded
                  :title="`删除 ${getProxyDisplayName(proxy)}`"
                  @click="removeSiteMapping(data.site, proxy)"
                />
              </div>
            </template>
          </Column>
        </DataTable>
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
      :style="{ width: '500px' }"
      @hide="showProxyDialog = false"
    >
      <div class="space-y-3">
        <div>
          <label class="text-xs text-moon/80 mb-1 block">名称</label>
          <InputText v-model="newProxyName" placeholder="代理服务名称" class="w-full" />
        </div>
        <div>
          <label class="text-xs text-moon/80 mb-1 block">URL</label>
          <InputText v-model="newProxyUrl" placeholder="http://abc.xyz?url={url}" class="w-full" />
          <p class="text-xs text-moon/60 mt-1">其中 {url} 会被替换为实际要请求的 URL</p>
        </div>
        <div>
          <label class="text-xs text-moon/80 mb-1 block">描述（可选）</label>
          <InputText v-model="newProxyDescription" placeholder="代理服务描述" class="w-full" />
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
  </div>
</template>
