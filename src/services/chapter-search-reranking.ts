import { EmbeddingService } from './embedding-service';
import { calculateSemanticConfidenceScores, SEMANTIC_CONFIDENCE_FULL } from './memory-scoring';
import { cosineSimilarity } from 'src/utils/cosine-similarity';

interface RerankCandidate {
  chapterId: string;
  semanticRaw: number;
  titleSemantic: number;
  sourceTexts: string[];
}

const MAX_CANDIDATES = 24;
const MAX_PARAGRAPHS_PER_CHAPTER = 8;
const MAX_PARAGRAPH_CHARS = 300;
const MIN_COARSE_CONFIDENCE = 0.2;
const BATCH_SIZE = 8;

/** 引号变体和重复引用只作为一份证据，避免同一句话占据最高的两个段落分。 */
function paragraphKey(text: string): string {
  return text
    .replace(/[「」『』“”‘’"']/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function focusedParagraphs(sourceTexts: string[]): Map<string, string> {
  const paragraphs = new Map<string, string>();
  for (const source of sourceTexts) {
    for (const value of source.split(/\n{2,}/)) {
      const text = value.trim();
      if (text.length > MAX_PARAGRAPH_CHARS || (text.match(/[\p{L}\p{N}]/gu)?.length ?? 0) < 4)
        continue;
      const key = paragraphKey(text);
      if (!paragraphs.has(key)) paragraphs.set(key, text);
      if (paragraphs.size === MAX_PARAGRAPHS_PER_CHAPTER) return paragraphs;
    }
  }
  return paragraphs;
}

/**
 * 对已有整块语义证据的候选做本地段落重排。无关查询和缺少细粒度内容的缓存直接走原排名。
 * 最多 24 章 × 8 段，每批最多 8 条；整块和两个独立段落各占一半，保留标题语义锚点。
 */
export async function rerankChapterParagraphs(
  candidates: RerankCandidate[],
  queryVector: Float32Array,
  calibration?: { floor: number; full: number },
): Promise<{ scores: Map<string, number>; queriedParagraphs: boolean }> {
  const confidences = calculateSemanticConfidenceScores(
    candidates.map((candidate) => candidate.semanticRaw),
    calibration,
  );
  // 明确场景已经有高置信度命中时保留整块上下文，避免拆开人物、地点和动作后反而丢失共现证据。
  if (
    candidates.some(
      (candidate) => candidate.semanticRaw >= (calibration?.full ?? SEMANTIC_CONFIDENCE_FULL),
    )
  )
    return { scores: new Map(), queriedParagraphs: false };
  // 先判断整批是否有语义证据；召回阶段保留较弱候选，最终质量门槛放在段落重排之后。
  if (!confidences.some((confidence) => confidence >= MIN_COARSE_CONFIDENCE))
    return { scores: new Map(), queriedParagraphs: false };
  const shortlist = candidates
    .filter(
      (candidate, index) =>
        (confidences[index] ?? 0) > 0 && candidate.semanticRaw > candidate.titleSemantic,
    )
    .sort((a, b) => b.semanticRaw - a.semanticRaw)
    .slice(0, MAX_CANDIDATES)
    .map((candidate) => ({ candidate, paragraphs: focusedParagraphs(candidate.sourceTexts) }))
    .filter(({ paragraphs }) => paragraphs.size >= 2);
  const inputs = new Map<string, string>();
  for (const { paragraphs } of shortlist) {
    for (const [key, text] of paragraphs) {
      if (!inputs.has(key)) inputs.set(key, text);
    }
  }
  const entries = [...inputs];
  const paragraphScores = new Map<string, number>();
  for (let offset = 0; offset < entries.length; offset += BATCH_SIZE) {
    const batch = entries.slice(offset, offset + BATCH_SIZE);
    // 输入按文档处理，调度与缓存按前台查询处理，避免后台回填阻塞用户搜索。
    const vectors = await EmbeddingService.embedBatch(
      batch.map(([, text]) => text),
      'document',
      'query',
    );
    batch.forEach(([key], index) => {
      const vector = vectors[index];
      if (vector) paragraphScores.set(key, cosineSimilarity(queryVector, vector));
    });
  }
  const refined = new Map<string, number>();
  for (const { candidate, paragraphs } of shortlist) {
    const scores = [...paragraphs.keys()]
      .flatMap((key) => (paragraphScores.has(key) ? [paragraphScores.get(key)!] : []))
      .sort((a, b) => b - a);
    if (scores.length < 2) continue;
    const focused = (scores[0]! + scores[1]!) / 2;
    refined.set(
      candidate.chapterId,
      Math.max(candidate.titleSemantic, (candidate.semanticRaw + focused) / 2),
    );
  }
  return { scores: refined, queriedParagraphs: entries.length > 0 };
}
