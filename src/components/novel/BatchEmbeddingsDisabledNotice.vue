<script setup lang="ts">
import { useI18n } from 'vue-i18n';

import Button from 'primevue/button';
const { t } = useI18n();

// 嵌入功能未启用提示：移动端/桌面端两套文案 + 前往设置按钮。
defineProps<{
  isMobile: boolean;
}>();

defineEmits<{ openSettings: [] }>();
</script>

<template>
  <div class="flex flex-col gap-2 p-3 bg-moon/5 border border-moon/10 rounded text-xs text-moon-50">
    <div class="flex items-start gap-2">
      <i class="pi pi-info-circle mt-0.5 text-amber-300 shrink-0"></i>
      <div class="flex-1 min-w-0">
        <template v-if="isMobile">
          <div class="font-medium text-moon-100">{{ t('embeddingUi.mobileUnsupported') }}</div>
          <p class="mt-1">
            {{ t('embeddingUi.mobileHint') }}
          </p>
        </template>
        <template v-else>
          <div class="font-medium text-moon-100">{{ t('embeddingUi.notEnabled') }}</div>
          <p class="mt-1">
            {{ t('embeddingUi.enableHint') }}
          </p>
        </template>
      </div>
    </div>
    <Button
      v-if="!isMobile"
      :label="t('embeddingUi.openSettings')"
      size="small"
      severity="primary"
      icon="pi pi-cog"
      class="w-full"
      @click="$emit('openSettings')"
    />
  </div>
</template>
