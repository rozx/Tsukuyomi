/**
 * 章节混合检索打分测试 — 验证 queryChapters 的多路融合公式:
 *   semantic = max(title_norm, content_max, content_top3_mean)
 *   keyword  = max(title_kw × 1.0, content_kw × 0.6)
 *   total    = 0.65 × semantic + 0.35 × keyword
 *
 * 用 fake vectors 控制 cosine 相似度,观察哪一路通道决定排序。
 */
import './setup';
import { describe, expect, it, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import {
  ChapterEmbeddingService,
  TITLE_CHUNK_INDEX,
} from 'src/services/chapter-embedding-service';
import { EmbeddingService } from 'src/services/embedding-service';
import { useBooksStore } from 'src/stores/books';
import type { Novel } from 'src/models/novel';

/** 装一本含多章 + 卷标题的假书。每章只挂标题,内容由 chunk 提供。 */
function seedBook(
  bookId: string,
  volumeTitle: string,
  chapters: Array<{ id: string; title: string }>,
): void {
  const store = useBooksStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (store as any).books = [
    {
      id: bookId,
      title: 'Test Book',
      volumes: [
        {
          id: 'v1',
          title: volumeTitle,
          chapters: chapters.map((c) => ({
            id: c.id,
            title: c.title,
            paragraphs: [],
            createdAt: new Date(),
            lastEdited: new Date(),
          })),
        },
      ],
    } as unknown as Novel,
  ];
}

/** 直接往 IDB 写一条 chunk(绕过 embedChapter,精确控制 vector / snippet) */
async function putChunk(
  chapterId: string,
  bookId: string,
  kind: 'content' | 'title',
  chunkIndex: number,
  vector: number[],
  textSnippet: string,
): Promise<void> {
  await ChapterEmbeddingService.writeChunksForChapter(chapterId, bookId, [
    { kind, chunkIndex, vector, textSnippet },
  ]);
}

/**
 * 把多个 chunk 一次性写入(同 chapter)。先按 kind 分组,再用一次 write 调用。
 * 注意:writeChunksForChapter 只清同 kind 的旧记录,所以 title + content 要分两次调。
 */
async function putContentChunks(
  chapterId: string,
  bookId: string,
  chunks: Array<{ vector: number[]; snippet: string }>,
): Promise<void> {
  await ChapterEmbeddingService.writeChunksForChapter(
    chapterId,
    bookId,
    chunks.map((c, i) => ({
      kind: 'content',
      chunkIndex: i,
      vector: c.vector,
      textSnippet: c.snippet,
    })),
  );
}

async function clearChapterEmbeddingsStore(): Promise<void> {
  const { getDB } = await import('src/utils/indexed-db');
  const db = await getDB();
  const tx = db.transaction('chapter-embeddings', 'readwrite');
  await tx.store.clear();
  await tx.done;
}

describe('ChapterEmbeddingService.queryChapters — 混合打分', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
    await clearChapterEmbeddingsStore();
  });

  afterEach(async () => {
    mock.restore();
    await clearChapterEmbeddingsStore();
  });

  it('标题命中型 query:title_norm 通道赢(标题向量与 query 几乎一致)', async () => {
    const bookId = 'b';
    seedBook(bookId, '王宫篇', [
      { id: 'ch-1', title: '第二王女夏洛特' },
      { id: 'ch-2', title: '森林冒险' },
    ]);

    // ch-1 的 title 向量与 query 接近;ch-2 各路都平庸
    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));

    await putContentChunks('ch-1', bookId, [
      { vector: [0.5, 0.5], snippet: '夏洛特从王宫醒来' },
      { vector: [0.4, 0.6], snippet: '走廊里的脚步声' },
    ]);
    await putChunk('ch-1', bookId, 'title', TITLE_CHUNK_INDEX, [0.99, 0.01], '[章] 第二王女夏洛特');

    await putContentChunks('ch-2', bookId, [
      { vector: [0.3, 0.7], snippet: '森林深处' },
      { vector: [0.4, 0.6], snippet: '夜幕降临' },
    ]);
    await putChunk('ch-2', bookId, 'title', TITLE_CHUNK_INDEX, [0.2, 0.8], '[章] 森林冒险');

    const results = await ChapterEmbeddingService.queryChapters(bookId, '第二王女', 5);
    expect(results[0]?.chapter_id).toBe('ch-1');
  });

  it('具体场景型 query:content_max 通道赢(单个 content chunk 强命中)', async () => {
    const bookId = 'b';
    seedBook(bookId, '森林篇', [
      { id: 'ch-1', title: '日常' },
      { id: 'ch-2', title: '日常' },
    ]);
    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));

    // ch-1 有一个 content chunk 与 query 几乎一致 → content_max 赢
    await putContentChunks('ch-1', bookId, [
      { vector: [0.99, 0.01], snippet: '夏洛特紧张到胃痛,在芬恩面前手脚僵硬' },
      { vector: [0.3, 0.7], snippet: '其它无关段落' },
      { vector: [0.4, 0.6], snippet: '其它无关段落 2' },
    ]);
    await putChunk('ch-1', bookId, 'title', TITLE_CHUNK_INDEX, [0.4, 0.6], '[章] 日常');

    // ch-2 所有 chunk 都平庸
    await putContentChunks('ch-2', bookId, [
      { vector: [0.5, 0.5], snippet: '段落 A' },
      { vector: [0.5, 0.5], snippet: '段落 B' },
    ]);
    await putChunk('ch-2', bookId, 'title', TITLE_CHUNK_INDEX, [0.5, 0.5], '[章] 日常');

    const results = await ChapterEmbeddingService.queryChapters(bookId, '紧张到胃痛', 5);
    expect(results[0]?.chapter_id).toBe('ch-1');
    expect(results[0]?.preview).toContain('紧张到胃痛');
  });

  it('整章主题型 query:content blend 通道让 broadly-relevant 章节胜出', async () => {
    // 用 pre-normalized 向量(norm = 1)让 cosine = 第一维分量,便于精确推算
    // sqrt(1 - c²) 为第二维。所有向量手动算好。
    const v = (c: number): number[] => [c, Math.sqrt(1 - c * c)];

    const bookId = 'b';
    seedBook(bookId, '本卷', [
      { id: 'ch-1', title: '日常' }, // 整章都和 query 中等高度相似
      { id: 'ch-2', title: '日常' }, // 单个 outlier 略高,其余很低
    ]);
    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));

    // ch-1: 三个 chunk 都 ~0.85-0.87 → content_max ≈ 0.87, top3_mean ≈ 0.86
    //        blend = 0.6 × 0.87 + 0.4 × 0.86 ≈ 0.866
    await putContentChunks('ch-1', bookId, [
      { vector: v(0.87), snippet: 'a1' },
      { vector: v(0.86), snippet: 'a2' },
      { vector: v(0.85), snippet: 'a3' },
    ]);
    await putChunk('ch-1', bookId, 'title', TITLE_CHUNK_INDEX, v(0.5), '[章] 日常');

    // ch-2: 一个 outlier 稍高 0.90,其它两个仅 0.10 → content_max = 0.90, top3_mean ≈ 0.367
    //        blend = 0.6 × 0.90 + 0.4 × 0.367 ≈ 0.687 → 显著低于 ch-1
    await putContentChunks('ch-2', bookId, [
      { vector: v(0.90), snippet: 'b1-outlier' },
      { vector: v(0.10), snippet: 'b2' },
      { vector: v(0.10), snippet: 'b3' },
    ]);
    await putChunk('ch-2', bookId, 'title', TITLE_CHUNK_INDEX, v(0.5), '[章] 日常');

    const results = await ChapterEmbeddingService.queryChapters(bookId, '整章主题查询', 5);
    // ch-1 (broadly relevant) 应胜出 — blend 让 top3_mean 实际起作用
    expect(results[0]?.chapter_id).toBe('ch-1');
  });

  it('关键词命中型(标题字面):语义略低但标题字面命中胜出', async () => {
    const bookId = 'b';
    // 卷标题用中性词,避免两章 title_kw 都命中导致并列
    seedBook(bookId, '本卷', [
      { id: 'ch-1', title: '日常对话' }, // 语义略高
      { id: 'ch-2', title: '修学旅行 第一天' }, // 标题命中 query
    ]);
    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));

    // ch-1 语义稍高,但其标题不含 "修学旅行" → title_kw = 0
    await putContentChunks('ch-1', bookId, [
      { vector: [0.7, 0.7], snippet: 'A' },
      { vector: [0.71, 0.7], snippet: 'A2' },
    ]);
    await putChunk('ch-1', bookId, 'title', TITLE_CHUNK_INDEX, [0.7, 0.7], '[章] 日常对话');

    // ch-2 语义略低,但标题字面命中 "修学旅行" → title_kw ≈ 1.0
    // 0.35 × 1.0 ≈ 0.35 的 keyword 加成 > ch-1 的 ~0.22 的语义优势
    await putContentChunks('ch-2', bookId, [
      { vector: [0.65, 0.7], snippet: 'B' },
      { vector: [0.66, 0.7], snippet: 'B2' },
    ]);
    await putChunk('ch-2', bookId, 'title', TITLE_CHUNK_INDEX, [0.65, 0.7], '[章] 修学旅行 第一天');

    const results = await ChapterEmbeddingService.queryChapters(bookId, '修学旅行', 5);
    expect(results[0]?.chapter_id).toBe('ch-2');
  });

  it('全书 chunk 抱团触发 SPREAD_FLOOR:降级到纯 keyword,字面命中赢', async () => {
    const bookId = 'b';
    seedBook(bookId, '本卷', [
      { id: 'ch-1', title: '芬恩的剑技' },
      { id: 'ch-2', title: '日常对话' },
    ]);
    // 所有 chunk 向量 ≈ 一致 → stddev → 0 → semantic 降级
    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));

    const flatVec = [0.99, 0.01]; // 与 query 余弦都 ≈ 0.99
    await putContentChunks('ch-1', bookId, [
      { vector: flatVec, snippet: 'a' },
      { vector: flatVec, snippet: 'b' },
    ]);
    await putChunk('ch-1', bookId, 'title', TITLE_CHUNK_INDEX, flatVec, '[章] 芬恩的剑技');

    await putContentChunks('ch-2', bookId, [
      { vector: flatVec, snippet: 'c' },
      { vector: flatVec, snippet: 'd' },
    ]);
    await putChunk('ch-2', bookId, 'title', TITLE_CHUNK_INDEX, flatVec, '[章] 日常对话');

    const results = await ChapterEmbeddingService.queryChapters(bookId, '芬恩', 5);
    // 抱团 → semantic 全为 0,只剩 keyword;ch-1 标题命中 "芬恩"
    expect(results[0]?.chapter_id).toBe('ch-1');
    // 总分 = 0 + 0.35 × keyword,应该 > 0
    expect(results[0]?.score).toBeGreaterThan(0);
  });

  it('章节缺 title chunk:title_norm = 0,其它通道仍工作', async () => {
    const bookId = 'b';
    seedBook(bookId, '本卷', [
      { id: 'ch-1', title: '只有内容' },
      { id: 'ch-2', title: '另一章' },
    ]);
    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));

    // ch-1 不写 title,只写 content
    await putContentChunks('ch-1', bookId, [
      { vector: [0.95, 0.05], snippet: '强命中段落' },
      { vector: [0.4, 0.6], snippet: '次要段落' },
    ]);

    await putContentChunks('ch-2', bookId, [
      { vector: [0.5, 0.5], snippet: '平庸段落' },
    ]);
    await putChunk('ch-2', bookId, 'title', TITLE_CHUNK_INDEX, [0.5, 0.5], '[章] 另一章');

    const results = await ChapterEmbeddingService.queryChapters(bookId, '强命中', 5);
    // ch-1 没 title chunk 也能胜出(content_max 通道)
    expect(results[0]?.chapter_id).toBe('ch-1');
    expect(results[0]?.preview).toBe('强命中段落');
  });

  it('章节只有 1-2 chunk:top-K 自动退化为均值', async () => {
    const bookId = 'b';
    seedBook(bookId, '本卷', [{ id: 'ch-1', title: '短章' }]);
    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));

    await putContentChunks('ch-1', bookId, [
      { vector: [0.9, 0.1], snippet: 'only' },
    ]);
    await putChunk('ch-1', bookId, 'title', TITLE_CHUNK_INDEX, [0.5, 0.5], '[章] 短章');

    // 不抛错,正常返回(N < 2 触发 SPREAD_FLOOR 走纯 keyword,但还是有结果)
    const results = await ChapterEmbeddingService.queryChapters(bookId, '只是测试', 5);
    expect(results).toHaveLength(1);
    expect(results[0]?.chapter_id).toBe('ch-1');
  });

  it('全部 chunk 都 stale(model 不一致):抛 structured error', async () => {
    const bookId = 'b';
    seedBook(bookId, '本卷', [{ id: 'ch-1', title: '章' }]);
    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));

    // 直接写 stale 记录(绕过 writeChunksForChapter,后者强制写当前 MODEL_VERSION)
    const { getDB } = await import('src/utils/indexed-db');
    const db = await getDB();
    await db.put(
      'chapter-embeddings',
      {
        chapterId: 'ch-1',
        bookId,
        kind: 'content',
        chunkIndex: 0,
        vector: [0.5, 0.5],
        textSnippet: 'stale',
        model: 'OLD_MODEL_v0',
        updatedAt: 1,
      },
      'ch-1:content:0',
    );

    // 仅 stale 记录 → queryChapters 抛错
    expect(
      ChapterEmbeddingService.queryChapters(bookId, 'q', 5),
    ).rejects.toThrow(/章节向量空间已升级/);
  });

  it('preview:content chunk 缺失时 fallback 到 title snippet', async () => {
    const bookId = 'b';
    seedBook(bookId, '本卷', [{ id: 'ch-1', title: '只有标题章' }]);
    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));

    await putChunk(
      'ch-1',
      bookId,
      'title',
      TITLE_CHUNK_INDEX,
      [0.99, 0.01],
      '[章] 只有标题章\n\n首段',
    );

    const results = await ChapterEmbeddingService.queryChapters(bookId, '只有', 5);
    // 单条 chunk 的情况 SPREAD_FLOOR 触发降级,但 title kw 仍能命中,有结果返回
    expect(results).toHaveLength(1);
    expect(results[0]?.preview).toBe('[章] 只有标题章\n\n首段');
  });

  it('总分公式:total = 0.65 × semantic + 0.35 × keyword', async () => {
    const bookId = 'b';
    seedBook(bookId, '本卷', [
      { id: 'ch-1', title: '完美命中' },
      { id: 'ch-2', title: '普通章' },
    ]);
    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));

    // 让 ch-1 的语义和关键词都满分:
    // - title 向量与 query 完全一致 → titleNorm 在 z-score 后接近 1
    // - 标题字面就是 query 本身 → titleKw = 1
    await putContentChunks('ch-1', bookId, [
      { vector: [0.99, 0.01], snippet: '强命中' },
      { vector: [0.5, 0.5], snippet: '次' },
    ]);
    await putChunk('ch-1', bookId, 'title', TITLE_CHUNK_INDEX, [1, 0], '[章] 完美命中');

    // ch-2 全部很弱
    await putContentChunks('ch-2', bookId, [
      { vector: [0.1, 0.9], snippet: 'x' },
      { vector: [0.15, 0.88], snippet: 'y' },
    ]);
    await putChunk('ch-2', bookId, 'title', TITLE_CHUNK_INDEX, [0.1, 0.9], '[章] 普通章');

    const results = await ChapterEmbeddingService.queryChapters(bookId, '完美命中', 5);
    expect(results[0]?.chapter_id).toBe('ch-1');
    // 上限按公式不超过 1.0
    expect(results[0]?.score).toBeLessThanOrEqual(1.0);
    expect(results[0]?.score).toBeGreaterThan(results[1]!.score);
  });
});
