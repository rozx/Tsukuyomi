<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import Button from 'primevue/button';
import Badge from 'primevue/badge';
import ProgressBar from 'primevue/progressbar';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { useBookDetailsStore } from 'src/stores/book-details';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { TASK_TYPE_LABELS } from 'src/constants/ai';
import { TodoListService, type TodoItem } from 'src/services/todo-list-service';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const props = defineProps<{
  isTranslating?: boolean;
  isPolishing?: boolean;
  isProofreading?: boolean;
  progress: {
    current: number;
    total: number;
    message: string;
  };
}>();

const emit = defineEmits<{
  (e: 'cancel'): void;
}>();

const aiProcessingStore = useAIProcessingStore();
const bookDetailsStore = useBookDetailsStore();
const toast = useToastWithHistory();

// 待办事项列表
const todos = ref<TodoItem[]>([]);

// Recent AI Tasks - only show translation-related tasks
// 为了代码逻辑清晰，将 recentAITasks 放在 loadTodos 之前，因为 loadTodos 会使用它（但这不是技术上的要求）
const recentAITasks = computed(() => {
  const allTasks = aiProcessingStore.activeTasks;
  // Filter to only show translation, polish, and proofreading tasks
  const translationTasks = allTasks.filter(
    (task) => task.type === 'translation' || task.type === 'polish' || task.type === 'proofreading',
  );
  return [...translationTasks].sort((a, b) => b.startTime - a.startTime).slice(0, 10);
});

// 加载待办事项列表（仅显示当前翻译/润色/校对任务的待办事项）
const loadTodos = () => {
  const allTodos = TodoListService.getAllTodos();
  // 获取当前翻译相关任务的 ID 列表
  const currentTaskIds = new Set(recentAITasks.value.map((task) => task.id));
  // 只显示属于当前任务的待办事项
  todos.value = allTodos.filter((todo) => currentTaskIds.has(todo.taskId));
};

// 获取特定任务的待办事项
const getTodosForTask = (taskId: string): TodoItem[] => {
  return todos.value.filter((todo) => todo.taskId === taskId);
};

// 监听待办事项变化（通过 localStorage 事件）
const handleStorageChange = (e: StorageEvent) => {
  if (e.key === 'tsukuyomi-todo-list') {
    loadTodos();
  }
};

// 监听 recentAITasks 变化，重新加载待办事项
watch(
  () => recentAITasks.value,
  () => {
    loadTodos();
  },
  { deep: true },
);

onMounted(() => {
  // 确保 store 状态已加载
  if (!bookDetailsStore.isLoaded) {
    bookDetailsStore.loadState();
  }
  // 初始化时加载待办事项
  loadTodos();
  // 监听 localStorage 变化（跨标签页同步）
  window.addEventListener('storage', handleStorageChange);
});

onUnmounted(() => {
  // 清理 storage 事件监听
  window.removeEventListener('storage', handleStorageChange);
});

const taskStatusLabels: Record<string, string> = {
  thinking: '思考中',
  processing: '处理中',
  completed: '已完成',
  error: '错误',
  cancelled: '已取消',
};

// Auto Scroll State - 从 store 获取，使用 computed 以便响应式更新
const autoScrollEnabled = computed(() => bookDetailsStore.translationProgress.autoScrollEnabled);

// Auto Tab Switching State - 从 store 获取
const autoTabSwitchingEnabled = computed(() => bookDetailsStore.translationProgress.autoTabSwitchingEnabled);

// Task Fold State - 从 store 获取
const taskFolded = computed(() => bookDetailsStore.translationProgress.taskFolded);

const toggleTaskFold = (taskId: string) => {
  const currentFolded = taskFolded.value[taskId] || false;
  bookDetailsStore.setTranslationProgressTaskFolded(taskId, !currentFolded);
};

// Active Tab State for each task - 从 store 获取
const activeTab = computed(() => bookDetailsStore.translationProgress.activeTab);
// Track the last active state for each task to detect state changes
const lastActiveState = ref<Record<string, 'thinking' | 'outputting' | 'none'>>({});

// Track last update time for thinkingMessage and outputContent to determine which is actively updating
const lastThinkingUpdate = ref<Record<string, number>>({});
const lastOutputUpdate = ref<Record<string, number>>({});

const setActiveTab = (taskId: string, value: string) => {
  bookDetailsStore.setTranslationProgressActiveTab(taskId, value);
};

const getActiveTab = (taskId: string): string => {
  const task = recentAITasks.value.find((t) => t.id === taskId);
  if (!task) {
    return activeTab.value[taskId] || 'thinking';
  }

  // 如果禁用了自动标签页切换，直接返回用户手动选择的标签页
  if (autoTabSwitchingEnabled.value[taskId] === false) {
    return activeTab.value[taskId] || 'thinking';
  }

  // Determine current active state
  const isThinking = isTaskThinking(taskId);
  const isOutputting = isTaskOutputting(taskId);

  // Get current active state for comparison
  const currentActiveState: 'thinking' | 'outputting' | 'none' = isThinking
    ? 'thinking'
    : isOutputting
      ? 'outputting'
      : 'none';

  // If the active state changed, clear the saved tab to allow auto-switching
  const lastState = lastActiveState.value[taskId];
  if (lastState !== undefined && lastState !== currentActiveState) {
    // State changed - clear saved tab to allow auto-switch
    bookDetailsStore.clearTranslationProgressActiveTab(taskId);
  }

  // Update last active state
  lastActiveState.value[taskId] = currentActiveState;

  // If user has manually selected a tab and state hasn't changed, respect it
  const savedTab = activeTab.value[taskId];
  if (savedTab && lastState === currentActiveState) {
    return savedTab;
  }

  // Determine what the active tab should be based on current state
  // Note: We don't automatically switch to todos tab - user must manually select it
  let shouldBeTab: string;
  if (isOutputting) {
    shouldBeTab = 'output';
  } else if (isThinking) {
    shouldBeTab = 'thinking';
  } else {
    // No active state, use content-based default
    const hasThinking = task.thinkingMessage && task.thinkingMessage.trim();
    const hasOutput = task.outputContent && task.outputContent.trim();
    if (hasOutput && !hasThinking) {
      shouldBeTab = 'output';
    } else {
      shouldBeTab = 'thinking';
    }
  }

  // Otherwise, auto-switch to the appropriate tab
  return shouldBeTab;
};

