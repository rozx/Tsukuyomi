<script setup lang="ts">
import type { Ref } from 'vue';
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import Button from 'primevue/button';
import Badge from 'primevue/badge';
import ProgressBar from 'primevue/progressbar';
import Popover from 'primevue/popover';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import { useAIProcessingStore, type AIProcessingTask } from 'src/stores/ai-processing';
import { useBookDetailsStore } from 'src/stores/book-details';
import { useBooksStore } from 'src/stores/books';
import { useContextStore } from 'src/stores/context';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { TASK_TYPE_LABELS, AI_WORKFLOW_STATUS_LABELS } from 'src/constants/ai';
import { TodoListService, type TodoItem } from 'src/services/todo-list-service';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';
import { throttle } from 'src/utils/throttle';

// 常量定义
const UPDATE_THRESHOLD_MS = 2000; // 更新时间阈值（毫秒）
const THROTTLE_DELAY_MS = 100; // 节流延迟（毫秒）
const FORMAT_CACHE_THROTTLE_MS = 200; // 格式化缓存节流延迟（毫秒）

// 任务状态标签
const taskStatusLabels: Record<string, string> = {
  thinking: '思考中',
  processing: '处理中',
  end: '已完成',
  error: '错误',
  cancelled: '已取消',
};

// 存储所有节流函数的清理函数
const throttleCleanups: Array<() => void> = [];

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
  (e: 'cancel', taskType: string, chapterId?: string): void;
}>();

const aiProcessingStore = useAIProcessingStore();
const bookDetailsStore = useBookDetailsStore();
const booksStore = useBooksStore();
const contextStore = useContextStore();
const toast = useToastWithHistory();
const now = ref(Date.now());
let nowTimer: number | null = null;
const toolResultPopoverRef = ref<InstanceType<typeof Popover> | null>(null);
const activeToolResultPopupContent = ref('');
const activeToolResultPopupKey = ref('');

// 待办事项列表
const todos = ref<TodoItem[]>([]);

// Show Only Current Chapter State - 从 store 获取
const showOnlyCurrentChapter = computed(
  () => bookDetailsStore.translationProgress.showOnlyCurrentChapter,
);

// 获取当前选中的章节 ID（基于当前正在查看的书籍）
const currentSelectedChapterId = computed(() => {
  const currentBookId = contextStore.currentBookId;
  if (!currentBookId) return null;
  return bookDetailsStore.selectedChapter[currentBookId] || null;
});

// 切换是否只显示当前章节的进度
const toggleShowOnlyCurrentChapter = () => {
  bookDetailsStore.toggleTranslationProgressShowOnlyCurrentChapter();
};

// Recent AI Tasks - only show translation-related tasks
// 为了代码逻辑清晰，将 recentAITasks 放在 loadTodos 之前，因为 loadTodos 会使用它（但这不是技术上的要求）
const recentAITasks = computed(() => {
  const allTasks = aiProcessingStore.activeTasks;
  // Filter to only show translation, polish, and proofreading tasks
  let translationTasks = allTasks.filter(
    (task) => task.type === 'translation' || task.type === 'polish' || task.type === 'proofreading',
  );

  // 如果启用了"只显示当前章节"，则进一步过滤
  if (showOnlyCurrentChapter.value && currentSelectedChapterId.value) {
    translationTasks = translationTasks.filter(
      (task) => task.chapterId === currentSelectedChapterId.value,
    );
  }

  return [...translationTasks].sort((a, b) => b.startTime - a.startTime).slice(0, 10);
});

const stopTask = (task: AIProcessingTask) => {
  void aiProcessingStore.stopTask(task.id);
  // 始终发出 cancel 事件，携带任务类型和章节 ID，
  // 让父组件能精确取消对应章节的对应任务类型
  emit('cancel', task.type, task.chapterId);
};

/**
 * 获取任务“当前工作章节”的展示文本
 * - 优先使用 task.chapterTitle（如果任务创建时提供）
 * - 否则使用 bookId + chapterId 从 booksStore 反查章节标题
 * - 最后退化为 chapterId
 */
const getWorkingChapterLabel = (task: AIProcessingTask): string | null => {
  const title = task.chapterTitle?.trim();
  if (title) return title;

  if (task.bookId && task.chapterId) {
    const book = booksStore.getBookById(task.bookId);
    if (book?.volumes) {
      for (const volume of book.volumes) {
        const chapter = volume.chapters?.find((c) => c.id === task.chapterId);
        if (chapter) {
          const displayTitle = getChapterDisplayTitle(chapter, book).trim();
          if (displayTitle) return displayTitle;
        }
      }
    }
  }

  return task.chapterId || null;
};

const getTaskStatusLabel = (task: AIProcessingTask) => {
  if (task.status === 'error') return '错误';
  if (task.status === 'cancelled') return '已取消';
  if (task.workflowStatus) {
    return AI_WORKFLOW_STATUS_LABELS[task.workflowStatus] || task.workflowStatus;
  }
  return taskStatusLabels[task.status] || task.status;
};

const currentActiveTask = computed(() => {
  return (
    recentAITasks.value.find((t) => t.status === 'thinking' || t.status === 'processing') || null
  );
});

const progressTaskId = computed(() => {
  const isWorking = props.isTranslating || props.isPolishing || props.isProofreading;
  if (!isWorking || props.progress.total <= 0) {
    return null;
  }
  return currentActiveTask.value?.id || null;
});

// 判断是否为具有确定进度数据的活跃任务
const isActiveProgressTask = (task: AIProcessingTask): boolean => {
  return progressTaskId.value === task.id;
};

// 所有处于工作状态（thinking/processing）的任务都显示进度条
const shouldShowTaskProgress = (task: AIProcessingTask): boolean => {
  return task.status === 'thinking' || task.status === 'processing';
};

const getTaskProgressPercent = (task: AIProcessingTask): number => {
  if (!isActiveProgressTask(task) || props.progress.total <= 0) {
    return 0;
  }
  const value = (props.progress.current / props.progress.total) * 100;
  return Math.max(0, Math.min(100, value));
};

const progressMessagePattern = /^正在(翻译|润色|校对)第\s*\d+\/\d+\s*部分\.?\.?\.?$/;

const progressMessage = computed(() => {
  return props.progress?.message?.trim() || '';
});

const chunkProgressMessage = computed(() => {
  const message = progressMessage.value;
  if (!message || !progressMessagePattern.test(message)) {
    return '';
  }
  return message;
});

const getDisplayTaskMessage = (task: AIProcessingTask): string => {
  const message = task.message?.trim() || '';
  if (!message) return '';
  if (progressMessagePattern.test(message)) return '';
  if (
    shouldShowTaskProgress(task) &&
    chunkProgressMessage.value &&
    message === chunkProgressMessage.value
  ) {
    return '';
  }
  return message;
};

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

