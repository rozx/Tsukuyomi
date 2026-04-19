import './setup';
import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import {
  ChapterEmbeddingService,
  splitChapterIntoChunks,
  CHUNK_TARGET_CHARS,
  PREVIEW_CHARS,
} from 'src/services/chapter-embedding-service';
import { EmbeddingService, MODEL_VERSION } from 'src/services/embedding-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import * as BooksStoreModule from 'src/stores/books';
import type { Paragraph, Novel } from 'src/models/novel';
import { getDB } from 'src/utils/indexed-db';

function makeParagraph(
  id: string,
  text: string,
  translationText?: string,
): Paragraph {
  if (!translationText) {
    return { id, text, selectedTranslationId: '', translations: [] };
  }
  const tid = `t-${id}`;
  return {
    id,
    text,
    selectedTranslationId: tid,
    translations: [
      { id: tid, translation: translationText, aiModelId: 'model-1' },
    ],
  };
}

/** 构造一个最小 books store mock 对象,仅含 embedChapter/queryChapters/findChaptersNeedingEmbedding 读到的字段 */
function mockBooksStoreWith(book?: Novel) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fakeStore: any = {
    books: book ? [book] : [],
    getBookById: (id: string) => (book && book.id === id ? book : undefined),
  };
  spyOn(BooksStoreModule, 'useBooksStore').mockReturnValue(fakeStore);
}

/**
 * 显式清空 chapter-embeddings store。
 * setup.ts 的 resetDbForTests 在跨文件运行时会因 fake-indexeddb 时序问题残留数据,
 * 显式清理更稳妥。
 */
async function clearChapterEmbeddingsStore(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('chapter-embeddings', 'readwrite');
  await tx.store.clear();
  await tx.done;
}

describe('ChapterEmbeddingService.splitChapterIntoChunks', () => {
  test('小章节合并为单个 chunk', () => {
    const paragraphs = [
      makeParagraph('p1', '第一段原文', '第一段译文'),
      makeParagraph('p2', '第二段原文', '第二段译文'),
    ];
    const chunks = splitChapterIntoChunks(paragraphs);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.chunkIndex).toBe(0);
    expect(chunks[0]!.text).toContain('第一段原文');
    expect(chunks[0]!.text).toContain('第一段译文');
    expect(chunks[0]!.text).toContain('第二段原文');
    expect(chunks[0]!.text).toContain('第二段译文');
    expect(chunks[0]!.snippet.length).toBeLessThanOrEqual(PREVIEW_CHARS);
  });

  test('空段落被跳过且不创建空 chunk', () => {
    const paragraphs = [
      makeParagraph('p1', '有内容', '译文'),
      makeParagraph('p2', '', ''),
      makeParagraph('p3', '   ', '   '),
      makeParagraph('p4', '再有内容', '译文'),
    ];
    const chunks = splitChapterIntoChunks(paragraphs);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toContain('有内容');
    expect(chunks[0]!.text).toContain('再有内容');
  });

  test('累计字符超过目标时切新 chunk,不破段落', () => {
    const longText = 'あ'.repeat(600);
    const paragraphs = [
      makeParagraph('p1', longText),
      makeParagraph('p2', longText),
      makeParagraph('p3', longText),
    ];
    const chunks = splitChapterIntoChunks(paragraphs);

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]!.text).toContain(longText);
    const joined = chunks.map((c) => c.text).join('\n');
    const occurrences = joined.split(longText).length - 1;
    expect(occurrences).toBe(3);
  });

  test('单段超长(> CHUNK_TARGET_CHARS)独占一个 chunk', () => {
    const huge = 'か'.repeat(CHUNK_TARGET_CHARS + 100);
    const paragraphs = [
      makeParagraph('p1', '短段', '短译'),
      makeParagraph('p2', huge),
    ];
    const chunks = splitChapterIntoChunks(paragraphs);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.text).toContain('短段');
    expect(chunks[1]!.text).toBe(huge);
  });

  test('无译文段落仅用原文', () => {
    const paragraphs = [makeParagraph('p1', '原文-only')];
    const chunks = splitChapterIntoChunks(paragraphs);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe('原文-only');
  });

  test('有译文段落按 "原文\\n译文" 拼接', () => {
    const paragraphs = [makeParagraph('p1', '原文', '译文')];
    const chunks = splitChapterIntoChunks(paragraphs);

    expect(chunks[0]!.text).toBe('原文\n译文');
  });

  test('chunkIndex 从 0 递增', () => {
    const longText = 'あ'.repeat(800);
    const paragraphs = Array.from({ length: 5 }, (_, i) =>
      makeParagraph(`p${i}`, longText),
    );
    const chunks = splitChapterIntoChunks(paragraphs);

    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i]!.chunkIndex).toBe(i);
    }
  });
});

