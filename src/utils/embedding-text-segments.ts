export const LOCAL_EMBEDDING_SEGMENT_TARGET_CHARS = 1200;
export const LOCAL_EMBEDDING_MAX_SEGMENTS = 12;

interface SplitEmbeddingTextOptions {
  targetChars?: number;
  maxSegments?: number;
}

/**
 * 按段落和句末标点把长文本切成适合本地嵌入模型的短段。
 * 超过数量上限时均匀采样，确保文本开头、结尾和中间位置都有代表。
 */
export function splitTextForEmbedding(
  text: string,
  options: SplitEmbeddingTextOptions = {},
): string[] {
  const targetChars = Math.max(1, options.targetChars ?? LOCAL_EMBEDDING_SEGMENT_TARGET_CHARS);
  const maxSegments = Math.max(1, options.maxSegments ?? LOCAL_EMBEDDING_MAX_SEGMENTS);
  const paragraphs = text
    .split(/\r?\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const pieces: string[] = [];

  for (const paragraph of paragraphs) {
    let remaining = paragraph;
    while (remaining.length > targetChars) {
      const window = remaining.slice(0, targetChars);
      const punctuationOffsets = ['。', '！', '？', '!', '?', '；', ';'].map(
        (punctuation) => window.lastIndexOf(punctuation) + 1,
      );
      const punctuationBoundary = Math.max(...punctuationOffsets);
      const splitAt = punctuationBoundary >= targetChars / 2 ? punctuationBoundary : targetChars;
      const piece = remaining.slice(0, splitAt).trim();
      if (piece) pieces.push(piece);
      remaining = remaining.slice(splitAt).trim();
    }
    if (remaining) pieces.push(remaining);
  }

  const segments: string[] = [];
  let buffer = '';
  for (const piece of pieces) {
    const candidate = buffer ? `${buffer}\n${piece}` : piece;
    if (candidate.length > targetChars && buffer) {
      segments.push(buffer);
      buffer = piece;
    } else {
      buffer = candidate;
    }
  }
  if (buffer) segments.push(buffer);

  if (segments.length <= maxSegments) return segments;
  if (maxSegments === 1) return [segments[0]!];
  return Array.from({ length: maxSegments }, (_, index) => {
    const sourceIndex = Math.round((index * (segments.length - 1)) / (maxSegments - 1));
    return segments[sourceIndex]!;
  });
}
