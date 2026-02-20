import type { AIToolCall, AIToolCallResult, ChatMessage } from 'src/services/ai/types/ai-service';
import type { ToolCallLoopConfig } from '../task-runner';
import type { IPromptPolicy } from '../prompt-policy';
import type { PerformanceMetrics } from '../tool-executor';
import type { TaskStatus, TaskType } from '../task-types';
import { isTranslationRelatedTask } from '../task-types';
import { TOOL_CALL_LIMITS } from '../productivity-monitor';
import { createStatusUpdateHandler } from './handlers/status-update-handler';
import { createTranslationBatchHandler } from './handlers/translation-batch-handler';
import { createDefaultToolHandler } from './handlers/default-tool-handler';

/**
 * 写入类工具名称集合
 * 在翻译相关任务的特定状态下限制使用（仅 preparing 和 review 阶段允许）
 */
const DATA_WRITE_TOOL_NAMES = new Set([
  'create_term',
  'update_term',
  'create_character',
  'update_character',
  'create_memory',
  'update_memory',
]);

export interface ToolExecutionResult {
  toolMessage?: ChatMessage;
  pendingUserMessage?: ChatMessage;
  hasProductiveTool?: boolean;
}

export interface ToolHandlerContext {
  config: ToolCallLoopConfig;
  metrics: PerformanceMetrics;
  getCurrentStatus: () => TaskStatus;
  setCurrentStatus: (status: TaskStatus) => void;
  isValidTransition: (prev: TaskStatus, next: TaskStatus) => boolean;
  trackStatusDuration: (prev: TaskStatus, next: TaskStatus) => void;
  extractPlanningSummaryIfNeeded: (
    prev: TaskStatus,
    next: TaskStatus,
    responseText: string,
  ) => void;
  captureToolCallResult: (toolName: string, content: string) => void;
  applyPendingStatusUpdate: (toolName: string, assistantText: string) => ChatMessage | undefined;
  handleBatchExtraction: (
    toolName: string,
    toolCall: AIToolCall,
    toolResultContent: string,
  ) => Promise<void>;
  collectPlanningInfo: (toolName: string, content: string, toolCall: AIToolCall) => boolean;
  executeToolCall: (toolCall: AIToolCall, toolName: string) => Promise<AIToolCallResult>;
  incrementWorkingRejectedWriteCount: () => void;
  logLabel: string;
  promptPolicy: IPromptPolicy;
  taskType: TaskType;
}

export interface ToolHandler {
  name: string;
  canHandle: (toolName: string) => boolean;
  execute: (
    toolCall: AIToolCall,
    toolResult: AIToolCallResult,
    assistantText: string,
    context: ToolHandlerContext,
  ) => Promise<ToolExecutionResult>;
}

interface DispatcherConstructorOptions {
  context: ToolHandlerContext;
  allowedToolNames: Set<string>;
  toolCallCounts: Map<string, number>;
  productiveTools: Set<string>;
}

export class ToolDispatcher {
  private readonly handlers: ToolHandler[];

  constructor(private readonly options: DispatcherConstructorOptions) {
    this.handlers = [
      createStatusUpdateHandler(),
      createTranslationBatchHandler(),
      createDefaultToolHandler(),
    ];
  }

  public async dispatchToolCalls(
    toolCalls: AIToolCall[],
    assistantText: string,
  ): Promise<{
    toolMessages: ChatMessage[];
    pendingUserMessages: ChatMessage[];
    hasProductiveTool: boolean;
  }> {
    const toolMessages: ChatMessage[] = [];
    const pendingUserMessages: ChatMessage[] = [];
    let hasProductiveTool = false;

    for (const toolCall of toolCalls) {
      const maybeResult = await this.dispatchSingleTool(toolCall, assistantText);
      if (!maybeResult) {
        continue;
      }

      if (maybeResult.toolMessage) {
        toolMessages.push(maybeResult.toolMessage);
      }
      if (maybeResult.pendingUserMessage) {
        pendingUserMessages.push(maybeResult.pendingUserMessage);
      }
      hasProductiveTool = hasProductiveTool || !!maybeResult.hasProductiveTool;
    }

    return { toolMessages, pendingUserMessages, hasProductiveTool };
  }

  private async dispatchSingleTool(
    toolCall: AIToolCall,
    assistantText: string,
  ): Promise<ToolExecutionResult | undefined> {
    const toolName = toolCall.function.name;

    if (!this.options.allowedToolNames.has(toolName)) {
      return {
        toolMessage: {
          role: 'tool',
          content: this.options.context.promptPolicy.getUnauthorizedToolPrompt(
            this.options.context.taskType,
            toolName,
          ),
          tool_call_id: toolCall.id,
          name: toolName,
        },
      };
    }

    if (!this.isToolAllowedByStatus(toolCall)) {
      return {
        toolMessage: {
          role: 'tool',
          content: this.options.context.promptPolicy.getStatusRestrictedToolPrompt(
            toolName,
            this.options.context.getCurrentStatus(),
            this.options.context.taskType,
          ),
          tool_call_id: toolCall.id,
          name: toolName,
        },
      };
    }

    const limit = TOOL_CALL_LIMITS[toolName] ?? TOOL_CALL_LIMITS.default;
    const currentCount = this.options.toolCallCounts.get(toolName) || 0;
    if (typeof limit === 'number' && limit !== Infinity && currentCount >= limit) {
      return {
        toolMessage: {
          role: 'tool',
          content: this.options.context.promptPolicy.getToolLimitReachedPrompt(toolName, limit),
          tool_call_id: toolCall.id,
          name: toolName,
        },
      };
    }

    this.options.toolCallCounts.set(toolName, currentCount + 1);

    const toolResult = await this.options.context.executeToolCall(toolCall, toolName);
    const handler = this.handlers.find((item) => item.canHandle(toolName));

    // Safety fallback: currently unreachable because createDefaultToolHandler
    // has canHandle: () => true, but kept as a defensive measure.
    if (!handler) {
      return {
        toolMessage: {
          role: 'tool',
          content: toolResult.content,
          tool_call_id: toolCall.id,
          name: toolName,
        },
        hasProductiveTool: this.options.productiveTools.has(toolName),
      };
    }

    const handled = await handler.execute(
      toolCall,
      toolResult,
      assistantText,
      this.options.context,
    );
    return {
      ...handled,
      hasProductiveTool: !!handled.hasProductiveTool || this.options.productiveTools.has(toolName),
    };
  }

  /**
   * 检查写入工具在当前状态下是否被允许。
   * 翻译相关任务仅在 preparing（创建术语/角色/记忆）和 review（补充修正）阶段允许写入工具。
   * planning 阶段不允许（应先完成规划再写入），working 阶段不允许（应专注翻译）。
   */
  private isToolAllowedByStatus(toolCall: AIToolCall): boolean {
    const toolName = toolCall.function.name;
    const taskType = this.options.context.taskType;

    if (!isTranslationRelatedTask(taskType)) {
      return true;
    }

    if (!DATA_WRITE_TOOL_NAMES.has(toolName)) {
      return true;
    }

    const currentStatus = this.options.context.getCurrentStatus();

    if (currentStatus === 'preparing' || currentStatus === 'review') {
      return true;
    }

    if (currentStatus === 'working') {
      this.options.context.incrementWorkingRejectedWriteCount();
    }

    return false;
  }
}
