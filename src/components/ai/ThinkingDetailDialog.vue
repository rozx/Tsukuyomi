<script setup lang="ts">
import { computed } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { TASK_TYPE_LABELS } from 'src/constants/ai';
import { formatTaskDuration } from 'src/utils';

const props = defineProps<{
  visible: boolean;
  task: AIProcessingTask | null;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
}>();

const statusLabels: Record<string, string> = {
  thinking: '思考中',
  processing: '处理中',
  end: '已完成',
  error: '错误',
  cancelled: '已取消',
};

const headerText = computed(() => {
  if (!props.task) return '思考过程';
  const typeLabel = TASK_TYPE_LABELS[props.task.type] || props.task.type;
  return `${props.task.modelName} · ${typeLabel}`;
});

const handleClose = () => {
  emit('update:visible', false);
};
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :draggable="false"
    :closable="true"
    :style="{ width: 'min(48rem, 94vw)' }"
    :content-style="{ display: 'flex', flexDirection: 'column', padding: '0' }"
    :header="headerText"
    @update:visible="handleClose"
  >
    <div v-if="task" class="thinking-detail-body">
      <div class="thinking-detail-meta">
        <span class="meta-pill" :class="`status-${task.status}`">
          {{ statusLabels[task.status] || task.status }}
        </span>
        <span class="meta-text">运行时间 {{ formatTaskDuration(task.startTime, task.endTime) }}</span>
        <span v-if="task.endTime" class="meta-text">
          · 完成于 {{ new Date(task.endTime).toLocaleString('zh-CN') }}
        </span>
      </div>

      <div v-if="task.thinkingMessage && task.thinkingMessage.trim()" class="thinking-detail-scroll">
        <pre class="thinking-detail-text">{{ task.thinkingMessage }}</pre>
      </div>
      <div v-else class="thinking-detail-empty">
        <i class="pi pi-info-circle" />
        <span>该任务暂无思考过程记录</span>
      </div>
    </div>

    <template #footer>
      <Button label="关闭" icon="pi pi-times" text severity="secondary" @click="handleClose" />
    </template>
  </Dialog>
</template>

<style scoped>
.thinking-detail-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: min(70dvh, 600px);
  padding: 1rem 1.25rem 0.5rem;
  gap: 0.75rem;
}

.thinking-detail-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--moon-opacity-60);
  flex-shrink: 0;
}

.meta-pill {
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.6875rem;
  background: var(--white-opacity-8);
  color: var(--moon-opacity-80);
}

.meta-pill.status-thinking,
.meta-pill.status-processing {
  background: var(--blue-500-opacity-15, rgba(108, 140, 255, 0.15));
  color: var(--blue-500, #6c8cff);
}

.meta-pill.status-end {
  background: var(--green-500-opacity-10, rgba(74, 222, 128, 0.12));
  color: var(--green-500, #4ade80);
}

.meta-pill.status-error {
  background: var(--red-500-opacity-10, rgba(248, 113, 113, 0.12));
  color: var(--red-500, #f87171);
}

.meta-pill.status-cancelled {
  background: var(--orange-400-opacity-12, rgba(251, 146, 60, 0.12));
  color: var(--orange-400, #fb923c);
}

.meta-text {
  font-family: var(--font-mono, monospace);
}

.thinking-detail-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0.75rem 0.875rem;
  border-radius: 8px;
  background: var(--white-opacity-3, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--white-opacity-5, rgba(255, 255, 255, 0.05));
}

.thinking-detail-scroll::-webkit-scrollbar {
  width: 6px;
}

.thinking-detail-scroll::-webkit-scrollbar-thumb {
  background: var(--white-opacity-10, rgba(255, 255, 255, 0.1));
  border-radius: 3px;
}

.thinking-detail-text {
  margin: 0;
  font-family: inherit;
  font-size: 0.8125rem;
  line-height: 1.7;
  color: var(--moon-opacity-80);
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.thinking-detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 3rem 1rem;
  color: var(--moon-opacity-50);
  font-size: 0.875rem;
}

@media (max-width: 640px) {
  .thinking-detail-body {
    padding: 0.75rem 0.875rem 0.5rem;
    max-height: 75dvh;
  }

  .thinking-detail-text {
    font-size: 0.75rem;
  }
}
</style>
