<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { TASK_TYPE_LABELS } from 'src/constants/ai';

const props = defineProps<{
  tasks: AIProcessingTask[];
  selectedTaskId: string | null;
  unseenActivity: Record<string, boolean>;
  getWorkingChapterLabel: (task: AIProcessingTask) => string | null;
  formatDuration: (startTime: number, endTime?: number) => string;
}>();

const emit = defineEmits<{
  select: [taskId: string];
}>();

const isOpen = ref(false);

const selectedTask = computed(() =>
  props.tasks.find((t) => t.id === props.selectedTaskId) ?? null,
);

const selectedIndex = computed(() => {
  if (!props.selectedTaskId) return -1;
  return props.tasks.findIndex((t) => t.id === props.selectedTaskId);
});

const taskTypeLabel = (task: AIProcessingTask) => {
  const key = task.type as keyof typeof TASK_TYPE_LABELS;
  return TASK_TYPE_LABELS[key] || task.type;
};

const isActive = (task: AIProcessingTask) =>
  task.status === 'thinking' || task.status === 'processing';

const statusLabel = (task: AIProcessingTask) => {
  if (isActive(task)) return '进行中';
  if (task.status === 'end') return '已完成';
  if (task.status === 'error') return '错误';
  if (task.status === 'cancelled') return '已取消';
  return task.status;
};

const select = (taskId: string) => {
  emit('select', taskId);
  isOpen.value = false;
};

const toggleDropdown = () => {
  isOpen.value = !isOpen.value;
};

const switcherRef = ref<HTMLElement | null>(null);

const handleOutsideClick = (e: MouseEvent) => {
  if (isOpen.value && switcherRef.value && !switcherRef.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleOutsideClick);
});

onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick);
});
</script>

<template>
  <div v-if="tasks.length > 0" ref="switcherRef" class="task-switcher">
    <button class="switcher-trigger" @click="toggleDropdown">
      <span
        class="switcher-dot"
        :class="{ active: selectedTask && isActive(selectedTask), completed: selectedTask?.status === 'end' }"
      />
      <div class="switcher-label">
        <span class="switcher-type">{{ selectedTask ? taskTypeLabel(selectedTask) : '' }}</span>
        <span class="switcher-title">{{
          selectedTask ? (getWorkingChapterLabel(selectedTask) || '未知章节') : '选择任务'
        }}</span>
      </div>
      <div class="switcher-meta">
        <span class="switcher-count">{{ selectedIndex + 1 }}/{{ tasks.length }}</span>
        <span class="switcher-chevron" :class="{ open: isOpen }">&#x25BE;</span>
      </div>
    </button>

    <Transition name="dropdown">
      <div v-if="isOpen" class="switcher-dropdown" @click.stop>
        <button
          v-for="task in tasks"
          :key="task.id"
          class="dropdown-item"
          :class="{ selected: task.id === selectedTaskId }"
          @click="select(task.id)"
        >
          <span class="switcher-dot" :class="{ active: isActive(task), completed: task.status === 'end' }" />
          <div class="dropdown-item-info">
            <span class="dropdown-item-type">{{ taskTypeLabel(task) }}</span>
            <span class="dropdown-item-title">{{ getWorkingChapterLabel(task) || '未知章节' }}</span>
          </div>
          <span class="dropdown-item-duration">{{ formatDuration(task.startTime, task.endTime) }}</span>
          <span
            class="dropdown-item-badge"
            :class="{ active: isActive(task), done: task.status === 'end', error: task.status === 'error' }"
          >{{ statusLabel(task) }}</span>
          <span v-if="unseenActivity[task.id]" class="notification-dot" />
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.task-switcher {
  padding: 12px 16px;
  border-bottom: 1px solid var(--white-opacity-5);
  position: relative;
}

.switcher-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
  color: inherit;
  overflow: hidden;
  min-width: 0;
}

.switcher-trigger:hover {
  border-color: rgba(255, 255, 255, 0.15);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.03));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.switcher-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--moon-opacity-40);
}

.switcher-dot.active {
  background: #6c8cff;
  box-shadow: 0 0 8px rgba(108, 140, 255, 0.6);
  animation: pulse-dot 2s ease-in-out infinite;
}

.switcher-dot.completed {
  background: var(--green-500);
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.switcher-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 1px;
  text-align: left;
}

.switcher-type {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--moon-opacity-60);
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.switcher-title {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--moon-opacity-90);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.switcher-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.switcher-count {
  font-size: 0.6875rem;
  color: var(--moon-opacity-50);
  font-weight: 500;
  font-family: var(--font-mono, monospace);
}

.switcher-chevron {
  color: var(--moon-opacity-50);
  font-size: 0.625rem;
  transition: transform 0.2s;
}

.switcher-chevron.open {
  transform: rotate(180deg);
}

/* Dropdown */
.switcher-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 12px;
  right: 12px;
  background: rgba(10, 12, 16, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 6px;
  z-index: 100;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(20px);
  max-height: 300px;
  overflow-y: auto;
}

.dropdown-enter-active {
  transition: all 0.15s ease-out;
}

.dropdown-leave-active {
  transition: all 0.1s ease-in;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

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
