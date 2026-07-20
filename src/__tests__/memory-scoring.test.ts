import { describe, test, expect } from 'bun:test';
import type { Memory } from 'src/models/memory';
import {
  calculateKeywordHitRatio,
  calculateRecencyFactor,
  calculateSemanticSim,
  calculateSegmentedSemanticSimilarity,
  calculateQueryKeywordScore,
  scoreMemory,
  scoreMemoriesBatch,
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
  if (overrides.embeddings !== undefined) mem.embeddings = overrides.embeddings;
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

describe('memory-scoring - 多分段语义聚合', () => {
  test('持续匹配的多个分段应胜过单个偶然高匹配分段', () => {
    const query = [[1, 0]];
    const isolatedHit = [
      [1, 0],
      [0, 1],
    ];
    const consistentHit = [
      [0.9, Math.sqrt(1 - 0.9 ** 2)],
      [0.9, Math.sqrt(1 - 0.9 ** 2)],
    ];

    expect(calculateSegmentedSemanticSimilarity(consistentHit, query)).toBeGreaterThan(
      calculateSegmentedSemanticSimilarity(isolatedHit, query),
    );
  });

  test('摘要向量精准命中时不被无关正文分段稀释', () => {
    const memoryEmbeddings = [
      [1, 0],
      [0, 1],
      [0, 1],
    ];

    expect(calculateSegmentedSemanticSimilarity(memoryEmbeddings, [[1, 0]], true)).toBeCloseTo(
      1,
      5,
    );
  });
});

describe('memory-scoring - scoreMemory', () => {
  test('语义与关键词加权返回正确总分，并保留时间展示值', () => {
    const now = 1_000_000_000;
    const memory = makeMemory({
      summary: '小明是学生',
      content: '',
      embeddings: [[1, 0]],
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

  test('查询 embedding 可用但记忆缺向量时不提升辅助信号权重', () => {
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

    // 查询已进入 embedding 模式；单条记忆缺向量时不能偷偷切回 fallback 抬高辅助信号。
    expect(breakdown.semantic).toBe(0);
    expect(breakdown.keyword).toBeCloseTo(1, 5);
    expect(breakdown.recency).toBeCloseTo(1, 5);
    expect(breakdown.keywordWeighted).toBeCloseTo(SCORING_WEIGHTS.keyword, 5);
    expect(breakdown.recencyWeighted).toBeCloseTo(SCORING_WEIGHTS.recency, 5);
    expect(breakdown.total).toBeLessThan(DEFAULT_MIN_SCORE);
  });

  test('旧单向量 embedding 字段不再参与语义评分', () => {
    const legacyMemory = { ...makeMemory(), embedding: [1, 0] } as Memory & {
      embedding: number[];
    };

    const breakdown = scoreMemory(legacyMemory, {
      chunkEntities: [],
      chunkEmbedding: new Float32Array([1, 0]),
      now: Date.now(),
    });

    expect(breakdown.semantic).toBe(0);
    expect(breakdown.semanticWeighted).toBe(0);
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
    // 完整关键词命中得 1.0，高于默认阈值。
    expect(breakdown.total).toBeGreaterThan(DEFAULT_MIN_SCORE);
  });

  test('没有相关性信号的记忆应低于阈值', () => {
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

  test('关闭 embedding 时访问时间按 fallback 权重参与三信号回退', () => {
    const now = 1_000_000_000;
    const recent = scoreMemory(makeMemory({ summary: '小明', lastAccessedAt: now }), {
      chunkEntities: [{ name: '小明' }],
      now,
    });
    const old = scoreMemory(
      makeMemory({ summary: '小明', lastAccessedAt: now - 365 * MS_PER_DAY }),
      { chunkEntities: [{ name: '小明' }], now },
    );

    expect(recent.recency).toBeGreaterThan(old.recency);
    expect(recent.recencyWeighted).toBeCloseTo(FALLBACK_WEIGHTS.recency, 5);
    expect(old.recencyWeighted).toBeLessThan(0.001);
    expect(recent.total).toBeGreaterThan(old.total);
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
    const list = [scored('low', 'aa', 1.0), scored('high', 'bb', 5.0), scored('mid', 'cc', 3.0)];
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
    const list = Array.from({ length: 30 }, (_, i) => scored(`m${i}`, 's', 5.0 - i * 0.1));
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
    // 模拟向量噪声地板高的场景:所有记忆分数都在 0.6+
    // 但 top 1 明显高于其它 — 期望只留下靠近 top 的少数几条
    const list = [
      scored('a', 's', 0.85),
      scored('b', 's', 0.82),
      scored('c', 's', 0.7), // 距 top 0.15 > 默认 delta 0.06
      scored('d', 's', 0.66),
      scored('e', 's', 0.6),
    ];
    const result = selectByBudget(list);
    // a、b 在 0.06 窗口内被保留;c、d、e 被挤出
    expect(result.map((m) => m.id)).toEqual(['a', 'b']);
  });

  test('默认相对窗口保留同章强匹配并剔除仅语义近似的邻近项', () => {
    const list = [
      scored('chapter-primary', 's', 0.396),
      scored('chapter-secondary', 's', 0.355),
      scored('same-topic-other-chapter', 's', 0.329),
    ];

    expect(selectByBudget(list).map((memory) => memory.id)).toEqual([
      'chapter-primary',
      'chapter-secondary',
    ]);
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
      scored('b', 0.8), // 距 top 0.05,在 delta=0.08 内
      scored('c', 0.7), // 距 top 0.15,被剔除
      scored('d', 0.5),
    ];
    const result = filterByRelativeRanking(list, 999, 0.08);
    expect(result.map((s) => s.memory.id)).toEqual(['a', 'b']);
  });

  test('所有分数都接近 top 时保留所有(质量均衡)', () => {
    const list = [scored('a', 0.8), scored('b', 0.79), scored('c', 0.78)];
    const result = filterByRelativeRanking(list, 999, 0.08);
    expect(result).toHaveLength(3);
  });

  test('top-K 与 delta 同时生效:先截 top-K 再在窗口内收缩', () => {
    const list = [
      scored('a', 0.9),
      scored('b', 0.85),
      scored('c', 0.8), // top-K=3 边界
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

describe('memory-scoring - scoreMemoriesBatch', () => {
  // 构造一个"抱团"场景:8 条记忆的 embedding 都和 query 极为接近。
  // 新实现使用 RRF 保留相对顺序，并由 keyword 信号辅助排序，不再整批关闭 semantic。
  function makeEmbedding(values: number[]): number[] {
    // L2 归一化
    let norm = 0;
    for (const v of values) norm += v * v;
    norm = Math.sqrt(norm);
    return values.map((v) => v / (norm || 1));
  }

  test('余弦抱团时压低 dense 噪声并保留关键词信号', () => {
    // query 向量固定
    const query = makeEmbedding([1, 0, 0, 0]);
    // 8 条 memory 向量都和 query 极其接近(cosine ≈ 1.0,互相差异 <0.001)
    const tightCluster = [
      makeEmbedding([1, 0.001, 0, 0]),
      makeEmbedding([1, 0.002, 0, 0]),
      makeEmbedding([1, 0.003, 0, 0]),
      makeEmbedding([1, 0.001, 0.001, 0]),
      makeEmbedding([1, 0, 0.002, 0]),
      makeEmbedding([1, 0.001, 0.001, 0.001]),
      makeEmbedding([1, 0.002, 0.001, 0]),
      makeEmbedding([1, 0.001, 0.002, 0.001]),
    ];
    const memories: Memory[] = tightCluster.map((_, i) =>
      makeMemory({
        id: `m${i}`,
        summary: i === 3 ? '包含关键词小明' : '普通内容',
        // 最后一条设成很旧
        lastAccessedAt: i === 7 ? 0 : 1_000_000_000,
      }),
    );
    memories.forEach((m, i) => (m.embeddings = [tightCluster[i]!]));

    const result = scoreMemoriesBatch(memories, {
      chunkEntities: [{ name: '小明' }],
      chunkEmbedding: query,
      now: 1_000_000_000,
    });

    // raw cosine 抱团时，dense 名次没有足够置信度，不应凭相对第一名获得高分。
    result.forEach((s) => {
      expect(s.breakdown.recencyWeighted).toBeLessThanOrEqual(SCORING_WEIGHTS.recency);
    });
    expect(Math.max(...result.map((item) => item.breakdown.semantic))).toBeLessThan(0.05);

    // m3 是唯一关键词命中，得到 keyword 排名融合加成。
    const m3 = result.find((s) => s.memory.id === 'm3')!;
    expect(m3.breakdown.keywordWeighted).toBeCloseTo(SCORING_WEIGHTS.keyword, 5);

    // m3 应该是排名最高的（有关键词命中）。
    result.sort((a, b) => b.breakdown.total - a.breakdown.total);
    expect(result[0]!.memory.id).toBe('m3');
  });

  test('spread 足够时按 RRF 名次归一化', () => {
    const query = makeEmbedding([1, 0, 0]);
    // 3 条 memory:一条高相关、一条中、一条低相关(余弦差距足够大)
    const high = makeEmbedding([1, 0.1, 0]);
    const mid = makeEmbedding([0.5, 0.5, 0]);
    const low = makeEmbedding([0, 1, 0]);
    const memories: Memory[] = [
      makeMemory({ id: 'high' }),
      makeMemory({ id: 'mid' }),
      makeMemory({ id: 'low' }),
    ];
    memories[0]!.embeddings = [high];
    memories[1]!.embeddings = [mid];
    memories[2]!.embeddings = [low];

    const result = scoreMemoriesBatch(memories, {
      chunkEntities: [],
      chunkEmbedding: query,
      now: Date.now(),
    });

    // 语义区分度足够,没有整批降级 — semantic 值应该拉开
    const resultById = new Map(result.map((s) => [s.memory.id, s]));
    const highSem = resultById.get('high')!.breakdown.semantic;
    const lowSem = resultById.get('low')!.breakdown.semantic;
    expect(highSem).toBeGreaterThan(lowSem + 0.1);

    // 归一化值必须在 [0, 1]
    result.forEach((s) => {
      expect(s.breakdown.semantic).toBeGreaterThanOrEqual(0);
      expect(s.breakdown.semantic).toBeLessThanOrEqual(1);
    });

    // embedding 模式使用固定权重，不因其他信号缺失而动态放大。
    result.forEach((s) => {
      expect(s.breakdown.semanticWeighted).toBeCloseTo(
        s.breakdown.semantic * SCORING_WEIGHTS.semantic,
        6,
      );
    });
  });

  test('候选很少时只做绝对置信度校准并保留 dense 排名', () => {
    const query = makeEmbedding([1, 0, 0]);
    const memories = [
      makeMemory({ id: 'best', embeddings: [makeEmbedding([1, 0.02, 0])] }),
      makeMemory({ id: 'middle', embeddings: [makeEmbedding([1, 0.12, 0])] }),
      makeMemory({ id: 'last', embeddings: [makeEmbedding([1, 0.2, 0])] }),
    ];

    const result = scoreMemoriesBatch(memories, {
      chunkEntities: [],
      chunkEmbedding: query,
      now: Date.now(),
    });
    const byId = new Map(result.map((item) => [item.memory.id, item.breakdown]));

    expect(byId.get('best')!.semantic).toBeGreaterThan(byId.get('middle')!.semantic);
    expect(byId.get('middle')!.semantic).toBeGreaterThan(byId.get('last')!.semantic);
  });

  test('整批只有中等且接近的余弦时不把相对第一名强行抬过注入阈值', () => {
    const query = makeEmbedding([1, 0]);
    const similarities = [0.93, 0.928, 0.926, 0.924, 0.922, 0.92, 0.918, 0.916];
    const memories = similarities.map((similarity, index) =>
      makeMemory({
        id: `noise-${index}`,
        embeddings: [[similarity, Math.sqrt(1 - similarity ** 2)]],
      }),
    );

    const scored = scoreMemoriesBatch(memories, {
      chunkEntities: [],
      chunkEmbedding: query,
      now: Date.now(),
    });

    expect(Math.max(...scored.map((item) => item.breakdown.total))).toBeLessThan(DEFAULT_MIN_SCORE);
    expect(selectByBudget(scored)).toEqual([]);
  });

  test('开启 embedding 时语义优先，纯辅助信号不能单独越过注入阈值', () => {
    const query = makeEmbedding([1, 0]);
    const memories = [
      makeMemory({ id: 'semantic', summary: '真正相关', embeddings: [[1, 0]] }),
      makeMemory({
        id: 'keyword-only',
        summary: '516话 对空迎击战 小明',
        embeddings: [[0, 1]],
      }),
      makeMemory({ id: 'background-1', embeddings: [[0, 1]] }),
      makeMemory({ id: 'background-2', embeddings: [[0, 1]] }),
    ];

    const scored = scoreMemoriesBatch(memories, {
      chunkEntities: [{ name: '小明' }],
      rawQuery: '516话 对空迎击战',
      chunkEmbedding: query,
      now: Date.now(),
    });
    const byId = new Map(scored.map((item) => [item.memory.id, item.breakdown]));

    expect(byId.get('semantic')!.scoringMode).toBe('semantic');
    expect(byId.get('keyword-only')!.scoringMode).toBe('semantic');
    expect(byId.get('semantic')!.total).toBeGreaterThan(DEFAULT_MIN_SCORE);
    expect(byId.get('keyword-only')!.keyword).toBeCloseTo(1, 5);
    expect(byId.get('keyword-only')!.total).toBeLessThan(DEFAULT_MIN_SCORE);
  });

  test('语义候选抱团时，516 的低权重章节信号只校准本章，不扩散到 510', () => {
    const query = makeEmbedding([1, 0]);
    const makeVectorAtSimilarity = (similarity: number) =>
      makeEmbedding([similarity, Math.sqrt(1 - similarity ** 2)]);
    const memories = [
      makeMemory({
        id: 'chapter-516',
        summary: '516话 对空迎击战',
        embeddings: [makeVectorAtSimilarity(0.93)],
      }),
      ...[0.91, 0.905, 0.9, 0.895, 0.89].map((similarity, index) =>
        makeMemory({
          id: `nearby-topic-${index}`,
          embeddings: [makeVectorAtSimilarity(similarity)],
        }),
      ),
    ];
    const scoreTarget = (rawQuery: string) =>
      scoreMemoriesBatch(memories, {
        chunkEntities: [],
        rawQuery,
        chunkEmbedding: query,
        now: Date.now(),
      }).find((item) => item.memory.id === 'chapter-516')!.breakdown;

    const chapter516 = scoreTarget('516话 对空迎击战');
    const chapter510 = scoreTarget('510话 什么都没有改变');

    expect(chapter516.scoringMode).toBe('semantic');
    expect(chapter516.semanticWeighted).toBeCloseTo(chapter510.semanticWeighted, 6);
    expect(chapter516.total).toBeGreaterThan(DEFAULT_MIN_SCORE);
    expect(chapter510.keyword).toBe(0);
    expect(chapter510.total).toBeLessThan(DEFAULT_MIN_SCORE);
  });

  test('关闭 embedding 时恢复关键词与时间衰减回退权重', () => {
    const now = Date.now();
    const [scored] = scoreMemoriesBatch(
      [makeMemory({ id: 'fallback', summary: '小明', lastAccessedAt: now })],
      {
        chunkEntities: [{ name: '小明' }],
        now,
      },
    );

    expect(FALLBACK_WEIGHTS.keyword).toBeCloseTo(0.75, 5);
    expect(FALLBACK_WEIGHTS.recency).toBeCloseTo(0.25, 5);
    expect(scored!.breakdown.scoringMode).toBe('fallback');
    expect(scored!.breakdown.keywordWeighted).toBeCloseTo(FALLBACK_WEIGHTS.keyword, 5);
    expect(scored!.breakdown.recencyWeighted).toBeCloseTo(FALLBACK_WEIGHTS.recency, 5);
    expect(scored!.breakdown.total).toBeCloseTo(1, 5);
  });

  test('明显高于背景的跨语言中等语义命中可通过注入阈值', () => {
    const query = makeEmbedding([1, 0]);
    const memories = [
      makeMemory({ id: 'cross-language-hit', embeddings: [[0.44, Math.sqrt(1 - 0.44 ** 2)]] }),
      ...[0.3, 0.28, 0.26, 0.24, 0.22].map((similarity, index) =>
        makeMemory({
          id: `background-${index}`,
          embeddings: [[similarity, Math.sqrt(1 - similarity ** 2)]],
        }),
      ),
    ];

    const scored = scoreMemoriesBatch(memories, {
      chunkEntities: [],
      chunkEmbedding: query,
      now: Date.now(),
    });

    expect(selectByBudget(scored).map((memory) => memory.id)).toEqual(['cross-language-hit']);
  });

  test('明显高于背景的强语义命中仍可通过注入阈值', () => {
    const query = makeEmbedding([1, 0]);
    const memories = [
      makeMemory({ id: 'relevant', embeddings: [[0.72, Math.sqrt(1 - 0.72 ** 2)]] }),
      ...[0.38, 0.36, 0.34, 0.32, 0.3].map((similarity, index) =>
        makeMemory({
          id: `background-${index}`,
          embeddings: [[similarity, Math.sqrt(1 - similarity ** 2)]],
        }),
      ),
    ];

    const scored = scoreMemoriesBatch(memories, {
      chunkEntities: [],
      chunkEmbedding: query,
      now: Date.now(),
    });

    expect(selectByBudget(scored).map((memory) => memory.id)).toEqual(['relevant']);
  });

  test('多个查询分段按覆盖率聚合后统一做排名融合', () => {
    const memories: Memory[] = [
      makeMemory({ id: 'first' }),
      makeMemory({ id: 'later' }),
      makeMemory({ id: 'unrelated' }),
    ];
    memories[0]!.embeddings = [makeEmbedding([1, 0, 0])];
    memories[1]!.embeddings = [makeEmbedding([0, 1, 0])];
    memories[2]!.embeddings = [makeEmbedding([0, 0, 1])];

    const result = scoreMemoriesBatch(memories, {
      chunkEntities: [],
      chunkEmbeddings: [makeEmbedding([1, 0, 0]), makeEmbedding([0, 1, 0])],
      now: Date.now(),
    });

    const byId = new Map(result.map((item) => [item.memory.id, item.breakdown]));
    expect(byId.get('first')!.semantic).toBeCloseTo(byId.get('later')!.semantic, 5);
    expect(byId.get('first')!.semantic).toBeGreaterThan(byId.get('unrelated')!.semantic + 0.1);
  });

  test('长记忆的后续分段命中查询时保留强语义信号', () => {
    const query = makeEmbedding([1, 0, 0]);
    const memories: Memory[] = [
      makeMemory({
        id: 'multi-vector',
        embeddings: [makeEmbedding([0, 1, 0]), makeEmbedding([1, 0, 0])],
      }),
      makeMemory({
        id: 'partial-match',
        embeddings: [makeEmbedding([0.6, 0.8, 0])],
      }),
      makeMemory({
        id: 'unrelated',
        embeddings: [makeEmbedding([0.1, 0.995, 0])],
      }),
    ];

    const result = scoreMemoriesBatch(memories, {
      chunkEntities: [],
      chunkEmbedding: query,
      now: Date.now(),
    });

    const byId = new Map(result.map((item) => [item.memory.id, item.breakdown]));
    expect(byId.get('multi-vector')!.semantic).toBeGreaterThan(byId.get('partial-match')!.semantic);
    expect(byId.get('partial-match')!.semantic).toBeGreaterThan(byId.get('unrelated')!.semantic);
  });

  test('无 chunkEmbedding 时整批 semantic=0,keyword 走 FALLBACK_WEIGHTS', () => {
    const memories: Memory[] = [
      makeMemory({ id: 'a', summary: '小明' }),
      makeMemory({ id: 'b', summary: '小红' }),
    ];
    const result = scoreMemoriesBatch(memories, {
      chunkEntities: [{ name: '小明' }],
      now: Date.now(),
    });

    result.forEach((s) => {
      expect(s.breakdown.semantic).toBe(0);
      expect(s.breakdown.semanticWeighted).toBe(0);
    });
    const a = result.find((s) => s.memory.id === 'a')!;
    expect(a.breakdown.keywordWeighted).toBeCloseTo(FALLBACK_WEIGHTS.keyword, 5);
  });

  test('关键词排名融合保留原始命中置信度，不把弱部分匹配抬到接近满分', () => {
    const memories: Memory[] = [
      makeMemory({ id: 'exact', summary: '芬恩敬语规则' }),
      makeMemory({ id: 'partial', summary: '芬恩的其他设定' }),
    ];

    const result = scoreMemoriesBatch(memories, {
      chunkEntities: [],
      rawQuery: '芬恩敬语规则',
      now: Date.now(),
    });
    const byId = new Map(result.map((item) => [item.memory.id, item.breakdown]));

    expect(byId.get('exact')!.keywordWeighted).toBeCloseTo(FALLBACK_WEIGHTS.keyword, 5);
    expect(byId.get('partial')!.keyword).toBeLessThan(0.5);
    expect(byId.get('partial')!.keywordWeighted).toBeLessThan(0.5);
  });

  test('expectedModelVersion 不匹配的 memory 按 per-item 降级', () => {
    const query = makeEmbedding([1, 0, 0]);
    const vA = makeEmbedding([1, 0.1, 0]); // 和 query 相似
    const vB = makeEmbedding([0, 1, 0]); // 不相似
    const vC = makeEmbedding([1, 0.1, 0.05]); // 相似
    const memories: Memory[] = [
      makeMemory({ id: 'a', summary: '', embeddings: [vA], embeddingModel: 'v-new' }),
      makeMemory({ id: 'b', summary: '', embeddings: [vB], embeddingModel: 'v-new' }),
      // c 版本不匹配 → semantic 退化,但别人可以用
      makeMemory({ id: 'c', summary: '小明', embeddings: [vC], embeddingModel: 'v-old' }),
    ];

    const result = scoreMemoriesBatch(memories, {
      chunkEntities: [{ name: '小明' }],
      chunkEmbedding: query,
      now: Date.now(),
      expectedModelVersion: 'v-new',
    });

    const byId = new Map(result.map((s) => [s.memory.id, s]));
    // c 被当作无 semantic，但仍可通过 keyword 排名通道参与融合。
    expect(byId.get('c')!.breakdown.semantic).toBe(0);
    expect(byId.get('c')!.breakdown.keywordWeighted).toBeCloseTo(SCORING_WEIGHTS.keyword, 5);
    // a、b 语义值正常计算。
    expect(byId.get('a')!.breakdown.semantic).toBeGreaterThan(0);
  });

  test('空数组直接返回空', () => {
    expect(scoreMemoriesBatch([], { chunkEntities: [], now: 0 })).toEqual([]);
  });

  test('单条 memory 时仍保留语义和关键词信号', () => {
    const memories: Memory[] = [makeMemory({ id: 'only', summary: '小明' })];
    memories[0]!.embeddings = [makeEmbedding([1, 0, 0])];
    const result = scoreMemoriesBatch(memories, {
      chunkEntities: [{ name: '小明' }],
      chunkEmbedding: makeEmbedding([1, 0, 0]),
      now: Date.now(),
    });
    expect(result[0]!.breakdown.semantic).toBe(1);
    expect(result[0]!.breakdown.semanticWeighted).toBeCloseTo(SCORING_WEIGHTS.semantic, 5);
    expect(result[0]!.breakdown.keywordWeighted).toBeCloseTo(SCORING_WEIGHTS.keyword, 5);
  });

  test('保持输入顺序(未按分数排序)', () => {
    const query = makeEmbedding([1, 0, 0]);
    const memories: Memory[] = [
      makeMemory({ id: 'a' }),
      makeMemory({ id: 'b' }),
      makeMemory({ id: 'c' }),
    ];
    memories[0]!.embeddings = [makeEmbedding([0.1, 1, 0])]; // low
    memories[1]!.embeddings = [makeEmbedding([1, 0, 0])]; // high
    memories[2]!.embeddings = [makeEmbedding([0.5, 0.5, 0])]; // mid

    const result = scoreMemoriesBatch(memories, {
      chunkEntities: [],
      chunkEmbedding: query,
      now: Date.now(),
    });
    expect(result.map((s) => s.memory.id)).toEqual(['a', 'b', 'c']);
  });

});

describe('memory-scoring - calculateQueryKeywordScore (CJK 部分匹配)', () => {
  test('完整字面匹配返回 1.0', () => {
    const memory = makeMemory({ summary: '闇のマリアンヌ 的暗黑人格设定' });
    const score = calculateQueryKeywordScore('闇のマリアンヌ', memory);
    expect(score).toBeCloseTo(1, 5);
  });

  test('章节数字标识符只允许精确 token 命中', () => {
    const memory = makeMemory({ summary: '516话 对空迎击战' });

    expect(calculateQueryKeywordScore('516', memory)).toBeCloseTo(1, 5);
    expect(calculateQueryKeywordScore('510', memory)).toBe(0);
  });

  test('全角章节编号与半角编号视为同一 token', () => {
    const memory = makeMemory({ summary: '516话 对空迎击战' });
    expect(calculateQueryKeywordScore('５１６', memory)).toBeCloseTo(1, 5);
  });

  test('部分匹配按最长公共子串 / 单元长度返回分数', () => {
    // memory 里只有 "闇の",query 是 "闇のマリアンヌ"(7 字)。
    // 最长公共子串 = "闇の"(2 字),得分 2/7 ≈ 0.286。
    const memory = makeMemory({ summary: '暗黑人格翻译规则:闇の[角色名]统一译为暗黑[角色名]' });
    const score = calculateQueryKeywordScore('闇のマリアンヌ', memory);
    expect(score).toBeCloseTo(2 / 7, 3);
  });

  test('多单元 query 取每个单元的部分匹配平均', () => {
    // query 切成 3 个单元:"闇のマリアンヌ"(7)/"应该怎么翻译"(6)/"有没有统一规则"(7)
    // memory 里有 "闇の"(2/7)/"翻译"(2/6)/"规则"(2/7)
    const memory = makeMemory({ summary: '翻译规则:闇の[角色名]统一译为暗黑[角色名]' });
    const score = calculateQueryKeywordScore('闇のマリアンヌ 应该怎么翻译，有没有统一规则', memory);
    // 期望平均 ≈ (2/7 + 2/6 + 2/7) / 3 ≈ 0.302
    expect(score).toBeGreaterThan(0.25);
    expect(score).toBeLessThan(0.4);
  });

  test('完全无共同字符返回 0', () => {
    const memory = makeMemory({ summary: '完全不相关的内容' });
    const score = calculateQueryKeywordScore('abc123', memory);
    expect(score).toBe(0);
  });

  test('空 query 或空 memory 返回 0', () => {
    const memory = makeMemory({ summary: '内容' });
    expect(calculateQueryKeywordScore('', memory)).toBe(0);
    const empty = makeMemory({ summary: '' });
    expect(calculateQueryKeywordScore('query', empty)).toBe(0);
  });

  test('和 FALLBACK_WEIGHTS 配合足以让部分匹配记忆过默认阈值', () => {
    // 回归测试:LLM 报告的 "闇のマリアンヌ 应该怎么翻译" 这种自然语言查询,
    // memory 里只有部分字面(闇の / 翻译)时应能过 DEFAULT_MIN_SCORE
    const now = 1_000_000_000;
    const memory = makeMemory({
      summary: '暗黑人格翻译规则:闇の[角色名]统一译为暗黑[角色名]',
      lastAccessedAt: now,
    });
    const breakdown = scoreMemory(memory, {
      chunkEntities: [],
      rawQuery: '闇のマリアンヌ 应该怎么翻译 有没有统一规则',
      now,
    });
    // 无 embedding → FALLBACK_WEIGHTS；仅按部分关键词匹配评分。
    expect(breakdown.total).toBeGreaterThanOrEqual(DEFAULT_MIN_SCORE);
  });

  test('summary 命中比 content-only 命中得分高(检索标题权重 2x)', () => {
    // 两条 memory 都含 "闇のマリアンヌ" 字面,但一条在 summary、一条在 content。
    // summary 命中应稳定排到前面 —— 这是 "summary 是检索标题" 的直接体现。
    const summaryMatch = makeMemory({
      id: 'sum',
      summary: '闇のマリアンヌ 的翻译规则',
      content: '无关内容 xxxx',
    });
    const contentMatch = makeMemory({
      id: 'cnt',
      summary: '无关标题',
      content: '这里提到了 闇のマリアンヌ 但只是顺带',
    });

    const sumScore = calculateQueryKeywordScore('闇のマリアンヌ', summaryMatch);
    const cntScore = calculateQueryKeywordScore('闇のマリアンヌ', contentMatch);

    // summary 命中得满分 1.0,content-only 命中按 0.5 折算
    expect(sumScore).toBeCloseTo(1.0, 3);
    expect(cntScore).toBeCloseTo(0.5, 3);
    expect(sumScore).toBeGreaterThan(cntScore);
  });

  test('复合 query 按标点拆分,子 query 取 max', () => {
    // query 是两个子问题,memory 只覆盖其中一个。拆分取 max 后,分数
    // 应该等于命中那个子问题的得分,而不是被不相关子问题稀释的平均。
    const memoryAboutTitle = makeMemory({
      id: 'title',
      summary: '瓦西里的称号 / 异常者 / イレギュラー 统一翻译',
    });
    const q = '瓦西里的称号是什么，他和芬恩是什么关系';
    const score = calculateQueryKeywordScore(q, memoryAboutTitle);

    // 子 query "瓦西里的称号是什么" 在 memory summary 里完整命中 "瓦西里的称号"(6/9),
    // 大大高于不拆分时 "关系" 子问题稀释后的平均分。
    expect(score).toBeGreaterThan(0.6);
  });

  test('复合 query 下覆盖子问题的 memory 比被稀释前分数更高', () => {
    // 以前没拆分时,query 整句的 units 在 memory 上做平均命中率很低。
    // 拆分后,每个子问题单独打分取 max,至少能反映 memory 实际相关的那一面。
    const memA = makeMemory({
      id: 'rel',
      summary: '瓦西里与芬恩的师徒关系 / 翻译要点',
    });
    const q = '瓦西里的称号是什么，他和芬恩是什么关系';
    const score = calculateQueryKeywordScore(q, memA);
    // memA 覆盖 "关系" 子问题的部分字面,分数应在合理水平(>= 0.3)。
    // 不强制 > 0.4 —— "他和芬恩是什么关系" 单元只能匹到 memory 里 "芬恩"
    // 或 "关系"(2/9 ≈ 0.222);"瓦西里的称号是什么" 匹 "瓦西里"(3/9 ≈ 0.333)。
    // 拆分取 max ≈ 0.333,仍高于不拆分时的混合平均 ~0.28。
    expect(score).toBeGreaterThanOrEqual(0.3);
  });

  test('精准命中 summary 的 memory 在复合 query 下分数明显更高', () => {
    // 当 memory summary 完全匹配某个子问题时,分数应显著高于只沾一点边的 memory
    const preciseMatch = makeMemory({
      id: 'precise',
      summary: '瓦西里的称号是什么', // 和子问题字面一致
    });
    const partialMatch = makeMemory({
      id: 'partial',
      summary: '瓦西里与芬恩的师徒关系',
    });
    const q = '瓦西里的称号是什么，他和芬恩是什么关系';
    const preciseScore = calculateQueryKeywordScore(q, preciseMatch);
    const partialScore = calculateQueryKeywordScore(q, partialMatch);

    // precise 能完整命中子问题 "瓦西里的称号是什么" → 满分 1.0
    expect(preciseScore).toBeCloseTo(1.0, 3);
    // partial 只能部分命中 → 明显更低
    expect(preciseScore).toBeGreaterThan(partialScore + 0.5);
  });
});
