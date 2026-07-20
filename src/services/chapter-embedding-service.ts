/**
 * ChapterEmbeddingService — 章节级多向量嵌入
 *
 * 职责:
 * - 切 chunk(按段落边界,目标 ~1500 字符)
 * - 拼接原文+译文作为嵌入输入
 * - 为每章额外生成一条 `kind: 'title'` chunk(章节标题 + 首段,截到 300 字),
 *   作为标题型 query 的语义锚点
 * - 调 EmbeddingService.embedBatch 生成向量(content + title 一并送入,共用模型 warmup)
 * - 原子替换 chapter-embeddings store 中该章节的所有 chunk(按 kind 分别清旧)
 * - 提供 queryChapters 做混合检索:语义(z-score 归一化)+ 关键词(字面),
 *   章节级 semantic 取 max(title, content_max, content_top3_mean)
 *
 * 存储布局:
 * - store: `chapter-embeddings`
 * - key: `${chapterId}:${kind}:${chunkIndex}`(v11+;v10 旧 key `${chapterId}:${chunkIndex}` 已 migrate)
 * - indexes: `by-chapterId` / `by-bookId`
 *
 * 同步:
 * - 不参与 Gist 上传;新设备通过 EmbeddingQueue 的 backlog 扫描本地重算
 */

import { getDB } from 'src/utils/indexed-db';
import { getSelectedTranslation } from 'src/utils/text-utils';
import { cosineSimilarity } from 'src/utils/cosine-similarity';
import type { Novel, Paragraph } from 'src/models/novel';
import type { ChapterEmbedding, ChapterEmbeddingKind } from 'src/models/chapter-embedding';
import { EmbeddingService, MODEL_VERSION } from 'src/services/embedding-service';
import { loadChapterContent } from 'src/utils/chapter-content-loader';
import {
  lookupChapterBookFromDB,
  loadBookMetaFromDB,
} from 'src/utils/chapter-book-lookup';
import {
  calculateQueryKeywordScore,
  extractQueryUnits,
  isIdentifierUnit,
  SPREAD_FLOOR,
  Z_CLAMP,
} from 'src/services/memory-scoring';
import type { Memory } from 'src/models/memory';

/**
 * 把任意 (summary, content) 对包成 calculateQueryKeywordScore 需要的最小 Memory 形态。
 * memory-scoring 里的部分匹配逻辑只读这两个字段,其它字段不会被触碰。
 *
 * `properNouns` 传入时,每个 query unit 命中且在该集合里 → 命中分乘以 PROPER_NOUN_BOOST。
 */
function kwOnText(
  query: string,
  summary: string,
  content: string,
  properNouns?: Set<string>,
  idfWeights?: Map<string, number>,
): number {
  const fakeMem = { summary, content } as Pick<Memory, 'summary' | 'content'> as Memory;
  const options: {
    properNouns?: Set<string>;
    boost: number;
    identifierBoost: number;
    idfWeights?: Map<string, number>;
  } = {
    boost: PROPER_NOUN_BOOST,
    identifierBoost: IDENTIFIER_BOOST,
  };
  if (properNouns) options.properNouns = properNouns;
  if (idfWeights) options.idfWeights = idfWeights;
  return calculateQueryKeywordScore(query, fakeMem, options);
}

/**
 * 在线 IDF:对 query 的每个 unit,统计它在全书 chunks(content + title)snippet 里
 * 出现在多少**不同章节**中,然后按 `log((N+1)/(df+1)) / log(N+1)` 归一化到 [0, 1]。
 *
 * - 稀有 unit(`新据点` 在 1 章) → idf 接近 1 → 在打分时拿 2× boost
 * - 常见 unit(`阿莉亚` 在 40 章里都有) → idf 接近 0 → 仅 0.5× 弱化权重
 * - 这是**数据驱动**的加权,比固定 properNoun boost 鲁棒:角色名在很多章出现时
 *   不会被误抬到压制场景细节词的程度
 *
 * 使用 snippet(前 200 字)而非全文计算 df:精度有损但成本低,且 snippet 已是章节
 * 的代表性片段。chunks 在 queryChapters 早就加载过,这里零额外 IO。
 *
 * Identifier unit(数字 / 圈号 / 罗马数字)不计入 IDF — 它们走 IDENTIFIER_BOOST,
 * 优先级最高且语义和频率无关。
 */
export function computeQueryUnitIdf(
  query: string,
  chunks: ChapterEmbedding[],
): Map<string, number> {
  const result = new Map<string, number>();
  const units = extractQueryUnits(query);
  if (units.length === 0 || chunks.length === 0) return result;

  // 按 chapterId 聚合 snippet,避免同章多 chunk 重复计 df
  const chapterSnippets = new Map<string, string>();
  for (const c of chunks) {
    const prev = chapterSnippets.get(c.chapterId) ?? '';
    chapterSnippets.set(c.chapterId, prev + '\n' + (c.textSnippet ?? '').toLowerCase());
  }
  const totalChapters = chapterSnippets.size;
  if (totalChapters === 0) return result;

  const denom = Math.log(totalChapters + 1);
  const seen = new Set<string>();
  for (const unit of units) {
    if (seen.has(unit)) continue;
    seen.add(unit);
    if (isIdentifierUnit(unit)) continue; // identifier 走 IDENTIFIER_BOOST,不掺和

    let df = 0;
    for (const snippet of chapterSnippets.values()) {
      if (snippet.includes(unit)) df += 1;
    }
    const idf = Math.log((totalChapters + 1) / (df + 1)) / denom;
    result.set(unit, Math.min(1, Math.max(0, idf)));
  }
  return result;
}

