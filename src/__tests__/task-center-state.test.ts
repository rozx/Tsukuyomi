import { describe, expect, it } from 'vitest';
import type { TaskQueueItem } from 'src/models/task-queue';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import {
  computeChipState,
  itemProgress,
  overallProgress,
  isOtherActivity,
} from 'src/composables/task-center/task-center-state';

let seq = 0;
function item(patch: Partial<TaskQueueItem>): TaskQueueItem {
  seq += 1;
  return {
    id: `q${seq}`,
    bookId: 'b',
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

const base = {
  items: [] as TaskQueueItem[],
  otherActive: 0,
  backgroundActive: false,
  paused: false,
  acknowledgedAt: 0,
};

describe('computeChipState', () => {
  it('全部空闲', () => {
    expect(computeChipState(base).kind).toBe('idle');
  });

  it('只有章节任务运行', () => {
    const state = computeChipState({ ...base, items: [item({ status: 'running' })] });
    expect(state).toMatchObject({ kind: 'running', running: 1, queued: 0 });
  });

  it('运行 + 排队', () => {
    const state = computeChipState({
      ...base,
      items: [item({ status: 'running' }), item({ status: 'running' }), item({}), item({})],
    });
    expect(state).toMatchObject({ kind: 'running-queued', running: 2, queued: 2 });
  });

  it('只有其他 AI 活动', () => {
    expect(computeChipState({ ...base, otherActive: 1 }).kind).toBe('other');
  });

  it('只有向量化在运行：显示活动指示', () => {
    expect(computeChipState({ ...base, backgroundActive: true }).kind).toBe('other');
  });

  it('章节任务与向量化同时进行：运行数只反映章节任务', () => {
    const state = computeChipState({
      ...base,
      backgroundActive: true,
      items: [item({ status: 'running' }), item({ status: 'running' })],
    });
    expect(state).toMatchObject({ kind: 'running', running: 2, queued: 0 });
  });

  it('向量化之外没有活动：批次结果仍优先于空闲', () => {
    const items = [item({ status: 'done', endedAt: 10 })];
    expect(computeChipState({ ...base, items }).kind).toBe('finished');
    expect(computeChipState({ ...base, items, backgroundActive: true }).kind).toBe('other');
  });

  it('批次结束后保留结果直到确认', () => {
    const items = [item({ status: 'done', endedAt: 10 }), item({ status: 'failed', endedAt: 11 })];
    expect(computeChipState({ ...base, items })).toMatchObject({
      kind: 'finished',
      done: 1,
      failed: 1,
    });
    expect(computeChipState({ ...base, items, acknowledgedAt: 20 }).kind).toBe('idle');
  });

  it('队列暂停且有排队项', () => {
    expect(computeChipState({ ...base, paused: true, items: [item({})] })).toMatchObject({
      kind: 'paused',
      queued: 1,
    });
  });
});

describe('itemProgress', () => {
  it('按断点信息计算百分比', () => {
    const p = itemProgress(
      item({
        status: 'running',
        targetParagraphIds: ['a', 'b', 'c', 'd'],
        completedParagraphIds: ['a'],
      }),
    );
    expect(p).toEqual({ current: 1, total: 4, percent: 25 });
  });

  it('尚未快照时为 0，已完成为 100', () => {
    expect(itemProgress(item({})).percent).toBe(0);
    expect(itemProgress(item({ status: 'done' })).percent).toBe(100);
  });
});

describe('overallProgress', () => {
  it('统计确认之后的已完成、运行中进度与排队', () => {
    const items = [
      item({ status: 'done', endedAt: 5 }),
      item({ status: 'done', endedAt: 15 }),
      item({ status: 'running', targetParagraphIds: ['a', 'b'], completedParagraphIds: ['a'] }),
      item({}),
    ];
    const result = overallProgress(items, 10);
    expect(result.done).toBe(1);
    expect(result.total).toBe(3);
    expect(result.donePercent).toBeCloseTo(33.33, 1);
    expect(result.runningPercent).toBeCloseTo(16.67, 1);
  });
});

describe('isOtherActivity', () => {
  const task = (patch: Partial<AIProcessingTask>) =>
    ({
      id: 't',
      type: 'translation',
      modelName: 'M',
      status: 'thinking',
      startTime: 1,
      ...patch,
    }) as AIProcessingTask;

  it('队列任务记录不算其他活动', () => {
    expect(isOtherActivity(task({ queueItemId: 'q1' }))).toBe(false);
  });

  it('助手、单段任务、术语翻译与遗留章节记录算其他活动', () => {
    expect(isOtherActivity(task({ type: 'assistant' }))).toBe(true);
    expect(isOtherActivity(task({ isSingleParagraph: true }))).toBe(true);
    expect(isOtherActivity(task({ type: 'termsTranslation' }))).toBe(true);
    expect(isOtherActivity(task({ type: 'translation' }))).toBe(true);
  });
});
