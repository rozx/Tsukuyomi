import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useAIProcessingStore, type AIProcessingTask } from 'src/stores/ai-processing';
import { useBookDetailsStore } from 'src/stores/book-details';
import { useBooksStore } from 'src/stores/books';
import { useContextStore } from 'src/stores/context';
import { useUiStore } from 'src/stores/ui';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useThinkingFormatter } from 'src/composables/useThinkingFormatter';
import { TodoListService, type TodoItem } from 'src/services/todo-list-service';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';
import { formatTaskDuration } from 'src/utils';

/**
 * TranslationProgress 面板的业务逻辑 composable。
 *
 * 负责：任务列表派生、当前选中任务、待办事项加载、思考消息格式化、自动滚动、
 * 活动未读检测、手机端派生数据（进度/ETA/工作流标签/统计/图例）、生命周期
 * 事件与计时器。所有变体（Desktop / Tablet / Mobile）通过调用此 composable
 * 获得同一份数据与操作，不得在变体中重新声明或实现这些状态。
 *
 * 变体仅允许再额外声明纯视图局部状态（例如手机端的 `mobileTab` 分段选中项）。
 */
export function useTranslationProgressPanel() {
  const aiProcessingStore = useAIProcessingStore();
  const bookDetailsStore = useBookDetailsStore();
  const booksStore = useBooksStore();
  const contextStore = useContextStore();
  const uiStore = useUiStore();
  const toast = useToastWithHistory();

  // 实时时钟（用于驱动持续刷新的时长 / ETA 计算）
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
      (t) =>
        (t.type === 'translation' || t.type === 'polish' || t.type === 'proofreading') &&
        !t.isSingleParagraph,
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
  // 使用共享 formatTaskDuration 并传入响应式 now.value，让计时器随 1Hz 定时器持续刷新
  const formatDuration = (startTime: number, endTime?: number): string =>
    formatTaskDuration(startTime, endTime, now.value);

  // ─── 任务选择 ───

  const selectTask = (taskId: string) => {
    bookDetailsStore.selectTask(taskId);
  };

  // ─── 新任务选中 ───
  // 规则：
  // 1) 无选中任务 → 选中最新
  // 2) 选中任务被清理 → 回退到最新
  // 3) 出现全新任务（ID 不在旧列表中）时：若当前选中任务仍在 thinking / processing，
  //    保留用户的观察视图；否则切换到最新任务（新批量翻译 / 润色 / 校对启动即聚焦）
  // 注：immediate 首次触发时 oldIds 为 undefined，不视为"新任务出现"，避免挂载时覆盖用户上次的选择。

  watch(
    () => recentAITasks.value.map((t) => t.id),
    (newIds, oldIds) => {
      if (newIds.length === 0) return;
      if (!selectedTaskId.value) {
        bookDetailsStore.selectTask(newIds[0]!);
        return;
      }
      if (!newIds.includes(selectedTaskId.value)) {
        bookDetailsStore.selectTask(newIds[0]!);
        return;
      }
      if (!oldIds) return;
      const oldSet = new Set(oldIds);
      const hasNewTask = newIds.some((id) => !oldSet.has(id));
      if (!hasNewTask) return;
      const selectedTask = recentAITasks.value.find((t) => t.id === selectedTaskId.value);
      const selectedIsRunning =
        selectedTask?.status === 'thinking' || selectedTask?.status === 'processing';
      if (selectedIsRunning) return;
      bookDetailsStore.selectTask(newIds[0]!);
    },
    { flush: 'post', immediate: true },
  );

  // ─── 未读活动检测 ───

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
        !t.isSingleParagraph &&
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

  const closeMobilePanel = () => {
    uiStore.closeRightPanel();
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
    nowTimer = window.setInterval(() => {
      now.value = Date.now();
    }, 1000);
  });

  onUnmounted(() => {
    window.removeEventListener('storage', handleStorageChange);
    window.removeEventListener('tsukuyomi-todos-updated', loadTodos);
    if (nowTimer !== null) {
      clearInterval(nowTimer);
      nowTimer = null;
    }
  });

  // ─── 手机端：基于当前任务的派生数据 ───

  // 进度：current/total
  const mobileProgress = computed(() => {
    const p = currentTask.value?.progress;
    if (!p || !p.total) return { current: 0, total: 0, percent: 0 };
    const percent = Math.min(100, Math.round((p.current / p.total) * 100));
    return { current: p.current, total: p.total, percent };
  });

  // 手机端任务状态描述（ChineseWorkflow）
  const mobileWorkflowLabel = computed<string>(() => {
    const task = currentTask.value;
    if (!task) return '';
    if (task.status === 'end') return '已完成';
    if (task.status === 'error') return '已失败';
    if (task.status === 'cancelled') return '已取消';
    switch (task.workflowStatus) {
      case 'planning':
        return '规划阶段';
      case 'working':
        return '翻译中';
      case 'review':
        return '审核阶段';
      case 'end':
        return '已完成';
      default:
        return task.status === 'thinking' ? '思考中' : '处理中';
    }
  });

  // 预计剩余（线性外推）
  const mobileEta = computed<string>(() => {
    const task = currentTask.value;
    if (!task) return '—';
    if (task.status === 'end' || task.status === 'error' || task.status === 'cancelled')
      return '已结束';
    const { current, total } = mobileProgress.value;
    if (!total || current <= 0) return '—';
    if (current >= total) return '即将完成';
    const elapsed = Math.max(0, now.value - task.startTime);
    const rate = elapsed / current; // ms per unit
    const remaining = (total - current) * rate;
    const seconds = Math.max(0, Math.floor(remaining / 1000));
    if (seconds < 60) return `~ ${seconds} 秒`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `~ ${mins} 分 ${String(secs).padStart(2, '0')} 秒`;
  });

  // 当前章节标题（用于副标题）
  const mobileCurrentChapterLabel = computed<string>(() => {
    const task = currentTask.value;
    if (!task) return '';
    const label = getWorkingChapterLabel(task);
    return label || '';
  });

  // 手机端操作
  const mobileIsRunning = computed(() => {
    const s = currentTask.value?.status;
    return s === 'thinking' || s === 'processing';
  });

  // 统计卡片数据
  const mobileStatTotals = computed(() => {
    const task = currentTask.value;
    const total = task?.progress?.total ?? 0;
    const current = task?.progress?.current ?? 0;
    const elapsedMs = task ? Math.max(0, (task.endTime ?? now.value) - task.startTime) : 0;
    const seconds = Math.floor(elapsedMs / 1000);
    const mm = Math.floor(seconds / 60);
    const ss = seconds % 60;
    const elapsedLabel = seconds > 0 ? `${mm}:${String(ss).padStart(2, '0')}` : '—';
    const avgMs = current > 0 ? Math.round(elapsedMs / current) : 0;
    const avgLabel =
      avgMs > 0 ? (avgMs >= 1000 ? `${(avgMs / 1000).toFixed(1)}s/段` : `${avgMs}ms/段`) : '—';
    return [
      { label: '总段数', value: String(total), icon: 'pi-list' },
      { label: '已完成', value: String(current), icon: 'pi-check-circle' },
      { label: '总耗时', value: elapsedLabel, icon: 'pi-clock' },
      { label: '平均速度', value: avgLabel, icon: 'pi-bolt' },
    ];
  });

  // 手机端状态图例（颜色 · 数量）
  const mobileLegend = computed(() => {
    const task = currentTask.value;
    if (!task) {
      return [
        { color: '#A7D1B0', label: '成功', value: 0 },
        { color: '#A3B7CF', label: '进行中', value: 0 },
        { color: '#F2C037', label: '排队', value: 0 },
        { color: '#EF5F5F', label: '失败', value: 0 },
      ];
    }
    const { current, total } = mobileProgress.value;
    const queued = Math.max(0, total - current - (mobileIsRunning.value ? 1 : 0));
    const running = mobileIsRunning.value ? 1 : 0;
    const failed = task.status === 'error' ? 1 : 0;
    return [
      { color: '#A7D1B0', label: '成功', value: current },
      { color: '#A3B7CF', label: '进行中', value: running },
      { color: '#F2C037', label: '排队', value: queued },
      { color: '#EF5F5F', label: '失败', value: failed },
    ];
  });

  return {
    // store refs variants may need
    bookDetailsStore,
    // state
    todos,
    now,
    // task list / selection
    showOnlyCurrentChapter,
    recentAITasks,
    selectedTaskId,
    currentTask,
    // stream / todos / scroll
    currentParts,
    currentTaskTodos,
    currentAutoScroll,
    toggleAutoScroll,
    toggleTodoCollapsed,
    // chapter label + time
    getWorkingChapterLabel,
    formatDuration,
    // actions
    selectTask,
    stopTask,
    clearCompletedTasks,
    toggleChapterFilter,
    closeMobilePanel,
    // mobile-derived data
    mobileProgress,
    mobileEta,
    mobileWorkflowLabel,
    mobileCurrentChapterLabel,
    mobileStatTotals,
    mobileIsRunning,
    mobileLegend,
  };
}
