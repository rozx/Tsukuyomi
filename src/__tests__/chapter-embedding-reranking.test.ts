import './setup';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { ChapterEmbeddingService } from '../services/chapter-embedding-service';
import { EmbeddingService } from '../services/embedding-service';
import { getDB } from '../utils/indexed-db';
import type { Novel, Paragraph } from '../models/novel';

const QUERY = '她决定不再等待他来依赖自己';
const DEPENDENCE = '「彼女、あなたに依存し始めてるわよ」';
const WAITING = '隼汰自身が、私と離れたくないと思ってくれるまで待つのも。';
const DECISION = 'もう、隼汰に任せるのはやめよう。';
const BACKGROUND = '二人は普通の日常を過ごしていた。';

function vector(cosine: number): number[] {
  return [cosine, Math.sqrt(1 - cosine * cosine)];
}

async function seedBook(weak = false, deepCandidate = false): Promise<void> {
  const raws = deepCandidate
    ? [
        0.390286,
        0.380989,
        0.370622,
        0.348813,
        0.348281,
        0.340805,
        0.308798,
        0.331955,
        0.326186,
        0.323527,
        0.320283,
        0.32022,
        0.317707,
        0.315438,
        0.315174,
        0.312099,
        0.310179,
        0.309037,
        ...Array.from({ length: 39 }, () => 0.291),
      ]
    : weak
      ? [0.2265, 0.2178, 0.2068, 0.1998, ...Array.from({ length: 53 }, () => 0.12)]
      : [
          0.3591,
          0.3529,
          0.352,
          0.3484,
          0.3461,
          0.3391,
          0.3384,
          ...Array.from({ length: 50 }, () => 0.296),
        ];
  const book: Novel = {
    id: 'rerank-book',
    title: 'Book',
    createdAt: new Date(0),
    lastEdited: new Date(0),
    targetLanguage: 'zh-CN',
    characterSettings: [
      {
        id: 'heroine',
        name: '華奈',
        sex: undefined,
        aliases: [],
        translation: { id: 'heroine-cn', translation: '华奈', aiModelId: '' },
      },
    ],
    volumes: [
      {
        id: 'v',
        title: '本文',
        chapters: raws.map((_raw, index) => ({
          id: `c${index}`,
          title: `日文章 ${index}`,
          createdAt: new Date(0),
          lastEdited: new Date(0),
        })),
      },
    ],
  };
  const db = await getDB();
  await db.put('books', book);
  for (const [index, raw] of raws.entries()) {
    const texts =
      index === 6
        ? [WAITING, DECISION]
        : index < 6
          ? [DEPENDENCE, DEPENDENCE.replaceAll('「', '『').replaceAll('」', '』'), BACKGROUND]
          : [BACKGROUND];
    const paragraphs: Paragraph[] = texts.map((text, index) => ({
      id: `p${index}`,
      text,
      translations: [],
      selectedTranslationId: '',
    }));
    await db.put('chapter-contents', {
      chapterId: `c${index}`,
      bookId: book.id,
      content: JSON.stringify(paragraphs),
      lastModified: new Date(0).toISOString(),
    });
    await ChapterEmbeddingService.writeChunksForChapter(`c${index}`, book.id, [
      {
        kind: 'content',
        chunkIndex: 0,
        vector: vector(raw),
        textSnippet: texts.join('\n\n'),
      },
    ]);
  }
}

function focusedVector(text: string): Float32Array {
  const cosine =
    text === WAITING
      ? 0.4793
      : text === DECISION
        ? 0.3861
        : text.includes('依存し始めてる')
          ? 0.5032
          : 0.2;
  return new Float32Array(vector(cosine));
}

