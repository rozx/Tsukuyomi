import { defineStore, acceptHMRUpdate } from 'pinia';
import { computed, ref, watch } from 'vue';
import { v4 } from 'uuid';
import {
  TASK_QUEUE_FINISHED_LIMIT,
  isTaskQueueItemPending,
  type TaskQueueItem,
  type TaskQueueKind,
  type TaskQueueMeta,
} from 'src/models/task-queue';
import {
  loadTaskQueue,
  mutateTaskQueue,
  type TaskQueueMutation,
  type TaskQueueSnapshot,
} from 'src/services/chapter-task/task-queue-repository';
import {
  pickStartable,
  planEnqueue,
  pruneFinished,
  reorderQueued,
  restoreInterruptedItems,
  type EnqueueRequest,
} from 'src/services/chapter-task/task-queue-logic';
import {
  electTaskQueueExecutor,
  openTaskQueueChannel,
  type ExecutorAcquireMode,
  type TaskQueueBroadcast,
} from 'src/services/chapter-task/task-queue-coordination';
import {
  batchSummaryToast,
  cancelledToast,
  completionToast,
  failureToast,
  partialSaveToast,
  stoppedAllToast,
  type BatchStats,
} from 'src/services/chapter-task/task-queue-notifications';
import type { ChapterTaskRunResult } from 'src/services/chapter-task/chapter-task-executor';
import { BookExecutionGuard } from 'src/services/book-execution-guard';
import { desktopRestartGuard } from 'src/services/desktop-restart-guard';
import type { ToastMessageWithHistoryOptions } from 'src/composables/useToastHistory';
import { recordToastInHistory } from 'src/composables/useToastHistory';
import { localizedErrorCode as errorCode } from 'src/utils/localized-error';
import { translateText } from 'src/i18n/translate';
import { useSettingsStore } from 'src/stores/settings';
import { useBooksStore } from 'src/stores/books';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import {
  runQueueItemWithStores,
  type TaskQueueRunContext,
  type TaskQueueRunner,
} from 'src/stores/task-queue-runner';

export type { TaskQueueRunner, TaskQueueRunContext } from 'src/stores/task-queue-runner';
export type { EnqueueRequest } from 'src/services/chapter-task/task-queue-logic';

export interface EnqueueResult {
  added: string[];
  skippedDuplicate: number;
  skippedNotApplicable: number;
}

export interface ChapterWriteEvent {
  bookId: string;
  chapterId: string;
  at: number;
}

interface TaskQueueConfig {
  runItem: TaskQueueRunner;
  locks: LockManager | undefined;
  /** 书籍被占用时的重试间隔 */
  retryDelayMs: number;
  /** 弹出提示（默认走 MainLayout 注册的全局 toast） */
  notify: (message: ToastMessageWithHistoryOptions) => void;
  /** 只写入消息历史、不弹出 */
  record: (message: ToastMessageWithHistoryOptions) => void;
  restartPending: () => boolean;
  /** 是否监听书库变化以清理被删除章节的队列项 */
  watchLibrary: boolean;
  /**
   * 取得书籍锁后、运行前从存储刷新书籍与本章：其他标签页可能改了目标语言等书籍设置
   * （普通书籍编辑不经队列广播），执行者手里的 Pinia 副本与章节缓存可能已过期
   */
  refreshBook: (bookId: string, chapterId: string) => Promise<unknown>;
  /** 已结束项的历史保留上限 */
  finishedLimit: number;
  now: () => number;
}

function globalToast(message: ToastMessageWithHistoryOptions): void {
  if (typeof window === 'undefined') return;
  const bridge = (
    window as unknown as { __lunaToast?: (m: ToastMessageWithHistoryOptions) => void }
  ).__lunaToast;
  // 没有界面 toast 时（壳层未挂载）至少写入消息历史
  if (bridge) bridge(message);
  else recordToastInHistory(message);
}

function defaultConfig(): TaskQueueConfig {
  return {
    runItem: runQueueItemWithStores,
    locks: typeof navigator === 'undefined' ? undefined : navigator.locks,
    retryDelayMs: 30_000,
    notify: globalToast,
    // 延迟到调用时再取，避免模块加载时就依赖 useToastHistory 的导出
    record: (message) => recordToastInHistory(message),
    restartPending: () => desktopRestartGuard.isRestartPending(),
    watchLibrary: true,
    refreshBook: (bookId, chapterId) => useBooksStore().refreshBookFromStorage(bookId, chapterId),
    finishedLimit: TASK_QUEUE_FINISHED_LIMIT,
    now: () => Date.now(),
  };
}

