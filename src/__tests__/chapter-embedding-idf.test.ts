/**
 * Round 4:在线 TF-IDF 加权(`computeQueryUnitIdf` + 在 scoring 里取代固定 properNoun
 * boost 让数据驱动决定单元权重)。
 *
 * 直击 LLM 反馈:角色名在很多章出现 → 固定 PROPER_NOUN_BOOST 把"角色相关章"全部抬起,
 * 把场景细节词被压住。IDF 让"新据点"这类只在少数章出现的单元拿高权重,反转排序。
 */
import './setup';
import { describe, expect, it, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import {
  ChapterEmbeddingService,
  TITLE_CHUNK_INDEX,
  computeQueryUnitIdf,
} from 'src/services/chapter-embedding-service';
import { calculateQueryKeywordScore } from 'src/services/memory-scoring';
import { EmbeddingService } from 'src/services/embedding-service';
import { useBooksStore } from 'src/stores/books';
import type { Memory } from 'src/models/memory';
import type { Novel } from 'src/models/novel';
import type { ChapterEmbedding } from 'src/models/chapter-embedding';

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

function mkChunk(
  chapterId: string,
  bookId: string,
  kind: 'content' | 'title',
  textSnippet: string,
): ChapterEmbedding {
  return {
    chapterId,
    bookId,
    kind,
    chunkIndex: 0,
    vector: [0],
    textSnippet,
    model: 'm',
    updatedAt: 0,
  };
}

function seedSeriesBook(
  bookId: string,
  chapters: Array<{ id: string; title: string }>,
  charName?: string,
): void {
  const store = useBooksStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (store as any).books = [
    {
      id: bookId,
      title: 'Test',
      lastEdited: new Date(),
      createdAt: new Date(),
      ...(charName
        ? {
            characterSettings: [
              {
                id: 'c',
                name: charName,
                translation: { id: 't', translation: charName, aiModelId: '' },
                aliases: [],
              },
            ],
          }
        : {}),
      volumes: [
        {
          id: 'v',
          title: 'V',
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

async function putTitleChunk(
  chapterId: string,
  bookId: string,
  vector: number[],
  textSnippet: string,
): Promise<void> {
  await ChapterEmbeddingService.writeChunksForChapter(chapterId, bookId, [
    {
      kind: 'title',
      chunkIndex: TITLE_CHUNK_INDEX,
      vector,
      textSnippet,
    },
  ]);
}

describe('computeQueryUnitIdf', () => {
  it('空 query / 空 chunks → 空 map', () => {
    expect(computeQueryUnitIdf('', []).size).toBe(0);
    expect(computeQueryUnitIdf('查询', []).size).toBe(0);
    expect(computeQueryUnitIdf('', [mkChunk('c', 'b', 'content', '内容')]).size).toBe(0);
  });

  it('稀有 unit(只在 1 章) → idf 接近 1', () => {
    const chunks = [
      mkChunk('c1', 'b', 'content', '阿莉亚 新据点 探险'),
      mkChunk('c2', 'b', 'content', '阿莉亚 日常'),
      mkChunk('c3', 'b', 'content', '阿莉亚 战斗'),
      mkChunk('c4', 'b', 'content', '阿莉亚 回忆'),
    ];
    const idf = computeQueryUnitIdf('阿莉亚 新据点', chunks);
    // 阿莉亚 在 4 章都有 → df=4, N=4 → idf = log(5/5)/log(5) = 0
    expect(idf.get('阿莉亚')).toBeCloseTo(0, 2);
    // 新据点 在 1 章 → df=1, N=4 → idf = log(5/2)/log(5) ≈ 0.569
    expect(idf.get('新据点')).toBeGreaterThan(0.5);
    expect(idf.get('新据点')).toBeLessThan(1);
  });

  it('完全没出现的 unit(df=0) → idf = 1', () => {
    const chunks = [
      mkChunk('c1', 'b', 'content', '一些内容'),
      mkChunk('c2', 'b', 'content', '其它内容'),
    ];
    const idf = computeQueryUnitIdf('完全不存在', chunks);
    // df=0, N=2 → log(3/1)/log(3) = 1
    expect(idf.get('完全不存在')).toBeCloseTo(1, 2);
  });

  it('identifier unit 不进 IDF map(走 IDENTIFIER_BOOST)', () => {
    const chunks = [mkChunk('c1', 'b', 'content', '内容 83 ⑥ Ⅴ 八十三')];
    const idf = computeQueryUnitIdf('83 ⑥ Ⅴ 八十三 普通词', chunks);
    expect(idf.has('83')).toBe(false);
    expect(idf.has('⑥')).toBe(false);
    expect(idf.has('Ⅴ')).toBe(false);
    expect(idf.has('八十三')).toBe(false);
    expect(idf.has('普通词')).toBe(true);
  });

  it('同章多 chunk 不重复计 df', () => {
    const chunks = [
      mkChunk('c1', 'b', 'content', '关键词'),
      mkChunk('c1', 'b', 'content', '关键词'), // 同章另一个 chunk
      mkChunk('c1', 'b', 'title', '标题里也有关键词'), // 同章 title chunk
      mkChunk('c2', 'b', 'content', '其它'),
    ];
    const idf = computeQueryUnitIdf('关键词', chunks);
    // 关键词 只在 c1 → df=1, N=2 → log(3/2)/log(3) ≈ 0.369
    expect(idf.get('关键词')).toBeGreaterThan(0.3);
    expect(idf.get('关键词')).toBeLessThan(0.5);
  });
});

describe('IDF 在 calculateQueryKeywordScore 中的作用', () => {
  it('稀有 unit(idf=1)单独命中:multiplier 2.0 让命中分顶到 1.0', () => {
    // 单 unit 部分命中,清楚看到 multiplier 效果
    const query = '雷射剑';
    const mem = fakeMem('雷射'); // 部分命中:公共子串 '雷射' = 2/3 ≈ 0.667
    const rareIdf = new Map([['雷射剑', 1.0]]);
    const score = calculateQueryKeywordScore(query, mem, { idfWeights: rareIdf });
    // unitScore = 0.667 × (0.5 + 1.5×1) = 0.667 × 2.0 = 1.333 → clamp 1.0
    expect(score).toBeCloseTo(1.0, 2);
  });

  it('常见 unit(idf=0)单独命中:multiplier 0.3 把命中分压低', () => {
    const query = '雷射剑';
    const mem = fakeMem('雷射剑'); // 完整命中 → unitScore base = 1.0
    const commonIdf = new Map([['雷射剑', 0.0]]);
    const score = calculateQueryKeywordScore(query, mem, { idfWeights: commonIdf });
    // unitScore = 1.0 × 0.3 = 0.3(round 5 收紧常见词抑制)
    expect(score).toBeCloseTo(0.3, 2);
  });

  it('对比无 IDF 基线:常见 unit 在 IDF 下分数明显低于基线', () => {
    const query = '雷射剑';
    const mem = fakeMem('雷射剑');
    const baseline = calculateQueryKeywordScore(query, mem); // 无 IDF → 1.0
    const withCommonIdf = calculateQueryKeywordScore(query, mem, {
      idfWeights: new Map([['雷射剑', 0.0]]),
    });
    expect(withCommonIdf).toBeLessThan(baseline);
  });

  it('IDF 优先于 properNoun boost(没传 IDF 才回落 properNoun)', () => {
    // 用 partial 命中场景(unitScore < 1)才能看出 multiplier 差异
    const query = '雷射剑'; // 1 个 unit, length 3
    const mem = fakeMem('雷射'); // 部分命中,公共子串 = '雷射' (2/3)
    const properNouns = new Set(['雷射剑']);

    const withIdf = calculateQueryKeywordScore(query, mem, {
      idfWeights: new Map([['雷射剑', 0.5]]),
      properNouns,
      boost: 2.0,
    });
    const withProperOnly = calculateQueryKeywordScore(query, mem, {
      properNouns,
      boost: 2.0,
    });

    // 基础 unitScore = 2/3 ≈ 0.667
    // IDF (0.5): multiplier = 0.3 + 1.7×0.5 = 1.15 → 0.667 × 1.15 ≈ 0.767
    // ProperNoun: multiplier = 2.0 → 0.667 × 2.0 = 1.333 clamp → 1.0
    expect(withIdf).toBeCloseTo(0.767, 2);
    expect(withProperOnly).toBeCloseTo(1.0, 2);
    expect(withIdf).toBeLessThan(withProperOnly);
  });

  it('Identifier 即使有 IDF 也走 IDENTIFIER_BOOST', () => {
    const query = '83';
    const mem = fakeMem('章节 83');
    // IDF=0 的话原应抑制到 0.5×,但 identifier 优先走 boost=3.0(然后 clamp)
    const score = calculateQueryKeywordScore(query, mem, {
      idfWeights: new Map([['83', 0.0]]),
      identifierBoost: 3.0,
    });
    // 单 unit 完整命中 → unitScore=1.0×3.0 clamp → 1.0
    expect(score).toBeCloseTo(1.0, 2);
  });
});

describe('queryChapters — TF-IDF 端到端', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
    await clearChapterEmbeddingsStore();
  });

  afterEach(async () => {
    mock.restore();
    await clearChapterEmbeddingsStore();
  });

  it('热门角色 + 稀有场景词:稀有词章节胜出(角色名不再误抬)', async () => {
    const bookId = 'b';
    // 阿莉亚 出现在 4 章(常见),新据点 只在 ch-target(稀有)
    seedSeriesBook(
      bookId,
      [
        { id: 'ch-1', title: '日常 1' },
        { id: 'ch-2', title: '日常 2' },
        { id: 'ch-3', title: '日常 3' },
        { id: 'ch-target', title: '日常 4' },
      ],
      '阿莉亚', // 角色 → 进 properNouns
    );

    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));

    // 所有章节的语义向量相同(平),让 keyword 决出胜负
    // ch-1/2/3 各有"阿莉亚"(常见词),ch-target 有"阿莉亚 新据点"(稀有词)
    for (const id of ['ch-1', 'ch-2', 'ch-3']) {
      await putContentChunks(id, bookId, [
        { vector: [0.5, 0.5], snippet: '阿莉亚 一些剧情' },
      ]);
      await putTitleChunk(id, bookId, [0.5, 0.5], `日常 ${id}`);
    }
    await putContentChunks('ch-target', bookId, [
      { vector: [0.5, 0.5], snippet: '阿莉亚 新据点 探险开始' },
    ]);
    await putTitleChunk('ch-target', bookId, [0.5, 0.5], '日常 4');

    const results = await ChapterEmbeddingService.queryChapters(
      bookId,
      '阿莉亚 新据点',
      5,
    );
    expect(results[0]?.chapter_id).toBe('ch-target');
  });

  it('回归:小书(2 章)IDF 区分度低,不影响 round 2 properNoun 测试效果', async () => {
    // 2 章里:词A 在 ch-noun(1/2),词B 在 ch-other(1/2),两者 idf 相同
    // 此时 IDF 不能区分,但章节本身的命中差异仍能决出胜负
    const bookId = 'b';
    seedSeriesBook(bookId, [
      { id: 'ch-noun', title: '日常' },
      { id: 'ch-other', title: '日常' },
    ]);

    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));

    await putContentChunks('ch-noun', bookId, [
      { vector: [0.5, 0.5], snippet: '阿莉亚 出场' },
    ]);
    await putTitleChunk('ch-noun', bookId, [0.5, 0.5], '日常');

    await putContentChunks('ch-other', bookId, [
      { vector: [0.5, 0.5], snippet: '没相关内容' },
    ]);
    await putTitleChunk('ch-other', bookId, [0.5, 0.5], '日常');

    const results = await ChapterEmbeddingService.queryChapters(bookId, '阿莉亚', 5);
    expect(results[0]?.chapter_id).toBe('ch-noun');
  });
});
