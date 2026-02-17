import type { AIProcessingTask } from 'src/stores/ai-processing';
import { type AIWorkflowStatus } from 'src/constants/ai';

/**
 * 任务类型
 */
export type TaskType = 'translation' | 'polish' | 'proofreading' | 'chapter_summary';

/**
 * 状态类型
 */
export type TaskStatus = AIWorkflowStatus;

export const VALID_TASK_STATUSES: TaskStatus[] = [
  'planning',
  'preparing',
  'working',
  'review',
  'end',
];

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
    // 翻译任务：planning → preparing → working → review → end（review 可回退 working）
    case 'translation':
      return {
        planning: ['preparing'],
        preparing: ['working'],
        working: ['review'],
        review: ['end', 'working'],
        end: [],
      };

    // 润色/校对：planning → preparing → working → end（禁用 review）
    case 'polish':
    case 'proofreading':
      return {
        planning: ['preparing'],
        preparing: ['working'],
        working: ['end'],
        review: [],
        end: [],
      };

    // 章节摘要：保持既有流程 planning → working → end
    case 'chapter_summary':
      return {
        planning: ['working'],
        preparing: [],
        working: ['end'],
        review: [],
        end: [],
      };
  }
}

export function getTaskStateWorkflowText(taskType: TaskType): string {
  switch (taskType) {
    case 'translation':
      return 'planning → preparing → working → review → end';
    case 'polish':
    case 'proofreading':
      return 'planning → preparing → working → end（润色/校对任务禁止使用 review）';
    case 'chapter_summary':
      return 'planning → working → end（章节摘要任务不使用 preparing/review）';
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
