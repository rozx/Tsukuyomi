import { agentText, translateText } from 'src/i18n/translate';
import type { AppLocale } from 'src/models/locale';
import { buildModelServiceConfig } from '../core/model-config';
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
import { AIServiceFactory } from '../ai-service-factory';
import { ToolRegistry } from '../tools/tool-registry';
import type { ActionInfo } from '../tools/types';
import type { ToastCallback } from '../tools/toast-helper';
import type { AIProcessingStore } from './utils/task-types';
import { useContextStore } from 'src/stores/context';
import { useSettingsStore } from 'src/stores/settings';
import { useBooksStore } from 'src/stores/books';
import type { ExecutionLanguages } from 'src/models/locale';
import { captureExecutionLanguages } from './utils/execution-languages';
import { getTodosSystemPrompt } from './utils/todo-helper';
import { TOOL_CALL_PLACEHOLDER } from './utils/stream-handler';
import { AssistantExecutionPaused } from './utils/assistant-execution';
import { runAssistantBookExecution } from './utils/assistant-book-execution';
import type {
  AssistantExecution,
  AssistantExecutionCheckpoint,
  AssistantPauseReason,
} from './utils/assistant-execution';
import { getAssistantSystemPrompt } from './prompts';
import { resolveModelLimits } from '../model-limits/resolve';
import type { EffectiveModelLimits } from '../model-limits/resolve';
import type { ContextAnchor } from '../context/measure';
import { AssistantContext } from '../context/assistant-context';
import { isCancelledError } from 'src/utils/is-cancelled-error';
import { describeAIError } from '../core/errors';

const MAX_TOOL_CALL_TURNS = 50;
const DEFAULT_TEMPERATURE = 0.7;
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
  'search_memories',
  'create_memory',
  'update_memory',
  'delete_memory',
  'navigate_to_chapter',
  'navigate_to_paragraph',
];

export interface AssistantServiceOptions {
  languages?: ExecutionLanguages;
  /** 宿主专属执行配置；省略时保持普通聊天的上下文和工具行为。 */
  execution?: AssistantExecution;
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
  aiProcessingStore?: AIProcessingStore;
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
  onSummarizingStart?: () => void | Promise<void>;
  /**
   * 摘要结束时的回调（用于在 UI 中恢复接收 chunk）
   */
  onSummarizingEnd?: () => void | Promise<void>;
  /**
   * 聊天会话 ID（可选），如果提供，待办事项将关联到此会话而不是任务
   */
  sessionId?: string;
  contextAnchor?: ContextAnchor;
  /**
   * 任务创建时的回调（可选），用于获取任务 ID
   */
  onTaskCreated?: (taskId: string) => void;
}

/** chat() 解析后的内部选项：执行语言已固定，内部步骤不再回退默认语言。 */
export type ResolvedAssistantOptions = AssistantServiceOptions & { languages: ExecutionLanguages };

export interface AssistantResult {
  paused?: AssistantPauseReason;
  checkpoint?: AssistantExecutionCheckpoint;
  text: string;
  taskId?: string;
  actions?: ActionInfo[];
  messageHistory?: ChatMessage[];
  summary?: string | undefined;
  contextAnchor?: ContextAnchor | undefined;
}

export class AssistantService {
  private static buildSystemPrompt(
    context: {
      currentBookId: string | null;
      currentChapterId: string | null;
      selectedParagraphId: string | null;
    },
    tools: AITool[],
    taskId: string | undefined,
    sessionId: string | undefined,
    languages: ExecutionLanguages,
  ): string {
    const todosPrompt = getTodosSystemPrompt(!!taskId || !!sessionId);

    return getAssistantSystemPrompt(todosPrompt, tools, context, languages);
  }

