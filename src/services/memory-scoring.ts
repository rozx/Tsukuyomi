/**
 * 记忆打分(三信号:语义 + 关键词 + 时间衰减)
 *
 * 公式: score = 0.6·semantic + 0.3·keyword + 0.1·recency
 * 最大分 = 1.0,默认阈值 0.38。
 */
import type { Memory } from 'src/models/memory';
import type { ScoreBreakdown } from 'src/models/novel';
import { cosineSimilarity as calculateSemanticSim } from 'src/utils/cosine-similarity';
export { calculateSemanticSim };

export const SCORING_WEIGHTS = {
  semantic: 0.6,
  keyword: 0.3,
  recency: 0.1,
} as const;

export const MAX_TOTAL_SCORE = 1.0;

export const DEFAULT_CHAR_BUDGET = 2000;
export const HARD_ITEM_CAP = 25;
export const DEFAULT_MIN_SCORE = 0.38;

/**
 * 相对排名参数 — 解决"mean-pooled 多语言向量绝对余弦噪声地板高"导致的
 * 分数膨胀问题(无关记忆也常 >0.5,所有记忆都越过绝对阈值)。
 *
 * 排序后:
 * - 只保留前 DEFAULT_TOP_K 条(硬上限,防止"全员注入"的极端)
 * - 再剔除分数比 top 低超过 DEFAULT_RELATIVE_DELTA 的条目(质量地板,
 *   top 1 很弱时整体注入数量也相应减少,而不是强行凑满 K 条)
 *
 * 值按经验选定 — 可通过调用 filterByRelativeRanking 覆写。
 */
export const DEFAULT_TOP_K = 8;
export const DEFAULT_RELATIVE_DELTA = 0.08;

/**
 * 语义 spread 的下限阈值。
 *
 * mean-pooled 多语言 BERT 向量在同书同领域下会抱团 — 本次 query 对所有 memory
 * 的原始余弦可能全部落在 0.9±0.02 之间,此时"语义分数"没有任何区分度。
 * 若 stddev 低于此阈值,`scoreMemoriesBatch` 判定本批语义信号退化为噪声,整批
 * 把 semantic 设为 0(权重仍是 SCORING_WEIGHTS,不重新分配),让关键词和新近性
 * 来区分 — 避免把噪声当信号注入。
 *
 * 经验值:对 256 维 Matryoshka L2-normalized 向量,0.02 对应 ~2% 相对差异,
 * 低于这个量级几乎全是噪声。
 */
export const SPREAD_FLOOR = 0.02;

/**
 * z-score 归一化后的截断边界。raw cosine 距群体均值 ±Z_CLAMP·stddev 以外
 * 的映射到 [0, 1] 两端。设成 2 覆盖约 95% 正态分布区间。
 */
export const Z_CLAMP = 2;

const RECENCY_HALF_LIFE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ScoredMemory {
  memory: Memory;
  breakdown: ScoreBreakdown;
}

export interface ScoringContext {
  chunkEntities: Array<{ name: string }>;
  chunkEmbedding?: Float32Array | number[] | undefined;
  now: number;
  /**
   * 期望的 embedding 模型版本。传入时,`memory.embeddingModel` 与之不匹配的记录
   * 会被视为无语义向量(走 FALLBACK_WEIGHTS),避免跨 embedding 空间的余弦相似度退化成噪声。
   * 不传入则保持向后兼容,只做"有/无 embedding"的弱检查。
   */
  expectedModelVersion?: string | undefined;
}

/**
 * 计算关键词命中比例。
 * 统计 chunkEntities 中有多少名称出现在 memory.summary + memory.content 中。
 * 空集合时返回 0。
 */
export function calculateKeywordHitRatio(
  memory: Memory,
  chunkEntities: Array<{ name: string }>,
): number {
  if (!chunkEntities || chunkEntities.length === 0) return 0;

  const haystack = `${memory.summary ?? ''}\n${memory.content ?? ''}`;
  if (!haystack) return 0;

  let hits = 0;
  for (const entity of chunkEntities) {
    const name = entity?.name?.trim();
    if (!name) continue;
    if (haystack.includes(name)) {
      hits += 1;
    }
  }
  return hits / chunkEntities.length;
}

/**
 * 计算时间衰减因子:exp(-ageDays / 30)
 * lastAccessedAt 越新,返回值越接近 1。
 */
