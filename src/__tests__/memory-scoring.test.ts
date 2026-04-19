import { describe, test, expect } from 'bun:test';
import type { Memory } from 'src/models/memory';
import {
  calculateKeywordHitRatio,
  calculateRecencyFactor,
  calculateSemanticSim,
  scoreMemory,
  selectByBudget,
  filterByRelativeRanking,
  SCORING_WEIGHTS,
  FALLBACK_WEIGHTS,
  MAX_TOTAL_SCORE,
  DEFAULT_MIN_SCORE,
} from 'src/services/memory-scoring';
import type { ScoredMemory } from 'src/services/memory-scoring';

// 部分测试只关心"绝对阈值 / 预算 / hardCap"这一层,不测相对排名收缩。
// 用这两个参数关掉默认的 top-K + delta 收缩,避免 test fixture 的大幅分差
// 被相对窗口过滤掉。新行为由专门的 describe 块覆盖。
const LOOSE_TOPK = 999;
const LOOSE_DELTA = 999;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  const mem: Memory = {
    id: overrides.id ?? 'm1',
    bookId: overrides.bookId ?? 'b1',
    content: overrides.content ?? '',
    summary: overrides.summary ?? '',
    createdAt: overrides.createdAt ?? 0,
    lastAccessedAt: overrides.lastAccessedAt ?? 0,
  };
  if (overrides.embedding !== undefined) mem.embedding = overrides.embedding;
  if (overrides.embeddingModel !== undefined) mem.embeddingModel = overrides.embeddingModel;
  return mem;
}

describe('memory-scoring - calculateKeywordHitRatio', () => {
  test('空实体集合返回 0', () => {
    const memory = makeMemory({ summary: '主角叫小明', content: '他是一名学生' });
    expect(calculateKeywordHitRatio(memory, [])).toBe(0);
  });

  test('全部命中时返回 1', () => {
    const memory = makeMemory({
      summary: '小明和小红在学校',
      content: '',
    });
    const ratio = calculateKeywordHitRatio(memory, [{ name: '小明' }, { name: '小红' }]);
    expect(ratio).toBe(1);
  });

  test('部分命中返回正确比例', () => {
    const memory = makeMemory({
      summary: '小明在学校',
      content: '他很努力',
    });
    const ratio = calculateKeywordHitRatio(memory, [
      { name: '小明' },
      { name: '小红' },
      { name: '小刚' },
    ]);
    expect(ratio).toBeCloseTo(1 / 3, 5);
  });

  test('跨 summary 与 content 的命中也算', () => {
    const memory = makeMemory({
      summary: '小明是学生',
      content: '他认识小红',
    });
    const ratio = calculateKeywordHitRatio(memory, [{ name: '小明' }, { name: '小红' }]);
    expect(ratio).toBe(1);
  });

  test('空名称会被跳过,但仍计入分母', () => {
    const memory = makeMemory({ summary: '小明' });
    const ratio = calculateKeywordHitRatio(memory, [{ name: '小明' }, { name: '  ' }]);
    expect(ratio).toBe(0.5);
  });
});

describe('memory-scoring - calculateRecencyFactor', () => {
  test('刚刚访问过的记忆接近 1', () => {
    const now = 1_000_000_000;
    const memory = makeMemory({ lastAccessedAt: now });
    expect(calculateRecencyFactor(memory, now)).toBeCloseTo(1, 5);
  });

  test('30 天前的记忆约为 1/e', () => {
    const now = 1_000_000_000;
    const memory = makeMemory({ lastAccessedAt: now - 30 * MS_PER_DAY });
    expect(calculateRecencyFactor(memory, now)).toBeCloseTo(1 / Math.E, 4);
  });

  test('非常旧的记忆趋近 0', () => {
    const now = 1_000_000_000;
    const memory = makeMemory({ lastAccessedAt: now - 365 * MS_PER_DAY });
    const r = calculateRecencyFactor(memory, now);
    expect(r).toBeLessThan(0.001);
    expect(r).toBeGreaterThanOrEqual(0);
  });

  test('未来的 lastAccessedAt 视为 0 age 返回 1', () => {
    const now = 1_000_000_000;
    const memory = makeMemory({ lastAccessedAt: now + 10 * MS_PER_DAY });
    expect(calculateRecencyFactor(memory, now)).toBeCloseTo(1, 5);
  });
});

