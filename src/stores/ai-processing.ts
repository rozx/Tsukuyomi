import { defineStore, acceptHMRUpdate } from 'pinia';
import { toRaw } from 'vue';
import { getDB } from 'src/utils/indexed-db';
import { TASK_TYPE_LABELS, type AIWorkflowStatus } from 'src/constants/ai';
import { TodoListService } from 'src/services/todo-list-service';
import co from 'co';

/**
 * AI 处理历史记录的最大数量
 * 超过此数量时，会自动删除最旧的记录
 */
const MAX_AI_PROCESS_HISTORY = 30;

export interface AIProcessingTask {
  id: string;
  type:
    | 'translation'
    | 'proofreading'
    | 'polish'
    | 'termsTranslation'
    | 'assistant'
    | 'config'
    | 'other';
  modelName: string;
  status: AIProcessingTaskStatus;
  workflowStatus?: AIWorkflowStatus; // 详细的工作流状态 (planning, working, review, end)
  message?: string;
  thinkingMessage?: string; // 实际的 AI 思考消息（从流式响应中累积）
  outputContent?: string; // AI 的实际输出内容（翻译/润色/校对结果）
  contextTokens?: number; // 估算的上下文 token 使用量
  contextWindow?: number; // 模型上下文窗口大小
  contextPercentage?: number; // 上下文使用百分比（0-100）
  /**
   * 关联的书籍 ID（用于 UI 展示“当前工作章节”等信息）
   * 注意：该字段可选，兼容历史任务数据
   */
  bookId?: string;
  /**
   * 关联的章节 ID（用于 UI 展示“当前工作章节”等信息）
   * 注意：该字段可选，兼容历史任务数据
   */
  chapterId?: string;
  /**
   * 关联的章节标题（可选，若缺失可通过 bookId + chapterId 再查询）
   */
  chapterTitle?: string;
  /**
   * 翻译/润色/校对任务的段落进度（可选，仅翻译类任务有效）
   */
  progress?: { current: number; total: number; message: string };
  /**
   * 是否为单段润色/校对任务
   * Why: 单段任务由段落行内按钮触发，生命周期短，不应出现在翻译进度面板中，
   * 避免与章节级批量任务混淆、刷屏。
   * How to apply: 在 TranslationProgress 面板及相关列表过滤时跳过该类任务。
   */
  isSingleParagraph?: boolean;
  startTime: number;
  endTime?: number;
  abortController?: AbortController; // 用于取消请求（不持久化）
}

export type AIProcessingTaskStatus = 'thinking' | 'processing' | 'end' | 'error' | 'cancelled';

// 非终态任务状态集合：处于这些状态时，计时器应持续走动
const RUNNING_TASK_STATUSES = new Set<AIProcessingTaskStatus>(['thinking', 'processing']);

type LegacyAIProcessingTaskStatus = AIProcessingTaskStatus | 'completed' | 'review';

type LegacySerializableTask = SerializableTask & {
  maxInputTokens?: number;
};

/**
 * 兼容迁移：将历史任务状态值规范化到当前枚举集合
 * - 旧值 `completed` / `review` → 新值 `end`
 */
export function normalizeAIProcessingTaskStatus(status: unknown): AIProcessingTaskStatus {
  // 历史版本：`completed` / `review` 都曾表示“已完成（可清理）”，统一迁移为 `end`
  if (status === 'completed' || status === 'review') return 'end';
  if (
    status === 'thinking' ||
    status === 'processing' ||
    status === 'end' ||
    status === 'error' ||
    status === 'cancelled'
  ) {
    return status;
  }
  return 'error';
}

/**
 * 可序列化的任务（用于 IndexedDB 存储）
 */
type SerializableTask = Omit<AIProcessingTask, 'abortController'>;

/**
 * 从 IndexedDB 加载思考过程
 */
