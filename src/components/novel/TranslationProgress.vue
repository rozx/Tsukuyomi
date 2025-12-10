<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import Button from 'primevue/button';
import Badge from 'primevue/badge';
import ProgressBar from 'primevue/progressbar';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { TASK_TYPE_LABELS } from 'src/constants/ai';
import { TodoListService, type TodoItem } from 'src/services/todo-list-service';

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
const toast = useToastWithHistory();

const showAITaskHistory = ref(false);

// 待办事项列表
const todos = ref<TodoItem[]>([]);
const showTodoList = ref(false);

// 加载待办事项列表
const loadTodos = () => {
  todos.value = TodoListService.getAllTodos();
};

// 监听待办事项变化（通过 localStorage 事件）
const handleStorageChange = (e: StorageEvent) => {
  if (e.key === 'luna-ai-todo-list') {
    loadTodos();
  }
};

// Height adjustment state
const aiHistoryHeight = ref(400); // Default height in pixels
const isResizing = ref(false);
const resizeStartY = ref(0);
const resizeStartHeight = ref(400);

// Load saved height from localStorage
onMounted(() => {
  const savedHeight = localStorage.getItem('translation-progress-ai-history-height');
  if (savedHeight) {
    const height = parseInt(savedHeight, 10);
    if (height >= 200 && height <= 800) {
      aiHistoryHeight.value = height;
      resizeStartHeight.value = height;
    }
  }
  // 初始化时加载待办事项
  loadTodos();
  // 监听 localStorage 变化（跨标签页同步）
  window.addEventListener('storage', handleStorageChange);
});

// Save height to localStorage
const saveHeight = (height: number) => {
  localStorage.setItem('translation-progress-ai-history-height', height.toString());
};

// Resize handlers
const handleResizeStart = (e: MouseEvent | TouchEvent) => {
  e.preventDefault();
  isResizing.value = true;
  const clientY = 'touches' in e && e.touches[0] ? e.touches[0].clientY : (e as MouseEvent).clientY;
  resizeStartY.value = clientY;
  resizeStartHeight.value = aiHistoryHeight.value;
  document.addEventListener('mousemove', handleResizeMove);
  document.addEventListener('mouseup', handleResizeEnd);
  document.addEventListener('touchmove', handleResizeMove);
  document.addEventListener('touchend', handleResizeEnd);
};

const handleResizeMove = (e: MouseEvent | TouchEvent) => {
  if (!isResizing.value) return;
  e.preventDefault();
  const clientY = 'touches' in e && e.touches[0] ? e.touches[0].clientY : (e as MouseEvent).clientY;
  const deltaY = resizeStartY.value - clientY; // Inverted: dragging up increases height
  const newHeight = Math.max(200, Math.min(800, resizeStartHeight.value + deltaY));
  aiHistoryHeight.value = newHeight;
};

const handleResizeEnd = () => {
  if (isResizing.value) {
    isResizing.value = false;
    saveHeight(aiHistoryHeight.value);
  }
  document.removeEventListener('mousemove', handleResizeMove);
  document.removeEventListener('mouseup', handleResizeEnd);
  document.removeEventListener('touchmove', handleResizeMove);
  document.removeEventListener('touchend', handleResizeEnd);
};

