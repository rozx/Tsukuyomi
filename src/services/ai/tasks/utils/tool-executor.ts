/**
 * 性能指标
 */
export interface PerformanceMetrics {
  totalTime: number;
  planningTime: number;
  preparingTime: number;
  workingTime: number;
  reviewTime: number;
  toolCallTime: number;
  toolCallCount: number;
  averageToolCallTime: number;
  workingRejectedWriteCount: number;
  chunkProcessingTime: number[];
}

import { ToolRegistry } from 'src/services/ai/tools/index';
import type { AIToolCall } from 'src/services/ai/types/ai-service';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import type { AIProcessingStore } from './task-types';

/**
 * 执行工具调用
 * @param paragraphIds 当前块的段落 ID 列表，用于边界限制（可选）
 */
export async function executeToolCall(
  toolCall: AIToolCall,
  bookId: string,
  handleAction: (action: ActionInfo) => void,
  onToast: ToastCallback | undefined,
  taskId: string | undefined,
  aiProcessingStore: AIProcessingStore | undefined,
  aiModelId: string | undefined,
  paragraphIds?: string[], // 当前块的段落 ID 列表，用于边界限制
  chunkIndex?: number, // 当前 chunk 索引，用于 review 检查
  submittedParagraphIds?: Set<string>, // 已提交段落 ID 集合，用于计算剩余 chunk 大小
): Promise<void> {
  if (aiProcessingStore && taskId) {
    void aiProcessingStore.appendThinkingMessage(
      taskId,
      `\n[调用工具: ${toolCall.function.name}]\n`,
    );
  }

  // 执行工具，传入段落 ID 列表以启用块边界限制
  const toolResult = await ToolRegistry.handleToolCall(
    toolCall,
    bookId,
    handleAction,
    onToast,
    taskId,
    undefined, // sessionId 不需要
    paragraphIds,
    aiProcessingStore, // 传入 AI 处理 Store
    aiModelId,
    chunkIndex,
    submittedParagraphIds,
  );

  if (aiProcessingStore && taskId) {
    void aiProcessingStore.appendThinkingMessage(taskId, `[工具结果: ${toolResult.content}]\n`);
  }
}
