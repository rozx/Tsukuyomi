/**
 * 记忆打分（语义 + 关键词；时间仅保留为展示信息）
 *
 * 单条公式: score = 0.7·semantic + 0.3·keyword
 * 批量查询使用 dense / keyword 的归一化 RRF 排名融合。
 * 最大分 = 1.0,默认阈值 0.38。
 */
import type { Memory } from 'src/models/memory';
import type { ScoreBreakdown } from 'src/models/novel';
import { cosineSimilarity as calculateSemanticSim } from 'src/utils/cosine-similarity';
export { calculateSemanticSim };

export const SCORING_WEIGHTS = {
  semantic: 0.7,
  keyword: 0.3,
  recency: 0,
} as const;

export const MAX_TOTAL_SCORE = 1.0;

export const DEFAULT_CHAR_BUDGET = 2000;
export const HARD_ITEM_CAP = 25;
export const DEFAULT_MIN_SCORE = 0.3;

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
const DEFAULT_TOP_K = 8;
const DEFAULT_RELATIVE_DELTA = 0.1;

/** 章节检索旧有 z-score 管线共用的 spread 下限；记忆检索已改用 RRF。 */
export const SPREAD_FLOOR = 0.02;

/** 章节检索旧有 z-score 管线共用的截断边界；记忆检索已改用 RRF。 */
export const Z_CLAMP = 2;

/** RRF 平滑常数。记忆候选通常不超过 500，取 10 能保留足够的头部区分度。 */
export const RANK_FUSION_K = 10;

const RECENCY_HALF_LIFE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ScoredMemory {
  memory: Memory;
  breakdown: ScoreBreakdown;
}

export interface ScoringContext {
  /**
   * 实体列表(翻译注入路径传 terms+characters)。与 `rawQuery` 二选一:
   * 传 entities 走字面 includes 匹配,适合 proper noun 集合。
   */
  chunkEntities: Array<{ name: string }>;
  /**
   * 自然语言查询原文(搜索路径传)。传入时优先用部分匹配打分 ——
   * 按 CJK 连续块切"语义单元",每个单元取在 memory 里的最长公共子串 / 单元长度
   * 作为命中度,对无空格 CJK 查询比字面 includes 友好得多。
   */
  rawQuery?: string | undefined;
  chunkEmbedding?: Float32Array | number[] | undefined;
  /**
   * 长文本拆分后的多个查询向量。存在时优先于 `chunkEmbedding`；先做多分段稳健聚合，
   * 再把结果作为 dense 排名信号参与 RRF。
   */
  chunkEmbeddings?: ReadonlyArray<Float32Array | number[]> | undefined;
  now: number;
  /**
   * 期望的 embedding 模型版本。传入时,`memory.embeddingModel` 与之不匹配的记录
   * 会被视为无语义向量,避免跨 embedding 空间的余弦相似度退化成噪声。
   */
  expectedModelVersion?: string | undefined;
}

/**
 * 计算关键词命中比例(基于实体集合)。
 * 统计 chunkEntities 中有多少名称字面出现在 memory.summary + memory.content 中。
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
 * 从自然语言 query 里抽出"语义单元"——用于搜索场景的部分匹配打分。
 *
 * 单元 = CJK 连续块(汉字/假名)∪ 字母数字词 ∪ identifier 字符。忽略标点和空白分隔符。
 * - CJK / ALPHA_RUN:长度 ≥ 2 才入,避免单字噪声(单个汉字在大量 memory 里都能命中)
 * - IDENTIFIER_RUN:**单字符即入**,因为圈号/罗马数字本身就是完整的章节序号 token
 *   (轻小说章节标题大量用 ① ⑥ Ⅴ 这类),长度过滤会把它们误删
 */
const CJK_RUN = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff々ー〇]+/g;
const ALPHA_RUN = /[a-z0-9]{2,}/g;
/**
 * Identifier 字符:
 * - U+2460–U+24FF: 圈号(① ② ⑥ ⑳ ㈠ ㊀ etc.)
 * - U+2160–U+217F: 罗马数字(Ⅰ Ⅱ Ⅲ ⅷ ⅹ etc.)
 * 单字符即一个 unit;不与相邻 CJK / ALPHA 合并(它们各自有独立扫描)。
 */
const IDENTIFIER_RUN = /[\u2460-\u24ff\u2160-\u217f]/g;

export function extractQueryUnits(query: string): string[] {
  const units: string[] = [];
  const lower = query.toLowerCase();
  for (const m of lower.matchAll(CJK_RUN)) {
    if (m[0].length >= 2) units.push(m[0]);
  }
  for (const m of lower.matchAll(ALPHA_RUN)) {
    units.push(m[0]);
  }
  for (const m of lower.matchAll(IDENTIFIER_RUN)) {
    units.push(m[0]);
  }
  return units;
}

