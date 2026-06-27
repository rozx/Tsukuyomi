<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { TASK_TYPE_LABELS } from 'src/constants/ai';
import TaskSwitcherItem from './TaskSwitcherItem.vue';

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

// 触发器展示文案与状态类：从模板内联三元表达式收敛为 computed，降低模板圈复杂度
const triggerType = computed(() =>
  selectedTask.value ? taskTypeLabel(selectedTask.value) : '',
);
const triggerTitle = computed(() =>
  selectedTask.value
    ? (props.getWorkingChapterLabel(selectedTask.value) || '未知章节')
    : '选择任务',
);
const triggerDotClass = computed(() => ({
  active: !!(selectedTask.value && isActive(selectedTask.value)),
  completed: selectedTask.value?.status === 'end',
}));

const taskTypeLabel = (task: AIProcessingTask) => {
  const key = task.type;
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
      <span class="switcher-dot" :class="triggerDotClass" />
      <div class="switcher-label">
        <span class="switcher-type">{{ triggerType }}</span>
        <span class="switcher-title">{{ triggerTitle }}</span>
      </div>
      <div class="switcher-meta">
        <span class="switcher-count">{{ selectedIndex + 1 }}/{{ tasks.length }}</span>
        <span class="switcher-chevron" :class="{ open: isOpen }">&#x25BE;</span>
      </div>
    </button>

    <Transition name="dropdown">
      <div v-if="isOpen" class="switcher-dropdown" @click.stop>
        <TaskSwitcherItem
          v-for="task in tasks"
          :key="task.id"
          :task="task"
          :is-selected="task.id === selectedTaskId"
          :has-unseen="!!unseenActivity[task.id]"
          :is-active="isActive"
          :type-label="taskTypeLabel"
          :chapter-label="getWorkingChapterLabel"
          :duration="(t: AIProcessingTask) => formatDuration(t.startTime, t.endTime)"
          :status-label="statusLabel"
          @select="select"
        />
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
  /* 样式随条目迁移到 TaskSwitcherItem.vue（scoped 不跨组件） */
}
</style>