// 检查任务是否正在思考
const isTaskThinking = (taskId: string): boolean => {
  const task = recentAITasks.value.find((t) => t.id === taskId);
  if (!task) return false;
  
  // 如果状态是 'thinking'，检查是否有最近的更新
  if (task.status === 'thinking') {
    const thinkingTime = lastThinkingUpdate.value[taskId] || 0;
    const now = Date.now();
    // 如果状态是 thinking 但最近2秒内没有更新，不显示指示器
    if (thinkingTime > 0 && now - thinkingTime >= 2000) {
      return false;
    }
    return true;
  }
  
  // 如果状态是 'processing'，需要判断是思考还是输出
  if (task.status === 'processing') {
    const hasThinking = task.thinkingMessage !== undefined && task.thinkingMessage.trim().length > 0;
    if (!hasThinking) {
      return false;
    }
    
    const thinkingTime = lastThinkingUpdate.value[taskId] || 0;
    const now = Date.now();
    const recentThinking = thinkingTime > 0 && now - thinkingTime < 2000;
    
    // 只有在最近2秒内更新过才显示思考指示器
    if (!recentThinking) {
      return false;
    }
    
    const hasOutput = task.outputContent !== undefined && task.outputContent.trim().length > 0;
    
    // 如果只有思考消息，没有输出，显示思考指示器
    if (!hasOutput) {
      return true;
    }
    
    // 如果两者都有，根据最后更新时间判断哪个更活跃
    const outputTime = lastOutputUpdate.value[taskId] || 0;
    const recentOutput = outputTime > 0 && now - outputTime < 2000;
    
    // 如果思考消息最近更新过，而输出内容没有最近更新，显示思考指示器
    if (recentThinking && !recentOutput) {
      return true;
    }
    // 如果两者都最近更新过，但思考消息更新更晚，显示思考指示器
    if (recentThinking && recentOutput && thinkingTime > outputTime) {
      return true;
    }
  }
  
  return false;
};

// 检查任务是否正在输出内容
const isTaskOutputting = (taskId: string): boolean => {
  const task = recentAITasks.value.find((t) => t.id === taskId);
  if (!task) return false;
  
  // 只有 'processing' 状态才可能输出
  if (task.status !== 'processing') {
    return false;
  }
  
  const hasOutput = task.outputContent !== undefined && task.outputContent.trim().length > 0;
  if (!hasOutput) {
    return false;
  }
  
  // 检查输出内容是否在最近2秒内更新过
  const outputTime = lastOutputUpdate.value[taskId] || 0;
  const now = Date.now();
  const recentOutput = outputTime > 0 && now - outputTime < 2000;
  
  // 只有在最近2秒内更新过才显示输出指示器
  if (!recentOutput) {
    return false;
  }
  
  // 如果有输出内容且最近更新过，检查是否与思考消息冲突
  const hasThinking = task.thinkingMessage !== undefined && task.thinkingMessage.trim().length > 0;
  
  // 如果没有思考消息，显示输出指示器
  if (!hasThinking) {
    return true;
  }
  
  // 如果两者都有，根据最后更新时间判断
  const thinkingTime = lastThinkingUpdate.value[taskId] || 0;
  const recentThinking = thinkingTime > 0 && now - thinkingTime < 2000;
  
  // 如果输出内容最近更新过，而思考消息没有最近更新，显示输出指示器
  if (recentOutput && !recentThinking) {
    return true;
  }
  // 如果两者都最近更新过，但输出内容更新更晚，显示输出指示器
  if (recentThinking && recentOutput && outputTime > thinkingTime) {
    return true;
  }
  
  return false;
};

const thinkingContainers = ref<Record<string, HTMLElement | null>>({});
const outputContainers = ref<Record<string, HTMLElement | null>>({});
const todosContainers = ref<Record<string, HTMLElement | null>>({});

const setThinkingContainer = (taskId: string, el: HTMLElement | null) => {
  if (el) {
    thinkingContainers.value[taskId] = el;
  } else {
    delete thinkingContainers.value[taskId];
  }
};

const setOutputContainer = (taskId: string, el: HTMLElement | null) => {
  if (el) {
    outputContainers.value[taskId] = el;
  } else {
    delete outputContainers.value[taskId];
  }
};

const setTodosContainer = (taskId: string, el: HTMLElement | null) => {
  if (el) {
    todosContainers.value[taskId] = el;
  } else {
    delete todosContainers.value[taskId];
  }
};

const scrollToBottom = (container: HTMLElement) => {
  // 使用 requestAnimationFrame 确保在浏览器绘制后滚动
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
};