describe('ChapterEmbeddingService.writeChunksForChapter + getChunksForChapter', () => {
  beforeEach(async () => {
    await clearChapterEmbeddingsStore();
  });

  afterEach(() => {
    mock.restore();
  });

  test('写入后能按 chapterId 读回,chunkIndex 升序', async () => {
    await ChapterEmbeddingService.writeChunksForChapter('ch-1', 'book-1', [
      { chunkIndex: 1, vector: [0.2], textSnippet: 'b' },
      { chunkIndex: 0, vector: [0.1], textSnippet: 'a' },
      { chunkIndex: 2, vector: [0.3], textSnippet: 'c' },
    ]);

    const chunks = await ChapterEmbeddingService.getChunksForChapter('ch-1');
    expect(chunks).toHaveLength(3);
    expect(chunks[0]!.chunkIndex).toBe(0);
    expect(chunks[1]!.chunkIndex).toBe(1);
    expect(chunks[2]!.chunkIndex).toBe(2);
    expect(chunks[0]!.textSnippet).toBe('a');
    expect(chunks[0]!.model).toBe(MODEL_VERSION);
    expect(chunks[0]!.bookId).toBe('book-1');
  });

  test('二次写入会原子替换(旧 chunk 被清除)', async () => {
    await ChapterEmbeddingService.writeChunksForChapter('ch-1', 'book-1', [
      { chunkIndex: 0, vector: [0.1], textSnippet: 'old-a' },
      { chunkIndex: 1, vector: [0.2], textSnippet: 'old-b' },
      { chunkIndex: 2, vector: [0.3], textSnippet: 'old-c' },
    ]);

    await ChapterEmbeddingService.writeChunksForChapter('ch-1', 'book-1', [
      { chunkIndex: 0, vector: [0.9], textSnippet: 'new-a' },
    ]);

    const chunks = await ChapterEmbeddingService.getChunksForChapter('ch-1');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.textSnippet).toBe('new-a');
  });

  test('deleteChunksForChapter 清空指定章节', async () => {
    await ChapterEmbeddingService.writeChunksForChapter('ch-1', 'book-1', [
      { chunkIndex: 0, vector: [0.1], textSnippet: 'a' },
    ]);
    await ChapterEmbeddingService.writeChunksForChapter('ch-2', 'book-1', [
      { chunkIndex: 0, vector: [0.2], textSnippet: 'b' },
    ]);

    await ChapterEmbeddingService.deleteChunksForChapter('ch-1');

    expect(await ChapterEmbeddingService.getChunksForChapter('ch-1')).toHaveLength(0);
    expect(await ChapterEmbeddingService.getChunksForChapter('ch-2')).toHaveLength(1);
  });

  test('getChunksForBook 返回整本书的 chunk', async () => {
    await ChapterEmbeddingService.writeChunksForChapter('ch-1', 'book-1', [
      { chunkIndex: 0, vector: [0.1], textSnippet: 'a' },
    ]);
    await ChapterEmbeddingService.writeChunksForChapter('ch-2', 'book-1', [
      { chunkIndex: 0, vector: [0.2], textSnippet: 'b' },
    ]);
    await ChapterEmbeddingService.writeChunksForChapter('ch-3', 'book-2', [
      { chunkIndex: 0, vector: [0.3], textSnippet: 'c' },
    ]);

    const book1 = await ChapterEmbeddingService.getChunksForBook('book-1');
    expect(book1).toHaveLength(2);
    const ids = book1.map((c) => c.chapterId).sort();
    expect(ids).toEqual(['ch-1', 'ch-2']);
  });
});

