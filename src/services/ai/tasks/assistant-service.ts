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
  getAssistantSystemPrompt,
  getSessionSummaryPrompt,
  SUMMARY_SYSTEM_PROMPT,
} from './prompts';

// 常量定义
const DEFAULT_TOKEN_ESTIMATION_MULTIPLIER = 2.5;
const MAX_TOOL_CALL_TURNS = 50;
const TOKEN_THRESHOLD_RATIO = 0.85; // 当达到 85% 时触发总结
const SUMMARY_TEMPERATURE = 0.3;
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
    const todosPrompt = taskId ? getTodosSystemPrompt(taskId, sessionId) : '';

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
    if (!messages || messages.length === 0) return 0;
    const totalContent = messages
      .map((msg) => {
        if (msg.content) {
          return msg.content;
        }
        // 如果有 tool_calls，估算其 token 数
        if ('tool_calls' in msg && msg.tool_calls) {
          try {
            return JSON.stringify(msg.tool_calls);
          } catch (error) {
            console.warn('Token count serialization error:', error);
            // 避免循环引用导致序列化失败
            return 'tool_calls_placeholder';
          }
        }
        return '';
      })
      .join('\n');
    // 使用更保守的估算倍数
    return Math.ceil(totalContent.length * multiplier);
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
    maxTokens: number,
  ): string {
    // 处理无限制 token 的情况
    if (maxTokens <= 0 || maxTokens === UNLIMITED_TOKENS) {
      return summary;
    }

    // 保留 20% 用于响应生成，使用更保守的估算
    const availableTokens = Math.floor(maxTokens * 0.8);

    // 估算系统提示词和用户消息的 token 数（使用更保守的倍数）
    const systemTokens = this.estimateTokenCount(
      [{ role: 'system', content: systemPrompt }],
      DEFAULT_TOKEN_ESTIMATION_MULTIPLIER,
    );
    const userTokens = this.estimateTokenCount(
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
    const currentSummaryTokens = this.estimateTokenCount(
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
      maxTokens: model.maxTokens,
      signal,
    };

    // 构建请求（使用较低的 maxTokens 来限制摘要长度）
    const summaryMaxTokens = model.maxTokens > 0 ? Math.min(model.maxTokens, 1024) : 1024; // 摘要不需要太长
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
      maxTokens: summaryMaxTokens,
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
      model.maxTokens,
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
        status: 'end',
        message: '会话已总结，请重新发送请求。',
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
   * 摘要后重试原始请求
   * @param model AI 模型
   * @param messages 重建后的消息数组
   * @param tools 工具列表
   * @param bookId 书籍 ID
   * @param options 原始选项
   * @param taskId 任务 ID
   * @param sessionId 会话 ID
   * @param signal 取消信号
   * @returns 助手结果
   */
  private static async retryRequestAfterSummary(
    model: AIModel,
    messages: ChatMessage[],
    tools: any[],
    bookId: string | null,
    options: AssistantServiceOptions,
    taskId: string | undefined,
    sessionId: string | undefined,
    signal: AbortSignal | undefined,
  ): Promise<AssistantResult> {
    const { onChunk, onAction, onToast, onThinkingChunk, aiProcessingStore } = options;

    // 获取 AI 服务
    const aiService = AIServiceFactory.getService(model.provider);

    // 构建配置
    const config: AIServiceConfig = {
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      model: model.model,
      temperature: model.temperature ?? DEFAULT_TEMPERATURE,
      maxTokens: model.maxTokens,
      signal,
    };

    // 构建请求
    const request: TextGenerationRequest = {
      messages,
      ...(tools.length > 0 ? { tools } : {}),
      temperature: model.temperature ?? DEFAULT_TEMPERATURE,
      maxTokens: model.maxTokens,
    };

    // 流式生成响应
    let fullText = '';
    let toolCalls: AIToolCall[] = [];
    const allActions: ActionInfo[] = [];

    const result = await aiService.generateText(config, request, async (chunk) => {
      // 累积流式文本（只累积实际内容，不包括思考内容）
      if (chunk.text) {
        fullText += chunk.text;
      }
      if (chunk.toolCalls) {
        toolCalls.push(...chunk.toolCalls);
      }

      // 保存思考内容到思考过程面板
      if (aiProcessingStore && taskId && chunk.reasoningContent) {
        await aiProcessingStore.appendThinkingMessage(taskId, chunk.reasoningContent);
      }

      // 追加输出内容到任务
      if (aiProcessingStore && taskId && chunk.text) {
        await aiProcessingStore.appendOutputContent(taskId, chunk.text);
      }

      // 将思考内容传递到聊天界面（通过 onThinkingChunk 回调）
      if (onThinkingChunk && chunk.reasoningContent) {
        await onThinkingChunk(chunk.reasoningContent);
      }

      // 调用用户回调（只传递实际内容，不传递思考内容）
      if (onChunk) {
        const filteredChunk: TextGenerationChunk = {
          text: chunk.text || '',
          done: chunk.done,
          ...(chunk.model ? { model: chunk.model } : {}),
          ...(chunk.toolCalls ? { toolCalls: chunk.toolCalls } : {}),
        };
        await onChunk(filteredChunk);
      }
    });

    // 使用 result.text 如果存在且不为空，否则使用累积的 fullText
    if (result.text && result.text.trim()) {
      fullText = result.text;
    }

    if (result.toolCalls) {
      toolCalls = result.toolCalls;
    }

    // 捕获 reasoning_content
    const reasoningContent = result.reasoningContent;
    if (aiProcessingStore && taskId && reasoningContent) {
      await aiProcessingStore.appendThinkingMessage(taskId, reasoningContent);
    }
    if (onThinkingChunk && reasoningContent) {
      await onThinkingChunk(reasoningContent);
    }

    // 处理工具调用循环
    let currentTurnCount = 0;
    // const MAX_TURNS = 50; // 使用常量 MAX_TOOL_CALL_TURNS
    let finalResponseText = fullText;

    // 将第一次响应添加到历史
    if (toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        // [兼容] Moonshot/Kimi 等 OpenAI 兼容服务可能不允许 assistant content 为空（即使有 tool_calls）
        // OpenAI 官方允许 null，但这里统一给一个极短占位符，避免 400：message must not be empty
        content: fullText && fullText.trim() ? fullText : '（调用工具）',
        tool_calls: toolCalls,
        reasoning_content: reasoningContent || null,
      });
    } else if (fullText && fullText.trim()) {
      messages.push({
        role: 'assistant',
        content: fullText,
      });
    }

    // 工具调用循环
    while (toolCalls.length > 0 && currentTurnCount < MAX_TOOL_CALL_TURNS) {
      currentTurnCount++;

      // 检查取消信号
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
          if (onAction) {
            onAction(action);
          }
        },
        onToast,
        taskId,
        sessionId,
        model.id,
      );

      // 将工具结果添加到历史
      messages.push(...toolResults);

      // 再次调用 AI 获取回复
      const followUpRequest: TextGenerationRequest = {
        messages,
        ...(tools.length > 0 ? { tools } : {}),
        temperature: model.temperature ?? DEFAULT_TEMPERATURE,
        maxTokens: model.maxTokens,
      };

      let followUpText = '';
      toolCalls = [];

      const followUpResult = await aiService.generateText(
        config,
        followUpRequest,
        async (chunk) => {
          if (chunk.text) {
            followUpText += chunk.text;
          }
          if (chunk.toolCalls) {
            toolCalls.push(...chunk.toolCalls);
          }

          if (aiProcessingStore && taskId && chunk.reasoningContent) {
            await aiProcessingStore.appendThinkingMessage(taskId, chunk.reasoningContent);
          }

          if (onThinkingChunk && chunk.reasoningContent) {
            await onThinkingChunk(chunk.reasoningContent);
          }

          if (onChunk) {
            const filteredChunk: TextGenerationChunk = {
              text: chunk.text || '',
              done: chunk.done,
              ...(chunk.model ? { model: chunk.model } : {}),
              ...(chunk.toolCalls ? { toolCalls: chunk.toolCalls } : {}),
            };
            await onChunk(filteredChunk);
          }
        },
      );

      if (followUpResult.text && followUpResult.text.trim()) {
        followUpText = followUpResult.text;
      }

      if (followUpResult.toolCalls) {
        toolCalls = followUpResult.toolCalls;
      }

      const followUpReasoningContent = followUpResult.reasoningContent;
      if (aiProcessingStore && taskId && followUpReasoningContent) {
        await aiProcessingStore.appendThinkingMessage(taskId, followUpReasoningContent);
      }
      if (onThinkingChunk && followUpReasoningContent) {
        await onThinkingChunk(followUpReasoningContent);
      }

      if (followUpText && followUpText.trim()) {
        finalResponseText = followUpText;
      }

      // 将助手回复添加到历史
      if (toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          // [兼容] 同上：避免 assistant content 为空导致部分兼容服务报错
          content: followUpText && followUpText.trim() ? followUpText : '（调用工具）',
          tool_calls: toolCalls,
          reasoning_content: followUpReasoningContent || null,
        });
      } else if (followUpText && followUpText.trim()) {
        messages.push({
          role: 'assistant',
          content: followUpText,
        });
      }

      if (toolCalls.length === 0) {
        break;
      }
    }

    // 更新任务状态
    if (aiProcessingStore && taskId) {
      await aiProcessingStore.updateTask(taskId, {
        status: 'end',
        message: '助手回复完成',
      });
    }

    // 确保返回的文本不为空
    const finalText = finalResponseText.trim() || '抱歉，我没有收到有效的回复。请重试。';

    return {
      text: finalText,
      ...(taskId ? { taskId: taskId } : {}),
      actions: allActions,
      messageHistory: messages,
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
    const { onChunk, onAction, onToast, signal, aiProcessingStore, sessionId } = options;

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

    // 获取可用的工具（包括网络搜索工具，即使没有 bookId 也可以使用）
    const allTools = ToolRegistry.getAllTools(context.currentBookId || undefined);
    // 过滤掉翻译/润色/校对专用的工具（这些工具只在特定任务中可用，不在助手聊天中可用）
    const tools = allTools.filter((t) => t.function.name !== 'add_translation_batch');

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

      // 如果使用了历史消息，需要检查系统提示词是否已存在
      // 如果不存在或已更改，更新系统提示词
      const hasSystemMessage = messages.some((msg) => msg.role === 'system');
      if (hasSystemMessage) {
        // 更新系统提示词（如果已存在）
        const systemIndex = messages.findIndex((msg) => msg.role === 'system');
        if (systemIndex >= 0) {
          messages[systemIndex] = {
            role: 'system',
            content: systemPrompt,
          };
        }
      } else {
        // 如果没有系统消息，在开头添加
        messages.unshift({
          role: 'system',
          content: systemPrompt,
        });
      }

      // 添加用户消息
      messages.push({
        role: 'user',
        content: userMessage,
      });

      // 边界检查：检查用户消息长度
      if (model.maxTokens > 0 && model.maxTokens !== UNLIMITED_TOKENS) {
        const userMessageTokens = this.estimateTokenCount(
          [{ role: 'user', content: userMessage }],
          DEFAULT_TOKEN_ESTIMATION_MULTIPLIER,
        );
        if (userMessageTokens >= model.maxTokens * 0.8) {
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
      const estimatedTokens = this.estimateTokenCount(
        messages,
        DEFAULT_TOKEN_ESTIMATION_MULTIPLIER,
      );
      // const TOKEN_THRESHOLD_RATIO = 0.85; // 使用常量

      // 检查是否超过模型的最大上下文长度（contextWindow）
      // 如果模型有 contextWindow，需要确保 estimatedTokens + maxTokens <= contextWindow
      let effectiveMaxTokens = model.maxTokens;
      if (model.contextWindow && model.contextWindow > 0) {
        // 计算实际可用的 maxTokens（考虑消息占用的 token）
        const availableForCompletion = model.contextWindow - estimatedTokens;
        // 如果可用空间小于请求的 maxTokens，需要调整
        if (availableForCompletion < model.maxTokens) {
          if (availableForCompletion <= 0) {
            // 消息已经占满了整个上下文窗口，必须触发总结
            console.warn(
              `[AssistantService] 消息 token 数 (${estimatedTokens}) 已超过或等于模型上下文窗口 (${model.contextWindow})，必须触发总结`,
            );
            effectiveMaxTokens = 0; // 标记需要总结
          } else {
            // 调整 maxTokens 以适应上下文窗口
            console.warn(
              `[AssistantService] 调整 maxTokens 从 ${model.maxTokens} 到 ${availableForCompletion} 以适应上下文窗口`,
            );
            effectiveMaxTokens = Math.floor(availableForCompletion * 0.9); // 留 10% 缓冲
          }
        }
      }

      // 检查是否需要在请求前进行摘要
      // 如果 UI 层已经处理了摘要（skipTokenLimitSummarization = true），则跳过此检查
      const shouldSummarizeBeforeRequest =
        !options.skipTokenLimitSummarization &&
        ((model.maxTokens > 0 &&
          model.maxTokens !== UNLIMITED_TOKENS &&
          estimatedTokens >= model.maxTokens * TOKEN_THRESHOLD_RATIO) ||
          effectiveMaxTokens === 0); // 如果消息占满了上下文窗口，必须总结

      if (
        shouldSummarizeBeforeRequest &&
        options.messageHistory &&
        options.messageHistory.length > 2
      ) {
        // 需要总结并重置
        // 构建要总结的消息（排除系统消息和当前用户消息）
        const messagesToSummarize = options.messageHistory
          .filter((msg) => msg.role !== 'system')
          .slice(0, -1) // 排除最后一条（当前用户消息）
          .map((msg) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content || '',
          }));

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

          if (summaryResult) {
            return summaryResult;
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

      // 获取 AI 服务
      const aiService = AIServiceFactory.getService(model.provider);

      // 重新计算 estimatedTokens（可能在总结后消息已改变）
      let finalEstimatedTokens = this.estimateTokenCount(
        messages,
        DEFAULT_TOKEN_ESTIMATION_MULTIPLIER,
      );
      // 再次检查并调整 maxTokens（如果消息在总结后仍然很大）
      let finalMaxTokens = effectiveMaxTokens;
      if (model.contextWindow && model.contextWindow > 0) {
        const availableForCompletion = model.contextWindow - finalEstimatedTokens;
        if (availableForCompletion < effectiveMaxTokens) {
          if (availableForCompletion <= 0) {
            // 即使总结后仍然超过，使用降级策略：只保留最近的消息
            console.warn(
              `[AssistantService] 总结后消息仍然太大 (${finalEstimatedTokens} tokens)，使用降级策略：只保留最近的消息`,
            );

            // 计算需要保留多少 token 给完成（maxTokens）
            const requiredForCompletion = Math.min(
              model.maxTokens || 0,
              Math.floor(model.contextWindow * 0.5), // 最多保留 50% 给完成
            );
            const maxAllowedForMessages = model.contextWindow - requiredForCompletion;

            // 逐步减少消息数量，直到符合限制
            let reducedMessages = [...messages];
            let attemptCount = 0;
            const maxAttempts = 20;

            while (
              finalEstimatedTokens > maxAllowedForMessages &&
              attemptCount < maxAttempts &&
              reducedMessages.length > 2 // 至少保留系统提示词和用户消息
            ) {
              // 移除中间的消息，只保留系统提示词、最后几条消息和用户消息
              const systemMsg = reducedMessages[0];
              const userMsg = reducedMessages[reducedMessages.length - 1];

              // 确保 systemMsg 和 userMsg 存在
              if (!systemMsg || !userMsg) {
                break;
              }

              // 保留最近的消息（不包括系统提示词和用户消息）
              // 每次减少到原来的 50%
              const historyMessages = reducedMessages.slice(1, -1); // 排除系统提示词和用户消息
              const keepCount = Math.max(0, Math.floor(historyMessages.length * 0.5));
              const recentMessages = keepCount > 0 ? historyMessages.slice(-keepCount) : [];

              reducedMessages = [systemMsg, ...recentMessages, userMsg];
              finalEstimatedTokens = this.estimateTokenCount(
                reducedMessages,
                DEFAULT_TOKEN_ESTIMATION_MULTIPLIER,
              );
              attemptCount++;
            }

            if (finalEstimatedTokens > maxAllowedForMessages) {
              // 如果仍然太大，只保留系统提示词和用户消息
              const systemMsg = messages.find((m) => m.role === 'system');
              const userMsg = messages.find((m) => m.role === 'user' && m.content === userMessage);
              reducedMessages = [];
              if (systemMsg) {
                reducedMessages.push(systemMsg);
              } else {
                reducedMessages.push({ role: 'system', content: systemPrompt });
              }
              if (userMsg) {
                reducedMessages.push(userMsg);
              } else {
                reducedMessages.push({ role: 'user', content: userMessage });
              }
              finalEstimatedTokens = this.estimateTokenCount(
                reducedMessages,
                DEFAULT_TOKEN_ESTIMATION_MULTIPLIER,
              );
              console.warn(
                `[AssistantService] 消息历史已减少到最小：只保留系统提示词和用户消息 (${finalEstimatedTokens} tokens)`,
              );
            } else {
              console.warn(
                `[AssistantService] 消息历史已减少到 ${reducedMessages.length} 条消息 (${finalEstimatedTokens} tokens)`,
              );
            }

            messages.length = 0;
            messages.push(...reducedMessages);
            finalEstimatedTokens = this.estimateTokenCount(
              messages,
              DEFAULT_TOKEN_ESTIMATION_MULTIPLIER,
            );

            // 重新计算可用的 maxTokens
            const newAvailableForCompletion = model.contextWindow - finalEstimatedTokens;
            if (newAvailableForCompletion > 0) {
              finalMaxTokens = Math.floor(newAvailableForCompletion * 0.9); // 留 10% 缓冲
            } else {
              finalMaxTokens = Math.floor(model.contextWindow * 0.1); // 至少保留 10% 给完成
            }
          } else {
            finalMaxTokens = Math.floor(availableForCompletion * 0.9); // 留 10% 缓冲
          }
        }
      }

      // 构建配置
      const config: AIServiceConfig = {
        apiKey: model.apiKey,
        baseUrl: model.baseUrl,
        model: model.model, // 使用实际的模型名称，而不是内部 ID
        temperature: model.temperature ?? DEFAULT_TEMPERATURE,
        maxTokens: finalMaxTokens,
        signal: finalSignal,
      };

      // 构建请求
      const request: TextGenerationRequest = {
        messages,
        ...(tools.length > 0 ? { tools } : {}),
        temperature: model.temperature ?? DEFAULT_TEMPERATURE,
        maxTokens: finalMaxTokens,
      };

      // 流式生成响应
      let fullText = '';
      let toolCalls: AIToolCall[] = [];
      const allActions: ActionInfo[] = [];

      const result = await aiService.generateText(config, request, async (chunk) => {
        // 累积流式文本（只累积实际内容，不包括思考内容）
        if (chunk.text) {
          fullText += chunk.text;
        }
        if (chunk.toolCalls) {
          toolCalls.push(...chunk.toolCalls);
        }

        // 保存思考内容到思考过程面板
        if (aiProcessingStore && taskId && chunk.reasoningContent) {
          await aiProcessingStore.appendThinkingMessage(taskId, chunk.reasoningContent);
        }

        // 追加输出内容到任务
        if (aiProcessingStore && taskId && chunk.text) {
          await aiProcessingStore.appendOutputContent(taskId, chunk.text);
        }

        // 将思考内容传递到聊天界面（通过 onThinkingChunk 回调）
        if (options.onThinkingChunk && chunk.reasoningContent) {
          await options.onThinkingChunk(chunk.reasoningContent);
        }

        // 调用用户回调（只传递实际内容，不传递思考内容）
        if (onChunk) {
          // 创建一个只包含实际内容的 chunk，不包含思考内容
          const filteredChunk: TextGenerationChunk = {
            text: chunk.text || '',
            done: chunk.done,
            ...(chunk.model ? { model: chunk.model } : {}),
            ...(chunk.toolCalls ? { toolCalls: chunk.toolCalls } : {}),
            // 不传递 reasoningContent，这样思考内容就不会显示在聊天中
          };
          await onChunk(filteredChunk);
        }
      });

      // 使用 result.text 如果存在且不为空，否则使用累积的 fullText
      if (result.text && result.text.trim()) {
        fullText = result.text;
      }

      if (result.toolCalls) {
        toolCalls = result.toolCalls;
      }

      // 捕获 reasoning_content（DeepSeek 等模型在使用工具时返回）
      // 保存思考内容到思考过程面板
      const reasoningContent = result.reasoningContent;
      if (aiProcessingStore && taskId && reasoningContent) {
        await aiProcessingStore.appendThinkingMessage(taskId, reasoningContent);
      }
      // 将思考内容传递到聊天界面（通过 onThinkingChunk 回调）
      if (options.onThinkingChunk && reasoningContent) {
        await options.onThinkingChunk(reasoningContent);
      }

      // 只有在没有工具调用且没有文本时才警告
      if (!fullText.trim() && toolCalls.length === 0) {
        console.warn('[AssistantService] 警告：响应文本和工具调用都为空', {
          resultTextLength: result.text?.length || 0,
          accumulatedLength: fullText.length,
        });
      }

      // 处理工具调用 - 使用循环处理，像 translation-service.ts 一样
      let currentTurnCount = 0;
      // const MAX_TURNS = 50; // 使用常量 MAX_TOOL_CALL_TURNS
      let finalResponseText = fullText;

      // 将第一次响应添加到历史
      // OpenAI API 要求：如果有 tool_calls，content 可以是 null；如果没有 tool_calls，content 必须有内容
      // DeepSeek 要求：如果有 tool_calls，必须包含 reasoning_content 字段（即使为 null）
      if (toolCalls.length > 0) {
        // [兼容] Moonshot/Kimi 等 OpenAI 兼容服务可能不允许 assistant content 为空（即使有 tool_calls）
        messages.push({
          role: 'assistant',
          content: fullText && fullText.trim() ? fullText : '（调用工具）',
          tool_calls: toolCalls,
          reasoning_content: reasoningContent || null, // DeepSeek 要求此字段必须存在
        });
      } else if (fullText && fullText.trim()) {
        // 没有工具调用，但 content 有内容
        messages.push({
          role: 'assistant',
          content: fullText,
        });
      }

      // 工具调用循环
      while (toolCalls.length > 0 && currentTurnCount < MAX_TOOL_CALL_TURNS) {
        currentTurnCount++;

        // 执行工具调用
        const toolResults = await this.handleToolCalls(
          toolCalls,
          tools,
          context.currentBookId,
          (action) => {
            allActions.push(action);
            if (onAction) {
              onAction(action);
            }
          },
          onToast,
          taskId,
          sessionId,
          model.id,
        );

        // 将工具结果添加到历史
        messages.push(...toolResults);

        // 再次调用 AI 获取回复
        const followUpRequest: TextGenerationRequest = {
          messages,
          ...(tools.length > 0 ? { tools } : {}),
          temperature: model.temperature ?? DEFAULT_TEMPERATURE,
          maxTokens: model.maxTokens,
        };

        let followUpText = '';
        toolCalls = []; // 重置工具调用列表

        const followUpResult = await aiService.generateText(
          config,
          followUpRequest,
          async (chunk) => {
            if (chunk.text) {
              followUpText += chunk.text;
            }
            if (chunk.toolCalls) {
              toolCalls.push(...chunk.toolCalls);
            }

            // 保存思考内容到思考过程面板
            if (aiProcessingStore && taskId && chunk.reasoningContent) {
              await aiProcessingStore.appendThinkingMessage(taskId, chunk.reasoningContent);
            }

            // 将思考内容传递到聊天界面（通过 onThinkingChunk 回调）
            if (options.onThinkingChunk && chunk.reasoningContent) {
              await options.onThinkingChunk(chunk.reasoningContent);
            }

            // 调用用户回调（只传递实际内容，不传递思考内容）
            if (onChunk) {
              // 创建一个只包含实际内容的 chunk，不包含思考内容
              const filteredChunk: TextGenerationChunk = {
                text: chunk.text || '',
                done: chunk.done,
                ...(chunk.model ? { model: chunk.model } : {}),
                ...(chunk.toolCalls ? { toolCalls: chunk.toolCalls } : {}),
                // 不传递 reasoningContent，这样思考内容就不会显示在聊天中
              };
              await onChunk(filteredChunk);
            }
          },
        );

        // 使用 result.text 如果存在，否则使用累积的文本
        if (followUpResult.text && followUpResult.text.trim()) {
          followUpText = followUpResult.text;
        }

        if (followUpResult.toolCalls) {
          toolCalls = followUpResult.toolCalls;
        }

        // 捕获 reasoning_content（DeepSeek 等模型在使用工具时返回）
        // 保存思考内容到思考过程面板
        const followUpReasoningContent = followUpResult.reasoningContent;
        if (aiProcessingStore && taskId && followUpReasoningContent) {
          await aiProcessingStore.appendThinkingMessage(taskId, followUpReasoningContent);
        }
        // 将思考内容传递到聊天界面（通过 onThinkingChunk 回调）
        if (options.onThinkingChunk && followUpReasoningContent) {
          await options.onThinkingChunk(followUpReasoningContent);
        }

        // 更新最终响应文本（只有在有内容时才更新）
        if (followUpText && followUpText.trim()) {
          finalResponseText = followUpText;
        }

        // 将助手回复添加到历史
        // OpenAI API 要求：如果有 tool_calls，content 可以是 null；如果没有 tool_calls，content 必须有内容
        // DeepSeek 要求：如果有 tool_calls，必须包含 reasoning_content 字段（即使为 null）
        if (toolCalls.length > 0) {
          // 有工具调用，content 可以是 null
          messages.push({
            role: 'assistant',
            content: followUpText || null,
            tool_calls: toolCalls,
            reasoning_content: followUpReasoningContent || null, // DeepSeek 要求此字段必须存在
          });
        } else if (followUpText && followUpText.trim()) {
          // 没有工具调用，但 content 有内容
          messages.push({
            role: 'assistant',
            content: followUpText,
          });
        }

        // 如果没有工具调用，退出循环
        if (toolCalls.length === 0) {
          break;
        }
      }

      // 更新任务状态
      if (aiProcessingStore && taskId) {
        await aiProcessingStore.updateTask(taskId, {
          status: 'end',
          message: '助手回复完成',
        });
      }

      // 如果没有工具调用，将助手回复添加到历史（如果还没有添加）
      // 确保 content 不为空
      if (toolCalls.length === 0 && finalResponseText && finalResponseText.trim()) {
        // 检查是否已经添加了相同的消息
        const lastAssistantMsg = messages.filter((msg) => msg.role === 'assistant').pop();
        if (!lastAssistantMsg || lastAssistantMsg.content !== finalResponseText) {
          messages.push({
            role: 'assistant',
            content: finalResponseText,
          });
        }
      }

      // 注意：任务状态已在循环退出后更新（第 766-772 行），此处不再重复更新

      // 确保返回的文本不为空
      const finalText = finalResponseText.trim() || '抱歉，我没有收到有效的回复。请重试。';

      if (!finalResponseText.trim()) {
        console.error('[AssistantService] ❌ 错误：最终回复文本为空', {
          currentTurnCount,
        });
      }

      return {
        text: finalText,
        ...(taskId ? { taskId: taskId } : {}),
        actions: allActions,
        messageHistory: messages,
      };
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
      const hasPositiveMaxTokensLimit = model.maxTokens > 0 && model.maxTokens !== UNLIMITED_TOKENS;
      const hasContextWindowLimit =
        typeof model.contextWindow === 'number' && model.contextWindow > 0;

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

          const messagesToSummarize = options.messageHistory
            .filter((msg) => msg.role !== 'system')
            .map((msg) => ({
              role: msg.role as 'user' | 'assistant',
              content: msg.content || '',
            }));

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

            if (summaryResult) {
              return summaryResult;
            }

            console.warn('[AssistantService] 摘要失败，使用降级策略：只保留最近 5 条消息');
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

            return await this.retryRequestAfterSummary(
              model,
              retryMessages,
              tools,
              context.currentBookId,
              options,
              taskId,
              sessionId,
              finalSignal,
            );
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
