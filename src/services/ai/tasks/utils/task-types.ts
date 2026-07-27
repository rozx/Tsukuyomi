import type { AIProcessingTask } from 'src/stores/ai-processing';
import { type AIWorkflowStatus, TASK_TYPE_LABELS } from 'src/constants/ai';

/**
 * 任务类型
 */
export type TaskType = 'translation' | 'polish' | 'proofreading';

/**
 * 状态类型
 */
export type TaskStatus = AIWorkflowStatus;

export const MAX_DESC_LEN = 600;

export function getStatusLabel(status: TaskStatus, taskType: TaskType): string {
  if (status === 'working') {
    return `${TASK_TYPE_LABELS[taskType]}中 (working)`;
  }
  const labels: Record<Exclude<TaskStatus, 'working'>, string> = {
    planning: '规划阶段 (planning)',
    preparing: '准备阶段 (preparing)',
    review: '复核阶段 (review)',
    end: '完成 (end)',
  };
  return labels[status];
}

export function getValidTransitionsForTaskType(
  taskType: TaskType,
): Record<TaskStatus, TaskStatus[]> {
  switch (taskType) {
    // 翻译任务：planning → working → review → end（review 可回退 working）
    // preparing 已并入 planning，仅为旧持久化任务保留一条出路，避免恢复后卡死。
    case 'translation':
      return {
        planning: ['working'],
        preparing: ['working'],
        working: ['review'],
        review: ['end', 'working'],
        end: [],
      };

    // 润色/校对：planning → working → end（禁用 review）
    case 'polish':
    case 'proofreading':
      return {
        planning: ['working'],
        preparing: ['working'],
        working: ['end'],
        review: [],
        end: [],
      };

    default: {
      const _exhaustive: never = taskType;
      throw new Error('Unknown task type: ' + String(_exhaustive));
    }
  }
}

export function getTaskStateWorkflowText(taskType: TaskType): string {
  switch (taskType) {
    case 'translation':
      return 'planning → working → review → end';
    case 'polish':
    case 'proofreading':
      return 'planning → working → end（润色/校对任务禁止使用 review）';

    default: {
      const _exhaustive: never = taskType;
      throw new Error('Unknown task type: ' + String(_exhaustive));
    }
  }
}

/**
 * AI 处理 Store 接口
 */
export interface AIProcessingStore {
  addTask: (task: Omit<AIProcessingTask, 'id' | 'startTime'>) => Promise<string>;
  updateTask: (id: string, updates: Partial<AIProcessingTask>) => Promise<void>;
  appendThinkingMessage: (id: string, text: string) => Promise<void>;
  appendOutputContent: (id: string, text: string) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  activeTasks: AIProcessingTask[];
}

/**
 * 将 Pinia store 包装成服务层消费的 AIProcessingStore 适配器。
 * 所有方法绑定到 store 实例以避免 this 绑定丢失。
 */
export function createAIProcessingStoreAdapter(store: {
  addTask: AIProcessingStore['addTask'];
  updateTask: AIProcessingStore['updateTask'];
  appendThinkingMessage: AIProcessingStore['appendThinkingMessage'];
  appendOutputContent: AIProcessingStore['appendOutputContent'];
  removeTask: AIProcessingStore['removeTask'];
  activeTasks: AIProcessingTask[];
}): AIProcessingStore {
  return {
    addTask: store.addTask.bind(store),
    updateTask: store.updateTask.bind(store),
    appendThinkingMessage: store.appendThinkingMessage.bind(store),
    appendOutputContent: store.appendOutputContent.bind(store),
    removeTask: store.removeTask.bind(store),
    // 用 getter 而非捕获引用：若 Pinia store 整体替换 activeTasks，消费方仍读到最新值
    get activeTasks() {
      return store.activeTasks;
    },
  };
}

/**
 * 是否为翻译相关任务类型（翻译、润色、校对）。
 * 这些任务共享相同的段落处理流程和工具集，因此统称"翻译相关"。
 */
export function isTranslationRelatedTask(taskType: TaskType): boolean {
  return taskType === 'translation' || taskType === 'polish' || taskType === 'proofreading';
}
