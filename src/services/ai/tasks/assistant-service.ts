import type { AIModel } from 'src/services/ai/types/ai-model';
import type {
  AIServiceConfig,
  TextGenerationRequest,
  TextGenerationStreamCallback,
  TextGenerationChunk,
  ChatMessage,
  AITool,
  AIToolCall,
} from 'src/services/ai/types/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { AIServiceFactory } from '../index';
import { ToolRegistry, type ActionInfo } from '../tools';
import type { ToastCallback } from '../tools/toast-helper';
import { useContextStore } from 'src/stores/context';
import { MemoryService } from 'src/services/memory-service';
import { getTodosSystemPrompt } from './utils/todo-helper';
import { UNLIMITED_TOKENS } from 'src/constants/ai';
import {
  DEFAULT_TOKEN_ESTIMATION_MULTIPLIER,
  estimateMessagesTokenCount,
  estimateToolSchemaTokens,
} from 'src/utils/ai-token-utils';
import {
  getAssistantSystemPrompt,
  getSessionSummaryPrompt,
  SUMMARY_SYSTEM_PROMPT,
} from './prompts';

// 常量定义
const MAX_TOOL_CALL_TURNS = 50;
const TOKEN_THRESHOLD_RATIO = 0.85; // 当达到 85% 时触发总结
const SUMMARY_TEMPERATURE = 1;
const DEFAULT_TEMPERATURE = 0.7;

// 定义需要 bookId 的工具列表
const TOOLS_REQUIRING_BOOK_ID = [
  'create_term',
  'get_term',
  'update_term',
  'delete_term',
  'list_terms',
  'search_terms_by_keywords',
  'get_occurrences_by_keywords',
  'create_character',
  'get_character',
  'update_character',
  'delete_character',
  'search_characters_by_keywords',
  'list_characters',
  'get_book_info',
  'list_chapters',
  'get_chapter_info',
  'get_previous_chapter',
  'get_next_chapter',
  'update_chapter_title',
  'get_paragraph_info',
  'get_previous_paragraphs',
  'get_next_paragraphs',
  'find_paragraph_by_keywords',
  'get_translation_history',
  'add_translation',
  'update_translation',
  'remove_translation',
  'select_translation',
  'get_memory',
  'list_memories',
  'get_recent_memories',
  'search_memory_by_keywords',
  'create_memory',
  'update_memory',
  'delete_memory',
  'navigate_to_chapter',
  'navigate_to_paragraph',
];

/**
 * Assistant 服务选项
 */
export interface AssistantServiceOptions {
  /**
   * 流式数据回调函数，用于接收对话过程中的数据块
   */
  onChunk?: TextGenerationStreamCallback;
  /**
   * 思考内容流式回调函数，用于接收思考过程中的数据块（用于在聊天中显示）
   */
  onThinkingChunk?: (text: string) => void | Promise<void>;
  /**
   * AI 执行操作时的回调（如 CRUD 术语/角色）
   */
  onAction?: (action: ActionInfo) => void;
  /**
   * Toast 回调函数，用于在工具中直接显示 toast 通知
   */
  onToast?: ToastCallback;
  /**
   * 取消信号（可选）
   */
  signal?: AbortSignal;
  /**
   * AI 处理 Store（可选），如果提供，将自动创建和管理任务
   */
  aiProcessingStore?: {
    addTask: (task: Omit<AIProcessingTask, 'id' | 'startTime'>) => Promise<string>;
    updateTask: (id: string, updates: Partial<AIProcessingTask>) => Promise<void>;
    appendThinkingMessage: (id: string, text: string) => Promise<void>;
    appendOutputContent: (id: string, text: string) => Promise<void>;
    removeTask: (id: string) => Promise<void>;
    activeTasks: AIProcessingTask[]; // 用于获取任务的 abortController
  };
  /**
   * 会话总结（可选），如果提供，将添加到系统提示词中
   */
  sessionSummary?: string;
  /**
   * 对话历史（可选），如果提供，将作为初始对话历史，实现连续对话
   */
  messageHistory?: ChatMessage[];
  /**
   * 摘要开始时的回调（用于在 UI 中显示摘要气泡）
   */
  onSummarizingStart?: () => void;
  /**
   * 摘要结束时的回调（用于在 UI 中恢复接收 chunk）
   */
  onSummarizingEnd?: () => void;
  /**
   * 聊天会话 ID（可选），如果提供，待办事项将关联到此会话而不是任务
   */
  sessionId?: string;
  /**
   * 跳过 token 限制检查和服务级摘要（可选）
   * 当 UI 层已经处理了摘要时设置为 true，避免重复摘要
   */
  skipTokenLimitSummarization?: boolean;
  /**
   * 任务创建时的回调（可选），用于获取任务 ID
   */
  onTaskCreated?: (taskId: string) => void;
}

/**
 * Assistant 对话结果
 */
export interface AssistantResult {
  text: string;
  taskId?: string;
  actions?: ActionInfo[];
  /**
   * 更新后的对话历史（包含本次对话的所有消息）
   */
  messageHistory?: ChatMessage[];
  /**
   * 是否需要重置会话（当达到 token 限制或发生错误时）
   */
  needsReset?: boolean;
  /**
   * 会话总结（当需要重置时提供）
   */
  summary?: string;
  /**
   * 工具调用产生的额外 token 开销（实际 API 上下文 token 数减去 UI 可见消息 token 数）。
   * 用于修正 UI 进度条的 token 估算，使其反映真实的上下文占用。
   */
  toolCallTokenOverhead?: number;
}

/**
 * Assistant 服务
 * 提供智能助手功能，可以使用所有可用的 AI 工具，并基于用户当前上下文提供帮助
 */
export class AssistantService {
  /**
   * 构建系统提示词
   * 包含用户当前上下文信息
   */
  private static buildSystemPrompt(
    context: {
      currentBookId: string | null;
      currentChapterId: string | null;
      selectedParagraphId: string | null;
    },
    tools: AITool[],
    taskId?: string,
    sessionId?: string,
  ): string {
    const todosPrompt = getTodosSystemPrompt(taskId, sessionId);

    return getAssistantSystemPrompt(todosPrompt, tools, context);
  }

  /**
   * 估算消息历史的 token 数（改进版，支持自定义倍数）
   * @param messages 消息列表
   * @param multiplier token 倍数（默认 2.5，更保守；原方法使用 2.0）
   * @returns 估算的 token 数
   */
  public static estimateTokenCount(
    messages: ChatMessage[],
    multiplier: number = DEFAULT_TOKEN_ESTIMATION_MULTIPLIER,
  ): number {
    return estimateMessagesTokenCount(messages, multiplier);
  }

