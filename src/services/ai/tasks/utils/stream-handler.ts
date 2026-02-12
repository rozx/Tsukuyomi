import { detectRepeatingCharacters } from 'src/services/ai/degradation-detector';
import { type TaskType, type AIProcessingStore, TASK_TYPE_LABELS } from './task-types';
import type { TextGenerationStreamCallback } from 'src/services/ai/types/ai-service';

// 常量定义
/**
 * 扫描延迟字符数：累积多少新字符后触发一次扫描
 * 权衡：太小会增加扫描频率，太大会延迟检测
 */
const SCAN_DELAY_CHARS = 50;

/**
 * 最小扫描长度：开始扫描的最小总文本长度
 * 权衡：太小可能产生误报，太大会延迟检测
 */
const MIN_SCAN_LENGTH = 200;

/**
 * 最大累积文本：防止内存泄漏的最大缓冲区大小（50KB）
 * 权衡：太小可能影响检测准确性，太大会增加内存占用
 */
const MAX_ACCUMULATED_TEXT = 50000;

/**
 * 流式处理回调配置
 */
export interface StreamCallbackConfig {
  taskId: string | undefined;
  aiProcessingStore: AIProcessingStore | undefined;
  originalText: string;
  logLabel: string;
  /**
   * 任务类型（用于生成警告消息）
   */
  taskType?: TaskType;
  /**
   * 用于停止流的 AbortController（当检测到降级时）
   */
  abortController?: AbortController;
}

/**
 * 创建流式处理回调函数
 * 简化版本：仅处理思考内容、输出内容和降级检测
 * 详见 OpenSpec 变更说明：openspec/changes/agent-tools-instead-of-json/design.md
 */
export function createStreamCallback(config: StreamCallbackConfig): TextGenerationStreamCallback {
  const { taskId, aiProcessingStore, originalText, logLabel, taskType, abortController } = config;
  let accumulatedText = '';

  return (c) => {
    // 处理思考内容（独立于文本内容，可能在无文本时单独返回）
    if (aiProcessingStore && taskId && c.reasoningContent) {
      aiProcessingStore
        .appendThinkingMessage(taskId, c.reasoningContent)
        .catch((err) => console.error(`[${logLabel}] Failed to append thinking message:`, err));
    }

    // 处理流式输出
    if (c.text) {
      // 累积文本用于检测重复字符
      // 如果超过最大限制，进行截断
      if (accumulatedText.length > MAX_ACCUMULATED_TEXT) {
        const excess = accumulatedText.length - MAX_ACCUMULATED_TEXT;
        accumulatedText = accumulatedText.slice(excess);
      }
      accumulatedText += c.text;

      // 追加输出内容到任务
      if (aiProcessingStore && taskId) {
        aiProcessingStore
          .appendOutputContent(taskId, c.text)
          .catch((err) => console.error(`[${logLabel}] Failed to append output content:`, err));
      }

      // 实时检测降级（重复字符）
      if (
        accumulatedText.length > MIN_SCAN_LENGTH &&
        accumulatedText.length % SCAN_DELAY_CHARS < c.text.length
      ) {
        try {
          if (detectRepeatingCharacters(accumulatedText, originalText, { logLabel })) {
            const errMsg = `AI降级检测：检测到重复字符，停止${
              taskType ? TASK_TYPE_LABELS[taskType] : logLabel.replace('Service', '')
            }`;
            if (abortController) abortController.abort();
            return Promise.reject(new Error(errMsg));
          }
        } catch (error) {
          console.error(`[${logLabel}] Error in repetition detection:`, {
            error,
            accumulatedTextLength: accumulatedText.length,
            originalTextLength: originalText.length,
          });
          const errorObj = error instanceof Error ? error : new Error(String(error));
          return Promise.reject(errorObj);
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
      try {
        signal.removeEventListener('abort', abortHandler);
      } catch (e) {
        console.warn('[createUnifiedAbortController] Failed to remove signal listener:', e);
      }
    }
    if (taskAbortController?.signal) {
      try {
        taskAbortController.signal.removeEventListener('abort', abortHandler);
      } catch (e) {
        console.warn('[createUnifiedAbortController] Failed to remove task signal listener:', e);
      }
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
    contextTokens?: number;
    contextWindow?: number;
    contextPercentage?: number;
  },
): Promise<{ taskId: string | undefined; abortController: AbortController | undefined }> {
  if (!aiProcessingStore) {
    return { taskId: undefined, abortController: undefined };
  }

  try {
    const taskId = await aiProcessingStore.addTask({
      type: taskType,
      modelName,
      status: 'thinking',
      message: `正在初始化${TASK_TYPE_LABELS[taskType]}会话...`,
      thinkingMessage: '',
      workflowStatus: 'planning',
      ...(context?.bookId ? { bookId: context.bookId } : {}),
      ...(context?.chapterId ? { chapterId: context.chapterId } : {}),
      ...(context?.chapterTitle ? { chapterTitle: context.chapterTitle } : {}),
      ...(context?.contextTokens !== undefined ? { contextTokens: context.contextTokens } : {}),
      ...(context?.contextWindow !== undefined ? { maxInputTokens: context.contextWindow } : {}),
      ...(context?.contextPercentage !== undefined
        ? { contextPercentage: context.contextPercentage }
        : {}),
    });

    // 获取任务的 abortController
    const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
    const abortController = task?.abortController;

    return { taskId, abortController };
  } catch (error) {
    console.error('Failed to initialize task:', error);
    return { taskId: undefined, abortController: undefined };
  }
}

const isTaskCancelled = (error: unknown): boolean => {
  if (error instanceof Error) {
    return (
      error.message === '请求已取消' ||
      error.message.includes('aborted') ||
      error.name === 'AbortError' ||
      error.name === 'CanceledError'
    );
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return (error as { message: unknown }).message === 'canceled';
  }
  return false;
};

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
  const isCancelled = isTaskCancelled(error);

  try {
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
  } catch (storeError) {
    console.error('Failed to update task status in store:', storeError);
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

  try {
    await aiProcessingStore.updateTask(taskId, {
      status: 'end',
      workflowStatus: 'end',
      message: `${TASK_TYPE_LABELS[taskType]}完成`,
    });
  } catch (error) {
    console.error('Failed to complete task in store:', error);
  }
}
