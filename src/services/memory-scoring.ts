/**
 * 记忆打分(三信号:语义 + 关键词 + 时间衰减)
 *
 * 公式: score = 3.0·semantic + 2.0·keyword + 1.0·recency
 * 最大分 = 6.0,默认阈值 0.3。
 */
import type { Memory } from 'src/models/memory';
import type { ScoreBreakdown } from 'src/models/novel';

export const SCORING_WEIGHTS = {
  semantic: 3.0,
  keyword: 2.0,
  recency: 1.0,
} as const;

export const MAX_TOTAL_SCORE =
  SCORING_WEIGHTS.semantic + SCORING_WEIGHTS.keyword + SCORING_WEIGHTS.recency;

export const DEFAULT_CHAR_BUDGET = 2000;
export const HARD_ITEM_CAP = 25;
export const DEFAULT_MIN_SCORE = 0.3;

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
 * 余弦相似度(结果 clamp 到 [0, 1])。
 * 任一向量为空或维度不匹配时返回 0。
 * 约定:输入向量通常已 L2 归一化,分母依然显式计算以兼容未归一化情形。
 */
export function calculateSemanticSim(
  memoryEmbedding: Float32Array | number[] | undefined,
  chunkEmbedding: Float32Array | number[] | undefined,
): number {
  if (!memoryEmbedding || !chunkEmbedding) return 0;
  if (memoryEmbedding.length === 0 || chunkEmbedding.length === 0) return 0;
  if (memoryEmbedding.length !== chunkEmbedding.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < memoryEmbedding.length; i++) {
    const a = memoryEmbedding[i] ?? 0;
    const b = chunkEmbedding[i] ?? 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (normA === 0 || normB === 0) return 0;
  const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  if (Number.isNaN(sim)) return 0;
  return Math.min(1, Math.max(0, sim));
}

/**
 * 对单条记忆打分,返回完整 breakdown 结构体。
 */
export function scoreMemory(memory: Memory, context: ScoringContext): ScoreBreakdown {
  const semantic = calculateSemanticSim(memory.embedding, context.chunkEmbedding);
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
