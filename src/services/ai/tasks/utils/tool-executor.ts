/**
 * 性能指标
 */
export interface PerformanceMetrics {
  totalTime: number;
  planningTime: number;
  workingTime: number;
  reviewTime: number;
  toolCallTime: number;
  toolCallCount: number;
  averageToolCallTime: number;
  chunkProcessingTime: number[];
}

import { ToolRegistry } from 'src/services/ai/tools/index';
import type { AIToolCall } from 'src/services/ai/types/ai-service';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import type { AIProcessingStore } from './task-types';

/**
 * 执行工具调用
 */
export async function executeToolCall(
  toolCall: AIToolCall,
  bookId: string,
  handleAction: (action: ActionInfo) => void,
  onToast: ToastCallback | undefined,
  taskId: string | undefined,
  aiProcessingStore: AIProcessingStore | undefined,
): Promise<void> {
  if (aiProcessingStore && taskId) {
    void aiProcessingStore.appendThinkingMessage(
      taskId,
      `\n[调用工具: ${toolCall.function.name}]\n`,
    );
  }

  // 执行工具
  const toolResult = await ToolRegistry.handleToolCall(
    toolCall,
    bookId,
    handleAction,
    onToast,
    taskId,
  );

  if (aiProcessingStore && taskId) {
    void aiProcessingStore.appendThinkingMessage(
      taskId,
      `[工具结果: ${toolResult.content.slice(0, 100)}...]\n`,
    );
  }
}