async function loadThinkingProcessesFromDB(): Promise<SerializableTask[]> {
  try {
    const db = await getDB();
    const tasks = await db.getAll('thinking-processes');
    // 兼容迁移：历史数据中可能存在旧状态值 completed，需要映射为 review
    const normalizedTasks = tasks.map((t) => {
      const legacyTask = t as LegacySerializableTask;
      const legacyStatus = legacyTask.status as LegacyAIProcessingTaskStatus;
      const newStatus = normalizeAIProcessingTaskStatus(legacyStatus);
      const normalizedContextWindow =
        legacyTask.contextWindow !== undefined
          ? legacyTask.contextWindow
          : legacyTask.maxInputTokens;

      const { maxInputTokens: _legacyMaxInputTokens, ...rest } = legacyTask;

      return {
        ...rest,
        status: newStatus,
        ...(normalizedContextWindow !== undefined
          ? { contextWindow: normalizedContextWindow }
          : {}),
      } as SerializableTask;
    });

    // 按开始时间倒序排列
    return normalizedTasks.sort((a, b) => b.startTime - a.startTime);
  } catch (error) {
    console.error('Failed to load thinking processes from DB:', error);
    return [];
  }
}

/**
 * 保存思考过程到 IndexedDB
 */
async function saveThinkingProcessToDB(task: AIProcessingTask): Promise<void> {
  try {
    const db = await getDB();
    // 使用 toRaw() 解除 Pinia reactive proxy，避免 IndexedDB structured clone 失败
    const raw = toRaw(task);
    // 创建可序列化的副本，排除 abortController
    const serializableTask: SerializableTask = {
      id: raw.id,
      type: raw.type,
      modelName: raw.modelName,
      status: raw.status,
      ...(raw.workflowStatus !== undefined && { workflowStatus: raw.workflowStatus }),
      ...(raw.message !== undefined && { message: raw.message }),
      ...(raw.thinkingMessage !== undefined && { thinkingMessage: raw.thinkingMessage }),
      ...(raw.outputContent !== undefined && { outputContent: raw.outputContent }),
      ...(raw.contextTokens !== undefined && { contextTokens: raw.contextTokens }),
      ...(raw.contextWindow !== undefined && { contextWindow: raw.contextWindow }),
      ...(raw.contextPercentage !== undefined && { contextPercentage: raw.contextPercentage }),
      ...(raw.bookId !== undefined && { bookId: raw.bookId }),
      ...(raw.chapterId !== undefined && { chapterId: raw.chapterId }),
      ...(raw.chapterTitle !== undefined && { chapterTitle: raw.chapterTitle }),
      ...(raw.progress !== undefined && {
        progress: { current: raw.progress.current, total: raw.progress.total, message: raw.progress.message },
      }),
      ...(raw.isSingleParagraph !== undefined && { isSingleParagraph: raw.isSingleParagraph }),
      startTime: raw.startTime,
      ...(raw.endTime !== undefined && { endTime: raw.endTime }),
    };
    await db.put('thinking-processes', serializableTask);
  } catch (error) {
    // 记录错误但不抛出，避免阻塞任务流程
    console.error('Failed to save thinking process to DB:', error);
    // 如果是存储不存在，可能是数据库版本问题，记录更详细的错误
    if (error instanceof Error && error.message.includes('object store')) {
      console.warn('thinking-processes store may not exist. Database may need to be upgraded.');
    }
  }
}

/**
 * 从 IndexedDB 删除思考过程
 */
async function deleteThinkingProcessFromDB(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('thinking-processes', id);
  } catch (error) {
    console.error('Failed to delete thinking process from DB:', error);
  }
}

/**
 * 批量从 IndexedDB 删除思考过程
 */
async function deleteThinkingProcessesFromDB(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return; // 空数组，无需删除
  }
  try {
    const db = await getDB();
    const tx = db.transaction('thinking-processes', 'readwrite');
    await Promise.all(ids.map((id) => tx.store.delete(id)));
    await tx.done;
  } catch (error) {
    console.error('Failed to delete thinking processes from DB:', error);
  }
}

/**
 * 清空所有思考过程
 */
async function clearAllThinkingProcessesFromDB(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear('thinking-processes');
  } catch (error) {
    console.error('Failed to clear thinking processes from DB:', error);
  }
}

/**
 * 节流定时器映射，用于限制每个任务的更新频率
 * taskId -> { timer: number | null, pendingText: string, lastUpdate: number }
 */
const taskThrottleMap = new Map<
  string,
  { timer: number | null; pendingText: string; lastUpdate: number }
>();