/**
 * 抽取 query 里的 identifier units(用 memory-scoring 的 isIdentifierUnit 同款判定)。
 * 用于 queryChapters 的 mismatch 惩罚:命中后看候选章节标题是否含全部 identifier。
 *
 * 注意:这里复用 memory-scoring 内部的 unit 抽取规则(CJK / ALPHA / IDENTIFIER 三类),
 * 但只筛出 identifier 类。因 extractQueryUnits 没有 export,此处独立实现一份规则匹配。
 * 保持两边正则一致是契约 — 单测会覆盖。
 */
const QUERY_IDENTIFIER_RUN_GLOBAL = /[\u2460-\u24ff\u2160-\u217f]|[0-9]+|[〇一二三四五六七八九十百千]+/g;
function extractIdentifiersFromQuery(query: string): string[] {
  if (!query) return [];
  const lower = query.toLowerCase();
  const out: string[] = [];
  for (const m of lower.matchAll(QUERY_IDENTIFIER_RUN_GLOBAL)) {
    if (isIdentifierUnit(m[0])) out.push(m[0]);
  }
  return out;
}

/**
 * 章节检索的别名索引 — 从 Novel 的 terminologies 和 characterSettings(后者带 aliases)
 * 提取出"专名集合"和"同义词组列表"。
 *
 * - `properNouns`: 全部 lowercase 的专名(用于 keyword 打分时的 unit-level 加权)
 * - `aliasGroups`: 每个术语 / 角色一组,组内成员互为同义词(中文 ↔ 日文 ↔ aliases),
 *   query 时只要任一成员出现就把整组其它成员追加到 query,实现跨语言归一
 *
 * 实现细节:
 * - 长度 < 2 的 unit 不入专名表(单字噪声大,且 extractQueryUnits 也忽略它们)
 * - 同一字符串可能作为多组的成员(罕见但可能,如人名重名)— 都加进 properNouns 没问题;
 *   alias 扩展时同义组通过 group 级别去重,不会无限扩张
 * - 全部 lowercase 与 memory-scoring 内部一致(extractQueryUnits 也 lowercase)
 */
export interface BookAliasIndex {
  properNouns: Set<string>;
  aliasGroups: string[][];
}

export function buildBookAliasIndex(book: Novel | null | undefined): BookAliasIndex {
  const properNouns = new Set<string>();
  const aliasGroups: string[][] = [];
  if (!book) return { properNouns, aliasGroups };

  const addToGroup = (group: Set<string>, raw: string | undefined | null): void => {
    const v = (raw ?? '').trim().toLowerCase();
    if (v.length < 2) return;
    group.add(v);
    properNouns.add(v);
  };

  for (const term of book.terminologies ?? []) {
    const group = new Set<string>();
    addToGroup(group, term?.name);
    addToGroup(group, term?.translation?.translation);
    if (group.size > 0) aliasGroups.push([...group]);
  }
  for (const ch of book.characterSettings ?? []) {
    const group = new Set<string>();
    addToGroup(group, ch?.name);
    addToGroup(group, ch?.translation?.translation);
    for (const a of ch?.aliases ?? []) {
      addToGroup(group, a?.name);
      addToGroup(group, a?.translation?.translation);
    }
    if (group.size > 0) aliasGroups.push([...group]);
  }

  return { properNouns, aliasGroups };
}

/**
 * 别名扩展:对原始 query 字面包含任一组成员 → 把该组其它成员追加到 query 末尾(空格分隔)。
 *
 * 例:query "莉莉花园在等谁" + group ["莉莉花园", "リリーガーデン"] →
 *   "莉莉花园在等谁 リリーガーデン"
 *
 * 这样 splitCompoundQuery + extractQueryUnits 在打分时会把 "リリーガーデン" 也算作一个
 * unit,从而命中只含日文形态的章节 chunk。原 query 形态不被破坏(子句拆分仍走原路径)。
 */
export function expandQueryWithAliases(query: string, index: BookAliasIndex): string {
  if (!query || index.aliasGroups.length === 0) return query;
  const lower = query.toLowerCase();
  const additions = new Set<string>();
  for (const group of index.aliasGroups) {
    let hit: string | null = null;
    for (const member of group) {
      if (lower.includes(member)) {
        hit = member;
        break;
      }
    }
    if (hit === null) continue;
    for (const member of group) {
      if (member === hit) continue;
      if (lower.includes(member)) continue;
      additions.add(member);
    }
  }
  if (additions.size === 0) return query;
  return `${query} ${[...additions].join(' ')}`;
}