// 监听 recentAITasks 变化，重新加载待办事项 - 只监听任务 ID 列表变化
watch(
  () => recentAITasks.value.map((t) => t.id),
  () => {
    loadTodos();
  },
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
  nowTimer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  // 清理 storage 事件监听
  window.removeEventListener('storage', handleStorageChange);
  toolResultPopoverRef.value?.hide();
  if (nowTimer !== null) {
    clearInterval(nowTimer);
    nowTimer = null;
  }
  // 清理所有节流函数的 timeout
  for (const cleanup of throttleCleanups) {
    cleanup();
  }
  // 清理动态创建的按 taskId 节流器（避免内存泄漏）
  formattedThinkingThrottles.forEach((t) => t.cleanup());
  formattedThinkingThrottles.clear();
  displayedOutputThrottles.forEach((t) => t.cleanup());
  displayedOutputThrottles.clear();
  // 清理缓存和状态，显式设置为 null 以帮助垃圾回收
  formattedThinkingCache.value = {};
  displayedOutputContent.value = {};
  outputBreakPositions.value = {};
  pendingOutputBreak.value = {};
  lastThinkingUpdate.value = {};
  lastOutputUpdate.value = {};
  lastActiveState.value = {};
  // 清理容器引用
  for (const taskId of Object.keys(thinkingContainers.value)) {
    thinkingContainers.value[taskId] = null;
  }
  for (const taskId of Object.keys(outputContainers.value)) {
    outputContainers.value[taskId] = null;
  }
  for (const taskId of Object.keys(todosContainers.value)) {
    todosContainers.value[taskId] = null;
  }
});

// Auto Scroll State - 从 store 获取，使用 computed 以便响应式更新
// 默认启用自动滚动（undefined 视为 true）
const autoScrollEnabled = computed(() => {
  const storeValue = bookDetailsStore.translationProgress.autoScrollEnabled;
  return (taskId: string) => storeValue[taskId] !== false;
});

// Auto Tab Switching State - 从 store 获取
const autoTabSwitchingEnabled = computed(
  () => bookDetailsStore.translationProgress.autoTabSwitchingEnabled,
);

// Task Fold State - 从 store 获取
const taskFolded = computed(() => bookDetailsStore.translationProgress.taskFolded);

const toggleTaskFold = (taskId: string) => {
  const currentFolded = taskFolded.value[taskId] || false;
  bookDetailsStore.setTranslationProgressTaskFolded(taskId, !currentFolded);
};

// Active Tab State for each task - 从 store 获取
const activeTab = computed(() => bookDetailsStore.translationProgress.activeTab);
// Track the last active state for each task to detect state changes
// 使用 Partial 允许键不存在时返回 undefined
const lastActiveState = ref<Partial<Record<string, 'thinking' | 'outputting' | 'none'>>>({});

// Track last update time for thinkingMessage and outputContent to determine which is actively updating
const lastThinkingUpdate = ref<Record<string, number>>({});
const lastOutputUpdate = ref<Record<string, number>>({});

// 公共函数：检查是否最近更新过
const isRecentlyUpdated = (
  taskId: string,
  updateMap: Ref<Record<string, number>>,
  threshold = UPDATE_THRESHOLD_MS,
): boolean => {
  const updateTime = updateMap.value[taskId] || 0;
  const now = Date.now();
  return updateTime > 0 && now - updateTime < threshold;
};

const setActiveTab = (taskId: string, value: string) => {
  bookDetailsStore.setTranslationProgressActiveTab(taskId, value);
};

// 辅助函数：检查是否应该自动切换标签页
const shouldAutoSwitchTab = (taskId: string): boolean => {
  return autoTabSwitchingEnabled.value[taskId] !== false;
};

// 辅助函数：获取当前活跃状态
const getCurrentActiveState = (taskId: string): 'thinking' | 'outputting' | 'none' => {
  const isThinking = isTaskThinking(taskId);
  const isOutputting = isTaskOutputting(taskId);
  return isThinking ? 'thinking' : isOutputting ? 'outputting' : 'none';
};

// 辅助函数：检测状态是否改变
const detectStateChange = (taskId: string): boolean => {
  const currentState = getCurrentActiveState(taskId);
  const lastState = lastActiveState.value[taskId];
  // 检查 lastState 是否存在且与当前状态不同
  return lastState !== undefined && lastState !== currentState;
};

// 辅助函数：根据内容确定默认标签页
const determineDefaultTab = (task: AIProcessingTask): string => {
  const isThinking = isTaskThinking(task.id);
  const isOutputting = isTaskOutputting(task.id);

  if (isOutputting) {
    return 'output';
  } else if (isThinking) {
    return 'thinking';
  }

  // 无活跃状态，使用内容基础默认值
  const hasThinking = task.thinkingMessage && task.thinkingMessage.trim();
  const hasOutput = task.outputContent && task.outputContent.trim();
  return hasOutput && !hasThinking ? 'output' : 'thinking';
};

const getActiveTab = (taskId: string): string => {
  const task = recentAITasks.value.find((t) => t.id === taskId);
  if (!task) {
    return activeTab.value[taskId] || 'thinking';
  }

  // 如果禁用了自动标签页切换，直接返回用户手动选择的标签页
  if (!shouldAutoSwitchTab(taskId)) {
    return activeTab.value[taskId] || 'thinking';
  }

  const currentState = getCurrentActiveState(taskId);
  const lastState = lastActiveState.value[taskId];

  // 如果状态改变，清除保存的标签页以允许自动切换
  if (detectStateChange(taskId)) {
    bookDetailsStore.clearTranslationProgressActiveTab(taskId);
  }

  // 更新最后活跃状态
  lastActiveState.value[taskId] = currentState;

  // 如果用户手动选择了标签页且状态未改变，尊重用户选择
  const savedTab = activeTab.value[taskId];
  if (savedTab && lastState === currentState) {
    return savedTab;
  }

  // 否则，自动切换到适当的标签页
  return determineDefaultTab(task);
};

