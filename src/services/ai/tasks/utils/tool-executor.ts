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
  workingRejectedWriteCount: number;
  chunkProcessingTime: number[];
}
