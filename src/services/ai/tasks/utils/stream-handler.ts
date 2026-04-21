import { detectRepeatingCharacters } from 'src/services/ai/degradation-detector';
import type { TaskType, AIProcessingStore } from './task-types';
import { TASK_TYPE_LABELS } from 'src/constants/ai';
import type { TextGenerationStreamCallback } from 'src/services/ai/types/ai-service';
import { isCancelledError } from 'src/utils/is-cancelled-error';

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
 * 需要从流式输出中过滤掉的占位符（当模型没有正文只调用工具时，
 * provider 层会把这些文字写入请求/历史以兼容某些 OpenAI 兼容服务，
 * 少数模型会把它们当成文本回显，污染用户可见的输出框）
 */
const OUTPUT_PLACEHOLDERS = ['（调用工具）', '(调用工具)'] as const;

/**
 * 创建带缓冲的占位符过滤器：保证跨 chunk 的占位符也能被整体移除，
 * 同时只在确认不是占位符前缀时才把字符向下游发射，避免闪烁。
 */
function createPlaceholderFilter(placeholders: readonly string[]) {
  let pending = '';
  const maxPlaceholderLen = placeholders.reduce((m, p) => Math.max(m, p.length), 0);

  return (chunk: string): string => {
    pending += chunk;
    let output = '';
    let cursor = 0;

    // 反复寻找完整占位符并跳过
    while (cursor < pending.length) {
      let nextMatchIdx = -1;
      let nextMatchLen = 0;
      for (const placeholder of placeholders) {
        const idx = pending.indexOf(placeholder, cursor);
        if (idx !== -1 && (nextMatchIdx === -1 || idx < nextMatchIdx)) {
          nextMatchIdx = idx;
          nextMatchLen = placeholder.length;
        }
      }
      if (nextMatchIdx === -1) break;
      output += pending.slice(cursor, nextMatchIdx);
      cursor = nextMatchIdx + nextMatchLen;
    }

    // 尾部可能是某个占位符的前缀，必须保留到下一次 chunk 再判断
    const tail = pending.slice(cursor);
    let keepLen = 0;
    const maxCheck = Math.min(maxPlaceholderLen - 1, tail.length);
    for (let len = maxCheck; len > 0; len--) {
      const suffix = tail.slice(tail.length - len);
      if (placeholders.some((p) => p.startsWith(suffix))) {
        keepLen = len;
        break;
      }
    }

    output += tail.slice(0, tail.length - keepLen);
    pending = tail.slice(tail.length - keepLen);
    return output;
  };
}

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
  const filterOutputText = createPlaceholderFilter(OUTPUT_PLACEHOLDERS);

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

      // 追加输出内容到任务（先剥离占位符，避免污染用户可见的输出框）
      const sanitized = filterOutputText(c.text);
      if (sanitized && aiProcessingStore && taskId) {
        aiProcessingStore
          .appendOutputContent(taskId, sanitized)
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
 * 创建简易的任务流式转发回调
 *
 * 把底层 AI 流式 chunk 镜像到 aiProcessingStore 的 task 上：
 * - 首个 chunk 到达时把 task 从 thinking 切到 processing 并更新 message
 * - reasoningContent 追加到思考消息
 * - text 追加到输出内容
 * - 最后委派给调用方传入的 onChunk
 *
 * 适用于“无降级检测 / 无占位符过滤”的简单场景（如术语翻译、单段润色/校对）。
 * 需要降级检测请改用 `createStreamCallback`。
 */
export interface TaskChunkForwarderOptions {
  aiProcessingStore: AIProcessingStore | undefined;
  taskId: string | undefined;
  finalSignal: AbortSignal;
  /**
   * 首个 chunk 到达时写入 task 的提示文案
   */
  processingMessage: string;
  /**
   * signal 已 aborted 时抛出的错误消息（默认 '请求已取消'）
   */
  abortMessage?: string;
  /**
   * 调用方的原始流式回调
   */
  onChunk?: TextGenerationStreamCallback;
}

export function createTaskChunkForwarder(
  options: TaskChunkForwarderOptions,
): TextGenerationStreamCallback {
  const {
    aiProcessingStore,
    taskId,
    finalSignal,
    processingMessage,
    abortMessage = '请求已取消',
    onChunk,
  } = options;

  let firstChunkReceived = false;
  return async (chunk) => {
    if (finalSignal?.aborted) {
      throw new Error(abortMessage);
    }

    if (aiProcessingStore && taskId) {
      if (!firstChunkReceived) {
        void aiProcessingStore.updateTask(taskId, {
          status: 'processing',
          message: processingMessage,
        });
        firstChunkReceived = true;
      }

      if (chunk.reasoningContent) {
        void aiProcessingStore.appendThinkingMessage(taskId, chunk.reasoningContent);
      }

      if (chunk.text) {
        void aiProcessingStore.appendOutputContent(taskId, chunk.text);
      }
    }

    if (onChunk) {
      await onChunk(chunk);
    }
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

const isTaskCancelled = isCancelledError;

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
