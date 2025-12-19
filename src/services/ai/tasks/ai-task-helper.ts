/**
 * AI 任务服务的共享辅助函数
 * 用于消除重复代码，实现 DRY 原则
 */

import type {
  TextGenerationRequest,
  TextGenerationStreamCallback,
  AIToolCall,
  ChatMessage,
  AIServiceConfig,
  AITool,
} from 'src/services/ai/types/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { detectRepeatingCharacters } from 'src/services/ai/degradation-detector';
import { ToolRegistry } from 'src/services/ai/tools/index';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import { getPostToolCallReminder } from './todo-helper';

/**
 * 任务类型
 */
export type TaskType = 'translation' | 'polish' | 'proofreading';

/**
 * 状态类型
 */
export type TaskStatus = 'planning' | 'working' | 'completed' | 'done';

/**
 * 解析后的 JSON 响应结果
 */
export interface ParsedResponse {
  status: TaskStatus;
  content?:
    | {
        paragraphs?: Array<{ id: string; translation: string }>;
        titleTranslation?: string;
      }
    | undefined;
  error?: string | undefined;
}

/**
 * 验证结果
 */
export interface VerificationResult {
  allComplete: boolean;
  missingIds: string[];
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
 * 流式处理回调配置
 */
export interface StreamCallbackConfig {
  taskId: string | undefined;
  aiProcessingStore: AIProcessingStore | undefined;
  originalText: string;
  logLabel: string;
}

/**
 * 解析和验证 JSON 响应（带状态字段）
 * @param responseText AI 返回的文本
 * @returns 解析后的结果，包含状态和内容
 */
export function parseStatusResponse(responseText: string): ParsedResponse {
  try {
    // 尝试提取 JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        status: 'working',
        error: '响应中未找到 JSON 格式',
      };
    }

    const jsonStr = jsonMatch[0];
    const data = JSON.parse(jsonStr);

    // 验证状态字段
    if (!data.status || typeof data.status !== 'string') {
      return {
        status: 'working',
        error: 'JSON 中缺少 status 字段',
      };
    }

    const status = data.status as string;
    const validStatuses: TaskStatus[] = ['planning', 'working', 'completed', 'done'];

    if (!validStatuses.includes(status as TaskStatus)) {
      return {
        status: 'working',
        error: `无效的状态值: ${status}，必须是 planning、working、completed 或 done 之一`,
      };
    }

    // 提取内容（如果有）
    const content: ParsedResponse['content'] = {};
    if (data.paragraphs && Array.isArray(data.paragraphs)) {
      content.paragraphs = data.paragraphs;
    }
    if (data.titleTranslation && typeof data.titleTranslation === 'string') {
      content.titleTranslation = data.titleTranslation;
    }

