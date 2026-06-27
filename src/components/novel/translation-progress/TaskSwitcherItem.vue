<script setup lang="ts">
import type { AIProcessingTask } from 'src/stores/ai-processing';

// 任务下拉项：纯展示组件，由 TaskSwitcher 在 v-for 中渲染。
// 把单个条目的多分支 class/状态逻辑收敛到这里，降低父模板的圈复杂度。
defineProps<{
  task: AIProcessingTask;
  isSelected: boolean;
  hasUnseen: boolean;
  isActive: (task: AIProcessingTask) => boolean;
  typeLabel: (task: AIProcessingTask) => string;
  chapterLabel: (task: AIProcessingTask) => string | null;
  duration: (task: AIProcessingTask) => string;
  statusLabel: (task: AIProcessingTask) => string;
}>();

defineEmits<{ select: [taskId: string] }>();
</script>

<template>
  <button class="dropdown-item" :class="{ selected: isSelected }" @click="$emit('select', task.id)">
    <span
      class="switcher-dot"
      :class="{ active: isActive(task), completed: task.status === 'end' }"
    />
    <div class="dropdown-item-info">
      <span class="dropdown-item-type">{{ typeLabel(task) }}</span>
      <span class="dropdown-item-title">{{ chapterLabel(task) || '未知章节' }}</span>
    </div>
    <span class="dropdown-item-duration">{{ duration(task) }}</span>
    <span
      class="dropdown-item-badge"
      :class="{ active: isActive(task), done: task.status === 'end', error: task.status === 'error' }"
      >{{ statusLabel(task) }}</span
    >
    <span v-if="hasUnseen" class="notification-dot" />
  </button>
</template>

<style scoped>
/* 状态圆点 + pulse-dot 动画与 TaskSwitcher 共用，见 task-switcher-dot.css */
@import './task-switcher-dot.css';

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 7px;
  cursor: pointer;
  transition: background 0.12s;
  width: 100%;
  border: none;
  background: transparent;
  font-family: inherit;
  color: inherit;
}

.dropdown-item:hover {
  background: var(--white-opacity-8);
}

.dropdown-item.selected {
  background: var(--primary-opacity-10);
}

.dropdown-item-info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-align: left;
}

.dropdown-item-type {
  display: block;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--moon-opacity-50);
}

.dropdown-item-title {
  display: block;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--moon-opacity-90);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-item-duration {
  font-size: 0.6875rem;
  color: var(--moon-opacity-50);
  font-family: var(--font-mono, monospace);
  font-weight: 500;
  flex-shrink: 0;
}

.dropdown-item-badge {
  font-size: 0.625rem;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
  flex-shrink: 0;
  background: var(--white-opacity-5);
  color: var(--moon-opacity-60);
}

.dropdown-item-badge.active {
  background: rgba(108, 140, 255, 0.15);
  color: #6c8cff;
}

.dropdown-item-badge.done {
  background: var(--green-500-opacity-10);
  color: var(--green-500);
}

.dropdown-item-badge.error {
  background: var(--red-500-opacity-10);
  color: var(--red-500);
}

.notification-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--orange-500);
  flex-shrink: 0;
  animation: pulse-dot 1.5s ease-in-out infinite;
}
</style>
