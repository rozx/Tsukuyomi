<script setup lang="ts">
import { computed } from 'vue';
import type { TodoItem } from 'src/services/todo-list-service';

const props = defineProps<{
  todos: TodoItem[];
  collapsed: boolean;
}>();

const emit = defineEmits<{
  toggleCollapsed: [];
}>();

const incompleteTodos = computed(() => props.todos.filter((t) => t.status !== 'done'));
const workingTodos = computed(() => props.todos.filter((t) => t.status === 'working'));
const allDone = computed(() => props.todos.length > 0 && incompleteTodos.value.length === 0);
</script>

<template>
  <div v-if="todos.length > 0" class="todos-section">
    <button class="todos-header" @click="emit('toggleCollapsed')">
      <div class="todos-header-left">
        <span class="todos-title">待办事项</span>
        <span class="todos-count" :class="{ 'all-done': allDone }">
          {{ allDone ? `${todos.length} ✓` : incompleteTodos.length }}
        </span>
      </div>
      <span class="todos-chevron" :class="{ collapsed }">&#x25BE;</span>
    </button>
    <!-- 折叠时显示进行中的任务 -->
    <div v-if="collapsed && workingTodos.length > 0" class="todos-collapsed-preview">
      <div v-for="todo in workingTodos" :key="todo.id" class="todo-item working">
        <span class="todo-checkbox working" />
        <span class="todo-text">{{ todo.text }}</span>
      </div>
    </div>
    <div v-if="!collapsed" class="todos-list" style="max-height:200px;overflow-y:auto">
      <div
        v-for="todo in todos"
        :key="todo.id"
        class="todo-item"
        :class="{ completed: todo.status === 'done', working: todo.status === 'working' }"
      >
        <span class="todo-checkbox" :class="{ checked: todo.status === 'done', working: todo.status === 'working' }" />
        <span class="todo-text">{{ todo.text }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.todos-section {
  padding: 0 16px;
  border-bottom: 1px solid var(--white-opacity-5);
  flex-shrink: 0;
}

.todos-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  cursor: pointer;
  user-select: none;
  width: 100%;
  border: none;
  background: transparent;
  font-family: inherit;
  color: inherit;
}

.todos-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.todos-title {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--moon-opacity-50);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.todos-count {
  font-size: 0.625rem;
  font-weight: 600;
  color: #6c8cff;
  background: rgba(108, 140, 255, 0.12);
  padding: 2px 7px;
  border-radius: 4px;
  font-family: var(--font-mono, monospace);
}

.todos-count.all-done {
  color: #4ade80;
  background: rgba(74, 222, 128, 0.12);
}

.todos-chevron {
  color: var(--moon-opacity-50);
  font-size: 0.5625rem;
  transition: transform 0.2s;
}

.todos-chevron.collapsed {
  transform: rotate(-90deg);
}

.todos-collapsed-preview {
  padding-bottom: 8px;
}

.todos-list {
  padding-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
  overflow-x: hidden;
}

.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 5px;
  transition: background 0.12s;
}

.todo-item:hover {
  background: var(--white-opacity-5);
}

.todo-checkbox {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1.5px solid var(--moon-opacity-40);
  flex-shrink: 0;
  margin-top: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.todo-checkbox.working {
  border-color: #6c8cff;
  background: rgba(108, 140, 255, 0.15);
  animation: pulse-working 1.5s ease-in-out infinite;
}

.todo-checkbox.working::after {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6c8cff;
}

@keyframes pulse-working {
  0%, 100% { box-shadow: 0 0 0 0 rgba(108, 140, 255, 0.3); }
  50% { box-shadow: 0 0 0 3px rgba(108, 140, 255, 0); }
}

.todo-checkbox.checked {
  background: #4ade80;
  border-color: #4ade80;
}

.todo-checkbox.checked::after {
  content: '\2713';
  font-size: 0.5625rem;
  color: #12121c;
  font-weight: 700;
}

.todo-text {
  font-size: 0.75rem;
  color: var(--moon-opacity-70);
  line-height: 1.45;
  overflow-wrap: anywhere;
  word-break: break-word;
  min-width: 0;
}

.todo-item.working {
  background: rgba(108, 140, 255, 0.04);
  border-radius: 5px;
}

.todo-item.working .todo-text {
  color: rgba(253, 253, 255, 0.85);
}

.todo-item.completed .todo-text {
  color: var(--moon-opacity-40);
  text-decoration: line-through;
}
</style>
