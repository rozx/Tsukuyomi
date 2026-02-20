import type { AIToolCall, AIToolCallResult, ChatMessage } from 'src/services/ai/types/ai-service';
import type { ToolExecutionResult, ToolHandlerContext } from '../index';

/**
 * 从 toolCall 和 toolResult 中提取公共字段，
 * 执行 captureToolCallResult，并构建基础的 toolMessage。
 *
 * 注意：applyPendingStatusUpdate 的调用时机因 handler 而异
 * （例如 translation-batch-handler 需要在 handleBatchExtraction 之后调用），
 * 因此由各 handler 自行调用 applyPendingStatusUpdate。
 */
export function buildToolMessageBase(
  toolCall: AIToolCall,
  toolResult: AIToolCallResult,
  context: ToolHandlerContext,
): {
  toolName: string;
  toolResultContent: string;
  toolMessage: ChatMessage;
} {
  const toolName = toolCall.function.name;
  const toolResultContent = toolResult.content;

  context.captureToolCallResult(toolName, toolResultContent);

  const toolMessage: ChatMessage = {
    role: 'tool',
    content: toolResultContent,
    tool_call_id: toolCall.id,
    name: toolName,
  };

  return { toolName, toolResultContent, toolMessage };
}

/**
 * 将 pendingUserMessage 应用到 ToolExecutionResult 中（如果存在）。
 * 用于在各 handler 中统一 applyPendingStatusUpdate 结果的合并。
 */
export function applyPendingMessage(
  result: ToolExecutionResult,
  pendingUserMessage: ChatMessage | undefined,
): ToolExecutionResult {
  if (pendingUserMessage) {
    return { ...result, pendingUserMessage };
  }
  return result;
}
