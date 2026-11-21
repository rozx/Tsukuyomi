<script setup lang="ts">
/**
 * 网站映射标签页（Web 与 Electron 均显示）：自动添加映射开关 + 网站映射表。
 * 映射条目可选 CORS 代理或 Firecrawl；Electron 直连网站，只有 Firecrawl 条目生效。
 * 业务状态由 useSiteMappingSettings 持有并 provide，编辑对话框通过 inject 取同一份状态。
 */
import InputText from 'primevue/inputtext';
import ToggleSwitch from 'primevue/toggleswitch';
import SettingsPanel from './form/SettingsPanel.vue';
import SettingsSection from './form/SettingsSection.vue';
import SettingsToggleRow from './form/SettingsToggleRow.vue';
import SettingsStatus from './form/SettingsStatus.vue';
import Select from 'primevue/select';
import Button from 'primevue/button';
import ProxyOptionLabel from './ProxyOptionLabel.vue';
import Tag from 'primevue/tag';
import { provideSiteMappingSettings } from 'src/composables/settings/useSiteMappingSettings';
import SiteMappingEditDialog from './SiteMappingEditDialog.vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const s = provideSiteMappingSettings();
</script>

<template>
  <SettingsPanel>
    <SettingsSection :title="t('settingsUi.sites.title')">
      <template #description>
        {{ t('settingsUi.sites.description') }}
        <template v-if="s.electron">{{ t('settingsUi.sites.electronHint') }}</template>
        <template v-else>{{ t('settingsUi.sites.webHint') }}</template>
      </template>

      <SettingsToggleRow
        :label="t('settingsUi.sites.autoAdd')"
        :model-value="s.autoAddMapping.value"
        :disabled="s.autoAddDisabled.value"
        @update:model-value="s.setAutoAddMapping"
      >
        <template #hint>
          <SettingsStatus v-if="s.autoAddDisabled.value" tone="warn">
            {{ t('settingsUi.sites.autoAddDisabled') }}
          </SettingsStatus>
          <template v-else>{{ t('settingsUi.sites.autoAddHint') }}</template>
        </template>
      </SettingsToggleRow>

      <div class="site-mapping-add-row">
        <InputText
          v-model="s.newSiteInput.value"
          :placeholder="t('settingsUi.sites.domainPlaceholder')"
          :aria-label="t('settingsUi.sites.site')"
          class="site-mapping-add-input"
        />
        <Select
          v-model="s.newProxyInput.value"
          :options="s.mappingOptions.value"
          option-label="name"
          option-value="id"
          :placeholder="t('settingsUi.sites.methodPlaceholder')"
          class="site-mapping-add-input"
        >
          <template #option="slotProps">
            <ProxyOptionLabel
              :name="slotProps.option.name"
              :description="slotProps.option.description"
            />
          </template>
        </Select>
        <Button
          :label="t('settingsUi.sites.add')"
          icon="pi pi-plus"
          :disabled="s.addMappingDisabled.value"
          @click="s.addSiteMapping"
        />
      </div>

      <div v-if="s.hasSiteMappings.value" class="site-mapping-table-wrapper">
        <DataTable
          :value="s.siteMappingEntries.value"
          :paginator="s.mappingPaginator.value"
          :rows="5"
          class="proxy-data-table text-xs"
          tableStyle="min-width: 38rem"
        >
          <Column
            field="site"
            :header="t('settingsUi.sites.site')"
            class="text-xs"
            style="width: 150px"
          >
            <template #body="{ data }">
              <span class="font-medium">{{ data.site }}</span>
            </template>
          </Column>
          <Column :header="t('settingsUi.sites.enabled')" class="text-xs" style="width: 80px">
            <template #body="{ data }">
              <ToggleSwitch
                :model-value="data.enabled"
                @update:model-value="
                  (value: boolean) => s.toggleSiteMappingEnabled(data.site, value)
                "
              />
            </template>
          </Column>
          <Column field="proxies" :header="t('settingsUi.sites.methods')" class="text-xs">
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
          <Column :header="t('settingsUi.sites.actions')" class="text-xs" style="width: 120px">
            <template #body="{ data }">
              <div class="flex gap-1 flex-nowrap justify-start sm:justify-end">
                <Button
                  icon="pi pi-pencil"
                  size="small"
                  severity="secondary"
                  text
                  rounded
                  :title="t('settingsUi.sites.edit')"
                  @click="s.openEditSiteMappingDialog(data.site)"
                />
                <Button
                  icon="pi pi-trash"
                  size="small"
                  severity="danger"
                  text
                  rounded
                  :aria-label="t('settingsUi.sites.delete')"
                  :title="t('settingsUi.sites.delete')"
                  @click="s.deleteSiteMapping(data.site)"
                />
              </div>
            </template>
          </Column>
        </DataTable>
      </div>
      <p v-else class="site-mapping-empty">
        {{ t('settingsUi.sites.empty') }}
      </p>
    </SettingsSection>

    <SiteMappingEditDialog />
  </SettingsPanel>
</template>

<style scoped>
.site-mapping-add-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.site-mapping-add-input {
  flex: 1 1 14rem;
  min-width: 0;
}

.site-mapping-table-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.site-mapping-empty {
  margin: 0;
  font-size: 0.76rem;
  font-style: italic;
  color: var(--moon-50-opacity-58);
}

@media (max-width: 640px) {
  .site-mapping-add-row > * {
    flex: 1 1 100%;
  }
}
</style>