// 通用自动滚动切换函数，适用于所有标签页
const toggleAutoScroll = (taskId: string) => {
  const currentEnabled = autoScrollEnabled.value[taskId] || false;
  bookDetailsStore.setTranslationProgressAutoScroll(taskId, !currentEnabled);
  if (!currentEnabled) {
    nextTick(() => {
      // 根据当前激活的标签页滚动对应的容器
      const activeTab = getActiveTab(taskId);
      let container: HTMLElement | null = null;
      
      if (activeTab === 'thinking') {
        container = thinkingContainers.value[taskId] ?? null;
      } else if (activeTab === 'output') {
        container = outputContainers.value[taskId] ?? null;
      } else if (activeTab === 'todos') {
        container = todosContainers.value[taskId] ?? null;
      }
      
      if (container) {
        scrollToBottom(container);
      }
    });
  }
};

// 自动标签页切换开关
const toggleAutoTabSwitching = (taskId: string) => {
  const wasEnabled = autoTabSwitchingEnabled.value[taskId] !== false;
  const newEnabled = !wasEnabled;
  bookDetailsStore.setTranslationProgressAutoTabSwitching(taskId, newEnabled);
  // 默认启用自动切换（undefined 视为 true）
  if (!newEnabled) {
    // 禁用时，确保有保存的标签页选择
    if (!activeTab.value[taskId]) {
      // 如果没有保存的选择，临时启用自动切换来获取当前应该显示的标签页
      // 先保存当前状态，避免 getActiveTab 清除 activeTab
      const savedLastState = lastActiveState.value[taskId] ?? 'none';
      // 临时设置 store 状态为 true 来获取当前标签页
      bookDetailsStore.setTranslationProgressAutoTabSwitching(taskId, true);
      const currentTab = getActiveTab(taskId);
      // 恢复为 false
      bookDetailsStore.setTranslationProgressAutoTabSwitching(taskId, false);
      // 恢复 lastActiveState，避免状态被意外更新
      lastActiveState.value[taskId] = savedLastState;
      // 保存当前标签页，这样禁用后就会保持在这个标签页
      bookDetailsStore.setTranslationProgressActiveTab(taskId, currentTab);
    }
  }
};

const clearCompletedTasks = async () => {
  try {
    // Only clear translation-related completed tasks
    const translationTasks = aiProcessingStore.activeTasks.filter(
      (task) =>
        (task.type === 'translation' || task.type === 'polish' || task.type === 'proofreading') &&
        (task.status === 'completed' || task.status === 'error' || task.status === 'cancelled'),
    );

    // Remove each translation-related completed task
    for (const task of translationTasks) {
      await aiProcessingStore.removeTask(task.id);
    }

    toast.add({
      severity: 'success',
      summary: '清除成功',
      detail: `已清除 ${translationTasks.length} 个翻译相关的已完成任务`,
      life: 3000,
    });
  } catch (error) {
    console.error('Failed to clear completed tasks:', error);
    toast.add({
      severity: 'error',
      summary: '清除失败',
      detail: error instanceof Error ? error.message : '未知错误',
      life: 3000,
    });
  }
};

const formatTaskDuration = (startTime: number, endTime?: number): string => {
  const end = endTime || Date.now();
  const duration = Math.floor((end - startTime) / 1000);
  if (duration < 60) {
    return `${duration}秒`;
  }
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  return `${minutes}分${seconds}秒`;
};

// 格式化思考消息，识别特殊标记
interface FormattedMessagePart {
  type: 'chunk-separator' | 'tool-call' | 'tool-result' | 'content';
  text: string;
  toolName?: string;
  chunkInfo?: string;
}

const formatThinkingMessage = (message: string): FormattedMessagePart[] => {
  if (!message) return [];

  const parts: FormattedMessagePart[] = [];
  let currentIndex = 0;

  // 匹配块分隔符：[=== 翻译块 X/Y ===] 或 [=== 润色块 X/Y ===] 或 [=== 校对块 X/Y ===]
  const chunkSeparatorPattern = /\[=== (翻译|润色|校对)块 (\d+\/\d+) ===\]/g;
  // 匹配工具调用：[调用工具: 工具名]
  const toolCallPattern = /\[调用工具: ([^\]]+)\]/g;
  // 匹配工具结果：[工具结果: ...]
  const toolResultPattern = /\[工具结果: ([^\]]+)\]/g;

  // 收集所有匹配项及其位置
  const matches: Array<{
    index: number;
    type: 'chunk-separator' | 'tool-call' | 'tool-result';
    match: RegExpMatchArray;
  }> = [];

  let match;
  while ((match = chunkSeparatorPattern.exec(message)) !== null) {
    matches.push({ index: match.index, type: 'chunk-separator', match });
  }
  chunkSeparatorPattern.lastIndex = 0;

  while ((match = toolCallPattern.exec(message)) !== null) {
    matches.push({ index: match.index, type: 'tool-call', match });
  }
  toolCallPattern.lastIndex = 0;

  while ((match = toolResultPattern.exec(message)) !== null) {
    matches.push({ index: match.index, type: 'tool-result', match });
  }
  toolResultPattern.lastIndex = 0;

  // 按位置排序
  matches.sort((a, b) => a.index - b.index);

  // 处理每个匹配项
  for (const { index, type, match } of matches) {
    // 添加匹配前的普通内容
    if (index > currentIndex) {
      const text = message.slice(currentIndex, index).trim();
      if (text) {
        parts.push({ type: 'content', text });
      }
    }

    // 添加特殊标记
    if (type === 'chunk-separator') {
      parts.push({
        type: 'chunk-separator',
        text: match[0],
        chunkInfo: `${match[1]}块 ${match[2]}`,
      });
    } else if (type === 'tool-call') {
      if (match[1]) {
        parts.push({
          type: 'tool-call',
          text: match[0],
          toolName: match[1],
        });
      }
    } else if (type === 'tool-result') {
      if (match[1]) {
        parts.push({
          type: 'tool-result',
          text: match[0],
          toolName: match[1],
        });
      }
    }

    currentIndex = index + match[0].length;
  }

  // 添加剩余内容
  if (currentIndex < message.length) {
    const text = message.slice(currentIndex).trim();
    if (text) {
      parts.push({ type: 'content', text });
    }
  }

  // 如果没有匹配项，返回整个消息作为普通内容
  if (parts.length === 0 && message.trim()) {
    parts.push({ type: 'content', text: message });
  }

  return parts;
};

