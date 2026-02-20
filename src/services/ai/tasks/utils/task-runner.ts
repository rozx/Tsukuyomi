import { detectRepeatingCharacters } from 'src/services/ai/degradation-detector';
import { ToolRegistry } from 'src/services/ai/tools/index';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import {
  getStatusLabel,
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
  AIToolCallResult,
} from 'src/services/ai/types/ai-service';
import {
  createInitialMetrics,
  finalizeMetrics as finalizeInstrumentationMetrics,
  recordToolCall,
  trackStatusDuration as trackInstrumentationStatusDuration,
} from './instrumentation';
import { verifyParagraphCompleteness, type VerificationResult } from './response-parser';
import {
  detectPlanningContextUpdate,
  PRODUCTIVE_TOOLS,
  type PlanningContextUpdate,
} from './productivity-monitor';
import { type PerformanceMetrics } from './tool-executor';
import { buildPostOutputPrompt } from './context-builder';
import { PromptPolicy } from './prompt-policy';
import { StateMachineEngine } from './state-machine-engine';
import { ToolDispatcher } from './tool-dispatcher';
import { runLLMRequest } from './llm-stream-adapter';

// Constants
// 最大连续相同状态次数（用于检测循环）
const MAX_CONSECUTIVE_STATUS = 2;

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
  private pendingTitleTranslation: string | undefined;

  // Config & Helpers
  private allowedToolNames: Set<string>;
  private taskLabel: string;
  private metrics: PerformanceMetrics;
  private stateMachine: StateMachineEngine;
  private toolDispatcher: ToolDispatcher;

  constructor(private config: ToolCallLoopConfig) {
    this.allowedToolNames = new Set(config.tools.map((t) => t.function.name));
    this.taskLabel = TASK_TYPE_LABELS[config.taskType];
    this.stateMachine = new StateMachineEngine(config.taskType, this.currentStatus);
    this.metrics = createInitialMetrics();
    this.toolDispatcher = new ToolDispatcher({
      context: {
        config: this.config,
        metrics: this.metrics,
        getCurrentStatus: () => this.currentStatus,
        setCurrentStatus: (status) => this.setCurrentStatus(status),
        isValidTransition: (prev, next) => this.isValidTransition(prev, next),
        trackStatusDuration: (prev, next) => this.trackStatusDuration(prev, next),
        extractPlanningSummaryIfNeeded: (prev, next, responseText) =>
          this.extractPlanningSummaryIfNeeded(prev, next, responseText),
        captureToolCallResult: (toolName, content) => this.captureToolCallResult(toolName, content),
        applyPendingStatusUpdate: (toolName, assistantText) =>
          this.applyPendingStatusUpdate(toolName, assistantText),
        handleBatchExtraction: (toolName, toolCall, toolResultContent) =>
          this.handleBatchExtraction(toolName, toolCall, toolResultContent),
        collectPlanningInfo: (toolName, content, toolCall) =>
          this.collectPlanningInfo(toolName, content, toolCall),
        executeToolCall: (toolCall, toolName) => this.executeToolCall(toolCall, toolName),
        incrementWorkingRejectedWriteCount: () => {
          this.metrics.workingRejectedWriteCount++;
        },
        logLabel: this.config.logLabel,
        promptPolicy: PromptPolicy,
        taskType: this.config.taskType,
      },
      allowedToolNames: this.allowedToolNames,
      toolCallCounts: this.toolCallCounts,
      productiveTools: PRODUCTIVE_TOOLS,
    });
    this.startTime = Date.now();
    this.statusStartTime = Date.now();
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

    const { result } = await runLLMRequest({
      aiServiceConfig,
      request,
      generateText: this.config.generateText,
      taskId,
      aiProcessingStore,
      chunkText,
      logLabel,
      taskType: this.config.taskType,
    });

    // Save reasoning
    if (aiProcessingStore && taskId && result.reasoningContent) {
      void aiProcessingStore.appendThinkingMessage(taskId, result.reasoningContent);
    }

    // Handle tool calls
    if (result.toolCalls && result.toolCalls.length > 0) {
      await this.processToolCalls(result, result.text);
      return { shouldContinue: true };
    }

    return this.handleTextResponse(result.text || '', history, chunkText, logLabel);
  }

  private async handleTextResponse(
    responseText: string,
    history: ChatMessage[],
    chunkText: string,
    logLabel: string,
  ): Promise<{ shouldContinue: boolean; shouldBreak?: boolean }> {
    const { aiProcessingStore, taskId } = this.config;

    this.finalResponseText = responseText;

    if (detectRepeatingCharacters(responseText, chunkText, { logLabel })) {
      throw new Error(
        `AI降级检测：最终响应中检测到重复字符（chunkIndex: ${this.config.chunkIndex ?? 'unknown'}）`,
      );
    }

    const previousStatus = this.currentStatus;
    const newStatus = this.pendingStatusUpdate;
    this.pendingStatusUpdate = undefined;

    if (newStatus && newStatus !== previousStatus) {
      if (!this.isValidTransition(previousStatus, newStatus)) {
        this.handleInvalidTransition(previousStatus, newStatus, responseText);
        return { shouldContinue: true };
      }

      this.trackStatusDuration(previousStatus, newStatus);
      this.extractPlanningSummaryIfNeeded(previousStatus, newStatus, responseText);
      this.setCurrentStatus(newStatus);

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.updateTask(taskId, {
          workflowStatus: newStatus,
        });
      }
    }

    if (this.pendingTitleTranslation) {
      this.titleTranslation = this.pendingTitleTranslation;
      if (this.config.onTitleExtracted) {
        try {
          await this.config.onTitleExtracted(this.titleTranslation);
        } catch (error) {
          console.error(`[${logLabel}] ⚠️ onTitleExtracted 回调失败:`, error);
        }
      }
      this.pendingTitleTranslation = undefined;
    }

    history.push({ role: 'assistant', content: responseText });
    return this.handleStateLogic();
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

    const { toolMessages, pendingUserMessages, hasProductiveTool } =
      await this.toolDispatcher.dispatchToolCalls(result.toolCalls, assistantText);

    if (toolMessages.length > 0) {
      this.config.history.push(...toolMessages);
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

  private async executeToolCall(toolCall: AIToolCall, toolName: string): Promise<AIToolCallResult> {
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
      this.accumulatedParagraphs, // 传入已积累的翻译内存，用于 review 完整性检查（避免依赖过时的 DB 数据）
    );
    recordToolCall(this.metrics, Date.now() - start);

    if (aiProcessingStore && taskId) {
      void aiProcessingStore.appendThinkingMessage(taskId, `[工具结果: ${toolResult.content}]\n`);
    }

    return toolResult;
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
    this.setCurrentStatus(newStatus);

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
      const result = JSON.parse(toolResultContent) as {
        success?: boolean;
        accepted_paragraphs?: Array<{ paragraph_id?: string; translated_text?: string }>;
      };
      if (!result?.success) {
        return [];
      }

      const hasCanonicalAcceptedParagraphs =
        result && Object.prototype.hasOwnProperty.call(result, 'accepted_paragraphs');

      if (Array.isArray(result.accepted_paragraphs)) {
        const canonicalExtracted: Array<{ id: string; translation: string }> = [];
        for (const item of result.accepted_paragraphs) {
          if (!item || typeof item.translated_text !== 'string') continue;
          if (item.paragraph_id && typeof item.paragraph_id === 'string') {
            canonicalExtracted.push({ id: item.paragraph_id, translation: item.translated_text });
          }
        }
        return canonicalExtracted;
      }

      if (hasCanonicalAcceptedParagraphs) {
        // accepted_paragraphs 字段已返回但格式异常，不再回退到原参数，避免错配扩散
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

  /**
   * 捕获新工具调用的结果
   * 用于替代 JSON 解析的工具调用方式
   */
  private captureToolCallResult(toolName: string, content: string): void {
    try {
      const result = JSON.parse(content) as {
        success?: boolean;
        new_status?: TaskStatus;
        processed_count?: number;
        failed_paragraphs?: Array<{ paragraph_id?: string; error?: string; error_code?: string }>;
        new_title_translation?: string;
      };

      if (toolName === 'update_task_status' && result.success) {
        // 捕获状态更新
        const newStatus = result.new_status;
        if (newStatus) {
          this.pendingStatusUpdate = newStatus;
        }
      } else if (toolName === 'add_translation_batch' && result.success) {
        const processedCount = result.processed_count || 0;
        console.log(`[${this.config.logLabel}] ✅ 批量翻译提交成功: ${processedCount} 个段落`);

        const failedParagraphs = Array.isArray(result.failed_paragraphs)
          ? result.failed_paragraphs
          : [];
        if (failedParagraphs.length > 0) {
          const failedPreview = failedParagraphs
            .slice(0, 5)
            .map((item) => {
              const id = item.paragraph_id || 'unknown';
              const code = item.error_code || 'UNKNOWN_ERROR';
              const reason = item.error || 'unknown error';
              return `${id}(${code}): ${reason}`;
            })
            .join(' | ');
          console.warn(
            `[${this.config.logLabel}] ⚠️ 批量翻译存在部分失败: ${failedParagraphs.length} 个段落未通过校验。${failedPreview}`,
          );
        }
      } else if (toolName === 'update_chapter_title' && result.success) {
        // 捕获标题翻译
        const translatedTitle = result.new_title_translation;
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

    const keyTools = new Set([
      'list_terms',
      'list_characters',
      'search_memory_by_keywords',
      'get_chapter_info',
      'get_book_info',
      'list_chapters',
    ]);

    if (keyTools.has(toolName)) {
      if (this.config.isBriefPlanning) {
        console.warn(`[${this.config.logLabel}] ⚠️ 简短规划模式下检测到重复工具调用: ${toolName}`);
        const warning = PromptPolicy.getBriefPlanningToolWarningPrompt();
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
    this.stateMachine.setCurrentStatus(prev);
    return this.stateMachine.isValidTransition(next);
  }

  private handleInvalidTransition(prev: TaskStatus, next: TaskStatus, responseText: string) {
    const { taskType, logLabel } = this.config;
    console.warn(
      `[${logLabel}] ⚠️ 检测到无效的状态转换：${getStatusLabel(prev, taskType)} → ${getStatusLabel(next, taskType)}`,
    );

    this.config.history.push({ role: 'assistant', content: responseText });
  }

  private trackStatusDuration(prev: TaskStatus, next: TaskStatus) {
    this.statusStartTime = trackInstrumentationStatusDuration(
      this.metrics,
      prev,
      next,
      this.statusStartTime,
    );
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

  private async handleStateLogic(): Promise<{ shouldContinue: boolean; shouldBreak?: boolean }> {
    const { history } = this.config;

    // Planning
    if (this.currentStatus === 'planning') {
      this.consecutivePlanningCount++;
      this.resetOtherCounters('planning');

      if (this.finalResponseText?.trim()) {
        this.planningResponses.push(this.finalResponseText);
      }

      const prompt = PromptPolicy.getPlanningLoopPrompt(
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
      this.resetOtherCounters('preparing');

      return this.handlePreparingState();
    }

    // Working
    if (this.currentStatus === 'working') {
      this.consecutiveWorkingCount++;
      this.resetOtherCounters('working');

      return this.handleWorkingState();
    }

    // Review
    if (this.currentStatus === 'review') {
      this.consecutiveReviewCount++;
      this.resetOtherCounters('review');

      return await this.handleReviewState();
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
        content:
          `${this.getCurrentStatusInfoMsg()}\n\n` + PromptPolicy.getWorkingLoopPrompt(taskType),
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
        content:
          `${this.getCurrentStatusInfoMsg()}\n\n` + PromptPolicy.getWorkingFinishedPrompt(taskType),
      });
    } else {
      this.config.history.push({
        role: 'user',
        content:
          `${this.getCurrentStatusInfoMsg()}\n\n` + PromptPolicy.getWorkingContinuePrompt(taskType),
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
        PromptPolicy.getPreparingLoopPrompt(this.config.taskType, isLoopDetected),
    });
    return { shouldContinue: true };
  }

  private async handleReviewState(): Promise<{ shouldContinue: boolean }> {
    const { paragraphIds, verifyCompleteness, taskType } = this.config;

    if (paragraphIds && paragraphIds.length > 0) {
      const verification = verifyCompleteness
        ? verifyCompleteness(paragraphIds, this.accumulatedParagraphs)
        : verifyParagraphCompleteness(paragraphIds, this.accumulatedParagraphs);

      if (!verification.allComplete && verification.missingIds.length > 0) {
        // 内存中检测到缺失段落，但可能是误报（例如 AI 重新提交相同翻译被去重拒绝）。
        // 先查询数据库确认这些段落是否真的缺少翻译，避免无限循环。
        const dbConfirmedMissing = await this.crossCheckMissingWithDB(verification.missingIds);

        if (dbConfirmedMissing.length > 0) {
          // 数据库也确认缺失，真正需要补翻
          this.config.history.push({
            role: 'user',
            content:
              `${this.getCurrentStatusInfoMsg()}\n\n` +
              PromptPolicy.getMissingParagraphsPrompt(taskType, dbConfirmedMissing),
          });
          this.setCurrentStatus('working');
          this.consecutiveReviewCount = 0;
          return { shouldContinue: true };
        } else {
          // 数据库已有翻译，同步内存中的 accumulatedParagraphs，避免后续误报
          console.log(
            `[${this.config.logLabel}] ℹ️ 内存中检测到 ${verification.missingIds.length} 个段落缺失，` +
              `但数据库确认均已翻译，已同步内存状态`,
          );
        }
      }
    }

    if (this.consecutiveReviewCount >= MAX_CONSECUTIVE_STATUS) {
      console.warn(`[${this.config.logLabel}] ⚠️ 检测到 review 状态循环，强制要求结束`);
      this.config.history.push({
        role: 'user',
        content:
          `${this.getCurrentStatusInfoMsg()}\n\n` +
          PromptPolicy.getReviewLoopPrompt(this.config.taskType),
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

  /**
   * 交叉检查：对于内存中检测到"缺失"的段落 ID，查询数据库确认是否真的缺少翻译。
   * 如果数据库中已有翻译，将其同步到 accumulatedParagraphs，避免误报导致无限循环。
   *
   * 典型场景：AI 在 review 被打回 working 后重新提交相同翻译，
   * add_translation_batch 因重复检测拒绝提交（success: false），
   * 导致 accumulatedParagraphs 未更新，但数据库中实际已有翻译。
   */
  private async crossCheckMissingWithDB(missingIds: string[]): Promise<string[]> {
    const { aiProcessingStore, taskId, bookId } = this.config;

    // 获取 chapterId
    let chapterId: string | undefined;
    if (aiProcessingStore && taskId) {
      const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
      chapterId = task?.chapterId;
    }

    if (!bookId || !chapterId) {
      // 无法查询数据库，保守返回所有 missingIds
      return missingIds;
    }

    try {
      const { BookService } = await import('src/services/book-service');
      const { ChapterService } = await import('src/services/chapter-service');
      const { ChapterContentService } = await import('src/services/chapter-content-service');

      const book = await BookService.getBookById(bookId);
      if (!book) return missingIds;

      const chapterInfo = ChapterService.findChapterById(book, chapterId);
      if (!chapterInfo) return missingIds;

      const { chapter } = chapterInfo;
      const content =
        chapter.content || (await ChapterContentService.loadChapterContent(chapterId));
      if (!content) return missingIds;

      const contentMap = new Map(content.map((p) => [p.id, p]));
      const stillMissing: string[] = [];

      for (const id of missingIds) {
        const paragraph = contentMap.get(id);
        if (paragraph?.translations && paragraph.translations.length > 0) {
          // 数据库已有翻译，同步到内存
          const selectedTranslation = paragraph.translations.find(
            (t) => t.id === paragraph.selectedTranslationId,
          );
          const translationText =
            selectedTranslation?.translation || paragraph.translations[0]?.translation;
          if (translationText) {
            this.accumulatedParagraphs.set(id, translationText);
          }
        } else {
          stillMissing.push(id);
        }
      }

      return stillMissing;
    } catch (error) {
      console.error(`[${this.config.logLabel}] ⚠️ 数据库交叉检查失败:`, error);
      // 查询失败时保守返回所有 missingIds
      return missingIds;
    }
  }

  private getCurrentStatusInfoMsg() {
    return PromptPolicy.getCurrentStatusInfo(
      this.config.taskType,
      this.currentStatus,
      this.config.isBriefPlanning,
      this.config.hasNextChunk,
    );
  }

  private setCurrentStatus(status: TaskStatus) {
    this.currentStatus = status;
    this.stateMachine.setCurrentStatus(status);
  }

  private resetConsecutiveCounters() {
    this.consecutivePlanningCount = 0;
    this.consecutivePreparingCount = 0;
    this.consecutiveWorkingCount = 0;
    this.consecutiveReviewCount = 0;
  }

  private resetOtherCounters(except: TaskStatus) {
    if (except !== 'planning') this.consecutivePlanningCount = 0;
    if (except !== 'preparing') this.consecutivePreparingCount = 0;
    if (except !== 'working') this.consecutiveWorkingCount = 0;
    if (except !== 'review') this.consecutiveReviewCount = 0;
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
    finalizeInstrumentationMetrics(this.metrics, this.startTime);

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