/**
 * 判断 unit 是不是 "identifier" — 章节序号/卷号性质的强结构信号。
 *
 * 包含:
 * - 纯阿拉伯数字(`83`、`100`)
 * - 纯中文数字(`〇一二三四五六七八九十百千` 组合,如 `八十三`)
 * - 圈号(① ⑥ etc.,U+2460–U+24FF)
 * - 罗马数字(Ⅰ Ⅴ Ⅹ,U+2160–U+217F)
 *
 * 这类 unit 在打分和惩罚时都享有比专名更强的权重 — query 里出现 identifier 通常
 * 表示用户想精确命中某个具体章节(83 / 第六章 / ⑥),系统应据此严格匹配。
 */
const ARABIC_NUMBER = /^\d+$/;
const CHINESE_NUMBER = /^[〇一二三四五六七八九十百千]+$/;
const CIRCLED_OR_ROMAN = /^[\u2460-\u24ff\u2160-\u217f]$/;
export function isIdentifierUnit(unit: string): boolean {
  return ARABIC_NUMBER.test(unit) || CIRCLED_OR_ROMAN.test(unit) || CHINESE_NUMBER.test(unit);
}

/**
 * 复合 query 切分:按 CJK/西文标点和空白断句,过滤掉太短的片段。
 * 单问题返回 [原 query];多子问题返回 [原 query, 子 1, 子 2, ...]
 * —— 保留原 query 作为基线,让恰好能精确匹配整句的 memory 不被拆分稀释。
 *
 * 例:"老瓦的称号是什么，他和芬恩是什么关系" →
 *   ["老瓦的称号是什么，他和芬恩是什么关系",
 *    "老瓦的称号是什么",
 *    "他和芬恩是什么关系"]
 */
const COMPOUND_SPLIT_RE = /[，,、；;。？?！!\s]+/;
function splitCompoundQuery(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const parts = trimmed.split(COMPOUND_SPLIT_RE).filter((p) => p.length >= 2);
  if (parts.length <= 1) return [trimmed];
  return [trimmed, ...parts];
}

/**
 * summary 是"检索标题",命中权重 1.0;content-only 命中按 0.5 折算。
 * 目的:同样部分匹配的两条 memory,summary 含字面的排在前面
 * (之前 summary 与 content 合成 haystack,summary 命中被 content 长度稀释)。
 */
const SUMMARY_HIT_WEIGHT = 1.0;
const CONTENT_HIT_WEIGHT = 0.5;

/**
 * 可选的关键词打分上下文,由调用方(章节检索)注入,让专名 / identifier / 稀有词
 * 命中获得额外加权。
 *
 * 加权优先级(按 unit 选**第一项匹配**,不复合):
 * 1. **identifierBoost**: 当 unit 是 identifier(圈号/罗马数字/纯数字/纯中文数字)时,
 *    命中分乘以此系数。Identifier 是最强的精确定位信号(结构性),应永远独占。
 * 2. **idfWeights**: 数据驱动的稀有度加权。Map<unit, idf ∈ [0, 1]>。
 *    multiplier = 0.3 + 1.7 × idf,即稀有 unit 拿 2.0×、最常见 unit 仅 0.3× 抑制。
 *    (round 5 收紧:常见词从 0.5× 进一步压到 0.3×,让锚点稀有词对排序的影响更激进)。
 *    比固定 properNoun boost 鲁棒 — 角色名在很多章出现时不会被误抬。
 * 3. **properNouns + boost**(fallback): 没传 idfWeights 时回落到固定 boost,
 *    保持 round 2 的向后兼容(memory 注入路径仍走这条)。
 * 加权后 clamp 到 [0, 1]。
 *
 * 不传 / 传空 → 行为与旧逻辑完全一致(memory-scoring 自身不维护这些表)。
 */
export interface KeywordScoringOptions {
  properNouns?: Set<string>;
  boost?: number;
  identifierBoost?: number;
  idfWeights?: Map<string, number>;
}

/**
 * 同一 unit 对 summary / content 的基础命中分(取 max)。
 * summary 命中完整权重,content-only 折半。
 */
function computeBaseUnitScore(unit: string, summary: string, content: string): number {
  const sRatio = summary ? partialMatchLength(unit, summary) / unit.length : 0;
  const cRatio = content ? partialMatchLength(unit, content) / unit.length : 0;
  return Math.max(sRatio * SUMMARY_HIT_WEIGHT, cRatio * CONTENT_HIT_WEIGHT);
}