describe('章节段落重排', () => {
  beforeEach(() => {
    spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));
  });
  afterEach(() => mock.restore());

  it('整块排第七的具体情节通过独立段落证据进入前五，引号变体只算一份证据', async () => {
    await seedBook();
    const embed = spyOn(EmbeddingService, 'embedBatch').mockImplementation((texts) =>
      Promise.resolve(texts.map(focusedVector)),
    );
    const results = await ChapterEmbeddingService.queryChapters('rerank-book', QUERY);
    expect(results.map((match) => match.chapter_id)).toContain('c6');
    expect(results.length).toBeLessThanOrEqual(5);
    const encodedTexts = embed.mock.calls.flatMap(([texts]) => texts as string[]);
    expect(encodedTexts.filter((text) => text.includes('依存し始めてる'))).toHaveLength(1);
    expect(embed.mock.calls.every(([texts]) => texts.length <= 8)).toBe(true);
    expect(encodedTexts.length).toBeLessThanOrEqual(96);
  });

  it('无关查询缺乏整块证据时不启动重排，避免短段落的偶然高分制造结果', async () => {
    await seedBook(true);
    const embed = spyOn(EmbeddingService, 'embedBatch').mockResolvedValue([
      new Float32Array([1, 0]),
    ]);
    expect(
      await ChapterEmbeddingService.queryChapters('rerank-book', '数据库事务隔离与死锁恢复'),
    ).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
  });

  it('整句编码只排第十八的相关章仍有机会通过段落证据召回，不提前施加最终质量门槛', async () => {
    await seedBook(false, true);
    spyOn(EmbeddingService, 'embedBatch').mockImplementation((texts) =>
      Promise.resolve(texts.map(focusedVector)),
    );
    const results = await ChapterEmbeddingService.queryChapters(
      'rerank-book',
      '她不想再等到他需要自己才行动',
    );
    expect(results.map((match) => match.chapter_id)).toContain('c6');
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('含明确人物的复合场景保留整块共现证据，不被单个名字的段落抢走排名', async () => {
    await seedBook();
    const raws = [0.7208, 0.7131, 0.7029, 0.68, 0.675, 0.66, 0.7];
    for (const [index, raw] of raws.entries()) {
      await ChapterEmbeddingService.writeChunksForChapter(`c${index}`, 'rerank-book', [
        {
          kind: 'content',
          chunkIndex: 0,
          vector: vector(raw),
          textSnippet: '場面の原文。',
        },
      ]);
    }
    const embed = spyOn(EmbeddingService, 'embedBatch').mockImplementation((texts) =>
      Promise.resolve(
        texts.map(
          (text) => new Float32Array(vector(text === WAITING || text === DECISION ? 0.2 : 0.99)),
        ),
      ),
    );
    const results = await ChapterEmbeddingService.queryChapters(
      'rerank-book',
      '放学后，華奈去隼汰家',
    );
    expect(results.map((match) => match.chapter_id)).toContain('c6');
    expect(embed).not.toHaveBeenCalled();
  });

  it('重排推理失败时保留原排名，不抛错也不制造新命中', async () => {
    await seedBook();
    spyOn(EmbeddingService, 'embedBatch').mockImplementation((texts) =>
      Promise.resolve(texts.map(() => null)),
    );
    const results = await ChapterEmbeddingService.queryChapters('rerank-book', QUERY);
    expect(results.map((match) => match.chapter_id)).not.toContain('c6');
    expect(results[0]?.chapter_id).toBe('c0');
  });

  it('重排等待期间同一输入的向量重算不使正在进行的查询失效', async () => {
    await seedBook();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    spyOn(EmbeddingService, 'embedBatch').mockImplementation(async (texts) => {
      entered.resolve();
      await release.promise;
      return texts.map(focusedVector);
    });
    const pending = ChapterEmbeddingService.queryChapters('rerank-book', QUERY);
    // 先捕获结果，避免红测试中的预期拒绝成为未处理异常。
    const settled = pending.then(
      (results) => ({ results }),
      (error: unknown) => ({ error }),
    );
    await entered.promise;
    const [old] = await ChapterEmbeddingService.getChunksForChapter('c6');
    spyOn(Date, 'now').mockReturnValue(old!.updatedAt + 1);
    await ChapterEmbeddingService.writeChunksForChapter('c6', 'rerank-book', [old!]);
    release.resolve();
    const result = await settled;
    expect('error' in result).toBe(false);
    if ('results' in result)
      expect(result.results.map((match) => match.chapter_id)).toContain('c6');
  });

  for (const change of ['target', 'source', 'target-with-inference-failure'] as const) {
    it(`重排等待期间 ${change} 变化，旧快照不能作为新结果返回`, async () => {
      await seedBook();
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      spyOn(EmbeddingService, 'embedBatch').mockImplementation(async (texts) => {
        entered.resolve();
        await release.promise;
        return texts.map((text) =>
          change === 'target-with-inference-failure' ? null : focusedVector(text),
        );
      });
      const pending = ChapterEmbeddingService.queryChapters('rerank-book', QUERY);
      const verdict = expect(pending).rejects.toMatchObject({
        code: 'CHAPTER_CACHE_REBUILDING',
      }) as unknown as Promise<void>;
      await entered.promise;
      const db = await getDB();
      if (change === 'target' || change === 'target-with-inference-failure') {
        const book = (await db.get('books', 'rerank-book'))!;
        await db.put('books', { ...book, targetLanguage: 'en-US' });
      } else {
        const record = (await db.get('chapter-contents', 'c6'))!;
        const paragraphs = JSON.parse(record.content) as Paragraph[];
        paragraphs[0]!.text = '新しい情景に変わった。';
        await db.put('chapter-contents', { ...record, content: JSON.stringify(paragraphs) });
      }
      release.resolve();
      await verdict;
    });
  }
});
