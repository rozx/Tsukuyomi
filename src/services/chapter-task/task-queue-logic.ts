import type {
  TaskQueueItem,
  TaskQueueKind,
  TaskQueueOrigin,
  TaskQueueTranslationMode,
} from 'src/models/task-queue';
import { isTaskQueueItemPending } from 'src/models/task-queue';

/** 入队请求：一个章节的一种任务 */
export interface EnqueueRequest {
  bookId: string;
  chapterId: string;
  kind: TaskQueueKind;
  mode?: TaskQueueTranslationMode | undefined;
  origin: TaskQueueOrigin;
}

export interface EnqueuePlan {
  added: TaskQueueItem[];
  /** 同章同类型已在排队 / 运行中（或同一批重复）而跳过的数量 */
  skippedDuplicate: number;
  /** 润色 / 校对时章节没有译文等不适用而跳过的数量 */
  skippedNotApplicable: number;
}

const dedupeKey = (value: { chapterId: string; kind: TaskQueueKind }) =>
  `${value.chapterId}\u0000${value.kind}`;

function queuedOrders(items: readonly TaskQueueItem[]): number[] {
  return items.filter((entry) => entry.status === 'queued').map((entry) => entry.order);
}

/**
 * 计算一次入队的结果（纯函数，调用方在同一事务内读取现有项并写入 added）。
 *
 * - 按传入顺序入队（批量时调用方按书中章节顺序传入）
 * - position=front 时排在所有排队项之前，back 时排在所有项之后
 * - 同章同类型已在排队或运行中时跳过
 */
export function planEnqueue(
  existing: readonly TaskQueueItem[],
  requests: readonly EnqueueRequest[],
  options: {
    position: 'front' | 'back';
    now: number;
    newId: () => string;
    isApplicable?: (request: EnqueueRequest) => boolean;
  },
): EnqueuePlan {
  const pending = new Set(
    existing.filter((entry) => isTaskQueueItemPending(entry.status)).map(dedupeKey),
  );
  const accepted: EnqueueRequest[] = [];
  let skippedDuplicate = 0;
  let skippedNotApplicable = 0;
  for (const request of requests) {
    const key = dedupeKey(request);
    if (pending.has(key)) {
      skippedDuplicate += 1;
      continue;
    }
    if (options.isApplicable && !options.isApplicable(request)) {
      skippedNotApplicable += 1;
      continue;
    }
    pending.add(key);
    accepted.push(request);
  }

  const allOrders = existing.map((entry) => entry.order);
  const queued = queuedOrders(existing);
  const base =
    options.position === 'front'
      ? (queued.length ? Math.min(...queued) : allOrders.length ? Math.max(...allOrders) + 1 : 0) -
        accepted.length
      : (allOrders.length ? Math.max(...allOrders) : 0) + 1;

  const added = accepted.map<TaskQueueItem>((request, index) => ({
    id: options.newId(),
    bookId: request.bookId,
    chapterId: request.chapterId,
    kind: request.kind,
    ...(request.kind === 'translation' ? { mode: request.mode ?? 'continue' } : {}),
    origin: request.origin,
    status: 'queued',
    order: base + index,
    completedParagraphIds: [],
    aiTaskIds: [],
    enqueuedAt: options.now,
  }));
  return { added, skippedDuplicate, skippedNotApplicable };
}

/** 调度判定的上下文；以后加每模型上限只需扩展这里 */
export interface ScheduleContext {
  paused: boolean;
  maxConcurrent: number;
  /** 桌面端正在准备或已提交更新重启 */
  restartPending: boolean;
  /** 被独占操作占用、暂时不能启动的书籍 */
  blockedBookIds: ReadonlySet<string>;
}

/**
 * 选出现在应该启动的排队项（按 order）。
 * 规则：未暂停、未在准备重启、运行数未达上限、同一章节同时只运行一项、书籍未被占用。
 * 不满足「同章唯一」或书籍被占用的项保持排队，让后面的其他章节先启动。
 */
export function pickStartable(
  items: readonly TaskQueueItem[],
  ctx: ScheduleContext,
): TaskQueueItem[] {
  if (ctx.paused || ctx.restartPending) return [];
  const running = items.filter((entry) => entry.status === 'running');
  let slots = ctx.maxConcurrent - running.length;
  if (slots <= 0) return [];
  const busyChapters = new Set(running.map((entry) => entry.chapterId));
  const picked: TaskQueueItem[] = [];
  const queued = items
    .filter((entry) => entry.status === 'queued' && !entry.cancelRequested)
    .sort((a, b) => a.order - b.order);
  for (const entry of queued) {
    if (slots <= 0) break;
    if (busyChapters.has(entry.chapterId)) continue;
    if (ctx.blockedBookIds.has(entry.bookId)) continue;
    picked.push(entry);
    busyChapters.add(entry.chapterId);
    slots -= 1;
  }
  return picked;
}

/**
 * 把上次未结束的运行项恢复为排队：排到所有排队项之前，保持原相对顺序。
 * 已请求取消的运行项直接改为已取消。返回新数组，不修改入参。
 */
export function restoreInterruptedItems(items: readonly TaskQueueItem[]): TaskQueueItem[] {
  const interrupted = items
    .filter((entry) => entry.status === 'running')
    .sort((a, b) => a.order - b.order);
  if (interrupted.length === 0) return [...items];
  const queued = queuedOrders(items);
  const allOrders = items.map((entry) => entry.order);
  const front =
    (queued.length ? Math.min(...queued) : Math.max(...allOrders) + 1) - interrupted.length;
  const position = new Map(interrupted.map((entry, index) => [entry.id, front + index]));
  return items.map((entry) => {
    if (entry.status !== 'running') return entry;
    if (entry.cancelRequested) {
      return { ...entry, status: 'cancelled' as const, cancelRequested: false };
    }
    return { ...entry, status: 'queued' as const, order: position.get(entry.id)! };
  });
}

/** 把排队项移到排队序列中的指定位置（0 为下一个），返回重新编号后的全部项 */
export function reorderQueued(
  items: readonly TaskQueueItem[],
  itemId: string,
  toIndex: number,
): TaskQueueItem[] {
  const queued = items
    .filter((entry) => entry.status === 'queued')
    .sort((a, b) => a.order - b.order);
  const from = queued.findIndex((entry) => entry.id === itemId);
  if (from < 0) return [...items];
  const [moved] = queued.splice(from, 1);
  queued.splice(Math.max(0, Math.min(toIndex, queued.length)), 0, moved!);
  const orders = queuedOrders(items).sort((a, b) => a - b);
  const renumber = new Map(queued.map((entry, index) => [entry.id, orders[index]!]));
  return items.map((entry) =>
    renumber.has(entry.id) ? { ...entry, order: renumber.get(entry.id)! } : entry,
  );
}

/** 已结束项超过上限时返回应删除的最旧项 ID（按结束时间） */
export function pruneFinished(items: readonly TaskQueueItem[], limit: number): string[] {
  const finished = items
    .filter((entry) => !isTaskQueueItemPending(entry.status))
    .sort((a, b) => (a.endedAt ?? a.enqueuedAt) - (b.endedAt ?? b.enqueuedAt));
  const excess = finished.length - limit;
  return excess > 0 ? finished.slice(0, excess).map((entry) => entry.id) : [];
}