export function calculateRecencyFactor(memory: Memory, now: number): number {
  const ts = memory.lastAccessedAt ?? memory.createdAt ?? now;
  const ageMs = Math.max(0, now - ts);
  const ageDays = ageMs / MS_PER_DAY;
  return Math.exp(-ageDays / RECENCY_HALF_LIFE_DAYS);
}

/**
 * 判断是否可以计算语义相似度(双方都有 embedding 时才行)
 */
function hasEmbeddings(
  memoryEmbedding: number[] | Float32Array | undefined | null,
  chunkEmbedding: number[] | Float32Array | undefined | null,
): boolean {
  return !!(memoryEmbedding && memoryEmbedding.length > 0 && chunkEmbedding && chunkEmbedding.length > 0);
}

/**
 * 对单条记忆打分,返回完整 breakdown 结构体。
 *
 * 权重固定为 SCORING_WEIGHTS(0.6 / 0.3 / 0.1)—— 不再按 embedding 可用性重新分配。
 * 当 embedding 不可用(关闭本地嵌入、版本不匹配、缺失等)时,semantic 记为 0,
 * 该条的最大总分回落到 0.4(keyword=1 + recency=1),用户的 minScore 阈值在
 * 这种模式下应当相应下调 —— 这是刻意的设计,让"有/无嵌入"模式下的权重含义一致,
 * 而不是靠重新分配权重人为抬高无嵌入模式的分数上限。
 */
export function scoreMemory(memory: Memory, context: ScoringContext): ScoreBreakdown {
  const versionOk =
    !context.expectedModelVersion || memory.embeddingModel === context.expectedModelVersion;
  const canUseSemantic = versionOk && hasEmbeddings(memory.embedding, context.chunkEmbedding);
  const semantic = canUseSemantic
    ? calculateSemanticSim(memory.embedding, context.chunkEmbedding)
    : 0;
  const keyword = calculateKeywordHitRatio(memory, context.chunkEntities);
  const recency = calculateRecencyFactor(memory, context.now);

  const semanticWeighted = semantic * SCORING_WEIGHTS.semantic;
  const keywordWeighted = keyword * SCORING_WEIGHTS.keyword;
  const recencyWeighted = recency * SCORING_WEIGHTS.recency;
  const total = semanticWeighted + keywordWeighted + recencyWeighted;

  return {
    semantic,
    keyword,
    recency,
    semanticWeighted,
    keywordWeighted,
    recencyWeighted,
    total,
  };
}

/**
 * Population-aware 批量打分 — 解决"所有 memory 向量抱团,绝对/相对阈值都失效"的场景。
 *
 * 和 `scoreMemory` 单条打分的关键区别:
 * 1. 先算所有 memory 的 raw cosine,再对**本批**做 z-score 归一化,映射回 [0, 1]
 *    作为语义信号。这样即使绝对值全部在 0.92 附近,分数也能按相对偏离度拉开。
 * 2. 若本批 raw cosine 的 stddev 低于 `SPREAD_FLOOR`(或有效样本 <2),整批
 *    把 semantic 记为 0 —— 权重仍是 SCORING_WEIGHTS,不做重新分配。
 * 3. 单条无 embedding 或版本不匹配的 memory 同样 semantic=0,独立降级不影响其它条。
 *
 * 返回与输入下标一一对应的 ScoredMemory 数组(未排序,保持输入顺序)。
 *
 * `breakdown.semantic` 存归一化后的值(UI 展示的就是"在本批中的相对排名信号"),
 * 这样 `semantic * SCORING_WEIGHTS.semantic === semanticWeighted` 的不变式始终成立。
 */