  /**
   * 更新任务的上下文 token 统计
   */
  private static async updateTaskContextUsage(params: {
    messages: ChatMessage[];
    model: AIModel;
    toolSchemaTokens?: number | undefined;
    aiProcessingStore?: AssistantServiceOptions['aiProcessingStore'] | undefined;
    taskId?: string | undefined;
  }): Promise<void> {
    const { messages, model, toolSchemaTokens, aiProcessingStore, taskId } = params;
    if (!aiProcessingStore || !taskId) return;

    const messageTokens = estimateMessagesTokenCount(messages, DEFAULT_TOKEN_ESTIMATION_MULTIPLIER);
    const contextTokens = messageTokens + (toolSchemaTokens ?? 0);
    const contextWindow = model.maxInputTokens || 0;
    const contextPercentage =
      contextWindow > 0 ? Math.round((contextTokens / contextWindow) * 100) : undefined;

    await aiProcessingStore.updateTask(taskId, {
      contextTokens,
      ...(contextWindow > 0 ? { contextWindow } : {}),
      ...(contextPercentage !== undefined ? { contextPercentage } : {}),
    });
  }

  /**
   * 计算工具调用产生的 token 开销。
   * = 完整内部消息列表的 token 数 - 仅 user/assistant 纯文本消息的 token 数。
   * UI 侧只统计 user/assistant 纯文本，因此此差值用于修正进度条。
   */
  private static calculateToolCallTokenOverhead(messages: ChatMessage[]): number {
    const totalTokens = estimateMessagesTokenCount(messages);
    // 模拟 UI 侧的过滤逻辑：只保留 user/assistant 且有内容的消息，且只取纯 content
    const uiVisibleMessages: ChatMessage[] = messages
      .filter(
        (msg) =>
          (msg.role === 'user' || msg.role === 'assistant') &&
          msg.content &&
          msg.content.trim() &&
          msg.content !== '（调用工具）',
      )
      .map((msg) => ({
        role: msg.role,
        content: msg.content || '',
      }));
    const uiTokens = estimateMessagesTokenCount(uiVisibleMessages);
    return Math.max(0, totalTokens - uiTokens);
  }

  /**
   * 确保摘要符合 token 限制
   * @param systemPrompt 系统提示词
   * @param summary 摘要内容
   * @param userMessage 用户消息
   * @param maxTokens 最大 token 数（如果 <= 0 或 UNLIMITED_TOKENS，直接返回原始摘要）
   * @returns 截断后的摘要（如果原始摘要适合则返回原始摘要）
   */
  private static ensureSummaryFitsInContext(
    systemPrompt: string,
    summary: string,
    userMessage: string,
    maxInputTokens: number,
  ): string {
    // 处理无限制 token 的情况
    if (maxInputTokens <= 0 || maxInputTokens === UNLIMITED_TOKENS) {
      return summary;
    }

    // 保留 20% 用于响应生成，使用更保守的估算
    const availableTokens = Math.floor(maxInputTokens * 0.8);

    // 估算系统提示词和用户消息的 token 数（使用更保守的倍数）
    const systemTokens = estimateMessagesTokenCount(
      [{ role: 'system', content: systemPrompt }],
      DEFAULT_TOKEN_ESTIMATION_MULTIPLIER,
    );
    const userTokens = estimateMessagesTokenCount(
      [{ role: 'user', content: userMessage }],
      DEFAULT_TOKEN_ESTIMATION_MULTIPLIER,
    );

    // 计算摘要可用的 token 数（预留 10% 缓冲）
    const summaryTokens = Math.floor((availableTokens - systemTokens - userTokens) * 0.9);

    // 如果可用 token 数不足，直接截断
    if (summaryTokens <= 0) {
      // 极端情况：只保留摘要的前 100 个字符
      return summary.length > 100 ? summary.slice(0, 97) + '...' : summary;
    }

    // 如果摘要适合，直接返回
    const currentSummaryTokens = estimateMessagesTokenCount(
      [{ role: 'user', content: summary }],
      DEFAULT_TOKEN_ESTIMATION_MULTIPLIER,
    );
    if (currentSummaryTokens <= summaryTokens) {
      return summary;
    }

    // 截断摘要以适配（保守：使用可用量的 90%）
    const targetTokens = Math.floor(summaryTokens * 0.9);
    const charsPerToken = 0.4; // 更保守的估算（中文/日文）
    const maxChars = Math.floor(targetTokens / charsPerToken);

    if (summary.length <= maxChars) {
      return summary;
    }

    // 截断并添加省略号（优先截断尾部，保留开头的关键信息）
    return summary.slice(0, maxChars - 3) + '...';
  }

  /**
   * 降级策略：当摘要失败时，使用最近 N 条消息
   * @param messages 消息历史
   * @param count 保留的消息数量（默认 5）
   * @returns 降级后的消息列表
   */
  private static getFallbackMessages(messages: ChatMessage[], count: number = 5): ChatMessage[] {
    // 保留系统消息
    const systemMessages = messages.filter((msg) => msg.role === 'system');
    // 保留最后 N 条非系统消息
    const recentMessages = messages.filter((msg) => msg.role !== 'system').slice(-count);

    return [...systemMessages, ...recentMessages];
  }

