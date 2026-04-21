import { computed, watch, onMounted } from 'vue';
import { useAIProcessingStore, type AIProcessingTask } from 'src/stores/ai-processing';
import { useBookDetailsStore } from 'src/stores/book-details';
import { useBooksStore } from 'src/stores/books';
import { useContextStore } from 'src/stores/context';
import { useUiStore } from 'src/stores/ui';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useThinkingFormatter } from 'src/composables/useThinkingFormatter';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';
import { formatTaskDuration } from 'src/utils';
import { useMobilePanelData } from './useMobilePanelData';
import { useTranslationTodos } from './useTranslationTodos';
import { useNowClock } from './useNowClock';

/**
 * TranslationProgress 面板的业务逻辑 composable。
 *
 * 负责：任务列表派生、当前选中任务、思考消息格式化、自动滚动、活动未读检测、
 * 生命周期事件与计时器。手机端派生数据、待办事项、时钟等独立关注点拆到
 * 同目录下的 useMobilePanelData / useTranslationTodos / useNowClock。
 *
 * 所有变体（Desktop / Tablet / Mobile）通过调用此 composable 获得同一份数据
 * 与操作，不得在变体中重新声明或实现这些状态。变体仅允许再额外声明纯视图局部
 * 状态（例如手机端的 `mobileTab` 分段选中项）。
 */
export function useTranslationProgressPanel() {
  const aiProcessingStore = useAIProcessingStore();
  const bookDetailsStore = useBookDetailsStore();
  const booksStore = useBooksStore();
  const contextStore = useContextStore();
  const uiStore = useUiStore();
  const toast = useToastWithHistory();

  // 实时时钟（用于驱动持续刷新的时长 / ETA 计算）
  const { now } = useNowClock();

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

  const { todos, currentTaskTodos } = useTranslationTodos({ recentAITasks, currentTask });

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

  const resolveChapterDisplayTitle = (bookId: string, chapterId: string): string | null => {
    const book = booksStore.getBookById(bookId);
    if (!book?.volumes) return null;
    for (const volume of book.volumes) {
      const chapter = volume.chapters?.find((c) => c.id === chapterId);
      if (!chapter) continue;
      const displayTitle = getChapterDisplayTitle(chapter, book).trim();
      if (displayTitle) return displayTitle;
    }
    return null;
  };

  const getWorkingChapterLabel = (task: AIProcessingTask): string | null => {
    const title = task.chapterTitle?.trim();
    if (title) return title;
    if (task.bookId && task.chapterId) {
      const resolved = resolveChapterDisplayTitle(task.bookId, task.chapterId);
      if (resolved) return resolved;
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

  // ─── 生命周期（仅主 composable 需要的清理）───

  // onMounted 中唯一需要的主 composable 任务：清理过期的 localStorage 任务状态与确保 store 已加载
  // （todos 的生命周期归属 useTranslationTodos；时钟归属 useNowClock）
  onMounted(() => {
    if (!bookDetailsStore.isLoaded) bookDetailsStore.loadState();
    const activeIds = new Set(aiProcessingStore.activeTasks.map((t) => t.id));
    bookDetailsStore.cleanupStaleTaskState(activeIds);
  });

  // ─── 手机端派生数据 ───

  const mobile = useMobilePanelData({ currentTask, now, getWorkingChapterLabel });

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
    // mobile-derived data (destructured from composable)
    mobileProgress: mobile.mobileProgress,
    mobileEta: mobile.mobileEta,
    mobileWorkflowLabel: mobile.mobileWorkflowLabel,
    mobileCurrentChapterLabel: mobile.mobileCurrentChapterLabel,
    mobileStatTotals: mobile.mobileStatTotals,
    mobileIsRunning: mobile.mobileIsRunning,
    mobileLegend: mobile.mobileLegend,
  };
}