// Auto scroll watcher for thinking message
watch(
  () =>
    recentAITasks.value.map((task) => ({
      id: task.id,
      message: task.thinkingMessage,
      length: task.thinkingMessage?.length || 0,
    })),
  (newTasks, oldTasks) => {
    // 跟踪思考消息的更新时间
    const oldTasksMap = new Map((oldTasks || []).map((t) => [t.id, t.length]));
    const currentTaskIds = new Set(newTasks.map((t) => t.id));
    
    // 清理已移除任务的跟踪数据
    for (const taskId of Object.keys(lastThinkingUpdate.value)) {
      if (!currentTaskIds.has(taskId)) {
        delete lastThinkingUpdate.value[taskId];
      }
    }
    
    for (const task of newTasks) {
      const oldLength = oldTasksMap.get(task.id) || 0;
      if (task.length > oldLength) {
        lastThinkingUpdate.value[task.id] = Date.now();
      }
    }
    
    // 使用 nextTick 确保 Vue 已更新 DOM，然后使用 requestAnimationFrame 确保浏览器已绘制
    nextTick(() => {
      requestAnimationFrame(() => {
        for (const task of recentAITasks.value) {
          if (autoScrollEnabled.value[task.id] && task.thinkingMessage) {
            const activeTab = getActiveTab(task.id);
            // 只有在思考标签页激活时才滚动思考容器
            if (activeTab === 'thinking') {
              const container = thinkingContainers.value[task.id];
              if (container) {
                container.scrollTop = container.scrollHeight;
              }
            }
          }
        }
      });
    });
  },
  { deep: true, flush: 'post' },
);

// Auto scroll watcher for output content
watch(
  () =>
    recentAITasks.value.map((task) => ({
      id: task.id,
      message: task.outputContent,
      length: task.outputContent?.length || 0,
    })),
  (newTasks, oldTasks) => {
    // 跟踪输出内容的更新时间
    const oldTasksMap = new Map((oldTasks || []).map((t) => [t.id, t.length]));
    const currentTaskIds = new Set(newTasks.map((t) => t.id));
    
    // 清理已移除任务的跟踪数据
    for (const taskId of Object.keys(lastOutputUpdate.value)) {
      if (!currentTaskIds.has(taskId)) {
        delete lastOutputUpdate.value[taskId];
      }
    }
    
    for (const task of newTasks) {
      const oldLength = oldTasksMap.get(task.id) || 0;
      if (task.length > oldLength) {
        lastOutputUpdate.value[task.id] = Date.now();
      }
    }
    
    // 使用 nextTick 确保 Vue 已更新 DOM，然后使用 requestAnimationFrame 确保浏览器已绘制
    nextTick(() => {
      requestAnimationFrame(() => {
        for (const task of recentAITasks.value) {
          if (autoScrollEnabled.value[task.id] && task.outputContent) {
            const activeTab = getActiveTab(task.id);
            // 只有在输出标签页激活时才滚动输出容器
            if (activeTab === 'output') {
              const container = outputContainers.value[task.id];
              if (container) {
                container.scrollTop = container.scrollHeight;
              }
            }
          }
        }
      });
    });
  },
  { deep: true, flush: 'post' },
);

// Auto scroll watcher for todos
watch(
  () => todos.value,
  () => {
    // 使用 nextTick 确保 Vue 已更新 DOM，然后使用 requestAnimationFrame 确保浏览器已绘制
    nextTick(() => {
      requestAnimationFrame(() => {
        for (const task of recentAITasks.value) {
          if (autoScrollEnabled.value[task.id]) {
            const activeTab = getActiveTab(task.id);
            // 只有在待办事项标签页激活时才滚动待办事项容器
            if (activeTab === 'todos') {
              const container = todosContainers.value[task.id];
              if (container) {
                container.scrollTop = container.scrollHeight;
              }
            }
          }
        }
      });
    });
  },
  { deep: true, flush: 'post' },
);

// Auto-fold inactive tasks when a new task starts
watch(
  () =>
    recentAITasks.value.map((task) => ({
      id: task.id,
      status: task.status,
      startTime: task.startTime,
    })),
  (newTasks, oldTasks) => {
    // Find newly started active tasks (status is 'thinking' or 'processing')
    const newActiveTasks = newTasks.filter(
      (task) => task.status === 'thinking' || task.status === 'processing',
    );
    const oldActiveTaskIds = new Set(
      (oldTasks || [])
        .filter((task) => task.status === 'thinking' || task.status === 'processing')
        .map((task) => task.id),
    );

    // Check if there's a newly started task
    const hasNewActiveTask = newActiveTasks.some((task) => !oldActiveTaskIds.has(task.id));

    if (hasNewActiveTask) {
      // Fold all inactive tasks (not 'thinking' or 'processing')
      for (const task of recentAITasks.value) {
        const isActive = task.status === 'thinking' || task.status === 'processing';
        if (!isActive) {
          bookDetailsStore.setTranslationProgressTaskFolded(task.id, true);
        } else {
          // Ensure active tasks are unfolded
          bookDetailsStore.setTranslationProgressTaskFolded(task.id, false);
        }
      }
    }
  },
  { deep: true, flush: 'post' },
);
</script>