  /**
   * 检查错误是否是 token 限制相关的错误
   */
  private static isTokenLimitError(error: unknown): boolean {
    if (!error) return false;
    let errorMessage = '';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = String(error.message);
    } else {
      errorMessage = JSON.stringify(error);
    }
    const lowerMessage = errorMessage.toLowerCase();
    // 检查常见的 token 限制错误关键词
    return (
      lowerMessage.includes('token') &&
      (lowerMessage.includes('limit') ||
        lowerMessage.includes('exceed') ||
        lowerMessage.includes('maximum') ||
        lowerMessage.includes('too long') ||
        lowerMessage.includes('context length'))
    );
  }

  /**
   * 总结会话历史
   * @param model AI 模型
   * @param messages 要总结的消息列表
   * @param options 选项
   */
  static async summarizeSession(
    model: AIModel,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    options: {
      previousSummary?: string;
      signal?: AbortSignal;
      onChunk?: TextGenerationStreamCallback;
    } = {},
  ): Promise<string> {
    const { previousSummary, signal, onChunk } = options;

    // 将消息分为早期、中期和最近部分，重点关注最近的消息
    const totalMessages = messages.length;
    const recentThreshold = Math.max(1, Math.floor(totalMessages * 0.3)); // 最近30%的消息
    const middleThreshold = Math.max(1, Math.floor(totalMessages * 0.6)); // 中间30%的消息

    const recentMessages = messages.slice(-recentThreshold);
    const middleMessages =
      totalMessages > recentThreshold ? messages.slice(-middleThreshold, -recentThreshold) : [];
    const earlyMessages =
      totalMessages > middleThreshold ? messages.slice(0, -middleThreshold) : [];

    // 构建消息历史，突出显示最近的消息
    const formatMessages = (msgs: typeof messages, startIdx: number, label: string) => {
      if (msgs.length === 0) return '';
      return `\n【${label}】\n${msgs
        .map((msg, idx) => {
          const role = msg.role === 'user' ? '用户' : '助手';
          return `[${startIdx + idx + 1}] ${role}: ${msg.content}`;
        })
        .join('\n\n')}`;
    };

    const earlySection = formatMessages(earlyMessages, 0, '早期对话');
    const middleSection = formatMessages(middleMessages, earlyMessages.length, '中期对话');
    const recentSection = formatMessages(
      recentMessages,
      earlyMessages.length + middleMessages.length,
      '最近对话（重点关注）',
    );

    const normalizedPreviousSummary = previousSummary?.trim() ? previousSummary.trim() : '';
    const previousSummarySection = normalizedPreviousSummary
      ? `\n\n【已有会话摘要】\n${normalizedPreviousSummary}\n`
      : '';

    // 构建总结提示词（精简版，减少 token 消耗）
    const dialogContent = `${earlySection}${middleSection}${recentSection}`;

    // 构建总结提示词（精简版，减少 token 消耗）
    const summaryPrompt = getSessionSummaryPrompt(previousSummarySection, dialogContent);

    // 获取 AI 服务
    const aiService = AIServiceFactory.getService(model.provider);

    // 构建配置
    const config: AIServiceConfig = {
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      model: model.model,
      temperature: SUMMARY_TEMPERATURE, // 使用较低温度以获得更准确的总结
      maxOutputTokens: model.maxOutputTokens,
      signal,
      useCorsProxy: model.useCorsProxy,
      ...(model.customHeaders ? { customHeaders: model.customHeaders } : {}),
    };

    // 构建请求（使用较低的 maxTokens 来限制摘要长度）
    const summaryMaxTokens =
      model.maxOutputTokens > 0 ? Math.min(model.maxOutputTokens, 1024) : 1024; // 摘要不需要太长
    const request: TextGenerationRequest = {
      messages: [
        {
          role: 'system',
          content: SUMMARY_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: summaryPrompt,
        },
      ],
      temperature: SUMMARY_TEMPERATURE,
      maxOutputTokens: summaryMaxTokens,
    };

    // 生成总结
    let fullText = '';
    const result = await aiService.generateText(config, request, async (chunk) => {
      if (chunk.text) {
        fullText += chunk.text;
      }
      if (onChunk) {
        await onChunk(chunk);
      }
    });

    const summary = result.text || fullText;

    // 验证摘要质量
    const validatedSummary = this.validateSummary(summary);
    if (!validatedSummary) {
      console.warn('[AssistantService] 摘要验证失败，返回降级摘要');
      // 返回一个基本的降级摘要，避免完全失败
      return this.createFallbackSummary(messages);
    }

    return validatedSummary;
  }

  /**
   * 验证摘要质量
   * @param summary 摘要内容
   * @returns 验证后的摘要，如果无效则返回 null
   */
  private static validateSummary(summary: string): string | null {
    if (!summary) {
      return null;
    }

    const trimmed = summary.trim();

    // 最小长度检查（至少 20 个字符）
    if (trimmed.length < 20) {
      console.warn(`[AssistantService] 摘要太短: ${trimmed.length} 字符`);
      return null;
    }

    // 检查是否只是错误信息或无意义内容
    const invalidPatterns = [/^(error|错误|失败|无法)/i, /^抱歉/, /^我不/, /^sorry/i];

    for (const pattern of invalidPatterns) {
      if (pattern.test(trimmed)) {
        console.warn(`[AssistantService] 摘要匹配无效模式: ${pattern}`);
        return null;
      }
    }

    return trimmed;
  }

  /**
   * 创建降级摘要（当 AI 摘要失败时使用）
   * @param messages 原始消息列表
   * @returns 简单的降级摘要
   */
  private static createFallbackSummary(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): string {
    // 提取最近几条消息的关键内容
    const recentMessages = messages.slice(-5);
    const userMessages = recentMessages
      .filter((m) => m.role === 'user')
      .map((m) => m.content.slice(0, 50))
      .join('；');

    if (userMessages) {
      return `最近讨论：${userMessages}${userMessages.length > 100 ? '...' : ''}`;
    }

    return '（会话摘要生成失败，已保留最近对话上下文）';
  }

  /**
   * 处理工具调用
   */
  private static async handleToolCalls(
    toolCalls: AIToolCall[],
    tools: AITool[],
    bookId: string | null,
    onAction?: (action: ActionInfo) => void,
    onToast?: ToastCallback,
    taskId?: string,
    sessionId?: string,
    aiModelId?: string,
  ): Promise<Array<{ tool_call_id: string; role: 'tool'; name: string; content: string }>> {
    const allowedToolNames = new Set(tools.map((t) => t.function.name));

    // 定义需要 bookId 的工具列表
    const toolsRequiringBookId = TOOLS_REQUIRING_BOOK_ID;

    const results = [];
    for (const toolCall of toolCalls) {
      // [警告] 严格限制：只能调用本次会话提供的 tools
      if (!allowedToolNames.has(toolCall.function.name)) {
        results.push({
          tool_call_id: toolCall.id,
          role: 'tool' as const,
          name: toolCall.function.name,
          content: JSON.stringify({
            success: false,
            error: `工具 ${toolCall.function.name} 未在本次会话提供的 tools 列表中，禁止调用`,
          }),
        });
        continue;
      }

      // 检查工具是否需要 bookId
      if (toolsRequiringBookId.includes(toolCall.function.name) && !bookId) {
        results.push({
          tool_call_id: toolCall.id,
          role: 'tool' as const,
          name: toolCall.function.name,
          content: JSON.stringify({
            success: false,
            error: '没有当前书籍上下文，无法执行此工具操作',
          }),
        });
        continue;
      }

      // 调用工具处理函数（对于不需要 bookId 的工具，可以传递空字符串）
      const result = await ToolRegistry.handleToolCall(
        toolCall,
        bookId || '',
        onAction,
        onToast,
        taskId,
        sessionId,
        undefined, // paragraphIds
        undefined, // aiProcessingStore
        aiModelId,
      );
      results.push(result);
    }
    return results;
  }

  // ─── 重构提取的辅助方法 ─────────────────────────────────

  /**
   * 构建 AI 服务配置
   */
  private static buildAIConfig(
    model: AIModel,
    overrides?: {
      signal?: AbortSignal | undefined;
      temperature?: number | undefined;
      maxOutputTokens?: number | undefined;
    },
  ): AIServiceConfig {
    return {
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      model: model.model,
      temperature: overrides?.temperature ?? model.temperature ?? DEFAULT_TEMPERATURE,
      maxOutputTokens: overrides?.maxOutputTokens ?? model.maxOutputTokens,
      signal: overrides?.signal,
      useCorsProxy: model.useCorsProxy,
      ...(model.customHeaders ? { customHeaders: model.customHeaders } : {}),
    };
  }

  /**
   * 构建文本生成请求
   */
  private static buildTextRequest(
    messages: ChatMessage[],
    tools: AITool[],
    overrides?: {
      temperature?: number | undefined;
      maxOutputTokens?: number | undefined;
    },
  ): TextGenerationRequest {
    return {
      messages,
      ...(tools.length > 0 ? { tools } : {}),
      ...(overrides?.temperature !== undefined ? { temperature: overrides.temperature } : {}),
      ...(overrides?.maxOutputTokens !== undefined
        ? { maxOutputTokens: overrides.maxOutputTokens }
        : {}),
    };
  }

  /**
   * 创建助手流式处理回调
   * @param appendOutput 是否将输出内容追加到任务面板（初始请求为 true，跟进请求为 false）
   */
  private static createAssistantStreamHandler(params: {
    onTextAccumulate: (text: string) => void;
    onToolCallsAccumulate: (toolCalls: AIToolCall[]) => void;
    aiProcessingStore?: AssistantServiceOptions['aiProcessingStore'];
    taskId?: string | undefined;
    onThinkingChunk?: ((text: string) => void | Promise<void>) | undefined;
    onChunk?: TextGenerationStreamCallback | undefined;
    appendOutput?: boolean | undefined;
  }): TextGenerationStreamCallback {
    const {
      onTextAccumulate,
      onToolCallsAccumulate,
      aiProcessingStore,
      taskId,
      onThinkingChunk,
      onChunk,
      appendOutput,
    } = params;

    return async (chunk: TextGenerationChunk) => {
      if (chunk.text) {
        onTextAccumulate(chunk.text);
      }
      if (chunk.toolCalls) {
        onToolCallsAccumulate(chunk.toolCalls);
      }

      // 保存思考内容到任务面板
      if (aiProcessingStore && taskId && chunk.reasoningContent) {
        await aiProcessingStore.appendThinkingMessage(taskId, chunk.reasoningContent);
      }

      // 追加输出内容到任务面板（仅初始请求）
      if (appendOutput && aiProcessingStore && taskId && chunk.text) {
        await aiProcessingStore.appendOutputContent(taskId, chunk.text);
      }

      // 将思考内容传递到聊天界面
      if (onThinkingChunk && chunk.reasoningContent) {
        await onThinkingChunk(chunk.reasoningContent);
      }

      // 调用用户回调（过滤掉思考内容）
      if (onChunk) {
        const filteredChunk: TextGenerationChunk = {
          text: chunk.text || '',
          done: chunk.done,
          ...(chunk.model ? { model: chunk.model } : {}),
          ...(chunk.toolCalls ? { toolCalls: chunk.toolCalls } : {}),
        };
        await onChunk(filteredChunk);
      }
    };
  }

  /**
   * 处理 generateText 返回结果，分发 reasoningContent
   */
  private static async processGenerateTextResult(params: {
    result: { text: string; toolCalls?: AIToolCall[]; reasoningContent?: string };
    accumulatedText: string;
    accumulatedToolCalls: AIToolCall[];
    aiProcessingStore?: AssistantServiceOptions['aiProcessingStore'] | undefined;
    taskId?: string | undefined;
    onThinkingChunk?: ((text: string) => void | Promise<void>) | undefined;
  }): Promise<{ text: string; toolCalls: AIToolCall[]; reasoningContent: string | undefined }> {
    const {
      result,
      accumulatedText,
      accumulatedToolCalls,
      aiProcessingStore,
      taskId,
      onThinkingChunk,
    } = params;

    const finalText = result.text && result.text.trim() ? result.text : accumulatedText;
    const finalToolCalls = result.toolCalls || accumulatedToolCalls;
    const reasoningContent = result.reasoningContent;

    if (aiProcessingStore && taskId && reasoningContent) {
      await aiProcessingStore.appendThinkingMessage(taskId, reasoningContent);
    }
    if (onThinkingChunk && reasoningContent) {
      await onThinkingChunk(reasoningContent);
    }

    return { text: finalText, toolCalls: finalToolCalls, reasoningContent };
  }

  /**
   * 将助手消息推送到消息历史
   * 统一采用 '（调用工具）' 占位符（兼容 Moonshot/Kimi 等服务）
   */
  private static pushAssistantMessage(
    messages: ChatMessage[],
    text: string,
    toolCalls: AIToolCall[],
    reasoningContent: string | undefined,
  ): void {
    if (toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: text && text.trim() ? text : '（调用工具）',
        tool_calls: toolCalls,
        reasoning_content: reasoningContent || null,
      });
    } else if (text && text.trim()) {
      messages.push({
        role: 'assistant',
        content: text,
      });
    }
  }

  /**
   * 执行单次 AI 请求（流式处理 + 结果处理 + 消息推送）
   */
  private static async executeAIRequest(params: {
    aiService: ReturnType<typeof AIServiceFactory.getService>;
    config: AIServiceConfig;
    request: TextGenerationRequest;
    messages: ChatMessage[];
    options: AssistantServiceOptions;
    taskId?: string | undefined;
    isInitialRequest: boolean;
  }): Promise<{ text: string; toolCalls: AIToolCall[]; reasoningContent: string | undefined }> {
    const { aiService, config, request, messages, options, taskId, isInitialRequest } = params;

    let fullText = '';
    const toolCalls: AIToolCall[] = [];

    const streamHandler = this.createAssistantStreamHandler({
      onTextAccumulate: (text) => {
        fullText += text;
      },
      onToolCallsAccumulate: (tc) => {
        toolCalls.push(...tc);
      },
      aiProcessingStore: options.aiProcessingStore,
      taskId,
      onThinkingChunk: options.onThinkingChunk,
      onChunk: options.onChunk,
      appendOutput: isInitialRequest,
    });

    const result = await aiService.generateText(config, request, streamHandler);

    const processed = await this.processGenerateTextResult({
      result,
      accumulatedText: fullText,
      accumulatedToolCalls: toolCalls,
      aiProcessingStore: options.aiProcessingStore,
      taskId,
      onThinkingChunk: options.onThinkingChunk,
    });

    this.pushAssistantMessage(messages, processed.text, processed.toolCalls, processed.reasoningContent);

    return processed;
  }

  /**
   * 运行工具调用循环
   */
  private static async runToolCallLoop(params: {
    initialToolCalls: AIToolCall[];
    messages: ChatMessage[];
    tools: AITool[];
    model: AIModel;
    bookId: string | null;
    aiService: ReturnType<typeof AIServiceFactory.getService>;
    config: AIServiceConfig;
    options: AssistantServiceOptions;
    taskId?: string | undefined;
    sessionId?: string | undefined;
    toolSchemaTokens: number;
    signal?: AbortSignal | undefined;
  }): Promise<{ finalText: string; actions: ActionInfo[] }> {
    const {
      messages,
      tools,
      model,
      bookId,
      aiService,
      config,
      options,
      taskId,
      sessionId,
      toolSchemaTokens,
      signal,
    } = params;
    let toolCalls = params.initialToolCalls;
    let currentTurnCount = 0;
    let finalText = '';
    const allActions: ActionInfo[] = [];

    while (toolCalls.length > 0 && currentTurnCount < MAX_TOOL_CALL_TURNS) {
      currentTurnCount++;

      if (signal?.aborted) {
        throw new Error('请求已取消');
      }

      // 执行工具调用
      const toolResults = await this.handleToolCalls(
        toolCalls,
        tools,
        bookId,
        (action) => {
          allActions.push(action);
          options.onAction?.(action);
        },
        options.onToast,
        taskId,
        sessionId,
        model.id,
      );

      messages.push(...toolResults);

      await this.updateTaskContextUsage({
        messages,
        model,
        ...(toolSchemaTokens > 0 ? { toolSchemaTokens } : {}),
        aiProcessingStore: options.aiProcessingStore,
        taskId,
      });

      // 跟进请求
      const followUpRequest = this.buildTextRequest(messages, tools, {
        temperature: model.temperature ?? DEFAULT_TEMPERATURE,
        maxOutputTokens: model.maxOutputTokens,
      });

      const followUpResult = await this.executeAIRequest({
        aiService,
        config,
        request: followUpRequest,
        messages,
        options,
        taskId,
        isInitialRequest: false,
      });

      if (followUpResult.text && followUpResult.text.trim()) {
        finalText = followUpResult.text;
      }
      toolCalls = followUpResult.toolCalls;

      await this.updateTaskContextUsage({
        messages,
        model,
        ...(toolSchemaTokens > 0 ? { toolSchemaTokens } : {}),
        aiProcessingStore: options.aiProcessingStore,
        taskId,
      });

      if (toolCalls.length === 0) {
        break;
      }
    }

    return { finalText, actions: allActions };
  }

  /**
   * 执行完整的 AI 请求（包括工具调用循环）
   */
  private static async executeFullRequest(params: {
    model: AIModel;
    messages: ChatMessage[];
    tools: AITool[];
    bookId: string | null;
    options: AssistantServiceOptions;
    taskId?: string | undefined;
    sessionId?: string | undefined;
    signal?: AbortSignal | undefined;
    maxOutputTokens?: number | undefined;
  }): Promise<AssistantResult> {
    const { model, messages, tools, bookId, options, taskId, sessionId, signal, maxOutputTokens } =
      params;

    const toolSchemaTokens = estimateToolSchemaTokens(tools);
    const aiService = AIServiceFactory.getService(model.provider);
    const effectiveMaxTokens = maxOutputTokens ?? model.maxOutputTokens;
    const config = this.buildAIConfig(model, { signal, maxOutputTokens: effectiveMaxTokens });
    const request = this.buildTextRequest(messages, tools, {
      temperature: model.temperature ?? DEFAULT_TEMPERATURE,
      maxOutputTokens: effectiveMaxTokens,
    });

    // 初始请求
    const initialResult = await this.executeAIRequest({
      aiService,
      config,
      request,
      messages,
      options,
      taskId,
      isInitialRequest: true,
    });

    await this.updateTaskContextUsage({
      messages,
      model,
      ...(toolSchemaTokens > 0 ? { toolSchemaTokens } : {}),
      aiProcessingStore: options.aiProcessingStore,
      taskId,
    });

    // 工具调用循环
    const { finalText: loopFinalText, actions } = await this.runToolCallLoop({
      initialToolCalls: initialResult.toolCalls,
      messages,
      tools,
      model,
      bookId,
      aiService,
      config,
      options,
      taskId,
      sessionId,
      toolSchemaTokens,
      signal,
    });

    const finalResponseText = loopFinalText || initialResult.text;

    // 更新任务状态
    if (options.aiProcessingStore && taskId) {
      await options.aiProcessingStore.updateTask(taskId, {
        status: 'end',
        message: '助手回复完成',
      });
    }

    const finalText = finalResponseText.trim() || '抱歉，我没有收到有效的回复。请重试。';

    if (!finalResponseText.trim()) {
      console.error('[AssistantService] ❌ 错误：最终回复文本为空');
    }

    return {
      text: finalText,
      ...(taskId ? { taskId } : {}),
      actions,
      messageHistory: messages,
      toolCallTokenOverhead: this.calculateToolCallTokenOverhead(messages),
    };
  }

  /**
   * 缩减消息历史以适应模型上下文窗口。
   * 逐步移除中间历史消息，每次保留 50%，直到符合限制。
   * 返回调整后的 maxOutputTokens。
   */
  private static reduceMessagesToFitContext(params: {
    messages: ChatMessage[];
    systemPrompt: string;
    userMessage: string;
    model: AIModel;
    toolSchemaTokens: number;
    effectiveMaxTokens: number;
  }): { finalMaxTokens: number } {
    const { messages, systemPrompt, userMessage, model, toolSchemaTokens, effectiveMaxTokens } =
      params;

    let currentEstimatedTokens =
      estimateMessagesTokenCount(messages, DEFAULT_TOKEN_ESTIMATION_MULTIPLIER) + toolSchemaTokens;
    let finalMaxTokens = effectiveMaxTokens;

    if (!model.maxInputTokens || model.maxInputTokens <= 0) {
      return { finalMaxTokens };
    }

    const availableForCompletion = model.maxInputTokens - currentEstimatedTokens;
    if (availableForCompletion >= effectiveMaxTokens) {
      return { finalMaxTokens };
    }

    if (availableForCompletion > 0) {
      // 可用空间不足但未超出，调整 maxTokens
      return { finalMaxTokens: Math.floor(availableForCompletion * 0.9) };
    }

    // 消息已超出上下文窗口，需要逐步缩减
    console.warn(
      `[AssistantService] 消息太大 (${currentEstimatedTokens} tokens, 含工具 schema ${toolSchemaTokens})，缩减消息历史`,
    );

    const requiredForCompletion = Math.min(
      model.maxOutputTokens || 0,
      Math.floor(model.maxInputTokens * 0.5),
    );
    const maxAllowedForMessages = model.maxInputTokens - requiredForCompletion;

    let reducedMessages = [...messages];
    let attemptCount = 0;

    while (
      currentEstimatedTokens > maxAllowedForMessages &&
      attemptCount < 20 &&
      reducedMessages.length > 2
    ) {
      const systemMsg = reducedMessages[0];
      const userMsg = reducedMessages[reducedMessages.length - 1];
      if (!systemMsg || !userMsg) break;

      const historyMessages = reducedMessages.slice(1, -1);
      const keepCount = Math.max(0, Math.floor(historyMessages.length * 0.5));
      const recentMessages = keepCount > 0 ? historyMessages.slice(-keepCount) : [];

      reducedMessages = [systemMsg, ...recentMessages, userMsg];
      currentEstimatedTokens =
        estimateMessagesTokenCount(reducedMessages, DEFAULT_TOKEN_ESTIMATION_MULTIPLIER) +
        toolSchemaTokens;
      attemptCount++;
    }

    // 如果仍然太大，只保留系统提示词和用户消息
    if (currentEstimatedTokens > maxAllowedForMessages) {
      reducedMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ];
      currentEstimatedTokens =
        estimateMessagesTokenCount(reducedMessages, DEFAULT_TOKEN_ESTIMATION_MULTIPLIER) +
        toolSchemaTokens;
      console.warn(
        `[AssistantService] 消息历史已减少到最小 (${currentEstimatedTokens} tokens)`,
      );
    } else {
      console.warn(
        `[AssistantService] 消息历史已减少到 ${reducedMessages.length} 条 (${currentEstimatedTokens} tokens)`,
      );
    }

    messages.length = 0;
    messages.push(...reducedMessages);

    const newAvailable = model.maxInputTokens - currentEstimatedTokens;
    finalMaxTokens =
      newAvailable > 0
        ? Math.floor(newAvailable * 0.9)
        : Math.floor(model.maxInputTokens * 0.1);

    return { finalMaxTokens };
  }

  /**
   * 构建要总结的消息列表
   */
  private static buildMessagesToSummarize(
    messageHistory: ChatMessage[],
    excludeLastMessage: boolean,
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    let filtered = messageHistory.filter((msg) => msg.role !== 'system');
    if (excludeLastMessage && filtered.length > 0) {
      filtered = filtered.slice(0, -1);
    }
    return filtered.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content || '',
    }));
  }

  /**
   * 使用摘要重建消息数组
   */
  private static rebuildMessagesWithSummary(
    systemPrompt: string,
    summary: string,
    userMessage: string,
  ): ChatMessage[] {
    const systemPromptWithSummary =
      systemPrompt +
      `\n\n## 之前的对话总结\n\n${summary}\n\n**注意**：以上是之前对话的总结。当前对话从总结后的内容继续。`;
    return [
      { role: 'system', content: systemPromptWithSummary },
      { role: 'user', content: userMessage },
    ];
  }

  // ─── 摘要与重试 ────────────────────────────────────────

  /**
   * 当会话触发 token 限制时，生成摘要并通知外部重新发起请求
   */
  private static async requestSummaryReset(params: {
    model: AIModel;
    systemPrompt: string;
    userMessage: string;
    messagesToSummarize: Array<{ role: 'user' | 'assistant'; content: string }>;
    previousSummary?: string;
    context: { currentBookId: string | null };
    finalSignal?: AbortSignal;
    aiProcessingStore?: AssistantServiceOptions['aiProcessingStore'];
    taskId?: string;
    onSummarizingStart?: () => void;
    originalMessageHistory?: ChatMessage[];
  }): Promise<AssistantResult | null> {
    const {
      model,
      systemPrompt,
      userMessage,
      messagesToSummarize,
      previousSummary,
      context,
      finalSignal,
      aiProcessingStore,
      taskId,
      onSummarizingStart,
      originalMessageHistory,
    } = params;

    if (messagesToSummarize.length === 0) {
      return null;
    }

    if (finalSignal?.aborted) {
      throw new Error('请求已取消');
    }

    onSummarizingStart?.();

    let summary: string;
    try {
      summary = await this.summarizeSession(model, messagesToSummarize, {
        ...(finalSignal ? { signal: finalSignal } : {}),
        ...(previousSummary ? { previousSummary } : {}),
      });
    } catch (error) {
      console.error('[AssistantService] 摘要生成失败', error);
      return null;
    }

    const truncatedSummary = this.ensureSummaryFitsInContext(
      systemPrompt,
      summary,
      userMessage,
      model.maxInputTokens,
    );

    if (context.currentBookId && summary) {
      try {
        const memorySummary = summary.length > 100 ? summary.slice(0, 100) + '...' : summary;
        await MemoryService.createMemory(
          context.currentBookId,
          summary,
          `会话摘要：${memorySummary}`,
        );
      } catch (error) {
        console.error('Failed to create memory for session summary:', error);
      }
    }

    if (aiProcessingStore && taskId) {
      await aiProcessingStore.updateTask(taskId, {
        status: 'processing',
        message: '摘要完成，正在继续处理...',
      });
    }

    return {
      text: '',
      ...(taskId ? { taskId } : {}),
      ...(originalMessageHistory ? { messageHistory: originalMessageHistory } : {}),
      needsReset: true,
      summary: truncatedSummary,
    };
  }

  /**
   * 与助手对话
   * @param model AI 模型
   * @param userMessage 用户消息
   * @param options 选项
   */
  static async chat(
    model: AIModel,
    userMessage: string,
    options: AssistantServiceOptions = {},
  ): Promise<AssistantResult> {
    const { signal, aiProcessingStore, sessionId } = options;

    // 获取 stores
    const contextStore = useContextStore();

    // 获取上下文（只使用 ID）
    const context = contextStore.getContext;

    // 创建任务（如果提供了 store）- 必须在构建系统提示词之前创建，以便传递 taskId
    let taskId: string | undefined;
    let taskAbortSignal: AbortSignal | undefined;
    if (aiProcessingStore) {
      taskId = await aiProcessingStore.addTask({
        type: 'assistant',
        modelName: model.name || model.id,
        status: 'processing',
        message: '正在处理助手请求...',
      });

      // 通知外部任务已创建
      if (options.onTaskCreated) {
        options.onTaskCreated(taskId);
      }

      // 获取任务的 abortController signal（用于停止按钮）
      // 注意：这里需要从 store 中获取任务，因为 addTask 返回的是 id
      // 但任务对象（包含 abortController）在 store 的 activeTasks 中
    }

    // 获取可用的工具（助手聊天专用工具集）
    // 已排除：add_translation_batch（翻译专用）、update_task_status（任务状态管理专用）
    const tools = ToolRegistry.getAssistantToolsExcludingTranslationManagement(
      context.currentBookId || undefined,
    );

    // 构建系统提示词（只传递 ID）- 必须在创建任务之后
    let systemPrompt = this.buildSystemPrompt(context, tools, taskId, sessionId);

    // 如果当前会话有总结，添加到系统提示词中
    // 注意：这里需要在调用时传入会话信息，因为 store 不能在静态方法中直接使用
    // 我们通过 options 传递总结信息
    if (options.sessionSummary) {
      systemPrompt += `\n\n## 之前的对话总结\n\n${options.sessionSummary}\n\n**注意**：以上是之前对话的总结。当前对话从总结后的内容继续。`;
    }

    if (aiProcessingStore && taskId) {
      // 由于 addTask 是异步的，我们需要等待一下或者直接从 store 中查找
      // 实际上，addTask 会立即将任务添加到 activeTasks，所以我们可以直接查找
      const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
      if (task?.abortController) {
        taskAbortSignal = task.abortController.signal;
      }
    }

    // 合并 signal：优先使用传入的 signal，如果没有则使用任务的 signal
    const finalSignal = signal || taskAbortSignal;

    try {
      // 构建消息列表
      // 如果提供了历史消息，使用它（但需要确保系统提示词在开头）
      // 如果没有提供，创建新的历史
      const messages: ChatMessage[] = options.messageHistory
        ? [...options.messageHistory]
        : [
            {
              role: 'system',
              content: systemPrompt,
            },
          ];

      // 确保系统提示词存在并且是最新的
      const systemIndex = messages.findIndex((msg) => msg.role === 'system');
      if (systemIndex >= 0) {
        messages[systemIndex] = { role: 'system', content: systemPrompt };
      } else {
        messages.unshift({ role: 'system', content: systemPrompt });
      }

      // 添加用户消息
      messages.push({
        role: 'user',
        content: userMessage,
      });

      // 边界检查：检查用户消息长度（应基于输入上限，而不是输出上限）
      if (model.maxInputTokens > 0 && model.maxInputTokens !== UNLIMITED_TOKENS) {
        const userMessageTokens = estimateMessagesTokenCount(
          [{ role: 'user', content: userMessage }],
          DEFAULT_TOKEN_ESTIMATION_MULTIPLIER,
        );
        if (userMessageTokens >= model.maxInputTokens * 0.8) {
          // 用户消息本身就很大，直接返回错误
          const errorMessage = '用户消息过长，无法处理。请缩短消息长度后重试。';
          if (aiProcessingStore && taskId) {
            await aiProcessingStore.updateTask(taskId, {
              status: 'error',
              message: errorMessage,
            });
          }
          throw new Error(errorMessage);
        }
      }

      // 检查 token 限制（在发送请求前）
      // 如果模型有 maxTokens 限制（不是 UNLIMITED_TOKENS），检查是否接近或超过限制
      const messageTokens = estimateMessagesTokenCount(
        messages,
        DEFAULT_TOKEN_ESTIMATION_MULTIPLIER,
      );
      // API 提供商会将 tools 参数中的完整 JSON schema 计入上下文窗口，
      // 需要将其纳入 token 估算以避免低估实际用量
      const toolSchemaTokens = estimateToolSchemaTokens(tools);
      const estimatedTokens = messageTokens + toolSchemaTokens;
      // const TOKEN_THRESHOLD_RATIO = 0.85; // 使用常量

      // 检查是否超过模型的最大上下文长度（contextWindow）
      // 如果模型有 contextWindow，需要确保 estimatedTokens + maxTokens <= contextWindow
      let effectiveMaxTokens = model.maxOutputTokens;
      if (model.maxInputTokens && model.maxInputTokens > 0) {
        // 计算实际可用的 maxTokens（考虑消息占用的 token）
        const availableForCompletion = model.maxInputTokens - estimatedTokens;
        // 如果可用空间小于请求的 maxTokens，需要调整
        if (availableForCompletion < model.maxOutputTokens) {
          if (availableForCompletion <= 0) {
            // 消息已经占满了整个上下文窗口，必须触发总结
            console.warn(
              `[AssistantService] 消息 token 数 (${estimatedTokens}, 含工具 schema ${toolSchemaTokens}) 已超过或等于模型上下文窗口 (${model.maxInputTokens})，必须触发总结`,
            );
            effectiveMaxTokens = 0; // 标记需要总结
          } else {
            // 调整 maxTokens 以适应上下文窗口
            console.warn(
              `[AssistantService] 调整 maxTokens 从 ${model.maxOutputTokens} 到 ${availableForCompletion} 以适应上下文窗口`,
            );
            effectiveMaxTokens = Math.floor(availableForCompletion * 0.9); // 留 10% 缓冲
          }
        }
      }

      // 检查是否需要在请求前进行摘要
      // 如果 UI 层已经处理了摘要（skipTokenLimitSummarization = true），则跳过此检查
      const thresholdBase =
        model.maxInputTokens && model.maxInputTokens > 0 ? model.maxInputTokens : 0;
      const tokenThreshold =
        thresholdBase > 0 && thresholdBase !== UNLIMITED_TOKENS
          ? thresholdBase * TOKEN_THRESHOLD_RATIO
          : 0;
      const isTokenLimitReached =
        thresholdBase > 0 &&
        thresholdBase !== UNLIMITED_TOKENS &&
        estimatedTokens >= tokenThreshold;
      const isContextWindowFull = thresholdBase > 0 && effectiveMaxTokens === 0;
      const shouldSummarizeBeforeRequest =
        !options.skipTokenLimitSummarization && (isTokenLimitReached || isContextWindowFull); // 如果消息占满了上下文窗口，必须总结

      // 调试日志：记录触发条件检查详情
      console.log('[AssistantService] Token 限制检查:', {
        estimatedTokens,
        messageTokens,
        toolSchemaTokens,
        maxOutputTokens: model.maxOutputTokens,
        contextWindow: model.maxInputTokens,
        thresholdBase,
        tokenThreshold: Math.round(tokenThreshold),
        isTokenLimitReached,
        isContextWindowFull,
        effectiveMaxTokens,
        shouldSummarizeBeforeRequest,
        messageCount: options.messageHistory?.length || 0,
      });

      if (aiProcessingStore && taskId) {
        const contextWindow = model.maxInputTokens || 0;
        const contextPercentage =
          contextWindow > 0 ? Math.round((estimatedTokens / contextWindow) * 100) : undefined;
        await aiProcessingStore.updateTask(taskId, {
          contextTokens: estimatedTokens,
          ...(contextWindow > 0 ? { contextWindow } : {}),
          ...(contextPercentage !== undefined ? { contextPercentage } : {}),
        });
      }

      if (
        shouldSummarizeBeforeRequest &&
        options.messageHistory &&
        options.messageHistory.length > 2
      ) {
        // 需要总结并重置
        // 构建要总结的消息（排除系统消息和当前用户消息）
        const messagesToSummarize = this.buildMessagesToSummarize(options.messageHistory, true);

        if (messagesToSummarize.length > 0) {
          const summaryResult = await this.requestSummaryReset({
            model,
            systemPrompt,
            userMessage,
            messagesToSummarize,
            ...(options.sessionSummary ? { previousSummary: options.sessionSummary } : {}),
            context: { currentBookId: context.currentBookId },
            ...(finalSignal ? { finalSignal } : {}),
            ...(aiProcessingStore ? { aiProcessingStore } : {}),
            ...(taskId ? { taskId } : {}),
            ...(options.onSummarizingStart
              ? { onSummarizingStart: options.onSummarizingStart }
              : {}),
            ...(options.messageHistory ? { originalMessageHistory: options.messageHistory } : {}),
          });

          if (summaryResult && summaryResult.summary) {
            // 摘要成功，使用新摘要重建消息并继续聊天
            console.log(
              '[AssistantService] 摘要成功，使用新摘要继续聊天，摘要长度:',
              summaryResult.summary.length,
            );

            // 通知 UI 摘要已完成，可以开始接收新的 chunk
            options.onSummarizingEnd?.();

            const retryMessages = this.rebuildMessagesWithSummary(
              systemPrompt, summaryResult.summary, userMessage,
            );

            // 使用重建的消息继续聊天
            const retryResult = await this.executeFullRequest({
              model, messages: retryMessages, tools,
              bookId: context.currentBookId,
              options, taskId, sessionId, signal: finalSignal,
            });

            // 返回结果，同时包含摘要信息供 UI 层更新会话状态
            return {
              ...retryResult,
              needsReset: true,
              summary: summaryResult.summary,
            };
          }

          console.warn('[AssistantService] 自动总结失败，使用降级策略：只保留最近 5 条消息');
          const fallbackMessages = this.getFallbackMessages(options.messageHistory, 5);
          messages.length = 0;
          messages.push({
            role: 'system',
            content: systemPrompt,
          });
          messages.push(...fallbackMessages.filter((msg) => msg.role !== 'system'));
          messages.push({
            role: 'user',
            content: userMessage,
          });
        }
      }

      // 缩减消息历史以适应上下文窗口（如果需要）
      const { finalMaxTokens } = this.reduceMessagesToFitContext({
        messages,
        systemPrompt,
        userMessage,
        model,
        toolSchemaTokens,
        effectiveMaxTokens,
      });

      await this.updateTaskContextUsage({
        messages,
        model,
        toolSchemaTokens,
        aiProcessingStore,
        taskId,
      });

      // 执行完整请求（初始请求 + 工具调用循环）
      return await this.executeFullRequest({
        model,
        messages,
        tools,
        bookId: context.currentBookId,
        options,
        taskId,
        sessionId,
        signal: finalSignal,
        maxOutputTokens: finalMaxTokens,
      });
    } catch (error) {
      console.error('[AssistantService] ❌ 发生错误', {
        error: error instanceof Error ? error.message : String(error),
        ...(import.meta.env.DEV && {
          errorStack: error instanceof Error ? error.stack : undefined,
        }),
        model: model.model,
        provider: model.provider,
        taskId,
      });

      // 检查是否是 token 限制错误，如果是，尝试总结并重试
      // 注意：maxTokens=0 表示无限制（与 UNLIMITED_TOKENS=-1 类似），不应仅因 maxTokens=0 就触发摘要逻辑
      const hasPositiveMaxTokensLimit =
        model.maxOutputTokens > 0 && model.maxOutputTokens !== UNLIMITED_TOKENS;
      const hasContextWindowLimit =
        typeof model.maxInputTokens === 'number' && model.maxInputTokens > 0;

      if (
        this.isTokenLimitError(error) &&
        options.messageHistory &&
        options.messageHistory.length > 2 &&
        (hasPositiveMaxTokensLimit || hasContextWindowLimit)
      ) {
        try {
          if (finalSignal?.aborted) {
            throw new Error('请求已取消');
          }

          if (aiProcessingStore && taskId) {
            await aiProcessingStore.updateTask(taskId, {
              status: 'processing',
              message: '检测到 token 限制错误，正在总结会话历史...',
            });
          }

          const messagesToSummarize = this.buildMessagesToSummarize(options.messageHistory, false);

          if (messagesToSummarize.length > 0) {
            const summaryResult = await this.requestSummaryReset({
              model,
              systemPrompt,
              userMessage,
              messagesToSummarize,
              ...(options.sessionSummary ? { previousSummary: options.sessionSummary } : {}),
              context: { currentBookId: context.currentBookId },
              ...(finalSignal ? { finalSignal } : {}),
              ...(aiProcessingStore ? { aiProcessingStore } : {}),
              ...(taskId ? { taskId } : {}),
              ...(options.onSummarizingStart
                ? { onSummarizingStart: options.onSummarizingStart }
                : {}),
              ...(options.messageHistory ? { originalMessageHistory: options.messageHistory } : {}),
            });

            if (summaryResult && summaryResult.summary) {
              // 通知 UI 摘要已完成，可以开始接收新的 chunk
              options.onSummarizingEnd?.();

              const retryMessages = this.rebuildMessagesWithSummary(
                systemPrompt, summaryResult.summary, userMessage,
              );

              // 使用重建的消息继续聊天
              const retryResult = await this.executeFullRequest({
                model, messages: retryMessages, tools,
                bookId: context.currentBookId,
                options, taskId, sessionId, signal: finalSignal,
              });

              return {
                ...retryResult,
                needsReset: true,
                summary: summaryResult.summary,
              };
            }

            console.warn('[AssistantService] 摘要失败，使用降级策略：只保留最近 5 条消息');
            // 通知 UI 摘要阶段已结束（即使摘要失败，也需要恢复 UI 状态）
            options.onSummarizingEnd?.();

            const fallbackMessages = this.getFallbackMessages(options.messageHistory, 5);
            const retryMessages: ChatMessage[] = [
              {
                role: 'system',
                content: systemPrompt,
              },
              ...fallbackMessages.filter((msg) => msg.role !== 'system'),
              {
                role: 'user',
                content: userMessage,
              },
            ];

            return await this.executeFullRequest({
              model, messages: retryMessages, tools,
              bookId: context.currentBookId,
              options, taskId, sessionId, signal: finalSignal,
            });
          }
        } catch (summaryError) {
          console.error('[AssistantService] ❌ 总结会话失败', summaryError);
          // 如果总结失败，继续抛出原始错误
        }
      }

      // 更新任务状态
      if (aiProcessingStore && taskId) {
        // 检查是否是取消错误
        const isCancelled =
          error instanceof Error &&
          (error.message === '请求已取消' ||
            error.message.includes('aborted') ||
            error.name === 'AbortError');

        if (isCancelled) {
          await aiProcessingStore.updateTask(taskId, {
            status: 'cancelled',
            message: '已取消',
          });
        } else {
          await aiProcessingStore.updateTask(taskId, {
            status: 'error',
            message: error instanceof Error ? error.message : '未知错误',
          });
        }
      }

      throw error;
    }
  }
}
