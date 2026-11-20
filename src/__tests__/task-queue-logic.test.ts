import { describe, expect, it } from 'vitest';
import type { TaskQueueItem } from 'src/models/task-queue';
import {
  planEnqueue,
  pickStartable,
  restoreInterruptedItems,
  reorderQueued,
  pruneFinished,
  type EnqueueRequest,
} from 'src/services/chapter-task/task-queue-logic';

let seq = 0;
function item(patch: Partial<TaskQueueItem>): TaskQueueItem {
  seq += 1;
  return {
    id: `q${seq}`,
    bookId: 'b1',
    chapterId: `c${seq}`,
    kind: 'translation',
    mode: 'continue',
    origin: 'batch',
    status: 'queued',
    order: seq,
    completedParagraphIds: [],
    aiTaskIds: [],
    enqueuedAt: seq,
    ...patch,
  };
}

const req = (chapterId: string, patch: Partial<EnqueueRequest> = {}): EnqueueRequest => ({
  bookId: 'b1',
  chapterId,
  kind: 'translation',
  mode: 'continue',
  origin: 'batch',
  ...patch,
});

let ids = 0;
const newId = () => `new${++ids}`;

describe('planEnqueue', () => {
  it('批量追加到队尾并保持传入（书中章节）顺序', () => {
    const existing = [item({ chapterId: 'x', order: 5 })];
    const plan = planEnqueue(existing, [req('c1'), req('c2')], { position: 'back', now: 100, newId });
    expect(plan.added.map((i) => i.chapterId)).toEqual(['c1', 'c2']);
    expect(plan.added[0]!.order).toBeGreaterThan(5);
    expect(plan.added[1]!.order).toBeGreaterThan(plan.added[0]!.order);
  });

  it('插到队首时排在所有排队项之前且保持相对顺序', () => {
    const existing = [item({ chapterId: 'x', order: 5 }), item({ chapterId: 'y', order: 6 })];
    const plan = planEnqueue(existing, [req('c1'), req('c2')], { position: 'front', now: 1, newId });
    const queue = [...existing, ...plan.added].sort((a, b) => a.order - b.order);
    expect(queue.map((i) => i.chapterId)).toEqual(['c1', 'c2', 'x', 'y']);
  });

  it('同章同类型已在排队或运行中时跳过并计数', () => {
    const existing = [
      item({ chapterId: 'c1', status: 'queued' }),
      item({ chapterId: 'c2', status: 'running' }),
      item({ chapterId: 'c3', status: 'done' }),
    ];
    const plan = planEnqueue(existing, [req('c1'), req('c2'), req('c3')], { position: 'back', now: 1, newId });
    expect(plan.added.map((i) => i.chapterId)).toEqual(['c3']);
    expect(plan.skippedDuplicate).toBe(2);
  });

  it('同一章节不同任务类型可以并存', () => {
    const existing = [item({ chapterId: 'c1', kind: 'translation' })];
    const plan = planEnqueue(existing, [req('c1', { kind: 'proofreading', mode: undefined })], { position: 'back', now: 1, newId });
    expect(plan.added).toHaveLength(1);
  });

  it('同一批请求内重复的章节只加一次', () => {
    const plan = planEnqueue([], [req('c1'), req('c1')], { position: 'back', now: 1, newId });
    expect(plan.added).toHaveLength(1);
    expect(plan.skippedDuplicate).toBe(1);
  });

  it('润色 / 校对不适用的章节跳过并计入不适用数', () => {
    const plan = planEnqueue(
      [],
      [req('c1', { kind: 'polish', mode: undefined }), req('c2', { kind: 'polish', mode: undefined })],
      { position: 'back', now: 1, newId, isApplicable: (r) => r.chapterId !== 'c2' },
    );
    expect(plan.added.map((i) => i.chapterId)).toEqual(['c1']);
    expect(plan.skippedNotApplicable).toBe(1);
  });

  it('新项为 queued、带来源与时间，翻译项保留 mode，润色项不带 mode', () => {
    const plan = planEnqueue([], [req('c1', { origin: 'manual' }), req('c2', { kind: 'polish', mode: 'retranslate' })], { position: 'front', now: 42, newId });
    expect(plan.added[0]).toMatchObject({ status: 'queued', origin: 'manual', mode: 'continue', enqueuedAt: 42, completedParagraphIds: [], aiTaskIds: [] });
    expect(plan.added[1]!.mode).toBeUndefined();
  });
});

