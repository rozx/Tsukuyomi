import { ref, computed, watch, onMounted, onUnmounted, type ComputedRef } from 'vue';

import { TodoListService, type TodoItem } from 'src/services/todo-list-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';

/**
 * 翻译面板待办事项 composable。
 *
 * 负责：根据 recentAITasks 加载 / 过滤 todos、监听跨标签页 storage 事件与
 * 应用内 tsukuyomi-todos-updated 事件，并在 onMounted 初始化、onUnmounted
 * 清理订阅。
 *
 * 调用方仍需保证 recentAITasks 是一个稳定的 ComputedRef（即随 store 变化而变化）。
 */
export function useTranslationTodos(params: {
  recentAITasks: ComputedRef<AIProcessingTask[]>;
  currentTask: ComputedRef<AIProcessingTask | null>;
}) {
  const { recentAITasks, currentTask } = params;
  const todos = ref<TodoItem[]>([]);

  const loadTodos = () => {
    const allTodos = TodoListService.getAllTodos();
    const taskIds = new Set(recentAITasks.value.map((t) => t.id));
    todos.value = allTodos.filter((t) => taskIds.has(t.taskId));
  };

  const currentTaskTodos = computed(() =>
    currentTask.value ? todos.value.filter((t) => t.taskId === currentTask.value!.id) : [],
  );

  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === 'tsukuyomi-todo-list') loadTodos();
  };

  // 使用稳定的拼接键避免每次 recentAITasks 变动时都 diff 数组（减少 loadTodos 无谓调用）
  const recentTaskIdsKey = computed(() => recentAITasks.value.map((t) => t.id).join('|'));
  watch(recentTaskIdsKey, loadTodos);

  onMounted(() => {
    loadTodos();
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('tsukuyomi-todos-updated', loadTodos);
  });

  onUnmounted(() => {
    window.removeEventListener('storage', handleStorageChange);
    window.removeEventListener('tsukuyomi-todos-updated', loadTodos);
  });

  return { todos, currentTaskTodos, loadTodos };
}