let config: TaskQueueConfig = defaultConfig();

/** 测试与壳层注入依赖（只覆盖传入的字段） */
export function configureTaskQueue(partial: Partial<TaskQueueConfig>): void {
  config = { ...config, ...partial };
}

export function resetTaskQueueConfig(): void {
  config = defaultConfig();
}

/** 书籍被独占操作或重启准备挡住时，按等待处理而不是失败 */
const WAIT_ERROR_CODES = new Set(['TARGET_BUSY', 'RESTART_PREPARING']);
/** 启动时发现书籍或章节已被删除：直接移除该项 */
const GONE_ERROR_CODES = new Set(['CHAPTER_MISSING', 'BOOK_DELETED']);

const kindKey = (item: { chapterId: string; kind: TaskQueueKind }) =>
  `${item.chapterId}\u0000${item.kind}`;

type RunOutcome =
  | { status: 'done'; result: ChapterTaskRunResult }
  | { status: 'wait' }
  | { status: 'gone' }
  | { status: 'cancelled'; error: unknown }
  | { status: 'failed'; error: unknown };

/**
 * 章节任务队列。
 *
 * - 队列项持久化在 IndexedDB `task-queue` 仓库，所有修改都在单个事务内完成
 * - 只有执行者标签页调度与运行；其他标签页的停止 / 暂停写成期望状态，由执行者处理
 * - 刷新或重启后（没有存活的执行者）队列恢复为暂停，原运行项回到队首从断点继续
 */