/**
 * 目标 chunk 字符数(不会破坏段落)。
 *
 * Round 5 从 1500 缩到 400 — 大约对应"段落级"粒度(轻小说一段平均 100-300 字,
 * 400 通常合并 1-3 段)。让单 chunk 语义焦点更精确,IDF / 余弦区分度都明显提升。
 *
 * 单段超过 400 字仍独占 chunk(原逻辑保留),长描述段落不会被截断。
 */
export const CHUNK_TARGET_CHARS = 400;
/**
 * Chunk 布局版本 — 章节专用,与 EmbeddingService.MODEL_VERSION 拼接成
 * `CHAPTER_MODEL_VERSION`,作为 chapter-embeddings 的 staleness 标识。
 *
 * 改 chunking 策略(目标字符数 / 切分规则)→ 必须 bump 此版本号,触发 backlog
 * 全量重嵌(同一向量空间,但 chunk 内容边界变了,旧记录的"哪段在哪 chunk"失效)。
 *
 * 与 MODEL_VERSION 分离的目的:memory 也用 MODEL_VERSION,但 memory 没有 chunking
 * 概念。chapter chunking 改动不应触发 memory 重嵌。
 */
const CHAPTER_CHUNK_LAYOUT_VERSION = 'cs400';
/**
 * 章节嵌入实际使用的版本号 = MODEL_VERSION + chunking version。
 * `writeChunksForChapter` 写入此值;`queryChapters` / `findChaptersNeedingEmbedding`
 * 比对此值判定 stale。
 */
export const CHAPTER_MODEL_VERSION = `${MODEL_VERSION}@${CHAPTER_CHUNK_LAYOUT_VERSION}`;

/**
 * 单一事实源 — 判定一条 chapter chunk 是否 stale(model 与当前 CHAPTER_MODEL_VERSION 不一致)。
 *
 * 集中写在这里,避免 `c.model === CHAPTER_MODEL_VERSION` 这种比对在 queryChapters /
 * findChaptersNeedingEmbedding / Panel 三处独立漂移。改 chunking 策略 → 只动
 * CHAPTER_MODEL_VERSION,所有调用方自动跟上。
 */
export function isChapterChunkStale(chunk: ChapterEmbedding): boolean {
  return chunk.model !== CHAPTER_MODEL_VERSION;
}
/** preview 前缀长度(给 query_chapter 返回用) */
export const PREVIEW_CHARS = 200;
/** title chunk 嵌入输入字符上限(标题 + 首段拼接后截断) */
export const TITLE_INPUT_MAX_CHARS = 300;
/** title chunk 永远只有一条,chunkIndex 固定为 0 */
export const TITLE_CHUNK_INDEX = 0;

// ===== 混合打分参数 =====
// 章节检索保留独立调优后的 0.65 / 0.35 权重；记忆检索已使用 0.7 / 0.3 RRF，
// 两条管线的候选粒度和查询用途不同，不再共享权重推导。
/** 章节级 semantic 在最终 total 中的权重 */
const CHAPTER_SEMANTIC_WEIGHT = 0.65;
/** 章节级 keyword 在最终 total 中的权重 */
const CHAPTER_KEYWORD_WEIGHT = 0.35;
/** Title 字面命中权重(强信号 — 章节真就叫这个名;加性公式里仍是 1.0 满权重) */
const TITLE_KW_WEIGHT = 1.0;
/** content_top_k_mean 取前 K 个 content chunk 的均值,K = min(CONTENT_TOP_K, 实际数量) */
const CONTENT_TOP_K = 3;
/**
 * Content 通道融合权重 — content_semantic = α × content_max + (1-α) × content_top_k_mean
 *
 * 为什么不用 max(content_max, content_top_k_mean)?
 *   同一章内 top_k_mean ≤ max,max 通道里 top_k_mean 永远不可能胜出 → "整章相关"
 *   信号被埋没。改用线性融合让 top_k_mean 有实际权重。
 *
 * α = 0.6 偏向 max,保留"单段强命中"的检索效果(用户反馈已生效的场景);
 * 0.4 给 top_k_mean,提升"整章中等命中"的章节排名。
 */
const CONTENT_MAX_BLEND_ALPHA = 0.6;
/**
 * 专名命中加权系数。query unit 出现在书的专名表(terminologies + characterSettings + aliases
 * 双语)里时,该 unit 的命中分乘以此系数(再 clamp 到 [0, 1])。让"夏洛特"、"莉莉花园"
 * 这类强信号词比"马车"、"森林"这类泛词权重更高。
 *
 * 2.0 是经验值:足够把"全是泛词"的命中和"含一两个专名"的命中分开,但不会把
 * 单个专名命中放大到完全压制其它信号(clamp [0,1] 兜底)。
 */
