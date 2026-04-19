/**
 * 章节级多向量嵌入记录
 *
 * - 存储在独立 IndexedDB store `chapter-embeddings`(本地资源,Gist 同步时 strip)
 * - 每章按 `kind` 分两类 chunk:
 *   · `'content'` — 原文+译文按段落边界切的 ~1500 字符 chunk(可 0..N 条)
 *   · `'title'`   — 由「[章] ${标题}\n\n${首段}」组成、截断到 300 字的语义 chunk(0 或 1 条)
 * - 向量维度固定为 256(与 EmbeddingService 对齐,Matryoshka 截取)
 * - Key 格式:`${chapterId}:${kind}:${chunkIndex}` —— title chunk 永远是 `${chapterId}:title:0`
 */
export type ChapterEmbeddingKind = 'content' | 'title';

export interface ChapterEmbedding {
  /** 章节 ID */
  chapterId: string;
  /** 书籍 ID(用于 by-bookId 索引批量查询) */
  bookId: string;
  /**
   * Chunk 类别。`'title'` 用于章节标题+首段的整体语义 chunk;`'content'` 用于正文段落聚合 chunk。
   * 区分目的:查询时分别参与不同的打分通道(标题/内容),且 backlog 扫描可识别"缺 title chunk"。
   */
  kind: ChapterEmbeddingKind;
  /** 该 kind 内 chunk 的顺序索引(0-based;title chunk 永远为 0) */
  chunkIndex: number;
  /** 256 维归一化向量 */
  vector: number[];
  /** 该 chunk 的前 200 字符,作为 query_chapter 返回的 preview */
  textSnippet: string;
  /** 嵌入模型版本(对齐 EmbeddingService.MODEL_VERSION) */
  model: string;
  /** 更新时间戳(ms) */
  updatedAt: number;
}
