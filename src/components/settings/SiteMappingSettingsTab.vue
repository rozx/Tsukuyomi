<script setup lang="ts">
/**
 * 网站映射标签页（Web 与 Electron 均显示）：自动添加映射开关 + 网站映射表。
 * 映射条目可选 CORS 代理或 Firecrawl；Electron 直连网站，只有 Firecrawl 条目生效。
 * 业务状态由 useSiteMappingSettings 持有并 provide，编辑对话框通过 inject 取同一份状态。
 */
import InputText from 'primevue/inputtext';
import ToggleSwitch from 'primevue/toggleswitch';
import Select from 'primevue/select';
import Button from 'primevue/button';
import ProxyOptionLabel from './ProxyOptionLabel.vue';
import Tag from 'primevue/tag';
import { provideSiteMappingSettings } from 'src/composables/settings/useSiteMappingSettings';
import SiteMappingEditDialog from './SiteMappingEditDialog.vue';

const s = provideSiteMappingSettings();
</script>

<template>
  <div class="site-mapping-tab p-4 space-y-3">
    <div>
      <h3 class="text-sm font-medium text-moon/90 mb-1">网站映射</h3>
      <p class="text-xs text-moon/70">
        为特定网站指定抓取方式，按顺序优先使用。
        <template v-if="s.electron">桌面端直连网站，只有 Firecrawl 条目生效。</template>
        <template v-else>可选 CORS 代理或 Firecrawl。</template>
      </p>
    </div>

    <div class="space-y-1">
      <div class="site-mapping-toggle-row flex items-center justify-between gap-3">
        <label class="text-xs text-moon/80">仅 Firecrawl 可用时自动添加映射</label>
        <ToggleSwitch
          :model-value="s.autoAddMapping.value"
          :disabled="s.autoAddDisabled.value"
          @update:model-value="s.setAutoAddMapping"
        />
      </div>
      <p v-if="s.autoAddDisabled.value" class="text-xs text-amber-400">
        需要先在「API Keys」中启用 Firecrawl 回退
      </p>
      <p v-else class="text-xs text-moon/60">
        网站无法直接或经代理访问、改由 Firecrawl 抓取成功时，自动把 Firecrawl 置顶记入该网站的映射，之后直接使用
        Firecrawl。
      </p>
    </div>

    <div class="space-y-2 pt-4 border-t border-moon/20">
      <div class="flex flex-col gap-2 sm:flex-row">
        <InputText
          v-model="s.newSiteInput.value"
          placeholder="网站域名或URL（如：kakuyomu.jp 或 https://www.kakuyomu.jp）"
          class="w-full sm:flex-1"
        />
        <Select
          v-model="s.newProxyInput.value"
          :options="s.mappingOptions.value"
          option-label="name"
          option-value="id"
          placeholder="选择抓取方式"
          class="w-full sm:flex-1"
        >
          <template #option="slotProps">
            <ProxyOptionLabel
              :name="slotProps.option.name"
              :description="slotProps.option.description"
            />
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

    <div v-if="s.hasSiteMappings.value" class="mt-3">
      <div class="site-mapping-table-wrapper">
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
          <Column field="proxies" header="抓取方式（按顺序）" class="text-xs">
            <template #body="{ data }">
              <div class="flex flex-wrap gap-1">
                <Tag
                  v-for="(proxy, index) in data.proxies"
                  :key="index"
                  :value="s.getProxyDisplayName(proxy)"
                  :severity="s.mappingTagSeverity(data.enabled, proxy)"
                  :title="s.mappingTagTitle(proxy)"
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
                <Button
                  icon="pi pi-trash"
                  size="small"
                  severity="danger"
                  text
                  rounded
                  aria-label="删除映射"
                  title="删除映射"
                  @click="s.deleteSiteMapping(data.site)"
                />
              </div>
            </template>
          </Column>
        </DataTable>
      </div>
    </div>
    <p v-else class="text-xs text-moon/60 italic">
      暂无网站映射。开启自动添加后，只能经 Firecrawl 访问的网站会自动记录。
    </p>

    <SiteMappingEditDialog />
  </div>
</template>

<style>
.site-mapping-table-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

@media (max-width: 640px) {
  .site-mapping-toggle-row {
    align-items: flex-start;
  }

  .site-mapping-toggle-row .p-toggleswitch {
    margin-left: auto;
  }
}
</style>