const PROPER_NOUN_BOOST = 2.0;
/**
 * Identifier(章节序号 / 卷号:阿拉伯数字、中文数字、圈号 ①-⑳、罗马数字 Ⅰ-Ⅹ)
 * 命中加权系数。比专名更强,因为 identifier 通常表示用户想精确命中某一章。
 *
 * 配合 IDENTIFIER_MISMATCH_PENALTY 使用:identifier 命中时大幅加分,反之大幅减分。
 */
const IDENTIFIER_BOOST = 3.0;
/**
 * 当 query 含 identifier 但候选章节标题(含卷标题)缺该 identifier 时,
 * 整章 total score 乘以此系数(强降权但不归零,留给"用户记错章号"等模糊场景兜底)。
 *
 * 0.3 经验值:足够让"83 星天 ⑥" 类 query 把"星天 ⑤"压到正确"星天 ⑥"之下,
 * 又不会硬过滤掉所有非完美匹配。
 */
const IDENTIFIER_MISMATCH_PENALTY = 0.3;
/** Title + content keyword 加性融合的 content 加成系数(round 2 改为加性 cap 1.0) */
const CONTENT_KW_ADDITIVE_WEIGHT = 0.4;
/**
 * IDF 加权下界 — 即便单元出现在每一章(idf=0),也保留 IDF_FLOOR 的最低权重
 * 而不是把命中分压到 0;同时 1.0 + (1 - IDF_FLOOR) × idf 让最稀有单元 (idf=1) 拿
 * 默认 2.0× boost(等同原 PROPER_NOUN_BOOST)。
 *
 * 实施在 [memory-scoring.ts] 内:`multiplier = 0.5 + 1.5 × idf`,即 IDF_FLOOR = 0.5。
 * 这里只放注释说明数值含义;memory-scoring 才是事实源。
 */
const IDF_FLOOR_FOR_DOC = 0.5;

/**
 * IDB 复合 key 工厂。集中在一处避免多处手写出错。
 * v11 后所有新写入都用复合 key;v10 旧 key 已在 upgrade 里 migrate。
 */
function chunkKey(
  chapterId: string,
  kind: ChapterEmbeddingKind,
  chunkIndex: number,
): string {
  return `${chapterId}:${kind}:${chunkIndex}`;
}

/**
 * 拼装 title chunk 的嵌入输入:`[章] ${标题}\n\n${首段}`,截断到 TITLE_INPUT_MAX_CHARS。
 *
 * - 跳过空白段落,从第一个非空段开始取
 * - 章节无非空段 → 返回 null(调用方 skip 这条 chunk)
 * - 标题为空/纯空白 → 只用首段(无 `[章]` 前缀)
 * - 截断在字符级别;嵌入模型对截断鲁棒,首段一般 < 300 字
 */
export function composeTitleChunkInput(
  chapterTitle: string,
  paragraphs: Paragraph[],
): string | null {
  const firstParagraph = paragraphs.find((p) => (p.text ?? '').trim().length > 0);
  if (!firstParagraph) return null;
  const firstText = (firstParagraph.text ?? '').trim();
  const title = (chapterTitle ?? '').trim();
  const composed = title ? `[章] ${title}\n\n${firstText}` : firstText;
  if (composed.length <= TITLE_INPUT_MAX_CHARS) return composed;
  return composed.slice(0, TITLE_INPUT_MAX_CHARS);
}

export interface ChapterChunkDraft {
  chunkIndex: number;
  text: string; // 用于 embed 的输入文本
  snippet: string; // 前 200 字,给 preview 用
}

export interface ChapterQueryMatch {
  chapter_id: string;
  title: string;
  score: number;
  preview: string;
}

/**
 * 把一个段落转成 "原文\n译文" 文本。
 * - 译文为空时只返回原文。
 * - 两端 trim 但保留段内空白。
 */
function paragraphToText(p: Paragraph): string {
  const original = (p.text ?? '').trim();
  const translation = getSelectedTranslation(p).trim();
  if (!original && !translation) return '';
  if (!translation) return original;
  if (!original) return translation;
  return `${original}\n${translation}`;
}

/**
 * 按段落边界累积字符数,目标 ~CHUNK_TARGET_CHARS 切块。
 * - 单段超过目标时独占一个 chunk(不切段)。
 * - 空段落被跳过(不贡献字符数、不进 chunk)。
 */
export function splitChapterIntoChunks(paragraphs: Paragraph[]): ChapterChunkDraft[] {
  const chunks: ChapterChunkDraft[] = [];
  let buffer: string[] = [];
  let bufferChars = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    const joined = buffer.join('\n\n').trim();
    if (!joined) {
      buffer = [];
      bufferChars = 0;
      return;
    }
    chunks.push({
      chunkIndex: chunks.length,
      text: joined,
      snippet: joined.slice(0, PREVIEW_CHARS),
    });
    buffer = [];
    bufferChars = 0;
  };

  for (const p of paragraphs) {
    const piece = paragraphToText(p);
    if (!piece) continue;

    // 单段超大时独占一块:先把 buffer 冲掉,再独立成块
    if (piece.length >= CHUNK_TARGET_CHARS && buffer.length === 0) {
      chunks.push({
        chunkIndex: chunks.length,
        text: piece,
        snippet: piece.slice(0, PREVIEW_CHARS),
      });
      continue;
    }

    // 当前段若会让 buffer 超过目标,先冲掉再放入
    if (bufferChars + piece.length >= CHUNK_TARGET_CHARS && buffer.length > 0) {
      flush();
    }
    buffer.push(piece);
    bufferChars += piece.length;
  }
  flush();
  return chunks;
}

