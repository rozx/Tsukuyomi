import './setup';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { ChapterEmbeddingService } from '../services/chapter-embedding-service';
import { EmbeddingService } from '../services/embedding-service';
import * as contentHash from '../utils/content-hash';
import { getDB } from '../utils/indexed-db';

beforeEach(() => vi.stubGlobal('BroadcastChannel', undefined));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function fixture(paragraphCount = 1) {
  const chapter = translationChapter('performance-chapter', '11111111');
  chapter.content = Array.from({ length: paragraphCount }, (_, index) => ({
    id: `p${index}`,
    text: `${index === paragraphCount - 1 ? 'marker-last' : 'scene'} ${'原'.repeat(110)}`,
    translations: [],
    selectedTranslationId: '',
  }));
  const result = await chapterTranslationFixture([chapter]);
  vi.spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
  vi.spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));
  const embed = vi
    .spyOn(EmbeddingService, 'embedBatch')
    .mockImplementation((texts) => Promise.resolve(texts.map(() => new Float32Array([1, 0]))));
  return { ...result, chapter, embed };
}

describe('章节嵌入的批次边界', () => {
  it('长章节按最多八条输入分批，完整保留最后分块和标题向量', async () => {
    const { chapter, embed } = await fixture(25);
    await ChapterEmbeddingService.embedChapter(chapter.id);
    expect(embed.mock.calls.every(([texts]) => texts.length <= 8)).toBe(true);
    const chunks = await ChapterEmbeddingService.getChunksForChapter(chapter.id);
    expect(chunks.filter((chunk) => chunk.kind === 'content')).toHaveLength(25);
    expect(chunks.some((chunk) => chunk.textSnippet.includes('marker-last'))).toBe(true);
    expect(chunks.filter((chunk) => chunk.kind === 'title')).toHaveLength(1);
  });

  it('批次之间暂停不会提交半章，之后可完整重新执行', async () => {
    const { chapter, embed } = await fixture(25);
    let keepRunning = true;
    embed.mockImplementation((texts) => {
      keepRunning = false;
      return Promise.resolve(texts.map(() => new Float32Array([1, 0])));
    });
    const completed = await ChapterEmbeddingService.embedChapter(chapter.id, () =>
      Promise.resolve(keepRunning),
    );
    expect(completed).toBe(false);
    expect(await ChapterEmbeddingService.getChunksForChapter(chapter.id)).toEqual([]);
    await ChapterEmbeddingService.embedChapter(chapter.id);
    expect(await ChapterEmbeddingService.getChunksForChapter(chapter.id)).toHaveLength(26);
  });
});

describe('章节检索快照复用', () => {
  it('未改动的书籍重复查询不重算全书签名，书籍修订后重新校验', async () => {
    const { chapter, books } = await fixture();
    await ChapterEmbeddingService.embedChapter(chapter.id);
    const hash = vi.spyOn(contentHash, 'hashString');
    const first = await ChapterEmbeddingService.queryChapters('fixture-book', 'unmatched query');
    expect(first.map((match) => match.chapter_id)).toEqual([chapter.id]);
    hash.mockClear();
    expect(await ChapterEmbeddingService.queryChapters('fixture-book', 'unmatched query')).toEqual(
      first,
    );
    expect(hash).not.toHaveBeenCalled();
    await books.updateBook('fixture-book', { title: '更新书名' });
    hash.mockClear();
    await ChapterEmbeddingService.queryChapters('fixture-book', 'unmatched query');
    expect(hash).toHaveBeenCalled();
  });

  it('派生向量重写后，查询立即使用新向量而不是缓存中的旧排名', async () => {
    const { chapter, embed } = await fixture();
    await ChapterEmbeddingService.embedChapter(chapter.id);
    expect(
      await ChapterEmbeddingService.queryChapters('fixture-book', 'unmatched query'),
    ).toHaveLength(1);
    embed.mockImplementation((texts) => Promise.resolve(texts.map(() => new Float32Array([0, 1]))));
    await ChapterEmbeddingService.embedChapter(chapter.id);
    expect(await ChapterEmbeddingService.queryChapters('fixture-book', 'unmatched query')).toEqual(
      [],
    );
  });

  it('另一窗口的向量更新通知使本窗口检索快照失效', async () => {
    let receive: ((event: MessageEvent) => void) | undefined;
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        set onmessage(callback: (event: MessageEvent) => void) {
          receive = callback;
        }
        postMessage() {}
        close() {}
      },
    );
    const { chapter } = await fixture();
    await ChapterEmbeddingService.embedChapter(chapter.id);
    expect(
      await ChapterEmbeddingService.queryChapters('fixture-book', 'unmatched query'),
    ).toHaveLength(1);
    expect(receive).toBeDefined();
    const db = await getDB();
    const chunks = await ChapterEmbeddingService.getChunksForChapter(chapter.id);
    for (const chunk of chunks) {
      await db.put(
        'chapter-embeddings',
        { ...chunk, vector: [0, 1] },
        `${chunk.chapterId}:${chunk.kind}:${chunk.chunkIndex}`,
      );
    }
    receive!(new MessageEvent('message', { data: { bookId: 'fixture-book' } }));
    expect(await ChapterEmbeddingService.queryChapters('fixture-book', 'unmatched query')).toEqual(
      [],
    );
  });
});
