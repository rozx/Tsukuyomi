/**
 * findChaptersNeedingEmbedding — 章节缺 title chunk 的检测。
 *
 * 覆盖场景:
 * - 章节有当前 model 的 content chunks 但无 title chunk + 段落非全空 → 待重嵌
 * - 章节段落全空(永远无法生成 title chunk) → 不入队,避免无限重试
 * - 章节有完整 title + content + 当前 model → 不入队
 * - 章节无任何 chunk → 入队(原有条件 1)
 * - 章节有 stale chunk → 入队(原有条件 2)
 */
import './setup';
import { describe, expect, it, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import {
  ChapterEmbeddingService,
  TITLE_CHUNK_INDEX,
} from 'src/services/chapter-embedding-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { useBooksStore } from 'src/stores/books';
import type { Novel, Paragraph } from 'src/models/novel';

function mkPara(id: string, text: string): Paragraph {
  return {
    id,
    text,
    translations: [],
    selectedTranslationId: null,
  } as unknown as Paragraph;
}

async function seedBook(bookId: string, chapterIds: string[]): Promise<void> {
  const book = {
    id: bookId,
    title: 'Test',
    volumes: [
      {
        id: 'v',
        title: 'V',
        chapters: chapterIds.map((id) => ({
          id,
          title: `Title-${id}`,
          paragraphs: [],
          createdAt: new Date(),
          lastEdited: new Date(),
        })),
      },
    ],
  } as unknown as Novel;
  const store = useBooksStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (store as any).books = [book];
  // 同时写入 IndexedDB,供 lookupChapterBookFromDB / loadBookMetaFromDB 使用
  // 跨文件运行时 fake-indexeddb 的 reset 可能有时序残留,显式清一次 books
  const { getDB } = await import('src/utils/indexed-db');
  const db = await getDB();
  const clearTx = db.transaction('books', 'readwrite');
  await clearTx.store.clear();
  await clearTx.done;
  await db.put('books', book);
}

async function clearChapterEmbeddingsStore(): Promise<void> {
  const { getDB } = await import('src/utils/indexed-db');
  const db = await getDB();
  const tx = db.transaction('chapter-embeddings', 'readwrite');
  await tx.store.clear();
  await tx.done;
}

describe('ChapterEmbeddingService.findChaptersNeedingEmbedding — title chunk 缺失检测', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    await clearChapterEmbeddingsStore();
  });

  afterEach(async () => {
    mock.restore();
    await clearChapterEmbeddingsStore();
  });

  it('章节有当前 content chunks 但缺 title chunk + 段落非空 → 入队', async () => {
    const bookId = 'b';
    await seedBook(bookId, ['ch-A']);

    // 写当前 model 的 content chunk,不写 title
    await ChapterEmbeddingService.writeChunksForChapter('ch-A', bookId, [
      { kind: 'content', chunkIndex: 0, vector: [0.1], textSnippet: 's' },
    ]);

    spyOn(ChapterContentService, 'loadChapterContent').mockResolvedValue([
      mkPara('p1', '有内容'),
    ]);

    const ids = await ChapterEmbeddingService.findChaptersNeedingEmbedding(bookId);
    expect(ids).toEqual(['ch-A']);
  });

  it('章节段落全空(无法生成 title) → 不入队,避免无限重试', async () => {
    const bookId = 'b';
    await seedBook(bookId, ['ch-A']);

    await ChapterEmbeddingService.writeChunksForChapter('ch-A', bookId, [
      { kind: 'content', chunkIndex: 0, vector: [0.1], textSnippet: 's' },
    ]);

    spyOn(ChapterContentService, 'loadChapterContent').mockResolvedValue([
      mkPara('p1', ''),
      mkPara('p2', '   '),
    ]);

    const ids = await ChapterEmbeddingService.findChaptersNeedingEmbedding(bookId);
    expect(ids).toEqual([]);
  });

  it('章节段落未加载(loadChapterContent 返回空) → 不入队', async () => {
    const bookId = 'b';
    await seedBook(bookId, ['ch-A']);

    await ChapterEmbeddingService.writeChunksForChapter('ch-A', bookId, [
      { kind: 'content', chunkIndex: 0, vector: [0.1], textSnippet: 's' },
    ]);

    spyOn(ChapterContentService, 'loadChapterContent').mockResolvedValue([]);

    const ids = await ChapterEmbeddingService.findChaptersNeedingEmbedding(bookId);
    expect(ids).toEqual([]);
  });

  it('章节同时有当前 content 和 title chunk → 不入队', async () => {
    const bookId = 'b';
    await seedBook(bookId, ['ch-A']);

    await ChapterEmbeddingService.writeChunksForChapter('ch-A', bookId, [
      { kind: 'content', chunkIndex: 0, vector: [0.1], textSnippet: 's' },
    ]);
    await ChapterEmbeddingService.writeChunksForChapter('ch-A', bookId, [
      { kind: 'title', chunkIndex: TITLE_CHUNK_INDEX, vector: [0.2], textSnippet: 't' },
    ]);

    const loadSpy = spyOn(ChapterContentService, 'loadChapterContent');

    const ids = await ChapterEmbeddingService.findChaptersNeedingEmbedding(bookId);
    expect(ids).toEqual([]);
    // 不应该触发昂贵的段落加载
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('原有条件 1:章节无任何 chunk → 入队', async () => {
    const bookId = 'b';
    await seedBook(bookId, ['ch-A', 'ch-B']);

    // 只给 ch-A 写 chunk
    await ChapterEmbeddingService.writeChunksForChapter('ch-A', bookId, [
      { kind: 'content', chunkIndex: 0, vector: [0.1], textSnippet: 's' },
      { kind: 'title', chunkIndex: TITLE_CHUNK_INDEX, vector: [0.2], textSnippet: 't' },
    ]);

    const ids = await ChapterEmbeddingService.findChaptersNeedingEmbedding(bookId);
    expect(ids).toContain('ch-B');
    expect(ids).not.toContain('ch-A');
  });

  it('原有条件 2:任一 chunk model 过期 → 入队(无论 kind)', async () => {
    const bookId = 'b';
    await seedBook(bookId, ['ch-A']);

    // 直接绕过 writeChunksForChapter 写一条 stale 记录
    const { getDB } = await import('src/utils/indexed-db');
    const db = await getDB();
    await db.put(
      'chapter-embeddings',
      {
        chapterId: 'ch-A',
        bookId,
        kind: 'content',
        chunkIndex: 0,
        vector: [0.1],
        textSnippet: 's',
        model: 'STALE_MODEL',
        updatedAt: 1,
      },
      'ch-A:content:0',
    );

    const ids = await ChapterEmbeddingService.findChaptersNeedingEmbedding(bookId);
    expect(ids).toEqual(['ch-A']);
  });
});