/** queryChapters 内部聚合：按 chapterId 汇总 title / content 两路的归一化分与预览片段 */
interface ChapterAgg {
  chapterId: string;
  titleNorm: number;
  contentNorms: number[];
  contentSnippets: Array<{ score: number; snippet: string }>;
  titleSnippet: string;
}

/**
 * 按 memory-scoring 的 z-score 公式做全池归一化：stddev < SPREAD_FLOOR 时整批降级为 0。
 */
function computeNormalizedCosines(
  chunks: ChapterEmbedding[],
  queryVec: Float32Array | number[],
): number[] {
  const rawCosines = chunks.map((c) => cosineSimilarity(queryVec, c.vector));
  let mean = 0;
  let stddev = 0;
  if (rawCosines.length >= 2) {
    mean = rawCosines.reduce((a, b) => a + b, 0) / rawCosines.length;
    const variance =
      rawCosines.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / rawCosines.length;
    stddev = Math.sqrt(variance);
  }
  const semanticUsable = rawCosines.length >= 2 && stddev >= SPREAD_FLOOR;
  return rawCosines.map((raw) => {
    if (!semanticUsable) return 0;
    const z = (raw - mean) / stddev;
    const mapped = (z + Z_CLAMP) / (2 * Z_CLAMP);
    return Math.min(1, Math.max(0, mapped));
  });
}

/** 按 chapterId 聚合 chunks：title chunk 的归一化分走 titleNorm，其余进 content 两个数组 */
function aggregateChunksByChapter(
  chunks: ChapterEmbedding[],
  normalized: number[],
): Map<string, ChapterAgg> {
  const byChapter = new Map<string, ChapterAgg>();
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    const norm = normalized[i]!;
    let agg = byChapter.get(c.chapterId);
    if (!agg) {
      agg = {
        chapterId: c.chapterId,
        titleNorm: 0,
        contentNorms: [],
        contentSnippets: [],
        titleSnippet: '',
      };
      byChapter.set(c.chapterId, agg);
    }
    if (c.kind === 'title') {
      agg.titleNorm = Math.max(agg.titleNorm, norm);
      if (!agg.titleSnippet) agg.titleSnippet = c.textSnippet;
    } else {
      agg.contentNorms.push(norm);
      agg.contentSnippets.push({ score: norm, snippet: c.textSnippet });
    }
  }
  return byChapter;
}

/** 从 book.volumes 建章节 ID → 标题 / 卷标题的反向查找表 */
function buildChapterTitleLookups(book: Novel | null | undefined): {
  chapterTitleLookup: Map<string, string>;
  volumeTitleLookup: Map<string, string>;
} {
  const chapterTitleLookup = new Map<string, string>();
  const volumeTitleLookup = new Map<string, string>();
  if (!book?.volumes) return { chapterTitleLookup, volumeTitleLookup };
  for (const v of book.volumes) {
    const volumeTitle = typeof v.title === 'string' ? v.title : '';
    for (const ch of v.chapters || []) {
      const title = typeof ch.title === 'string' ? ch.title : ch.title?.original || '';
      chapterTitleLookup.set(ch.id, title);
      volumeTitleLookup.set(ch.id, volumeTitle);
    }
  }
  return { chapterTitleLookup, volumeTitleLookup };
}

/** content 通道：融合 max 与 top-K mean；semantic = max(title_norm, content_semantic) */
function computeChapterSemanticScore(agg: ChapterAgg): number {
  if (agg.contentNorms.length === 0) return agg.titleNorm;
  const contentMax = Math.max(...agg.contentNorms);
  const sortedDesc = [...agg.contentNorms].sort((a, b) => b - a);
  const k = Math.min(CONTENT_TOP_K, sortedDesc.length);
  const contentTopKMean = sortedDesc.slice(0, k).reduce((a, b) => a + b, 0) / k;
  const contentSemantic =
    CONTENT_MAX_BLEND_ALPHA * contentMax + (1 - CONTENT_MAX_BLEND_ALPHA) * contentTopKMean;
  return Math.max(agg.titleNorm, contentSemantic);
}

/**
 * keyword = min(1, title_kw + content_kw × 0.4)（加性 cap）。
 * 单独标题命中仍可达 1.0 上限，正文加成助推双命中章节。
 */
