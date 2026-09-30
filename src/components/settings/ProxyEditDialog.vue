<script setup lang="ts">
/**
 * 代理设置 · 添加 / 编辑代理对话框。
 * 从 ProxySettingsTab 抽出以降低其模板复杂度。状态来自 injectProxySettings()。
 */
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
import { injectProxySettings } from 'src/composables/settings/useProxySettings';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const s = injectProxySettings();
</script>

<template>
  <AdaptiveDialog
    v-model:visible="s.showProxyDialog.value"
    :header="s.proxyDialogHeader.value"
    desktop-width="min(500px, 92vw)"
    eyebrow="PROXY"
  >
    <div class="space-y-3">
      <div>
        <label class="text-xs text-moon/80 mb-1 block">{{ t('settingsUi.proxy.name') }}</label>
        <InputText
          v-model="s.newProxyName.value"
          :placeholder="t('settingsUi.proxy.namePlaceholder')"
          class="w-full"
        />
      </div>
      <div>
        <label class="text-xs text-moon/80 mb-1 block">URL</label>
        <InputText
          v-model="s.newProxyUrl.value"
          placeholder="http://abc.xyz?url={url}"
          class="w-full"
        />
        <p class="text-xs text-moon/60 mt-1">{{ t('settingsUi.proxy.urlReplaced') }}</p>
      </div>
      <div>
        <label class="text-xs text-moon/80 mb-1 block">{{
          t('settingsUi.proxy.optionalDescription')
        }}</label>
        <InputText
          v-model="s.newProxyDescription.value"
          :placeholder="t('settingsUi.proxy.descriptionPlaceholder')"
          class="w-full"
        />
      </div>
      <div class="flex justify-end gap-2">
        <Button
          :label="t('settingsUi.common.cancel')"
          size="small"
          text
          @click="s.showProxyDialog.value = false"
        />
        <Button
          :label="t('settingsUi.common.save')"
          size="small"
          :disabled="!s.newProxyName.value.trim() || !s.newProxyUrl.value.trim()"
          @click="s.saveProxy"
        />
      </div>
    </div>
  </AdaptiveDialog>
</template>