export const useTaskQueueStore = defineStore('taskQueue', () => {
  const items = ref<TaskQueueItem[]>([]);
  const meta = ref<TaskQueueMeta>({ paused: false });
  const isExecutor = ref(false);
  const executorMode = ref<ExecutorAcquireMode | null>(null);
  const lastChapterWrite = ref<ChapterWriteEvent | null>(null);

  let startPromise: Promise<void> | null = null;
  let disposed = false;
  const controllers = new Map<string, AbortController>();
  const appliedCounts = new Map<string, number>();
  const blockedUntil = new Map<string, number>();
  const stoppedByStopAll = new Set<string>();
  const waiters = new Map<string, ((item: TaskQueueItem | undefined) => void)[]>();
  /**
   * 当前这一轮批量的起点（仍待处理的批量项中最早的入队时间）。
   * 从每次快照推导而不是只在本标签页入队时记录，这样跨刷新恢复、执行者接管、
   * 其他标签页入队的批量项也能在全部结束时汇总。
   */
  let batchSince: number | null = null;
  let scheduling = false;
  let rescheduleRequested = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let releaseExecutor: (() => void) | null = null;
  let channel: ReturnType<typeof openTaskQueueChannel> | null = null;
  const stopWatchers: (() => void)[] = [];

  const queuedItems = computed(() =>
    items.value.filter((item) => item.status === 'queued').sort((a, b) => a.order - b.order),
  );
  const runningItems = computed(() =>
    items.value.filter((item) => item.status === 'running').sort((a, b) => a.order - b.order),
  );
  const finishedItems = computed(() =>
    items.value
      .filter((item) => !isTaskQueueItemPending(item.status))
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0)),
  );

  /** 找到某章节某类任务的排队中或运行中项 */
  function findPending(chapterId: string, kind: TaskQueueKind): TaskQueueItem | undefined {
    return items.value.find(
      (item) =>
        item.chapterId === chapterId && item.kind === kind && isTaskQueueItemPending(item.status),
    );
  }

  /** 排队中的位置（从 1 开始）；不在排队中返回 null */
  function queuePosition(itemId: string): number | null {
    const index = queuedItems.value.findIndex((item) => item.id === itemId);
    return index < 0 ? null : index + 1;
  }

  function resolveWaiters(): void {
    for (const [id, callbacks] of [...waiters]) {
      const item = items.value.find((entry) => entry.id === id);
      if (item && isTaskQueueItemPending(item.status)) continue;
      waiters.delete(id);
      for (const callback of callbacks) callback(item);
    }
  }

  /** 等待队列项结束（完成、失败、取消或被移出） */
  function waitForItem(itemId: string): Promise<TaskQueueItem | undefined> {
    const item = items.value.find((entry) => entry.id === itemId);
    if (!item || !isTaskQueueItemPending(item.status)) return Promise.resolve(item);
    return new Promise((resolve) => {
      waiters.set(itemId, [...(waiters.get(itemId) ?? []), resolve]);
    });
  }

  function applySnapshot(snapshot: TaskQueueSnapshot): void {
    items.value = snapshot.items;
    meta.value = snapshot.meta;
    trackBatchSince(snapshot.items);
    resolveWaiters();
  }

  /** 只有执行者负责批量汇总；其他标签页不跟踪，避免接管或移出时重复汇总 */
  function trackBatchSince(list: readonly TaskQueueItem[]): void {
    if (!isExecutor.value) return;
    for (const item of list) {
      if (item.origin !== 'batch' || !isTaskQueueItemPending(item.status)) continue;
      batchSince = batchSince === null ? item.enqueuedAt : Math.min(batchSince, item.enqueuedAt);
    }
  }

  async function mutate<T>(compute: (snapshot: TaskQueueSnapshot) => TaskQueueMutation<T>) {
    const { result, snapshot } = await mutateTaskQueue(compute);
    applySnapshot(snapshot);
    channel?.post({ type: 'changed' });
    return result;
  }

  async function reload(): Promise<void> {
    applySnapshot(await loadTaskQueue());
  }

  function uiLocale() {
    return useSettingsStore().uiLocale;
  }

  // ---------- 启动与执行者 ----------

  function ensureStarted(): Promise<void> {
    if (!startPromise) startPromise = start();
    return startPromise;
  }

  async function start(): Promise<void> {
    disposed = false;
    await reload();
    channel = openTaskQueueChannel(onBroadcast);
    await new Promise<void>((resolve) => {
      releaseExecutor = electTaskQueueExecutor(
        {
          onAcquire: (mode) => {
            void becomeExecutor(mode).finally(resolve);
          },
          onWaiting: resolve,
        },
        config.locks,
      );
    });
  }

  async function becomeExecutor(mode: ExecutorAcquireMode): Promise<void> {
    if (disposed) return;
    isExecutor.value = true;
    executorMode.value = mode;
    const aiProcessing = useAIProcessingStore();
    await aiProcessing.loadThinkingProcesses().catch(() => undefined);
    const interruptedTaskIds: string[] = [];
    await mutate((snapshot) => {
      for (const item of snapshot.items) {
        if (item.status === 'running') interruptedTaskIds.push(...item.aiTaskIds);
      }
      const restored = restoreInterruptedItems(snapshot.items);
      const changed = restored.filter((item, index) => item !== snapshot.items[index]);
      const hasPending = restored.some((item) => isTaskQueueItemPending(item.status));
      // 恢复（没有存活的执行者）时有待办就暂停；接管时保持原暂停状态
      const pause = mode !== 'takeover' && hasPending && !snapshot.meta.paused;
      return {
        put: changed,
        ...(pause ? { meta: { paused: true, pausedReason: 'restored' as const } } : {}),
        result: null,
      };
    });
    await reconcileInterruptedRecords(interruptedTaskIds);
    if (config.watchLibrary) watchLibrary();
    watchSettings();
    await schedule();
  }

  /** 把上次中断的运行记录对账为已取消（这些记录由队列负责，全局 toast 不处理） */
  async function reconcileInterruptedRecords(taskIds: string[]): Promise<void> {
    const aiProcessing = useAIProcessingStore();
    const message = translateText(uiLocale(), 'taskQueueUi.interruptedResume');
    const known = new Set(taskIds);
    const targets = aiProcessing.activeTasks.filter(
      (task) =>
        (task.status === 'thinking' || task.status === 'processing') &&
        task.queueItemId &&
        (known.has(task.id) || !controllers.has(task.queueItemId)),
    );
    for (const task of targets) {
      await aiProcessing
        .updateTask(task.id, { status: 'cancelled', message, endTime: config.now() })
        .catch(() => undefined);
    }
  }

  function onBroadcast(message: TaskQueueBroadcast): void {
    if (message.type === 'chapterWrite') {
      void useBooksStore()
        .refreshBookFromStorage(message.bookId, message.chapterId)
        .catch(() => undefined)
        .then(() => {
          lastChapterWrite.value = {
            bookId: message.bookId,
            chapterId: message.chapterId,
            at: message.at,
          };
        });
      return;
    }
    void reload().then(() => {
      if (!isExecutor.value) return;
      abortCancelRequested();
      // 其他标签页移出了剩余排队项时也要收尾这一轮批量
      maybeSummarizeBatch();
      return schedule();
    });
  }

  function watchSettings(): void {
    const settings = useSettingsStore();
    stopWatchers.push(
      watch(
        () => settings.taskQueueMaxConcurrent,
        () => void schedule(),
      ),
    );
  }

  /** 章节或书籍从书库消失时（含同步、导入造成的）清理其队列项 */
  function watchLibrary(): void {
    const books = useBooksStore();
    const chapterKeys = () => {
      const keys = new Set<string>();
      for (const book of books.books) {
        for (const volume of book.volumes ?? []) {
          for (const chapter of volume.chapters ?? []) keys.add(`${book.id}\u0000${chapter.id}`);
        }
      }
      return keys;
    };
    stopWatchers.push(
      watch(
        () => (books.isLoaded ? [...chapterKeys()].join('|') : null),
        (signature) => {
          if (signature === null) return;
          void dropMissingChapters(chapterKeys());
        },
        { immediate: true },
      ),
    );
  }

  async function dropMissingChapters(existing: Set<string>): Promise<void> {
    const missing = items.value.filter(
      (item) =>
        isTaskQueueItemPending(item.status) &&
        !existing.has(`${item.bookId}\u0000${item.chapterId}`),
    );
    if (missing.length === 0) return;
    await mutate((snapshot) => {
      const ids = new Set(missing.map((item) => item.id));
      const put: TaskQueueItem[] = [];
      const remove: string[] = [];
      for (const item of snapshot.items) {
        if (!ids.has(item.id)) continue;
        if (item.status === 'running') put.push({ ...item, cancelRequested: true });
        else if (item.status === 'queued') remove.push(item.id);
      }
      return { put, remove, result: null };
    });
    abortCancelRequested();
  }

  // ---------- 调度与运行 ----------

  async function schedule(): Promise<void> {
    if (!isExecutor.value || disposed) return;
    if (scheduling) {
      rescheduleRequested = true;
      return;
    }
    scheduling = true;
    try {
      do {
        rescheduleRequested = false;
        const now = config.now();
        const blocked = new Set(
          [...blockedUntil].filter(([, until]) => until > now).map(([bookId]) => bookId),
        );
        const picks = pickStartable(items.value, {
          paused: meta.value.paused,
          maxConcurrent: useSettingsStore().taskQueueMaxConcurrent,
          restartPending: config.restartPending(),
          blockedBookIds: blocked,
        });
        for (const pick of picks) await launch(pick.id);
      } while (rescheduleRequested);
    } finally {
      scheduling = false;
    }
    armRetryTimer();
  }

  function armRetryTimer(): void {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    const waiting = queuedItems.value.some((item) => item.waitingReason === 'book-busy');
    const restartWait = queuedItems.value.length > 0 && config.restartPending();
    if (!waiting && !restartWait) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void schedule();
    }, config.retryDelayMs);
  }

  async function launch(itemId: string): Promise<void> {
    const started = await mutate((snapshot) => {
      const current = snapshot.items.find((item) => item.id === itemId);
      // 选取 picks 用的是调度开始时的快照：期间（含其他标签页）暂停或全部停止已提交时，
      // 在把条目改为运行中的同一事务里按最新状态放弃启动
      if (
        !current ||
        current.status !== 'queued' ||
        current.cancelRequested ||
        snapshot.meta.paused
      ) {
        return { result: null };
      }
      const next: TaskQueueItem = {
        ...current,
        status: 'running',
        startedAt: config.now(),
        waitingReason: undefined,
        error: undefined,
      };
      return { put: [next], result: next };
    });
    if (!started) return;
    const controller = new AbortController();
    controllers.set(itemId, controller);
    appliedCounts.set(itemId, 0);
    void run(started, controller);
  }

  function ownerFor(item: TaskQueueItem) {
    const book = useBooksStore().getBookById(item.bookId);
    const chapter = book?.volumes
      ?.flatMap((volume) => volume.chapters ?? [])
      .find((entry) => entry.id === item.chapterId);
    const title = chapter
      ? typeof chapter.title === 'string'
        ? chapter.title
        : chapter.title.original
      : item.chapterId;
    const kind = translateText('zh-CN', `taskQueueUi.kind.${item.kind}`);
    return {
      label: translateText('zh-CN', 'taskQueueUi.owner', { kind, chapter: title }),
      labelKey: 'taskQueueUi.owner' as const,
      labelValues: { kind, chapter: title },
      chapterId: item.chapterId,
    };
  }

  async function run(item: TaskQueueItem, controller: AbortController): Promise<void> {
    const route = (message: ToastMessageWithHistoryOptions) =>
      item.origin === 'manual' ? config.notify(message) : config.record(message);
    const ctx: TaskQueueRunContext = {
      persistItem: (patch) => persistPatch(item.id, patch),
      onChapterWrite: emitChapterWrite,
      notify: route,
      onAppliedCount: (count) => appliedCounts.set(item.id, count),
    };
    let outcome: RunOutcome;
    try {
      const result = await BookExecutionGuard.write(item.bookId, ownerFor(item), async () => {
        // 取得书籍锁后再读最新的书籍与本章，执行器据此解析目标语言、模型与段落范围
        await config.refreshBook(item.bookId, item.chapterId);
        return config.runItem(item, controller.signal, ctx);
      });
      outcome = controller.signal.aborted
        ? { status: 'cancelled', error: undefined }
        : { status: 'done', result };
    } catch (error) {
      if (controller.signal.aborted) outcome = { status: 'cancelled', error };
      else if (WAIT_ERROR_CODES.has(errorCode(error, ''))) outcome = { status: 'wait' };
      else if (GONE_ERROR_CODES.has(errorCode(error, ''))) outcome = { status: 'gone' };
      else outcome = { status: 'failed', error };
    } finally {
      controllers.delete(item.id);
    }
    // 已释放（标签页关闭 / 测试清理）后不再写入，交给接管的执行者按断点继续
    if (disposed) return;
    await finish(item, outcome);
    await schedule();
  }

  async function persistPatch(itemId: string, patch: Partial<TaskQueueItem>): Promise<void> {
    await mutate((snapshot) => {
      const current = snapshot.items.find((item) => item.id === itemId);
      if (!current) return { result: null };
      return { put: [{ ...current, ...patch }], result: null };
    });
  }

  function emitChapterWrite(bookId: string, chapterId: string): void {
    const event = { bookId, chapterId, at: config.now() };
    lastChapterWrite.value = event;
    channel?.post({ type: 'chapterWrite', ...event });
  }

  async function finish(item: TaskQueueItem, outcome: RunOutcome): Promise<void> {
    const now = config.now();
    if (outcome.status === 'gone') {
      appliedCounts.delete(item.id);
      await mutate(() => ({ remove: [item.id], result: null }));
      maybeSummarizeBatch();
      return;
    }
    if (outcome.status === 'wait') blockedUntil.set(item.bookId, now + config.retryDelayMs);
    const finished = await mutate((snapshot) => {
      const current = snapshot.items.find((entry) => entry.id === item.id);
      if (!current) return { result: null };
      let next: TaskQueueItem;
      // 书籍被占用时回到排队等待；但这次运行期间已落盘停止请求（含其他标签页的停止 / 全部停止、
      // 章节被删除）时直接落为已取消——带着 cancelRequested 回到排队会被调度永远跳过
      if (outcome.status === 'wait' && !current.cancelRequested) {
        next = { ...current, status: 'queued', waitingReason: 'book-busy' };
      } else {
        const error =
          outcome.status === 'failed'
            ? {
                code: errorCode(outcome.error, 'UNKNOWN'),
                message:
                  outcome.error instanceof Error ? outcome.error.message : String(outcome.error),
              }
            : undefined;
        next = {
          ...current,
          status: outcome.status === 'wait' ? 'cancelled' : outcome.status,
          endedAt: now,
          cancelRequested: false,
          waitingReason: undefined,
          error,
        };
      }
      const all = snapshot.items.map((entry) => (entry.id === next.id ? next : entry));
      // 本轮批量汇总前保留它的结束项，历史裁剪不能改变汇总的完成 / 失败数（汇总后再裁剪）
      const prunable = all.filter((entry) => !inCurrentBatch(entry));
      return {
        put: [next],
        remove: pruneFinished(prunable, config.finishedLimit),
        result: next,
      };
    });
    if (!finished || finished.status === 'queued') return;
    notifyOutcome(
      finished,
      outcome.status === 'wait' ? { status: 'cancelled', error: undefined } : outcome,
    );
  }

  function notifyOutcome(
    item: TaskQueueItem,
    outcome: Exclude<RunOutcome, { status: 'wait' } | { status: 'gone' }>,
  ) {
    const locale = uiLocale();
    const applied = appliedCounts.get(item.id) ?? 0;
    appliedCounts.delete(item.id);
    const fromStopAll = stoppedByStopAll.delete(item.id);
    if (item.origin === 'batch') {
      maybeSummarizeBatch();
      return;
    }
    if (outcome.status === 'done') {
      config.notify(completionToast(item, outcome.result, locale));
      maybeSummarizeBatch();
      return;
    }
    if (outcome.status === 'failed') config.notify(failureToast(item, outcome.error, locale));
    else if (!fromStopAll) config.notify(cancelledToast(item, locale));
    if (item.kind === 'translation' && applied > 0) {
      config.notify(partialSaveToast(outcome.status === 'cancelled', applied, locale));
    }
    // 最后结束的可能是手动任务，批量项此前已全部结束
    maybeSummarizeBatch();
  }

  /** 是否属于尚未汇总的这一轮批量 */
  function inCurrentBatch(item: TaskQueueItem): boolean {
    return batchSince !== null && item.origin === 'batch' && item.enqueuedAt >= batchSince;
  }

  /** 已结束项超过保留上限时裁掉最早结束的（汇总后补做本轮保留下来的部分） */
  function pruneHistory(): void {
    if (pruneFinished(items.value, config.finishedLimit).length === 0) return;
    void mutate((snapshot) => ({
      remove: pruneFinished(snapshot.items, config.finishedLimit),
      result: null,
    })).catch(() => undefined);
  }

  /** 队列不再有待处理项时，按持久化的结果汇总这一轮批量（含刷新前已结束的项） */
  function maybeSummarizeBatch(): void {
    if (!isExecutor.value || batchSince === null) return;
    if (items.value.some((item) => isTaskQueueItemPending(item.status))) return;
    const since = batchSince;
    batchSince = null;
    const stats: BatchStats = { done: 0, failed: 0, cancelled: 0 };
    for (const item of items.value) {
      if (item.origin !== 'batch' || item.enqueuedAt < since) continue;
      if (item.status === 'done') stats.done += 1;
      else if (item.status === 'failed') stats.failed += 1;
      else if (item.status === 'cancelled') stats.cancelled += 1;
    }
    pruneHistory();
    // 剩余批量项都被移出、一项也没结束时不提示
    if (stats.done + stats.failed + stats.cancelled === 0) return;
    config.notify(batchSummaryToast(stats, uiLocale()));
  }

  /** 执行者：中止所有请求了取消的运行项 */
  function abortCancelRequested(): void {
    const aiProcessing = useAIProcessingStore();
    for (const item of items.value) {
      if (item.status !== 'running' || !item.cancelRequested) continue;
      const controller = controllers.get(item.id);
      if (!controller || controller.signal.aborted) continue;
      controller.abort();
      const lastTaskId = item.aiTaskIds.at(-1);
      if (lastTaskId) void aiProcessing.stopTask(lastTaskId).catch(() => undefined);
    }
  }

  // ---------- 用户操作 ----------

  async function enqueue(
    requests: EnqueueRequest[],
    options: { position: 'front' | 'back'; isApplicable?: (request: EnqueueRequest) => boolean },
  ): Promise<EnqueueResult> {
    await ensureStarted();
    const plan = await mutate((snapshot) => {
      const result = planEnqueue(snapshot.items, requests, {
        position: options.position,
        now: config.now(),
        newId: v4,
        ...(options.isApplicable ? { isApplicable: options.isApplicable } : {}),
      });
      return { put: result.added, result };
    });
    await schedule();
    return {
      added: plan.added.map((item) => item.id),
      skippedDuplicate: plan.skippedDuplicate,
      skippedNotApplicable: plan.skippedNotApplicable,
    };
  }

  /** 停止运行中的项（期望状态，由执行者中止） */
  async function stopItem(itemId: string): Promise<void> {
    await mutate((snapshot) => {
      const current = snapshot.items.find((item) => item.id === itemId);
      if (!current || current.status !== 'running') return { result: null };
      return { put: [{ ...current, cancelRequested: true }], result: null };
    });
    if (isExecutor.value) abortCancelRequested();
  }

  /** 中止所有运行项并暂停队列，排队项保留；只提示一次 */
  async function stopAll(): Promise<void> {
    const stopped = await mutate((snapshot) => {
      const running = snapshot.items.filter((item) => item.status === 'running');
      return {
        put: running.map((item) => ({ ...item, cancelRequested: true })),
        meta: { paused: true, pausedReason: 'user' as const },
        result: running.map((item) => item.id),
      };
    });
    for (const id of stopped) stoppedByStopAll.add(id);
    if (stopped.length > 0) config.notify(stoppedAllToast(stopped.length, uiLocale()));
    if (isExecutor.value) abortCancelRequested();
  }

  async function pause(): Promise<void> {
    await mutate(() => ({ meta: { paused: true, pausedReason: 'user' as const }, result: null }));
  }

  async function resume(): Promise<void> {
    await mutate(() => ({ meta: { paused: false }, result: null }));
    await schedule();
  }

  /** 移出排队项（或删除已结束项） */
  async function removeItem(itemId: string): Promise<void> {
    await mutate((snapshot) => {
      const current = snapshot.items.find((item) => item.id === itemId);
      if (!current || current.status === 'running') return { result: null };
      return { remove: [itemId], result: null };
    });
    maybeSummarizeBatch();
  }

  async function removeAllQueued(): Promise<void> {
    await mutate((snapshot) => ({
      remove: snapshot.items.filter((item) => item.status === 'queued').map((item) => item.id),
      result: null,
    }));
    maybeSummarizeBatch();
  }

  async function reorder(itemId: string, toIndex: number): Promise<void> {
    await mutate((snapshot) => {
      const next = reorderQueued(snapshot.items, itemId, toIndex);
      return { put: next.filter((item, index) => item !== snapshot.items[index]), result: null };
    });
  }

  /** 失败或已取消的项重新排到队首，保留断点 */
  async function retry(itemId: string): Promise<void> {
    await mutate((snapshot) => {
      const current = snapshot.items.find((item) => item.id === itemId);
      if (!current || (current.status !== 'failed' && current.status !== 'cancelled')) {
        return { result: null };
      }
      const duplicate = snapshot.items.some(
        (item) =>
          item.id !== itemId &&
          isTaskQueueItemPending(item.status) &&
          kindKey(item) === kindKey(current),
      );
      if (duplicate) return { result: null };
      const queuedOrders = snapshot.items
        .filter((item) => item.status === 'queued')
        .map((item) => item.order);
      const order = queuedOrders.length ? Math.min(...queuedOrders) - 1 : current.order;
      return {
        put: [
          {
            ...current,
            status: 'queued',
            order,
            error: undefined,
            endedAt: undefined,
            cancelRequested: false,
          },
        ],
        result: null,
      };
    });
    await schedule();
  }

  async function clearFinished(): Promise<void> {
    await mutate((snapshot) => ({
      remove: snapshot.items
        .filter((item) => !isTaskQueueItemPending(item.status))
        .map((item) => item.id),
      result: null,
    }));
  }

  /** 释放执行者、关闭广播、停止监听（测试与 HMR 使用） */
  function dispose(): void {
    disposed = true;
    for (const controller of controllers.values()) controller.abort();
    controllers.clear();
    releaseExecutor?.();
    releaseExecutor = null;
    channel?.close();
    channel = null;
    for (const stop of stopWatchers.splice(0)) stop();
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    startPromise = null;
    isExecutor.value = false;
  }

  return {
    items,
    meta,
    isExecutor,
    executorMode,
    lastChapterWrite,
    queuedItems,
    runningItems,
    finishedItems,
    findPending,
    queuePosition,
    waitForItem,
    ensureStarted,
    schedule,
    enqueue,
    stopItem,
    stopAll,
    pause,
    resume,
    removeItem,
    removeAllQueued,
    reorder,
    retry,
    // 任务中心模板经 injectTaskCenter().queue 调用，静态分析追踪不到
    // fallow-ignore-next-line unused-store-member
    clearFinished,
    dispose,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useTaskQueueStore, import.meta.hot));
}
