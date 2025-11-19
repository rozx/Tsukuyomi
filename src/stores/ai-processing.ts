import { defineStore, acceptHMRUpdate } from 'pinia';

export interface AIProcessingTask {
  id: string;
  type: 'translation' | 'proofreading' | 'polishing' | 'characterExtraction' | 'terminologyExtraction' | 'config' | 'other';
  modelName: string;
  status: 'thinking' | 'processing' | 'completed' | 'error';
  message?: string;
  startTime: number;
  endTime?: number;
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
      const thinkingTasks = state.activeTasks.filter((task) => task.status === 'thinking');
      if (thinkingTasks.length === 0) return null;
      const latest = thinkingTasks.sort((a, b) => b.startTime - a.startTime)[0];
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
        if (updates.status === 'completed' || updates.status === 'error') {
          task.endTime = Date.now();
        }
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

