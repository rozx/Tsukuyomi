/**
 * AI 思考过程卡片（`ThinkingTaskCard.vue` / `ThinkingReviewedCard.vue`）共享的
 * 派生逻辑：状态图标查表、任务类型标签、运行时长格式化、是否含思考内容判断。
 *
 * 两个卡片原本各自重复声明 `typeLabel` / `formatDuration` / `hasThinking`，
 * 集中到这里后两边复用同一份实现（行为与输出完全不变）。
 *
 * `statusIconMap` 由各卡片传入——「进行中」卡片包含 thinking/processing 旋转图标，
 * 「已完成」卡片只有 end/error/cancelled 三态，故图标表保留在调用方。
 */
import type { Ref } from 'vue';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { TASK_TYPE_LABELS } from 'src/constants/ai';
import { formatTaskDuration } from 'src/utils';

export function useThinkingTaskCard(
  nowMs: Ref<number> | (() => number),
  statusIconMap: Record<string, string>,
) {
  const getNowMs = (): number => (typeof nowMs === 'function' ? nowMs() : nowMs.value);

  const statusIcon = (status: string): string => statusIconMap[status] ?? '';
  const typeLabel = (type: AIProcessingTask['type']): string =>
    TASK_TYPE_LABELS[type] || type;
  const formatDuration = (startTime: number, endTime?: number): string =>
    formatTaskDuration(startTime, endTime, getNowMs());
  const hasThinking = (t: AIProcessingTask): boolean =>
    !!t.thinkingMessage && t.thinkingMessage.trim() !== '';

  return { statusIcon, typeLabel, formatDuration, hasThinking };
}
