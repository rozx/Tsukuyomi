import type { AIToolCall, AIToolCallResult } from 'src/services/ai/types/ai-service';
import type { ToolExecutionResult, ToolHandler, ToolHandlerContext } from '../index';
import { applyPendingMessage, buildToolMessageBase } from './handler-utils';

export function createDefaultToolHandler(): ToolHandler {
  return {
    name: 'default-tool-handler',
    canHandle: () => true,
    async execute(
      toolCall: AIToolCall,
      toolResult: AIToolCallResult,
      assistantText: string,
      context: ToolHandlerContext,
    ): Promise<ToolExecutionResult> {
      const { toolName, toolResultContent, toolMessage } = buildToolMessageBase(
        toolCall,
        toolResult,
        context,
      );

      const pendingUserMessage = context.applyPendingStatusUpdate(toolName, assistantText);

      await context.handleBatchExtraction(toolName, toolCall, toolResultContent);

      const alreadyHandled = context.collectPlanningInfo(toolName, toolResultContent, toolCall);
      if (alreadyHandled) {
        return applyPendingMessage({}, pendingUserMessage);
      }

      return applyPendingMessage({ toolMessage }, pendingUserMessage);
    },
  };
}