/**
 * identifier 加权档:unit 是章节/卷号类结构字符时的强信号,最优先匹配。
 */
function identifierMultiplier(unit: string, options: KeywordScoringOptions | undefined): number {
  const identifierBoost = options?.identifierBoost ?? 1;
  if (identifierBoost <= 1) return 1;
  return isIdentifierUnit(unit) ? identifierBoost : 1;
}

/**
 * idf 数据驱动档:稀有 unit 拿 2.0×,最常见 unit 压到 0.3×。
 * round 5 收紧:常见词从 0.5× 压到 0.3×,稀有上限不变。
 */
function idfMultiplier(unit: string, options: KeywordScoringOptions | undefined): number {
  const idfWeights = options?.idfWeights;
  if (!idfWeights) return 1;
  const w = idfWeights.get(unit);
  if (w === undefined) return 1;
  return 0.3 + 1.7 * w;
}

/**
 * properNoun fallback 档:固定 boost,仅当 unit 在配置的 properNouns 集合里。
 */
function properNounMultiplier(unit: string, options: KeywordScoringOptions | undefined): number {
  const boost = options?.boost ?? 1;
  if (boost <= 1) return 1;
  return options?.properNouns?.has(unit) ? boost : 1;
}

/**
 * 加权优先级:identifier(结构性)→ idf(数据驱动)→ properNoun(配置 fallback)
 * 三者**互斥**(不复合):一旦匹配上一档就不再看下一档,避免角色名同时拿 boost+idf
 * 这种"先验+后验"复合放大。
 */
function selectUnitMultiplier(unit: string, options: KeywordScoringOptions | undefined): number {
  const m1 = identifierMultiplier(unit, options);
  if (m1 !== 1) return m1;
  const m2 = idfMultiplier(unit, options);
  if (m2 !== 1) return m2;
  return properNounMultiplier(unit, options);
}

/**
 * 单条(不含子拆分)query 对 memory 的关键词部分匹配分。
 * summary / content 分别打分,取 max,再按单元平均。
 */
function scoreSingleQueryAgainstMemory(
  query: string,
  memory: Memory,
  options?: KeywordScoringOptions,
): number {
  const units = extractQueryUnits(query);
  if (units.length === 0) return 0;
  const summary = (memory.summary ?? '').toLowerCase();
  const content = (memory.content ?? '').toLowerCase();
  if (!summary && !content) return 0;

  let totalScore = 0;
  for (const unit of units) {
    let unitScore = computeBaseUnitScore(unit, summary, content);
    if (unitScore > 0) {
      const multiplier = selectUnitMultiplier(unit, options);
      if (multiplier !== 1) {
        // multiplier > 1 时 clamp [0, 1];multiplier < 1 时不 clamp(允许 0.5x 抑制泛词)。
        unitScore = Math.min(1, unitScore * multiplier);
      }
    }
    totalScore += unitScore;
  }
  return totalScore / units.length;
}

/**
 * 部分匹配打分:对每个语义单元,找它在 memory 里的最长公共子串,
 * 把长度 / 单元长度作为该单元的命中分(0~1)。两层改进:
 *
 * 1. **summary / content 分别打分**:summary 命中权重 1.0,content-only 权重 0.5。
 *    这样 summary 含关键字面的 memory 排序更靠前,不再被 content 长度稀释。
 * 2. **复合 query 拆分取 max**:按标点切子 query,分别打分取最大值。
 *    "老瓦的称号，他和芬恩的关系"只覆盖其中一问的 memory 也能拿到高分,
 *    不被不相关的子问题拖累。
 *
 * 例:query "闇のマリアンヌ" 对 memory(summary="闇の[角色名]") →
 *   sRatio = 2/7 ≈ 0.286,content=0 → unitScore = 0.286。
 */
export function calculateQueryKeywordScore(
  query: string,
  memory: Memory,
  options?: KeywordScoringOptions,
): number {
  const subQueries = splitCompoundQuery(query);
  let maxScore = 0;
  for (const sub of subQueries) {
    const score = scoreSingleQueryAgainstMemory(sub, memory, options);
    if (score > maxScore) maxScore = score;
  }
  return maxScore;
}

/**
 * 返回 unit 在 haystack 中的最长公共子串长度。从大到小试,首次命中即返回
 * (早停,避免 O(n²) 完整扫)。
 *
 * 长度处理:
 * - length === 1:由 extractQueryUnits 的契约保证只有 identifier 字符(圈号 / 罗马数字)
 *   才会以单字符进来,所以直接 includes 检查即可 — 它们都是低噪声字符,不会像
 *   单字汉字那样到处误命中。
 * - length >= 2:正常的最长公共子串扫描。
 */
