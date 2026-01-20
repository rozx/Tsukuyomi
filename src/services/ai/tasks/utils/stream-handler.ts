import { detectRepeatingCharacters } from 'src/services/ai/degradation-detector';
import {
  getStatusLabel,
  getValidTransitionsForTaskType,
  getTaskStateWorkflowText,
  type TaskStatus,
  type TaskType,
  type AIProcessingStore,
  TASK_TYPE_LABELS,
} from './task-types';
import type { TextGenerationStreamCallback } from 'src/services/ai/types/ai-service';

/**
 * 流式处理回调配置
 */
export interface StreamCallbackConfig {
  taskId: string | undefined;
  aiProcessingStore: AIProcessingStore | undefined;
  originalText: string;
  logLabel: string;
  /**
   * 当前状态（用于验证状态转换）
   */
  currentStatus?: TaskStatus;
  /**
   * 任务类型（用于生成警告消息）
   */
  taskType?: TaskType;
  /**
   * 用于停止流的 AbortController（当检测到无效状态时）
   */
  abortController?: AbortController;
}

/**
 * 创建流式处理回调函数
 */
export function createStreamCallback(config: StreamCallbackConfig): TextGenerationStreamCallback {
  const {
    taskId,
    aiProcessingStore,
    originalText,
    logLabel,
    currentStatus,
    taskType,
    abortController,
  } = config;
  let accumulatedText = '';
  let lastCheckLength = 0; // 上次检查时的文本长度，避免频繁解析

  return (c) => {
    // 处理思考内容（独立于文本内容，可能在无文本时单独返回）
    if (aiProcessingStore && taskId && c.reasoningContent) {
      void aiProcessingStore.appendThinkingMessage(taskId, c.reasoningContent);
    }

    // 处理流式输出
    if (c.text) {
      // 累积文本用于检测重复字符
      accumulatedText += c.text;

      // 追加输出内容到任务
      if (aiProcessingStore && taskId) {
        void aiProcessingStore.appendOutputContent(taskId, c.text);
      }

      // 检测重复字符（AI降级检测），传入原文进行比较
      if (detectRepeatingCharacters(accumulatedText, originalText, { logLabel })) {
        throw new Error(`AI降级检测：检测到重复字符，停止${logLabel.replace('Service', '')}`);
      }

      // 实时检测无效状态（每增加一定长度后检查一次，避免频繁解析）
      if (
        currentStatus &&
        taskType &&
        accumulatedText.length - lastCheckLength > 50 && // 每增加50个字符检查一次
        accumulatedText.length > 20 // 至少要有一定长度才尝试解析
      ) {
        lastCheckLength = accumulatedText.length;

        // 只检测 status/s 字段（不用 JSON.parse），避免"JSON 尚未闭合/包含嵌套 {}"导致延迟或误判
        // 支持简化格式 "s" 和完整格式 "status"
        const statusMatch = accumulatedText.match(/"(?:s|status)"\s*:\s*"([^"]+)"/);
        if (statusMatch && statusMatch[1]) {
          const status = statusMatch[1];
          const validStatuses: TaskStatus[] = ['planning', 'working', 'review', 'end'];

          // 检查状态值是否有效
          if (!validStatuses.includes(status as TaskStatus)) {
            console.warn(`[${logLabel}] ⚠️ 检测到无效状态值: ${status}，立即停止输出`);
            abortController?.abort();
            throw new Error(
              `[警告] 检测到无效状态值: ${status}，必须是 planning、working、review 或 end 之一`,
            );
          }

          // 翻译/润色/校对任务：内容必须只在 working 阶段输出
          // 若模型在 planning/review/end 阶段输出 p/paragraphs/tt/titleTranslation，视为错误状态并中止本轮输出
          if (taskType === 'translation' || taskType === 'polish' || taskType === 'proofreading') {
            // 使用正则检测 JSON 键（key 后面紧跟冒号），避免误判字符串内部的 "p"
            // 支持简化格式 (p, tt) 和完整格式 (paragraphs, titleTranslation)
            const contentKeyRegex = /"(?:p|paragraphs|tt|titleTranslation)"\s*:/;
            const hasContentKey = contentKeyRegex.test(accumulatedText);

            const newStatus = status as TaskStatus;
            const invalidStateForContent =
              newStatus === 'planning' || newStatus === 'review' || newStatus === 'end';
            if (hasContentKey && invalidStateForContent) {
              console.warn(
                `[${logLabel}] ⚠️ 检测到内容与状态不匹配（status=${newStatus} 且包含内容字段），立即停止输出`,
              );
              abortController?.abort();
              throw new Error(
                `状态与内容不匹配：任务只能在 working 阶段输出 p/tt（当前 status=${newStatus}）`,
              );
            }
          }

          // 检查状态转换是否有效
          const validTransitions = getValidTransitionsForTaskType(taskType);

          const newStatus = status as TaskStatus;
          if (currentStatus !== newStatus) {
            const allowedNextStatuses: TaskStatus[] | undefined = validTransitions[currentStatus];
            if (!allowedNextStatuses || !allowedNextStatuses.includes(newStatus)) {
              console.warn(
                `[${logLabel}] ⚠️ 检测到无效的状态转换：${getStatusLabel(currentStatus, taskType)} → ${getStatusLabel(newStatus, taskType)}，立即停止输出`,
              );
              abortController?.abort();
              throw new Error(
                `[警告] **状态转换错误**：你试图从 "${getStatusLabel(currentStatus, taskType)}" 直接转换到 "${getStatusLabel(newStatus, taskType)}"，这是**禁止的**。正确的状态转换顺序：${getTaskStateWorkflowText(taskType)}`,
              );
            }
          }
        }
      }
    }
    return Promise.resolve();
  };
}

