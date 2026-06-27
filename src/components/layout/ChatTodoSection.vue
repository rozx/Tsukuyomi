<script setup lang="ts">
/**
 * 桌面 AI 助手面板的「待办事项」折叠区。从 AppChatPanelDesktop 拆出，
 * 让父模板不再承载 v-for + 多组 :class 对象带来的圈复杂度。
 * 渲染结果与原先逐字一致。
 */
import { computed } from 'vue';
import type { TodoItem } from 'src/services/todo-list-service';

interface Props {
  todos: TodoItem[];
  incompleteTodoCount: number;
  modelValue: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

// 折叠箭头方向
const chevronIcon = computed(() => (props.modelValue ? 'pi-chevron-down' : 'pi-chevron-right'));

// 按 status 查表的 class 映射，避免模板里写多组 :class 对象
const itemClass = (status: TodoItem['status']): Record<string, boolean> => ({
  'cp-todo-item--done': status === 'done',
  'cp-todo-item--working': status === 'working',
});
const textClass = (status: TodoItem['status']): Record<string, boolean> => ({
  'cp-todo-text--done': status === 'done',
  'cp-todo-text--working': status === 'working',
});
const ICON_BY_STATUS: Record<TodoItem['status'], string> = {
  done: 'pi-check-circle',
  working: 'pi-arrow-right',
  pending: 'pi-circle',
};

const toggle = () => emit('update:modelValue', !props.modelValue);
</script>

<template>
  <div class="cp-todo-section">
    <button class="cp-todo-toggle" @click="toggle">
      <div class="cp-todo-toggle-copy">
        <i class="pi pi-list"></i>
        <span>待办事项</span>
        <span v-if="incompleteTodoCount > 0" class="cp-todo-badge">
          {{ incompleteTodoCount }}
        </span>
      </div>
      <i class="pi cp-todo-chevron" :class="chevronIcon"></i>
    </button>
    <div v-if="modelValue" class="cp-todo-list">
      <div v-if="todos.length === 0" class="cp-todo-empty">暂无待办事项</div>
      <div v-else class="cp-todo-items">
        <div
          v-for="todo in todos"
          :key="todo.id"
          class="cp-todo-item"
          :class="itemClass(todo.status)"
        >
          <i class="pi cp-todo-icon" :class="ICON_BY_STATUS[todo.status]"></i>
          <span class="cp-todo-text" :class="textClass(todo.status)">
            {{ todo.text }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cp-todo-section {
  flex-shrink: 0;
  border-bottom: 1px solid var(--white-opacity-6);
}

.cp-todo-toggle {
  width: 100%;
  padding: 6px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: left;
  background: transparent;
  border: none;
  color: var(--moon-opacity-70);
  cursor: pointer;
  transition: background 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.cp-todo-toggle:hover {
  background: var(--white-opacity-4);
}

.cp-todo-toggle-copy {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cp-todo-toggle-copy i {
  font-size: 12px;
  color: var(--moon-opacity-50);
}

.cp-todo-toggle-copy span:nth-child(2) {
  font-size: 11px;
  font-weight: 500;
  color: var(--moon-opacity-85);
}

.cp-todo-badge {
  padding: 1px 6px;
  font-size: 9px;
  font-weight: 600;
  border-radius: 6px;
  background: var(--tsukuyomi-opacity-15);
  color: var(--tsukuyomi-opacity-90);
}

.cp-todo-chevron {
  font-size: 11px;
  color: var(--moon-opacity-50);
  transition: transform 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.cp-todo-list {
  max-height: 16rem;
  overflow-y: auto;
  border-top: 1px solid var(--white-opacity-6);
  background: var(--white-opacity-3);
}

.cp-todo-empty {
  padding: 10px 16px;
  font-size: 11px;
  color: var(--moon-opacity-40);
  text-align: center;
}

.cp-todo-items {
  padding: 6px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cp-todo-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 8px;
  transition: background 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.cp-todo-item:hover {
  background: var(--white-opacity-4);
}

.cp-todo-item--done {
  opacity: 0.55;
}

.cp-todo-item--working {
  border-left: 2px solid var(--tsukuyomi-opacity-50);
  padding-left: 6px;
}

.cp-todo-icon {
  margin-top: 2px;
  font-size: 11px;
  flex-shrink: 0;
}

.cp-todo-item--done .cp-todo-icon {
  color: rgba(134, 239, 172, 0.8);
}

.cp-todo-item--working .cp-todo-icon {
  color: var(--tsukuyomi-opacity-90);
}

.cp-todo-item:not(.cp-todo-item--done):not(.cp-todo-item--working) .cp-todo-icon {
  color: var(--moon-opacity-40);
}

.cp-todo-text {
  font-size: 11px;
  flex: 1;
  word-break: break-word;
  color: var(--moon-opacity-70);
}

.cp-todo-text--done {
  text-decoration: line-through;
  color: var(--moon-opacity-40);
}

.cp-todo-text--working {
  color: var(--tsukuyomi-opacity-95);
  font-weight: 500;
}
</style>
