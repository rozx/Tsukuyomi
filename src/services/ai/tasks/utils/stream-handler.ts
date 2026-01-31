import { detectRepeatingCharacters } from 'src/services/ai/degradation-detector';
import {
  getStatusLabel,
  getValidTransitionsForTaskType,
  getTaskStateWorkflowText,
  type TaskStatus,
  type TaskType,
  type AIProcessingStore,
  TASK_TYPE_LABELS,
  VALID_TASK_STATUSES,
} from './task-types';
import type { TextGenerationStreamCallback } from 'src/services/ai/types/ai-service';

// 常量定义
/**
 * 扫描延迟字符数：累积多少新字符后触发一次扫描
 * 权衡：太小会增加扫描频率，太大会延迟检测
 */
const SCAN_DELAY_CHARS = 50;

/**
 * 安全缓冲区：在处理文本末尾保留的字符数，用于处理部分匹配
 * 权衡：太小可能截断部分匹配，太大会增加内存占用
 */
const SAFETY_BUFFER = 100;

/**
 * 重叠区域：与上次扫描的重叠字符数，用于捕获跨边界的匹配
 * 权衡：太小可能遗漏跨边界匹配，太大会增加重复扫描
 */
const OVERLAP = 100;

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

// 匹配状态字段：支持单引号和双引号，大小写不敏感
// 例如: "status": "working", 's': 'Planning', "S": "WORKING"
const STATUS_REGEX = /["'](?:s|status)["']\s*:\s*["']([^"']+)["']/gi;

// 匹配内容字段：支持单引号和双引号，大小写不敏感
// 例如: "p": [...], 'paragraphs': [...], "tt": "标题"
const CONTENT_KEY_REGEX = /["'](?:p|paragraphs|tt|titleTranslation)["']\s*:/gi;

const CONTENT_TASK_TYPES = new Set<TaskType>(['translation', 'polish', 'proofreading']);
const INVALID_CONTENT_STATES = new Set<TaskStatus>(['planning', 'review', 'end']);

const isValidTaskStatus = (s: string): s is TaskStatus => {
  return VALID_TASK_STATUSES.includes(s as TaskStatus);
};

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
 * 扫描事件类型
 */
type StatusEvent = { type: 'status'; index: number; value: string };
type ContentEvent = { type: 'content'; index: number };
type ScanEvent = StatusEvent | ContentEvent;

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
  // 追踪当前生效的状态，初始化为传入的 currentStatus
  let runningStatus = currentStatus;
  // 追踪已处理的文本末尾索引（安全边界，留有余量以处理分块截断）
  let lastScanIndex = 0;
  // 追踪最后一个已处理事件的绝对索引，防止重复处理
  let lastProcessedIndex = -1;

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
      // 如果超过最大限制，进行截断并调整索引
      if (accumulatedText.length > MAX_ACCUMULATED_TEXT) {
        const MIN_KEEP_LENGTH = SAFETY_BUFFER + OVERLAP;
        const excess = accumulatedText.length - MAX_ACCUMULATED_TEXT;
        accumulatedText = accumulatedText.slice(excess);

        // 确保保留足够的长度用于重叠扫描
        const safeLength = Math.max(MIN_KEEP_LENGTH, accumulatedText.length);

        // 重置 lastScanIndex 以确保从安全位置重新扫描
        lastScanIndex = Math.max(0, lastScanIndex - excess);
        lastProcessedIndex = Math.max(-1, lastProcessedIndex - excess);

        // 如果截断后索引可能指向不完整的内容，确保它不保留在不安全的末尾
        if (lastScanIndex > safeLength - SAFETY_BUFFER) {
          lastScanIndex = Math.max(0, safeLength - SAFETY_BUFFER);
        }
      }
      accumulatedText += c.text;

      // 追加输出内容到任务
      if (aiProcessingStore && taskId) {
        aiProcessingStore
          .appendOutputContent(taskId, c.text)
          .catch((err) => console.error(`[${logLabel}] Failed to append output content:`, err));
      }

      // 实时检测无效状态和内容（增量扫描）
      const newContentLength = accumulatedText.length - lastScanIndex;

      // 当积累了一定新内容，或者内容较短时（初期）进行检查
      if (newContentLength > SCAN_DELAY_CHARS || accumulatedText.length < MIN_SCAN_LENGTH) {
        // 性能优化：将降级检测移动到节流块中
        try {
          if (detectRepeatingCharacters(accumulatedText, originalText, { logLabel })) {
            const errMsg = `AI降级检测：检测到重复字符，停止${taskType ? TASK_TYPE_LABELS[taskType] : logLabel.replace('Service', '')}`;
            if (abortController) abortController.abort();
            // 返回 Promise.reject 以便调用者捕获错误
            return Promise.reject(new Error(errMsg));
          }
        } catch (error) {
          console.error(`[${logLabel}] Error in repetition detection:`, {
            error,
            accumulatedTextLength: accumulatedText.length,
            originalTextLength: originalText.length,
          });
          // 确保 reject 的是 Error 对象
          const errorObj = error instanceof Error ? error : new Error(String(error));
          return Promise.reject(errorObj);
        }

        // 计算扫描起始位置：上次处理位置减去重叠区，确保不为负
        const scanStartIndex = Math.max(0, lastScanIndex - OVERLAP);
        const textToScan = accumulatedText.slice(scanStartIndex);

        const statusMatches = [...textToScan.matchAll(STATUS_REGEX)];
        const contentMatches = [...textToScan.matchAll(CONTENT_KEY_REGEX)];

        // 辅助函数：只处理新事件（提取为通用函数以减少重复代码）
        const filterNewEvents = (
          matches: RegExpMatchArray[],
          eventType: 'status' | 'content',
        ): ScanEvent[] => {
          return matches
            .filter((m) => {
              const index = m.index;
              if (index === undefined) {
                console.warn(`[${logLabel}] ⚠️ 正则匹配结果缺少 index 属性`);
                return false;
              }
              // 使用 lastProcessedIndex 确保不漏掉部分匹配后完整的事件，也不重复处理
              return scanStartIndex + index > lastProcessedIndex;
            })
            .map((m) => {
              const baseEvent = {
                type: eventType,
                index: scanStartIndex + m.index!,
              };
              if (eventType === 'status') {
                return { ...baseEvent, value: m[1] ?? '' } as StatusEvent;
              }
              return baseEvent as ContentEvent;
            });
        };

        const events: ScanEvent[] = [
          ...filterNewEvents(statusMatches, 'status'),
          ...filterNewEvents(contentMatches, 'content'),
        ].sort((a, b) => a.index - b.index);

        for (const event of events) {
          if (event.type === 'status') {
            const rawStatus = event.value;
            const normalizedStatus = rawStatus ? rawStatus.toLowerCase() : '';

            // 使用提取的类型守卫
            if (!isValidTaskStatus(normalizedStatus)) {
              console.warn(`[${logLabel}] ⚠️ 检测到无效状态值: ${rawStatus}，立即停止输出`);
              if (abortController) abortController.abort();
              // 返回 Promise.reject 以便调用者捕获错误
              return Promise.reject(
                new Error(
                  `[警告] 检测到无效状态值: ${rawStatus}，必须是 ${VALID_TASK_STATUSES.join('、')} 之一`,
                ),
              );
            }

            const newStatus: TaskStatus = normalizedStatus;

            // 检查状态转换是否有效
            if (taskType && runningStatus !== newStatus) {
              const validTransitions = getValidTransitionsForTaskType(taskType);
              // 如果 runningStatus 为 undefined，允许的第一个状态必须是 planning
              const allowedNextStatuses = runningStatus
                ? validTransitions[runningStatus]
                : ['planning'];

              if (!allowedNextStatuses || !allowedNextStatuses.includes(newStatus)) {
                const currentStatusLabel = runningStatus
                  ? getStatusLabel(runningStatus, taskType)
                  : '无 (初始状态)';
                console.warn(
                  `[${logLabel}] ⚠️ 检测到无效的状态转换：${currentStatusLabel} → ${getStatusLabel(newStatus, taskType)}，立即停止输出`,
                );
                if (abortController) abortController.abort();
                return Promise.reject(
                  new Error(
                    `[警告] **状态转换错误**：你试图从 "${currentStatusLabel}" 直接转换到 "${getStatusLabel(newStatus, taskType)}"，这是**禁止的**。正确的状态转换顺序：${getTaskStateWorkflowText(taskType)}`,
                  ),
                );
              }
            }
            // 更新当前运行状态
            runningStatus = newStatus;
          } else if (event.type === 'content') {
            // 验证内容输出时机的合法性
            if (taskType && CONTENT_TASK_TYPES.has(taskType)) {
              const invalidStateForContent =
                !runningStatus || INVALID_CONTENT_STATES.has(runningStatus);

              if (invalidStateForContent) {
                console.warn(
                  `[${logLabel}] ⚠️ 检测到内容与状态不匹配（status=${runningStatus} 且包含内容字段），立即停止输出`,
                );
                if (abortController) abortController.abort();
                return Promise.reject(
                  new Error(
                    `状态与内容不匹配：任务只能在 working 阶段输出 p/tt（当前 status=${runningStatus}）`,
                  ),
                );
              }
            }
          }
          // 更新最后一个已处理事件的索引
          lastProcessedIndex = event.index;
        }

        // 更新 lastScanIndex
        // 只有当文本长度足够长时（大于 SAFETY_BUFFER），才推进 lastScanIndex
        // 这确保了末尾的 SAFETY_BUFFER 始终会被保留在下一次扫描中
        if (accumulatedText.length > SAFETY_BUFFER) {
          lastScanIndex = accumulatedText.length - SAFETY_BUFFER;
        }
        // 如果文本很短，lastScanIndex 保持为 0，这没问题，我们会重复扫描直到它变长
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
    // 使用 weak reference 并不完全适用这里因为我们需要显式清理
    // 但添加空值检查是很好的实践，防止 taskAbortController 被销毁后清理
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