export function scoreMemoriesBatch(
  memories: Memory[],
  context: ScoringContext,
): ScoredMemory[] {
  if (!memories || memories.length === 0) return [];

  // Pass 1:算所有 memory 的 raw cosine(不可用的记为 null)
  const rawSemantics: Array<number | null> = memories.map((memory) => {
    const versionOk =
      !context.expectedModelVersion ||
      memory.embeddingModel === context.expectedModelVersion;
    if (!versionOk) return null;
    if (!hasEmbeddings(memory.embedding, context.chunkEmbedding)) return null;
    return calculateSemanticSim(memory.embedding, context.chunkEmbedding);
  });

  // Pass 2:统计本批 raw cosine 的 mean/stddev,判定语义信号是否有区分度
  const valid = rawSemantics.filter((r): r is number => r !== null);
  let mean = 0;
  let stddev = 0;
  if (valid.length >= 2) {
    mean = valid.reduce((a, b) => a + b, 0) / valid.length;
    const variance =
      valid.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / valid.length;
    stddev = Math.sqrt(variance);
  }
  // 只有一条 memory 或 spread 太小 → 语义不可用,整批降级
  const semanticUsable = valid.length >= 2 && stddev >= SPREAD_FLOOR;

  // Pass 3:逐条构造 breakdown
  return memories.map((memory, i) => {
    const raw = rawSemantics[i] ?? null;
    const itemCanUse = semanticUsable && raw !== null;

    // z-normalize 到 [0, 1]:(z + Z_CLAMP) / (2·Z_CLAMP),clamp 两端
    const normalized =
      itemCanUse && raw !== null
        ? Math.min(
            1,
            Math.max(0, ((raw - mean) / stddev + Z_CLAMP) / (2 * Z_CLAMP)),
          )
        : 0;

    const keyword = calculateKeywordHitRatio(memory, context.chunkEntities);
    const recency = calculateRecencyFactor(memory, context.now);

    const semanticWeighted = normalized * SCORING_WEIGHTS.semantic;
    const keywordWeighted = keyword * SCORING_WEIGHTS.keyword;
    const recencyWeighted = recency * SCORING_WEIGHTS.recency;

    return {
      memory,
      breakdown: {
        semantic: normalized,
        keyword,
        recency,
        semanticWeighted,
        keywordWeighted,
        recencyWeighted,
        total: semanticWeighted + keywordWeighted + recencyWeighted,
      },
    };
  });
}

/**
 * 相对排名过滤:先按 total 降序,再做两步收缩
 *
 * 1. 只保留 top-K(硬上限,防止"全员注入")
 * 2. 在 top-K 内进一步剔除分数比 top 低超过 relativeDelta 的条目(质量地板)
 *
 * 这一步独立于 minScore 的绝对阈值 — 用于应对 mean-pooled 多语言向量
 * 绝对余弦分布偏高、绝对阈值无区分度的情况。调用方可在此之前先用绝对
 * 阈值滤掉噪声地板以下的条目,再交给这里做相对收缩。
 */
export function filterByRelativeRanking(
  scoredMemories: ScoredMemory[],
  topK: number = DEFAULT_TOP_K,
  relativeDelta: number = DEFAULT_RELATIVE_DELTA,
): ScoredMemory[] {
  if (!scoredMemories || scoredMemories.length === 0) return [];
  const sorted = [...scoredMemories].sort((a, b) => b.breakdown.total - a.breakdown.total);
  const capped = sorted.slice(0, Math.max(0, topK));
  if (capped.length === 0) return [];
  const topScore = capped[0]!.breakdown.total;
  const threshold = topScore - relativeDelta;
  return capped.filter((s) => s.breakdown.total >= threshold);
}

/**
 * 贪心填充:按分数降序,遇到超预算/超上限/低于阈值即停止/跳过。
 *
 * 流程:
 * 1. 绝对阈值过滤(total >= minScore),滤掉噪声地板以下的条目
 * 2. 相对排名收缩(top-K + relativeDelta 窗口),解决"无关记忆也分数高"的膨胀
 * 3. 字符预算贪心填充
 *
 * 返回被选中的原始 Memory 数组(保持分数降序)。
 */
export function selectByBudget(
  scoredMemories: ScoredMemory[],
  charBudget: number = DEFAULT_CHAR_BUDGET,
  hardCap: number = HARD_ITEM_CAP,
  minScore: number = DEFAULT_MIN_SCORE,
  topK: number = DEFAULT_TOP_K,
  relativeDelta: number = DEFAULT_RELATIVE_DELTA,
): Memory[] {
  if (!scoredMemories || scoredMemories.length === 0) return [];

  const absoluteFiltered = scoredMemories.filter((s) => s.breakdown.total >= minScore);
  // 绝对阈值通过后再做相对排名收缩 — 即便 minScore 对当前分布无效,
  // top-K + delta 窗口依然能把"全员膨胀"压回到少数几条真正突出的记忆
  const ranked = filterByRelativeRanking(absoluteFiltered, topK, relativeDelta);

  const selected: Memory[] = [];
  let usedChars = 0;

  for (const item of ranked) {
    if (selected.length >= hardCap) break;
    const cost = (item.memory.summary ?? '').length;
    if (usedChars + cost > charBudget && selected.length > 0) break;
    selected.push(item.memory);
    usedChars += cost;
  }

  return selected;
}