/**
 * 节流更新思考消息（每 300ms 最多更新一次）
 */
function throttledUpdateThinkingMessage(
  task: AIProcessingTask,
  text: string,
  updateFn: (task: AIProcessingTask, text: string) => void,
): void {
  const throttleInfo = taskThrottleMap.get(task.id);
  const now = Date.now();

  if (!throttleInfo) {
    // 第一次更新，立即执行
    updateFn(task, text);
    taskThrottleMap.set(task.id, {
      timer: null,
      pendingText: '',
      lastUpdate: now,
    });
    return;
  }

  // 累积待更新的文本
  throttleInfo.pendingText += text;

  // 如果距离上次更新超过 300ms，立即更新
  if (now - throttleInfo.lastUpdate >= 300) {
    if (throttleInfo.pendingText) {
      updateFn(task, throttleInfo.pendingText);
      throttleInfo.pendingText = '';
      throttleInfo.lastUpdate = now;
    }
    // 清除之前的定时器
    if (throttleInfo.timer !== null) {
      clearTimeout(throttleInfo.timer);
      throttleInfo.timer = null;
    }
  } else {
    // 距离上次更新不足 300ms，延迟更新
    if (throttleInfo.timer === null) {
      const delay = Math.max(0, 300 - (now - throttleInfo.lastUpdate));
      throttleInfo.timer = window.setTimeout(() => {
        // 检查节流信息是否仍然存在（任务可能已被删除）
        const currentThrottleInfo = taskThrottleMap.get(task.id);
        if (currentThrottleInfo && currentThrottleInfo.pendingText) {
          updateFn(task, currentThrottleInfo.pendingText);
          currentThrottleInfo.pendingText = '';
          currentThrottleInfo.lastUpdate = Date.now();
        }
        if (currentThrottleInfo) {
          currentThrottleInfo.timer = null;
        }
      }, delay);
    }
  }
}

/**
 * 清理任务的节流信息。若提供 task，会先把缓冲区里的 pendingText 写回 task.thinkingMessage，
 * 避免任务在节流窗口内切到终态时丢失尾部的 `[工具结果: ...]` 等标记，导致 UI 上的
 * tool-call 指示器永远停在 running 状态（参见 task-runner.ts 的 executeToolCall）。
 */
function clearTaskThrottle(taskId: string, task?: AIProcessingTask): void {
  const throttleInfo = taskThrottleMap.get(taskId);
  if (throttleInfo) {
    if (task && throttleInfo.pendingText) {
      if (!task.thinkingMessage) task.thinkingMessage = '';
      task.thinkingMessage += throttleInfo.pendingText;
    }
    if (throttleInfo.timer !== null) {
      clearTimeout(throttleInfo.timer);
    }
    taskThrottleMap.delete(taskId);
  }
  // 同时清理持久化节流，避免任务已被删除后仍有定时器持有引用
  clearTaskPersistTimer(taskId);
}

/**
 * 持久化节流：限制同一任务写入 IndexedDB 的频率。
 *
 * 背景：流式响应每秒会触发几十次 `appendThinkingMessage`/`appendOutputContent`，
 * 先前实现中每次调用都会调度一次独立的 `saveThinkingProcessToDB`，
 * 导致主线程在结构化克隆和 IDB 事务上被反复阻塞，造成全局卡顿。
 *
 * 现在的策略：每个任务至多每 `PERSIST_THROTTLE_MS` 写入一次。
 * 若已有挂起的定时器，则直接丢弃当前调用——定时器触发时会用
 * `getLatestTask()` 读取最新状态，保证写入的永远是调用瞬间的最新数据。
 */
const PERSIST_THROTTLE_MS = 1000;
const taskPersistMap = new Map<string, number>();

function schedulePersistTask(
  taskId: string,
  getLatestTask: () => AIProcessingTask | undefined,
): void {
  if (taskPersistMap.has(taskId)) return;
  const timer = window.setTimeout(() => {
    taskPersistMap.delete(taskId);
    const latest = getLatestTask();
    if (latest) {
      void saveThinkingProcessToDB(latest);
    }
  }, PERSIST_THROTTLE_MS);
  taskPersistMap.set(taskId, timer);
}

