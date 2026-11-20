import { computed, inject, onMounted, provide, reactive, ref, watch, type InjectionKey } from 'vue';
import { useRouter } from 'vue-router';
import { useTaskQueueStore } from 'src/stores/task-queue';
import { useAIProcessingStore, type AIProcessingTask } from 'src/stores/ai-processing';
import { useBooksStore } from 'src/stores/books';
import { useBookDetailsStore } from 'src/stores/book-details';
import { useSettingsStore } from 'src/stores/settings';
import { useUiStore, type TaskCenterPosition } from 'src/stores/ui';
import type { TaskQueueItem } from 'src/models/task-queue';
import { useThinkingFormatter } from 'src/composables/useThinkingFormatter';
import { useTranslationTodos } from 'src/composables/translation-progress/useTranslationTodos';
import { useNowClock } from 'src/composables/translation-progress/useNowClock';
import { formatTaskDuration } from 'src/utils';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';
import {
  computeChipState,
  isOtherActivity,
  isRunningTask,
  itemProgress,
  overallProgress,
} from './task-center-state';

const ACK_KEY = 'tsukuyomi-task-center-ack';

function readAck(): number {
  try {
    return Number(localStorage.getItem(ACK_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeAck(value: number): void {
  try {
    localStorage.setItem(ACK_KEY, String(value));
  } catch {
    // 无法持久化时只在本次会话内生效
  }
}

/**
 * 展开行的详细过程：
 * - local：本标签页是执行者且有运行记录，显示状态栏、待办与流式内容
 * - remote：队列在另一个标签页执行，只显示进度
 * - cleared：已结束且日志已被历史上限清理，只显示结果摘要
 * - none：尚未开始（排队中）
 */
export type TaskCenterDetail = 'local' | 'remote' | 'cleared' | 'none';

export interface TaskCenterRow {
  id: string;
  item: TaskQueueItem;
  bookTitle: string;
  chapterTitle: string;
  progress: { current: number; total: number; percent: number };
  task: AIProcessingTask | null;
  detail: TaskCenterDetail;
}

/**
 * 任务中心的共享状态与操作（chip、popup、固定面板、手机抽屉共用）。
 * 由 MainLayout dispatcher 调用 provideTaskCenter() 创建一次，各处通过 injectTaskCenter() 读取。
 */
export function createTaskCenter() {
  const queue = useTaskQueueStore();
  const ai = useAIProcessingStore();
  const books = useBooksStore();
  const bookDetails = useBookDetailsStore();
  const settings = useSettingsStore();
  const ui = useUiStore();
  const router = useRouter();
  const { now } = useNowClock();

  // ---------- 打开 / 确认 ----------
  const acknowledgedAt = ref(readAck());
  const isOpen = ref(false);
  let opener: ((event?: Event) => void) | null = null;

  const acknowledge = () => {
    acknowledgedAt.value = Date.now();
    writeAck(acknowledgedAt.value);
  };
  /** 由任务中心变体注册：桌面切换 popover，手机切换底部抽屉 */
  const registerOpener = (fn: ((event?: Event) => void) | null) => {
    opener = fn;
  };
  const toggle = (event?: Event) => {
    acknowledge();
    opener?.(event);
  };
  const setOpen = (open: boolean) => {
    isOpen.value = open;
    if (open) acknowledge();
  };

  // ---------- 行数据 ----------
  const chapterInfo = (item: TaskQueueItem) => {
    const book = books.getBookById(item.bookId);
    const chapter = book?.volumes
      ?.flatMap((volume) => volume.chapters ?? [])
      .find((entry) => entry.id === item.chapterId);
    return {
      bookTitle: book?.title ?? '',
      chapterTitle: chapter && book ? getChapterDisplayTitle(chapter, book) : item.chapterId,
    };
  };

  const taskById = computed(() => new Map(ai.activeTasks.map((task) => [task.id, task])));

  const toRow = (item: TaskQueueItem): TaskCenterRow => {
    const lastTaskId = item.aiTaskIds.at(-1);
    const task = lastTaskId ? (taskById.value.get(lastTaskId) ?? null) : null;
    let detail: TaskCenterDetail = 'none';
    if (item.status === 'running') detail = queue.isExecutor && task ? 'local' : 'remote';
    else if (item.status !== 'queued') detail = task ? 'local' : 'cleared';
    return { id: item.id, item, ...chapterInfo(item), progress: itemProgress(item), task, detail };
  };

  const groups = computed(() => ({
    running: queue.runningItems.map(toRow),
    queued: queue.queuedItems.map(toRow),
    finished: queue.finishedItems.map(toRow),
  }));

  const otherTasks = computed(() =>
    ai.activeTasks
      .filter(isOtherActivity)
      .sort((a, b) => {
        const running = Number(isRunningTask(b)) - Number(isRunningTask(a));
        return running !== 0 ? running : b.startTime - a.startTime;
      }),
  );
  const otherActiveCount = computed(() => otherTasks.value.filter(isRunningTask).length);

  // ---------- chip ----------
  const chip = computed(() =>
    computeChipState({
      items: queue.items,
      otherActive: otherActiveCount.value,
      paused: queue.meta.paused,
      acknowledgedAt: acknowledgedAt.value,
    }),
  );
  const overall = computed(() => overallProgress(queue.items, acknowledgedAt.value));

  /** 新的章节任务入队或开始时短暂提示（不打开 popup、不动右侧面板） */
  const flash = ref(false);
  let flashTimer: ReturnType<typeof setTimeout> | null = null;
  watch(
    () => queue.items.filter((item) => item.status === 'queued' || item.status === 'running').map((item) => item.id).join(),
    (next, prev) => {
      const before = new Set(prev ? prev.split(',') : []);
      if (!next.split(',').some((id) => id && !before.has(id))) return;
      flash.value = true;
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        flash.value = false;
      }, 1200);
    },
  );

  // ---------- 展开与未读 ----------
  const expandedId = computed(() => ui.taskCenterExpandedId);
  const unseen = reactive(new Set<string>());

  const toggleExpand = (id: string) => {
    const next = ui.taskCenterExpandedId === id ? null : id;
    ui.setTaskCenterExpandedId(next);
    if (next) unseen.delete(next);
  };
  const isUnseen = (id: string) => unseen.has(id);

  /** 行 ID → 运行记录：队列行用最新运行记录，其他活动行用自身 */
  const watchedTasks = computed(() => {
    const entries: [string, AIProcessingTask][] = [];
    for (const row of [...groups.value.running, ...groups.value.finished]) {
      if (row.task) entries.push([row.id, row.task]);
    }
    for (const task of otherTasks.value) entries.push([task.id, task]);
    return entries;
  });
  watch(
    () =>
      watchedTasks.value.map(([rowId, task]) => ({
        rowId,
        size: (task.thinkingMessage?.length ?? 0) + (task.outputContent?.length ?? 0),
      })),
    (next, prev) => {
      const before = new Map((prev ?? []).map((entry) => [entry.rowId, entry.size]));
      for (const entry of next) {
        const old = before.get(entry.rowId);
        if (old === undefined || entry.size <= old) continue;
        if (entry.rowId !== ui.taskCenterExpandedId) unseen.add(entry.rowId);
      }
    },
  );

  // ---------- 展开行的详细过程 ----------
  const expandedTask = computed<AIProcessingTask | null>(() => {
    const id = ui.taskCenterExpandedId;
    if (!id) return null;
    const row = [...groups.value.running, ...groups.value.finished].find((entry) => entry.id === id);
    if (row?.detail === 'local') return row.task;
    return otherTasks.value.find((task) => task.id === id) ?? null;
  });
  const detailTasks = computed(() => (expandedTask.value ? [expandedTask.value] : []));
  const { getFormatted } = useThinkingFormatter(detailTasks);
  const expandedParts = computed(() =>
    expandedTask.value ? getFormatted(expandedTask.value.id) : [],
  );
  const { currentTaskTodos } = useTranslationTodos({
    recentAITasks: detailTasks,
    currentTask: expandedTask,
  });
  const todoCollapsed = computed(() => bookDetails.translationProgress.todoCollapsed);
  const toggleTodoCollapsed = () => bookDetails.toggleTodoCollapsed();
  const autoScroll = computed(() =>
    expandedTask.value
      ? bookDetails.translationProgress.autoScrollEnabled[expandedTask.value.id] !== false
      : true,
  );
  const toggleAutoScroll = () => {
    if (!expandedTask.value) return;
    bookDetails.setTranslationProgressAutoScroll(expandedTask.value.id, !autoScroll.value);
  };
  const formatDuration = (startTime: number, endTime?: number) =>
    formatTaskDuration(startTime, endTime, now.value, settings.uiLocale);

  // ---------- 队列操作 ----------
  const openChapter = async (row: TaskCenterRow) => {
    bookDetails.setSelectedChapter(row.item.bookId, row.item.chapterId);
    await router.push(`/books/${row.item.bookId}`);
  };

  // ---------- 其他 AI 活动 ----------
  const stopOther = (taskId: string) => ai.stopTask(taskId);
  const clearOther = async (scope: 'finished' | 'all') => {
    // 运行中的任务不删除；scope 只决定是否包含出错 / 取消的记录
    const removable = otherTasks.value.filter(
      (task) => !isRunningTask(task) && (scope === 'all' || task.status === 'end'),
    );
    await Promise.all(removable.map((task) => ai.removeTask(task.id)));
  };

  // ---------- 固定面板 ----------
  const pinned = computed(() => ui.taskCenterPinned);
  const collapsed = computed(() => ui.taskCenterCollapsed);
  const position = computed(() => ui.taskCenterPosition);
  const setPinned = (value: boolean) => ui.setTaskCenterPinned(value);
  const setCollapsed = (value: boolean) => ui.setTaskCenterCollapsed(value);
  const setPosition = (value: TaskCenterPosition | null) => ui.setTaskCenterPosition(value);
  const otherCollapsed = computed(() => ui.taskCenterOtherCollapsed);
  const toggleOtherCollapsed = () => ui.setTaskCenterOtherCollapsed(!ui.taskCenterOtherCollapsed);

  const maxConcurrent = computed(() => settings.taskQueueMaxConcurrent);

  // 清理已不存在任务的自动滚动标记，避免 localStorage 里无限累积
  onMounted(() => {
    if (!bookDetails.isLoaded) bookDetails.loadState();
    bookDetails.cleanupStaleTaskState(new Set(ai.activeTasks.map((task) => task.id)));
  });
  const noLocks = computed(
    () => queue.executorMode === 'standalone' && typeof navigator !== 'undefined' && !navigator.locks,
  );

  return {
    queue,
    // 打开
    isOpen,
    setOpen,
    toggle,
    registerOpener,
    acknowledge,
    // chip
    chip,
    overall,
    flash,
    maxConcurrent,
    noLocks,
    // 列表
    groups,
    otherTasks,
    otherActiveCount,
    // 展开与未读
    expandedId,
    toggleExpand,
    isUnseen,
    expandedTask,
    expandedParts,
    currentTaskTodos,
    todoCollapsed,
    toggleTodoCollapsed,
    autoScroll,
    toggleAutoScroll,
    formatDuration,
    // 操作
    openChapter,
    stopOther,
    clearOther,
    // 固定面板
    pinned,
    collapsed,
    position,
    setPinned,
    setCollapsed,
    setPosition,
    otherCollapsed,
    toggleOtherCollapsed,
  };
}

export type TaskCenter = ReturnType<typeof createTaskCenter>;

const TASK_CENTER_KEY: InjectionKey<TaskCenter> = Symbol('task-center');

export function provideTaskCenter(): TaskCenter {
  const center = createTaskCenter();
  provide(TASK_CENTER_KEY, center);
  return center;
}

export function injectTaskCenter(): TaskCenter {
  const center = inject(TASK_CENTER_KEY);
  if (!center) throw new Error('injectTaskCenter() 必须在 provideTaskCenter() 的后代中调用');
  return center;
}

/** 不在任务中心提供范围内时返回 null（例如单独挂载页面 composable 的测试） */
export function injectTaskCenterOptional(): TaskCenter | null {
  return inject(TASK_CENTER_KEY, null);
}
