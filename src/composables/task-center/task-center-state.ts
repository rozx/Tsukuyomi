import type { TaskQueueItem } from 'src/models/task-queue';
import { isTaskQueueItemPending } from 'src/models/task-queue';
import type { AIProcessingTask } from 'src/stores/ai-processing';

export type ChipState =
  | { kind: 'idle' }
  | { kind: 'running'; running: number; queued: 0 }
  | { kind: 'running-queued'; running: number; queued: number }
  | { kind: 'paused'; queued: number }
  | { kind: 'other' }
  | { kind: 'finished'; done: number; failed: number; cancelled: number };

/**
 * 任务中心 chip 的形态。
 * - 有章节任务运行：运行数（+ 排队数）
 * - 暂停且有排队：暂停标识 + 排队数
 * - 只有其他 AI 活动或后台向量化：活动指示（不计入运行数 / 排队数 / 进度条）
 * - 批次结束：在用户打开任务中心（acknowledgedAt）之前保留完成 / 失败数
 */
export function computeChipState(input: {
  items: readonly TaskQueueItem[];
  otherActive: number;
  /** 后台向量化正在处理或有待处理项（未被暂停 / 同步挂起） */
  backgroundActive?: boolean;
  paused: boolean;
  acknowledgedAt: number;
}): ChipState {
  const running = input.items.filter((item) => item.status === 'running').length;
  const queued = input.items.filter((item) => item.status === 'queued').length;
  if (running > 0) {
    return queued > 0
      ? { kind: 'running-queued', running, queued }
      : { kind: 'running', running, queued: 0 };
  }
  if (queued > 0 && input.paused) return { kind: 'paused', queued };
  if (queued > 0) return { kind: 'running-queued', running: 0, queued };
  if (input.otherActive > 0 || input.backgroundActive) return { kind: 'other' };
  const unseen = input.items.filter(
    (item) => !isTaskQueueItemPending(item.status) && (item.endedAt ?? 0) > input.acknowledgedAt,
  );
  if (unseen.length > 0) {
    return {
      kind: 'finished',
      done: unseen.filter((item) => item.status === 'done').length,
      failed: unseen.filter((item) => item.status === 'failed').length,
      cancelled: unseen.filter((item) => item.status === 'cancelled').length,
    };
  }
  return { kind: 'idle' };
}

/** 单个队列项的进度（由断点信息推导，跨标签页一致） */
export function itemProgress(item: TaskQueueItem): {
  current: number;
  total: number;
  percent: number;
} {
  if (item.status === 'done') {
    const total = item.targetParagraphIds?.length ?? 0;
    return { current: total, total, percent: 100 };
  }
  const total = item.targetParagraphIds?.length ?? 0;
  if (total === 0) return { current: 0, total: 0, percent: 0 };
  const target = new Set(item.targetParagraphIds);
  const current = item.completedParagraphIds.filter((id) => target.has(id)).length;
  return { current, total, percent: Math.round((current / total) * 100) };
}

/**
 * chip 上的整体进度：确认之后结束的项 + 运行中项的进度 + 排队项。
 * 返回已完成段与运行中段占总长度的百分比，用于分段进度条。
 */
export function overallProgress(
  items: readonly TaskQueueItem[],
  acknowledgedAt: number,
): { done: number; total: number; donePercent: number; runningPercent: number } {
  const finished = items.filter(
    (item) => !isTaskQueueItemPending(item.status) && (item.endedAt ?? 0) > acknowledgedAt,
  );
  const running = items.filter((item) => item.status === 'running');
  const queued = items.filter((item) => item.status === 'queued');
  const total = finished.length + running.length + queued.length;
  if (total === 0) return { done: 0, total: 0, donePercent: 0, runningPercent: 0 };
  const runningShare = running.reduce((sum, item) => sum + itemProgress(item).percent / 100, 0);
  return {
    done: finished.length,
    total,
    donePercent: (finished.length / total) * 100,
    runningPercent: (runningShare / total) * 100,
  };
}

/**
 * 是否归入「其他 AI 活动」：除队列任务记录外的全部 AI 任务
 * （助手、单段任务、术语翻译，以及升级前遗留的章节级记录）。
 */
export function isOtherActivity(task: AIProcessingTask): boolean {
  return !task.queueItemId;
}

export function isRunningTask(task: AIProcessingTask): boolean {
  return task.status === 'thinking' || task.status === 'processing';
}
