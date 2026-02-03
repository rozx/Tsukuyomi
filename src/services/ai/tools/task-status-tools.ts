import type { ToolDefinition, ToolContext } from './types';
import type {
  TaskType,
  TaskStatus,
  AIProcessingStore,
} from 'src/services/ai/tasks/utils/task-types';

const VALID_STATUSES: TaskStatus[] = ['planning', 'working', 'review', 'end'];

interface StateTransitionRules {
  [key: string]: TaskStatus[];
}

const TRANSITION_RULES: Record<TaskType, StateTransitionRules> = {
  translation: {
    planning: ['working'],
    working: ['review'],
    review: ['working', 'end'],
    end: [],
  },
  polish: {
    planning: ['working'],
    working: ['end'],
    end: [],
  },
  proofreading: {
    planning: ['working'],
    working: ['end'],
    end: [],
  },
  chapter_summary: {
    planning: ['working'],
    working: ['end'],
    end: [],
  },
};

/**
 * 验证状态值是否有效
 */
function isValidStatus(status: string): status is TaskStatus {
  return VALID_STATUSES.includes(status as TaskStatus);
}

/**
 * 验证状态转换是否有效
 */
function isValidTransition(
  taskType: TaskType,
  currentStatus: TaskStatus | undefined,
  newStatus: TaskStatus,
): { valid: boolean; error?: string } {
  // 如果是首次状态更新，必须是 planning
  if (!currentStatus) {
    if (newStatus !== 'planning') {
      return {
        valid: false,
        error: '初始状态必须是 planning',
      };
    }
    return { valid: true };
  }

  const rules = TRANSITION_RULES[taskType];
  if (!rules) {
    return {
      valid: false,
      error: `未知的任务类型: ${taskType}`,
    };
  }

  const allowedTransitions = rules[currentStatus];
  if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
    return {
      valid: false,
      error: `无效的状态转换: ${currentStatus} → ${newStatus}`,
    };
  }

  return { valid: true };
}

/**
 * 获取任务的当前状态
 */
function getTaskCurrentStatus(
  aiProcessingStore: AIProcessingStore | undefined,
  taskId: string,
): TaskStatus | undefined {
  if (!aiProcessingStore) {
    return undefined;
  }

  const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
  return task?.workflowStatus as TaskStatus | undefined;
}

/**
 * 更新任务状态
 */
async function updateTaskStatus(
  aiProcessingStore: AIProcessingStore | undefined,
  taskId: string,
  newStatus: TaskStatus,
): Promise<void> {
  if (!aiProcessingStore) {
    throw new Error('AI 处理 Store 未初始化');
  }

  await aiProcessingStore.updateTask(taskId, {
    workflowStatus: newStatus,
    ...(newStatus === 'end' ? { status: 'end' } : {}),
  });
}

export const taskStatusTools: ToolDefinition[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'update_task_status',
        description:
          '更新当前 AI 任务的状态。使用此工具来报告任务进展：planning(规划中) → working(执行中) → review(复核中) → end(完成)。注意：翻译任务支持 review → working 返回修改，润色/校对任务不支持 review 状态。',
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['planning', 'working', 'review', 'end'],
              description:
                '新的任务状态。planning: 正在规划；working: 正在执行翻译/润色/校对；review: 正在复核（仅翻译任务可用）；end: 任务完成',
            },
            reason: {
              type: 'string',
              description: '状态变更的原因（可选）',
            },
          },
          required: ['status'],
        },
      },
    },
    handler: async (args, context: ToolContext) => {
      const { taskId, onAction } = context;
      const { status, reason } = args as { status: string; reason?: string };

      // 验证状态值
      if (!isValidStatus(status)) {
        return JSON.stringify({
          success: false,
          error: `无效的状态值: "${status}"。有效的状态值为：${VALID_STATUSES.join('、')}`,
        });
      }

      // 获取 AI 处理 Store（从 context 的 taskId 推断）
      // 注意：这里需要通过某种方式获取 store 实例
      // 由于 store 是通过 Pinia 创建的，我们需要在服务层注入
      // 这里使用一个变通方案：通过 context 传递 store 实例
      const aiProcessingStore = context.aiProcessingStore as AIProcessingStore | undefined;

      if (!taskId) {
        return JSON.stringify({
          success: false,
          error: '未提供任务 ID',
        });
      }

      if (!aiProcessingStore) {
        return JSON.stringify({
          success: false,
          error: 'AI 处理 Store 未初始化',
        });
      }

      // 获取当前任务信息以确定任务类型
      const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
      if (!task) {
        return JSON.stringify({
          success: false,
          error: `任务不存在: ${taskId}`,
        });
      }

      const taskType = task.type as TaskType;

      // 验证状态转换
      const currentStatus = getTaskCurrentStatus(aiProcessingStore, taskId);
      const validation = isValidTransition(taskType, currentStatus, status);

      if (!validation.valid) {
        return JSON.stringify({
          success: false,
          error: validation.error,
        });
      }

      try {
        // 执行状态更新
        await updateTaskStatus(aiProcessingStore, taskId, status);

        // 报告操作
        if (onAction) {
          onAction({
            type: 'update',
            entity: 'todo',
            data: {
              id: taskId,
              name: `任务状态更新: ${currentStatus || '初始'} → ${status}`,
            },
          });
        }

        return JSON.stringify({
          success: true,
          message: `任务状态已更新: ${currentStatus || '初始'} → ${status}`,
          task_id: taskId,
          new_status: status,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : '未知错误';
        return JSON.stringify({
          success: false,
          error: `状态更新失败: ${errorMsg}`,
        });
      }
    },
  },
];
