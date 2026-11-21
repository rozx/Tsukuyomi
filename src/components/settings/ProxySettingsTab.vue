<script setup lang="ts">
/**
 * 代理设置标签页（仅 Web）：启用代理 / 默认代理 / 代理列表。网站映射见 SiteMappingSettingsTab。
 *
 * 业务状态由 useProxySettings 统一持有并 provide；代理列表与编辑对话框通过
 * injectProxySettings() 取同一份状态。本文件保留全部代理样式（非 scoped），因为 proxy- 前缀仅在本页使用。
 */
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Button from 'primevue/button';
import ProxyOptionLabel from './ProxyOptionLabel.vue';
import { provideProxySettings } from 'src/composables/settings/useProxySettings';
import ProxyListTable from './ProxyListTable.vue';
import ProxyEditDialog from './ProxyEditDialog.vue';
import SettingsPanel from './form/SettingsPanel.vue';
import SettingsSection from './form/SettingsSection.vue';
import SettingsField from './form/SettingsField.vue';
import SettingsToggleRow from './form/SettingsToggleRow.vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const s = provideProxySettings();
</script>

<template>
  <SettingsPanel>
    <SettingsSection
      :title="t('settingsUi.proxy.title')"
      :description="t('settingsUi.proxy.description')"
    >
      <SettingsToggleRow
        :label="t('settingsUi.proxy.enable')"
        :hint="t('settingsUi.proxy.enableHint')"
        :model-value="s.proxyEnabled.value"
        @update:model-value="s.setProxyEnabled"
      />
      <template v-if="s.proxyEnabled.value">
        <SettingsField :label="t('settingsUi.proxy.select')" input-id="proxy-select">
          <Select
            input-id="proxy-select"
            :model-value="s.selectedProxyId.value"
            :options="s.proxyList.value"
            option-label="name"
            option-value="id"
            :placeholder="t('settingsUi.proxy.select')"
            class="w-full"
            @update:model-value="s.handleProxyChange"
          >
            <template #option="slotProps">
              <ProxyOptionLabel
                :name="slotProps.option.name"
                :description="slotProps.option.description"
              />
            </template>
          </Select>
        </SettingsField>
        <SettingsField
          :label="t('settingsUi.proxy.url')"
          input-id="proxy-url"
          :hint="t('settingsUi.proxy.urlFormat')"
        >
          <InputText
            id="proxy-url"
            :model-value="s.proxyUrl.value"
            placeholder="http://abc.xyz?url={url}"
            class="w-full"
            :disabled="s.urlDisabled.value"
            @update:model-value="s.onProxyUrlInput"
          />
        </SettingsField>
      </template>
    </SettingsSection>

    <!-- 代理列表管理 -->
    <SettingsSection
      v-if="s.proxyEnabled.value"
      :title="t('settingsUi.proxy.list')"
      :description="t('settingsUi.proxy.listHint')"
    >
      <template #header-actions>
        <Button
          :label="t('settingsUi.proxy.add')"
          icon="pi pi-plus"
          size="small"
          @click="s.openAddProxyDialog"
        />
      </template>
      <ProxyListTable />
    </SettingsSection>

    <!-- 添加/编辑代理对话框 -->
    <ProxyEditDialog />
  </SettingsPanel>
</template>

<style>
.proxy-table-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
</style>
