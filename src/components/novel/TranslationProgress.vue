<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useAIProcessingStore, type AIProcessingTask } from 'src/stores/ai-processing';
import { useBookDetailsStore } from 'src/stores/book-details';
import { useBooksStore } from 'src/stores/books';
import { useContextStore } from 'src/stores/context';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useThinkingFormatter } from 'src/composables/useThinkingFormatter';
import { TodoListService, type TodoItem } from 'src/services/todo-list-service';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';
import TaskSwitcher from './translation-progress/TaskSwitcher.vue';
import TaskStatusBar from './translation-progress/TaskStatusBar.vue';
import TaskTodos from './translation-progress/TaskTodos.vue';
import TaskStream from './translation-progress/TaskStream.vue';
import TaskActionBar from './translation-progress/TaskActionBar.vue';

const aiProcessingStore = useAIProcessingStore();
const bookDetailsStore = useBookDetailsStore();
const booksStore = useBooksStore();
const contextStore = useContextStore();
const toast = useToastWithHistory();

// 实时时钟
const now = ref(Date.now());
let nowTimer: number | null = null;

// 待办事项
const todos = ref<TodoItem[]>([]);

// ─── 任务列表（从 store 派生）───

const showOnlyCurrentChapter = computed(
  () => bookDetailsStore.translationProgress.showOnlyCurrentChapter,
);

const currentSelectedChapterId = computed(() => {
  const currentBookId = contextStore.currentBookId;
  if (!currentBookId) return null;
  return bookDetailsStore.selectedChapter[currentBookId] || null;
});

const recentAITasks = computed(() => {
  let tasks = aiProcessingStore.activeTasks.filter(
    (t) => t.type === 'translation' || t.type === 'polish' || t.type === 'proofreading',
  );
  if (showOnlyCurrentChapter.value && currentSelectedChapterId.value) {
    tasks = tasks.filter((t) => t.chapterId === currentSelectedChapterId.value);
  }
  return [...tasks].sort((a, b) => b.startTime - a.startTime).slice(0, 10);
});

// ─── 当前选中任务 ───

const selectedTaskId = computed(() => bookDetailsStore.translationProgress.selectedTaskId);

const currentTask = computed(
  () => recentAITasks.value.find((t) => t.id === selectedTaskId.value) ?? null,
);

// ─── 思考消息格式化 ───

const { getFormatted } = useThinkingFormatter(recentAITasks);

const currentParts = computed(() =>
  currentTask.value ? getFormatted(currentTask.value.id) : [],
);

// ─── 待办事项 ───

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

watch(() => recentAITasks.value.map((t) => t.id), loadTodos);

// ─── 自动滚动 ───

const autoScrollEnabled = computed(() => {
  const store = bookDetailsStore.translationProgress.autoScrollEnabled;
  return (taskId: string) => store[taskId] !== false;
});

const currentAutoScroll = computed(() =>
  currentTask.value ? autoScrollEnabled.value(currentTask.value.id) : true,
);

const toggleAutoScroll = () => {
  if (!currentTask.value) return;
  const taskId = currentTask.value.id;
  bookDetailsStore.setTranslationProgressAutoScroll(taskId, !autoScrollEnabled.value(taskId));
};

// ─── 章节标题辅助 ───

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

// ─── 时间格式化 ───

const formatDuration = (startTime: number, endTime?: number): string => {
  const end = endTime || now.value;
  const duration = Math.floor((end - startTime) / 1000);
  if (duration < 60) return `${duration}秒`;
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  return `${minutes}分${seconds}秒`;
};

// ─── 任务选择 ───

const selectTask = (taskId: string) => {
  bookDetailsStore.selectTask(taskId);
};

// ─── 4.3 新任务自动选中 ───

watch(
  () => recentAITasks.value.map((t) => t.id),
  (newIds, oldIds) => {
    const oldSet = new Set(oldIds || []);
    const newTask = newIds.find((id) => !oldSet.has(id));
    if (newTask) {
      bookDetailsStore.selectTask(newTask);
    } else if (!selectedTaskId.value && newIds.length > 0) {
      bookDetailsStore.selectTask(newIds[0]!);
    } else if (selectedTaskId.value && !newIds.includes(selectedTaskId.value) && newIds.length > 0) {
      bookDetailsStore.selectTask(newIds[0]!);
    }
  },
  { flush: 'post', immediate: true },
);

// ─── 4.2 未读活动检测 ───

