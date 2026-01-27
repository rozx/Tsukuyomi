import { detectRepeatingCharacters } from 'src/services/ai/degradation-detector';
import {
  getCurrentStatusInfo,
  getStreamErrorPrompt,
  getInvalidTransitionPrompt,
  getPlanningLoopPrompt,
  getWorkingLoopPrompt,
  getWorkingFinishedPrompt,
  getWorkingContinuePrompt,
  getMissingParagraphsPrompt,
  getReviewLoopPrompt,
  getParseErrorPrompt,
  getContentStateMismatchPrompt,
  getUnauthorizedToolPrompt,
  getToolLimitReachedPrompt,
  getBriefPlanningToolWarningPrompt,
} from '../prompts';
import { ToolRegistry } from 'src/services/ai/tools/index';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import {
  getStatusLabel,
  getValidTransitionsForTaskType,
  TASK_TYPE_LABELS,
  type TaskStatus,
  type TaskType,
  type AIProcessingStore,
} from './task-types';
import type {
  TextGenerationRequest,
  TextGenerationStreamCallback,
  AITool,
  ChatMessage,
  AIServiceConfig,
  AIToolCall,
} from 'src/services/ai/types/ai-service';
import {
  createStreamCallback,
  createUnifiedAbortController,
  type StreamCallbackConfig,
} from './stream-handler';
import {
  parseStatusResponse,
  verifyParagraphCompleteness,
  type VerificationResult,
  type ParsedResponse,
} from './response-parser';
import {
  detectPlanningContextUpdate,
  PRODUCTIVE_TOOLS,
  TOOL_CALL_LIMITS,
  type PlanningContextUpdate,
} from './productivity-monitor';
import { type PerformanceMetrics } from './tool-executor';
import { buildPostOutputPrompt } from './context-builder';

// Constants
const MAX_CONSECUTIVE_STATUS = 2;
const MAX_CONSECUTIVE_CONTENT_STATE_MISMATCH = 2;

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
  /**
   * 段落翻译提取回调：每当从 AI 响应中提取到段落翻译时立即调用
   * 用于实时更新 UI，不等待整个循环完成
   */
  onParagraphsExtracted?:
    | ((paragraphs: { id: string; translation: string }[]) => void | Promise<void>)
    | undefined;
  /**
   * 标题翻译提取回调：每当从 AI 响应中提取到标题翻译时立即调用
   */
  onTitleExtracted?: ((title: string) => void | Promise<void>) | undefined;
  /**
   * 是否为简短规划模式（用于后续 chunk，已继承前一个 chunk 的规划上下文）
   * 当为 true 时，AI 会收到简化的规划指令，无需重复获取术语/角色信息
   */
  isBriefPlanning?: boolean;
  /**
   * 收集的 actions（用于检测规划上下文更新）
   */
  collectedActions?: ActionInfo[];
  /**
   * 当前 chunk 索引（用于错误日志）
   */
  chunkIndex?: number;
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
  /**
   * 规划阶段的摘要信息（用于在多个 chunk 之间共享上下文）
   * 包含 AI 在规划阶段的决策、获取的术语/角色信息等
   */
  planningSummary?: string | undefined;
  /**
   * 规划上下文更新信息（用于后续 chunk 更新共享上下文）
   */
  planningContextUpdate?: PlanningContextUpdate | undefined;
  /**
   * 性能指标
   */
  metrics?: PerformanceMetrics | undefined;
}

/**
 * Execute tool call loop using the functionality encapsulated in TaskLoopSession.
 */
export async function executeToolCallLoop(config: ToolCallLoopConfig): Promise<ToolCallLoopResult> {
  const session = new TaskLoopSession(config);
  return session.run();
}

/**
 * Class encapsulating the state and logic for a single task loop execution.
 */
class TaskLoopSession {
  // State
  private currentTurnCount = 0;
  private currentStatus: TaskStatus = 'planning';
  private accumulatedParagraphs = new Map<string, string>();
  private titleTranslation: string | undefined;
  private finalResponseText: string | null = null;
  private planningSummary: string | undefined;
  private planningResponses: string[] = [];
  private planningToolResults: { tool: string; result: string }[] = [];
  private startTime: number;
  private statusStartTime: number;

