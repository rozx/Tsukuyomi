import { detectRepeatingCharacters } from 'src/services/ai/degradation-detector';
import {
  getCurrentStatusInfo,
  getPlanningLoopPrompt,
  getPreparingLoopPrompt,
  getWorkingLoopPrompt,
  getWorkingFinishedPrompt,
  getWorkingContinuePrompt,
  getMissingParagraphsPrompt,
  getReviewLoopPrompt,
  getUnauthorizedToolPrompt,
  getStatusRestrictedToolPrompt,
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
import { verifyParagraphCompleteness, type VerificationResult } from './response-parser';
import {
  detectPlanningContextUpdate,
  PRODUCTIVE_TOOLS,
  TOOL_CALL_LIMITS,
  type PlanningContextUpdate,
} from './productivity-monitor';
import { type PerformanceMetrics } from './tool-executor';
import { buildPostOutputPrompt } from './context-builder';

// Constants
// 最大连续相同状态次数（用于检测循环）
const MAX_CONSECUTIVE_STATUS = 2;

const DATA_WRITE_TOOL_NAMES = new Set([
  'create_term',
  'update_term',
  'create_character',
  'update_character',
  'create_memory',
  'update_memory',
]);

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
  aiModelId?: string;
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
  /**
   * 是否还有下一个块可用
   */
  hasNextChunk?: boolean;
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

  // 已提交的段落 ID 集合（用于计算剩余 chunk 大小，控制 2x 批次大小规则）
  private submittedParagraphIds = new Set<string>();

  // Counters
  private consecutivePlanningCount = 0;
  private consecutivePreparingCount = 0;
  private consecutiveWorkingCount = 0;
  private consecutiveReviewCount = 0;
  private toolCallCounts = new Map<string, number>();

  // Tool call results tracking (for new tool-based approach)
  private pendingStatusUpdate: TaskStatus | undefined;
  private pendingParagraphTranslations: { id: string; translation: string }[] = [];
  private pendingTitleTranslation: string | undefined;

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
      preparingTime: 0,
      workingTime: 0,
      reviewTime: 0,
      toolCallTime: 0,
      toolCallCount: 0,
      averageToolCallTime: 0,
      workingRejectedWriteCount: 0,
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
      cleanupAbort();
      // 取消请求不需要重试，直接抛出
      if (
        error instanceof Error &&
        (error.message.includes('取消') || error.name === 'AbortError')
      ) {
        throw error;
      }
      // 其他错误（如 4xx/5xx HTTP 错误）必须向上抛出，
      // 否则 run() 循环会因 shouldContinue=false 且 shouldBreak=undefined 而无限重试
      console.error(
        `[${logLabel}] ❌ AI 请求失败:`,
        error instanceof Error ? error.message : error,
      );
      throw error;
    } finally {
      cleanupAbort();
    }

    if (!result) {
      throw new Error('AI 返回结果为空');
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

    // Process text response (tool-based approach)
    const responseText = result.text || '';
    this.finalResponseText = responseText;

    if (detectRepeatingCharacters(responseText, chunkText, { logLabel })) {
      throw new Error(
        `AI降级检测：最终响应中检测到重复字符（chunkIndex: ${this.config.chunkIndex ?? 'unknown'}）`,
      );
    }

    // 使用工具调用结果替代 JSON 解析
    const previousStatus = this.currentStatus;
    let newStatus: TaskStatus | undefined;

    // 检查是否有来自工具调用的状态更新
    if (this.pendingStatusUpdate) {
      newStatus = this.pendingStatusUpdate;
      this.pendingStatusUpdate = undefined; // 清除待处理状态
    }

    // 如果有状态更新，验证并应用
    if (newStatus && newStatus !== previousStatus) {
      // Validate transition
      if (!this.isValidTransition(previousStatus, newStatus)) {
        this.handleInvalidTransition(previousStatus, newStatus, responseText);
        return { shouldContinue: true };
      }

      this.trackStatusDuration(previousStatus, newStatus);
      this.extractPlanningSummaryIfNeeded(previousStatus, newStatus, responseText);

      // Update status
      this.currentStatus = newStatus;

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.updateTask(taskId, {
          workflowStatus: newStatus,
        });
      }
    }

    // 处理标题翻译（来自工具调用）
    if (this.pendingTitleTranslation) {
      this.titleTranslation = this.pendingTitleTranslation;
      if (this.config.onTitleExtracted) {
        try {
          await this.config.onTitleExtracted(this.titleTranslation);
        } catch (error) {
          console.error(`[${logLabel}] ⚠️ onTitleExtracted 回调失败:`, error);
        }
      }
      this.pendingTitleTranslation = undefined; // 清除待处理标题
    }

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
   * 处理工具调用逻辑
   */
  private async processToolCalls(
    result: { toolCalls?: AIToolCall[]; reasoningContent?: string; text: string },
    assistantText: string,
  ) {
    this.appendAssistantToolCallMessage(result, assistantText);

    if (!result.toolCalls) return;

    let hasProductiveTool = false;
    const pendingUserMessages: ChatMessage[] = [];

    for (const toolCall of result.toolCalls) {
      if (!this.shouldProcessToolCall(toolCall)) {
        continue;
      }

      const toolName = toolCall.function.name;
      hasProductiveTool = this.prepareToolCall(toolName) || hasProductiveTool;

      const toolResultContent = await this.executeToolCall(toolCall, toolName);

      const userMessage = await this.handleToolCallResult(
        toolCall,
        toolName,
        toolResultContent,
        assistantText,
      );
      if (userMessage) {
        pendingUserMessages.push(userMessage);
      }
    }

    if (hasProductiveTool) {
      this.resetConsecutiveCounters();
    }

    if (pendingUserMessages.length > 0) {
      this.config.history.push(...pendingUserMessages);
    }
  }

  private appendAssistantToolCallMessage(
    result: { toolCalls?: AIToolCall[]; reasoningContent?: string; text: string },
    assistantText: string,
  ) {
    const { history } = this.config;
    history.push({
      role: 'assistant',
      content: assistantText && assistantText.trim() ? assistantText : '（调用工具）',
      ...(result.toolCalls ? { tool_calls: result.toolCalls } : {}),
      reasoning_content: result.reasoningContent || null,
    });
  }

  private shouldProcessToolCall(toolCall: AIToolCall): boolean {
    const toolName = toolCall.function.name;
    if (!this.allowedToolNames.has(toolName)) {
      this.handleUnauthorizedTool(toolCall);
      return false;
    }

    if (!this.isToolAllowedForCurrentStatus(toolCall)) {
      return false;
    }

    if (this.isToolLimitReached(toolName)) {
      this.handleToolLimitReached(toolCall);
      return false;
    }

    return true;
  }

  private isToolAllowedForCurrentStatus(toolCall: AIToolCall): boolean {
    const toolName = toolCall.function.name;

    if (!this.isTranslationRelatedTask(this.config.taskType)) {
      return true;
    }

    if (!DATA_WRITE_TOOL_NAMES.has(toolName)) {
      return true;
    }

    if (this.currentStatus === 'preparing' || this.currentStatus === 'review') {
      return true;
    }

    this.handleStatusRestrictedTool(toolCall, toolName, this.currentStatus);
    if (this.currentStatus === 'working') {
      this.metrics.workingRejectedWriteCount++;
    }
    return false;
  }

  private isTranslationRelatedTask(taskType: TaskType): boolean {
    return taskType === 'translation' || taskType === 'polish' || taskType === 'proofreading';
  }

  private handleStatusRestrictedTool(
    toolCall: AIToolCall,
    toolName: string,
    currentStatus: 'planning' | 'working' | 'end',
  ) {
    console.warn(
      `[${this.config.logLabel}] ⚠️ 状态限制：${currentStatus} 阶段禁止调用 ${toolName} 写入术语/角色/记忆`,
    );
    this.config.history.push({
      role: 'tool',
      content: getStatusRestrictedToolPrompt(toolName, currentStatus),
      tool_call_id: toolCall.id,
      name: toolName,
    });
  }

  private prepareToolCall(toolName: string): boolean {
    this.updateToolCounters(toolName);
    return PRODUCTIVE_TOOLS.includes(toolName);
  }

  private async executeToolCall(toolCall: AIToolCall, toolName: string): Promise<string> {
    const { aiProcessingStore, taskId, bookId, handleAction, onToast } = this.config;
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
      undefined, // sessionId
      this.config.paragraphIds, // 传入段落 ID 列表以启用块边界限制
      aiProcessingStore, // 传入 AI 处理 Store
      this.config.aiModelId,
      this.config.chunkIndex, // 传入块索引用于 review 检查
      this.submittedParagraphIds, // 传入已提交段落 ID 集合用于计算剩余 chunk 大小
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

    return toolResultContent;
  }

  private async handleToolCallResult(
    toolCall: AIToolCall,
    toolName: string,
    toolResultContent: string,
    assistantText: string,
  ): Promise<ChatMessage | undefined> {
    const { history } = this.config;

    this.captureToolCallResult(toolName, toolResultContent);

    const userMessage = this.applyPendingStatusUpdate(toolName, assistantText);

    await this.handleBatchExtraction(toolName, toolCall, toolResultContent);

    const alreadyHandled = this.collectPlanningInfo(toolName, toolResultContent, toolCall);
    if (alreadyHandled) {
      return userMessage;
    }

    history.push({
      role: 'tool',
      content: toolResultContent,
      tool_call_id: toolCall.id,
      name: toolName,
    });

    return userMessage;
  }

  private applyPendingStatusUpdate(
    toolName: string,
    assistantText: string,
  ): ChatMessage | undefined {
    const { aiProcessingStore, taskId } = this.config;
    if (toolName !== 'update_task_status' || !this.pendingStatusUpdate) {
      return undefined;
    }

    const previousStatus = this.currentStatus;
    const newStatus = this.pendingStatusUpdate;
    this.pendingStatusUpdate = undefined;

    if (!this.isValidTransition(previousStatus, newStatus)) {
      this.handleInvalidTransition(previousStatus, newStatus, assistantText);
      return undefined;
    }

    this.trackStatusDuration(previousStatus, newStatus);
    this.extractPlanningSummaryIfNeeded(previousStatus, newStatus, assistantText);
    this.currentStatus = newStatus;

    if (aiProcessingStore && taskId) {
      void aiProcessingStore.updateTask(taskId, {
        workflowStatus: newStatus,
      });
    }

    const statusPrompt = `${this.getCurrentStatusInfoMsg()}`;
    return { role: 'user', content: statusPrompt };
  }

  private async handleBatchExtraction(
    toolName: string,
    toolCall: AIToolCall,
    toolResultContent: string,
  ) {
    if (toolName !== 'add_translation_batch') {
      return;
    }

    const extracted = this.extractParagraphsFromBatchToolCall(toolCall, toolResultContent);
    if (extracted.length === 0) {
      return;
    }

    // 检测本次会话中重复提交的段落（可能是 AI 修正翻译错误，属于正常行为）
    const duplicateIds: string[] = [];
    for (const para of extracted) {
      if (this.accumulatedParagraphs.has(para.id)) {
        duplicateIds.push(para.id);
      }
      this.accumulatedParagraphs.set(para.id, para.translation);
    }
    if (duplicateIds.length > 0) {
      console.log(
        `[${this.config.logLabel}] ℹ️ ${duplicateIds.length} 个段落被重新提交翻译（已更新）:`,
        duplicateIds.slice(0, 5).join(', ') +
          (duplicateIds.length > 5 ? ` 等 ${duplicateIds.length} 个` : ''),
      );
    }

    if (this.config.onParagraphsExtracted) {
      try {
        await this.config.onParagraphsExtracted(extracted);
      } catch (error) {
        console.error(
          `[${this.config.logLabel}] ⚠️ 段落回调失败（工具 add_translation_batch）`,
          error,
        );
      }
    }
  }

  private extractParagraphsFromBatchToolCall(
    toolCall: AIToolCall,
    toolResultContent: string,
  ): Array<{ id: string; translation: string }> {
    try {
      const result = JSON.parse(toolResultContent);
      if (!result?.success) {
        return [];
      }
      const args = JSON.parse(toolCall.function.arguments || '{}') as {
        paragraphs?: Array<{ paragraph_id?: string; translated_text?: string }>;
      };
      if (!args.paragraphs || args.paragraphs.length === 0) return [];

      const extracted: Array<{ id: string; translation: string }> = [];

      for (const item of args.paragraphs) {
        if (!item || typeof item.translated_text !== 'string') continue;
        if (item.paragraph_id && typeof item.paragraph_id === 'string') {
          extracted.push({ id: item.paragraph_id, translation: item.translated_text });
        }
      }

      return extracted;
    } catch {
      return [];
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

  /**
   * 捕获新工具调用的结果
   * 用于替代 JSON 解析的工具调用方式
   */
  private captureToolCallResult(toolName: string, content: string): void {
    try {
      const result = JSON.parse(content);

      if (toolName === 'update_task_status' && result.success) {
        // 捕获状态更新
        const newStatus = result.new_status as TaskStatus;
        if (newStatus) {
          this.pendingStatusUpdate = newStatus;
        }
      } else if (toolName === 'add_translation_batch' && result.success) {
        // 捕获段落翻译
        // 注意：实际的翻译数据已经在工具内部保存到数据库
        // 这里我们只记录成功信息，不需要额外处理
        // 但为了保持兼容性，我们触发回调
        const processedCount = result.processed_count || 0;
        console.log(`[${this.config.logLabel}] ✅ 批量翻译提交成功: ${processedCount} 个段落`);
      } else if (toolName === 'update_chapter_title' && result.success) {
        // 捕获标题翻译
        const translatedTitle = result.new_title_translation as string;
        if (translatedTitle) {
          this.pendingTitleTranslation = translatedTitle;
        }
      }
    } catch {
      // JSON 解析失败，忽略
    }
  }

  private collectPlanningInfo(toolName: string, content: string, toolCall: AIToolCall): boolean {
    if (this.currentStatus !== 'planning') return false;

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
        // 验证 content 不为空
        const toolResultContent = content || '';
        this.config.history.push({
          role: 'tool',
          content: toolResultContent + warning,
          tool_call_id: toolCall.id,
          name: toolName,
        });
        // 返回 true 表示已处理，processToolCalls 不应再推入
        return true;
      }
      this.planningToolResults.push({ tool: toolName, result: content });
    }
    return false;
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

    this.config.history.push({ role: 'assistant', content: responseText });
  }

  private trackStatusDuration(prev: TaskStatus, next: TaskStatus) {
    if (prev === next) return;
    const duration = Date.now() - this.statusStartTime;
    switch (prev) {
      case 'planning':
        this.metrics.planningTime += duration;
        break;
      case 'preparing':
        this.metrics.preparingTime += duration;
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
    if (prev === 'planning' && next !== 'planning' && !this.planningSummary) {
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

  private handleStateLogic(): { shouldContinue: boolean; shouldBreak?: boolean } {
    const { history } = this.config;

    // Planning
    if (this.currentStatus === 'planning') {
      this.consecutivePlanningCount++;
      this.consecutivePreparingCount = 0;
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

    // Preparing
    if (this.currentStatus === 'preparing') {
      this.consecutivePreparingCount++;
      this.consecutivePlanningCount = 0;
      this.consecutiveWorkingCount = 0;
      this.consecutiveReviewCount = 0;

      return this.handlePreparingState();
    }

    // Working
    if (this.currentStatus === 'working') {
      this.consecutiveWorkingCount++;
      this.consecutivePlanningCount = 0;
      this.consecutivePreparingCount = 0;
      this.consecutiveReviewCount = 0;

      return this.handleWorkingState();
    }

    // Review
    if (this.currentStatus === 'review') {
      this.consecutiveReviewCount++;
      this.consecutivePlanningCount = 0;
      this.consecutivePreparingCount = 0;
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

  private handlePreparingState(): { shouldContinue: boolean } {
    const isLoopDetected = this.consecutivePreparingCount >= MAX_CONSECUTIVE_STATUS;
    this.config.history.push({
      role: 'user',
      content:
        `${this.getCurrentStatusInfoMsg()}\n\n` +
        getPreparingLoopPrompt(this.config.taskType, isLoopDetected),
    });
    return { shouldContinue: true };
  }

  private handleReviewState(): { shouldContinue: boolean } {
    const { paragraphIds, verifyCompleteness, taskType } = this.config;

    if (paragraphIds && paragraphIds.length > 0) {
      const verification = verifyCompleteness
        ? verifyCompleteness(paragraphIds, this.accumulatedParagraphs)
        : verifyParagraphCompleteness(paragraphIds, this.accumulatedParagraphs);

      if (!verification.allComplete && verification.missingIds.length > 0) {
        this.config.history.push({
          role: 'user',
          content:
            `${this.getCurrentStatusInfoMsg()}\n\n` +
            getMissingParagraphsPrompt(taskType, verification.missingIds),
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
      this.config.hasNextChunk,
    );
  }

  private resetConsecutiveCounters() {
    this.consecutivePlanningCount = 0;
    this.consecutivePreparingCount = 0;
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
        准备阶段: `${this.metrics.preparingTime}ms`,
        工作阶段: `${this.metrics.workingTime}ms`,
        复核阶段: `${this.metrics.reviewTime}ms`,
        工具调用: `${this.metrics.toolCallCount} 次，平均 ${this.metrics.averageToolCallTime.toFixed(2)}ms`,
        工作阶段被拒绝写入: `${this.metrics.workingRejectedWriteCount} 次`,
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
