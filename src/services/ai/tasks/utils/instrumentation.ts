import type { PerformanceMetrics } from './tool-executor';
import type { TaskStatus } from './task-types';

/**
 * 创建默认性能指标对象
 */
export function createInitialMetrics(): PerformanceMetrics {
  return {
    totalTime: 0,
    planningTime: 0,
    preparingTime: 0,
    workingTime: 0,
    reviewTime: 0,
    toolCallTime: 0,
    toolCallCount: 0,
    averageToolCallTime: 0,
    workingRejectedWriteCount: 0,
    chunkProcessingTime: [],
  };
}

/**
 * 记录一次工具调用耗时
 */
export function recordToolCall(metrics: PerformanceMetrics, duration: number): void {
  metrics.toolCallTime += duration;
  metrics.toolCallCount++;
}

/**
 * 统计状态停留耗时，返回新的 statusStartTime
 */
export function trackStatusDuration(
  metrics: PerformanceMetrics,
  prev: TaskStatus,
  next: TaskStatus,
  statusStartTime: number,
): number {
  if (prev === next) {
    return statusStartTime;
  }

  const now = Date.now();
  const duration = now - statusStartTime;

  switch (prev) {
    case 'planning':
      metrics.planningTime += duration;
      break;
    case 'preparing':
      metrics.preparingTime += duration;
      break;
    case 'working':
      metrics.workingTime += duration;
      break;
    case 'review':
      metrics.reviewTime += duration;
      break;
  }

  return now;
}

/**
 * 结束时汇总指标
 */
export function finalizeMetrics(metrics: PerformanceMetrics, startTime: number): void {
  metrics.totalTime = Date.now() - startTime;
  metrics.averageToolCallTime =
    metrics.toolCallCount > 0 ? metrics.toolCallTime / metrics.toolCallCount : 0;
}