  // Counters
  private consecutivePlanningCount = 0;
  private consecutiveWorkingCount = 0;
  private consecutiveReviewCount = 0;
  private consecutiveContentStateMismatchCount = 0;
  private toolCallCounts = new Map<string, number>();

  // Config & Helpers
  private allowedToolNames: Set<string>;
  private taskLabel: string;
  private metrics: PerformanceMetrics;

  constructor(private config: ToolCallLoopConfig) {
    this.allowedToolNames = new Set(config.tools.map((t) => t.function.name));
    this.taskLabel = TASK_TYPE_LABELS[config.taskType];
    this.startTime = Date.now();
    this.statusStartTime = Date.now();
    this.metrics = {
      totalTime: 0,
      planningTime: 0,
      workingTime: 0,
      reviewTime: 0,
      toolCallTime: 0,
      toolCallCount: 0,
      averageToolCallTime: 0,
      chunkProcessingTime: [],
    };
  }

  public async run(): Promise<ToolCallLoopResult> {
    const { maxTurns = Infinity } = this.config;

    while (maxTurns === Infinity || this.currentTurnCount < maxTurns) {
      if (this.currentStatus === 'end') break;

      this.currentTurnCount++;
      const result = await this.executeTurn();

      if (result.shouldContinue) {
        continue;
      }
      if (result.shouldBreak) {
        break;
      }
    }

    this.checkMaxTurns();
    this.finalizeMetrics();

    return this.buildResult();
  }

  private async executeTurn(): Promise<{ shouldContinue: boolean; shouldBreak?: boolean }> {
    const { history, tools, aiServiceConfig, taskId, aiProcessingStore, logLabel, chunkText } =
      this.config;

    const request: TextGenerationRequest = {
      messages: history,
      ...(tools.length > 0 ? { tools } : {}),
    };

    let streamedText = '';
    const { controller: streamAbortController, cleanup: cleanupAbort } =
      createUnifiedAbortController(aiServiceConfig.signal);

    // Create stream callback
    const wrappedStreamCallback = this.createWrappedStreamCallback(
      streamAbortController,
      (text) => (streamedText += text),
    );

    let result;
    try {
      result = await this.config.generateText(
        { ...aiServiceConfig, signal: streamAbortController.signal },
        request,
        wrappedStreamCallback,
      );
    } catch (error) {
      return this.handleGenerationError(error, streamedText);
    } finally {
      cleanupAbort();
    }

    // Save reasoning
    if (aiProcessingStore && taskId && result.reasoningContent) {
      void aiProcessingStore.appendThinkingMessage(taskId, result.reasoningContent);
    }

    // Handle tool calls
    if (result.toolCalls && result.toolCalls.length > 0) {
      await this.processToolCalls(result, result.text);
      return { shouldContinue: true };
    }

    // Process text response
    const responseText = result.text || '';
    this.finalResponseText = responseText;

    if (detectRepeatingCharacters(responseText, chunkText, { logLabel })) {
      throw new Error(
        `AI降级检测：最终响应中检测到重复字符（chunkIndex: ${this.config.chunkIndex ?? 'unknown'}）`,
      );
    }

    const parsed = parseStatusResponse(responseText, this.config.paragraphIds);

    if (parsed.error) {
      this.handleParseError(parsed.error, responseText);
      return { shouldContinue: true };
    }

    // Handle mismatch between status and content
    if (this.hasStatusContentMismatch(parsed)) {
      this.handleContentStateMismatch(parsed.status, responseText);
      return { shouldContinue: true };
    }
    this.consecutiveContentStateMismatchCount = 0;

    // Determine new status and potential transitions
    const newStatus = this.determineNewStatus(parsed);
    const previousStatus = this.currentStatus;

    // Validate transition
    if (!this.isValidTransition(previousStatus, newStatus)) {
      this.handleInvalidTransition(previousStatus, newStatus, responseText);
      return { shouldContinue: true };
    }

    this.trackStatusDuration(previousStatus, newStatus);
    this.extractPlanningSummaryIfNeeded(previousStatus, newStatus, responseText);

    // Update status
    this.currentStatus = newStatus;

    // Extract content (Title / Paragraphs)
    await this.extractContent(parsed);

    // Add assistant response to history
    history.push({ role: 'assistant', content: responseText });

    // Handle specific state logic (prompts/loops)
    return this.handleStateLogic();
  }

