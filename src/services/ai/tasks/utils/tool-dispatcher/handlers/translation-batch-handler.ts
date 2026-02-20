import type { AIToolCall, AIToolCallResult } from 'src/services/ai/types/ai-service';
import type { ToolExecutionResult, ToolHandler, ToolHandlerContext } from '../index';
import { applyPendingMessage, buildToolMessageBase } from './handler-utils';

export function createTranslationBatchHandler(): ToolHandler {
  return {
    name: 'translation-batch-handler',
    canHandle: (toolName: string) => toolName === 'add_translation_batch',
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

      await context.handleBatchExtraction(toolName, toolCall, toolResultContent);

      const pendingUserMessage = context.applyPendingStatusUpdate(toolName, assistantText);

      return applyPendingMessage({ toolMessage }, pendingUserMessage);
    },
  };
}