function computeChapterKeywordScore(
  agg: ChapterAgg,
  chapterTitle: string,
  volumeTitle: string,
  expandedQuery: string,
  properNouns: Set<string> | undefined,
  idfWeights: Map<string, number> | undefined,
): number {
  const titleKwInput = `${chapterTitle} ${volumeTitle}`.trim();
  const titleKw = titleKwInput
    ? kwOnText(expandedQuery, titleKwInput, '', properNouns, idfWeights)
    : 0;
  let contentKw = 0;
  for (const cs of agg.contentSnippets) {
    const score = kwOnText(expandedQuery, '', cs.snippet, properNouns, idfWeights);
    if (score > contentKw) contentKw = score;
  }
  return Math.min(1, titleKw * TITLE_KW_WEIGHT + contentKw * CONTENT_KW_ADDITIVE_WEIGHT);
}

/**
 * Identifier mismatch 惩罚：query 含 identifier 但候选标题缺任一 → total × PENALTY。
 */
function applyIdentifierPenalty(
  total: number,
  queryIdentifiers: string[],
  chapterTitle: string,
  volumeTitle: string,
): number {
  if (queryIdentifiers.length === 0) return total;
  const titleHay = `${chapterTitle} ${volumeTitle}`.toLowerCase();
  const allMatched = queryIdentifiers.every((id) => titleHay.includes(id));
  return allMatched ? total : total * IDENTIFIER_MISMATCH_PENALTY;
}

/** preview：最高得分的 content snippet；无 content chunk 时退回 title snippet */
function pickChapterPreview(agg: ChapterAgg): string {
  if (agg.contentSnippets.length === 0) return agg.titleSnippet;
  const best = [...agg.contentSnippets].sort((a, b) => b.score - a.score)[0]!;
  return best.snippet;
}

export class ChapterEmbeddingService {
  /** 读取单章的所有 chunk(按 chunkIndex 升序) */
  static async getChunksForChapter(chapterId: string): Promise<ChapterEmbedding[]> {
    if (!chapterId) return [];
    try {
      const db = await getDB();
      const tx = db.transaction('chapter-embeddings', 'readonly');
      const index = tx.store.index('by-chapterId');
      const rows = (await index.getAll(chapterId)) as ChapterEmbedding[];
      rows.sort((a, b) => a.chunkIndex - b.chunkIndex);
      return rows;
    } catch (error) {
      console.warn(`[ChapterEmbeddingService] getChunksForChapter(${chapterId}) 失败:`, error);
      return [];
    }
  }

  /** 读取整本书的所有 chunk */
  static async getChunksForBook(bookId: string): Promise<ChapterEmbedding[]> {
    if (!bookId) return [];
    try {
      const db = await getDB();
      const tx = db.transaction('chapter-embeddings', 'readonly');
      const index = tx.store.index('by-bookId');
      return (await index.getAll(bookId)) as ChapterEmbedding[];
    } catch (error) {
      console.warn(`[ChapterEmbeddingService] getChunksForBook(${bookId}) 失败:`, error);
      return [];
    }
  }

