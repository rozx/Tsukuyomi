import type { AIToolCall, AIToolCallResult } from 'src/services/ai/types/ai-service';
import type { ToolExecutionResult, ToolHandler, ToolHandlerContext } from '../index';
import { applyPendingMessage, buildToolMessageBase } from './handler-utils';

export function createStatusUpdateHandler(): ToolHandler {
  return {
    name: 'status-update-handler',
    canHandle: (toolName: string) => toolName === 'update_task_status',
    execute(
      toolCall: AIToolCall,
      toolResult: AIToolCallResult,
      assistantText: string,
      context: ToolHandlerContext,
    ): Promise<ToolExecutionResult> {
      const { toolName, toolMessage } = buildToolMessageBase(toolCall, toolResult, context);
      const pendingUserMessage = context.applyPendingStatusUpdate(toolName, assistantText);

      return Promise.resolve(applyPendingMessage({ toolMessage }, pendingUserMessage));
    },
  };
}