watch(
  () =>
    recentAITasks.value.map((t) => ({
      id: t.id,
      thinkingLen: t.thinkingMessage?.length || 0,
      outputLen: t.outputContent?.length || 0,
    })),
  (newTasks, oldTasks) => {
    const oldMap = new Map((oldTasks || []).map((t) => [t.id, t]));
    for (const task of newTasks) {
      if (task.id === selectedTaskId.value) continue;
      const old = oldMap.get(task.id);
      if (!old) continue;
      if (task.thinkingLen > old.thinkingLen || task.outputLen > old.outputLen) {
        bookDetailsStore.setUnseenActivity(task.id);
      }
    }
  },
  { flush: 'post' },
);

// ─── 操作 ───

const stopTask = () => {
  if (currentTask.value) {
    void aiProcessingStore.stopTask(currentTask.value.id);
  }
};

const clearCompletedTasks = async () => {
  const translationTasks = aiProcessingStore.activeTasks.filter(
    (t) =>
      (t.type === 'translation' || t.type === 'polish' || t.type === 'proofreading') &&
      (t.status === 'end' || t.status === 'error' || t.status === 'cancelled'),
  );
  await Promise.all(translationTasks.map((t) => aiProcessingStore.removeTask(t.id)));
  translationTasks.forEach((t) => bookDetailsStore.clearTaskTranslationProgress(t.id));
  toast.add({
    severity: 'success',
    summary: '清除成功',
    detail: `已清除 ${translationTasks.length} 个已结束任务`,
    life: 3000,
  });
};

const toggleChapterFilter = () => {
  bookDetailsStore.toggleTranslationProgressShowOnlyCurrentChapter();
};

const toggleTodoCollapsed = () => {
  bookDetailsStore.toggleTodoCollapsed();
};

// ─── 生命周期 ───

onMounted(() => {
  if (!bookDetailsStore.isLoaded) bookDetailsStore.loadState();
  // 清理 localStorage 中废弃的 taskId 状态
  const activeIds = new Set(aiProcessingStore.activeTasks.map((t) => t.id));
  bookDetailsStore.cleanupStaleTaskState(activeIds);
  loadTodos();
  window.addEventListener('storage', handleStorageChange);
  window.addEventListener('tsukuyomi-todos-updated', loadTodos);
  nowTimer = window.setInterval(() => { now.value = Date.now(); }, 1000);
});

onUnmounted(() => {
  window.removeEventListener('storage', handleStorageChange);
  window.removeEventListener('tsukuyomi-todos-updated', loadTodos);
  if (nowTimer !== null) { clearInterval(nowTimer); nowTimer = null; }
});
</script>

<template>
  <div class="translation-progress">
    <TaskSwitcher
      :tasks="recentAITasks"
      :selected-task-id="selectedTaskId"
      :unseen-activity="bookDetailsStore.translationProgress.unseenActivity"
      :get-working-chapter-label="getWorkingChapterLabel"
      :format-duration="formatDuration"
      @select="selectTask"
    />

    <template v-if="currentTask">
      <TaskStatusBar
        :task="currentTask"
        :format-duration="formatDuration"
      />

      <TaskTodos
        :todos="currentTaskTodos"
        :collapsed="bookDetailsStore.translationProgress.todoCollapsed"
        @toggle-collapsed="toggleTodoCollapsed"
      />

      <TaskStream
        :task="currentTask"
        :parts="currentParts"
        :auto-scroll="currentAutoScroll"
        @toggle-auto-scroll="toggleAutoScroll"
      />

      <TaskActionBar
        :task="currentTask"
        :show-only-current-chapter="showOnlyCurrentChapter"
        @stop="stopTask"
        @clear="clearCompletedTasks"
        @toggle-chapter-filter="toggleChapterFilter"
      />
    </template>

    <div v-else class="empty-state">
      <i class="pi pi-info-circle" />
      <span>暂无翻译任务</span>
    </div>
  </div>
</template>

<style scoped>
.translation-progress {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

/* 强制所有子组件中的文本正确换行，防止溢出面板 */
.translation-progress :deep(p),
.translation-progress :deep(.todo-text),
.translation-progress :deep(.stream-text),
.translation-progress :deep(.tool-result),
.translation-progress :deep(.thinking-content) {
  overflow-wrap: break-word;
  word-break: break-word;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 3rem;
  color: var(--moon-opacity-40);
  font-size: 0.875rem;
  flex: 1;
}
</style>
