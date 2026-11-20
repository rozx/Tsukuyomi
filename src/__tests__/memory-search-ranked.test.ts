import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Memory } from 'src/models/memory';
import type { ScoreBreakdown } from 'src/models/novel';
import { MemoryService } from 'src/services/memory-service';
import { useBooksStore } from 'src/stores/books';
import { useSettingsStore } from 'src/stores/settings';

// 用可控的分数模拟「语义检索开启时分数拉开」的情况：真实打分依赖本地嵌入模型
const { scoreBySummary } = vi.hoisted(() => ({
  scoreBySummary: new Map<string, { total: number; semantic: number; keyword: number }>(),
}));
vi.mock('src/services/memory-scoring', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    scoreMemoriesBatch: (memories: Memory[]) =>
      memories.map((memory) => {
        const score = scoreBySummary.get(memory.summary) ?? { total: 0, semantic: 0, keyword: 0 };
        const breakdown: ScoreBreakdown = {
          scoringMode: 'semantic',
          semantic: score.semantic,
          keyword: score.keyword,
          recency: 1,
          semanticWeighted: score.semantic * 0.85,
          keywordWeighted: score.keyword * 0.1,
          recencyWeighted: 0.05,
          total: score.total,
        };
        return { memory, breakdown };
      }),
  };
});

const BOOK_ID = 'book-ranked-1';

describe('MemoryService.searchMemoriesWithScores 的两种取舍方式', () => {
  beforeEach(async () => {
    await useSettingsStore().loadSettings();
    await useBooksStore().loadBooks();
    scoreBySummary.clear();
    const scores: Array<[string, number, number, number]> = [
      // 摘要、总分、语义分、关键词分
      ['最相关', 0.9, 0.9, 1],
      ['比较相关', 0.7, 0.7, 0.5],
      ['有点相关', 0.5, 0.5, 0.25],
      ['低于注入阈值但有命中', 0.2, 0.15, 0.25],
      ['完全无关', 0.05, 0, 0],
    ];
    for (const [summary, total, semantic, keyword] of scores) {
      scoreBySummary.set(summary, { total, semantic, keyword });
      await MemoryService.createMemory(BOOK_ID, `${summary}的正文`, summary);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('默认方式与翻译注入一致：只保留分数紧贴最高分的条目', async () => {
    const scored = await MemoryService.searchMemoriesWithScores(BOOK_ID, '任意查询', 8, 'zh-CN');
    expect(scored.map((item) => item.memory.summary)).toEqual(['最相关']);
  });

  it('排序方式：有任何命中的都按分数从高到低返回，不套用注入阈值，只去掉完全无关的', async () => {
    const scored = await MemoryService.searchMemoriesWithScores(BOOK_ID, '任意查询', 8, 'zh-CN', {
      ranked: true,
    });
    expect(scored.map((item) => item.memory.summary)).toEqual([
      '最相关',
      '比较相关',
      '有点相关',
      '低于注入阈值但有命中',
    ]);
  });

  it('排序方式遵守条数上限', async () => {
    const scored = await MemoryService.searchMemoriesWithScores(BOOK_ID, '任意查询', 2, 'zh-CN', {
      ranked: true,
    });
    expect(scored.map((item) => item.memory.summary)).toEqual(['最相关', '比较相关']);
  });
});
