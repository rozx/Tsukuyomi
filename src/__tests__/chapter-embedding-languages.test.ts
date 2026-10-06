import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import {
  splitChapterIntoChunks,
  buildBookAliasIndex,
  ChapterEmbeddingService,
} from '../services/chapter-embedding-service';
import { EmbeddingService } from '../services/embedding-service';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { FullTextIndexService } from '../services/full-text-index-service';
import { MEMORY_EMBEDDING_VERSION } from '../utils/memory-embedding-lookup';
import { MemoryService } from '../services/memory-service';
import * as dirty from '../utils/chapter-embedding-debouncer';
import { getDB } from '../utils/indexed-db';
import { setNameTranslation } from '../services/localization/selection';
import type { Paragraph, Novel } from '../models/novel';

const paragraph: Paragraph = {
  id: '11111111',
  text: 'Original',
  selectedTranslationId: 'cn',
  translations: [
    { id: 'cn', language: 'zh-CN', translation: 'CN_BODY_SECRET', aiModelId: '' },
    { id: 'en', language: 'en-US', translation: 'English body', aiModelId: '' },
  ],
  selectedTranslations: {
    'zh-CN': { value: 'cn', revision: { counter: 1, actorId: 'a' }, updatedAt: 0 },
    'en-US': { value: 'en', revision: { counter: 1, actorId: 'a' }, updatedAt: 0 },
  },
};
function names(original: string, cn: string, en: string) {
  return setNameTranslation(
    { original, translation: { id: `${original}-cn`, translation: cn, aiModelId: '' } },
    'en-US',
    { id: `${original}-en`, translation: en, aiModelId: '' },
    { counter: 2, actorId: 'a' },
    0,
  );
}
afterEach(() => vi.restoreAllMocks());
describe('章节向量输入语言隔离', () => {
  it('查询向量等待期间标题更新后，结果和排名使用同一新书籍快照', async () => {
    const chapter = translationChapter('c', paragraph.id);
    chapter.title = names('Original title', 'CN_TITLE_SECRET', 'Old English title');
    chapter.content = [structuredClone(paragraph)];
    const { books } = await chapterTranslationFixture([chapter]);
    vi.spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
    vi.spyOn(EmbeddingService, 'embedBatch').mockImplementation((texts) =>
      Promise.resolve(texts.map(() => new Float32Array([1, 0]))),
    );
    await ChapterEmbeddingService.embedChapter('c');
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    vi.spyOn(EmbeddingService, 'embed').mockImplementation(async () => {
      entered.resolve();
      await release.promise;
      return new Float32Array([1, 0]);
    });
    const pending = ChapterEmbeddingService.queryChapters(
      'fixture-book',
      'Fresh English title',
      5,
      'en-US',
    );
    await entered.promise;
    await books.editTitle('fixture-book', 'en-US', {
      kind: 'chapter',
      id: 'c',
      expectedOriginal: 'Original title',
      translation: 'Fresh English title',
    });
    await ChapterEmbeddingService.embedChapter('c');
    release.resolve();
    const result = await pending;
    expect(result[0]!.title).toBe('Fresh English title');
    expect(JSON.stringify(result)).not.toContain('Old English title');
  });

  it('切目标后旧缓存已删空时报告重建，真正空章仍返回空匹配', async () => {
    const chapter = translationChapter('c', paragraph.id);
    chapter.content = [structuredClone(paragraph)];
    const { books } = await chapterTranslationFixture([chapter]);
    vi.spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
    vi.spyOn(EmbeddingService, 'embedBatch').mockImplementation((texts) =>
      Promise.resolve(texts.map(() => new Float32Array([1, 0]))),
    );
    vi.spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));
    await ChapterEmbeddingService.embedChapter('c');
    await books.updateBook('fixture-book', { targetLanguage: 'zh-TW' });
    expect(await ChapterEmbeddingService.getChunksForChapter('c')).toEqual([]);
    await expect(
      ChapterEmbeddingService.queryChapters('fixture-book', 'Original', 5, 'en-US'),
    ).rejects.toMatchObject({ code: 'CHAPTER_CACHE_REBUILDING' });
    const db = await getDB();
    const row = (await db.get('chapter-contents', 'c'))!;
    await db.put('chapter-contents', { ...row, content: '[]' });
    expect(
      await ChapterEmbeddingService.queryChapters('fixture-book', 'Original', 5, 'en-US'),
    ).toEqual([]);
  });

  for (const change of ['target', 'body', 'translation', 'legacy'] as const) {
    it(`后台扫描检测 ${change} 输入失效`, async () => {
      const chapter = translationChapter('c', paragraph.id);
      chapter.content = [structuredClone(paragraph)];
      const { books } = await chapterTranslationFixture([chapter]);
      vi.spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
      vi.spyOn(EmbeddingService, 'embedBatch').mockImplementation((texts) =>
        Promise.resolve(texts.map(() => new Float32Array([1, 0]))),
      );
      await ChapterEmbeddingService.embedChapter('c');
      expect(await ChapterEmbeddingService.findChaptersNeedingEmbedding('fixture-book')).toEqual(
        [],
      );
      const db = await getDB();
      if (change === 'target') await books.updateBook('fixture-book', { targetLanguage: 'zh-TW' });
      if (change === 'body') {
        const row = (await db.get('chapter-contents', 'c'))!;
        const values = JSON.parse(row.content) as Paragraph[];
        values[0]!.text = 'Changed';
        await db.put('chapter-contents', { ...row, content: JSON.stringify(values) });
      }
      if (change === 'legacy') {
        const rows = await ChapterEmbeddingService.getChunksForChapter('c');
        for (const row of rows) {
          delete row.targetLanguage;
          delete row.inputSignature;
          await db.put('chapter-embeddings', row, `c:${row.kind}:${row.chunkIndex}`);
        }
      }
      if (change === 'translation') {
        const row = (await db.get('chapter-contents', 'c'))!;
        const values = JSON.parse(row.content) as Paragraph[];
        values[0]!.translations.find(
          (translation) => translation.language === 'en-US',
        )!.translation = 'Changed translation';
        await db.put('chapter-contents', { ...row, content: JSON.stringify(values) });
      }
      expect(await ChapterEmbeddingService.findChaptersNeedingEmbedding('fixture-book')).toEqual([
        'c',
      ]);
    });
  }
  it('目标设置保存使全文和旧章节缓存失效并后台重建，保留共享记忆', async () => {
    const chapter = translationChapter('c', paragraph.id);
    chapter.content = [structuredClone(paragraph)];
    const { books } = await chapterTranslationFixture([chapter]);
    vi.spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
    vi.spyOn(EmbeddingService, 'embedBatch').mockImplementation((texts) =>
      Promise.resolve(texts.map(() => new Float32Array([1, 0]))),
    );
    await ChapterEmbeddingService.embedChapter('c');
    await FullTextIndexService.buildIndex('fixture-book', books.getBookById('fixture-book')!);
    const db = await getDB();
    const memory = await MemoryService.createMemory('fixture-book', 'Shared story', 'Story');
    await MemoryService.updateMemoryEmbeddingOnly(
      memory.id,
      [[0.25, 0.75]],
      MEMORY_EMBEDDING_VERSION,
    );
    const memoryBefore = await db.get('memories', memory.id);
    const mark = vi.spyOn(dirty, 'markChapterDirty');
    await books.updateBook('fixture-book', { targetLanguage: 'zh-TW' });
    expect(await db.get('full-text-indexes', 'fixture-book')).toBeUndefined();
    expect(await ChapterEmbeddingService.getChunksForChapter('c')).toEqual([]);
    expect(mark).toHaveBeenCalledWith('c');
    expect(await db.get('memories', memory.id)).toEqual(memoryBefore);
    expect(memoryBefore).toMatchObject({
      embeddings: [[0.25, 0.75]],
      embeddingModel: MEMORY_EMBEDDING_VERSION,
    });
  });

  for (const change of ['target', 'body', 'translation', 'delete'] as const) {
    it(`异步嵌入期间 ${change} 变化后旧计算不覆盖新状态`, async () => {
      const chapter = translationChapter('c', paragraph.id);
      chapter.content = [structuredClone(paragraph)];
      const { books } = await chapterTranslationFixture([chapter]);
      vi.spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      let calls = 0;
      vi.spyOn(EmbeddingService, 'embedBatch').mockImplementation(async (texts) => {
        const callNumber = ++calls;
        if (callNumber === 1) {
          entered.resolve();
          await release.promise;
        }
        return texts.map(() => new Float32Array([callNumber, 0]));
      });
      const pending = ChapterEmbeddingService.embedChapter('c');
      await entered.promise;
      const db = await getDB();
      if (change === 'target') await books.updateBook('fixture-book', { targetLanguage: 'zh-TW' });
      if (change === 'body') {
        const record = (await db.get('chapter-contents', 'c'))!;
        const paragraphs = JSON.parse(record.content) as Paragraph[];
        paragraphs[0]!.text = 'New source';
        await db.put('chapter-contents', { ...record, content: JSON.stringify(paragraphs) });
      }
      if (change === 'translation') {
        const record = (await db.get('chapter-contents', 'c'))!;
        const paragraphs = JSON.parse(record.content) as Paragraph[];
        paragraphs[0]!.translations.find(
          (translation) => translation.language === 'en-US',
        )!.translation = 'New translation';
        await db.put('chapter-contents', { ...record, content: JSON.stringify(paragraphs) });
      }
      if (change === 'delete') await books.updateBook('fixture-book', { volumes: [] });
      else await ChapterEmbeddingService.embedChapter('c');
      const fresh = await ChapterEmbeddingService.getChunksForChapter('c');
      release.resolve();
      await pending;
      expect(await ChapterEmbeddingService.getChunksForChapter('c')).toEqual(fresh);
      if (change !== 'delete') expect(fresh).not.toHaveLength(0);
      if (change === 'body') expect(fresh[0]!.textSnippet).toContain('New source');
    });
  }
  it('旧目标查询不借用当前其他语言缓存，返回稳定重建错误', async () => {
    const chapter = translationChapter('c', paragraph.id);
    chapter.content = [structuredClone(paragraph)];
    const { books } = await chapterTranslationFixture([chapter]);
    vi.spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
    vi.spyOn(EmbeddingService, 'embedBatch').mockImplementation((texts) =>
      Promise.resolve(texts.map(() => new Float32Array([1, 0]))),
    );
    vi.spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));
    await books.updateBook('fixture-book', { targetLanguage: 'zh-CN' });
    await ChapterEmbeddingService.embedChapter('c');
    await expect(
      ChapterEmbeddingService.queryChapters('fixture-book', 'Original', 5, 'en-US'),
    ).rejects.toMatchObject({ code: 'CHAPTER_CACHE_REBUILDING' });
  });

  for (const [language, expected] of [
    ['en-US', 'Original\nEnglish body'],
    ['zh-TW', 'Original'],
  ] as const) {
    it(`${language} 语义只原文，预览仅拼接目标选用`, () => {
      const chunk = splitChapterIntoChunks([paragraph], language)[0]!;
      expect(chunk.text).toBe('Original');
      expect(chunk.snippet).toBe(expected);
    });
  }
  for (const language of ['en-US', 'zh-TW'] as const) {
    it(`${language} 别名索引只提供目标译名`, () => {
      const book: Novel = {
        id: 'b',
        title: 'B',
        createdAt: new Date(0),
        lastEdited: new Date(0),
        targetLanguage: 'zh-CN',
        terminologies: [
          {
            id: 't',
            name: 'Original term',
            ...names('Original term', 'CN_TERM_SECRET', 'English term'),
          },
        ],
        characterSettings: [
          {
            id: 'ch',
            sex: undefined,
            name: 'Original character',
            ...names('Original character', 'CN_CHARACTER_SECRET', 'English character'),
            aliases: [
              {
                id: 'alias',
                name: 'Original alias',
                ...names('Original alias', 'CN_ALIAS_SECRET', 'English alias'),
              },
            ],
          },
        ],
      };
      const index = buildBookAliasIndex(book, language);
      const all = [...index.properNouns].join(' ');
      expect(all).not.toMatch(/CN_.*_SECRET/i);
      expect(all).toContain('original alias');
      if (language === 'en-US') expect(all).toContain('english alias');
      else expect(all).not.toContain('english');
    });
  }
  it('正文和标题语义都只用原文，预览使用建书目标', async () => {
    const chapter = translationChapter('c', paragraph.id);
    chapter.content = [structuredClone(paragraph)];
    chapter.title = names('Original title', 'CN_TITLE_SECRET', 'English title');
    await chapterTranslationFixture([chapter]);
    vi.spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
    const embed = vi
      .spyOn(EmbeddingService, 'embedBatch')
      .mockImplementation((texts) => Promise.resolve(texts.map(() => new Float32Array([1, 0]))));
    await ChapterEmbeddingService.embedChapter('c');
    const inputs = embed.mock.calls[0]![0].join('\n');
    expect(inputs).toContain('Original');
    expect(inputs).not.toContain('English body');
    expect(inputs).not.toContain('English title');
    expect(inputs).not.toMatch(/CN_BODY_SECRET|CN_TITLE_SECRET/);
    const rows = await ChapterEmbeddingService.getChunksForChapter('c');
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.targetLanguage === 'en-US' && !!row.inputSignature)).toBe(true);
    expect(rows.find((row) => row.kind === 'content')!.textSnippet).toContain('English body');
    expect(rows.find((row) => row.kind === 'title')!.textSnippet).toContain('English title');
  });
});
