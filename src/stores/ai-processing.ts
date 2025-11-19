import { defineStore, acceptHMRUpdate } from 'pinia';

export interface AIProcessingTask {
  id: string;
  type:
    | 'translation'
    | 'proofreading'
    | 'polishing'
    | 'characterExtraction'
    | 'terminologyExtraction'
    | 'termsTranslation'
    | 'config'
    | 'other';
  modelName: string;
  status: 'thinking' | 'processing' | 'completed' | 'error' | 'cancelled';
  message?: string;
  thinkingMessage?: string; // 实际的 AI 思考消息（从流式响应中累积）
  startTime: number;
  endTime?: number;
  abortController?: AbortController; // 用于取消请求
}

export const useAIProcessingStore = defineStore('aiProcessing', {
  state: () => ({
    activeTasks: [] as AIProcessingTask[],
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
     * 正在进行的任务列表
     */
    activeTasksList(state): AIProcessingTask[] {
      return state.activeTasks.filter(
        (task) => task.status === 'thinking' || task.status === 'processing',
      );
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
     * 添加新的处理任务
     */
    addTask(task: Omit<AIProcessingTask, 'id' | 'startTime'>): string {
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newTask: AIProcessingTask = {
        id,
        startTime: Date.now(),
        abortController: new AbortController(),
        ...task,
      };
      this.activeTasks.push(newTask);
      return id;
    },

    /**
     * 更新任务状态
     */
    updateTask(id: string, updates: Partial<AIProcessingTask>): void {
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
      }
    },

    /**
     * 停止任务
     */
    stopTask(id: string): void {
      const task = this.activeTasks.find((t) => t.id === id);
      if (task) {
        // 取消请求
        if (task.abortController) {
          task.abortController.abort();
        }
        // 更新任务状态
        this.updateTask(id, {
          status: 'cancelled',
          message: '已取消',
        });
      }
    },

    /**
     * 追加思考消息（用于流式响应）
     */
    appendThinkingMessage(id: string, text: string): void {
      const task = this.activeTasks.find((t) => t.id === id);
      if (task) {
        if (!task.thinkingMessage) {
          task.thinkingMessage = '';
        }
        task.thinkingMessage += text;
        // 确保响应式更新
        this.activeTasks = [...this.activeTasks];
      }
    },

    /**
     * 移除任务
     */
    removeTask(id: string): void {
      const index = this.activeTasks.findIndex((t) => t.id === id);
      if (index > -1) {
        this.activeTasks.splice(index, 1);
      }
    },

    /**
     * 清空所有已完成的任务
     */
    clearCompletedTasks(): void {
      this.activeTasks = this.activeTasks.filter(
        (task) => task.status === 'thinking' || task.status === 'processing',
      );
    },

    /**
     * 清空所有任务
     */
    clearAllTasks(): void {
      this.activeTasks = [];
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAIProcessingStore, import.meta.hot));
}
