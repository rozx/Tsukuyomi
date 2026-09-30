<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { computed } from 'vue';

import Button from 'primevue/button';
const { t } = useI18n();

// Embedding 空间升级横幅：存在 stale 向量时提示并提供一键重建。
const props = defineProps<{
  chapterStale: number;
  memoryStale: number;
  disabled: boolean;
}>();

defineEmits<{ rebuild: [] }>();
const staleItems = computed(() =>
  [
    props.chapterStale > 0 ? t('embeddingUi.staleChapters', { count: props.chapterStale }) : '',
    props.memoryStale > 0 ? t('embeddingUi.staleMemories', { count: props.memoryStale }) : '',
  ]
    .filter(Boolean)
    .join(' / '),
);
</script>

<template>
  <div
    class="flex flex-col gap-2 p-3 rounded text-xs bg-amber-500/10 border border-amber-500/30 text-amber-200"
  >
    <div class="flex items-start gap-2">
      <i class="pi pi-exclamation-triangle mt-0.5 text-amber-300 shrink-0"></i>
      <div class="flex-1 min-w-0">
        <div class="font-medium text-amber-100">{{ t('embeddingUi.upgraded') }}</div>
        <p class="mt-1 leading-relaxed text-amber-200/90">
          {{ t('embeddingUi.staleHint', { items: staleItems }) }}
        </p>
      </div>
    </div>
    <Button
      :label="t('embeddingUi.rebuildNow')"
      size="small"
      severity="warn"
      icon="pi pi-sync"
      class="w-full"
      :disabled="disabled"
      @click="$emit('rebuild')"
    />
  </div>
</template>