function partialMatchLength(unit: string, haystack: string): number {
  if (unit.length === 0) return 0;
  if (unit.length === 1) return haystack.includes(unit) ? 1 : 0;
  if (haystack.includes(unit)) return unit.length;
  for (let len = unit.length - 1; len >= 2; len--) {
    for (let i = 0; i + len <= unit.length; i++) {
      if (haystack.includes(unit.slice(i, i + len))) return len;
    }
  }
  return 0;
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

type EmbeddingVector = number[] | Float32Array;

function resolveChunkEmbeddings(context: ScoringContext): EmbeddingVector[] {
  const chunkEmbeddings = context.chunkEmbeddings?.filter((embedding) => embedding.length > 0);
  if (chunkEmbeddings && chunkEmbeddings.length > 0) return [...chunkEmbeddings];
  if (context.chunkEmbedding && context.chunkEmbedding.length > 0) {
    return [context.chunkEmbedding];
  }
  return [];
}

function resolveMemoryEmbeddings(memory: Memory): EmbeddingVector[] {
  const embeddings = memory.embeddings?.filter((embedding) => embedding.length > 0);
  if (embeddings && embeddings.length > 0) return [...embeddings];
  return [];
}

/**
 * 多分段语义聚合。
 *
 * 摘要向量作为独立标题信号，不被正文稀释；正文同时考虑最佳与次佳分段，避免一个
 * 偶然高余弦分段独占整条记忆。查询侧兼顾最佳子查询和全部子查询覆盖率，避免复合
 * 查询只命中一个子问题就排到最前。
 */
export function calculateSegmentedSemanticSimilarity(
  memoryEmbeddings: EmbeddingVector[],
  chunkEmbeddings: EmbeddingVector[],
  hasSummaryEmbedding = false,
): number {
  if (memoryEmbeddings.length === 0 || chunkEmbeddings.length === 0) return 0;

  const perQueryScores = chunkEmbeddings.map((chunkEmbedding) => {
    const summarySimilarity = hasSummaryEmbedding
      ? calculateSemanticSim(memoryEmbeddings[0], chunkEmbedding)
      : 0;
    const contentEmbeddings = hasSummaryEmbedding ? memoryEmbeddings.slice(1) : memoryEmbeddings;
    const contentSimilarities = contentEmbeddings
      .map((memoryEmbedding) => calculateSemanticSim(memoryEmbedding, chunkEmbedding))
      .sort((a, b) => b - a);
    const bestContent = contentSimilarities[0] ?? 0;
    const supportingContent = contentSimilarities[1] ?? bestContent;
    const contentScore = bestContent * 0.7 + supportingContent * 0.3;
    return Math.max(summarySimilarity, contentScore);
  });
  const bestQueryScore = Math.max(...perQueryScores);
  const queryCoverage =
    perQueryScores.reduce((sum, score) => sum + score, 0) / perQueryScores.length;
  return bestQueryScore * 0.6 + queryCoverage * 0.4;
}

/** 无语义信号时只使用关键词相关性；访问时间不参与相关性排序。 */
export const FALLBACK_WEIGHTS = {
  keyword: 1,
  recency: 0,
} as const;

/**
 * 根据 context 选择关键词信号:
 * - 有 rawQuery → 部分匹配打分(搜索路径,CJK 自然语言查询友好)
 * - 否则 → 实体字面匹配(翻译注入路径)
 */
function resolveKeyword(memory: Memory, context: ScoringContext): number {
  if (context.rawQuery && context.rawQuery.trim().length > 0) {
    return calculateQueryKeywordScore(context.rawQuery, memory);
  }
  return calculateKeywordHitRatio(memory, context.chunkEntities);
}

/**
 * 对单条记忆打分,返回完整 breakdown 结构体。
 * embedding 不可用时按原始关键词置信度降级，访问时间仅保留在 breakdown 中展示。
 */
export function scoreMemory(memory: Memory, context: ScoringContext): ScoreBreakdown {
  const chunkEmbeddings = resolveChunkEmbeddings(context);
  const memoryEmbeddings = resolveMemoryEmbeddings(memory);
  const versionOk =
    !context.expectedModelVersion || memory.embeddingModel === context.expectedModelVersion;
  const canUseSemantic = versionOk && chunkEmbeddings.length > 0 && memoryEmbeddings.length > 0;
  const semantic = canUseSemantic
    ? calculateSegmentedSemanticSimilarity(
        memoryEmbeddings,
        chunkEmbeddings,
        Boolean(memory.summary?.trim()),
      )
    : 0;
  const keyword = resolveKeyword(memory, context);
  const recency = calculateRecencyFactor(memory, context.now);

  let semanticWeighted: number;
  let keywordWeighted: number;
  let recencyWeighted: number;
  if (canUseSemantic) {
    semanticWeighted = semantic * SCORING_WEIGHTS.semantic;
    keywordWeighted = keyword * SCORING_WEIGHTS.keyword;
    recencyWeighted = recency * SCORING_WEIGHTS.recency;
  } else {
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
 * 批量打分：用 dense / keyword 的归一化 RRF 融合相对名次。
 *
 * 和 `scoreMemory` 单条打分的关键区别:
 * 1. dense 先做多分段稳健聚合，再转成归一化 RRF 名次分，窄余弦分布也不会整批失效。
 * 2. keyword 同样转成 RRF 名次分，但仍乘原始命中置信度，避免弱部分匹配被抬成高分。
 * 3. 缺失某一路信号时，剩余信号的权重自动归一到 1；访问时间不参与排序。
 *
 * 返回与输入下标一一对应的 ScoredMemory 数组(未排序,保持输入顺序)。
 *
 * `breakdown.semantic` 存归一化后的值(UI 展示的就是"在本批中的相对排名信号")。
 */
export function scoreMemoriesBatch(memories: Memory[], context: ScoringContext): ScoredMemory[] {
  if (!memories || memories.length === 0) return [];

  const chunkEmbeddings = resolveChunkEmbeddings(context);

  // Pass 1:计算 dense 与 keyword 原始信号，再分别转成 RRF 名次分。
  const rawSemantics: Array<number | null> = memories.map((memory) => {
    const versionOk =
      !context.expectedModelVersion || memory.embeddingModel === context.expectedModelVersion;
    if (!versionOk) return null;
    const memoryEmbeddings = resolveMemoryEmbeddings(memory);
    if (chunkEmbeddings.length === 0 || memoryEmbeddings.length === 0) return null;
    return calculateSegmentedSemanticSimilarity(
      memoryEmbeddings,
      chunkEmbeddings,
      Boolean(memory.summary?.trim()),
    );
  });

  const rawKeywords = memories.map((memory) => resolveKeyword(memory, context));
  const semanticRanks = calculateNormalizedRrfScores(rawSemantics);
  const keywordRanks = calculateNormalizedRrfScores(
    rawKeywords.map((keyword) => (keyword > 0 ? keyword : null)),
  );
  const hasSemantic = rawSemantics.some((semantic) => semantic !== null);
  const hasKeyword = rawKeywords.some((keyword) => keyword > 0);
  const availableWeight =
    (hasSemantic ? SCORING_WEIGHTS.semantic : 0) + (hasKeyword ? SCORING_WEIGHTS.keyword : 0);
  const semanticWeight =
    availableWeight > 0 && hasSemantic ? SCORING_WEIGHTS.semantic / availableWeight : 0;
  const keywordWeight =
    availableWeight > 0 && hasKeyword ? SCORING_WEIGHTS.keyword / availableWeight : 0;

  // Pass 2:逐条构造 breakdown。
  return memories.map((memory, i) => {
    const semantic = semanticRanks[i] ?? 0;
    const keyword = rawKeywords[i] ?? 0;
    const recency = calculateRecencyFactor(memory, context.now);
    const semanticWeighted = semantic * semanticWeight;
    const keywordWeighted = keyword * (keywordRanks[i] ?? 0) * keywordWeight;
    const recencyWeighted = 0;

    return {
      memory,
      breakdown: {
        semantic,
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
 * 把一个信号列表转成 [0, 1] 的 RRF 排名分。相同原始分使用相同名次；null 不参赛。
 */
function calculateNormalizedRrfScores(values: Array<number | null>): number[] {
  const ranked = values
    .map((value, index) => ({ value, index }))
    .filter((item): item is { value: number; index: number } => item.value !== null)
    .sort((a, b) => b.value - a.value || a.index - b.index);
  const scores = values.map(() => 0);
  let lastValue: number | undefined;
  let lastRank = 0;
  ranked.forEach((item, sortedIndex) => {
    if (lastValue === undefined || Math.abs(item.value - lastValue) > 1e-9) {
      lastRank = sortedIndex + 1;
      lastValue = item.value;
    }
    scores[item.index] = (RANK_FUSION_K + 1) / (RANK_FUSION_K + lastRank);
  });
  return scores;
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
