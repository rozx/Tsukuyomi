/**
 * 余弦相似度(结果 clamp 到 [0, 1])。
 * 任一向量为空或维度不匹配时返回 0。
 */
export function cosineSimilarity(
  a: Float32Array | number[] | null | undefined,
  b: Float32Array | number[] | null | undefined,
): number {
  if (!a || !b) return 0;
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  if (Number.isNaN(sim)) return 0;
  return Math.min(1, Math.max(0, sim));
}