<template>
  <div class="translation-progress-toolbar">
    <!-- AI 任务历史 -->
    <div class="translation-progress-ai-history-wrapper">
      <div class="translation-progress-ai-history">
        <div class="ai-history-content">
          <div v-if="recentAITasks.length === 0" class="ai-history-empty">
            <i class="pi pi-info-circle"></i>
            <span>暂无 AI 任务记录</span>
          </div>
          <div v-else class="ai-history-tasks">
            <!-- 清除已完成/已取消任务按钮 -->
            <div
              v-if="
                recentAITasks.some(
                  (t) =>
                    t.status === 'completed' || t.status === 'error' || t.status === 'cancelled',
                )
              "
              class="ai-history-clear-actions"
            >
              <Button
                icon="pi pi-trash"
                label="清除已完成/已取消的任务"
                class="p-button-text p-button-sm ai-history-clear-button"
                @click="clearCompletedTasks"
              />
            </div>
            <div
              v-for="task in recentAITasks"
              :key="task.id"
              class="ai-history-task-item"
              :class="{
                'task-active': task.status === 'thinking' || task.status === 'processing',
                'task-completed': task.status === 'completed',
                'task-error': task.status === 'error',
                'task-cancelled': task.status === 'cancelled',
                'task-folded': taskFolded[task.id],
              }"
            >
              <div class="ai-task-header">
                <div class="ai-task-info">
                  <Button
                    :icon="taskFolded[task.id] ? 'pi pi-chevron-right' : 'pi pi-chevron-down'"
                    class="p-button-text p-button-sm ai-task-fold-toggle"
                    @click="toggleTaskFold(task.id)"
                    title="折叠/展开"
                  />
                  <i
                    class="pi ai-task-status-icon"
                    :class="{
                      'pi-spin pi-spinner':
                        task.status === 'thinking' || task.status === 'processing',
                      'pi-check-circle': task.status === 'completed',
                      'pi-times-circle': task.status === 'error',
                      'pi-ban': task.status === 'cancelled',
                    }"
                  ></i>
                  <span class="ai-task-model">{{ task.modelName }}</span>
                  <Badge
                    :value="TASK_TYPE_LABELS[task.type] || task.type"
                    severity="info"
                    class="ai-task-type-badge"
                  />
                  <span class="ai-task-status">{{
                    taskStatusLabels[task.status] || task.status
                  }}</span>
                </div>
                <div class="ai-task-meta">
                  <span class="ai-task-duration">{{
                    formatTaskDuration(task.startTime, task.endTime)
                  }}</span>
                  <Button
                    :icon="
                      autoScrollEnabled[task.id] ? 'pi pi-arrow-down' : 'pi pi-arrows-v'
                    "
                    :class="[
                      'p-button-text p-button-sm ai-task-auto-scroll-toggle',
                      { 'auto-scroll-enabled': autoScrollEnabled[task.id] },
                    ]"
                    :title="
                      autoScrollEnabled[task.id]
                        ? '禁用自动滚动'
                        : '启用自动滚动（新内容出现时自动滚动到底部）'
                    "
                    @click="toggleAutoScroll(task.id)"
                  />
                  <Button
                    :icon="
                      autoTabSwitchingEnabled[task.id] === false
                        ? 'pi pi-window-minimize'
                        : 'pi pi-window-maximize'
                    "
                    :class="[
                      'p-button-text p-button-sm ai-task-auto-tab-switching-toggle',
                      {
                        'auto-tab-switching-enabled':
                          autoTabSwitchingEnabled[task.id] !== false,
                      },
                    ]"
                    :title="
                      autoTabSwitchingEnabled[task.id] === false
                        ? '启用自动标签页切换（根据任务状态自动切换标签页）'
                        : '禁用自动标签页切换（保持当前标签页）'
                    "
                    @click="toggleAutoTabSwitching(task.id)"
                  />
                  <Button
                    v-if="task.status === 'thinking' || task.status === 'processing'"
                    icon="pi pi-stop"
                    class="p-button-text p-button-sm p-button-danger ai-task-stop"
                    @click="void aiProcessingStore.stopTask(task.id)"
                    title="停止任务"
                  />
                </div>
              </div>
              <Transition name="task-content">
                <div v-if="!taskFolded[task.id]" class="ai-task-content">
                  <div v-if="task.message" class="ai-task-message">{{ task.message }}</div>
                  <Tabs
                    :value="getActiveTab(task.id)"
                    @update:value="(value) => setActiveTab(task.id, String(value))"
                    class="ai-task-tabs"
                  >
                    <TabList>
                      <Tab
                        value="thinking"
                        :disabled="!task.thinkingMessage || !task.thinkingMessage.trim()"
                      >
                        <span class="ai-task-tab-label">
                          思考过程
                          <i
                            v-if="isTaskThinking(task.id)"
                            class="pi pi-spin pi-spinner ai-task-indicator"
                            title="正在思考..."
                          ></i>
                        </span>
                      </Tab>
                      <Tab
                        value="output"
                        :disabled="!task.outputContent || !task.outputContent.trim()"
                      >
                        <span class="ai-task-tab-label">
                          输出内容
                          <i
                            v-if="isTaskOutputting(task.id)"
                            class="pi pi-spin pi-spinner ai-task-indicator"
                            title="正在输出内容..."
                          ></i>
                        </span>
                      </Tab>
                      <Tab value="todos" :disabled="getTodosForTask(task.id).length === 0">
                        待办事项
                        <Badge
                          v-if="getTodosForTask(task.id).filter((t) => !t.completed).length > 0"
                          :value="getTodosForTask(task.id).filter((t) => !t.completed).length"
                          severity="info"
                          class="ml-1"
                        />
                      </Tab>
                    </TabList>
                    <TabPanels>
                      <TabPanel value="thinking">
                        <div
                          v-if="task.thinkingMessage && task.thinkingMessage.trim()"
                          class="ai-task-thinking"
                        >
                          <div class="ai-task-thinking-header">
                            <span class="ai-task-thinking-label">思考过程：</span>
                          </div>
                          <div
                            :ref="(el) => setThinkingContainer(task.id, el as HTMLElement)"
                            class="ai-task-thinking-text"
                          >
                            <template
                              v-for="(part, index) in formatThinkingMessage(
                                task.thinkingMessage || '',
                              )"
                              :key="index"
                            >
                              <div
                                v-if="part.type === 'chunk-separator'"
                                class="thinking-chunk-separator"
                              >
                                <i class="pi pi-minus"></i>
                                <span>{{ part.chunkInfo }}</span>
                                <i class="pi pi-minus"></i>
                              </div>
                              <div v-else-if="part.type === 'tool-call'" class="thinking-tool-call">
                                <i class="pi pi-cog"></i>
                                <span class="thinking-tool-label">调用工具：</span>
                                <span class="thinking-tool-name">{{ part.toolName }}</span>
                              </div>
                              <div
                                v-else-if="part.type === 'tool-result'"
                                class="thinking-tool-result"
                              >
                                <i class="pi pi-check-circle"></i>
                                <span class="thinking-tool-label">工具结果：</span>
                                <span class="thinking-tool-content">{{ part.toolName }}</span>
                              </div>
                              <div v-else class="thinking-content">{{ part.text }}</div>
                            </template>
                          </div>
                        </div>
                      </TabPanel>
                      <TabPanel value="output">
                        <div
                          v-if="task.outputContent && task.outputContent.trim()"
                          class="ai-task-output"
                        >
                          <div class="ai-task-output-header">
                            <span class="ai-task-output-label">输出内容：</span>
                          </div>
                          <div
                            :ref="(el) => setOutputContainer(task.id, el as HTMLElement)"
                            class="ai-task-output-text"
                          >
                            {{ task.outputContent }}
                          </div>
                        </div>
                      </TabPanel>
                      <TabPanel value="todos">
                        <div class="ai-task-todos">
                          <div
                            v-if="getTodosForTask(task.id).length === 0"
                            class="ai-task-todos-empty"
                          >
                            <i class="pi pi-info-circle"></i>
                            <span>该任务暂无待办事项</span>
                          </div>
                          <div
                            v-else
                            :ref="(el) => setTodosContainer(task.id, el as HTMLElement)"
                            class="ai-task-todos-list"
                          >
                            <div
                              v-for="todo in getTodosForTask(task.id)"
                              :key="todo.id"
                              class="ai-task-todo-item"
                              :class="{ 'todo-completed': todo.completed }"
                            >
                              <i
                                class="pi ai-task-todo-check-icon"
                                :class="
                                  todo.completed
                                    ? 'pi-check-circle text-green-400'
                                    : 'pi-circle text-moon-50'
                                "
                              ></i>
                              <span
                                class="ai-task-todo-text"
                                :class="{ 'line-through': todo.completed }"
                              >
                                {{ todo.text }}
                              </span>
                            </div>
                          </div>
                        </div>
                      </TabPanel>
                    </TabPanels>
                  </Tabs>
                </div>
              </Transition>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-if="isTranslating || isPolishing || isProofreading" class="translation-progress-content">
      <div class="translation-progress-info">
        <div class="translation-progress-header">
          <i
            :class="[
              'translation-progress-icon',
              isProofreading
                ? 'pi pi-check-circle'
                : isPolishing
                  ? 'pi pi-sparkles'
                  : 'pi pi-language',
            ]"
          ></i>
          <span class="translation-progress-title">{{
            isProofreading ? '正在校对章节' : isPolishing ? '正在润色章节' : '正在翻译章节'
          }}</span>
        </div>
        <div class="translation-progress-message">
          {{ progress.message || '正在处理...' }}
        </div>
      </div>
      <div class="translation-progress-bar-wrapper">
        <ProgressBar
          :value="progress.total > 0 ? (progress.current / progress.total) * 100 : 0"
          :show-value="false"
          class="translation-progress-bar"
        />
        <div class="translation-progress-text">{{ progress.current }} / {{ progress.total }}</div>
      </div>
      <div class="translation-progress-actions">
        <Button
          icon="pi pi-times"
          label="取消"
          class="p-button-text p-button-sm translation-progress-cancel"
          @click="emit('cancel')"
        />
      </div>
    </div>
    <div v-else class="translation-progress-content">
      <div class="translation-progress-info">
        <div class="translation-progress-header">
          <i class="translation-progress-icon pi pi-list"></i>
          <span class="translation-progress-title">AI 任务历史</span>
        </div>
        <div class="translation-progress-message">
          查看翻译、润色和校对任务的执行历史
        </div>
      </div>
      <div class="translation-progress-actions">
        <!-- 无操作按钮 -->
      </div>
    </div>
  </div>
