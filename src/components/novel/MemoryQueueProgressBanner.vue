<script setup lang="ts">
import { useI18n } from 'vue-i18n';

import Button from 'primevue/button';
import type { EmbeddingQueueProgress } from 'src/services/embedding-queue';
const { t } = useI18n();

// 嵌入队列进度横幅：把 spinner/eta/暂停按钮的多重条件收敛到叶子组件。
defineProps<{
  queueProgress: EmbeddingQueueProgress;
  etaLabel: string;
  progressPercent: number;
}>();

defineEmits<{ togglePause: [] }>();
</script>

<template>
  <div
    class="flex items-center gap-3 px-6 py-2 bg-blue-500/10 border-b border-blue-500/20 flex-none"
  >
    <span v-if="!queueProgress.paused" class="pi pi-spin pi-spinner text-blue-400" />
    <span v-else class="pi pi-pause text-amber-400" />
    <span class="text-sm text-moon/80 flex-1">
      {{
        t('memoryUi.queueProgress', {
          completed: queueProgress.completed,
          total: queueProgress.total,
        })
      }}
      <span v-if="etaLabel" class="text-moon/50 ml-2">{{ etaLabel }}</span>
    </span>
    <span class="text-xs text-moon/50 tabular-nums">{{ progressPercent }}%</span>
    <Button
      :label="queueProgress.paused ? t('memoryUi.resume') : t('memoryUi.pause')"
      :icon="queueProgress.paused ? 'pi pi-play' : 'pi pi-pause'"
      size="small"
      severity="secondary"
      text
      :disabled="queueProgress.paused && queueProgress.syncGated"
      @click="$emit('togglePause')"
    />
  </div>
</template>
