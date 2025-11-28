import { defineStore, acceptHMRUpdate } from 'pinia';
import { getDB } from 'src/utils/indexed-db';
import { TASK_TYPE_LABELS } from 'src/constants/ai';

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
  status: 'thinking' | 'processing' | 'completed' | 'error' | 'cancelled';
  message?: string;
  thinkingMessage?: string; // 实际的 AI 思考消息（从流式响应中累积）
  startTime: number;
  endTime?: number;
  abortController?: AbortController; // 用于取消请求（不持久化）
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
    // 按开始时间倒序排列
    return tasks.sort((a, b) => b.startTime - a.startTime);
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
      ...(task.message !== undefined && { message: task.message }),
      ...(task.thinkingMessage !== undefined && { thinkingMessage: task.thinkingMessage }),
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
     * 已完成的任务列表（包括已完成、错误、已取消，按开始时间倒序，最新的在最前面）
     */
    completedTasksList(state): AIProcessingTask[] {
      return state.activeTasks
        .filter(
          (task) =>
            task.status === 'completed' ||
            task.status === 'error' ||
            task.status === 'cancelled',
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
              // 异步更新 DB 中的状态，确保持久化
              void saveThinkingProcessToDB(interruptedTask).catch((error) => {
                console.error('Failed to update interrupted task in IndexedDB:', error);
              });
              return interruptedTask;
            }
            return {
              ...task,
            };
          });
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
      // 保存到 IndexedDB（异步，不阻塞任务创建）
      // 如果保存失败，任务仍然可以继续执行
      void saveThinkingProcessToDB(newTask).catch((error) => {
        console.error('Failed to save task to IndexedDB:', error);
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
          updates.status === 'completed' ||
          updates.status === 'error' ||
          updates.status === 'cancelled'
        ) {
          task.endTime = Date.now();
        }
        // 确保响应式更新
        this.activeTasks = [...this.activeTasks];
        // 保存到 IndexedDB（异步，不阻塞任务更新）
        // 如果保存失败，任务仍然可以继续执行
        void saveThinkingProcessToDB(task).catch((error) => {
          console.error('Failed to update task in IndexedDB:', error);
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
        // 如果任务已经完成，不需要更新状态
        if (task.status === 'completed') {
          return;
        }
        // 更新任务状态（确保响应式更新）
        task.status = 'cancelled';
        task.message = '已取消';
        task.endTime = Date.now();
        // 确保响应式更新
        this.activeTasks = [...this.activeTasks];
        // 保存到 IndexedDB（异步，不阻塞）
        void saveThinkingProcessToDB(task).catch((error) => {
          console.error('Failed to save cancelled task to IndexedDB:', error);
        });
      }
    },

    /**
     * 追加思考消息（用于流式响应）
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    async appendThinkingMessage(id: string, text: string): Promise<void> {
      const task = this.activeTasks.find((t) => t.id === id);
      if (task) {
        if (!task.thinkingMessage) {
          task.thinkingMessage = '';
        }
        task.thinkingMessage += text;
        // 确保响应式更新
        this.activeTasks = [...this.activeTasks];
        // 保存到 IndexedDB（异步，不阻塞 UI）
        void saveThinkingProcessToDB(task);
      }
    },

    /**
     * 移除任务（从内存和 IndexedDB 中删除）
     */
    async removeTask(id: string): Promise<void> {
      const index = this.activeTasks.findIndex((t) => t.id === id);
      if (index > -1) {
        this.activeTasks.splice(index, 1);
        await deleteThinkingProcessFromDB(id);
      }
    },

    /**
     * 清空所有已完成的任务（从内存和 IndexedDB 中删除）
     */
    async clearCompletedTasks(): Promise<void> {
      const completedTaskIds = this.activeTasks
        .filter(
          (task) =>
            task.status === 'completed' ||
            task.status === 'error' ||
            task.status === 'cancelled',
        )
        .map((task) => task.id);

      // 从内存中移除
      this.activeTasks = this.activeTasks.filter(
        (task) => task.status === 'thinking' || task.status === 'processing',
      );

      // 从 IndexedDB 中删除
      for (const id of completedTaskIds) {
        await deleteThinkingProcessFromDB(id);
      }
    },

    /**
     * 清空所有任务（从内存和 IndexedDB 中删除）
     */
    async clearAllTasks(): Promise<void> {
      this.activeTasks = [];
      await clearAllThinkingProcessesFromDB();
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAIProcessingStore, import.meta.hot));
}
