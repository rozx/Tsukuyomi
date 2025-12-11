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
 * 构建工具调用后的继续提示
 */
export function buildContinuePrompt(
  taskType: TaskType,
  paragraphIds: string[] | undefined,
  chunkText: string,
  includePreview?: boolean,
  taskId?: string,
): string {
  const taskTypeLabels = {
    translation: '翻译',
    polish: '润色',
    proofreading: '校对',
  };

  const taskLabel = taskTypeLabels[taskType];
  const paragraphIdList = paragraphIds
    ? paragraphIds.slice(0, 10).join(', ') + (paragraphIds.length > 10 ? '...' : '')
    : '';

  const todosReminder = taskId ? getPostToolCallReminder(undefined, taskId) : '';

  let prompt = `工具调用已完成。请继续完成当前文本块的${taskLabel}任务。

**⚠️ 重要提醒**：
- 你正在${taskLabel}以下段落（不要重新开始，继续之前的${taskLabel}任务）：
  段落ID: ${paragraphIdList || '见下方内容'}`;

  if (includePreview) {
    const preview = chunkText.split('\n').slice(0, 3).join('\n');
    const hasMore = chunkText.split('\n').length > 3;
    prompt += `\n  内容预览: ${preview}${hasMore ? '\n...' : ''}`;
  }

  const taskSpecificInstructions = {
    translation: `- 必须返回包含翻译结果的JSON格式响应
- 不要跳过翻译，必须提供完整的翻译结果
- 确保 paragraphs 数组中包含所有输入段落的 ID 和对应翻译`,
    polish: `- 必须返回包含润色结果的JSON格式响应
- 不要跳过润色，必须提供完整的润色结果
- 只返回有变化的段落，没有变化的段落不要包含在结果中`,
    proofreading: `- 必须返回包含校对结果的JSON格式响应
- 不要跳过校对，必须提供完整的校对结果
- 只返回有变化的段落，没有变化的段落不要包含在结果中`,
  };

  prompt += `\n${taskSpecificInstructions[taskType]}
- 工具调用只是为了获取参考信息，现在请直接返回${taskLabel}结果
- **待办事项管理**：
  - 如果需要规划${taskLabel}步骤，可以使用 create_todo 创建待办事项
  - 如果已经完成了某个待办事项的任务，使用 mark_todo_done 工具将其标记为完成
  - 只有当你真正完成了待办事项的任务时才标记为完成，不要过早标记${todosReminder}`;

  return prompt;
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
  includePreview?: boolean;
}

/**
 * 执行工具调用循环
 * 返回最终响应文本，如果没有工具调用则返回 null
 */
export async function executeToolCallLoop(config: ToolCallLoopConfig): Promise<string | null> {
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
    maxTurns = 10,
    includePreview = false,
  } = config;

  let currentTurnCount = 0;
  let finalResponseText: string | null = null;

  while (currentTurnCount < maxTurns) {
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

    // 检查是否有工具调用
    if (result.toolCalls && result.toolCalls.length > 0) {
      // 将助手的回复（包含工具调用）添加到历史
      history.push({
        role: 'assistant',
        content: result.text || null,
        tool_calls: result.toolCalls,
      });

      // 执行工具
      for (const toolCall of result.toolCalls) {
        // 执行工具并记录结果
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
            `\n[调用工具: ${toolCall.function.name}]\n`,
          );
          void aiProcessingStore.appendThinkingMessage(
            taskId,
            `[工具结果: ${toolResult.content.slice(0, 100)}...]\n`,
          );
        }

        // 添加工具结果到历史
        history.push({
          role: 'tool',
          content: toolResult.content,
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
        });
      }

      // 构建并添加继续提示
      const continuePrompt = buildContinuePrompt(
        taskType,
        paragraphIds,
        chunkText,
        includePreview,
        taskId,
      );
      history.push({
        role: 'user',
        content: continuePrompt,
      });

      // 继续循环，将工具结果和提示发送给 AI
    } else {
      // 没有工具调用，这是最终回复
      finalResponseText = result.text;

      // 保存思考内容到思考过程（从最终结果）
      if (aiProcessingStore && taskId && result.reasoningContent) {
        void aiProcessingStore.appendThinkingMessage(taskId, result.reasoningContent);
      }

      // 再次检测最终响应中的重复字符，传入原文进行比较
      if (
        finalResponseText &&
        detectRepeatingCharacters(finalResponseText, chunkText, { logLabel })
      ) {
        throw new Error(`AI降级检测：最终响应中检测到重复字符`);
      }

      if (finalResponseText) {
        history.push({ role: 'assistant', content: finalResponseText });
      }
      break;
    }
  }

  return finalResponseText;
}

/**
 * 检查是否达到最大回合数限制
 * 使用类型断言函数，确保 TypeScript 知道如果函数不抛出，则 finalResponseText 不是 null
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