</template>

<style scoped>
.translation-progress-toolbar {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
  width: 100%;
  padding: 0;
  background: transparent;
  overflow: hidden;
}

.translation-progress-content {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.75rem;
  width: 100%;
  padding: 1rem;
  flex-shrink: 0;
  background: var(--white-opacity-95);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--white-opacity-20);
  box-shadow: 0 2px 8px var(--black-opacity-10);
}

.translation-progress-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  width: 100%;
}

.translation-progress-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.translation-progress-icon {
  font-size: 1.125rem;
  color: var(--primary-opacity-80);
}

.translation-progress-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--moon-opacity-95);
}

.translation-progress-message {
  font-size: 0.8125rem;
  color: var(--moon-opacity-70);
  line-height: 1.4;
}

.translation-progress-bar-wrapper {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.translation-progress-bar {
  flex: 1;
  height: 0.5rem;
}

.translation-progress-text {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--moon-opacity-80);
  white-space: nowrap;
  min-width: 3rem;
  text-align: right;
  flex-shrink: 0;
}

.translation-progress-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  justify-content: flex-end;
}

.translation-progress-cancel {
  flex-shrink: 0;
}

/* AI 任务历史 */
.translation-progress-ai-history-wrapper {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.translation-progress-ai-history {
  border-top: 1px solid var(--white-opacity-20);
  background: var(--white-opacity-3);
  flex: 1;
  min-height: 200px;
  overflow-y: auto;
  overflow-x: hidden;
  resize: none;
  padding-left: 0;
  padding-right: 0;
  margin-left: 0;
  margin-right: 0;
}

.ai-history-content {
  padding: 1rem;
}

.ai-history-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem;
  color: var(--moon-opacity-60);
  font-size: 0.875rem;
}