  private createWrappedStreamCallback(
    abortController: AbortController,
    onText: (text: string) => void,
  ): TextGenerationStreamCallback {
    const streamCallbackConfig: StreamCallbackConfig = {
      taskId: this.config.taskId,
      aiProcessingStore: this.config.aiProcessingStore,
      originalText: this.config.chunkText,
      logLabel: this.config.logLabel,
      currentStatus: this.currentStatus,
      taskType: this.config.taskType,
      abortController: abortController,
    };
    const baseCallback = createStreamCallback(streamCallbackConfig);

    return async (chunk) => {
      if (chunk.text) onText(chunk.text);
      return baseCallback(chunk);
    };
  }

  /**
   * 处理生成过程中的错误（特别是流式状态检测抛出的错误）
   */
  private handleGenerationError(error: unknown, streamedText: string): { shouldContinue: boolean } {
    const { logLabel } = this.config;
    if (
      error instanceof Error &&
      (error.message.includes('无效状态') ||
        error.message.includes('状态转换错误') ||
        error.message.includes('状态与内容不匹配'))
    ) {
      console.warn(`[${logLabel}] ⚠️ 流式输出中检测到无效状态，已停止输出`);
      const partialResponse = streamedText || '';
      const warningMessage = getStreamErrorPrompt(
        error.message,
        this.config.taskType,
        this.currentStatus,
      );

      if (partialResponse.trim()) {
        this.config.history.push({ role: 'assistant', content: partialResponse });
      }
      this.config.history.push({
        role: 'user',
        content: `${this.getCurrentStatusInfoMsg()}\n\n${warningMessage}`,
      });
      return { shouldContinue: true };
    }
    throw error;
  }

  /**
   * 处理工具调用逻辑
   */
  private async processToolCalls(
    result: { toolCalls?: AIToolCall[]; reasoningContent?: string; text: string },
    assistantText: string,
  ) {
    const { history, aiProcessingStore, taskId, bookId, handleAction, onToast } = this.config;

    // DeepSeek 要求：如果有 tool_calls，必须包含 reasoning_content
    history.push({
      role: 'assistant',
      content: assistantText && assistantText.trim() ? assistantText : '（调用工具）',
      ...(result.toolCalls ? { tool_calls: result.toolCalls } : {}),
      reasoning_content: result.reasoningContent || null,
    });

    let hasProductiveTool = false;

    if (!result.toolCalls) return;

    for (const toolCall of result.toolCalls) {
      const toolName = toolCall.function.name;

      // 1. 验证工具是否允许
      if (!this.allowedToolNames.has(toolName)) {
        this.handleUnauthorizedTool(toolCall);
        continue;
      }

      // 2. 检查调用限制
      if (this.isToolLimitReached(toolName)) {
        this.handleToolLimitReached(toolCall);
        continue;
      }

      // 3. 执行工具
      this.updateToolCounters(toolName);
      if (PRODUCTIVE_TOOLS.includes(toolName)) hasProductiveTool = true;

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.appendThinkingMessage(taskId, `\n[调用工具: ${toolName}]\n`);
      }

      const start = Date.now();
      const toolResult = await ToolRegistry.handleToolCall(
        toolCall,
        bookId,
        handleAction,
        onToast,
        taskId,
      );
      this.metrics.toolCallTime += Date.now() - start;
      this.metrics.toolCallCount++;

      const toolResultContent = toolResult.content;

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.appendThinkingMessage(
          taskId,
          `[工具结果: ${toolResultContent.slice(0, 100)}...]\n`,
        );
      }

