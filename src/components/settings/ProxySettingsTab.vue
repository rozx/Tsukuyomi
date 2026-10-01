<script setup lang="ts">
/**
 * 代理设置标签页（仅 Web）：启用代理 / 默认代理 / 代理列表。网站映射见 SiteMappingSettingsTab。
 *
 * 业务状态由 useProxySettings 统一持有并 provide；代理列表与编辑对话框通过
 * injectProxySettings() 取同一份状态。本文件保留全部代理样式（非 scoped），因为 proxy- 前缀仅在本页使用。
 */
import InputText from 'primevue/inputtext';
import ToggleSwitch from 'primevue/toggleswitch';
import Select from 'primevue/select';
import Button from 'primevue/button';
import ProxyOptionLabel from './ProxyOptionLabel.vue';
import { provideProxySettings } from 'src/composables/settings/useProxySettings';
import ProxyListTable from './ProxyListTable.vue';
import ProxyEditDialog from './ProxyEditDialog.vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const s = provideProxySettings();
</script>

<template>
  <div class="proxy-settings-tab p-4 space-y-3">
    <div>
      <h3 class="text-sm font-medium text-moon/90 mb-1">{{ t('settingsUi.proxy.title') }}</h3>
      <p class="text-xs text-moon/70">{{ t('settingsUi.proxy.description') }}</p>
    </div>
    <div class="space-y-2">
      <div class="proxy-toggle-row flex items-center justify-between gap-3">
        <label class="text-xs text-moon/80">{{ t('settingsUi.proxy.enable') }}</label>
        <ToggleSwitch :model-value="s.proxyEnabled.value" @update:model-value="s.setProxyEnabled" />
      </div>
      <p class="text-xs text-moon/60">{{ t('settingsUi.proxy.enableHint') }}</p>
      <div v-if="s.proxyEnabled.value" class="space-y-2 mt-2">
        <label class="text-xs text-moon/80">{{ t('settingsUi.proxy.select') }}</label>
        <Select
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
        <div class="space-y-2">
          <label class="text-xs text-moon/80">{{ t('settingsUi.proxy.url') }}</label>
          <InputText
            :model-value="s.proxyUrl.value"
            placeholder="http://abc.xyz?url={url}"
            class="w-full"
            :disabled="s.urlDisabled.value"
            @update:model-value="s.onProxyUrlInput"
          />
        </div>
        <p class="text-xs text-moon/60">
          {{ t('settingsUi.proxy.urlFormat') }}
        </p>

        <!-- 代理列表管理 -->
        <div class="space-y-2 mt-4 pt-4 border-t border-moon/20">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 class="text-sm font-medium text-moon/90 mb-1">
                {{ t('settingsUi.proxy.list') }}
              </h4>
              <p class="text-xs text-moon/70">{{ t('settingsUi.proxy.listHint') }}</p>
            </div>
            <Button
              :label="t('settingsUi.proxy.add')"
              size="small"
              class="w-full sm:w-auto"
              @click="s.openAddProxyDialog"
            />
          </div>

          <ProxyListTable />
        </div>
      </div>
    </div>

    <!-- 添加/编辑代理对话框 -->
    <ProxyEditDialog />
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