.ai-history-tasks {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.ai-history-clear-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.5rem;
}

.ai-history-clear-button {
  color: var(--moon-opacity-70);
  font-size: 0.8125rem;
}

.ai-history-clear-button:hover {
  color: var(--red-500);
  background: var(--red-500-opacity-10);
}

.ai-history-task-item {
  padding: 1.25rem;
  border-radius: 6px;
  border: 1px solid var(--white-opacity-10);
  background: var(--white-opacity-5);
  transition: all 0.2s;
}

.ai-history-task-item.task-active {
  border-color: var(--primary-opacity-30);
  background: var(--primary-opacity-10);
}

.ai-history-task-item.task-completed {
  border-color: var(--green-500-opacity-30);
  background: var(--green-500-opacity-10);
}

.ai-history-task-item.task-error {
  border-color: var(--red-500-opacity-30);
  background: var(--red-500-opacity-10);
}

.ai-history-task-item.task-cancelled {
  border-color: var(--orange-500-opacity-30);
  background: var(--orange-500-opacity-10);
}

.ai-task-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.75rem;
  min-height: 2.5rem;
}

.ai-task-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}

.ai-task-fold-toggle {
  padding: 0.25rem;
  min-width: 1.5rem;
  height: 1.5rem;
  color: var(--moon-opacity-60);
  transition: all 0.2s;
}

.ai-task-fold-toggle:hover {
  color: var(--primary-opacity-80);
  background: var(--white-opacity-5);
}

.ai-task-status-icon {
  font-size: 0.875rem;
  flex-shrink: 0;
}

.ai-task-status-icon.pi-spinner {
  color: var(--primary-opacity-80);
}

.ai-task-status-icon.pi-check-circle {
  color: var(--green-500);
}

.ai-task-status-icon.pi-times-circle {
  color: var(--red-500);
}

.ai-task-status-icon.pi-ban {
  color: var(--orange-500);
}

.ai-task-model {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--moon-opacity-90);
  white-space: nowrap;
}

.ai-task-type-badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
}

.ai-task-status {
  font-size: 0.75rem;
  color: var(--moon-opacity-60);
  white-space: nowrap;
}

.ai-task-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.ai-task-duration {
  font-size: 0.75rem;
  color: var(--moon-opacity-60);
  white-space: nowrap;
}

.ai-task-stop {
  padding: 0.25rem;
  min-width: 1.5rem;
  height: 1.5rem;
}

.ai-task-content {
  overflow: hidden;
}

.ai-task-message {
  font-size: 0.8125rem;
  color: var(--moon-opacity-70);
  margin-top: 0.5rem;
  line-height: 1.4;
}

.ai-task-tabs {
  margin-top: 0.5rem;
}

.ai-task-tabs :deep(.p-tablist) {
  border-bottom: 1px solid var(--white-opacity-10);
  margin-bottom: 0.5rem;
}

.ai-task-tabs :deep(.p-tab) {
  padding: 0.5rem 1rem;
  font-size: 0.8125rem;
  color: var(--moon-opacity-60);
  transition: all 0.2s;
}

.ai-task-tabs :deep(.p-tab:hover) {
  color: var(--moon-opacity-80);
}

.ai-task-tabs :deep(.p-tab[aria-selected='true']) {
  color: var(--primary-opacity-90);
  border-bottom-color: var(--primary-opacity-80);
}

.ai-task-tabs :deep(.p-tab[disabled]) {
  opacity: 0.4;
  cursor: not-allowed;
}