onUnmounted(() => {
  document.removeEventListener('mousemove', handleResizeMove);
  document.removeEventListener('mouseup', handleResizeEnd);
  document.removeEventListener('touchmove', handleResizeMove);
  document.removeEventListener('touchend', handleResizeEnd);
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

// Recent AI Tasks - only show translation-related tasks
const recentAITasks = computed(() => {
  const allTasks = aiProcessingStore.activeTasks;
  // Filter to only show translation, polish, and proofreading tasks
  const translationTasks = allTasks.filter(
    (task) => task.type === 'translation' || task.type === 'polish' || task.type === 'proofreading',
  );
  return [...translationTasks].sort((a, b) => b.startTime - a.startTime).slice(0, 10);
});

// Auto Scroll State
const autoScrollEnabled = ref<Record<string, boolean>>({});
const autoScrollOutputEnabled = ref<Record<string, boolean>>({});

// Task Fold State
const taskFolded = ref<Record<string, boolean>>({});

const toggleTaskFold = (taskId: string) => {
  taskFolded.value[taskId] = !taskFolded.value[taskId];
};

const thinkingContainers = ref<Record<string, HTMLElement | null>>({});
const outputContainers = ref<Record<string, HTMLElement | null>>({});

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

const scrollToBottom = (container: HTMLElement) => {
  // 使用 requestAnimationFrame 确保在浏览器绘制后滚动
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
};

const toggleAutoScroll = (taskId: string) => {
  autoScrollEnabled.value[taskId] = !autoScrollEnabled.value[taskId];
  if (autoScrollEnabled.value[taskId]) {
    nextTick(() => {
      const container = thinkingContainers.value[taskId];
      if (container) {
        scrollToBottom(container);
      }
    });
  }
};

const toggleAutoScrollOutput = (taskId: string) => {
  autoScrollOutputEnabled.value[taskId] = !autoScrollOutputEnabled.value[taskId];
  if (autoScrollOutputEnabled.value[taskId]) {
    nextTick(() => {
      const container = outputContainers.value[taskId];
      if (container) {
        scrollToBottom(container);
      }
    });
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
  () => {
    // 使用 nextTick 确保 Vue 已更新 DOM，然后使用 requestAnimationFrame 确保浏览器已绘制
    nextTick(() => {
      requestAnimationFrame(() => {
        for (const task of recentAITasks.value) {
          if (autoScrollEnabled.value[task.id] && task.thinkingMessage) {
            const container = thinkingContainers.value[task.id];
            if (container) {
              container.scrollTop = container.scrollHeight;
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
  () => {
    // 使用 nextTick 确保 Vue 已更新 DOM，然后使用 requestAnimationFrame 确保浏览器已绘制
    nextTick(() => {
      requestAnimationFrame(() => {
        for (const task of recentAITasks.value) {
          if (autoScrollOutputEnabled.value[task.id] && task.outputContent) {
            const container = outputContainers.value[task.id];
            if (container) {
              container.scrollTop = container.scrollHeight;
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
          taskFolded.value[task.id] = true;
        } else {
          // Ensure active tasks are unfolded
          taskFolded.value[task.id] = false;
        }
      }
    }
  },
  { deep: true, flush: 'post' },
);
</script>

<template>
  <div v-if="isTranslating || isPolishing || isProofreading" class="translation-progress-toolbar">
    <div class="translation-progress-content">
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
      <Button
        icon="pi pi-list"
        :class="[
          'p-button-text p-button-sm translation-progress-history-toggle',
          { 'p-highlight': showAITaskHistory },
        ]"
        :title="showAITaskHistory ? '隐藏 AI 任务历史' : '显示 AI 任务历史'"
        @click="showAITaskHistory = !showAITaskHistory"
      />
      <Button
        icon="pi pi-check-square"
        :class="[
          'p-button-text p-button-sm translation-progress-todo-toggle',
          { 'p-highlight': showTodoList },
        ]"
        :title="showTodoList ? '隐藏待办事项' : '显示待办事项'"
        @click="showTodoList = !showTodoList"
      >
        <span
          v-if="todos.filter((t) => !t.completed).length > 0"
          class="ml-1 px-1 py-0.5 text-xs font-medium rounded bg-primary-500/30 text-primary-200"
        >
          {{ todos.filter((t) => !t.completed).length }}
        </span>
      </Button>
      <Button
        icon="pi pi-times"
        label="取消"
        class="p-button-text p-button-sm translation-progress-cancel"
        @click="emit('cancel')"
      />
    </div>
    <!-- AI 任务历史 -->
    <div v-if="showAITaskHistory" class="translation-progress-ai-history-wrapper">
      <div
        class="translation-progress-ai-history-resize-handle"
        @mousedown="handleResizeStart"
        @touchstart="handleResizeStart"
        :class="{ resizing: isResizing }"
        title="拖拽调整高度"
      >
        <i class="pi pi-grip-lines-vertical"></i>
      </div>
      <div class="translation-progress-ai-history" :style="{ height: `${aiHistoryHeight}px` }">
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
                  <div
                    v-if="task.thinkingMessage && task.thinkingMessage.trim()"
                    class="ai-task-thinking"
                  >
                    <div class="ai-task-thinking-header">
                      <span class="ai-task-thinking-label">思考过程：</span>
                      <Button
                        :icon="autoScrollEnabled[task.id] ? 'pi pi-arrow-down' : 'pi pi-arrows-v'"
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
                    </div>
                    <div
                      :ref="(el) => setThinkingContainer(task.id, el as HTMLElement)"
                      class="ai-task-thinking-text"
                    >
                      <template
                        v-for="(part, index) in formatThinkingMessage(task.thinkingMessage || '')"
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
                        <div v-else-if="part.type === 'tool-result'" class="thinking-tool-result">
                          <i class="pi pi-check-circle"></i>
                          <span class="thinking-tool-label">工具结果：</span>
                          <span class="thinking-tool-content">{{ part.toolName }}</span>
                        </div>
                        <div v-else class="thinking-content">{{ part.text }}</div>
                      </template>
                    </div>
                  </div>
                  <div
                    v-if="task.outputContent && task.outputContent.trim()"
                    class="ai-task-output"
                  >
                    <div class="ai-task-output-header">
                      <span class="ai-task-output-label">输出内容：</span>
                      <Button
                        :icon="
                          autoScrollOutputEnabled[task.id] ? 'pi pi-arrow-down' : 'pi pi-arrows-v'
                        "
                        :class="[
                          'p-button-text p-button-sm ai-task-auto-scroll-toggle',
                          { 'auto-scroll-enabled': autoScrollOutputEnabled[task.id] },
                        ]"
                        :title="
                          autoScrollOutputEnabled[task.id]
                            ? '禁用自动滚动'
                            : '启用自动滚动（新内容出现时自动滚动到底部）'
                        "
                        @click="toggleAutoScrollOutput(task.id)"
                      />
                    </div>
                    <div
                      :ref="(el) => setOutputContainer(task.id, el as HTMLElement)"
                      class="ai-task-output-text"
                    >
                      {{ task.outputContent }}
                    </div>
                  </div>
                </div>
              </Transition>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- 待办事项列表 -->
    <div v-if="showTodoList" class="translation-progress-todo-wrapper">
      <div class="translation-progress-todo">
        <div class="todo-header">
          <span class="todo-title">待办事项</span>
          <span v-if="todos.filter((t) => !t.completed).length > 0" class="todo-count">
            {{ todos.filter((t) => !t.completed).length }} 个未完成
          </span>
        </div>
        <div v-if="todos.length === 0" class="todo-empty">
          <i class="pi pi-info-circle"></i>
          <span>暂无待办事项</span>
        </div>
        <div v-else class="todo-list">
          <div
            v-for="todo in todos"
            :key="todo.id"
            class="todo-item"
            :class="{ 'todo-completed': todo.completed }"
          >
            <i
              class="pi todo-check-icon"
              :class="todo.completed ? 'pi-check-circle text-green-400' : 'pi-circle text-moon-50'"
            ></i>
            <span class="todo-text" :class="{ 'line-through': todo.completed }">
              {{ todo.text }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.translation-progress-toolbar {
  flex-shrink: 0;
  padding: 0.75rem 1.5rem;
  background: var(--white-opacity-95);
  backdrop-filter: blur(10px);
  border-top: 1px solid var(--white-opacity-20);
  box-shadow: 0 -2px 12px var(--black-opacity-10);
  z-index: 10;
}

.translation-progress-content {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  max-width: 56rem;
  margin: 0 auto;
}

.translation-progress-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
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
  min-width: 200px;
  max-width: 400px;
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
  min-width: 4rem;
  text-align: right;
}

.translation-progress-history-toggle {
  flex-shrink: 0;
}

.translation-progress-cancel {
  flex-shrink: 0;
}

/* AI 任务历史 */
.translation-progress-ai-history-wrapper {
  position: relative;
  border-top: 1px solid var(--white-opacity-20);
}

.translation-progress-ai-history-resize-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--white-opacity-10);
  cursor: ns-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
  transition: background 0.2s;
  user-select: none;
  -webkit-user-select: none;
}

.translation-progress-ai-history-resize-handle:hover {
  background: var(--primary-opacity-30);
}

.translation-progress-ai-history-resize-handle.resizing {
  background: var(--primary-opacity-50);
}

.translation-progress-ai-history-resize-handle i {
  font-size: 0.75rem;
  color: var(--moon-opacity-40);
  pointer-events: none;
}

.translation-progress-ai-history-resize-handle:hover i,
.translation-progress-ai-history-resize-handle.resizing i {
  color: var(--primary-opacity-80);
}

.translation-progress-ai-history {
  border-top: 1px solid var(--white-opacity-20);
  background: var(--white-opacity-3);
  height: 400px;
  overflow-y: auto;
  overflow-x: hidden;
  resize: none;
}

.ai-history-content {
  padding: 1rem 1.5rem;
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
  gap: 0.75rem;
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
  padding: 0.75rem;
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
  margin-bottom: 0.5rem;
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
  margin-top: 0.5rem;
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

.ai-task-thinking-text {
  color: var(--moon-opacity-70);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
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
  margin-top: 0.5rem;
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
  max-height: 200px;
  overflow-y: auto;
  display: block;
  scroll-behavior: smooth;
  background: var(--white-opacity-3);
  padding: 0.5rem;
  border-radius: 2px;
  font-family: 'Courier New', monospace;
  font-size: 0.8125rem;
}

/* 待办事项列表 */
.translation-progress-todo-wrapper {
  border-top: 1px solid var(--white-opacity-20);
}

.translation-progress-todo {
  background: var(--white-opacity-3);
  padding: 1rem 1.5rem;
  max-height: 300px;
  overflow-y: auto;
}

.todo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--white-opacity-10);
}

.todo-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--moon-opacity-90);
}

.todo-count {
  font-size: 0.75rem;
  color: var(--primary-opacity-80);
  font-weight: 500;
}

.todo-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem;
  color: var(--moon-opacity-60);
  font-size: 0.875rem;
}

.todo-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: 4px;
  transition: background 0.2s;
}

.todo-item:hover {
  background: var(--white-opacity-5);
}

.todo-item.todo-completed {
  opacity: 0.6;
}

.todo-check-icon {
  font-size: 0.875rem;
  flex-shrink: 0;
  margin-top: 0.125rem;
}

.todo-text {
  font-size: 0.8125rem;
  color: var(--moon-opacity-80);
  line-height: 1.4;
  flex: 1;
  word-break: break-word;
}

.translation-progress-todo-toggle {
  flex-shrink: 0;
}
</style>
