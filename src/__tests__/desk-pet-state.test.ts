import { describe, expect, it } from 'vitest';
import {
  nextFollowed,
  petMood,
  pickCandidates,
  type DeskPetTaskRef,
} from 'src/composables/desk-pet/desk-pet-state';

const chapter = (id: string, chapterId: string): DeskPetTaskRef => ({
  id,
  kind: 'chapter',
  bookId: 'b',
  chapterId,
});
const assistant: DeskPetTaskRef = { id: 'ai-1', kind: 'assistant' };
const base = {
  chapterTasks: [chapter('q1', 'c1'), chapter('q2', 'c2')],
  assistant,
  readingChapter: { bookId: 'b', chapterId: 'c2' },
  taskCenterVisible: false,
  assistantPanelOpen: false,
};

describe('pickCandidates：可跟随的任务与优先级', () => {
  it('助手 > 正在阅读的章节 > 其他章节', () => {
    expect(pickCandidates(base).map((task) => task.id)).toEqual(['ai-1', 'q2', 'q1']);
  });

  it('没有正在阅读的章节时章节保持队列顺序', () => {
    expect(pickCandidates({ ...base, readingChapter: null }).map((task) => task.id)).toEqual([
      'ai-1',
      'q1',
      'q2',
    ]);
  });

  it('任务中心可见时剔除章节任务', () => {
    expect(pickCandidates({ ...base, taskCenterVisible: true }).map((task) => task.id)).toEqual([
      'ai-1',
    ]);
  });

  it('助手面板打开时剔除助手', () => {
    expect(pickCandidates({ ...base, assistantPanelOpen: true }).map((task) => task.id)).toEqual([
      'q2',
      'q1',
    ]);
  });

  it('没有运行中的任务时为空', () => {
    expect(pickCandidates({ ...base, chapterTasks: [], assistant: null })).toEqual([]);
  });
});

describe('nextFollowed：跟随直到结束', () => {
  const candidates = pickCandidates(base);

  it('没有正在跟随的任务时取优先级最高的', () => {
    expect(nextFollowed(null, candidates, null)).toBe('ai-1');
  });

  it('当前任务仍在候选里就保持，即使出现更高优先级的任务', () => {
    expect(nextFollowed('q1', candidates, null)).toBe('q1');
  });

  it('当前任务结束（不在候选里）后取候选第一个', () => {
    expect(nextFollowed('gone', candidates, null)).toBe('ai-1');
  });

  it('手动选择优先，且持续到该任务结束', () => {
    expect(nextFollowed('ai-1', candidates, 'q1')).toBe('q1');
    expect(nextFollowed('q1', candidates.filter((task) => task.id !== 'q1'), 'q1')).toBe('ai-1');
  });

  it('没有候选时为 null', () => {
    expect(nextFollowed('q1', [], 'q1')).toBeNull();
  });
});

describe('petMood：头像状态', () => {
  it('有运行中的可跟随任务时为 running', () => {
    expect(petMood({ running: 2, hasSummary: false })).toBe('running');
    expect(petMood({ running: 1, hasSummary: true })).toBe('running');
  });

  it('没有运行中任务但有未查看的小结时为 review', () => {
    expect(petMood({ running: 0, hasSummary: true })).toBe('review');
  });

  it('否则为 idle', () => {
    expect(petMood({ running: 0, hasSummary: false })).toBe('idle');
  });
});
