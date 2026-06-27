<script setup lang="ts">
/**
 * 代理设置标签页（启用 / 自动切换 / 代理列表 + 网站-代理映射）。
 *
 * 业务状态由 useProxySettings 统一持有并 provide；两个编辑对话框（ProxyEditDialog /
 * SiteMappingEditDialog）通过 injectProxySettings() 取同一份状态。本文件保留全部
 * 代理样式（非 scoped），因为 proxy- 前缀仅在本页使用。
 */
import InputText from 'primevue/inputtext';
import ToggleSwitch from 'primevue/toggleswitch';
import Select from 'primevue/select';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import { provideProxySettings } from 'src/composables/settings/useProxySettings';
import ProxyListTable from './ProxyListTable.vue';
import ProxyEditDialog from './ProxyEditDialog.vue';
import SiteMappingEditDialog from './SiteMappingEditDialog.vue';

const s = provideProxySettings();
</script>

<template>
  <div class="proxy-settings-tab p-4 space-y-3">
    <div>
      <h3 class="text-sm font-medium text-moon/90 mb-1">代理设置</h3>
      <p class="text-xs text-moon/70">配置代理服务器，用于爬虫和网络工具访问网页</p>
    </div>
    <div class="space-y-2">
      <div class="proxy-toggle-row flex items-center justify-between gap-3">
        <label class="text-xs text-moon/80">启用代理</label>
        <ToggleSwitch :model-value="s.proxyEnabled.value" @update:model-value="s.setProxyEnabled" />
      </div>
      <p class="text-xs text-moon/60">启用后，爬虫和网络工具将使用代理服务器访问网页</p>
      <div v-if="s.proxyEnabled.value" class="space-y-2 mt-2">
        <div class="proxy-toggle-row flex items-center justify-between gap-3">
          <label class="text-xs text-moon/80">自动切换代理服务</label>
          <ToggleSwitch
            :model-value="s.proxyAutoSwitch.value"
            @update:model-value="s.setProxyAutoSwitch"
          />
        </div>
        <p class="text-xs text-moon/60">启用后，当代理服务遇到错误时会自动切换到下一个可用的代理服务</p>
        <div
          v-if="s.proxyAutoSwitch.value"
          class="proxy-toggle-row flex items-center justify-between gap-3"
        >
          <label class="text-xs text-moon/80">自动添加映射</label>
          <ToggleSwitch
            :model-value="s.proxyAutoAddMapping.value"
            @update:model-value="s.setProxyAutoAddMapping"
          />
        </div>
        <p v-if="s.proxyAutoSwitch.value" class="text-xs text-moon/60">
          启用后，当自动切换代理成功时会自动记录到网站-代理映射中
        </p>
        <label class="text-xs text-moon/80">选择代理服务</label>
        <Select
          :model-value="s.selectedProxyId.value"
          :options="s.proxyList.value"
          option-label="name"
          option-value="id"
          placeholder="选择代理服务"
          class="w-full"
          @update:model-value="s.handleProxyChange"
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
            :model-value="s.proxyUrl.value"
            placeholder="http://abc.xyz?url={url}"
            class="w-full"
            :disabled="s.urlDisabled.value"
            @update:model-value="s.onProxyUrlInput"
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
            <Button label="添加代理" size="small" class="w-full sm:w-auto" @click="s.openAddProxyDialog" />
          </div>

          <ProxyListTable />
        </div>
      </div>
    </div>

    <!-- 网站-代理映射管理 -->
    <div v-if="s.proxyEnabled.value" class="space-y-2 mt-4 pt-4 border-t border-moon/20">
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
            v-model="s.newSiteInput.value"
            placeholder="网站域名或URL（如：kakuyomu.jp 或 https://www.kakuyomu.jp）"
            class="w-full sm:flex-1"
          />
          <Select
            v-model="s.newProxyInput.value"
            :options="s.proxyList.value"
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
            :disabled="s.addMappingDisabled.value"
            @click="s.addSiteMapping"
          />
        </div>
      </div>

      <!-- 映射列表 -->
      <div v-if="s.hasSiteMappings.value" class="mt-3">
        <div class="proxy-table-wrapper">
          <DataTable
            :value="s.siteMappingEntries.value"
            :paginator="s.mappingPaginator.value"
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
                  @update:model-value="(value: boolean) => s.toggleSiteMappingEnabled(data.site, value)"
                />
              </template>
            </Column>
            <Column field="proxies" header="代理列表" class="text-xs">
              <template #body="{ data }">
                <div class="flex flex-wrap gap-1">
                  <Tag
                    v-for="(proxy, index) in data.proxies"
                    :key="index"
                    :value="s.getProxyDisplayName(proxy)"
                    :severity="s.mappingTagSeverity(data.enabled)"
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
                    @click="s.openEditSiteMappingDialog(data.site)"
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
    <ProxyEditDialog />

    <!-- 编辑网站映射对话框 -->
    <SiteMappingEditDialog />
  </div>
</template>

<style>
.proxy-table-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

@media (max-width: 640px) {
  .proxy-toggle-row {
    align-items: flex-start;
  }

  .proxy-toggle-row .p-toggleswitch {
    margin-left: auto;
  }
}
</style>
