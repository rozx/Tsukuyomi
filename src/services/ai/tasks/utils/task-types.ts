import type { AIProcessingTask } from 'src/stores/ai-processing';

/**
 * 任务类型
 */
export type TaskType = 'translation' | 'polish' | 'proofreading' | 'chapter_summary';

/**
 * 状态类型
 */
export type TaskStatus = 'planning' | 'working' | 'review' | 'end';

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  translation: '翻译',
  polish: '润色',
  proofreading: '校对',
  chapter_summary: '章节摘要',
};

export const MAX_DESC_LEN = 600;

export function getStatusLabel(status: TaskStatus, taskType: TaskType): string {
  if (status === 'working') {
    return `${TASK_TYPE_LABELS[taskType]}中 (working)`;
  }
  const labels: Record<Exclude<TaskStatus, 'working'>, string> = {
    planning: '规划阶段 (planning)',
    review: '复核阶段 (review)',
    end: '完成 (end)',
  };
  return labels[status];
}

export function getValidTransitionsForTaskType(
  taskType: TaskType,
): Record<TaskStatus, TaskStatus[]> {
  // 翻译任务：严格四阶段
  if (taskType === 'translation') {
    return {
      planning: ['working'],
      working: ['review'],
      review: ['end', 'working'],
      end: [],
    };
  }

  // 润色/校对/章节摘要：跳过并禁用 review，固定为 planning → working → end
  return {
    planning: ['working'],
    working: ['end'],
    // 理论上不会进入 review（已禁用）。保底：若发生，允许直接结束，避免卡死。
    review: ['end'],
    end: [],
  };
}

export function getTaskStateWorkflowText(taskType: TaskType): string {
  return taskType === 'translation'
    ? 'planning → working → review → end'
    : 'planning → working → end（润色/校对/摘要任务禁止使用 review）';
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