  private static async handleToolCalls(
    toolCalls: AIToolCall[],
    tools: AITool[],
    bookId: string | null,
    onAction: ((action: ActionInfo) => void) | undefined,
    onToast: ToastCallback | undefined,
    taskId: string | undefined,
    sessionId: string | undefined,
    aiModelId: string | undefined,
    signal: AbortSignal | undefined,
    languages: ExecutionLanguages,
  ): Promise<Array<{ tool_call_id: string; role: 'tool'; name: string; content: string }>> {
    const allowedToolNames = new Set(tools.map((t) => t.function.name));

    // 定义需要 bookId 的工具列表
    const toolsRequiringBookId = TOOLS_REQUIRING_BOOK_ID;

    const results = [];
    for (const toolCall of toolCalls) {
      // 用户取消后立即停止执行剩余工具，避免已取消的 CRUD 写入继续落库
      this.ensureRequestActive(signal, languages.uiLocale);

      // [警告] 严格限制：只能调用本次会话提供的 tools
      if (!allowedToolNames.has(toolCall.function.name)) {
        results.push({
          tool_call_id: toolCall.id,
          role: 'tool' as const,
          name: toolCall.function.name,
          content: JSON.stringify({
            success: false,
            error_code: 'TOOL_NOT_ALLOWED',
            error: agentText('aiAssistant.toolNotAllowed', {
              tool: toolCall.function.name,
            }),
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
            error_code: 'BOOK_CONTEXT_REQUIRED',
            error: agentText('aiAssistant.bookRequired'),
          }),
        });
        continue;
      }

      // 调用工具处理函数（对于不需要 bookId 的工具，可以传递空字符串）
      const result = await ToolRegistry.handleToolCall(toolCall, {
        languages,
        bookId: bookId || '',
        ...(onAction ? { onAction } : {}),
        ...(onToast ? { onToast } : {}),
        ...(taskId ? { taskId } : {}),
        ...(sessionId ? { sessionId } : {}),
        ...(aiModelId ? { aiModelId } : {}),
      });
      results.push(result);
    }
    return results;
  }

  // ─── 重构提取的辅助方法 ─────────────────────────────────

  private static buildAIConfig(
    model: AIModel,
    overrides?: {
      signal?: AbortSignal | undefined;
      temperature?: number | undefined;
      maxOutputTokens?: number | undefined;
    },
  ): AIServiceConfig {
    return buildModelServiceConfig(model, {
      temperature: overrides?.temperature ?? model.temperature ?? DEFAULT_TEMPERATURE,
      maxOutputTokens: overrides?.maxOutputTokens,
      signal: overrides?.signal,
    });
  }

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
      await this.forwardReasoningToTask(aiProcessingStore, taskId, chunk.reasoningContent);

      // 追加输出内容到任务面板（仅初始请求）
      await this.forwardOutputToTask(aiProcessingStore, taskId, appendOutput, chunk.text);

      // 将思考内容传递到聊天界面
      await this.forwardReasoningToUI(onThinkingChunk, chunk.reasoningContent);

