/**
 * 章节级多向量嵌入记录
 *
 * - 存储在独立 IndexedDB store `chapter-embeddings`(本地资源,Gist 同步时 strip)
 * - 每章切分为多个 chunk,每个 chunk 一条记录
 * - 向量维度固定为 256(与 EmbeddingService 对齐,Matryoshka 截取)
 */
export interface ChapterEmbedding {
  /** 章节 ID */
  chapterId: string;
  /** 书籍 ID(用于 by-bookId 索引批量查询) */
  bookId: string;
  /** 该章节内 chunk 的顺序索引(0-based) */
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