describe('memory-scoring - calculateSemanticSim', () => {
  test('任一为空返回 0', () => {
    expect(calculateSemanticSim(undefined, [1, 0])).toBe(0);
    expect(calculateSemanticSim([1, 0], undefined)).toBe(0);
    expect(calculateSemanticSim([], [1])).toBe(0);
  });

  test('维度不匹配返回 0', () => {
    expect(calculateSemanticSim([1, 0], [1, 0, 0])).toBe(0);
  });

  test('相同向量返回 1', () => {
    const v = [0.6, 0.8];
    expect(calculateSemanticSim(v, v)).toBeCloseTo(1, 5);
  });

  test('正交向量返回 0', () => {
    expect(calculateSemanticSim([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  test('反向向量 clamp 到 0', () => {
    expect(calculateSemanticSim([1, 0], [-1, 0])).toBe(0);
  });

  test('结果 clamp 在 [0, 1]', () => {
    const a = [0.5, 0.5];
    const b = [0.5, 0.5];
    const sim = calculateSemanticSim(a, b);
    expect(sim).toBeGreaterThanOrEqual(0);
    expect(sim).toBeLessThanOrEqual(1);
  });

  test('支持 Float32Array', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([1, 0]);
    expect(calculateSemanticSim(a, b)).toBeCloseTo(1, 5);
  });
});

describe('memory-scoring - scoreMemory', () => {
  test('完整三信号加权返回正确总分', () => {
    const now = 1_000_000_000;
    const memory = makeMemory({
      summary: '小明是学生',
      content: '',
      embedding: [1, 0],
      lastAccessedAt: now,
    });
    const breakdown = scoreMemory(memory, {
      chunkEntities: [{ name: '小明' }],
      chunkEmbedding: [1, 0],
      now,
    });

    expect(breakdown.semantic).toBeCloseTo(1, 5);
    expect(breakdown.keyword).toBeCloseTo(1, 5);
    expect(breakdown.recency).toBeCloseTo(1, 5);
    expect(breakdown.semanticWeighted).toBeCloseTo(SCORING_WEIGHTS.semantic, 5);
    expect(breakdown.keywordWeighted).toBeCloseTo(SCORING_WEIGHTS.keyword, 5);
    expect(breakdown.recencyWeighted).toBeCloseTo(SCORING_WEIGHTS.recency, 5);
    expect(breakdown.total).toBeCloseTo(MAX_TOTAL_SCORE, 5);
  });

  test('缺失 embedding 时 semantic=0, 使用降级权重 keyword/recency 仍生效', () => {
    const now = 1_000_000_000;
    const memory = makeMemory({
      summary: '小明',
      lastAccessedAt: now,
    });
    const breakdown = scoreMemory(memory, {
      chunkEntities: [{ name: '小明' }],
      chunkEmbedding: [1, 0],
      now,
    });

    // memory 没有 embedding,无法计算语义相似度,使用降级权重
    expect(breakdown.semantic).toBe(0);
    expect(breakdown.keyword).toBeCloseTo(1, 5);
    expect(breakdown.recency).toBeCloseTo(1, 5);
    // 降级权重: keyword=0.75, recency=0.25, 总分 = 0.75 + 0.25 = 1.0
    expect(breakdown.total).toBeCloseTo(
      FALLBACK_WEIGHTS.keyword + FALLBACK_WEIGHTS.recency,
      5,
    );
  });

  test('新记忆无向量仍可通过默认阈值', () => {
    const now = 1_000_000_000;
    const memory = makeMemory({
      summary: '小明出场',
      lastAccessedAt: now,
    });
    const breakdown = scoreMemory(memory, {
      chunkEntities: [{ name: '小明' }],
      chunkEmbedding: undefined,
      now,
    });
    // keyword(2.0) + recency(1.0) = 3.0 >> 0.3
    expect(breakdown.total).toBeGreaterThan(DEFAULT_MIN_SCORE);
  });

  test('只有时间衰减且已很久的记忆应低于阈值', () => {
    const now = 1_000_000_000;
    const memory = makeMemory({
      summary: '无关内容',
      lastAccessedAt: now - 180 * MS_PER_DAY,
    });
    const breakdown = scoreMemory(memory, {
      chunkEntities: [{ name: '小明' }],
      chunkEmbedding: undefined,
      now,
    });
    expect(breakdown.total).toBeLessThan(DEFAULT_MIN_SCORE);
  });
});

describe('memory-scoring - selectByBudget', () => {
  function scored(id: string, summary: string, total: number): ScoredMemory {
    return {
      memory: makeMemory({ id, summary }),
      breakdown: {
        semantic: 0,
        keyword: 0,
        recency: 0,
        semanticWeighted: 0,
        keywordWeighted: 0,
        recencyWeighted: 0,
        total,
      },
    };
  }

  test('空候选返回空数组', () => {
    expect(selectByBudget([])).toEqual([]);
  });

  test('全部低于阈值返回空数组', () => {
    const list = [scored('a', 'x', 0.1), scored('b', 'y', 0.2)];
    expect(selectByBudget(list, 2000, 25, 0.3, LOOSE_TOPK, LOOSE_DELTA)).toEqual([]);
  });

  test('按分数降序返回', () => {
    const list = [
      scored('low', 'aa', 1.0),
      scored('high', 'bb', 5.0),
      scored('mid', 'cc', 3.0),
    ];
    const result = selectByBudget(list, 2000, 25, 0.3, LOOSE_TOPK, LOOSE_DELTA);
    expect(result.map((m) => m.id)).toEqual(['high', 'mid', 'low']);
  });

  test('超过字符预算停止填充', () => {
    const list = [
      scored('a', 'x'.repeat(60), 5.0),
      scored('b', 'y'.repeat(60), 4.0),
      scored('c', 'z'.repeat(60), 3.0),
    ];
    // 预算 100,只能装第一条(60),第二条会使总量到 120 超预算
    const result = selectByBudget(list, 100, 25, 0.3, LOOSE_TOPK, LOOSE_DELTA);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('a');
  });

  test('超过 hardCap 停止填充', () => {
    const list = Array.from({ length: 30 }, (_, i) =>
      scored(`m${i}`, 's', 5.0 - i * 0.1),
    );
    const result = selectByBudget(list, 100_000, 5, 0.3, LOOSE_TOPK, LOOSE_DELTA);
    expect(result).toHaveLength(5);
    expect(result.map((m) => m.id)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4']);
  });

  test('阈值过滤优先于预算/上限', () => {
    const list = [
      scored('a', 's', 5.0),
      scored('b', 's', 0.25), // 低于默认阈值
      scored('c', 's', 1.0),
    ];
    const result = selectByBudget(list, 2000, 25, 0.3, LOOSE_TOPK, LOOSE_DELTA);
    expect(result.map((m) => m.id)).toEqual(['a', 'c']);
  });

  test('首条就超预算时仍选入(避免空返回)', () => {
    const list = [scored('big', 'x'.repeat(5000), 5.0)];
    const result = selectByBudget(list, 100, 25, 0.3, LOOSE_TOPK, LOOSE_DELTA);
    expect(result).toHaveLength(1);
  });

  test('默认参数下 top-K + delta 收缩压制"全员高分"', () => {
    // 模拟 mean-pooled 向量噪声地板高的场景:所有记忆分数都在 0.6+
    // 但 top 1 明显高于其它 — 期望只留下靠近 top 的少数几条
    const list = [
      scored('a', 's', 0.85),
      scored('b', 's', 0.82),
      scored('c', 's', 0.70), // 距 top 0.15 > 默认 delta 0.08
      scored('d', 's', 0.66),
      scored('e', 's', 0.60),
    ];
    const result = selectByBudget(list);
    // a、b 在 0.08 窗口内被保留;c、d、e 被挤出
    expect(result.map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('memory-scoring - filterByRelativeRanking', () => {
  function scored(id: string, total: number): ScoredMemory {
    return {
      memory: makeMemory({ id }),
      breakdown: {
        semantic: 0,
        keyword: 0,
        recency: 0,
        semanticWeighted: 0,
        keywordWeighted: 0,
        recencyWeighted: 0,
        total,
      },
    };
  }

  test('空候选返回空数组', () => {
    expect(filterByRelativeRanking([])).toEqual([]);
  });

  test('top-K 硬上限限制返回数量', () => {
    const list = Array.from({ length: 20 }, (_, i) => scored(`m${i}`, 5.0 - i * 0.001));
    // delta 足够大以禁用窗口过滤,仅考察 top-K
    const result = filterByRelativeRanking(list, 5, 999);
    expect(result).toHaveLength(5);
    expect(result.map((s) => s.memory.id)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4']);
  });

  test('relativeDelta 窗口剔除远低于 top 的条目', () => {
    const list = [
      scored('a', 0.85),
      scored('b', 0.80), // 距 top 0.05,在 delta=0.08 内
      scored('c', 0.70), // 距 top 0.15,被剔除
      scored('d', 0.50),
    ];
    const result = filterByRelativeRanking(list, 999, 0.08);
    expect(result.map((s) => s.memory.id)).toEqual(['a', 'b']);
  });

  test('所有分数都接近 top 时保留所有(质量均衡)', () => {
    const list = [scored('a', 0.80), scored('b', 0.79), scored('c', 0.78)];
    const result = filterByRelativeRanking(list, 999, 0.08);
    expect(result).toHaveLength(3);
  });

  test('top-K 与 delta 同时生效:先截 top-K 再在窗口内收缩', () => {
    const list = [
      scored('a', 0.90),
      scored('b', 0.85),
      scored('c', 0.80), // top-K=3 边界
      scored('d', 0.79), // 被 top-K 切掉
    ];
    // topK=3 先切到 [a,b,c],delta=0.08 窗口内 a(0.90)、b(0.85 在 0.82 以上)、c(0.80 低于 0.82 剔除)
    const result = filterByRelativeRanking(list, 3, 0.08);
    expect(result.map((s) => s.memory.id)).toEqual(['a', 'b']);
  });

  test('不修改输入数组', () => {
    const list = [scored('a', 0.5), scored('b', 0.9), scored('c', 0.7)];
    const snapshot = list.map((s) => s.memory.id);
    filterByRelativeRanking(list);
    expect(list.map((s) => s.memory.id)).toEqual(snapshot);
  });
});