describe('ChapterEmbeddingService.embedChapter', () => {
  beforeEach(async () => {
    await clearChapterEmbeddingsStore();
    spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
  });

  afterEach(() => {
    mock.restore();
  });

  test('章节不存在于 store 时清空已有 chunks', async () => {
    await ChapterEmbeddingService.writeChunksForChapter('orphan', 'book-X', [
      { chunkIndex: 0, vector: [0.5], textSnippet: 'stale' },
    ]);
    expect(await ChapterEmbeddingService.getChunksForChapter('orphan')).toHaveLength(1);

    mockBooksStoreWith(undefined);

    await ChapterEmbeddingService.embedChapter('orphan');

    expect(await ChapterEmbeddingService.getChunksForChapter('orphan')).toHaveLength(0);
  });

  test('段落为空时清空已有 chunks,不调用 embedBatch', async () => {
    await ChapterEmbeddingService.writeChunksForChapter('ch-empty', 'book-1', [
      { chunkIndex: 0, vector: [0.5], textSnippet: 'stale' },
    ]);

    const book: Novel = {
      id: 'book-1',
      title: 'T',
      lastEdited: new Date(),
      createdAt: new Date(),
      volumes: [
        {
          id: 'v1',
          title: 'V',
          chapters: [
            {
              id: 'ch-empty',
              title: 'C',
              lastEdited: new Date(),
              createdAt: new Date(),
            },
          ],
        },
      ],
    };
    mockBooksStoreWith(book);

    spyOn(ChapterContentService, 'loadChapterContent').mockResolvedValue([]);
    const embedSpy = spyOn(EmbeddingService, 'embedBatch').mockResolvedValue([]);

    await ChapterEmbeddingService.embedChapter('ch-empty');

    expect(embedSpy).not.toHaveBeenCalled();
    expect(await ChapterEmbeddingService.getChunksForChapter('ch-empty')).toHaveLength(0);
  });

  test('EmbeddingService 未就绪时抛错,不写入', async () => {
    (EmbeddingService.isReady as unknown as { mockReturnValue: (v: boolean) => void }).mockReturnValue(false);
    const book: Novel = {
      id: 'book-1',
      title: 'T',
      lastEdited: new Date(),
      createdAt: new Date(),
      volumes: [
        {
          id: 'v1',
          title: 'V',
          chapters: [
            {
              id: 'ch-1',
              title: 'C',
              lastEdited: new Date(),
              createdAt: new Date(),
            },
          ],
        },
      ],
    };
    mockBooksStoreWith(book);
    spyOn(ChapterContentService, 'loadChapterContent').mockResolvedValue([
      makeParagraph('p1', '原文', '译文'),
    ]);

    await (expect(ChapterEmbeddingService.embedChapter('ch-1')).rejects.toThrow(
      /未就绪/,
    ) as unknown as Promise<void>);
    expect(await ChapterEmbeddingService.getChunksForChapter('ch-1')).toHaveLength(0);
  });

  test('正常流程:切 chunk → embedBatch → 写入 store', async () => {
    const book: Novel = {
      id: 'book-1',
      title: 'T',
      lastEdited: new Date(),
      createdAt: new Date(),
      volumes: [
        {
          id: 'v1',
          title: 'V',
          chapters: [
            {
              id: 'ch-1',
              title: 'C',
              lastEdited: new Date(),
              createdAt: new Date(),
            },
          ],
        },
      ],
    };
    mockBooksStoreWith(book);
    spyOn(ChapterContentService, 'loadChapterContent').mockResolvedValue([
      makeParagraph('p1', '原文1', '译文1'),
      makeParagraph('p2', '原文2', '译文2'),
    ]);
    const embedSpy = spyOn(EmbeddingService, 'embedBatch').mockResolvedValue([
      new Float32Array([0.1, 0.2]),
    ]);

    await ChapterEmbeddingService.embedChapter('ch-1');

    expect(embedSpy).toHaveBeenCalledTimes(1);
    const chunks = await ChapterEmbeddingService.getChunksForChapter('ch-1');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.bookId).toBe('book-1');
    expect(chunks[0]!.vector).toHaveLength(2);
    expect(chunks[0]!.vector[0]).toBeCloseTo(0.1, 5);
    expect(chunks[0]!.vector[1]).toBeCloseTo(0.2, 5);
    expect(chunks[0]!.model).toBe(MODEL_VERSION);
  });
});

