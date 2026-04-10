<script setup lang="ts">
import { computed } from 'vue';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { AI_WORKFLOW_STATUS_LABELS } from 'src/constants/ai';

const props = defineProps<{
  task: AIProcessingTask;
  formatDuration: (startTime: number, endTime?: number) => string;
}>();

const taskStatusLabels: Record<string, string> = {
  thinking: '思考中',
  processing: '处理中',
  end: '已完成',
  error: '错误',
  cancelled: '已取消',
};

const isActive = computed(() =>
  props.task.status === 'thinking' || props.task.status === 'processing',
);

const isComplete = computed(() => props.task.status === 'end');

const statusLabel = computed(() => {
  if (props.task.workflowStatus) {
    return AI_WORKFLOW_STATUS_LABELS[props.task.workflowStatus] || props.task.workflowStatus;
  }
  return taskStatusLabels[props.task.status] || props.task.status;
});

const progress = computed(() => props.task.progress);

const percent = computed(() => {
  if (!progress.value || progress.value.total <= 0) return 0;
  return Math.max(0, Math.min(100, (progress.value.current / progress.value.total) * 100));
});

const hasProgress = computed(() => progress.value && progress.value.total > 0);
</script>

<template>
  <div class="status-bar">
    <div class="status-row">
      <span class="status-model">{{ task.modelName }}</span>
      <span class="status-stage" :class="{ active: isActive, error: task.status === 'error' }">
        {{ statusLabel }}
      </span>
      <span class="status-time">{{ formatDuration(task.startTime, task.endTime) }}</span>
    </div>
    <div v-if="isActive || isComplete" class="progress-track">
      <div
        class="progress-fill"
        :class="{ active: isActive, complete: isComplete }"
        :style="{ width: hasProgress ? `${percent}%` : (isComplete ? '100%' : '0%') }"
      />
    </div>
    <div v-if="hasProgress" class="progress-label">
      <span class="progress-chunks">{{ progress!.current }} / {{ progress!.total }} 块</span>
      <span class="progress-percent" :class="{ complete: isComplete }">
        {{ isComplete ? '完成' : `${Math.round(percent)}%` }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.status-bar {
  padding: 14px 16px;
  border-bottom: 1px solid var(--white-opacity-5);
  flex-shrink: 0;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.status-model {
  font-size: 0.72rem;
  font-weight: 500;
  color: rgba(253, 253, 255, 0.7);
  font-family: var(--font-mono, monospace);
  background: rgba(255, 255, 255, 0.05);
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.status-stage {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--moon-opacity-50);
  flex: 1;
}

.status-stage.active {
  color: #6c8cff;
}

.status-stage.error {
  color: var(--red-500);
}

.status-time {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--moon-opacity-50);
  font-family: var(--font-mono, monospace);
}

.progress-track {
  height: 5px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.4s ease;
}

.progress-fill.active {
  background: linear-gradient(90deg, #4f6ef7, #8ba4ff);
  box-shadow: 0 0 12px rgba(108, 140, 255, 0.3);
  position: relative;
}

.progress-fill.active::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 40px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2));
  animation: shimmer 1.5s ease-in-out infinite;
}

@keyframes shimmer {
  0%, 100% { opacity: 0; }
  50% { opacity: 1; }
}

.progress-fill.complete {
  background: linear-gradient(90deg, var(--green-500), var(--green-500-opacity-80, #6ee7a0));
}

.progress-label {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
}

.progress-chunks {
  font-size: 0.6875rem;
  color: var(--moon-opacity-50);
  font-family: var(--font-mono, monospace);
  font-weight: 500;
}

.progress-percent {
  font-size: 0.6875rem;
  color: #6c8cff;
  font-family: var(--font-mono, monospace);
  font-weight: 600;
}

.progress-percent.complete {
  color: var(--green-500);
}
</style>