  /** 删除单章的全部 chunk */
  static async deleteChunksForChapter(chapterId: string): Promise<void> {
    if (!chapterId) return;
    try {
      const db = await getDB();
      const tx = db.transaction('chapter-embeddings', 'readwrite');
      const index = tx.store.index('by-chapterId');
      let cursor = await index.openCursor(chapterId);
      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }
      await tx.done;
    } catch (error) {
      console.warn(`[ChapterEmbeddingService] deleteChunksForChapter(${chapterId}) 失败:`, error);
    }
  }

  /**
   * 原子替换单章的 chunk 集合。先按 kind 清除旧 chunk,再写入新 chunk。
   * 使用同一事务保证原子性。
   *
   * - `chunks` 必须包含 `kind`(`'content' | 'title'`)
   * - 同一事务内只清除"本次写入涉及的 kind"对应的旧 chunk —— 这样如果调用方只补 title,
   *   不会误删 content;反之亦然。整章重嵌(传入 content + title)时两边都会被刷新。
   */
  static async writeChunksForChapter(
    chapterId: string,
    bookId: string,
    chunks: Array<{
      kind: ChapterEmbeddingKind;
      chunkIndex: number;
      vector: number[];
      textSnippet: string;
    }>,
  ): Promise<void> {
    if (!chapterId) return;
    if (chunks.length === 0) return;

    const kindsToReplace = new Set<ChapterEmbeddingKind>(chunks.map((c) => c.kind));

    try {
      const db = await getDB();
      const tx = db.transaction('chapter-embeddings', 'readwrite');
      const store = tx.store;
      const index = store.index('by-chapterId');

      // 先清除本次要写入的 kind 对应的旧记录
      let cursor = await index.openCursor(chapterId);
      while (cursor) {
        const record = cursor.value as ChapterEmbedding;
        if (kindsToReplace.has(record.kind)) {
          await cursor.delete();
        }
        cursor = await cursor.continue();
      }

      // 写入新 chunk
      const now = Date.now();
      for (const chunk of chunks) {
        const record: ChapterEmbedding = {
          chapterId,
          bookId,
          kind: chunk.kind,
          chunkIndex: chunk.chunkIndex,
          vector: chunk.vector,
          textSnippet: chunk.textSnippet,
          model: CHAPTER_MODEL_VERSION,
          updatedAt: now,
        };
        await store.put(record, chunkKey(chapterId, chunk.kind, chunk.chunkIndex));
      }

      await tx.done;
    } catch (error) {
      console.error(`[ChapterEmbeddingService] writeChunksForChapter(${chapterId}) 失败:`, error);
      throw error;
    }
  }

  /**
   * 计算并持久化单章的所有 chunk embedding。
   * - 章节不存在 / 段落为空:清空该章 chunk(可能之前存在)
   * - EmbeddingService 未就绪:抛错,由调用方(EmbeddingQueue)决定重试
   */
  static async embedChapter(chapterId: string): Promise<void> {
    if (!chapterId) return;

    // 定位 book 与 chapter title(直接扫 IndexedDB books,
    // 避免 import stores/books 形成循环依赖)
    const lookup = await lookupChapterBookFromDB(chapterId);
    if (!lookup) {
      // 章节已不存在(可能已被删除),顺便清一下残留
      await this.deleteChunksForChapter(chapterId);
      return;
    }
    const { bookId, chapterTitle } = lookup;

    const paragraphs = await loadChapterContent(chapterId);
    if (!paragraphs || paragraphs.length === 0) {
      await this.deleteChunksForChapter(chapterId);
      return;
    }

    const contentDrafts = splitChapterIntoChunks(paragraphs);
    const titleInput = composeTitleChunkInput(chapterTitle, paragraphs);

    if (contentDrafts.length === 0 && !titleInput) {
      // 章节非空但每段都是空白 → 没东西能嵌入,清残留
      await this.deleteChunksForChapter(chapterId);
      return;
    }

    if (!EmbeddingService.isReady()) {
      throw new Error('EmbeddingService 未就绪');
    }

    // 把 title input 拼到 batch 末尾,一次 embedBatch 调用共用模型 warmup
    const batchInputs: string[] = [
      ...contentDrafts.map((c) => c.text),
      ...(titleInput ? [titleInput] : []),
    ];
    const vectors = await EmbeddingService.embedBatch(batchInputs, 'document');

    const chunks: Array<{
      kind: ChapterEmbeddingKind;
      chunkIndex: number;
      vector: number[];
      textSnippet: string;
    }> = [];

    for (let i = 0; i < contentDrafts.length; i++) {
      const draft = contentDrafts[i]!;
      const vec = vectors[i];
      if (!vec) continue; // 跳过失败的 chunk,其它仍写入
      chunks.push({
        kind: 'content',
        chunkIndex: draft.chunkIndex,
        vector: Array.from(vec),
        textSnippet: draft.snippet,
      });
    }

    if (titleInput) {
      const titleVec = vectors[contentDrafts.length];
      if (titleVec) {
        chunks.push({
          kind: 'title',
          chunkIndex: TITLE_CHUNK_INDEX,
          vector: Array.from(titleVec),
          textSnippet: titleInput.slice(0, PREVIEW_CHARS),
        });
      }
    }

    if (chunks.length === 0) {
      // 全部失败,不改动已有 chunk(避免误删)
      throw new Error(`章节 ${chapterId} 的所有 chunk 嵌入失败`);
    }

    await this.writeChunksForChapter(chapterId, bookId, chunks);
  }

  /**
   * 混合检索整本书的章节。
   *
   * 流程(对应 design.md D3-D6):
   * 1. query 做 embed,与全书 chunk(content + title)算 raw cosine
   * 2. 全池 z-score 归一化到 [0, 1];整批 stddev < SPREAD_FLOOR 时降级(normalized=0)
   * 3. 按 chapterId 聚合:semantic = max(title_norm, content_max, content_top3_mean)
   * 4. 关键词通道:title_kw 扫 [章节标题 + 卷标题],content_kw 扫各 content chunk snippet
   *    keyword = max(title_kw × 1.0, content_kw × 0.6)
   * 5. total = 0.65 × semantic + 0.35 × keyword,排序取 top limit
   *
   * EmbeddingService 未就绪时抛错,由调用方(工具 handler)处理结构化错误。
   */
  static async queryChapters(
    bookId: string,
    query: string,
    limit = 5,
  ): Promise<ChapterQueryMatch[]> {
    if (!bookId) throw new Error('bookId 不能为空');
    if (!query || !query.trim()) throw new Error('query 不能为空');
    if (!EmbeddingService.isReady()) {
      throw new Error('EmbeddingService 未就绪');
    }

    const queryVec = await EmbeddingService.embed(query, 'query');
    if (!queryVec) throw new Error('query embedding 计算失败');

    const allChunks = await this.getChunksForBook(bookId);
    if (allChunks.length === 0) return [];

    // 过滤 stale chunk(embedding 空间不一致 → 余弦无意义)
    const chunks = allChunks.filter((c) => !isChapterChunkStale(c));
    if (chunks.length === 0) {
      throw new Error(
        '章节向量空间已升级,正在后台重算。请稍后重试,或在设置中查看重建进度。',
      );
    }

    // ===== Pass 1:全池 raw cosine + z-score 归一化 =====
    const normalized = computeNormalizedCosines(chunks, queryVec);

    // ===== Pass 2:按 chapterId 聚合 — 拆 title / content 两路 =====
    const byChapter = aggregateChunksByChapter(chunks, normalized);

    // ===== 标题 / 卷标题 + 别名 / Identifier / IDF =====
    // 直接从 IndexedDB 加载 book 元数据,避免 import stores/books 形成循环依赖
    const book = await loadBookMetaFromDB(bookId);
    const { chapterTitleLookup, volumeTitleLookup } = buildChapterTitleLookups(book);
    const aliasIndex = buildBookAliasIndex(book);
    const expandedQuery = expandQueryWithAliases(query, aliasIndex);
    const properNouns = aliasIndex.properNouns.size > 0 ? aliasIndex.properNouns : undefined;
    // 用原 query 抽 identifier,避免别名扩展污染
    const queryIdentifiers = extractIdentifiersFromQuery(query);
    // 用扩展后的 query 抽 IDF unit,让同义词拿到正确权重
    const idfWeights = computeQueryUnitIdf(expandedQuery, chunks);
    const idfWeightsToPass = idfWeights.size > 0 ? idfWeights : undefined;

    // ===== Pass 3:每章打分 =====
    const results: ChapterQueryMatch[] = [];
    for (const agg of byChapter.values()) {
      const chapterTitle = chapterTitleLookup.get(agg.chapterId) ?? '';
      const volumeTitle = volumeTitleLookup.get(agg.chapterId) ?? '';
      const semantic = computeChapterSemanticScore(agg);
      const keyword = computeChapterKeywordScore(
        agg,
        chapterTitle,
        volumeTitle,
        expandedQuery,
        properNouns,
        idfWeightsToPass,
      );
      const total = applyIdentifierPenalty(
        CHAPTER_SEMANTIC_WEIGHT * semantic + CHAPTER_KEYWORD_WEIGHT * keyword,
        queryIdentifiers,
        chapterTitle,
        volumeTitle,
      );
      results.push({
        chapter_id: agg.chapterId,
        title: chapterTitle,
        score: total,
        preview: pickChapterPreview(agg),
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, Math.max(1, limit));
  }

  /**
   * 扫描整本书,返回需要嵌入或重新嵌入的章节 ID 列表。
   *
   * 三类触发条件:
   * 1. 章节无任何 chunk → 待嵌入
   * 2. 章节有 chunk 但任一 chunk 的 model 与当前 CHAPTER_MODEL_VERSION 不一致 → 需重算
   * 3. 章节当前 model 的 content chunks 齐全但**无 title chunk**,且能生成 title chunk
   *    (段落非全空) → 待补 title(走 embedChapter 全章重嵌路径)
   *
   * 不触发 embed,仅供 EmbeddingQueue 的 backlog 扫描使用。
   *
   * 段落全空 / 章节内容尚未加载 → 不可能生成 title chunk,**不**重复入队避免无限重试。
   */
  static async findChaptersNeedingEmbedding(bookId: string): Promise<string[]> {
    if (!bookId) return [];
    // 直接从 IndexedDB 加载 book 元数据,避免 import stores/books 形成循环依赖
    const book = await loadBookMetaFromDB(bookId);
    if (!book?.volumes) return [];

    const allChapterIds: string[] = [];
    for (const v of book.volumes) {
      for (const ch of v.chapters || []) {
        allChapterIds.push(ch.id);
      }
    }
    if (allChapterIds.length === 0) return [];

    // 一次性拉全书 chunk,按 chapterId 分组判断
    const chunks = await this.getChunksForBook(bookId);
    const byChapter = new Map<string, ChapterEmbedding[]>();
    for (const c of chunks) {
      const arr = byChapter.get(c.chapterId) ?? [];
      arr.push(c);
      byChapter.set(c.chapterId, arr);
    }

    const needsEmbed: string[] = [];
    for (const chId of allChapterIds) {
      const arr = byChapter.get(chId);

      // 条件 1:章节无 chunk
      if (!arr || arr.length === 0) {
        needsEmbed.push(chId);
        continue;
      }

      // 条件 2:任一 chunk model 过期
      const anyStale = arr.some(isChapterChunkStale);
      if (anyStale) {
        needsEmbed.push(chId);
        continue;
      }

      // 条件 3:无 title chunk 且段落非全空(可生成 title chunk)
      const hasTitle = arr.some((c) => c.kind === 'title');
      if (!hasTitle) {
        const paragraphs = (await loadChapterContent(chId)) ?? [];
        const canMakeTitle = paragraphs.some((p) => (p.text ?? '').trim().length > 0);
        if (canMakeTitle) {
          needsEmbed.push(chId);
        }
        // 段落全空 → 不入队,避免无限重试(下次内容补完会通过 dirty 触发重嵌)
      }
    }
    return needsEmbed;
  }
}
