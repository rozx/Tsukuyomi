/**
 * Title chunk 嵌入路径测试 — 覆盖 composeTitleChunkInput 和 embedChapter 在不同
 * 章节状态(正常 / 无段落 / 首段空白 / 标题空)下的行为。
 */
import './setup';
import { describe, expect, it, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import {
  ChapterEmbeddingService,
  TITLE_CHUNK_INDEX,
  TITLE_INPUT_MAX_CHARS,
  composeTitleChunkInput,
} from 'src/services/chapter-embedding-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { EmbeddingService } from 'src/services/embedding-service';
import { CHAPTER_MODEL_VERSION } from 'src/services/chapter-embedding-service';
import { useBooksStore } from 'src/stores/books';
import type { Paragraph, Novel } from 'src/models/novel';

function mkPara(id: string, text: string): Paragraph {
  return {
    id,
    text,
    translations: [],
    selectedTranslationId: null,
  } as unknown as Paragraph;
}

function mkBook(bookId: string, chapterId: string, chapterTitle: string): Novel {
  return {
    id: bookId,
    title: 'Test Book',
    author: '',
    coverUrl: '',
    description: '',
    tags: [],
    createdAt: new Date(),
    lastEdited: new Date(),
    volumes: [
      {
        id: 'vol-1',
        title: 'Vol 1',
        chapters: [
          {
            id: chapterId,
            title: chapterTitle,
            paragraphs: [],
            createdAt: new Date(),
            lastEdited: new Date(),
          },
        ],
      },
    ],
  } as unknown as Novel;
}

describe('composeTitleChunkInput', () => {
  it('正常:[章] + 标题 + 双换行 + 首段', () => {
    const input = composeTitleChunkInput('第二王女', [
      mkPara('p1', '夏洛特推开沉重的橡木门,第三次深呼吸。'),
      mkPara('p2', '其它段落'),
    ]);
    expect(input).toBe('[章] 第二王女\n\n夏洛特推开沉重的橡木门,第三次深呼吸。');
  });

  it('章节无段落:返回 null', () => {
    expect(composeTitleChunkInput('标题', [])).toBeNull();
  });

  it('全部段落都是空白:返回 null', () => {
    const input = composeTitleChunkInput('标题', [mkPara('p1', ''), mkPara('p2', '   \n  ')]);
    expect(input).toBeNull();
  });

  it('首段是空白时跳到下一非空段', () => {
    const input = composeTitleChunkInput('标题', [
      mkPara('p1', ''),
      mkPara('p2', '  \n '),
      mkPara('p3', '真正的开头'),
    ]);
    expect(input).toBe('[章] 标题\n\n真正的开头');
  });

  it('标题为空:只用首段,无 [章] 前缀', () => {
    expect(composeTitleChunkInput('', [mkPara('p1', '只有正文')])).toBe('只有正文');
    expect(composeTitleChunkInput('   ', [mkPara('p1', '只有正文')])).toBe('只有正文');
  });

  it('超过 TITLE_INPUT_MAX_CHARS:截断到上限', () => {
    const longBody = 'あ'.repeat(500);
    const input = composeTitleChunkInput('题', [mkPara('p1', longBody)]);
    expect(input?.length).toBe(TITLE_INPUT_MAX_CHARS);
    expect(input?.startsWith('[章] 题\n\nあ')).toBe(true);
  });
});

async function clearChapterEmbeddingsStore(): Promise<void> {
  const { getDB } = await import('src/utils/indexed-db');
  const db = await getDB();
  const tx = db.transaction('chapter-embeddings', 'readwrite');
  await tx.store.clear();
  await tx.done;
}

describe('ChapterEmbeddingService.embedChapter — title chunk 集成', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    await clearChapterEmbeddingsStore();
  });

  afterEach(async () => {
    mock.restore();
    await clearChapterEmbeddingsStore();
  });

  /** 装一本只有一个章节的假书,塞 books store */
  function seedBook(chapterTitle: string): { bookId: string; chapterId: string } {
    const bookId = 'book-A';
    const chapterId = 'ch-1';
    const store = useBooksStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (store as any).books = [mkBook(bookId, chapterId, chapterTitle)];
    return { bookId, chapterId };
  }

  it('正常嵌入:同一章节同时写入 content + title chunk', async () => {
    const { chapterId } = seedBook('第二王女');
    spyOn(ChapterContentService, 'loadChapterContent').mockResolvedValue([
      mkPara('p1', '夏洛特推开沉重的橡木门,深呼吸。'),
      mkPara('p2', '“殿下,该出发了。”'),
    ]);
    spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
    const embedSpy = spyOn(EmbeddingService, 'embedBatch').mockImplementation((inputs: string[]) =>
      Promise.resolve(inputs.map((_, i) => new Float32Array([0.1 + i * 0.01]))),
    );

    await ChapterEmbeddingService.embedChapter(chapterId);

    // 一次性 embedBatch,inputs 里末尾就是 title input
    expect(embedSpy).toHaveBeenCalledTimes(1);
    const inputsArg = embedSpy.mock.calls[0]?.[0] as string[];
    expect(inputsArg.at(-1)).toBe('[章] 第二王女\n\n夏洛特推开沉重的橡木门,深呼吸。');

    const chunks = await ChapterEmbeddingService.getChunksForChapter(chapterId);
    const kinds = chunks.map((c) => c.kind).sort();
    expect(kinds).toContain('title');
    expect(kinds).toContain('content');
    const titleChunk = chunks.find((c) => c.kind === 'title');
    expect(titleChunk?.chunkIndex).toBe(TITLE_CHUNK_INDEX);
    expect(titleChunk?.model).toBe(CHAPTER_MODEL_VERSION);
    expect(titleChunk?.textSnippet.startsWith('[章] 第二王女')).toBe(true);
  });

  it('章节无段落:既不写 content 也不写 title,清空残留', async () => {
    const { chapterId } = seedBook('某章');
    spyOn(ChapterContentService, 'loadChapterContent').mockResolvedValue([]);
    spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
    const embedSpy = spyOn(EmbeddingService, 'embedBatch');

    await ChapterEmbeddingService.embedChapter(chapterId);

    expect(embedSpy).not.toHaveBeenCalled();
    const chunks = await ChapterEmbeddingService.getChunksForChapter(chapterId);
    expect(chunks).toHaveLength(0);
  });

  it('段落全空白:既不写 content 也不写 title', async () => {
    const { chapterId } = seedBook('某章');
    spyOn(ChapterContentService, 'loadChapterContent').mockResolvedValue([
      mkPara('p1', ''),
      mkPara('p2', '   '),
    ]);
    spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
    const embedSpy = spyOn(EmbeddingService, 'embedBatch');

    await ChapterEmbeddingService.embedChapter(chapterId);

    expect(embedSpy).not.toHaveBeenCalled();
    const chunks = await ChapterEmbeddingService.getChunksForChapter(chapterId);
    expect(chunks).toHaveLength(0);
  });

  it('标题为空但首段有内容:title chunk 仍写入(嵌入输入只是首段)', async () => {
    const { chapterId } = seedBook('');
    spyOn(ChapterContentService, 'loadChapterContent').mockResolvedValue([
      mkPara('p1', '没有标题但有内容'),
    ]);
    spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
    const embedSpy = spyOn(EmbeddingService, 'embedBatch').mockImplementation((inputs: string[]) =>
      Promise.resolve(inputs.map(() => new Float32Array([0.5]))),
    );

    await ChapterEmbeddingService.embedChapter(chapterId);

    const inputsArg = embedSpy.mock.calls[0]?.[0] as string[];
    expect(inputsArg.at(-1)).toBe('没有标题但有内容');

    const chunks = await ChapterEmbeddingService.getChunksForChapter(chapterId);
    const titleChunk = chunks.find((c) => c.kind === 'title');
    expect(titleChunk).toBeDefined();
    expect(titleChunk?.textSnippet).toBe('没有标题但有内容');
  });

  it('writeChunksForChapter:只写 title 不会误删已有 content', async () => {
    const bookId = 'book-A';
    const chapterId = 'ch-X';

    // 先种入两条 content chunk
    await ChapterEmbeddingService.writeChunksForChapter(chapterId, bookId, [
      { kind: 'content', chunkIndex: 0, vector: [0.1], textSnippet: 'c0' },
      { kind: 'content', chunkIndex: 1, vector: [0.2], textSnippet: 'c1' },
    ]);

    // 再单独写 title,不应清除 content
    await ChapterEmbeddingService.writeChunksForChapter(chapterId, bookId, [
      { kind: 'title', chunkIndex: TITLE_CHUNK_INDEX, vector: [0.3], textSnippet: 't' },
    ]);

    const chunks = await ChapterEmbeddingService.getChunksForChapter(chapterId);
    expect(chunks).toHaveLength(3);
    expect(chunks.filter((c) => c.kind === 'content')).toHaveLength(2);
    expect(chunks.filter((c) => c.kind === 'title')).toHaveLength(1);
  });
});