describe('pickStartable', () => {
  const ctx = (patch: Partial<Parameters<typeof pickStartable>[1]> = {}) => ({
    paused: false,
    maxConcurrent: 2,
    restartPending: false,
    blockedBookIds: new Set<string>(),
    ...patch,
  });

  it('遵守全局上限', () => {
    const items = [item({ status: 'running' }), item({}), item({}), item({})];
    expect(pickStartable(items, ctx()).map((i) => i.id)).toEqual([items[1]!.id]);
  });

  it('调高上限时补位', () => {
    const items = [item({ status: 'running' }), item({}), item({}), item({})];
    expect(pickStartable(items, ctx({ maxConcurrent: 3 }))).toHaveLength(2);
  });

  it('调低上限时不返回任何项（不打断运行中的）', () => {
    const items = [item({ status: 'running' }), item({ status: 'running' }), item({ status: 'running' }), item({})];
    expect(pickStartable(items, ctx({ maxConcurrent: 1 }))).toEqual([]);
  });

  it('暂停或正在准备重启时不启动', () => {
    const items = [item({})];
    expect(pickStartable(items, ctx({ paused: true }))).toEqual([]);
    expect(pickStartable(items, ctx({ restartPending: true }))).toEqual([]);
  });

  it('按 order 选择', () => {
    const a = item({ order: 10 });
    const b = item({ order: 1 });
    expect(pickStartable([a, b], ctx({ maxConcurrent: 1 }))[0]!.id).toBe(b.id);
  });

  it('同一章节同时只运行一项，且不阻塞后面其他章节', () => {
    const running = item({ chapterId: 'c15', status: 'running' });
    const proof = item({ chapterId: 'c15', kind: 'proofreading', mode: undefined, order: 100 });
    const other = item({ chapterId: 'c16', order: 101 });
    expect(pickStartable([running, proof, other], ctx()).map((i) => i.id)).toEqual([other.id]);
  });

  it('同一批里同章节的两项只选一项', () => {
    const a = item({ chapterId: 'c1', order: 1 });
    const b = item({ chapterId: 'c1', kind: 'proofreading', mode: undefined, order: 2 });
    expect(pickStartable([a, b], ctx({ maxConcurrent: 5 })).map((i) => i.id)).toEqual([a.id]);
  });

  it('书籍被占用时跳过该书的项，继续选其他书', () => {
    const a = item({ bookId: 'busy', order: 1 });
    const b = item({ bookId: 'free', order: 2 });
    expect(pickStartable([a, b], ctx({ maxConcurrent: 1, blockedBookIds: new Set(['busy']) })).map((i) => i.id)).toEqual([b.id]);
  });

  it('已请求取消的排队项不启动', () => {
    const a = item({ cancelRequested: true });
    expect(pickStartable([a], ctx())).toEqual([]);
  });
});

describe('restoreInterruptedItems', () => {
  it('运行项回到排队并排在最前，保持相对顺序', () => {
    const r1 = item({ status: 'running', order: 7 });
    const q1 = item({ status: 'queued', order: 3 });
    const r2 = item({ status: 'running', order: 9 });
    const restored = restoreInterruptedItems([r1, q1, r2]);
    const queue = restored.filter((i) => i.status === 'queued').sort((a, b) => a.order - b.order);
    expect(queue.map((i) => i.id)).toEqual([r1.id, r2.id, q1.id]);
  });

  it('请求了取消的运行项改为已取消', () => {
    const r = item({ status: 'running', cancelRequested: true });
    expect(restoreInterruptedItems([r])[0]!.status).toBe('cancelled');
  });

  it('没有运行项时原样返回', () => {
    const q = item({});
    expect(restoreInterruptedItems([q])).toEqual([q]);
  });
});

describe('reorderQueued', () => {
  it('把第 3 位移到第 1 位后它成为下一个', () => {
    const a = item({ order: 1 });
    const b = item({ order: 2 });
    const c = item({ order: 3 });
    const next = reorderQueued([a, b, c], c.id, 0);
    const queue = next.sort((x, y) => x.order - y.order);
    expect(queue.map((i) => i.id)).toEqual([c.id, a.id, b.id]);
  });
});

describe('pruneFinished', () => {
  it('已结束项超过上限时删除最旧的，不碰排队和运行项', () => {
    const finished = Array.from({ length: 5 }, (_, k) => item({ status: 'done', endedAt: k }));
    const live = [item({ status: 'queued' }), item({ status: 'running' })];
    const removed = pruneFinished([...finished, ...live], 3);
    expect(removed).toEqual([finished[0]!.id, finished[1]!.id]);
  });
});