      // 调用用户回调（过滤掉思考内容）
      await this.forwardUserChunk(onChunk, chunk);
    };
  }

  private static async forwardReasoningToTask(
    aiProcessingStore: AssistantServiceOptions['aiProcessingStore'] | undefined,
    taskId: string | undefined,
    reasoningContent: string | undefined,
  ): Promise<void> {
    if (aiProcessingStore && taskId && reasoningContent) {
      await aiProcessingStore.appendThinkingMessage(taskId, reasoningContent);
    }
  }

  private static async forwardOutputToTask(
    aiProcessingStore: AssistantServiceOptions['aiProcessingStore'] | undefined,
    taskId: string | undefined,
    appendOutput: boolean | undefined,
    text: string | undefined,
  ): Promise<void> {
    if (appendOutput && aiProcessingStore && taskId && text) {
      await aiProcessingStore.appendOutputContent(taskId, text);
    }
  }

  private static async forwardReasoningToUI(
    onThinkingChunk: ((text: string) => void | Promise<void>) | undefined,
    reasoningContent: string | undefined,
  ): Promise<void> {
    if (onThinkingChunk && reasoningContent) {
      await onThinkingChunk(reasoningContent);
    }
  }

  private static buildFilteredUserChunk(chunk: TextGenerationChunk): TextGenerationChunk {
    return {
      text: chunk.text || '',
      done: chunk.done,
      ...(chunk.model ? { model: chunk.model } : {}),
      ...(chunk.toolCalls ? { toolCalls: chunk.toolCalls } : {}),
    };
  }

  private static async forwardUserChunk(
    onChunk: TextGenerationStreamCallback | undefined,
    chunk: TextGenerationChunk,
  ): Promise<void> {
    if (!onChunk) return;
    await onChunk(this.buildFilteredUserChunk(chunk));
  }

  private static async processGenerateTextResult(params: {
    result: { text: string; toolCalls?: AIToolCall[]; reasoningContent?: string };
    accumulatedText: string;
    accumulatedToolCalls: AIToolCall[];
    streamedReasoning?: string;
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

    const rest =
      params.streamedReasoning && reasoningContent?.startsWith(params.streamedReasoning)
        ? reasoningContent.slice(params.streamedReasoning.length)
        : reasoningContent;
    if (aiProcessingStore && taskId && rest)
      await aiProcessingStore.appendThinkingMessage(taskId, rest);
    if (onThinkingChunk && rest) await onThinkingChunk(rest);

    return { text: finalText, toolCalls: finalToolCalls, reasoningContent };
  }

  private static pushAssistantMessage(
    messages: ChatMessage[],
    text: string,
    toolCalls: AIToolCall[],
    reasoningContent: string | undefined,
  ): void {
    if (toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: text && text.trim() ? text : TOOL_CALL_PLACEHOLDER,
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

  private static fillPendingToolCallResults(
    messages: ChatMessage[],
    pendingToolCalls: AIToolCall[],
  ): void {
    if (pendingToolCalls.length === 0) return;
    messages.push(
      ...pendingToolCalls.map((call) => ({
        role: 'tool' as const,
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify({
          success: false,
          error_code: 'TOOL_TURN_LIMIT',
          error: agentText('aiAssistant.toolLimit'),
        }),
      })),
    );
  }

  private static async finishToolLoop(
    messages: ChatMessage[],
    calls: AIToolCall[],
    execution?: AssistantExecution,
  ): Promise<void> {
    if (execution && calls.length) throw await execution.stop('tool_limit');
    this.fillPendingToolCallResults(messages, calls);
  }

  private static ensureRequestActive(signal?: AbortSignal, uiLocale: AppLocale = 'zh-CN'): void {
    if (signal?.aborted) {
      const error = new Error(translateText(uiLocale, 'aiAssistant.cancelRequest'));
      error.name = 'AbortError';
      throw error;
    }
  }

  /**
   * 工具循环中的摘要兜底：当累积的 messages 超过 IN_LOOP_SUMMARIZE_THRESHOLD 时，
   * 用 requestSummaryReset 生成整段会话摘要，替换掉中间所有工具调用/结果，
   * 然后以 [system+summary, user] 重发起初始请求，拿到新一轮 toolCalls 供循环继续。
   *
   * 返回 null 表示无需（或无法）摘要，调用方继续正常的 followUp 请求。
   */

  private static async prepareTaskAndSignal(
    model: AIModel,
    options: ResolvedAssistantOptions,
  ): Promise<{ taskId: string | undefined; taskAbortSignal: AbortSignal | undefined }> {
    const { aiProcessingStore } = options;
    if (!aiProcessingStore) {
      return { taskId: undefined, taskAbortSignal: undefined };
    }

    const taskId = await aiProcessingStore.addTask({
      type: 'assistant',
      modelName: model.name || model.id,
      status: 'processing',
      message: translateText(options.languages.uiLocale, 'aiAssistant.processing'),
    });

    // 通知外部任务已创建
    if (options.onTaskCreated) {
      options.onTaskCreated(taskId);
    }

    // 从 store 中查找任务，取 abortController.signal（用于停止按钮）
    const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
    const taskAbortSignal = task?.abortController?.signal;

    return { taskId, taskAbortSignal };
  }

  private static composeSystemPrompt(
    context: ReturnType<typeof useContextStore>['getContext'],
    tools: AITool[],
    taskId: string | undefined,
    sessionId: string | undefined,
    sessionSummary: string | undefined,
    languages: ExecutionLanguages,
  ): string {
    let systemPrompt = this.buildSystemPrompt(context, tools, taskId, sessionId, languages);
    if (sessionSummary) {
      systemPrompt +=
        '\n\n' +
        agentText('aiAssistant.summaryWrap', {
          summary: sessionSummary,
        });
    }
    return systemPrompt;
  }

  private static buildInitialMessages(
    messageHistory: ChatMessage[] | undefined,
    systemPrompt: string,
    userMessage: string,
  ): ChatMessage[] {
    const messages: ChatMessage[] = messageHistory
      ? [...messageHistory]
      : [{ role: 'system', content: systemPrompt }];

    const systemIndex = messages.findIndex((msg) => msg.role === 'system');
    if (systemIndex >= 0) {
      messages[systemIndex] = { role: 'system', content: systemPrompt };
    } else {
      messages.unshift({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: userMessage });
    return messages;
  }

  private static logChatError(error: unknown, model: AIModel, taskId: string | undefined): void {
    const errorMessage =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown error';
    console.error('[AssistantService] ❌ 发生错误', {
      error: errorMessage,
      ...(import.meta.env.DEV && {
        errorStack: error instanceof Error ? error.stack : undefined,
      }),
      model: model.model,
      provider: model.provider,
      taskId,
    });
  }

  private static async finalizeErrorTask(
    error: unknown,
    aiProcessingStore: AssistantServiceOptions['aiProcessingStore'] | undefined,
    taskId: string | undefined,
    uiLocale: AppLocale,
  ): Promise<void> {
    if (!aiProcessingStore || !taskId) return;

    const isCancelled = isCancelledError(error);

    if (isCancelled) {
      await aiProcessingStore.updateTask(taskId, {
        status: 'cancelled',
        message: translateText(uiLocale, 'aiAssistant.cancelled'),
      });
    } else {
      await aiProcessingStore.updateTask(taskId, {
        status: 'error',
        message: describeAIError(
          error,
          uiLocale,
          translateText(uiLocale, 'aiAssistant.unknownError'),
        ),
      });
    }
  }

  private static async executeAIRequest(params: {
    model: AIModel;
    limits: EffectiveModelLimits;
    messages: ChatMessage[];
    tools: AITool[];
    context: AssistantContext;
    options: ResolvedAssistantOptions;
    taskId: string | undefined;
    signal: AbortSignal | undefined;
    initial: boolean;
  }) {
    const { model, limits, messages, tools, context, options, taskId, signal, initial } = params;
    const config = this.buildAIConfig(model, { signal, maxOutputTokens: limits.maxOutput ?? 0 });
    config.maxInputTokens = limits.contextWindow;
    const service = AIServiceFactory.getService(model.provider);
    let text = '';
    let calls: AIToolCall[] = [];
    let streamedReasoning = '';
    const stream = this.createAssistantStreamHandler({
      onTextAccumulate: (chunk) => {
        text += chunk;
      },
      onToolCallsAccumulate: (chunk) => {
        calls.push(...chunk);
      },
      aiProcessingStore: options.aiProcessingStore,
      taskId,
      onChunk: options.onChunk,
      onThinkingChunk: options.onThinkingChunk,
      appendOutput: initial,
    });
    const result = await context.generate(() => {
      text = '';
      calls = [];
      streamedReasoning = '';
      return service.generateText(
        config,
        this.buildTextRequest(messages, tools, {
          temperature: model.temperature,
          maxOutputTokens: limits.maxOutput,
        }),
        async (chunk) => {
          streamedReasoning += chunk.reasoningContent ?? '';
          await stream(chunk);
        },
      );
    });
    const processed = await this.processGenerateTextResult({
      result,
      accumulatedText: text,
      accumulatedToolCalls: calls,
      aiProcessingStore: options.aiProcessingStore,
      taskId,
      onThinkingChunk: options.onThinkingChunk,
      streamedReasoning,
    });
    if (options.execution)
      processed.toolCalls = options.execution.normalizeCalls(processed.toolCalls);
    this.pushAssistantMessage(
      messages,
      processed.text,
      processed.toolCalls,
      processed.reasoningContent,
    );
    await options.execution?.recordReply(messages, processed.toolCalls);
    return processed;
  }

  private static async executeFullRequest(params: {
    model: AIModel;
    limits: EffectiveModelLimits;
    messages: ChatMessage[];
    tools: AITool[];
    bookId: string | null;
    options: ResolvedAssistantOptions;
    context: AssistantContext;
    taskId: string | undefined;
    sessionId: string | undefined;
    signal: AbortSignal | undefined;
  }): Promise<AssistantResult> {
    const { model, messages, tools, options, context, taskId, sessionId, signal, bookId } = params;
    const pending = options.execution?.pendingCalls;
    let response = pending?.length
      ? { text: '', toolCalls: pending }
      : await this.executeAIRequest({ ...params, initial: true });
    let finalText = response.text;
    const actions: ActionInfo[] = [];
    const turnLimit = options.execution?.maxToolTurns ?? MAX_TOOL_CALL_TURNS;
    for (let turn = 0; response.toolCalls.length && turn < turnLimit; turn++) {
      this.ensureRequestActive(signal, options.languages.uiLocale);
      if (options.execution) await options.execution.runTools(response.toolCalls, messages, signal);
      else
        messages.push(
          ...(await this.handleToolCalls(
            response.toolCalls,
            tools,
            bookId,
            (action) => {
              actions.push(action);
              options.onAction?.(action);
            },
            options.onToast,
            taskId,
            sessionId,
            model.id,
            signal,
            options.languages,
          )),
        );
      response = await this.executeAIRequest({ ...params, initial: false });
      if (response.text.trim()) finalText = response.text;
    }
    await this.finishToolLoop(messages, response.toolCalls, options.execution);
    await options.execution?.complete(messages);
    if (options.aiProcessingStore && taskId)
      await options.aiProcessingStore.updateTask(taskId, {
        status: 'end',
        message: translateText(options.languages.uiLocale, 'aiAssistant.finished'),
      });
    return {
      text: finalText.trim() || translateText(options.languages.uiLocale, 'aiAssistant.emptyReply'),
      ...(taskId ? { taskId } : {}),
      actions,
      messageHistory: messages,
      ...context.result,
    };
  }

  /**
   * 新助手执行的语言快照：当前界面语言 + 当前书籍目标语言（无书籍时以界面语言为目标）。
   * 上下文用量统计也以此构建提示词，保证统计与真实请求一致。
   */
  static currentLanguages(bookId: string | null): ExecutionLanguages {
    const uiLocale = useSettingsStore().uiLocale;
    return captureExecutionLanguages(
      uiLocale,
      bookId ? (useBooksStore().getBookById(bookId)?.targetLanguage ?? 'zh-CN') : uiLocale,
    );
  }

  static async chat(
    model: AIModel,
    userMessage: string,
    options: AssistantServiceOptions = {},
  ): Promise<AssistantResult> {
    const context = options.execution?.context ?? useContextStore().getContext;
    const requested =
      options.execution?.languages ??
      options.languages ??
      this.currentLanguages(context.currentBookId);
    const languages = captureExecutionLanguages(requested.uiLocale, requested.targetLanguage);
    const tools =
      options.execution?.tools ??
      ToolRegistry.getAssistantToolsExcludingTranslationManagement(
        context.currentBookId || undefined,
      );
    const history = options.messageHistory ?? options.execution?.history;
    const configured = {
      ...options,
      languages,
      ...(history?.length ? { messageHistory: history } : {}),
    };
    const run = () => this.chatWithContext(model, userMessage, configured, context, tools);
    return options.execution
      ? run()
      : runAssistantBookExecution(context, tools, run, options.sessionId);
  }

  private static async chatWithContext(
    model: AIModel,
    userMessage: string,
    options: ResolvedAssistantOptions,
    bookContext: ReturnType<typeof useContextStore>['getContext'],
    tools: AITool[],
  ): Promise<AssistantResult> {
    const { taskId, taskAbortSignal } = await this.prepareTaskAndSignal(model, options);
    const signal = options.signal || taskAbortSignal;
    const prompt = (summary?: string) =>
      this.composeSystemPrompt(
        bookContext,
        tools,
        taskId,
        options.sessionId,
        summary,
        options.languages,
      );
    try {
      const systemPrompt = options.execution
        ? await options.execution.prompt()
        : prompt(options.sessionSummary);
      const messages = options.execution
        ? options.execution.initializeMessages(systemPrompt, userMessage, options.messageHistory)
        : this.buildInitialMessages(options.messageHistory, systemPrompt, userMessage);
      await options.execution?.begin(messages);
      const limits = await resolveModelLimits(model);
      const context = new AssistantContext({
        model,
        limits,
        messages,
        tools,
        options,
        taskId,
        signal,
        prompt,
      });
      return await this.executeFullRequest({
        model,
        limits,
        messages,
        tools,
        bookId: bookContext.currentBookId,
        options,
        context,
        taskId,
        sessionId: options.sessionId,
        signal,
      });
    } catch (error) {
      const paused =
        error instanceof AssistantExecutionPaused
          ? error
          : options.execution && signal?.aborted
            ? await options.execution.stop('user')
            : undefined;
      if (paused)
        return {
          text: '',
          paused: paused.reason,
          checkpoint: paused.checkpoint,
          messageHistory: paused.checkpoint.messages,
          contextAnchor: paused.checkpoint.contextAnchor,
        };
      this.logChatError(error, model, taskId);
      await this.finalizeErrorTask(
        error,
        options.aiProcessingStore,
        taskId,
        options.languages.uiLocale,
      );
      throw error;
    }
  }
}
