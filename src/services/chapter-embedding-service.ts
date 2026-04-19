/**
 * ChapterEmbeddingService — 章节级多向量嵌入
 *
 * 职责:
 * - 切 chunk(按段落边界,目标 ~1500 字符)
 * - 拼接原文+译文作为嵌入输入
 * - 调 EmbeddingService.embedBatch 生成向量
 * - 原子替换 chapter-embeddings store 中该章节的所有 chunk
 * - 提供 queryChapters 做语义检索:对 query 做 embed,与所有 chunk 算余弦,按章节聚合取 max
 *
 * 存储布局:
 * - store: `chapter-embeddings`
 * - key: `${chapterId}:${chunkIndex}`
 * - indexes: `by-chapterId` / `by-bookId`
 *
 * 同步:
 * - 不参与 Gist 上传;新设备通过 EmbeddingQueue 的 backlog 扫描本地重算
 */

import { getDB } from 'src/utils/indexed-db';
import { getSelectedTranslation } from 'src/utils/text-utils';
import { cosineSimilarity } from 'src/utils/cosine-similarity';
import type { Paragraph } from 'src/models/novel';
import type { ChapterEmbedding } from 'src/models/chapter-embedding';
import { EmbeddingService, MODEL_VERSION } from 'src/services/embedding-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { useBooksStore } from 'src/stores/books';

/** 目标 chunk 字符数(不会破坏段落) */
export const CHUNK_TARGET_CHARS = 1500;
/** preview 前缀长度(给 query_chapter 返回用) */
export const PREVIEW_CHARS = 200;

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
   * 原子替换单章的 chunk 集合。先删除旧 chunk,再写入新 chunk。
   * 使用同一事务保证原子性。
   */
  static async writeChunksForChapter(
    chapterId: string,
    bookId: string,
    chunks: Array<{ chunkIndex: number; vector: number[]; textSnippet: string }>,
  ): Promise<void> {
    if (!chapterId) return;
    try {
      const db = await getDB();
      const tx = db.transaction('chapter-embeddings', 'readwrite');
      const store = tx.store;
      const index = store.index('by-chapterId');

      // 先清除旧 chunk
      let cursor = await index.openCursor(chapterId);
      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }

      // 写入新 chunk
      const now = Date.now();
      for (const chunk of chunks) {
        const record: ChapterEmbedding = {
          chapterId,
          bookId,
          chunkIndex: chunk.chunkIndex,
          vector: chunk.vector,
          textSnippet: chunk.textSnippet,
          model: MODEL_VERSION,
          updatedAt: now,
        };
        await store.put(record, `${chapterId}:${chunk.chunkIndex}`);
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

    // 定位 book 与 chapter title(标题不是嵌入输入但用于日志)
    const booksStore = useBooksStore();
    let bookId: string | undefined;
    for (const book of booksStore.books) {
      for (const volume of book.volumes || []) {
        const found = volume.chapters?.find((c) => c.id === chapterId);
        if (found) {
          bookId = book.id;
          break;
        }
      }
      if (bookId) break;
    }

    if (!bookId) {
      // 章节已不存在(可能已被删除),顺便清一下残留
      await this.deleteChunksForChapter(chapterId);
      return;
    }

    const paragraphs = await ChapterContentService.loadChapterContent(chapterId);
    if (!paragraphs || paragraphs.length === 0) {
      await this.deleteChunksForChapter(chapterId);
      return;
    }

    const chunkDrafts = splitChapterIntoChunks(paragraphs);
    if (chunkDrafts.length === 0) {
      await this.deleteChunksForChapter(chapterId);
      return;
    }

    if (!EmbeddingService.isReady()) {
      throw new Error('EmbeddingService 未就绪');
    }

    const vectors = await EmbeddingService.embedBatch(
      chunkDrafts.map((c) => c.text),
      'document',
    );

    const chunks: Array<{ chunkIndex: number; vector: number[]; textSnippet: string }> = [];
    for (let i = 0; i < chunkDrafts.length; i++) {
      const draft = chunkDrafts[i]!;
      const vec = vectors[i];
      if (!vec) continue; // 跳过失败的 chunk,但其他 chunk 仍写入
      chunks.push({
        chunkIndex: draft.chunkIndex,
        vector: Array.from(vec),
        textSnippet: draft.snippet,
      });
    }

    if (chunks.length === 0) {
      // 全部失败,不改动已有 chunk(避免误删)
      throw new Error(`章节 ${chapterId} 的所有 chunk 嵌入失败`);
    }

    await this.writeChunksForChapter(chapterId, bookId, chunks);
  }

  /**
   * 语义查询整本书的章节。
   * - 对 query 做 embed
   * - 与所有 chunk 算余弦相似度
   * - 按 chapterId 取 max 作为章节分数
   * - 排序取 top limit,返回 `{ chapter_id, title, score, preview }`
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

    // 过滤掉 embedding 空间不匹配的 stale chunk — 否则旧向量和当前 query 向量
    // 做余弦相似度会退化成噪声,排序结果比纯关键词还差。
    const chunks = allChunks.filter((c) => c.model === MODEL_VERSION);
    if (chunks.length === 0) {
      throw new Error(
        '章节向量空间已升级,正在后台重算。请稍后重试,或在设置中查看重建进度。',
      );
    }

    // 按 chapterId 聚合 max
    type Agg = { chapterId: string; score: number; preview: string };
    const byChapter = new Map<string, Agg>();
    for (const c of chunks) {
      const score = cosineSimilarity(queryVec, c.vector);
      const existing = byChapter.get(c.chapterId);
      if (!existing || score > existing.score) {
        byChapter.set(c.chapterId, {
          chapterId: c.chapterId,
          score,
          preview: c.textSnippet,
        });
      }
    }

    // 解析标题(从 books store)
    const booksStore = useBooksStore();
    const book = booksStore.getBookById(bookId);
    const titleLookup = new Map<string, string>();
    if (book?.volumes) {
      for (const v of book.volumes) {
        for (const ch of v.chapters || []) {
          const title = typeof ch.title === 'string' ? ch.title : ch.title?.original || '';
          titleLookup.set(ch.id, title);
        }
      }
    }

    const results: ChapterQueryMatch[] = [];
    for (const agg of byChapter.values()) {
      results.push({
        chapter_id: agg.chapterId,
        title: titleLookup.get(agg.chapterId) ?? '',
        score: agg.score,
        preview: agg.preview,
      });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, Math.max(1, limit));
  }

  /**
   * 扫描整本书,返回需要嵌入或重新嵌入的章节 ID 列表。
   * - 章节无任何 chunk → 待嵌入
   * - 章节存在 chunk 但 model 与当前 MODEL_VERSION 不一致 → 需重算
   *
   * 不触发 embed,仅供 EmbeddingQueue 的 backlog 扫描使用。
   */
  static async findChaptersNeedingEmbedding(bookId: string): Promise<string[]> {
    if (!bookId) return [];
    const booksStore = useBooksStore();
    const book = booksStore.getBookById(bookId);
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
      if (!arr || arr.length === 0) {
        needsEmbed.push(chId);
        continue;
      }
      const anyStale = arr.some((c) => c.model !== MODEL_VERSION);
      if (anyStale) needsEmbed.push(chId);
    }
    return needsEmbed;
  }
}