describe('ChapterEmbeddingService.queryChapters', () => {
  beforeEach(async () => {
    await clearChapterEmbeddingsStore();
    spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
  });

  afterEach(() => {
    mock.restore();
  });

  test('无 chunk 时返回空数组', async () => {
    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));
    mockBooksStoreWith(undefined);

    const result = await ChapterEmbeddingService.queryChapters('book-empty', 'query');
    expect(result).toEqual([]);
  });

  test('空 query 抛错', async () => {
    await (expect(
      ChapterEmbeddingService.queryChapters('book-1', ''),
    ).rejects.toThrow() as unknown as Promise<void>);
    await (expect(
      ChapterEmbeddingService.queryChapters('book-1', '   '),
    ).rejects.toThrow() as unknown as Promise<void>);
  });

  test('EmbeddingService 未就绪时抛错', async () => {
    (EmbeddingService.isReady as unknown as { mockReturnValue: (v: boolean) => void }).mockReturnValue(false);
    await (expect(ChapterEmbeddingService.queryChapters('book-1', 'q')).rejects.toThrow(
      /未就绪/,
    ) as unknown as Promise<void>);
  });

  test('按 chapterId 取 chunk max 聚合,排序取 top N', async () => {
    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1, 0]));

    const book: Novel = {
      id: 'book-1',
      title: 'T',
      lastEdited: new Date(),
      createdAt: new Date(),
      volumes: [
        {
          id: 'v1',
          title: 'V',
          chapters: [
            { id: 'ch-A', title: 'A', lastEdited: new Date(), createdAt: new Date() },
            { id: 'ch-B', title: 'B', lastEdited: new Date(), createdAt: new Date() },
            { id: 'ch-C', title: 'C', lastEdited: new Date(), createdAt: new Date() },
          ],
        },
      ],
    };
    mockBooksStoreWith(book);

    await ChapterEmbeddingService.writeChunksForChapter('ch-A', 'book-1', [
      { chunkIndex: 0, vector: [0.3, 1], textSnippet: 'A-0 (low)' },
      { chunkIndex: 1, vector: [0.9, 1], textSnippet: 'A-1 (high)' },
    ]);
    await ChapterEmbeddingService.writeChunksForChapter('ch-B', 'book-1', [
      { chunkIndex: 0, vector: [0.5, 1], textSnippet: 'B-0' },
    ]);
    await ChapterEmbeddingService.writeChunksForChapter('ch-C', 'book-1', [
      { chunkIndex: 0, vector: [0.1, 1], textSnippet: 'C-0' },
    ]);

    const result = await ChapterEmbeddingService.queryChapters('book-1', 'q', 2);

    expect(result).toHaveLength(2);
    expect(result[0]!.chapter_id).toBe('ch-A');
    expect(result[0]!.title).toBe('A');
    expect(result[0]!.preview).toBe('A-1 (high)');
    expect(result[1]!.chapter_id).toBe('ch-B');
    expect(result[0]!.score).toBeGreaterThan(result[1]!.score);
  });

  test('limit 默认为 5, 超出数量时截断', async () => {
    spyOn(EmbeddingService, 'embed').mockResolvedValue(new Float32Array([1]));
    const chapters = Array.from({ length: 8 }, (_, i) => ({
      id: `ch-${i}`,
      title: `C${i}`,
      lastEdited: new Date(),
      createdAt: new Date(),
    }));
    const book: Novel = {
      id: 'book-1',
      title: 'T',
      lastEdited: new Date(),
      createdAt: new Date(),
      volumes: [{ id: 'v1', title: 'V', chapters }],
    };
    mockBooksStoreWith(book);
    for (let i = 0; i < 8; i++) {
      await ChapterEmbeddingService.writeChunksForChapter(`ch-${i}`, 'book-1', [
        { chunkIndex: 0, vector: [1], textSnippet: `snippet-${i}` },
      ]);
    }

    const result = await ChapterEmbeddingService.queryChapters('book-1', 'q');
    expect(result).toHaveLength(5);
  });
});

describe('ChapterEmbeddingService.findChaptersNeedingEmbedding', () => {
  beforeEach(async () => {
    await clearChapterEmbeddingsStore();
  });

  afterEach(async () => {
    mock.restore();
    await clearChapterEmbeddingsStore();
  });

  test('无 chunk 的章节被视为需要嵌入', async () => {
    const book: Novel = {
      id: 'book-1',
      title: 'T',
      lastEdited: new Date(),
      createdAt: new Date(),
      volumes: [
        {
          id: 'v1',
          title: 'V',
          chapters: [
            { id: 'ch-1', title: 'A', lastEdited: new Date(), createdAt: new Date() },
            { id: 'ch-2', title: 'B', lastEdited: new Date(), createdAt: new Date() },
          ],
        },
      ],
    };
    mockBooksStoreWith(book);

    const result = await ChapterEmbeddingService.findChaptersNeedingEmbedding('book-1');
    expect(result.sort()).toEqual(['ch-1', 'ch-2']);
  });

  test('有 chunk 但模型版本过期的章节被标记需要重算', async () => {
    const book: Novel = {
      id: 'book-1',
      title: 'T',
      lastEdited: new Date(),
      createdAt: new Date(),
      volumes: [
        {
          id: 'v1',
          title: 'V',
          chapters: [
            { id: 'ch-current', title: 'A', lastEdited: new Date(), createdAt: new Date() },
            { id: 'ch-stale', title: 'B', lastEdited: new Date(), createdAt: new Date() },
          ],
        },
      ],
    };
    mockBooksStoreWith(book);

    await ChapterEmbeddingService.writeChunksForChapter('ch-current', 'book-1', [
      { chunkIndex: 0, vector: [0.1], textSnippet: 's' },
    ]);
    const db = await getDB();
    const tx = db.transaction('chapter-embeddings', 'readwrite');
    await tx.store.put(
      {
        chapterId: 'ch-stale',
        bookId: 'book-1',
        chunkIndex: 0,
        vector: [0.2],
        textSnippet: 'stale',
        model: 'old-model@128',
        updatedAt: Date.now(),
      },
      'ch-stale:0',
    );
    await tx.done;

    const result = await ChapterEmbeddingService.findChaptersNeedingEmbedding('book-1');
    expect(result).toEqual(['ch-stale']);
  });
});
