import type { AIToolCall, AIToolCallResult, ChatMessage } from 'src/services/ai/types/ai-service';
import type { ToolCallLoopConfig } from '../task-runner';
import type { IPromptPolicy } from '../prompt-policy';
import type { PerformanceMetrics } from '../tool-executor';
import type { TaskStatus, TaskType } from '../task-types';

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