      // 4. 收集规划阶段信息
      this.collectPlanningInfo(toolName, toolResultContent, toolCall);

      // Warning mechanism for repeating calls (handled inside collectPlanningInfo via continue if brief planning)
      // If brief planning warning triggered, history.push handles it.

      // 如果没有在 collectPlanningInfo 中特殊处理(例如发出警告)，则正常记录
      // 注意：BriefPlanning 的警告逻辑比较特殊，这里为了简化，我们在 collectPlanningInfo 内部判断
      // 如果 collectPlanningInfo 认为不需要额外 push tool result (例如改为警告 push)，它会返回 true
      // 但为了代码简单，我们保留原来的逻辑: BriefPlanning 警告也是一个 Tool Role 消息。
      // 为防止重复 push, 我们检查 history 尾部是否已经是该 tool_call_id
      const lastMsg = history.length > 0 ? history[history.length - 1] : undefined;
      if (lastMsg && lastMsg.role === 'tool' && lastMsg.tool_call_id === toolCall.id) {
        continue;
      }

      history.push({
        role: 'tool',
        content: toolResultContent,
        tool_call_id: toolCall.id,
        name: toolName,
      });
    }

    if (hasProductiveTool) {
      this.resetConsecutiveCounters();
    }
  }

  private handleUnauthorizedTool(toolCall: AIToolCall) {
    const toolName = toolCall.function.name;
    console.warn(
      `[${this.config.logLabel}] ⚠️ 工具 ${toolName} 未在本次会话提供的 tools 列表中，已拒绝执行`,
    );
    const prompt = getUnauthorizedToolPrompt(this.config.taskType, toolName);
    this.config.history.push({
      role: 'tool',
      content: prompt,
      tool_call_id: toolCall.id,
      name: toolName,
    });
  }

  private isToolLimitReached(toolName: string): boolean {
    const currentCount = this.toolCallCounts.get(toolName) || 0;
    const limit = TOOL_CALL_LIMITS[toolName] ?? TOOL_CALL_LIMITS.default;
    return typeof limit === 'number' && limit !== Infinity && currentCount >= limit;
  }

  private handleToolLimitReached(toolCall: AIToolCall) {
    const toolName = toolCall.function.name;
    const limit = TOOL_CALL_LIMITS[toolName] ?? TOOL_CALL_LIMITS.default;
    // ensure limit is a number for prompt function
    const limitNum = typeof limit === 'number' ? limit : 0;

    console.warn(
      `[${this.config.logLabel}] ⚠️ 工具 ${toolName} 调用次数已达上限（${limitNum}），跳过此次调用`,
    );
    this.config.history.push({
      role: 'tool',
      content: getToolLimitReachedPrompt(toolName, limitNum),
      tool_call_id: toolCall.id,
      name: toolName,
    });
  }

  private updateToolCounters(toolName: string) {
    const current = this.toolCallCounts.get(toolName) || 0;
    this.toolCallCounts.set(toolName, current + 1);
  }

  private collectPlanningInfo(toolName: string, content: string, toolCall: AIToolCall) {
    if (this.currentStatus !== 'planning') return;

    const keyTools = [
      'list_terms',
      'list_characters',
      'search_memory_by_keywords',
      'get_chapter_info',
      'get_book_info',
      'list_chapters',
    ];

    if (keyTools.includes(toolName)) {
      if (this.config.isBriefPlanning) {
        console.warn(`[${this.config.logLabel}] ⚠️ 简短规划模式下检测到重复工具调用: ${toolName}`);
        const warning = getBriefPlanningToolWarningPrompt();
        this.config.history.push({
          role: 'tool',
          content: content + warning,
          tool_call_id: toolCall.id,
          name: toolName,
        });
        // 这一推入会导致 processToolCalls 最后不需要再推入
        return;
      }
      this.planningToolResults.push({ tool: toolName, result: content });
    }
  }

  private handleParseError(error: string, responseText: string) {
    console.warn(`[${this.config.logLabel}] ⚠️ ${error}`);
    this.config.history.push({ role: 'assistant', content: responseText });
    this.config.history.push({
      role: 'user',
      content: `${this.getCurrentStatusInfoMsg()}\n\n` + getParseErrorPrompt(error),
    });
  }

  private hasStatusContentMismatch(parsed: ParsedResponse): boolean {
    const hasContent =
      !!parsed.content?.titleTranslation ||
      (Array.isArray(parsed.content?.paragraphs) && parsed.content.paragraphs.length > 0);
    const { taskType } = this.config;
    return (
      (taskType === 'translation' || taskType === 'polish' || taskType === 'proofreading') &&
      hasContent &&
      parsed.status !== 'working'
    );
  }

  private handleContentStateMismatch(status: string, responseText: string) {
    this.consecutiveContentStateMismatchCount++;
    if (this.consecutiveContentStateMismatchCount > MAX_CONSECUTIVE_CONTENT_STATE_MISMATCH) {
      throw new Error(
        `AI 多次返回状态与内容不匹配，已超过最大重试次数（${MAX_CONSECUTIVE_CONTENT_STATE_MISMATCH}）。`,
      );
    }
    this.config.history.push({ role: 'assistant', content: responseText });
    this.config.history.push({
      role: 'user',
      content: `${this.getCurrentStatusInfoMsg()}\n\n` + getContentStateMismatchPrompt(status),
    });
  }

  private determineNewStatus(parsed: ParsedResponse): TaskStatus {
    const { taskType } = this.config;
    const hasContent =
      !!parsed.content?.titleTranslation ||
      (Array.isArray(parsed.content?.paragraphs) && parsed.content.paragraphs.length > 0);

    return taskType !== 'translation' && parsed.status === 'planning' && hasContent
      ? 'working'
      : parsed.status;
  }

  private isValidTransition(prev: TaskStatus, next: TaskStatus): boolean {
    if (prev === next) return true;
    const validTransitions = getValidTransitionsForTaskType(this.config.taskType);
    const allowed = validTransitions[prev];
    return !!allowed && allowed.includes(next);
  }

  private handleInvalidTransition(prev: TaskStatus, next: TaskStatus, responseText: string) {
    const { taskType, logLabel } = this.config;
    console.warn(
      `[${logLabel}] ⚠️ 检测到无效的状态转换：${getStatusLabel(prev, taskType)} → ${getStatusLabel(next, taskType)}`,
    );

    const prompt = getInvalidTransitionPrompt(taskType, prev, next);

    this.config.history.push({ role: 'assistant', content: responseText });
    this.config.history.push({
      role: 'user',
      content: prompt,
    });
  }

  private trackStatusDuration(prev: TaskStatus, next: TaskStatus) {
    if (prev === next) return;
    const duration = Date.now() - this.statusStartTime;
    switch (prev) {
      case 'planning':
        this.metrics.planningTime += duration;
        break;
      case 'working':
        this.metrics.workingTime += duration;
        break;
      case 'review':
        this.metrics.reviewTime += duration;
        break;
    }
    this.statusStartTime = Date.now();
  }

  private extractPlanningSummaryIfNeeded(prev: TaskStatus, next: TaskStatus, responseText: string) {
    if (prev === 'planning' && next === 'working' && !this.planningSummary) {
      const parts: string[] = [];
      if (this.planningResponses.length > 0) {
        parts.push('【AI规划决策】');
        parts.push(this.planningResponses.join('\n'));
      }
      if (responseText && responseText.trim().length > 0) {
        if (parts.length === 0) parts.push('【AI规划决策】');
        parts.push(responseText);
      }
      if (this.planningToolResults.length > 0) {
        parts.push('\n【已获取的上下文信息】');
        for (const { tool, result } of this.planningToolResults) {
          parts.push(`- ${tool}: ${result}`);
        }
      }

      if (parts.length > 0) {
        this.planningSummary = parts.join('\n');
        console.log(
          `[${this.config.logLabel}] ✅ 已提取规划摘要（${this.planningSummary.length} 字符）`,
        );
      }
    }
  }

  private async extractContent(parsed: ParsedResponse) {
    const { onTitleExtracted, onParagraphsExtracted, logLabel } = this.config;

    // 1. Title
    if (parsed.content?.titleTranslation) {
      if (this.titleTranslation !== parsed.content.titleTranslation) {
        this.titleTranslation = parsed.content.titleTranslation;
        if (onTitleExtracted) {
          try {
            await onTitleExtracted(this.titleTranslation);
          } catch (error) {
            console.error(`[${logLabel}] ⚠️ onTitleExtracted 回调失败:`, error);
          }
        }
      }
    }

    // 2. Paragraphs
    if (parsed.content?.paragraphs) {
      const newParagraphs: { id: string; translation: string }[] = [];
      for (const para of parsed.content.paragraphs) {
        if (para.id && para.translation && para.translation.trim().length > 0) {
          const prev = this.accumulatedParagraphs.get(para.id);
          if (prev !== para.translation) {
            this.accumulatedParagraphs.set(para.id, para.translation);
            newParagraphs.push({ id: para.id, translation: para.translation });
          }
        }
      }
      if (newParagraphs.length > 0 && onParagraphsExtracted) {
        try {
          await onParagraphsExtracted(newParagraphs);
        } catch (error) {
          console.error(`[${logLabel}] ⚠️ onParagraphsExtracted 回调失败:`, error);
        }
      }
    }
  }

  private handleStateLogic(): { shouldContinue: boolean; shouldBreak?: boolean } {
    const { history } = this.config;

    // Planning
    if (this.currentStatus === 'planning') {
      this.consecutivePlanningCount++;
      this.consecutiveWorkingCount = 0;
      this.consecutiveReviewCount = 0;

      if (this.finalResponseText?.trim()) {
        this.planningResponses.push(this.finalResponseText);
      }

      const prompt = getPlanningLoopPrompt(
        this.config.taskType,
        !!this.config.isBriefPlanning,
        this.consecutivePlanningCount >= MAX_CONSECUTIVE_STATUS,
      );
      history.push({
        role: 'user',
        content: `${this.getCurrentStatusInfoMsg()}\n\n${prompt}`,
      });
      return { shouldContinue: true };
    }

    // Working
    if (this.currentStatus === 'working') {
      this.consecutiveWorkingCount++;
      this.consecutivePlanningCount = 0;
      this.consecutiveReviewCount = 0;

      return this.handleWorkingState();
    }

    // Review
    if (this.currentStatus === 'review') {
      this.consecutiveReviewCount++;
      this.consecutivePlanningCount = 0;
      this.consecutiveWorkingCount = 0;

      return this.handleReviewState();
    }

    // End
    if (this.currentStatus === 'end') {
      return { shouldContinue: false, shouldBreak: true };
    }

    return { shouldContinue: true };
  }

  private handleWorkingState(): { shouldContinue: boolean } {
    const { paragraphIds, verifyCompleteness, taskType } = this.config;

    // Loop detection with no output
    if (
      this.consecutiveWorkingCount >= MAX_CONSECUTIVE_STATUS &&
      this.accumulatedParagraphs.size === 0
    ) {
      this.config.history.push({
        role: 'user',
        content: `${this.getCurrentStatusInfoMsg()}\n\n` + getWorkingLoopPrompt(taskType),
      });
      return { shouldContinue: true };
    }

    // Check completion
    let allParagraphsReturned = false;
    if (paragraphIds && paragraphIds.length > 0) {
      const verification = verifyCompleteness
        ? verifyCompleteness(paragraphIds, this.accumulatedParagraphs)
        : verifyParagraphCompleteness(paragraphIds, this.accumulatedParagraphs);
      allParagraphsReturned = verification.allComplete;
    }

    if (allParagraphsReturned) {
      this.config.history.push({
        role: 'user',
        content: `${this.getCurrentStatusInfoMsg()}\n\n` + getWorkingFinishedPrompt(taskType),
      });
    } else {
      this.config.history.push({
        role: 'user',
        content: `${this.getCurrentStatusInfoMsg()}\n\n` + getWorkingContinuePrompt(taskType),
      });
    }
    return { shouldContinue: true };
  }

  private handleReviewState(): { shouldContinue: boolean } {
    const { paragraphIds, verifyCompleteness, taskType } = this.config;

    if (paragraphIds && paragraphIds.length > 0) {
      const verification = verifyCompleteness
        ? verifyCompleteness(paragraphIds, this.accumulatedParagraphs)
        : verifyParagraphCompleteness(paragraphIds, this.accumulatedParagraphs);

      if (!verification.allComplete && verification.missingIds.length > 0) {
        const missingIndices = verification.missingIds
          .map((id) => paragraphIds.indexOf(id))
          .filter((idx) => idx !== -1);

        this.config.history.push({
          role: 'user',
          content:
            `${this.getCurrentStatusInfoMsg()}\n\n` +
            getMissingParagraphsPrompt(taskType, missingIndices),
        });
        this.currentStatus = 'working';
        this.consecutiveReviewCount = 0;
        return { shouldContinue: true };
      }
    }

    if (this.consecutiveReviewCount >= MAX_CONSECUTIVE_STATUS) {
      console.warn(`[${this.config.logLabel}] ⚠️ 检测到 review 状态循环，强制要求结束`);
      this.config.history.push({
        role: 'user',
        content:
          `${this.getCurrentStatusInfoMsg()}\n\n` + getReviewLoopPrompt(this.taskLabel as TaskType),
      });
    } else {
      const postOutputPrompt = buildPostOutputPrompt(taskType, this.config.taskId);
      this.config.history.push({
        role: 'user',
        content: `${this.getCurrentStatusInfoMsg()}\n\n${postOutputPrompt}`,
      });
    }
    return { shouldContinue: true };
  }

  private getCurrentStatusInfoMsg() {
    return getCurrentStatusInfo(
      this.config.taskType,
      this.currentStatus,
      this.config.isBriefPlanning,
    );
  }

  private resetConsecutiveCounters() {
    this.consecutivePlanningCount = 0;
    this.consecutiveWorkingCount = 0;
    this.consecutiveReviewCount = 0;
  }

  private checkMaxTurns() {
    if (
      this.currentStatus !== 'end' &&
      this.config.maxTurns !== Infinity &&
      this.config.maxTurns &&
      this.currentTurnCount >= this.config.maxTurns
    ) {
      throw new Error(
        `AI在${this.config.maxTurns}回合内未完成${this.taskLabel}任务（当前状态: ${this.currentStatus}）。请重试。`,
      );
    }
  }

  private finalizeMetrics() {
    this.metrics.totalTime = Date.now() - this.startTime;
    this.metrics.averageToolCallTime =
      this.metrics.toolCallCount > 0 ? this.metrics.toolCallTime / this.metrics.toolCallCount : 0;

    // Log metrics
    if (this.config.aiProcessingStore && this.config.taskId) {
      console.log(`[${this.config.logLabel}] 📊 性能指标:`, {
        总耗时: `${this.metrics.totalTime}ms`,
        规划阶段: `${this.metrics.planningTime}ms`,
        工作阶段: `${this.metrics.workingTime}ms`,
        复核阶段: `${this.metrics.reviewTime}ms`,
        工具调用: `${this.metrics.toolCallCount} 次，平均 ${this.metrics.averageToolCallTime.toFixed(2)}ms`,
      });
    }
  }

  private buildResult(): ToolCallLoopResult {
    const planningContextUpdate = detectPlanningContextUpdate(this.config.collectedActions || []);
    return {
      responseText: this.finalResponseText,
      status: this.currentStatus,
      paragraphs: this.accumulatedParagraphs,
      titleTranslation: this.titleTranslation,
      planningSummary: this.planningSummary,
      planningContextUpdate,
      metrics: this.metrics,
    };
  }
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
  if (!finalResponseText || finalResponseText.trim().length === 0) {
    throw new Error(
      `AI在工具调用后未返回${TASK_TYPE_LABELS[taskType]}结果（已达到最大回合数 ${maxTurns}）。请重试。`,
    );
  }
}
