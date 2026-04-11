<script setup lang="ts">
import { computed } from 'vue';
import type { TaskStatus } from 'src/services/ai/tasks/utils/task-types';

const props = defineProps<{
  fromStatus: string;
  toStatus: string;
}>();

// 用 Record<TaskStatus, ...> 强制穷尽所有工作流状态：若 TaskStatus 新增值，编译器会报错
const STATUS_LABELS: Record<TaskStatus, string> = {
  planning: '规划',
  preparing: '准备',
  working: '工作',
  review: '复核',
  end: '完成',
};

const STATUS_ICONS: Record<TaskStatus, string> = {
  planning: 'pi-compass',
  preparing: 'pi-cog',
  working: 'pi-bolt',
  review: 'pi-search',
  end: 'pi-check-circle',
};

function getLabel(status: string): string {
  return STATUS_LABELS[status as TaskStatus] ?? status;
}

function getIcon(status: string): string {
  return STATUS_ICONS[status as TaskStatus] ?? 'pi-sync';
}

const fromLabel = computed(() => getLabel(props.fromStatus));
const toLabel = computed(() => getLabel(props.toStatus));
const toIcon = computed(() => getIcon(props.toStatus));
</script>

<template>
  <div class="state-transition" role="status">
    <span class="state-transition-line" />
    <span class="state-transition-badge">
      <i class="pi" :class="toIcon" />
      <span class="state-transition-text">
        <span class="state-from">{{ fromLabel }}</span>
        <i class="pi pi-arrow-right state-arrow" />
        <span class="state-to">{{ toLabel }}</span>
      </span>
    </span>
    <span class="state-transition-line" />
  </div>
</template>

<style scoped>
.state-transition {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 16px 0;
}

.state-transition-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(168, 132, 255, 0.28), transparent);
}

.state-transition-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  border-radius: 999px;
  background: rgba(168, 132, 255, 0.1);
  border: 1px solid rgba(168, 132, 255, 0.25);
  color: #c4a6ff;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  font-family: var(--font-mono, monospace);
  box-shadow: 0 0 12px rgba(168, 132, 255, 0.08);
}

.state-transition-badge > i:first-child {
  font-size: 0.6875rem;
}

.state-transition-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.state-from {
  color: rgba(196, 166, 255, 0.55);
}

.state-arrow {
  font-size: 0.625rem;
  color: rgba(196, 166, 255, 0.6);
}

.state-to {
  color: #d4b8ff;
}
</style>
