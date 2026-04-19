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
 * 无 embedding 时的降级权重:将语义权重按 3:1 比例重新分配给 keyword 和 recency,
 * 使 keyword=0.75、recency=0.25,最大分仍为 1.0。
 */
export const FALLBACK_WEIGHTS = {
  keyword: 0.75,
  recency: 0.25,
} as const;

/**
 * 对单条记忆打分,返回完整 breakdown 结构体。
 * 当 embedding 不可用时,自动切换为降级权重(keyword=0.75, recency=0.25),
 * 避免语义信号缺失导致分数天花板过低。
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

  let semanticWeighted: number;
  let keywordWeighted: number;
  let recencyWeighted: number;

  if (canUseSemantic) {
    // 正常三信号打分
    semanticWeighted = semantic * SCORING_WEIGHTS.semantic;
    keywordWeighted = keyword * SCORING_WEIGHTS.keyword;
    recencyWeighted = recency * SCORING_WEIGHTS.recency;
  } else {
    // 降级:跳过语义,重新分配权重
    semanticWeighted = 0;
    keywordWeighted = keyword * FALLBACK_WEIGHTS.keyword;
    recencyWeighted = recency * FALLBACK_WEIGHTS.recency;
  }

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
 * 贪心填充:按分数降序,遇到超预算/超上限/低于阈值即停止/跳过。
 *
 * - 先按 total 降序排序
 * - 过滤掉 total < minScore 的项
 * - 限制条目数 ≤ hardCap
 * - 按 summary 字符长度累加,超过 charBudget 则停止继续添加
 *
 * 返回被选中的原始 Memory 数组(保持分数降序)。
 */
export function selectByBudget(
  scoredMemories: ScoredMemory[],
  charBudget: number = DEFAULT_CHAR_BUDGET,
  hardCap: number = HARD_ITEM_CAP,
  minScore: number = DEFAULT_MIN_SCORE,
): Memory[] {
  if (!scoredMemories || scoredMemories.length === 0) return [];

  const filtered = scoredMemories
    .filter((s) => s.breakdown.total >= minScore)
    .sort((a, b) => b.breakdown.total - a.breakdown.total);

  const selected: Memory[] = [];
  let usedChars = 0;

  for (const item of filtered) {
    if (selected.length >= hardCap) break;
    const cost = (item.memory.summary ?? '').length;
    if (usedChars + cost > charBudget && selected.length > 0) break;
    selected.push(item.memory);
    usedChars += cost;
  }

  return selected;
}
