<script setup lang="ts">
/**
 * 代理设置 · 添加 / 编辑代理对话框。
 * 从 ProxySettingsTab 抽出以降低其模板复杂度。状态来自 injectProxySettings()。
 */
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
import { injectProxySettings } from 'src/composables/settings/useProxySettings';

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
        <label class="text-xs text-moon/80 mb-1 block">名称</label>
        <InputText v-model="s.newProxyName.value" placeholder="代理服务名称" class="w-full" />
      </div>
      <div>
        <label class="text-xs text-moon/80 mb-1 block">URL</label>
        <InputText v-model="s.newProxyUrl.value" placeholder="http://abc.xyz?url={url}" class="w-full" />
        <p class="text-xs text-moon/60 mt-1">其中 {url} 会被替换为实际要请求的 URL</p>
      </div>
      <div>
        <label class="text-xs text-moon/80 mb-1 block">描述（可选）</label>
        <InputText v-model="s.newProxyDescription.value" placeholder="代理服务描述" class="w-full" />
      </div>
      <div class="flex justify-end gap-2">
        <Button label="取消" size="small" text @click="s.showProxyDialog.value = false" />
        <Button
          label="保存"
          size="small"
          :disabled="!s.newProxyName.value.trim() || !s.newProxyUrl.value.trim()"
          @click="s.saveProxy"
        />
      </div>
    </div>
  </AdaptiveDialog>
</template>
