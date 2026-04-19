/**
 * 章节检索的专名加权 + 跨语言别名归一(round 2)。
 *
 * 覆盖:
 * - buildBookAliasIndex 工具函数(空书 / 含 terminologies / 含 characterSettings + aliases)
 * - expandQueryWithAliases:中文 query 命中后追加日文别名,反之亦然
 * - 中文 query "莉莉花园" 能命中只含日文 "リリーガーデン" 的章节
 * - 专名加权:专名 unit 命中分高于普通泛词
 * - title + content 同时命中 → keyword 加性公式分高于只 title 命中
 * - 书无 terminologies / characterSettings → 退化为旧逻辑(无别名扩展、无 boost)
 */
import './setup';
import { describe, expect, it, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import {
  ChapterEmbeddingService,
  TITLE_CHUNK_INDEX,
  buildBookAliasIndex,
  expandQueryWithAliases,
} from 'src/services/chapter-embedding-service';
import { EmbeddingService } from 'src/services/embedding-service';
import { useBooksStore } from 'src/stores/books';
import type { Novel } from 'src/models/novel';

async function clearChapterEmbeddingsStore(): Promise<void> {
  const { getDB } = await import('src/utils/indexed-db');
  const db = await getDB();
  const tx = db.transaction('chapter-embeddings', 'readwrite');
  await tx.store.clear();
  await tx.done;
}

/** 装一本书带 terminologies + characterSettings(后者带 aliases) */
function seedBookWithTerms(
  bookId: string,
  chapters: Array<{ id: string; title: string }>,
): Novel {
  const novel = {
    id: bookId,
    title: 'Test',
    lastEdited: new Date(),
    createdAt: new Date(),
    terminologies: [
      {
        id: 't1',
        name: 'リリーガーデン',
        translation: { id: 'tr1', translation: '莉莉花园', aiModelId: '' },
      },
    ],
    characterSettings: [
      {
        id: 'c1',
        name: 'シャルロット',
        sex: 'female',
        translation: { id: 'tr2', translation: '夏洛特', aiModelId: '' },
        aliases: [
          {
            name: '第二王女',
            translation: { id: 'tr3', translation: '第二公主', aiModelId: '' },
          },
        ],
      },
    ],
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
  } as unknown as Novel;
  const store = useBooksStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (store as any).books = [novel];
  return novel;
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

describe('buildBookAliasIndex', () => {
  it('空 / null book → 空索引', () => {
    expect(buildBookAliasIndex(null).properNouns.size).toBe(0);
    expect(buildBookAliasIndex(undefined).properNouns.size).toBe(0);
    expect(buildBookAliasIndex({} as Novel).properNouns.size).toBe(0);
    expect(buildBookAliasIndex({} as Novel).aliasGroups).toHaveLength(0);
  });

  it('含 terminologies:每条术语一个 group(name + 中文双语)', () => {
    const book = {
      terminologies: [
        {
          id: 't1',
          name: 'リリーガーデン',
          translation: { translation: '莉莉花园' },
        },
        {
          id: 't2',
          name: '払暁',
          translation: { translation: '拂晓' },
        },
      ],
    } as unknown as Novel;
    const idx = buildBookAliasIndex(book);
    expect(idx.properNouns.has('リリーガーデン')).toBe(true);
    expect(idx.properNouns.has('莉莉花园')).toBe(true);
    expect(idx.properNouns.has('払暁')).toBe(true);
    expect(idx.properNouns.has('拂晓')).toBe(true);
    expect(idx.aliasGroups).toHaveLength(2);
    expect(idx.aliasGroups[0]).toEqual(expect.arrayContaining(['リリーガーデン', '莉莉花园']));
  });

  it('含 characterSettings + aliases:全部进 properNouns 与同一组', () => {
    const book = {
      characterSettings: [
        {
          id: 'c1',
          name: 'シャルロット',
          translation: { translation: '夏洛特' },
          aliases: [
            { name: '第二王女', translation: { translation: '第二公主' } },
            { name: 'シャル', translation: { translation: '小夏' } },
          ],
        },
      ],
    } as unknown as Novel;
    const idx = buildBookAliasIndex(book);
    for (const v of ['シャルロット', '夏洛特', '第二王女', '第二公主', 'シャル', '小夏']) {
      expect(idx.properNouns.has(v)).toBe(true);
    }
    expect(idx.aliasGroups).toHaveLength(1);
    expect(idx.aliasGroups[0]?.length).toBe(6);
  });

  it('单字 / 空白成员被忽略(避免噪声)', () => {
    const book = {
      terminologies: [
        {
          id: 't',
          name: 'A', // 长度 < 2 忽略
          translation: { translation: '   ' }, // 空白忽略
        },
      ],
    } as unknown as Novel;
    const idx = buildBookAliasIndex(book);
    expect(idx.properNouns.size).toBe(0);
    expect(idx.aliasGroups).toHaveLength(0);
  });

  it('全部 lowercase(与 memory-scoring 内部一致)', () => {
    const book = {
      terminologies: [
        {
          id: 't',
          name: 'LilyGarden',
          translation: { translation: 'XYZ' },
        },
      ],
    } as unknown as Novel;
    const idx = buildBookAliasIndex(book);
    expect(idx.properNouns.has('lilygarden')).toBe(true);
    expect(idx.properNouns.has('LilyGarden')).toBe(false);
    expect(idx.properNouns.has('xyz')).toBe(true);
  });
});

describe('expandQueryWithAliases', () => {
  it('命中组内一员:其它成员追加到 query 末尾', () => {
    const idx = {
      properNouns: new Set<string>(),
      aliasGroups: [['莉莉花园', 'リリーガーデン']],
    };
    expect(expandQueryWithAliases('莉莉花园在等谁', idx)).toBe('莉莉花园在等谁 リリーガーデン');
  });

  it('反向命中(query 含日文 → 追加中文)', () => {
    const idx = {
      properNouns: new Set<string>(),
      aliasGroups: [['莉莉花园', 'リリーガーデン']],
    };
    expect(expandQueryWithAliases('リリーガーデン的访客', idx)).toBe(
      'リリーガーデン的访客 莉莉花园',
    );
  });

  it('多组同时命中:每组各自追加', () => {
    const idx = {
      properNouns: new Set<string>(),
      aliasGroups: [
        ['莉莉花园', 'リリーガーデン'],
        ['夏洛特', 'シャルロット'],
      ],
    };
    const result = expandQueryWithAliases('莉莉花园里夏洛特登场', idx);
    expect(result).toContain('リリーガーデン');
    expect(result).toContain('シャルロット');
  });

  it('query 已含全部成员:不重复追加', () => {
    const idx = {
      properNouns: new Set<string>(),
      aliasGroups: [['莉莉花园', 'リリーガーデン']],
    };
    expect(expandQueryWithAliases('莉莉花园 リリーガーデン 都在', idx)).toBe(
      '莉莉花园 リリーガーデン 都在',
    );
  });

  it('无命中:原样返回', () => {
    const idx = {
      properNouns: new Set<string>(),
      aliasGroups: [['莉莉花园', 'リリーガーデン']],
    };
    expect(expandQueryWithAliases('完全无关的查询', idx)).toBe('完全无关的查询');
  });

  it('aliasGroups 为空:原样返回', () => {
    expect(
      expandQueryWithAliases('任意 query', { properNouns: new Set(), aliasGroups: [] }),
    ).toBe('任意 query');
  });
});

describe('queryChapters — round 2 集成', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
    await clearChapterEmbeddingsStore();
  });

  afterEach(async () => {
    mock.restore();
    await clearChapterEmbeddingsStore();
  });

  it('中文 query "莉莉花园" 命中只含日文 "リリーガーデン" 的章节(别名扩展)', async () => {
    const bookId = 'b';
    seedBookWithTerms(bookId, [
      { id: 'ch-1', title: '日常' }, // 正文有日文 リリーガーデン,标题没词
      { id: 'ch-2', title: '其它章' }, // 完全无关
    ]);

    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));

    // 两章语义都很弱(向量区分度小),靠 keyword 决出胜负
    await putContentChunks('ch-1', bookId, [
      { vector: [0.5, 0.5], snippet: 'リリーガーデン迎来访客' },
      { vector: [0.5, 0.5], snippet: '其它内容' },
    ]);
    await putChunk('ch-1', bookId, 'title', TITLE_CHUNK_INDEX, [0.5, 0.5], '日常');

    await putContentChunks('ch-2', bookId, [
      { vector: [0.5, 0.5], snippet: '某天的早晨' },
      { vector: [0.5, 0.5], snippet: '别的事' },
    ]);
    await putChunk('ch-2', bookId, 'title', TITLE_CHUNK_INDEX, [0.5, 0.5], '其它章');

    const results = await ChapterEmbeddingService.queryChapters(bookId, '莉莉花园', 5);
    expect(results[0]?.chapter_id).toBe('ch-1');
  });

  it('专名加权(round 4 IDF 主导):稀有词章节胜过常见词章节', async () => {
    const bookId = 'b';
    // 6 章:1 章稀有专名 シャルロット,1 章主命中泛词 马车,另 4 章用 decoy 让"马车"变常见
    seedBookWithTerms(bookId, [
      { id: 'ch-noun', title: '日常' },
      { id: 'ch-generic', title: '日常' },
      { id: 'd1', title: '日常' },
      { id: 'd2', title: '日常' },
      { id: 'd3', title: '日常' },
      { id: 'd4', title: '日常' },
    ]);

    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));

    // ch-noun: 含 シャルロット(df=1,IDF 高 → 高权重)
    await putContentChunks('ch-noun', bookId, [
      { vector: [0.5, 0.5], snippet: 'シャルロット走进了房间' },
    ]);
    await putChunk('ch-noun', bookId, 'title', TITLE_CHUNK_INDEX, [0.5, 0.5], '日常');

    // ch-generic + 4 decoy 都含 马车(df=5,IDF 低 → 低权重)
    for (const id of ['ch-generic', 'd1', 'd2', 'd3', 'd4']) {
      await putContentChunks(id, bookId, [
        { vector: [0.5, 0.5], snippet: '马车在路上行驶' },
      ]);
      await putChunk(id, bookId, 'title', TITLE_CHUNK_INDEX, [0.5, 0.5], '日常');
    }

    // query 同时含专名和泛词。round 4 后,IDF 让稀有的 シャルロット 主导排名。
    const results = await ChapterEmbeddingService.queryChapters(
      bookId,
      'シャルロット 马车',
      5,
    );
    expect(results[0]?.chapter_id).toBe('ch-noun');
  });

  it('加性 keyword:title + content 双命中分高于只 title 命中', async () => {
    const bookId = 'b';
    seedBookWithTerms(bookId, [
      { id: 'ch-both', title: '夏洛特出场' }, // title 部分命中 + content 完整命中
      { id: 'ch-title-only', title: '夏洛特出场' }, // title 部分命中 + content 完全无关
    ]);

    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));

    // 两章语义、title 都一致;只有 content 不同
    // query "夏洛特登场" 是单个 unit(无标点,不被 splitCompoundQuery 分),不在 properNouns
    // (避开 boost,纯测加性公式)。title="夏洛特出场" 与 unit 公共子串只有"夏洛特"(3/5),
    // title_kw < 1.0,从而留出 content 加性空间。
    await putContentChunks('ch-both', bookId, [
      { vector: [0.5, 0.5], snippet: '夏洛特登场了' }, // 完整含 unit "夏洛特登场"
    ]);
    await putChunk('ch-both', bookId, 'title', TITLE_CHUNK_INDEX, [0.5, 0.5], '夏洛特出场');

    await putContentChunks('ch-title-only', bookId, [
      { vector: [0.5, 0.5], snippet: '毫不相关的内容' },
    ]);
    await putChunk(
      'ch-title-only',
      bookId,
      'title',
      TITLE_CHUNK_INDEX,
      [0.5, 0.5],
      '夏洛特出场',
    );

    const results = await ChapterEmbeddingService.queryChapters(bookId, '夏洛特登场', 5);
    expect(results[0]?.chapter_id).toBe('ch-both');
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });

  it('书无 terminologies / characterSettings:行为退化为旧逻辑(无 boost、无别名)', async () => {
    const bookId = 'b';
    // 不调 seedBookWithTerms,直接装一本无术语的书
    const store = useBooksStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (store as any).books = [
      {
        id: bookId,
        title: 'Plain',
        lastEdited: new Date(),
        createdAt: new Date(),
        volumes: [
          {
            id: 'v',
            title: 'V',
            chapters: [
              {
                id: 'ch-1',
                title: '只有标题',
                paragraphs: [],
                createdAt: new Date(),
                lastEdited: new Date(),
              },
            ],
          },
        ],
      } as unknown as Novel,
    ];

    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));

    await putChunk('ch-1', bookId, 'title', TITLE_CHUNK_INDEX, [0.99, 0.01], '[章] 只有标题');

    // 不抛错,正常返回(单条 chunk → SPREAD_FLOOR 触发降级,但 keyword 仍能命中)
    const results = await ChapterEmbeddingService.queryChapters(bookId, '只有', 5);
    expect(results).toHaveLength(1);
    expect(results[0]?.chapter_id).toBe('ch-1');
    // total > 0 即可(keyword 命中"只有")
    expect(results[0]!.score).toBeGreaterThan(0);
  });
});
