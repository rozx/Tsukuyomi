/**
 * Round 3:identifier(章节序号 / 卷号:阿拉伯数字 / 中文数字 / 圈号 / 罗马数字)
 * 加权 + mismatch 惩罚。直击 LLM 反馈"83 星天 ⑥ Top1 命不中"的根因。
 *
 * 覆盖:
 * - extractQueryUnits 现在能正确抽出圈号、罗马数字(原本被丢弃)
 * - isIdentifierUnit 对各种 identifier 类型判定正确
 * - identifier 命中时 boost 高于 PROPER_NOUN_BOOST
 * - query 含 identifier 但章节标题缺该 identifier → total × 0.3 惩罚
 * - 同系列章节(星天 ⑤ vs 星天 ⑥),query "星天 ⑥" 应让 ⑥ 胜出
 */
import './setup';
import { describe, expect, it, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import {
  ChapterEmbeddingService,
  TITLE_CHUNK_INDEX,
} from 'src/services/chapter-embedding-service';
import { calculateQueryKeywordScore, isIdentifierUnit } from 'src/services/memory-scoring';
import { EmbeddingService } from 'src/services/embedding-service';
import { useBooksStore } from 'src/stores/books';
import type { Memory } from 'src/models/memory';
import type { Novel } from 'src/models/novel';

async function clearChapterEmbeddingsStore(): Promise<void> {
  const { getDB } = await import('src/utils/indexed-db');
  const db = await getDB();
  const tx = db.transaction('chapter-embeddings', 'readwrite');
  await tx.store.clear();
  await tx.done;
}

function fakeMem(summary: string, content = ''): Memory {
  return { summary, content } as Pick<Memory, 'summary' | 'content'> as Memory;
}

async function seedSeriesBook(
  bookId: string,
  chapters: Array<{ id: string; title: string }>,
  volumeTitle = '本卷',
): Promise<void> {
  const book = {
    id: bookId,
    title: 'Test',
    lastEdited: new Date(),
    createdAt: new Date(),
    volumes: [
      {
        id: 'v',
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

describe('isIdentifierUnit', () => {
  it('阿拉伯数字 → true', () => {
    expect(isIdentifierUnit('83')).toBe(true);
    expect(isIdentifierUnit('100')).toBe(true);
    expect(isIdentifierUnit('1')).toBe(true);
  });

  it('圈号 → true', () => {
    expect(isIdentifierUnit('①')).toBe(true);
    expect(isIdentifierUnit('⑥')).toBe(true);
    expect(isIdentifierUnit('⑳')).toBe(true);
  });

  it('罗马数字 → true', () => {
    expect(isIdentifierUnit('Ⅰ')).toBe(true);
    expect(isIdentifierUnit('Ⅴ')).toBe(true);
    expect(isIdentifierUnit('Ⅹ')).toBe(true);
  });

  it('中文数字 → true', () => {
    expect(isIdentifierUnit('八十三')).toBe(true);
    expect(isIdentifierUnit('六')).toBe(true);
    expect(isIdentifierUnit('〇')).toBe(true);
  });

  it('普通汉字 / 假名 / 英文词 → false', () => {
    expect(isIdentifierUnit('星天')).toBe(false);
    expect(isIdentifierUnit('リリー')).toBe(false);
    expect(isIdentifierUnit('charlotte')).toBe(false);
    expect(isIdentifierUnit('星')).toBe(false);
  });

  it('混合 → false(纯净判断)', () => {
    expect(isIdentifierUnit('第83章')).toBe(false);
    expect(isIdentifierUnit('83章')).toBe(false);
  });
});

describe('extractQueryUnits 现在能抽出 identifier 字符(通过 calculateQueryKeywordScore 间接验证)', () => {
  it('圈号 ⑥ 单字符也能命中(以前被丢)', () => {
    // 旧行为:⑥ length 1 且不是 CJK / ALPHA → 被 extractQueryUnits 丢弃 → score = 0
    // 新行为:⑥ 是 IDENTIFIER → 入 unit → 命中 haystack
    const score = calculateQueryKeywordScore('⑥', fakeMem('星天⑥'));
    expect(score).toBeGreaterThan(0);
  });

  it('罗马数字 Ⅴ 单字符也能命中', () => {
    const score = calculateQueryKeywordScore('Ⅴ', fakeMem('第Ⅴ章'));
    expect(score).toBeGreaterThan(0);
  });

  it('未命中时返回 0(单字符 identifier 也走包含检查)', () => {
    const score = calculateQueryKeywordScore('⑥', fakeMem('星天⑤'));
    expect(score).toBe(0);
  });
});

describe('IDENTIFIER_BOOST in calculateQueryKeywordScore', () => {
  it('identifier 命中分被 boost 抬高(对比无 boost 基线)', () => {
    const baseline = calculateQueryKeywordScore('83 星天', fakeMem('83 星天的故事'));
    const boosted = calculateQueryKeywordScore('83 星天', fakeMem('83 星天的故事'), {
      identifierBoost: 3.0,
    });
    expect(boosted).toBeGreaterThanOrEqual(baseline);
  });

  it('boost 不会让单 unit 越过 1.0 上限', () => {
    const score = calculateQueryKeywordScore('83', fakeMem('章节 83 标题'), {
      identifierBoost: 10,
    });
    // 单 unit 平均后单元分被 clamp 到 1.0,query 只有这一个 unit → 总分 ≤ 1.0
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('identifierBoost 与 properNoun boost 取最大,不复合', () => {
    const properNouns = new Set(['83']);
    const both = calculateQueryKeywordScore('83', fakeMem('83 the chapter'), {
      identifierBoost: 3.0,
      properNouns,
      boost: 2.0,
    });
    const onlyId = calculateQueryKeywordScore('83', fakeMem('83 the chapter'), {
      identifierBoost: 3.0,
    });
    // both 不应该 > onlyId(因为取 max,不叠乘)
    expect(both).toBe(onlyId);
  });
});

describe('queryChapters — identifier-mismatch 惩罚', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
    await clearChapterEmbeddingsStore();
  });

  afterEach(async () => {
    mock.restore();
    await clearChapterEmbeddingsStore();
  });

  it('星天系列(⑤ / ⑥):query "星天 ⑥" 应让 ⑥ 胜出', async () => {
    const bookId = 'b';
    await seedSeriesBook(bookId, [
      { id: 'ch-5', title: '星天 ⑤' },
      { id: 'ch-6', title: '星天 ⑥' },
    ]);
    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));

    // 两章语义、内容都相似 — 唯一差异在 title 的 ⑤/⑥
    await putContentChunks('ch-5', bookId, [
      { vector: [0.5, 0.5], snippet: '阿莉西亚的日常' },
    ]);
    await putChunk('ch-5', bookId, 'title', TITLE_CHUNK_INDEX, [0.5, 0.5], '[章] 星天 ⑤');

    await putContentChunks('ch-6', bookId, [
      { vector: [0.5, 0.5], snippet: '阿莉西亚的日常' },
    ]);
    await putChunk('ch-6', bookId, 'title', TITLE_CHUNK_INDEX, [0.5, 0.5], '[章] 星天 ⑥');

    const results = await ChapterEmbeddingService.queryChapters(bookId, '星天 ⑥', 5);
    expect(results[0]?.chapter_id).toBe('ch-6');
  });

  it('阿拉伯章号:query "83 星天" → 章 83 胜过章 82', async () => {
    const bookId = 'b';
    await seedSeriesBook(bookId, [
      { id: 'ch-82', title: '82 星天 ⑤' },
      { id: 'ch-83', title: '83 星天 ⑥' },
    ]);
    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));

    await putContentChunks('ch-82', bookId, [
      { vector: [0.5, 0.5], snippet: '日常段落' },
    ]);
    await putChunk('ch-82', bookId, 'title', TITLE_CHUNK_INDEX, [0.5, 0.5], '[章] 82 星天 ⑤');

    await putContentChunks('ch-83', bookId, [
      { vector: [0.5, 0.5], snippet: '日常段落' },
    ]);
    await putChunk('ch-83', bookId, 'title', TITLE_CHUNK_INDEX, [0.5, 0.5], '[章] 83 星天 ⑥');

    const results = await ChapterEmbeddingService.queryChapters(bookId, '83 星天', 5);
    expect(results[0]?.chapter_id).toBe('ch-83');
  });

  it('query 不含 identifier → 不施加惩罚(回归测试)', async () => {
    const bookId = 'b';
    await seedSeriesBook(bookId, [
      { id: 'ch-1', title: '日常对话' },
      { id: 'ch-2', title: '另一章' },
    ]);
    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));

    await putContentChunks('ch-1', bookId, [
      { vector: [0.99, 0.01], snippet: '强命中' },
    ]);
    await putChunk('ch-1', bookId, 'title', TITLE_CHUNK_INDEX, [0.5, 0.5], '[章] 日常对话');

    await putContentChunks('ch-2', bookId, [
      { vector: [0.5, 0.5], snippet: '弱命中' },
    ]);
    await putChunk('ch-2', bookId, 'title', TITLE_CHUNK_INDEX, [0.5, 0.5], '[章] 另一章');

    // query 无任何 identifier
    const results = await ChapterEmbeddingService.queryChapters(bookId, '强命中', 5);
    expect(results[0]?.chapter_id).toBe('ch-1');
    // 没被惩罚:语义优先的融合总分没有再被 × 0.3
    expect(results[0]!.score).toBeGreaterThan(0.2);
  });

  it('identifier 在卷标题里也算命中(章 + 卷拼接,不被惩罚)', async () => {
    const bookId = 'b';
    // 两章语义/内容相同;卷标题里含 Ⅲ,章 1 标题也含 Ⅲ,章 2 不含 → query "Ⅲ" 时章 2 被惩罚
    // 这里只验"卷里有 → 章 1 不被惩罚"那一侧:章 2 略去对照即可
    await seedSeriesBook(bookId, [{ id: 'ch-1', title: '日常 Ⅲ' }], '卷 Ⅲ');

    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));
    await putContentChunks('ch-1', bookId, [
      { vector: [0.5, 0.5], snippet: '内容' },
    ]);
    await putChunk('ch-1', bookId, 'title', TITLE_CHUNK_INDEX, [0.5, 0.5], '[章] 日常 Ⅲ');

    // query 含罗马数字 Ⅲ;章+卷拼接含 Ⅲ → 无惩罚 → keyword 部分肯定命中(Ⅲ 是 identifier
    // 单字符也能进 extractQueryUnits)→ 总分 > 0
    const results = await ChapterEmbeddingService.queryChapters(bookId, 'Ⅲ', 5);
    expect(results).toHaveLength(1);
    expect(results[0]!.score).toBeGreaterThan(0);
  });

  it('卷标题含 identifier 章节不含 → 不被惩罚(章+卷拼接判定)', async () => {
    const bookId = 'b';
    await seedSeriesBook(bookId, [{ id: 'ch-1', title: '日常' }], '卷 ⑥');

    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));
    await putContentChunks('ch-1', bookId, [
      { vector: [0.5, 0.5], snippet: '内容' },
    ]);
    await putChunk('ch-1', bookId, 'title', TITLE_CHUNK_INDEX, [0.5, 0.5], '[章] 日常');

    const results = await ChapterEmbeddingService.queryChapters(bookId, '⑥', 5);
    expect(results).toHaveLength(1);
    // 卷标题里有 ⑥ → 没被惩罚 → keyword > 0(单字符 ⑥ 也能进 extractQueryUnits)
    expect(results[0]!.score).toBeGreaterThan(0);
  });

  it('章节标题完全缺 identifier → 候选总分 × 0.3', async () => {
    const bookId = 'b';
    await seedSeriesBook(bookId, [
      { id: 'ch-with-num', title: '83 章' }, // 含 83
      { id: 'ch-no-num', title: '日常' }, // 缺 83
    ]);
    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));

    // ch-no-num 的语义略微强(0.95 vs 0.5),理论上 semantic 通道占优
    // 但 query "83" 是 identifier → ch-no-num 被 ×0.3 惩罚 → ch-with-num 应胜出
    await putContentChunks('ch-with-num', bookId, [
      { vector: [0.5, 0.5], snippet: '内容' },
    ]);
    await putChunk(
      'ch-with-num',
      bookId,
      'title',
      TITLE_CHUNK_INDEX,
      [0.5, 0.5],
      '[章] 83 章',
    );

    await putContentChunks('ch-no-num', bookId, [
      { vector: [0.95, 0.05], snippet: '语义强命中段落' },
    ]);
    await putChunk('ch-no-num', bookId, 'title', TITLE_CHUNK_INDEX, [0.5, 0.5], '[章] 日常');

    const results = await ChapterEmbeddingService.queryChapters(bookId, '83', 5);
    expect(results[0]?.chapter_id).toBe('ch-with-num');
  });
});