.ai-task-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.ai-task-indicator {
  font-size: 0.75rem;
  color: var(--primary-opacity-80);
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.ai-task-tabs :deep(.p-tabpanels) {
  padding: 0;
}

/* 折叠/展开过渡动画 */
.task-content-enter-active,
.task-content-leave-active {
  transition: all 0.3s ease;
  max-height: 2000px;
  opacity: 1;
}

.task-content-enter-from,
.task-content-leave-to {
  max-height: 0;
  opacity: 0;
  margin-top: 0;
  margin-bottom: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.ai-task-thinking {
  padding: 0.5rem;
  border-radius: 4px;
  background: var(--white-opacity-3);
  border: 1px solid var(--white-opacity-5);
  font-size: 0.75rem;
  line-height: 1.5;
}

.ai-task-thinking-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.ai-task-thinking-label {
  color: var(--moon-opacity-50);
  font-weight: 500;
  margin-right: 0.5rem;
}

.ai-task-auto-scroll-toggle {
  color: var(--moon-opacity-50);
  padding: 0.25rem;
  min-width: auto;
  width: 1.5rem;
  height: 1.5rem;
  transition: all 0.2s;
}

.ai-task-auto-scroll-toggle:hover {
  color: var(--primary-opacity-80);
  background: var(--white-opacity-5);
}

.ai-task-auto-scroll-toggle.auto-scroll-enabled {
  color: var(--primary-opacity-80);
}

.ai-task-auto-tab-switching-toggle {
  color: var(--moon-opacity-50);
  padding: 0.25rem;
  min-width: auto;
  width: 1.5rem;
  height: 1.5rem;
  transition: all 0.2s;
}

.ai-task-auto-tab-switching-toggle:hover {
  color: var(--primary-opacity-80);
  background: var(--white-opacity-5);
}

.ai-task-auto-tab-switching-toggle.auto-tab-switching-enabled {
  color: var(--primary-opacity-80);
}

.ai-task-thinking-text {
  color: var(--moon-opacity-70);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 400px;
  overflow-y: auto;
  display: block;
  scroll-behavior: smooth;
}

.thinking-chunk-separator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin: 1rem 0;
  padding: 0.5rem;
  background: var(--primary-opacity-10);
  border: 1px solid var(--primary-opacity-30);
  border-radius: 4px;
  color: var(--primary-opacity-90);
  font-weight: 600;
  font-size: 0.8125rem;
}

.thinking-chunk-separator i {
  color: var(--primary-opacity-60);
  font-size: 0.75rem;
}

.thinking-tool-call {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.5rem 0;
  padding: 0.5rem;
  background: var(--blue-500-opacity-10);
  border-left: 3px solid var(--blue-500);
  border-radius: 2px;
  color: var(--blue-500);
  font-size: 0.8125rem;
}

.thinking-tool-call i {
  color: var(--blue-500);
  font-size: 0.875rem;
}

.thinking-tool-label {
  font-weight: 500;
  color: var(--blue-500-opacity-80);
}

.thinking-tool-name {
  color: var(--blue-500);
  font-weight: 600;
}

.thinking-tool-result {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.5rem 0;
  padding: 0.5rem;
  background: var(--green-500-opacity-10);
  border-left: 3px solid var(--green-500);
  border-radius: 2px;
  color: var(--green-500);
  font-size: 0.8125rem;
}

.thinking-tool-result i {
  color: var(--green-500);
  font-size: 0.875rem;
}

.thinking-tool-result .thinking-tool-label {
  font-weight: 500;
  color: var(--green-500-opacity-80);
}

.thinking-tool-content {
  color: var(--green-500);
  word-break: break-word;
}

.thinking-content {
  color: var(--moon-opacity-70);
  line-height: 1.6;
  margin: 0.25rem 0;
}

.ai-task-output {
  padding: 0.5rem;
  border-radius: 4px;
  background: var(--green-500-opacity-5);
  border: 1px solid var(--green-500-opacity-20);
  font-size: 0.75rem;
  line-height: 1.5;
}

.ai-task-output-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.ai-task-output-label {
  color: var(--green-500-opacity-80);
  font-weight: 500;
  margin-right: 0.5rem;
}

.ai-task-output-text {
  color: var(--moon-opacity-80);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 400px;
  overflow-y: auto;
  display: block;
  scroll-behavior: smooth;
  background: var(--white-opacity-3);
  padding: 0.5rem;
  border-radius: 2px;
  font-family: 'Courier New', monospace;
  font-size: 0.8125rem;
}

.ai-task-todos {
  padding: 0.5rem;
  border-radius: 4px;
  background: var(--white-opacity-3);
  border: 1px solid var(--white-opacity-5);
  font-size: 0.75rem;
  line-height: 1.5;
}

.ai-task-todos-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem;
  color: var(--moon-opacity-60);
  font-size: 0.875rem;
}

.ai-task-todos-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 400px;
  overflow-y: auto;
}

.ai-task-todo-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: 4px;
  transition: background 0.2s;
}

.ai-task-todo-item:hover {
  background: var(--white-opacity-5);
}

.ai-task-todo-item.todo-completed {
  opacity: 0.6;
}

.ai-task-todo-check-icon {
  font-size: 0.875rem;
  flex-shrink: 0;
  margin-top: 0.125rem;
}

.ai-task-todo-text {
  font-size: 0.8125rem;
  color: var(--moon-opacity-80);
  line-height: 1.4;
  flex: 1;
  word-break: break-word;
}
</style>