// 检查任务是否正在思考
const isTaskThinking = (taskId: string): boolean => {
  const task = recentAITasks.value.find((t) => t.id === taskId);
  if (!task) return false;

  // 如果状态是 'thinking'，检查是否有最近的更新
  if (task.status === 'thinking') {
    const thinkingTime = lastThinkingUpdate.value[taskId] || 0;
    const now = Date.now();
    // 如果状态是 thinking 但最近阈值内没有更新，不显示指示器
    if (thinkingTime > 0 && now - thinkingTime >= UPDATE_THRESHOLD_MS) {
      return false;
    }
    return true;
  }

  // 如果状态是 'processing'，需要判断是思考还是输出
  if (task.status === 'processing') {
    const hasThinking =
      task.thinkingMessage !== undefined && task.thinkingMessage.trim().length > 0;
    if (!hasThinking) {
      return false;
    }

    const recentThinking = isRecentlyUpdated(taskId, lastThinkingUpdate);

    // 只有在最近阈值内更新过才显示思考指示器
    if (!recentThinking) {
      return false;
    }

    const hasOutput = task.outputContent !== undefined && task.outputContent.trim().length > 0;

    // 如果只有思考消息，没有输出，显示思考指示器
    if (!hasOutput) {
      return true;
    }

    // 如果两者都有，根据最后更新时间判断哪个更活跃
    const recentOutput = isRecentlyUpdated(taskId, lastOutputUpdate);

    // 如果思考消息最近更新过，而输出内容没有最近更新，显示思考指示器
    if (recentThinking && !recentOutput) {
      return true;
    }
    // 如果两者都最近更新过，但思考消息更新更晚，显示思考指示器
    const thinkingTime = lastThinkingUpdate.value[taskId] || 0;
    const outputTime = lastOutputUpdate.value[taskId] || 0;
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

  // 检查输出内容是否在最近阈值内更新过
  const recentOutput = isRecentlyUpdated(taskId, lastOutputUpdate);

  // 只有在最近阈值内更新过才显示输出指示器
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
  const recentThinking = isRecentlyUpdated(taskId, lastThinkingUpdate);

  // 如果输出内容最近更新过，而思考消息没有最近更新，显示输出指示器
  if (recentOutput && !recentThinking) {
    return true;
  }
  // 如果两者都最近更新过，但输出内容更新更晚，显示输出指示器
  const thinkingTime = lastThinkingUpdate.value[taskId] || 0;
  const outputTime = lastOutputUpdate.value[taskId] || 0;
  if (recentThinking && recentOutput && outputTime > thinkingTime) {
    return true;
  }

  return false;
};

const thinkingContainers = ref<Record<string, HTMLElement | null>>({});
const outputContainers = ref<Record<string, HTMLElement | null>>({});
const todosContainers = ref<Record<string, HTMLElement | null>>({});

const setThinkingContainer = (taskId: string, el: unknown) => {
  if (el instanceof HTMLElement) {
    thinkingContainers.value[taskId] = el;
  } else {
    // 显式设置为 null 以帮助垃圾回收，避免内存泄漏
    thinkingContainers.value[taskId] = null;
  }
};

const setOutputContainer = (taskId: string, el: unknown) => {
  if (el instanceof HTMLElement) {
    outputContainers.value[taskId] = el;
  } else {
    // 显式设置为 null 以帮助垃圾回收，避免内存泄漏
    outputContainers.value[taskId] = null;
  }
};

const setTodosContainer = (taskId: string, el: unknown) => {
  if (el instanceof HTMLElement) {
    todosContainers.value[taskId] = el;
  } else {
    // 显式设置为 null 以帮助垃圾回收，避免内存泄漏
    todosContainers.value[taskId] = null;
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
  const currentEnabled = autoScrollEnabled.value(taskId);
  bookDetailsStore.setTranslationProgressAutoScroll(taskId, !currentEnabled);
  if (!currentEnabled) {
    nextTick(() => {
      // 根据当前激活的标签页滚动对应的容器
      const currentActiveTab = getActiveTab(taskId);
      let container: HTMLElement | null = null;

      if (currentActiveTab === 'thinking') {
        container = thinkingContainers.value[taskId] ?? null;
      } else if (currentActiveTab === 'output') {
        container = outputContainers.value[taskId] ?? null;
      } else if (currentActiveTab === 'todos') {
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

const clearReviewedTasks = async () => {
  try {
    // Only clear translation-related reviewed tasks
    const translationTasks = aiProcessingStore.activeTasks.filter(
      (task) =>
        (task.type === 'translation' || task.type === 'polish' || task.type === 'proofreading') &&
        (task.status === 'end' || task.status === 'error' || task.status === 'cancelled'),
    );

    // Remove each translation-related reviewed task concurrently
    await Promise.all(translationTasks.map((task) => aiProcessingStore.removeTask(task.id)));
    // Cleanup UI state memory leak
    translationTasks.forEach((task) => {
      bookDetailsStore.clearTaskTranslationProgress(task.id);
    });

    toast.add({
      severity: 'success',
      summary: '清除成功',
      detail: `已清除 ${translationTasks.length} 个翻译相关的已结束任务`,
      life: 3000,
    });
  } catch (error) {
    console.error('Failed to clear reviewed tasks:', error);
    toast.add({
      severity: 'error',
      summary: '清除失败',
      detail: error instanceof Error ? error.message : '未知错误',
      life: 3000,
    });
  }
};

const formatTaskDuration = (startTime: number, endTime?: number): string => {
  const end = endTime || now.value;
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
  toolResult?: string;
  toolResultTone?: ToolResultTone;
  toolCallTone?: ToolCallTone;
  chunkInfo?: string;
}

type ToolResultTone = 'success' | 'warning' | 'error';
type ToolCallTone = 'running' | 'success' | 'warning' | 'error' | 'cancelled';

// 提取正则表达式为模块级常量，避免重复创建
const CHUNK_SEPARATOR_PATTERN = /\[=== (翻译|润色|校对)块 (\d+\/\d+) ===\]/g;
const TOOL_CALL_PATTERN = /\[调用工具: ([^\]]+)\]/g;
const TOOL_RESULT_ERROR_PATTERN =
  /error|failed?|exception|forbidden|denied|invalid|timeout|not found|失败|错误|异常|拒绝|超时|无效|未找到/i;
const TOOL_RESULT_WARNING_PATTERN = /warning|warn|警告|注意|deprecated|fallback|重试/i;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

interface ToolResultMarkerMatch {
  index: number;
  fullText: string;
  content: string;
}

function extractToolResultMarkerMatches(message: string): ToolResultMarkerMatch[] {
  const matches: ToolResultMarkerMatch[] = [];
  const prefix = '[工具结果: ';
  let searchStart = 0;

  while (searchStart < message.length) {
    const startIndex = message.indexOf(prefix, searchStart);
    if (startIndex === -1) break;

    const contentStart = startIndex + prefix.length;
    let i = contentStart;
    let inString = false;
    let quoteChar = '';
    let escaped = false;
    let bracketDepth = 0;
    let closeIndex = -1;

    for (; i < message.length; i++) {
      const char = message[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (inString) {
        if (char === quoteChar) {
          inString = false;
          quoteChar = '';
        }
        continue;
      }

      if (char === '"' || char === "'") {
        inString = true;
        quoteChar = char;
        continue;
      }

      if (char === '[') {
        bracketDepth++;
        continue;
      }

      if (char === ']') {
        if (bracketDepth === 0) {
          closeIndex = i;
          break;
        }
        bracketDepth--;
      }
    }

    if (closeIndex === -1) {
      break;
    }

    const fullText = message.slice(startIndex, closeIndex + 1);
    const content = message.slice(contentStart, closeIndex);
    matches.push({
      index: startIndex,
      fullText,
      content,
    });
    searchStart = closeIndex + 1;
  }

  return matches;
}

function formatToolResultPreview(toolResult: string): string {
  const compact = toolResult.replace(/\s+/g, ' ').trim();
  if (compact.length <= 100) return compact;
  return `${compact.slice(0, 100)}...`;
}

function formatToolResultTooltip(toolResult: string): string {
  const trimmed = toolResult.trim();
  if (!trimmed) return '';

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return toolResult;
  }
}

function detectToolResultTone(toolResult: string): ToolResultTone {
  const trimmed = toolResult.trim();
  if (!trimmed) return 'warning';

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (isObjectRecord(parsed)) {
      if (parsed.success === false) return 'error';
      if (typeof parsed.error === 'string' && parsed.error.trim()) return 'error';
      if (typeof parsed.warning === 'string' && parsed.warning.trim()) return 'warning';
      if (Array.isArray(parsed.warnings) && parsed.warnings.length > 0) return 'warning';
      if (parsed.success === true) return 'success';
    }
  } catch {
    // 非 JSON 内容回退到关键词判断
  }

  if (TOOL_RESULT_ERROR_PATTERN.test(trimmed)) return 'error';
  if (TOOL_RESULT_WARNING_PATTERN.test(trimmed)) return 'warning';
  return 'success';
}

function getToolResultLabel(tone?: ToolResultTone): string {
  if (tone === 'error') return '工具结果（失败）';
  if (tone === 'warning') return '工具结果（警告）';
  return '工具结果（成功）';
}

function getToolResultHint(tone?: ToolResultTone): string {
  if (tone === 'error') return '请检查错误详情';
  if (tone === 'warning') return '请留意提示信息';
  return '点击查看完整内容';
}

function toggleToolResultPopup(event: Event, part: FormattedMessagePart): void {
  const content = part.toolResult?.trim();
  if (!content) return;

  const popupKey = `${part.text}-${part.toolResultTone || 'success'}`;
  const isSameTarget = activeToolResultPopupKey.value === popupKey;

  activeToolResultPopupContent.value = content;
  activeToolResultPopupKey.value = popupKey;

  if (!toolResultPopoverRef.value) return;

  if (!isSameTarget) {
    toolResultPopoverRef.value.hide();
    nextTick(() => {
      toolResultPopoverRef.value?.toggle(event);
    });
    return;
  }

  toolResultPopoverRef.value.toggle(event);
}

function mapToolResultToneToToolCallTone(tone: ToolResultTone): ToolCallTone {
  if (tone === 'error') return 'error';
  if (tone === 'warning') return 'warning';
  return 'success';
}

function getToolCallTone(task: AIProcessingTask, part: FormattedMessagePart): ToolCallTone {
  if (part.toolCallTone) return part.toolCallTone;
  if (task.status === 'cancelled') return 'cancelled';
  if (task.status === 'error') return 'error';
  if (task.status === 'end') return 'success';
  return 'running';
}

function getToolCallHint(task: AIProcessingTask, part: FormattedMessagePart): string {
  const tone = getToolCallTone(task, part);
  if (tone === 'cancelled') return '已取消';
  if (tone === 'error') return '已失败';
  if (tone === 'warning') return '有警告';
  if (tone === 'success') return '已完成';
  return '调用中';
}

function getToolCallIconClass(task: AIProcessingTask, part: FormattedMessagePart): string {
  const tone = getToolCallTone(task, part);
  if (tone === 'cancelled') return 'pi pi-ban';
  if (tone === 'error') return 'pi pi-times-circle';
  if (tone === 'warning') return 'pi pi-exclamation-triangle';
  if (tone === 'success') return 'pi pi-check-circle';
  return 'pi pi-cog pi-spin';
}

const formatThinkingMessage = (
  message: string,
  taskStatus?: AIProcessingTask['status'],
): FormattedMessagePart[] => {
  if (!message) return [];

  const parts: FormattedMessagePart[] = [];
  let currentIndex = 0;

  // 收集所有匹配项及其位置
  const matches: Array<{
    index: number;
    type: 'chunk-separator' | 'tool-call' | 'tool-result';
    match: RegExpMatchArray;
  }> = [];

  let match;
  while ((match = CHUNK_SEPARATOR_PATTERN.exec(message)) !== null) {
    matches.push({ index: match.index, type: 'chunk-separator', match });
  }
  CHUNK_SEPARATOR_PATTERN.lastIndex = 0;

  while ((match = TOOL_CALL_PATTERN.exec(message)) !== null) {
    matches.push({ index: match.index, type: 'tool-call', match });
  }
  TOOL_CALL_PATTERN.lastIndex = 0;

  for (const markerMatch of extractToolResultMarkerMatches(message)) {
    const syntheticMatch = [
      markerMatch.fullText,
      markerMatch.content,
    ] as unknown as RegExpMatchArray;
    matches.push({ index: markerMatch.index, type: 'tool-result', match: syntheticMatch });
  }

  // 按位置排序
  matches.sort((a, b) => a.index - b.index);

  const pendingToolCallPartIndexes: number[] = [];

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
          toolCallTone: 'running',
        });
        pendingToolCallPartIndexes.push(parts.length - 1);
      }
    } else if (type === 'tool-result') {
      if (match[1]) {
        const tone = detectToolResultTone(match[1]);
        const toolCallTone = mapToolResultToneToToolCallTone(tone);
        const matchedToolCallIndex = pendingToolCallPartIndexes.shift();
        if (matchedToolCallIndex !== undefined) {
          const matchedToolCallPart = parts[matchedToolCallIndex];
          if (matchedToolCallPart?.type === 'tool-call') {
            matchedToolCallPart.toolCallTone = toolCallTone;
          }
        }
        parts.push({
          type: 'tool-result',
          text: match[0],
          toolName: formatToolResultPreview(match[1]),
          toolResult: formatToolResultTooltip(match[1]),
          toolResultTone: tone,
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

  if (pendingToolCallPartIndexes.length > 0) {
    const fallbackTone: ToolCallTone =
      taskStatus === 'cancelled'
        ? 'cancelled'
        : taskStatus === 'error'
          ? 'error'
          : taskStatus === 'end'
            ? 'success'
            : 'running';
    for (const toolCallPartIndex of pendingToolCallPartIndexes) {
      const toolCallPart = parts[toolCallPartIndex];
      if (toolCallPart?.type === 'tool-call') {
        toolCallPart.toolCallTone = fallbackTone;
      }
    }
  }

  return parts;
};

// 缓存格式化后的思考消息：用“按 taskId 更新 + 节流”的方式，避免每个 token 都触发全量解析
const formattedThinkingCache = ref<Record<string, FormattedMessagePart[]>>({});

const formattedThinkingThrottles = new Map<
  string,
  { fn: (id: string) => void; cleanup: () => void }
>();
const getFormattedThinkingThrottle = (taskId: string) => {
  if (!formattedThinkingThrottles.has(taskId)) {
    const throttler = throttle((id: string) => {
      const task = recentAITasks.value.find((t) => t.id === id);
      const msg = task?.thinkingMessage ?? '';
      formattedThinkingCache.value[id] = msg ? formatThinkingMessage(msg, task?.status) : [];
    }, FORMAT_CACHE_THROTTLE_MS);
    formattedThinkingThrottles.set(taskId, throttler);
  }
  return formattedThinkingThrottles.get(taskId)!;
};

// 获取格式化后的思考消息（从缓存中读取）
const getFormattedThinkingMessage = (taskId: string): FormattedMessagePart[] => {
  return formattedThinkingCache.value[taskId] || [];
};

// 节流后的滚动处理函数
const handleThinkingScroll = throttle(() => {
  requestAnimationFrame(() => {
    for (const task of recentAITasks.value) {
      if (autoScrollEnabled.value(task.id) && task.thinkingMessage) {
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
}, THROTTLE_DELAY_MS);
// 注册清理函数
throttleCleanups.push(handleThinkingScroll.cleanup);

// Auto scroll watcher for thinking message - 优化为只监听长度变化，避免深度监听
watch(
  () =>
    recentAITasks.value.map((task) => ({
      id: task.id,
      length: task.thinkingMessage?.length || 0,
    })),
  (newTasks, oldTasks) => {
    // 跟踪思考消息的更新时间
    const oldTasksMap = new Map((oldTasks || []).map((t) => [t.id, t.length]));
    const currentTaskIds = new Set(newTasks.map((t) => t.id));
    const currentTaskMap = new Map(recentAITasks.value.map((task) => [task.id, task]));

    // 清理已移除任务的跟踪数据（统一清理逻辑）
    const cleanupTaskData = (taskId: string) => {
      delete lastThinkingUpdate.value[taskId];
      delete formattedThinkingCache.value[taskId];
      // 清理容器引用
      if (thinkingContainers.value[taskId]) {
        thinkingContainers.value[taskId] = null;
      }
      const thinkingThrottle = formattedThinkingThrottles.get(taskId);
      if (thinkingThrottle) {
        thinkingThrottle.cleanup();
        formattedThinkingThrottles.delete(taskId);
      }
    };

    for (const taskId of Object.keys(lastThinkingUpdate.value)) {
      if (!currentTaskIds.has(taskId)) {
        cleanupTaskData(taskId);
      }
    }

    for (const task of newTasks) {
      const oldLength = oldTasksMap.get(task.id) || 0;
      if (task.length < oldLength) {
        const currentTask = currentTaskMap.get(task.id);
        const message = currentTask?.thinkingMessage ?? '';
        formattedThinkingCache.value[task.id] = message
          ? formatThinkingMessage(message, currentTask?.status)
          : [];
        lastThinkingUpdate.value[task.id] = Date.now();
        continue;
      }
      if (task.length > oldLength) {
        lastThinkingUpdate.value[task.id] = Date.now();
        // 思考文本变化时，节流更新格式化缓存
        getFormattedThinkingThrottle(task.id).fn(task.id);
        const currentTask = currentTaskMap.get(task.id);
        const outputLength = currentTask?.outputContent?.length ?? 0;
        if (outputLength > 0) {
          pendingOutputBreak.value[task.id] = true;
        }
      }
    }

    // 使用节流函数处理滚动
    nextTick(() => {
      handleThinkingScroll.fn();
    });
  },
  { flush: 'post' },
);

// 输出内容的显示缓存：避免每个 token 都导致 output 区域整段文本重渲染（大字符串非常容易卡顿）
const displayedOutputContent = ref<Record<string, string>>({});

// 输出内容分段换行：当思考返回后再次输出时，在新输出前插入换行
const outputBreakPositions = ref<Record<string, number[]>>({});
const pendingOutputBreak = ref<Record<string, boolean>>({});

const shouldInsertLineBreak = (text: string, position: number): boolean => {
  if (position <= 0 || position > text.length) return false;
  const prevChar = text.charAt(position - 1);
  const nextChar = text.charAt(position);
  return prevChar !== '\n' && prevChar !== '\r' && nextChar !== '\n' && nextChar !== '\r';
};

const insertOutputBreaks = (text: string, breaks: number[]): string => {
  if (!text || breaks.length === 0) return text;
  let result = '';
  let lastIndex = 0;
  for (const position of breaks) {
    if (position <= lastIndex || position > text.length) {
      continue;
    }
    result += text.slice(lastIndex, position);
    if (shouldInsertLineBreak(text, position)) {
      result += '\n';
    }
    lastIndex = position;
  }
  result += text.slice(lastIndex);
  return result;
};

const buildDisplayedOutputContent = (taskId: string, content: string): string => {
  const breaks = outputBreakPositions.value[taskId];
  if (!breaks || breaks.length === 0) return content;
  return insertOutputBreaks(content, breaks);
};

const displayedOutputThrottles = new Map<
  string,
  { fn: (id: string) => void; cleanup: () => void }
>();
const getDisplayedOutputThrottle = (taskId: string) => {
  if (!displayedOutputThrottles.has(taskId)) {
    const throttler = throttle((id: string) => {
      const task = recentAITasks.value.find((t) => t.id === id);
      const content = task?.outputContent ?? '';
      displayedOutputContent.value[id] = buildDisplayedOutputContent(id, content);
    }, THROTTLE_DELAY_MS);
    displayedOutputThrottles.set(taskId, throttler);
  }
  return displayedOutputThrottles.get(taskId)!;
};

// 节流后的输出内容滚动处理函数
const handleOutputScroll = throttle(() => {
  requestAnimationFrame(() => {
    for (const task of recentAITasks.value) {
      if (autoScrollEnabled.value(task.id) && task.outputContent) {
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
}, THROTTLE_DELAY_MS);
// 注册清理函数
throttleCleanups.push(handleOutputScroll.cleanup);

// Auto scroll watcher for output content - 优化为只监听长度变化，避免深度监听
watch(
  () =>
    recentAITasks.value.map((task) => ({
      id: task.id,
      length: task.outputContent?.length || 0,
    })),
  (newTasks, oldTasks) => {
    // 跟踪输出内容的更新时间
    const oldTasksMap = new Map((oldTasks || []).map((t) => [t.id, t.length]));
    const currentTaskIds = new Set(newTasks.map((t) => t.id));
    const currentTaskMap = new Map(recentAITasks.value.map((task) => [task.id, task]));

    // 清理已移除任务的跟踪数据（统一清理逻辑）
    const cleanupTaskData = (taskId: string) => {
      delete lastOutputUpdate.value[taskId];
      delete displayedOutputContent.value[taskId];
      delete outputBreakPositions.value[taskId];
      delete pendingOutputBreak.value[taskId];
      // 清理容器引用
      if (outputContainers.value[taskId]) {
        outputContainers.value[taskId] = null;
      }
      const outputThrottle = displayedOutputThrottles.get(taskId);
      if (outputThrottle) {
        outputThrottle.cleanup();
        displayedOutputThrottles.delete(taskId);
      }
    };

    for (const taskId of Object.keys(lastOutputUpdate.value)) {
      if (!currentTaskIds.has(taskId)) {
        cleanupTaskData(taskId);
      }
    }

    for (const task of newTasks) {
      const oldLength = oldTasksMap.get(task.id) || 0;
      if (task.length < oldLength) {
        const currentTask = currentTaskMap.get(task.id);
        const outputContent = currentTask?.outputContent ?? '';
        displayedOutputContent.value[task.id] = buildDisplayedOutputContent(task.id, outputContent);
        outputBreakPositions.value[task.id] = [];
        pendingOutputBreak.value[task.id] = false;
        lastOutputUpdate.value[task.id] = Date.now();
        continue;
      }
      if (task.length > oldLength) {
        if (pendingOutputBreak.value[task.id]) {
          const breaks = outputBreakPositions.value[task.id] || [];
          const currentTask = currentTaskMap.get(task.id);
          const outputContent = currentTask?.outputContent ?? '';
          if (shouldInsertLineBreak(outputContent, oldLength)) {
            if (!breaks.includes(oldLength)) {
              breaks.push(oldLength);
            }
            outputBreakPositions.value[task.id] = breaks;
          }
          pendingOutputBreak.value[task.id] = false;
        }
        lastOutputUpdate.value[task.id] = Date.now();
        // 输出变化时，节流刷新显示文本
        getDisplayedOutputThrottle(task.id).fn(task.id);
      }
    }

    // 使用节流函数处理滚动
    nextTick(() => {
      handleOutputScroll.fn();
    });
  },
  { flush: 'post' },
);

// 节流后的待办事项滚动处理函数
const handleTodosScroll = throttle(() => {
  requestAnimationFrame(() => {
    for (const task of recentAITasks.value) {
      if (autoScrollEnabled.value(task.id)) {
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
}, THROTTLE_DELAY_MS);
// 注册清理函数
throttleCleanups.push(handleTodosScroll.cleanup);

// Auto scroll watcher for todos - 优化为浅层监听
watch(
  () => todos.value.length,
  () => {
    // 使用节流函数处理滚动
    nextTick(() => {
      handleTodosScroll.fn();
    });
  },
  { flush: 'post' },
);

// Auto-fold inactive tasks when a new task starts - 优化为只监听状态变化
watch(
  () =>
    recentAITasks.value.map((task) => ({
      id: task.id,
      status: task.status,
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
  { flush: 'post' },
);
</script>

<template>
  <div class="translation-progress-toolbar">
    <!-- AI 任务历史 -->
    <div class="translation-progress-ai-history-wrapper">
      <div class="translation-progress-ai-history">
        <div class="ai-history-content">
          <!-- 过滤和清除任务按钮 -始终显示在顶部 -->
          <div class="ai-history-actions">
            <Button
              :icon="showOnlyCurrentChapter ? 'pi pi-filter' : 'pi pi-filter-slash'"
              :label="showOnlyCurrentChapter ? '仅当前章节' : '全部章节'"
              :class="[
                'p-button-text p-button-sm ai-filter-chapter-toggle',
                { 'filter-enabled': showOnlyCurrentChapter },
              ]"
              :title="
                showOnlyCurrentChapter
                  ? '当前仅显示选中章节的任务，点击显示全部'
                  : '当前显示全部任务，点击仅显示选中章节'
              "
              @click="toggleShowOnlyCurrentChapter"
            />
            <Button
              v-if="
                recentAITasks.some(
                  (t) => t.status === 'end' || t.status === 'error' || t.status === 'cancelled',
                )
              "
              icon="pi pi-trash"
              label="清除已完成/错误/已取消的任务"
              class="p-button-text p-button-sm ai-history-clear-button"
              @click="clearReviewedTasks"
            />
          </div>
          <div v-if="recentAITasks.length === 0" class="ai-history-empty">
            <i class="pi pi-info-circle"></i>
            <span>暂无 AI 任务记录</span>
          </div>
          <div v-else class="ai-history-tasks">
            <div
              v-for="task in recentAITasks"
              :key="task.id"
              class="ai-history-task-item"
              :class="{
                'task-active': task.status === 'thinking' || task.status === 'processing',
                'task-ended': task.status === 'end',
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
                      'pi-check-circle': task.status === 'end',
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
                </div>
                <div class="ai-task-meta">
                  <span class="ai-task-duration">{{
                    formatTaskDuration(task.startTime, task.endTime)
                  }}</span>
                  <Button
                    :icon="autoScrollEnabled(task.id) ? 'pi pi-arrow-down' : 'pi pi-arrows-v'"
                    :class="[
                      'p-button-text p-button-sm ai-task-auto-scroll-toggle',
                      { 'auto-scroll-enabled': autoScrollEnabled(task.id) },
                    ]"
                    :title="
                      autoScrollEnabled(task.id)
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
                        'auto-tab-switching-enabled': autoTabSwitchingEnabled[task.id] !== false,
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
                    @click="stopTask(task)"
                    title="停止任务"
                  />
                </div>
              </div>
              <div v-if="getWorkingChapterLabel(task)" class="ai-task-working-chapter">
                <span class="ai-task-working-chapter-label">工作章节：</span>
                <span class="ai-task-working-chapter-title">{{
                  getWorkingChapterLabel(task)
                }}</span>
              </div>
              <div v-if="shouldShowTaskProgress(task)" class="ai-task-progress">
                <div class="ai-task-progress-stage-row">
                  <span class="ai-task-progress-stage">{{ getTaskStatusLabel(task) }}</span>
                  <span
                    v-if="isActiveProgressTask(task) && chunkProgressMessage"
                    class="ai-task-progress-stage-message"
                  >
                    {{ chunkProgressMessage }}
                  </span>
                </div>
                <div v-if="isActiveProgressTask(task)" class="ai-task-progress-header">
                  <span class="ai-task-progress-text"
                    >{{ props.progress.current }} / {{ props.progress.total }}</span
                  >
                </div>
                <ProgressBar
                  v-if="isActiveProgressTask(task)"
                  :value="getTaskProgressPercent(task)"
                  :show-value="false"
                  class="ai-task-progress-bar"
                />
                <ProgressBar
                  v-else
                  mode="indeterminate"
                  :show-value="false"
                  class="ai-task-progress-bar"
                />
              </div>
              <Transition name="task-content">
                <div v-if="!taskFolded[task.id]" class="ai-task-content">
                  <div v-if="getDisplayTaskMessage(task)" class="ai-task-message">
                    {{ getDisplayTaskMessage(task) }}
                  </div>
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
                            :ref="(el) => setThinkingContainer(task.id, el)"
                            class="ai-task-thinking-text"
                          >
                            <template
                              v-for="(part, index) in getFormattedThinkingMessage(task.id)"
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
                              <div
                                v-else-if="part.type === 'tool-call'"
                                class="thinking-tool-event thinking-tool-call"
                              >
                                <div class="thinking-tool-call-icon">
                                  <i :class="getToolCallIconClass(task, part)"></i>
                                </div>
                                <div class="thinking-tool-call-body">
                                  <div class="thinking-tool-call-title">
                                    <span class="thinking-tool-call-label">工具调用</span>
                                    <span class="thinking-tool-call-hint">{{
                                      getToolCallHint(task, part)
                                    }}</span>
                                  </div>
                                  <span class="thinking-tool-name">{{ part.toolName }}</span>
                                </div>
                              </div>
                              <div
                                v-else-if="part.type === 'tool-result'"
                                :class="[
                                  'thinking-tool-event',
                                  'thinking-tool-result',
                                  `thinking-tool-result-${part.toolResultTone || 'success'}`,
                                ]"
                                role="button"
                                tabindex="0"
                                title="点击查看完整工具结果"
                                @click="(event) => toggleToolResultPopup(event, part)"
                                @keydown.enter.prevent="
                                  (event) => toggleToolResultPopup(event, part)
                                "
                                @keydown.space.prevent="
                                  (event) => toggleToolResultPopup(event, part)
                                "
                              >
                                <div class="thinking-tool-result-icon">
                                  <i
                                    :class="
                                      part.toolResultTone === 'error'
                                        ? 'pi pi-times-circle'
                                        : part.toolResultTone === 'warning'
                                          ? 'pi pi-exclamation-triangle'
                                          : 'pi pi-check-circle'
                                    "
                                  ></i>
                                </div>
                                <div class="thinking-tool-result-body">
                                  <div class="thinking-tool-result-title">
                                    <span class="thinking-tool-label">{{
                                      getToolResultLabel(part.toolResultTone)
                                    }}</span>
                                    <span class="thinking-tool-result-hint">{{
                                      getToolResultHint(part.toolResultTone)
                                    }}</span>
                                  </div>
                                  <span class="thinking-tool-content">{{ part.toolName }}</span>
                                </div>
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
                            :ref="(el) => setOutputContainer(task.id, el)"
                            class="ai-task-output-text"
                          >
                            {{ displayedOutputContent[task.id] ?? task.outputContent }}
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
                            :ref="(el) => setTodosContainer(task.id, el)"
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
    <Popover ref="toolResultPopoverRef" class="thinking-tool-result-popover" :dismissable="true">
      <div class="thinking-tool-result-popover-content">
        <pre class="thinking-tool-result-popover-pre">{{ activeToolResultPopupContent }}</pre>
      </div>
    </Popover>
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

/* 章节过滤切换按钮 */
.ai-filter-chapter-toggle {
  color: var(--moon-opacity-60);
  font-size: 0.8125rem;
  transition: all 0.2s;
}

.ai-filter-chapter-toggle:hover {
  color: var(--primary-opacity-80);
  background: var(--white-opacity-5);
}

.ai-filter-chapter-toggle.filter-enabled {
  color: var(--primary-opacity-80);
  background: var(--primary-opacity-10);
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

.ai-history-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.5rem;
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

.ai-history-task-item.task-ended {
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
  /* 覆盖主题中 .relative .p-badge 的绝对定位规则，确保 Badge 保持在行内 */
  position: static !important;
  transform: none !important;
  z-index: auto !important;
  pointer-events: auto !important;
  flex-shrink: 0;
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

.ai-task-working-chapter {
  margin-top: -0.25rem;
  margin-bottom: 0.5rem;
  font-size: 0.75rem;
  color: var(--moon-opacity-70);
  display: flex;
  gap: 0.25rem;
  align-items: baseline;
  flex-wrap: wrap;
}

.ai-task-working-chapter-label {
  color: var(--moon-opacity-60);
  font-weight: 500;
  white-space: nowrap;
}

.ai-task-working-chapter-title {
  color: var(--moon-opacity-90);
  font-weight: 600;
  word-break: break-word;
}

.ai-task-progress {
  margin-bottom: 0.5rem;
  padding: 0.5rem 0.625rem;
  border-radius: 4px;
  background: var(--primary-opacity-10);
  border: 1px solid var(--primary-opacity-20);
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.ai-task-progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.ai-task-progress-stage-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.ai-task-progress-stage {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--primary-opacity-90);
  line-height: 1.3;
}

.ai-task-progress-stage-message {
  font-size: 0.75rem;
  color: var(--moon-opacity-75);
  line-height: 1.3;
}

.ai-task-progress-text {
  font-size: 0.75rem;
  color: var(--moon-opacity-90);
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

.ai-task-progress-bar {
  height: 0.5rem;
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

.thinking-tool-event {
  animation: thinking-tool-pop-in 0.2s ease-out;
}

@keyframes thinking-tool-pop-in {
  from {
    opacity: 0;
    transform: translateY(4px) scale(0.99);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.thinking-tool-call {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  margin: 0.625rem 0;
  padding: 0.625rem 0.75rem;
  background: linear-gradient(
    135deg,
    var(--blue-500-opacity-10, rgba(59, 130, 246, 0.12)),
    var(--blue-500-opacity-5, rgba(59, 130, 246, 0.05))
  );
  border: 1px solid var(--blue-500-opacity-30, rgba(59, 130, 246, 0.3));
  border-left: 4px solid var(--blue-500);
  border-radius: 6px;
  font-size: 0.8125rem;
  box-shadow: 0 2px 10px var(--blue-500-opacity-10, rgba(59, 130, 246, 0.12));
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.thinking-tool-call:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px var(--blue-500-opacity-20, rgba(59, 130, 246, 0.2));
}

.thinking-tool-call-running {
  background: linear-gradient(
    135deg,
    var(--blue-500-opacity-10, rgba(59, 130, 246, 0.12)),
    var(--blue-500-opacity-5, rgba(59, 130, 246, 0.05))
  );
  border: 1px solid var(--blue-500-opacity-30, rgba(59, 130, 246, 0.3));
  border-left: 4px solid var(--blue-500);
  box-shadow: 0 2px 10px var(--blue-500-opacity-10, rgba(59, 130, 246, 0.12));
}

.thinking-tool-call-running:hover {
  box-shadow: 0 4px 14px var(--blue-500-opacity-20, rgba(59, 130, 246, 0.2));
}

.thinking-tool-call-success {
  background: linear-gradient(
    135deg,
    var(--green-500-opacity-10, rgba(34, 197, 94, 0.12)),
    var(--green-500-opacity-5, rgba(34, 197, 94, 0.05))
  );
  border: 1px solid var(--green-500-opacity-30, rgba(34, 197, 94, 0.3));
  border-left: 4px solid var(--green-500);
  box-shadow: 0 2px 10px var(--green-500-opacity-10, rgba(34, 197, 94, 0.12));
}

.thinking-tool-call-success:hover {
  box-shadow: 0 4px 14px var(--green-500-opacity-20, rgba(34, 197, 94, 0.2));
}

.thinking-tool-call-warning {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(245, 158, 11, 0.05));
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-left: 4px solid #f59e0b;
  box-shadow: 0 2px 10px rgba(245, 158, 11, 0.12);
}

.thinking-tool-call-warning:hover {
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.2);
}

.thinking-tool-call-error {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.14), rgba(239, 68, 68, 0.06));
  border: 1px solid rgba(239, 68, 68, 0.38);
  border-left: 4px solid #ef4444;
  box-shadow: 0 2px 10px rgba(239, 68, 68, 0.14);
}

.thinking-tool-call-error:hover {
  box-shadow: 0 4px 14px rgba(239, 68, 68, 0.22);
}

.thinking-tool-call-cancelled {
  background: linear-gradient(135deg, rgba(148, 163, 184, 0.18), rgba(148, 163, 184, 0.08));
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-left: 4px solid #94a3b8;
  box-shadow: 0 2px 10px rgba(148, 163, 184, 0.12);
}

.thinking-tool-call-cancelled:hover {
  box-shadow: 0 4px 14px rgba(148, 163, 184, 0.2);
}

.thinking-tool-call-icon {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--blue-500-opacity-20, rgba(59, 130, 246, 0.2));
  border: 1px solid var(--blue-500-opacity-40, rgba(59, 130, 246, 0.4));
  flex-shrink: 0;
}

.thinking-tool-call i {
  font-size: 0.75rem;
  color: var(--blue-500);
}

.thinking-tool-call-running .thinking-tool-call-icon {
  background: var(--blue-500-opacity-20, rgba(59, 130, 246, 0.2));
  border: 1px solid var(--blue-500-opacity-40, rgba(59, 130, 246, 0.4));
}

.thinking-tool-call-running .thinking-tool-call-icon i {
  color: var(--blue-500);
}

.thinking-tool-call-success .thinking-tool-call-icon {
  background: var(--green-500-opacity-20, rgba(34, 197, 94, 0.2));
  border: 1px solid var(--green-500-opacity-40, rgba(34, 197, 94, 0.4));
}

.thinking-tool-call-success .thinking-tool-call-icon i {
  color: var(--green-500);
}

.thinking-tool-call-warning .thinking-tool-call-icon {
  background: rgba(245, 158, 11, 0.2);
  border: 1px solid rgba(245, 158, 11, 0.45);
}

.thinking-tool-call-warning .thinking-tool-call-icon i {
  color: #f59e0b;
}

.thinking-tool-call-error .thinking-tool-call-icon {
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.45);
}

.thinking-tool-call-error .thinking-tool-call-icon i {
  color: #ef4444;
}

.thinking-tool-call-cancelled .thinking-tool-call-icon {
  background: rgba(148, 163, 184, 0.2);
  border: 1px solid rgba(148, 163, 184, 0.45);
}

.thinking-tool-call-cancelled .thinking-tool-call-icon i {
  color: #94a3b8;
}

.thinking-tool-call-body {
  min-width: 0;
  flex: 1;
}

.thinking-tool-call-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.thinking-tool-call-label {
  font-weight: 600;
  color: var(--blue-500-opacity-90, rgba(59, 130, 246, 0.92));
}

.thinking-tool-call-hint {
  font-size: 0.6875rem;
  color: var(--blue-500-opacity-70, rgba(59, 130, 246, 0.75));
  background: var(--blue-500-opacity-10, rgba(59, 130, 246, 0.12));
  border: 1px solid var(--blue-500-opacity-20, rgba(59, 130, 246, 0.24));
  border-radius: 999px;
  padding: 0.0625rem 0.375rem;
}

.thinking-tool-name {
  display: block;
  color: var(--blue-500-opacity-90, rgba(59, 130, 246, 0.92));
  font-weight: 600;
  line-height: 1.45;
  word-break: break-word;
}

.thinking-tool-call-running .thinking-tool-call-label {
  color: var(--blue-500-opacity-90, rgba(59, 130, 246, 0.92));
}

.thinking-tool-call-running .thinking-tool-call-hint {
  color: var(--blue-500-opacity-70, rgba(59, 130, 246, 0.75));
  background: var(--blue-500-opacity-10, rgba(59, 130, 246, 0.12));
  border: 1px solid var(--blue-500-opacity-20, rgba(59, 130, 246, 0.24));
}

.thinking-tool-call-running .thinking-tool-name {
  color: var(--blue-500-opacity-90, rgba(59, 130, 246, 0.92));
}

.thinking-tool-call-success .thinking-tool-call-label {
  color: var(--green-500-opacity-90, rgba(34, 197, 94, 0.92));
}

.thinking-tool-call-success .thinking-tool-call-hint {
  color: var(--green-500-opacity-70, rgba(34, 197, 94, 0.75));
  background: var(--green-500-opacity-10, rgba(34, 197, 94, 0.12));
  border: 1px solid var(--green-500-opacity-20, rgba(34, 197, 94, 0.24));
}

.thinking-tool-call-success .thinking-tool-name {
  color: var(--green-500-opacity-90, rgba(34, 197, 94, 0.92));
}

.thinking-tool-call-warning .thinking-tool-call-label {
  color: rgba(245, 158, 11, 0.95);
}

.thinking-tool-call-warning .thinking-tool-call-hint {
  color: rgba(245, 158, 11, 0.85);
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.28);
}

.thinking-tool-call-warning .thinking-tool-name {
  color: rgba(245, 158, 11, 0.95);
}

.thinking-tool-call-error .thinking-tool-call-label {
  color: rgba(239, 68, 68, 0.95);
}

.thinking-tool-call-error .thinking-tool-call-hint {
  color: rgba(239, 68, 68, 0.85);
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.thinking-tool-call-error .thinking-tool-name {
  color: rgba(239, 68, 68, 0.95);
}

.thinking-tool-call-cancelled .thinking-tool-call-label {
  color: rgba(148, 163, 184, 0.95);
}

.thinking-tool-call-cancelled .thinking-tool-call-hint {
  color: rgba(148, 163, 184, 0.85);
  background: rgba(148, 163, 184, 0.12);
  border: 1px solid rgba(148, 163, 184, 0.3);
}

.thinking-tool-call-cancelled .thinking-tool-name {
  color: rgba(148, 163, 184, 0.95);
}

.thinking-tool-result {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  margin: 0.625rem 0;
  padding: 0.625rem 0.75rem;
  border-radius: 6px;
  font-size: 0.8125rem;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.thinking-tool-result:hover {
  transform: translateY(-1px);
}

.thinking-tool-result-success {
  background: linear-gradient(
    135deg,
    var(--green-500-opacity-10, rgba(34, 197, 94, 0.12)),
    var(--green-500-opacity-5, rgba(34, 197, 94, 0.05))
  );
  border: 1px solid var(--green-500-opacity-30, rgba(34, 197, 94, 0.3));
  border-left: 4px solid var(--green-500);
  box-shadow: 0 2px 10px var(--green-500-opacity-10, rgba(34, 197, 94, 0.12));
}

.thinking-tool-result-success:hover {
  box-shadow: 0 4px 14px var(--green-500-opacity-20, rgba(34, 197, 94, 0.2));
}

.thinking-tool-result-warning {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(245, 158, 11, 0.05));
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-left: 4px solid #f59e0b;
  box-shadow: 0 2px 10px rgba(245, 158, 11, 0.12);
}

.thinking-tool-result-warning:hover {
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.2);
}

.thinking-tool-result-error {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.14), rgba(239, 68, 68, 0.06));
  border: 1px solid rgba(239, 68, 68, 0.38);
  border-left: 4px solid #ef4444;
  box-shadow: 0 2px 10px rgba(239, 68, 68, 0.14);
}

.thinking-tool-result-error:hover {
  box-shadow: 0 4px 14px rgba(239, 68, 68, 0.22);
}

.thinking-tool-result-icon {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.thinking-tool-result-icon i {
  font-size: 0.75rem;
}

.thinking-tool-result-success .thinking-tool-result-icon {
  background: var(--green-500-opacity-20, rgba(34, 197, 94, 0.2));
  border: 1px solid var(--green-500-opacity-40, rgba(34, 197, 94, 0.4));
}

.thinking-tool-result-success .thinking-tool-result-icon i {
  color: var(--green-500);
}

.thinking-tool-result-warning .thinking-tool-result-icon {
  background: rgba(245, 158, 11, 0.2);
  border: 1px solid rgba(245, 158, 11, 0.45);
}

.thinking-tool-result-warning .thinking-tool-result-icon i {
  color: #f59e0b;
}

.thinking-tool-result-error .thinking-tool-result-icon {
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.45);
}

.thinking-tool-result-error .thinking-tool-result-icon i {
  color: #ef4444;
}

.thinking-tool-result-body {
  min-width: 0;
  flex: 1;
}

.thinking-tool-result-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.thinking-tool-result .thinking-tool-label {
  font-weight: 600;
}

.thinking-tool-result-hint {
  font-size: 0.6875rem;
  border-radius: 999px;
  padding: 0.0625rem 0.375rem;
}

.thinking-tool-result-success .thinking-tool-label {
  color: var(--green-500-opacity-90, rgba(34, 197, 94, 0.92));
}

.thinking-tool-result-success .thinking-tool-result-hint {
  color: var(--green-500-opacity-70, rgba(34, 197, 94, 0.75));
  background: var(--green-500-opacity-10, rgba(34, 197, 94, 0.12));
  border: 1px solid var(--green-500-opacity-20, rgba(34, 197, 94, 0.24));
}

.thinking-tool-result-warning .thinking-tool-label {
  color: rgba(245, 158, 11, 0.95);
}

.thinking-tool-result-warning .thinking-tool-result-hint {
  color: rgba(245, 158, 11, 0.85);
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.28);
}

.thinking-tool-result-error .thinking-tool-label {
  color: rgba(239, 68, 68, 0.95);
}

.thinking-tool-result-error .thinking-tool-result-hint {
  color: rgba(239, 68, 68, 0.85);
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.thinking-tool-content {
  display: block;
  word-break: break-word;
  line-height: 1.45;
}

:deep(.thinking-tool-result-popover .p-popover-content) {
  padding: 0;
}

.thinking-tool-result-popover-content {
  max-width: min(70vw, 560px);
  max-height: min(65vh, 420px);
  overflow: auto;
  padding: 0.75rem;
  background: var(--white-opacity-95);
}

.thinking-tool-result-popover-pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--moon-opacity-80);
  font-family: 'Courier New', monospace;
  font-size: 0.75rem;
  line-height: 1.45;
}

.thinking-tool-result-success .thinking-tool-content {
  color: var(--green-500-opacity-90, rgba(34, 197, 94, 0.92));
}

.thinking-tool-result-warning .thinking-tool-content {
  color: rgba(245, 158, 11, 0.95);
}

.thinking-tool-result-error .thinking-tool-content {
  color: rgba(239, 68, 68, 0.95);
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