function clearTaskPersistTimer(taskId: string): void {
  const timer = taskPersistMap.get(taskId);
  if (timer !== undefined) {
    clearTimeout(timer);
    taskPersistMap.delete(taskId);
  }
}

/**
 * 检查任务数量是否超过 MAX_AI_PROCESS_HISTORY，若超限则按开始时间删除最旧的非运行态任务。
 *
 * 该辅助函数抽取自 loadThinkingProcesses 和 addTask 中完全相同的"超限裁剪"逻辑，
 * 调用方只需提供日志文案差异（加载场景 vs 新增场景）。
 *
 * 副作用：
 *   - 异步（通过 co）从 IndexedDB 批量删除被裁剪的任务记录
 *   - 裁剪发生时打印 info 日志；若全部任务都在运行导致无法裁剪则打印 warn
 *
 * @param tasks 当前任务列表（不会被就地修改）
 * @param formatters 日志文案定制
 * @returns 裁剪后的新任务列表；若未超限或无可删除任务则返回 null（调用方应保持原列表不变）
 */
function enforceTaskHistoryLimit(
  tasks: AIProcessingTask[],
  formatters: {
    deleteLog: (count: number) => string;
    warnLog: (totalCount: number, activeCount: number) => string;
  },
): AIProcessingTask[] | null {
  if (tasks.length <= MAX_AI_PROCESS_HISTORY) return null;

  // 按开始时间排序，找出最旧的任务（排除正在进行的任务）
  const sortedTasks = [...tasks]
    .filter((t) => t.status !== 'thinking' && t.status !== 'processing')
    .sort((a, b) => a.startTime - b.startTime);

  // 计算需要删除的数量
  const excessCount = tasks.length - MAX_AI_PROCESS_HISTORY;
  const tasksToDelete = sortedTasks.slice(0, excessCount);

  if (tasksToDelete.length > 0) {
    const idsToDelete = tasksToDelete.map((t) => t.id);
    const remaining = tasks.filter((t) => !idsToDelete.includes(t.id));

    // 从 IndexedDB 中删除（异步，不阻塞）
    void co(function* () {
      try {
        yield deleteThinkingProcessesFromDB(idsToDelete);
        console.log(`[AIProcessingStore] ${formatters.deleteLog(idsToDelete.length)}`);
      } catch (error) {
        console.error('Failed to delete old tasks from IndexedDB:', error);
      }
    });

    return remaining;
  }

  // 如果所有任务都是正在进行的，无法删除，记录警告
  const activeCount = tasks.filter(
    (t) => t.status === 'thinking' || t.status === 'processing',
  ).length;
  if (activeCount >= MAX_AI_PROCESS_HISTORY) {
    console.warn(`[AIProcessingStore] ${formatters.warnLog(tasks.length, activeCount)}`);
  }
  return null;
}