/**
 * 创建统一的 AbortController，同时监听多个 signal
 * @param signal 外部传入的取消信号
 * @param taskAbortController 任务的取消控制器
 * @returns 统一的控制器和清理函数
 */
export function createUnifiedAbortController(
  signal?: AbortSignal,
  taskAbortController?: AbortController,
): { controller: AbortController; cleanup: () => void } {
  const internalController = new AbortController();

  const abortHandler = () => {
    internalController.abort();
  };

  // 监听外部 signal
  if (signal) {
    if (signal.aborted) {
      internalController.abort();
    } else {
      signal.addEventListener('abort', abortHandler);
    }
  }

  // 监听任务的 abortController
  if (taskAbortController) {
    if (taskAbortController.signal.aborted) {
      internalController.abort();
    } else {
      taskAbortController.signal.addEventListener('abort', abortHandler);
    }
  }

  // 返回清理函数
  const cleanup = () => {
    if (signal) {
      signal.removeEventListener('abort', abortHandler);
    }
    if (taskAbortController) {
      taskAbortController.signal.removeEventListener('abort', abortHandler);
    }
  };

  return { controller: internalController, cleanup };
}

/**
 * 初始化 AI 任务
 * @param aiProcessingStore AI 处理 Store
 * @param taskType 任务类型
 * @param modelName 模型名称
 * @returns 任务 ID 和取消控制器
 */
export async function initializeTask(
  aiProcessingStore: AIProcessingStore | undefined,
  taskType: TaskType,
  modelName: string,
  context?: {
    bookId?: string;
    chapterId?: string;
    chapterTitle?: string;
  },
): Promise<{ taskId?: string; abortController?: AbortController }> {
  if (!aiProcessingStore) {
    return {};
  }

  const taskId = await aiProcessingStore.addTask({
    type: taskType,
    modelName,
    status: 'thinking',
    message: `正在初始化${TASK_TYPE_LABELS[taskType]}会话...`,
    thinkingMessage: '',
    ...(context?.bookId ? { bookId: context.bookId } : {}),
    ...(context?.chapterId ? { chapterId: context.chapterId } : {}),
    ...(context?.chapterTitle ? { chapterTitle: context.chapterTitle } : {}),
  });

  // 获取任务的 abortController
  const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
  const abortController = task?.abortController;

  // 避免 exactOptionalPropertyTypes 问题：只有当 abortController 存在时才包含它
  if (abortController) {
    return { taskId, abortController };
  }
  return { taskId };
}

/**
 * 处理任务错误
 * @param error 错误对象
 * @param taskId 任务 ID
 * @param aiProcessingStore AI 处理 Store
 * @param taskType 任务类型
 */
export async function handleTaskError(
  error: unknown,
  taskId: string | undefined,
  aiProcessingStore: AIProcessingStore | undefined,
  taskType: TaskType,
): Promise<void> {
  if (!aiProcessingStore || !taskId) {
    return;
  }

  // 检查是否是取消错误
  const isCancelled =
    error instanceof Error && (error.message === '请求已取消' || error.message.includes('aborted'));

  if (isCancelled) {
    await aiProcessingStore.updateTask(taskId, {
      status: 'cancelled',
      message: '已取消',
    });
  } else {
    await aiProcessingStore.updateTask(taskId, {
      status: 'error',
      message: error instanceof Error ? error.message : `${TASK_TYPE_LABELS[taskType]}出错`,
    });
  }
}

/**
 * 完成任务
 * @param taskId 任务 ID
 * @param aiProcessingStore AI 处理 Store
 * @param taskType 任务类型
 */
export async function completeTask(
  taskId: string | undefined,
  aiProcessingStore: AIProcessingStore | undefined,
  taskType: TaskType,
): Promise<void> {
  if (!aiProcessingStore || !taskId) {
    return;
  }

  await aiProcessingStore.updateTask(taskId, {
    status: 'end',
    message: `${TASK_TYPE_LABELS[taskType]}完成`,
  });
}
