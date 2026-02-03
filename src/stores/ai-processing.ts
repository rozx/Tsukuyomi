import { defineStore, acceptHMRUpdate } from 'pinia';
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
    | 'chapter_summary'
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
  startTime: number;
  endTime?: number;
  abortController?: AbortController; // 用于取消请求（不持久化）
}

export type AIProcessingTaskStatus = 'thinking' | 'processing' | 'end' | 'error' | 'cancelled';

type LegacyAIProcessingTaskStatus = AIProcessingTaskStatus | 'completed' | 'review';

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
      const legacyStatus = (t as { status?: unknown }).status as LegacyAIProcessingTaskStatus;
      const newStatus = normalizeAIProcessingTaskStatus(legacyStatus);
      return {
        ...t,
        status: newStatus,
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
    // 创建可序列化的副本，排除 abortController
    const serializableTask: SerializableTask = {
      id: task.id,
      type: task.type,
      modelName: task.modelName,
      status: task.status,
      ...(task.workflowStatus !== undefined && { workflowStatus: task.workflowStatus }),
      ...(task.message !== undefined && { message: task.message }),
      ...(task.thinkingMessage !== undefined && { thinkingMessage: task.thinkingMessage }),
      ...(task.outputContent !== undefined && { outputContent: task.outputContent }),
      ...(task.contextTokens !== undefined && { contextTokens: task.contextTokens }),
      ...(task.contextWindow !== undefined && { contextWindow: task.contextWindow }),
      ...(task.contextPercentage !== undefined && { contextPercentage: task.contextPercentage }),
      ...(task.bookId !== undefined && { bookId: task.bookId }),
      ...(task.chapterId !== undefined && { chapterId: task.chapterId }),
      ...(task.chapterTitle !== undefined && { chapterTitle: task.chapterTitle }),
      startTime: task.startTime,
      ...(task.endTime !== undefined && { endTime: task.endTime }),
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
      const delay = 300 - (now - throttleInfo.lastUpdate);
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
 * 清理任务的节流信息
 */
function clearTaskThrottle(taskId: string): void {
  const throttleInfo = taskThrottleMap.get(taskId);
  if (throttleInfo) {
    if (throttleInfo.timer !== null) {
      clearTimeout(throttleInfo.timer);
    }
    taskThrottleMap.delete(taskId);
  }
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
          if (this.activeTasks.length > MAX_AI_PROCESS_HISTORY) {
            // 按开始时间排序，找出最旧的任务（排除正在进行的任务）
            const sortedTasks = [...this.activeTasks]
              .filter((t) => t.status !== 'thinking' && t.status !== 'processing')
              .sort((a, b) => a.startTime - b.startTime);

            // 计算需要删除的数量
            const excessCount = this.activeTasks.length - MAX_AI_PROCESS_HISTORY;
            const tasksToDelete = sortedTasks.slice(0, excessCount);

            if (tasksToDelete.length > 0) {
              const idsToDelete = tasksToDelete.map((t) => t.id);

              // 从内存中删除
              this.activeTasks = this.activeTasks.filter((t) => !idsToDelete.includes(t.id));

              // 从 IndexedDB 中删除（异步，不阻塞）
              void co(function* () {
                try {
                  yield deleteThinkingProcessesFromDB(idsToDelete);
                  console.log(
                    `[AIProcessingStore] 加载时已删除 ${idsToDelete.length} 个最旧的 AI 处理历史记录（超过最大限制 ${MAX_AI_PROCESS_HISTORY}）`,
                  );
                } catch (error) {
                  console.error('Failed to delete old tasks from IndexedDB:', error);
                }
              });
            } else {
              // 如果所有任务都是正在进行的，无法删除，记录警告
              const activeCount = this.activeTasks.filter(
                (t) => t.status === 'thinking' || t.status === 'processing',
              ).length;
              if (activeCount >= MAX_AI_PROCESS_HISTORY) {
                console.warn(
                  `[AIProcessingStore] 警告：加载时有 ${this.activeTasks.length} 个任务，其中 ${activeCount} 个正在进行中，无法删除以满足最大限制 ${MAX_AI_PROCESS_HISTORY}。任务完成后会自动清理。`,
                );
              }
            }
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
      if (this.activeTasks.length > MAX_AI_PROCESS_HISTORY) {
        // 按开始时间排序，找出最旧的任务（排除正在进行的任务）
        const sortedTasks = [...this.activeTasks]
          .filter((t) => t.status !== 'thinking' && t.status !== 'processing')
          .sort((a, b) => a.startTime - b.startTime);

        // 计算需要删除的数量
        const excessCount = this.activeTasks.length - MAX_AI_PROCESS_HISTORY;
        const tasksToDelete = sortedTasks.slice(0, excessCount);

        if (tasksToDelete.length > 0) {
          const idsToDelete = tasksToDelete.map((t) => t.id);

          // 从内存中删除
          this.activeTasks = this.activeTasks.filter((t) => !idsToDelete.includes(t.id));

          // 从 IndexedDB 中删除（异步，不阻塞）
          void co(function* () {
            try {
              yield deleteThinkingProcessesFromDB(idsToDelete);
              console.log(
                `[AIProcessingStore] 已删除 ${idsToDelete.length} 个最旧的 AI 处理历史记录（超过最大限制 ${MAX_AI_PROCESS_HISTORY}）`,
              );
            } catch (error) {
              console.error('Failed to delete old tasks from IndexedDB:', error);
            }
          });
        } else {
          // 如果所有任务都是正在进行的，无法删除，记录警告
          const activeCount = this.activeTasks.filter(
            (t) => t.status === 'thinking' || t.status === 'processing',
          ).length;
          if (activeCount >= MAX_AI_PROCESS_HISTORY) {
            console.warn(
              `[AIProcessingStore] 警告：当前有 ${this.activeTasks.length} 个任务，其中 ${activeCount} 个正在进行中，无法删除以满足最大限制 ${MAX_AI_PROCESS_HISTORY}。任务完成后会自动清理。`,
            );
          }
        }
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
        if (
          updates.status === 'end' ||
          updates.status === 'error' ||
          updates.status === 'cancelled'
        ) {
          task.endTime = Date.now();
          // 清理节流信息
          clearTaskThrottle(id);
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
        // 清理节流信息
        clearTaskThrottle(id);
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
     * 优化：使用节流机制，每 300ms 最多更新一次，大幅减少响应式更新频率
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
          // 在 Pinia 中，直接修改对象属性会自动触发响应式更新
          // 但由于使用了节流，更新频率大幅降低
          // 为了确保 watch 能检测到变化，需要触发数组引用更新
          // 但为了性能，只在节流更新时触发一次
          this.activeTasks = [...this.activeTasks];
        });

        // 保存到 IndexedDB（异步，不阻塞 UI，使用节流后的最终值）
        // 注意：这里保存的是累积的文本，可能不是最新的，但为了性能考虑这是可以接受的
        // 在生成器函数外部捕获 activeTasks 的引用，避免 ESLint 的 no-this-alias 规则
        const activeTasksRef = this.activeTasks;
        void co(function* () {
          try {
            // 延迟保存，确保节流更新已完成
            yield new Promise((resolve) => setTimeout(resolve, 350));
            // 再次检查任务是否仍然存在
            const currentTask = activeTasksRef.find((t: AIProcessingTask) => t.id === id);
            if (currentTask) {
              yield saveThinkingProcessToDB(currentTask);
            }
          } catch (error) {
            console.error('Failed to save thinking message to IndexedDB:', error);
          }
        });
      }
    },

    /**
     * 追加输出内容（用于流式输出）
     * 优化：直接修改属性，让 Pinia 的响应式系统自然工作
     * 注意：在 Pinia 中，直接修改对象属性会自动触发响应式更新
     * 不需要每次都创建新数组，这样可以减少不必要的数组复制开销
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    async appendOutputContent(id: string, text: string): Promise<void> {
      const task = this.activeTasks.find((t) => t.id === id);
      if (task) {
        if (!task.outputContent) {
          task.outputContent = '';
        }
        task.outputContent += text;
        // 在 Pinia 中，直接修改对象属性会自动触发响应式更新
        // 不需要创建新数组，减少不必要的开销
        // 保存到 IndexedDB（异步，不阻塞 UI）
        void co(function* () {
          try {
            yield saveThinkingProcessToDB(task);
          } catch (error) {
            console.error('Failed to save output content to IndexedDB:', error);
          }
        });
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