export const useAIProcessingStore = defineStore('aiProcessing', {
  state: () => ({
    activeTasks: [] as AIProcessingTask[],
    isLoaded: false,
    loadingPromise: null as Promise<void> | null,
  }),

  getters: {
    /**
     * 是否有正在进行的任务
     */
    hasActiveTasks(state): boolean {
      return state.activeTasks.some(
        (task) => task.status === 'thinking' || task.status === 'processing',
      );
    },

    /**
     * 正在进行的任务列表（按开始时间倒序，最新的在最前面）
     */
    activeTasksList(state): AIProcessingTask[] {
      return state.activeTasks
        .filter((task) => task.status === 'thinking' || task.status === 'processing')
        .sort((a, b) => b.startTime - a.startTime);
    },

    /**
     * 已复核的任务列表（包括已复核、错误、已取消，按开始时间倒序，最新的在最前面）
     */
    reviewedTasksList(state): AIProcessingTask[] {
      return state.activeTasks
        .filter(
          (task) => task.status === 'end' || task.status === 'error' || task.status === 'cancelled',
        )
        .sort((a, b) => b.startTime - a.startTime);
    },

    /**
     * 所有任务列表（包括进行中和已完成的）
     */
    allTasksList(state): AIProcessingTask[] {
      return [...state.activeTasks].sort((a, b) => b.startTime - a.startTime);
    },

    /**
     * 获取最新的思考过程消息
     */
    latestThinkingMessage(state): string | null {
      const thinkingTasks = state.activeTasks.filter(
        (task) => task.status === 'thinking' || task.status === 'processing',
      );
      if (thinkingTasks.length === 0) return null;
      const latest = thinkingTasks.sort((a, b) => b.startTime - a.startTime)[0];
      if (!latest) return null;

      // 优先使用实际的思考消息
      if (latest.thinkingMessage) {
        // 获取最后一行
        const lines = latest.thinkingMessage.split('\n').filter((line) => line.trim());
        return lines.length > 0 ? lines[lines.length - 1] || null : latest.thinkingMessage;
      }

      return latest.message || `${latest.modelName} 正在思考...`;
    },
  },

  actions: {
    /**
     * 从 IndexedDB 加载思考过程
     */
    async loadThinkingProcesses(): Promise<void> {
      // 如果已经加载完成，直接返回
      if (this.isLoaded) {
        return;
      }

      // 如果正在加载，等待现有的加载 Promise
      if (this.loadingPromise) {
        return this.loadingPromise;
      }

      // 创建新的加载 Promise，立即设置标志以防止并发调用
      this.loadingPromise = (async () => {
        try {
          const tasks = await loadThinkingProcessesFromDB();
          // 将已加载的任务添加到 activeTasks（不包含 abortController）
          this.activeTasks = tasks.map((task) => {
            // 检查是否为异常中断的任务（状态为 thinking 或 processing）
            // 这通常发生在应用刷新、关闭或崩溃后重新加载时
            if (task.status === 'thinking' || task.status === 'processing') {
              const interruptedTask = {
                ...task,
                status: 'error' as const,
                message: '任务被中断（应用重启或刷新）',
                endTime: Date.now(),
              };
              // 删除关联的待办事项（因为任务被中断，视为错误状态）
              try {
                const deletedCount = TodoListService.deleteTodosByTaskId(task.id);
                if (deletedCount > 0) {
                  console.log(
                    `[AIProcessingStore] 中断的任务 ${task.id} 已标记为错误，已删除 ${deletedCount} 个关联待办事项`,
                  );
                }
              } catch (error) {
                console.error('[AIProcessingStore] 删除中断任务关联待办事项失败:', error);
              }
              // 异步更新 DB 中的状态，确保持久化
              void co(function* () {
                try {
                  yield saveThinkingProcessToDB(interruptedTask);
                } catch (error) {
                  console.error('Failed to update interrupted task in IndexedDB:', error);
                }
              });
              return interruptedTask;
            }
            return {
              ...task,
            };
          });

          // 检查任务数量，如果超过最大限制，删除最旧的任务
          const trimmedOnLoad = enforceTaskHistoryLimit(this.activeTasks, {
            deleteLog: (count) =>
              `加载时已删除 ${count} 个最旧的 AI 处理历史记录（超过最大限制 ${MAX_AI_PROCESS_HISTORY}）`,
            warnLog: (total, active) =>
              `警告：加载时有 ${total} 个任务，其中 ${active} 个正在进行中，无法删除以满足最大限制 ${MAX_AI_PROCESS_HISTORY}。任务完成后会自动清理。`,
          });
          if (trimmedOnLoad) {
            this.activeTasks = trimmedOnLoad;
          }

          this.isLoaded = true;
        } catch (error) {
          // 如果加载失败，重置标志以便重试
          this.isLoaded = false;
          throw error;
        } finally {
          // 清除加载 Promise，允许后续重试
          this.loadingPromise = null;
        }
      })();

      return this.loadingPromise;
    },

    /**
     * 获取任务类型的中文标签
     */
    getTaskTypeLabel(type: AIProcessingTask['type']): string {
      return TASK_TYPE_LABELS[type] || type;
    },

    /**
     * 添加新的处理任务
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    async addTask(task: Omit<AIProcessingTask, 'id' | 'startTime'>): Promise<string> {
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newTask: AIProcessingTask = {
        id,
        startTime: Date.now(),
        abortController: new AbortController(),
        ...task,
      };
      this.activeTasks.push(newTask);

      // 检查任务数量，如果超过最大限制，删除最旧的任务
      const trimmedOnAdd = enforceTaskHistoryLimit(this.activeTasks, {
        deleteLog: (count) =>
          `已删除 ${count} 个最旧的 AI 处理历史记录（超过最大限制 ${MAX_AI_PROCESS_HISTORY}）`,
        warnLog: (total, active) =>
          `警告：当前有 ${total} 个任务，其中 ${active} 个正在进行中，无法删除以满足最大限制 ${MAX_AI_PROCESS_HISTORY}。任务完成后会自动清理。`,
      });
      if (trimmedOnAdd) {
        this.activeTasks = trimmedOnAdd;
      }

      // 保存到 IndexedDB（异步，不阻塞任务创建）
      // 如果保存失败，任务仍然可以继续执行
      void co(function* () {
        try {
          yield saveThinkingProcessToDB(newTask);
        } catch (error) {
          console.error('Failed to save task to IndexedDB:', error);
        }
      });
      return id;
    },

    /**
     * 更新任务状态
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    async updateTask(id: string, updates: Partial<AIProcessingTask>): Promise<void> {
      const task = this.activeTasks.find((t) => t.id === id);
      if (task) {
        Object.assign(task, updates);
        // 当任务状态从终态恢复为运行态时，清理 endTime，避免计时器被"卡住"显示旧的结束时间
        if (updates.status && RUNNING_TASK_STATUSES.has(updates.status) && task.endTime !== undefined) {
          delete task.endTime;
        }
        if (
          updates.status === 'end' ||
          updates.status === 'error' ||
          updates.status === 'cancelled'
        ) {
          task.endTime = Date.now();
          // 清理节流信息（flush 尾部 pendingText 避免丢失最后的工具结果标记）
          clearTaskThrottle(id, task);
          // 删除关联的待办事项
          try {
            const deletedCount = TodoListService.deleteTodosByTaskId(id);
            if (deletedCount > 0) {
              console.log(
                `[AIProcessingStore] 任务 ${id} 完成/取消，已删除 ${deletedCount} 个关联待办事项`,
              );
            }
          } catch (error) {
            console.error('[AIProcessingStore] 删除任务关联待办事项失败:', error);
          }
        }
        // 确保响应式更新
        this.activeTasks = [...this.activeTasks];
        // 保存到 IndexedDB（异步，不阻塞任务更新）
        // 如果保存失败，任务仍然可以继续执行
        void co(function* () {
          try {
            yield saveThinkingProcessToDB(task);
          } catch (error) {
            console.error('Failed to update task in IndexedDB:', error);
          }
        });
      }
    },

    /**
     * 停止任务
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    async stopTask(id: string): Promise<void> {
      const task = this.activeTasks.find((t) => t.id === id);
      if (task) {
        // 取消请求（无论任务状态如何，都要取消 abortController）
        if (task.abortController) {
          task.abortController.abort();
        }
        // 如果任务已经完成或已取消，不需要更新状态
        if (task.status === 'end' || task.status === 'cancelled') {
          return;
        }
        // 清理节流信息（flush 尾部 pendingText 避免丢失最后的工具结果标记）
        clearTaskThrottle(id, task);
        // 更新任务状态（确保响应式更新）
        task.status = 'cancelled';
        task.message = '已取消';
        task.endTime = Date.now();
        // 删除关联的待办事项
        try {
          const deletedCount = TodoListService.deleteTodosByTaskId(id);
          if (deletedCount > 0) {
            console.log(
              `[AIProcessingStore] 任务 ${id} 已取消，已删除 ${deletedCount} 个关联待办事项`,
            );
          }
        } catch (error) {
          console.error('[AIProcessingStore] 删除任务关联待办事项失败:', error);
        }
        // 确保响应式更新
        this.activeTasks = [...this.activeTasks];
        // 保存到 IndexedDB（异步，不阻塞）
        void co(function* () {
          try {
            yield saveThinkingProcessToDB(task);
          } catch (error) {
            console.error('Failed to save cancelled task to IndexedDB:', error);
          }
        });
      }
    },

    /**
     * 追加思考消息（用于流式响应）
     * 优化：内存更新走 300ms 节流，持久化走 1s 节流，两者彼此独立。
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    async appendThinkingMessage(id: string, text: string): Promise<void> {
      const task = this.activeTasks.find((t) => t.id === id);
      if (task) {
        // 使用节流更新，减少响应式更新频率
        throttledUpdateThinkingMessage(task, text, (t, accumulatedText) => {
          // 再次检查任务是否仍然存在（可能在节流延迟期间被删除）
          const currentTask = this.activeTasks.find((task) => task.id === t.id);
          if (!currentTask) {
            // 任务已被删除，清理节流信息
            clearTaskThrottle(t.id);
            return;
          }

          if (!currentTask.thinkingMessage) {
            currentTask.thinkingMessage = '';
          }
          currentTask.thinkingMessage += accumulatedText;
          // Pinia 的深层响应式系统会自动追踪 thinkingMessage 属性变化，
          // 无需重新赋值 activeTasks 数组——那样会让所有依赖 activeTasks 引用的
          // computed/watch 在每次节流更新时全部失效，造成严重卡顿。
        });

        // 持久化节流：每秒最多写一次，通过箭头函数捕获 this 以便定时器触发时读取最新状态
        schedulePersistTask(id, () =>
          this.activeTasks.find((t: AIProcessingTask) => t.id === id),
        );
      }
    },

    /**
     * 追加输出内容（用于流式输出）
     * 优化：直接修改属性让 Pinia 响应式自然工作，持久化走 1s 节流避免 IDB 写风暴。
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    async appendOutputContent(id: string, text: string): Promise<void> {
      const task = this.activeTasks.find((t) => t.id === id);
      if (task) {
        if (!task.outputContent) {
          task.outputContent = '';
        }
        task.outputContent += text;
        // 持久化节流：每秒最多写一次，读取最新状态
        schedulePersistTask(id, () =>
          this.activeTasks.find((t: AIProcessingTask) => t.id === id),
        );
      }
    },

    /**
     * 移除任务（从内存和 IndexedDB 中删除）
     */
    async removeTask(id: string): Promise<void> {
      const index = this.activeTasks.findIndex((t) => t.id === id);
      if (index > -1) {
        this.activeTasks.splice(index, 1);
        // 清理节流信息，避免内存泄漏
        clearTaskThrottle(id);
        await deleteThinkingProcessFromDB(id);
      }
    },

    /**
     * 清空所有已复核/已结束的任务（从内存和 IndexedDB 中删除）
     */
    async clearReviewedTasks(): Promise<void> {
      const reviewedTaskIds = this.activeTasks
        .filter(
          (task) => task.status === 'end' || task.status === 'error' || task.status === 'cancelled',
        )
        .map((task) => task.id);

      // 清理所有已完成任务的节流信息，避免内存泄漏
      for (const id of reviewedTaskIds) {
        clearTaskThrottle(id);
      }

      // 从内存中移除
      this.activeTasks = this.activeTasks.filter(
        (task) => task.status === 'thinking' || task.status === 'processing',
      );

      // 从 IndexedDB 中删除
      for (const id of reviewedTaskIds) {
        await deleteThinkingProcessFromDB(id);
      }
    },

    /**
     * 清空所有任务（从内存和 IndexedDB 中删除）
     */
    async clearAllTasks(): Promise<void> {
      // 清理所有任务的节流信息，避免内存泄漏
      const allTaskIds = this.activeTasks.map((task) => task.id);
      for (const id of allTaskIds) {
        clearTaskThrottle(id);
      }

      this.activeTasks = [];
      await clearAllThinkingProcessesFromDB();
    },

    /**
     * 停止所有正在进行的任务
     */
    async stopAllActiveTasks(): Promise<void> {
      const activeTasks = this.activeTasksList;
      // 并行停止所有活动任务
      await Promise.all(activeTasks.map((task) => this.stopTask(task.id)));
    },

    /**
     * 停止所有正在进行的助手（聊天）相关任务
     * 仅停止 type 为 'assistant' 的任务，不影响翻译、校对等其他任务
     */
    async stopAllAssistantTasks(): Promise<void> {
      const activeTasks = this.activeTasksList.filter((task) => task.type === 'assistant');
      // 并行停止所有助手任务
      await Promise.all(activeTasks.map((task) => this.stopTask(task.id)));
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAIProcessingStore, import.meta.hot));
}