    return {
      status: status as TaskStatus,
      content: Object.keys(content).length > 0 ? content : undefined,
    };
  } catch (e) {
    return {
      status: 'working',
      error: `JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * 验证段落翻译完整性
 * @param expectedParagraphIds 期望的段落 ID 列表
 * @param receivedTranslations 已收到的翻译（段落 ID 到翻译文本的映射）
 * @returns 验证结果
 */
export function verifyParagraphCompleteness(
  expectedParagraphIds: string[],
  receivedTranslations: Map<string, string>,
): VerificationResult {
  const missingIds: string[] = [];

  for (const paraId of expectedParagraphIds) {
    if (!receivedTranslations.has(paraId)) {
      missingIds.push(paraId);
    }
  }

  return {
    allComplete: missingIds.length === 0,
    missingIds,
  };
}

/**
 * 创建流式处理回调函数
 */
export function createStreamCallback(config: StreamCallbackConfig): TextGenerationStreamCallback {
  const { taskId, aiProcessingStore, originalText, logLabel } = config;
  let accumulatedText = '';

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
    }
    return Promise.resolve();
  };
}

/**
 * 执行工具调用
 */
export async function executeToolCall(
  toolCall: AIToolCall,
  bookId: string,
  handleAction: (action: ActionInfo) => void,
  onToast: ToastCallback | undefined,
  taskId: string | undefined,
  aiProcessingStore: AIProcessingStore | undefined,
): Promise<void> {
  if (aiProcessingStore && taskId) {
    void aiProcessingStore.appendThinkingMessage(
      taskId,
      `\n[调用工具: ${toolCall.function.name}]\n`,
    );
  }

  // 执行工具
  const toolResult = await ToolRegistry.handleToolCall(
    toolCall,
    bookId,
    handleAction,
    onToast,
    taskId,
  );

  if (aiProcessingStore && taskId) {
    void aiProcessingStore.appendThinkingMessage(
      taskId,
      `[工具结果: ${toolResult.content.slice(0, 100)}...]\n`,
    );
  }
}

/**
 * 构建维护提醒（用于每个文本块）- 精简版
 */
export function buildMaintenanceReminder(taskType: TaskType): string {
  const reminders = {
    translation: `\n⚠️ 只返回JSON，状态可独立返回，系统会检查缺失段落`,
    proofreading: `\n⚠️ 只返回JSON，只返回有变化段落，系统会检查`,
    polish: `\n⚠️ 只返回JSON，只返回有变化段落，系统会检查`,
  };
  return reminders[taskType];
}

/**
 * 构建初始用户提示的基础部分 - 精简版
 */
export function buildInitialUserPromptBase(taskType: TaskType): string {
  const taskLabels = { translation: '翻译', proofreading: '校对', polish: '润色' };
  const taskLabel = taskLabels[taskType];
  return `开始${taskLabel}。⚠️ 只返回JSON，状态可独立返回：{"status": "planning"}，系统会自动检查缺失段落`;
}

/**
 * 添加章节上下文到初始提示
 */
export function addChapterContext(prompt: string, chapterId: string, taskType: TaskType): string {
  const taskLabels = {
    translation: '翻译',
    proofreading: '校对',
    polish: '润色',
  };
  const taskLabel = taskLabels[taskType];

  return `${prompt}\n\n**当前章节 ID**: \`${chapterId}\`\n你可以使用工具（如 get_chapter_info、get_previous_chapter、get_next_chapter、find_paragraph_by_keywords 等）获取该章节的上下文信息，以确保${taskLabel}的一致性和连贯性。`;
}

/**
 * 添加段落上下文到初始提示
 */
export function addParagraphContext(
  prompt: string,
  paragraphId: string,
  taskType: TaskType,
): string {
  const taskLabels = {
    translation: '翻译',
    proofreading: '校对',
    polish: '润色',
  };
  const taskLabel = taskLabels[taskType];

  const tools =
    taskType === 'proofreading'
      ? 'find_paragraph_by_keywords、get_chapter_info、get_previous_paragraphs、get_next_paragraphs'
      : 'find_paragraph_by_keywords、get_chapter_info';

  return `${prompt}\n\n**当前段落 ID**: ${paragraphId}\n你可以使用工具（如 ${tools} 等）获取该段落的前后上下文，以确保${taskLabel}的一致性和连贯性。`;
}

/**
 * 添加任务规划建议到初始提示 - 精简版
 */
export function addTaskPlanningSuggestions(prompt: string, _taskType: TaskType): string {
  return `${prompt}\n\n可用 \`create_todo\` 规划复杂任务`;
}

/**
 * 构建执行要点/清单（任务特定）- 精简版
 */
export function buildExecutionSection(taskType: TaskType, chapterId?: string): string {
  const chapterNote = chapterId ? `（传chapter_id: ${chapterId}）` : '';

  if (taskType === 'translation') {
    return `\n【执行】planning→获取上下文${chapterNote} | working→1:1翻译 | completed→验证 | done`;
  }

  if (taskType === 'proofreading') {
    return `\n【执行】只返回有变化段落，忽略空段落`;
  }

  if (taskType === 'polish') {
    return `\n【执行】只返回有变化段落${chapterNote}，参考历史翻译`;
  }

  return '';
}

/**
 * 构建输出内容后的后续操作提示 - 精简版
 */
export function buildPostOutputPrompt(_taskType: TaskType, taskId?: string): string {
  const todosReminder = taskId ? getPostToolCallReminder(undefined, taskId) : '';
  return `完成。${todosReminder}如需后续操作请调用工具，否则返回 \`{"status": "done"}\``;
}

/**
 * 处理工具调用循环
 */
export interface ToolCallLoopConfig {
  history: ChatMessage[];
  tools: AITool[];
  generateText: (
    config: AIServiceConfig,
    request: TextGenerationRequest,
    callback: TextGenerationStreamCallback,
  ) => Promise<{
    text: string;
    toolCalls?: AIToolCall[];
    reasoningContent?: string;
  }>;
  aiServiceConfig: AIServiceConfig;
  taskType: TaskType;
  chunkText: string;
  paragraphIds: string[] | undefined;
  bookId: string;
  handleAction: (action: ActionInfo) => void;
  onToast: ToastCallback | undefined;
  taskId: string | undefined;
  aiProcessingStore: AIProcessingStore | undefined;
  logLabel: string;
  maxTurns?: number;
  /**
   * 验证回调：用于服务特定的验证逻辑
   * @param expectedIds 期望的段落 ID 列表
   * @param receivedTranslations 已收到的翻译
   * @returns 验证结果
   */
  verifyCompleteness?: (
    expectedIds: string[],
    receivedTranslations: Map<string, string>,
  ) => VerificationResult;
}

/**
 * 执行工具调用循环（基于状态的流程）
 * 返回最终响应文本和状态信息
 */
export interface ToolCallLoopResult {
  responseText: string | null;
  status: TaskStatus;
  paragraphs: Map<string, string>;
  titleTranslation?: string | undefined;
}

export async function executeToolCallLoop(config: ToolCallLoopConfig): Promise<ToolCallLoopResult> {
  const {
    history,
    tools,
    generateText,
    aiServiceConfig,
    taskType,
    chunkText,
    paragraphIds,
    bookId,
    handleAction,
    onToast,
    taskId,
    aiProcessingStore,
    logLabel,
    maxTurns = Infinity,
    verifyCompleteness,
  } = config;

  let currentTurnCount = 0;
  let currentStatus: TaskStatus = 'planning';
  const accumulatedParagraphs = new Map<string, string>();
  let titleTranslation: string | undefined;
  let finalResponseText: string | null = null;

  // 用于检测状态循环：记录每个状态连续出现的次数
  let consecutivePlanningCount = 0;
  let consecutiveWorkingCount = 0;
  let consecutiveCompletedCount = 0;
  const MAX_CONSECUTIVE_STATUS = 2; // 同一状态最多连续出现 2 次（加速流程）

  const taskTypeLabels = {
    translation: '翻译',
    polish: '润色',
    proofreading: '校对',
  };
  const taskLabel = taskTypeLabels[taskType];

  while (maxTurns === Infinity || currentTurnCount < maxTurns) {
    currentTurnCount++;

    const request: TextGenerationRequest = {
      messages: history,
      ...(tools.length > 0 ? { tools } : {}),
    };

    // 创建流式处理回调
    const streamCallback = createStreamCallback({
      taskId,
      aiProcessingStore,
      originalText: chunkText,
      logLabel,
    });

    // 调用 AI
    const result = await generateText(aiServiceConfig, request, streamCallback);

    // 保存思考内容
    if (aiProcessingStore && taskId && result.reasoningContent) {
      void aiProcessingStore.appendThinkingMessage(taskId, result.reasoningContent);
    }

    // 检查是否有工具调用
    if (result.toolCalls && result.toolCalls.length > 0) {
      // 工具调用在所有状态阶段都允许
      // DeepSeek 要求：如果有 tool_calls，必须包含 reasoning_content 字段（即使为 null）
      history.push({
        role: 'assistant',
        content: result.text || null,
        tool_calls: result.toolCalls,
        reasoning_content: result.reasoningContent || null, // DeepSeek 要求此字段必须存在
      });

      // 执行工具
      for (const toolCall of result.toolCalls) {
        if (aiProcessingStore && taskId) {
          void aiProcessingStore.appendThinkingMessage(
            taskId,
            `\n[调用工具: ${toolCall.function.name}]\n`,
          );
        }

        const toolResult = await ToolRegistry.handleToolCall(
          toolCall,
          bookId,
          handleAction,
          onToast,
          taskId,
        );

        if (aiProcessingStore && taskId) {
          void aiProcessingStore.appendThinkingMessage(
            taskId,
            `[工具结果: ${toolResult.content.slice(0, 100)}...]\n`,
          );
        }

        history.push({
          role: 'tool',
          content: toolResult.content,
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
        });
      }

      // 工具调用是"生产性"活动，重置循环检测计数器
      // 这样可以避免在 AI 合法地使用工具获取信息时触发误报
      consecutivePlanningCount = 0;
      consecutiveWorkingCount = 0;
      consecutiveCompletedCount = 0;

      // 工具调用完成后，直接继续循环，让 AI 基于工具结果自然继续
      continue;
    }

    // 没有工具调用，解析响应
    const responseText = result.text || '';
    finalResponseText = responseText;

    // 检测重复字符
    if (detectRepeatingCharacters(responseText, chunkText, { logLabel })) {
      throw new Error(`AI降级检测：最终响应中检测到重复字符`);
    }

    // 解析状态响应
    const parsed = parseStatusResponse(responseText);

    if (parsed.error) {
      // JSON 解析失败，要求重试
      console.warn(`[${logLabel}] ⚠️ ${parsed.error}`);
      history.push({
        role: 'assistant',
        content: responseText,
      });
      history.push({
        role: 'user',
        content: `响应格式错误：${parsed.error}。⚠️ 只返回JSON，状态可独立返回：\`{"status": "planning"}\`，无需包含paragraphs。系统会自动检查缺失段落。`,
      });
      continue;
    }

    // 更新状态
    currentStatus = parsed.status;

    // 提取内容
    if (parsed.content) {
      if (parsed.content.paragraphs) {
        for (const para of parsed.content.paragraphs) {
          // 只处理有效的段落翻译（有ID且翻译内容不为空）
          if (para.id && para.translation && para.translation.trim().length > 0) {
            accumulatedParagraphs.set(para.id, para.translation);
          }
        }
      }
      if (parsed.content.titleTranslation) {
        titleTranslation = parsed.content.titleTranslation;
      }
    }

    // 将响应添加到历史
    history.push({
      role: 'assistant',
      content: responseText,
    });

    // 根据状态处理
    if (currentStatus === 'planning') {
      // 更新连续状态计数
      consecutivePlanningCount++;
      consecutiveWorkingCount = 0; // 重置其他状态计数
      consecutiveCompletedCount = 0; // 重置其他状态计数

      // 检测循环：如果连续处于 planning 状态超过阈值，强制要求开始工作
      if (consecutivePlanningCount >= MAX_CONSECUTIVE_STATUS) {
        console.warn(
          `[${logLabel}] ⚠️ 检测到 planning 状态循环（连续 ${consecutivePlanningCount} 次），强制要求开始工作`,
        );
        history.push({
          role: 'user',
          content: `⚠️ **立即开始${taskLabel}**！你已经在规划阶段停留过久。**现在必须**将状态设置为 "working" 并**立即输出${taskLabel}结果**。不要再返回 planning 状态，直接开始${taskLabel}工作。返回格式：\`{"status": "working", "paragraphs": [...]}\``,
        });
      } else {
        // 正常的 planning 响应 - 使用更明确的指令
        history.push({
          role: 'user',
          content: `收到。**专注于当前文本块**。如果你已获取必要信息，**现在**将状态设置为 "working" 并开始输出${taskLabel}结果。如果还需要使用工具获取信息，请调用工具后再更新状态。`,
        });
      }
      continue;
    } else if (currentStatus === 'working') {
      // 更新连续状态计数
      consecutiveWorkingCount++;
      consecutivePlanningCount = 0; // 重置其他状态计数
      consecutiveCompletedCount = 0; // 重置其他状态计数

      // 检测循环：如果连续处于 working 状态超过阈值且没有输出段落，强制要求完成
      if (consecutiveWorkingCount >= MAX_CONSECUTIVE_STATUS && accumulatedParagraphs.size === 0) {
        console.warn(
          `[${logLabel}] ⚠️ 检测到 working 状态循环（连续 ${consecutiveWorkingCount} 次且无输出），强制要求输出内容`,
        );
        history.push({
          role: 'user',
          content: `⚠️ **立即输出${taskLabel}结果**！你已经在工作阶段停留过久但没有输出任何内容。**现在必须**输出${taskLabel}结果。返回格式：\`{"status": "working", "paragraphs": [{"id": "段落ID", "translation": "${taskLabel}结果"}]}\``,
        });
      } else {
        // 正常的 working 响应 - 使用更明确的指令
        history.push({
          role: 'user',
          content: `收到。继续${taskLabel}，完成后设为 "completed"。无需检查缺失段落，系统会自动验证。`,
        });
      }
      continue;
    } else if (currentStatus === 'completed') {
      // 更新连续状态计数
      consecutiveCompletedCount++;
      consecutivePlanningCount = 0;
      consecutiveWorkingCount = 0;

      // 完成阶段：验证完整性
      if (paragraphIds && paragraphIds.length > 0) {
        const verification = verifyCompleteness
          ? verifyCompleteness(paragraphIds, accumulatedParagraphs)
          : verifyParagraphCompleteness(paragraphIds, accumulatedParagraphs);

        if (!verification.allComplete && verification.missingIds.length > 0) {
          // 缺少段落，要求继续工作
          const missingIdsList = verification.missingIds.slice(0, 10).join(', ');
          const hasMore = verification.missingIds.length > 10;
          history.push({
            role: 'user',
            content: `检测到以下段落缺少${taskLabel}：${missingIdsList}${hasMore ? ` 等 ${verification.missingIds.length} 个` : ''}。**专注于当前文本块**：你只需要处理当前提供的文本块。请将状态设置为 "working" 并继续完成这些段落的${taskLabel}。`,
          });
          currentStatus = 'working';
          consecutiveCompletedCount = 0; // 重置计数，因为状态回到 working
          continue;
        }
      }

      // 检测循环：如果连续处于 completed 状态超过阈值，强制要求完成
      if (consecutiveCompletedCount >= MAX_CONSECUTIVE_STATUS) {
        console.warn(
          `[${logLabel}] ⚠️ 检测到 completed 状态循环（连续 ${consecutiveCompletedCount} 次），强制要求完成`,
        );
        history.push({
          role: 'user',
          content: `⚠️ 你已经在完成阶段停留过久。如果不需要后续操作，请**立即**返回 \`{"status": "done"}\`。`,
        });
      } else {
        // 所有段落都完整，询问后续操作
        const postOutputPrompt = buildPostOutputPrompt(taskType, taskId);
        history.push({
          role: 'user',
          content: postOutputPrompt,
        });
      }
      continue;
    } else if (currentStatus === 'done') {
      // 完成：退出循环
      break;
    }
  }

  // 检查是否达到最大回合数（仅在设置了有限值时才检查）
  if (currentStatus !== 'done' && maxTurns !== Infinity && currentTurnCount >= maxTurns) {
    throw new Error(
      `AI在${maxTurns}回合内未完成${taskLabel}任务（当前状态: ${currentStatus}）。请重试。`,
    );
  }

  return {
    responseText: finalResponseText,
    status: currentStatus,
    paragraphs: accumulatedParagraphs,
    titleTranslation,
  };
}

/**
 * 检查是否达到最大回合数限制（已废弃，状态检查在 executeToolCallLoop 中处理）
 * 保留此函数以保持向后兼容性
 */
export function checkMaxTurnsReached(
  finalResponseText: string | null,
  maxTurns: number,
  taskType: TaskType,
): asserts finalResponseText is string {
  const taskTypeLabels = {
    translation: '翻译',
    polish: '润色',
    proofreading: '校对',
  };

  if (!finalResponseText || finalResponseText.trim().length === 0) {
    throw new Error(
      `AI在工具调用后未返回${taskTypeLabels[taskType]}结果（已达到最大回合数 ${maxTurns}）。请重试。`,
    );
  }
}

// ============================================================================
// 以下是新增的共享工具函数（用于减少三个服务的代码重复）
// ============================================================================

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
): Promise<{ taskId?: string; abortController?: AbortController }> {
  if (!aiProcessingStore) {
    return {};
  }

  const taskTypeLabels = {
    translation: '翻译',
    polish: '润色',
    proofreading: '校对',
  };

  const taskId = await aiProcessingStore.addTask({
    type: taskType,
    modelName,
    status: 'thinking',
    message: `正在初始化${taskTypeLabels[taskType]}会话...`,
    thinkingMessage: '',
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
 * 获取特殊指令（书籍级别或章节级别）
 * @param bookId 书籍 ID
 * @param chapterId 章节 ID
 * @param taskType 任务类型
 * @returns 特殊指令字符串（如果存在）
 */
export async function getSpecialInstructions(
  bookId: string | undefined,
  chapterId: string | undefined,
  taskType: TaskType,
): Promise<string | undefined> {
  if (!bookId) {
    return undefined;
  }

  try {
    // 动态导入 store 以避免循环依赖
    const booksStore = (await import('src/stores/books')).useBooksStore();
    const book = booksStore.getBookById(bookId);

    if (!book) {
      return undefined;
    }

    // 如果提供了章节ID，获取章节数据以获取章节级别的特殊指令
    let chapter;
    if (chapterId) {
      for (const volume of book.volumes || []) {
        const foundChapter = volume.chapters?.find((c) => c.id === chapterId);
        if (foundChapter) {
          chapter = foundChapter;
          break;
        }
      }
    }

    // 根据任务类型获取相应的特殊指令（章节级别覆盖书籍级别）
    // 根据任务类型获取相应的特殊指令（章节级别覆盖书籍级别）
    switch (taskType) {
      case 'translation':
        return chapter?.translationInstructions || book.translationInstructions;
      case 'polish':
        return chapter?.polishInstructions || book.polishInstructions;
      case 'proofreading':
        return chapter?.proofreadingInstructions || book.proofreadingInstructions;
      default:
        return undefined;
    }
  } catch (e) {
    console.warn(
      `[getSpecialInstructions] ⚠️ 获取书籍数据失败（书籍ID: ${bookId}）`,
      e instanceof Error ? e.message : e,
    );
    return undefined;
  }
}

/**
 * 段落格式化函数类型
 */
export type ParagraphFormatter<T> = (item: T) => string;

/**
 * 文本块结构
 */
export interface TextChunk {
  text: string;
  paragraphIds: string[];
}

/**
 * 构建文本块
 * 将段落列表按大小分割成多个文本块
 * @param content 段落列表
 * @param chunkSize 每个块的最大字符数
 * @param formatParagraph 段落格式化函数
 * @param filterParagraph 段落过滤函数（可选，默认过滤空段落）
 * @returns 文本块数组
 */
export function buildChunks<T extends { id: string; text?: string }>(
  content: T[],
  chunkSize: number,
  formatParagraph: ParagraphFormatter<T>,
  filterParagraph?: (item: T) => boolean,
): TextChunk[] {
  const chunks: TextChunk[] = [];

  // 默认过滤空段落
  const shouldInclude = filterParagraph || ((item: T) => !!item.text?.trim());

  let currentChunkText = '';
  let currentChunkParagraphIds: string[] = [];

  for (const paragraph of content) {
    // 应用过滤条件
    if (!shouldInclude(paragraph)) {
      continue;
    }

    // 格式化段落
    const paragraphText = formatParagraph(paragraph);

    // 如果当前块加上新段落超过限制，且当前块不为空，则先保存当前块
    if (currentChunkText.length + paragraphText.length > chunkSize && currentChunkText.length > 0) {
      chunks.push({
        text: currentChunkText,
        paragraphIds: [...currentChunkParagraphIds],
      });
      currentChunkText = '';
      currentChunkParagraphIds = [];
    }

    currentChunkText += paragraphText;
    currentChunkParagraphIds.push(paragraph.id);
  }

  // 添加最后一个块
  if (currentChunkText.length > 0) {
    chunks.push({
      text: currentChunkText,
      paragraphIds: currentChunkParagraphIds,
    });
  }

  return chunks;
}

/**
 * 检查文本是否只包含符号（不是真正的文本内容）
 * @param text 要检查的文本
 * @returns 如果只包含符号，返回 true
 */
export function isOnlySymbols(text: string): boolean {
  if (!text || text.trim().length === 0) {
    return true;
  }

  // 移除所有空白字符
  const trimmed = text.trim();

  // 检查是否只包含标点符号、数字、特殊符号等
  // 允许的字符：日文假名、汉字、英文字母
  const hasContent =
    /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF\u20000-\u2A6DFa-zA-Z]/.test(trimmed);

  return !hasContent;
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

  const taskTypeLabels = {
    translation: '翻译',
    polish: '润色',
    proofreading: '校对',
  };

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
      message: error instanceof Error ? error.message : `${taskTypeLabels[taskType]}出错`,
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

  const taskTypeLabels = {
    translation: '翻译',
    polish: '润色',
    proofreading: '校对',
  };

  await aiProcessingStore.updateTask(taskId, {
    status: 'completed',
    message: `${taskTypeLabels[taskType]}完成`,
  });
}
