import { describe, expect, it, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import './setup';
import { BookService } from '../services/book-service';
import type { Novel, Volume, Chapter, Paragraph } from '../models/novel';
import { ChapterContentService } from '../services/chapter-content-service';
import { generateShortId } from '../utils/id-generator';
import { getDB } from '../utils/indexed-db';
import * as debouncer from '../utils/chapter-embedding-debouncer';
import { vi } from 'vitest';

async function readSavedContent(id: string): Promise<Paragraph[] | undefined> {
  const record = await (await getDB()).get('chapter-contents', id);
  return record ? (JSON.parse(record.content) as Paragraph[]) : undefined;
}

async function countSavedContent(): Promise<number> {
  return (await getDB()).count('chapter-contents');
}

describe('BookService', () => {
  beforeEach(() => {
    ChapterContentService.clearAllCache();
    spyOn(debouncer, 'markChapterDirty').mockImplementation(() => undefined);
  });

  afterEach(() => {
    mock.restore();
  });

  it('读取旧 Date 字段时保留日期，不能把形似日期的书名或内嵌正文转换成 Date', async () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    const text = '2026-01-01T00:00:00.000Z 之后的故事';
    await (
      await getDB()
    ).put('books', {
      id: 'legacy-date',
      title: text,
      createdAt: date,
      lastEdited: date,
      volumes: [
        {
          id: 'v',
          title: text,
          chapters: [
            {
              id: 'c',
              title: text,
              createdAt: date,
              lastEdited: date,
              content: [{ id: 'p', text, translations: [], selectedTranslationId: '' }],
            },
          ],
        },
      ],
    });
    const loaded = await BookService.getBookById('legacy-date');
    expect(loaded?.createdAt).toEqual(date);
    expect(loaded?.title).toBe(text);
    expect(loaded?.volumes?.[0]?.chapters?.[0]?.content?.[0]?.text).toBe(text);
  });

  it('should get all books', async () => {
    const books = await BookService.getAllBooks();
    expect(books).toEqual([]);
  });

  it('should get a book by id', async () => {
    const mockBook = { id: '1', title: 'Test' };

    await BookService.saveBook(mockBook as Novel, { saveChapterContent: false });

    const book = await BookService.getBookById('1');
    expect(book).toEqual(mockBook as Novel);
  });

  it('should save a book', async () => {
    const book = { id: '1', title: 'Test', createdAt: new Date() } as Novel;
    await BookService.saveBook(book);
    const savedBook = await BookService.getBookById('1');
    expect(savedBook).toBeTruthy();
  });

  it('should bulk save books', async () => {
    const books = [
      { id: '1', title: 'Book 1' },
      { id: '2', title: 'Book 2' },
    ] as Novel[];

    await BookService.bulkSaveBooks(books);
    const savedBooks = await BookService.getAllBooks();
    expect(savedBooks).toHaveLength(2);
  });

  it('should delete a book', async () => {
    await BookService.deleteBook('1');
    const book = await BookService.getBookById('1');
    expect(book).toBeUndefined();
  });

  it('should clear all books', async () => {
    await BookService.clearBooks();
    const books = await BookService.getAllBooks();
    expect(books).toHaveLength(0);
  });

  describe('saveBook with saveChapterContent option', () => {
    // 辅助函数：创建测试用段落
    function createTestParagraph(id?: string): Paragraph {
      return {
        id: id || generateShortId(),
        text: '测试段落文本',
        selectedTranslationId: generateShortId(),
        translations: [
          {
            id: generateShortId(),
            translation: '测试翻译',
            aiModelId: 'model-1',
          },
        ],
      };
    }

    // 辅助函数：创建测试用章节
    function createTestChapter(id: string, content: Paragraph[]): Chapter {
      return {
        id,
        title: {
          original: 'Chapter 1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        content,
        lastEdited: new Date(),
        createdAt: new Date(),
      };
    }

    // 辅助函数：创建测试用卷
    function createTestVolume(id: string, chapters: Chapter[]): Volume {
      return {
        id,
        title: {
          original: 'Volume 1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        chapters,
      };
    }

    it('should save chapter content by default', async () => {
      const chapter1 = createTestChapter('chapter-1', [createTestParagraph()]);
      const chapter2 = createTestChapter('chapter-2', [createTestParagraph()]);
      const volume = createTestVolume('volume-1', [chapter1, chapter2]);
      const book: Novel = {
        id: 'book-1',
        title: 'Test Book',
        volumes: [volume],
        lastEdited: new Date(),
        createdAt: new Date(),
      };

      await BookService.saveBook(book);

      // 应该保存两个章节的内容
      expect(await countSavedContent()).toBe(2);
      expect(await readSavedContent('chapter-1')).toEqual(chapter1.content);
      expect(await readSavedContent('chapter-2')).toEqual(chapter2.content);
      // 应该保存书籍元数据
      const saved = await BookService.getBookById('book-1');
      expect(saved).toBeTruthy();
    });

    it('should save chapter content when saveChapterContent is true', async () => {
      const chapter1 = createTestChapter('chapter-1', [createTestParagraph()]);
      const chapter2 = createTestChapter('chapter-2', [createTestParagraph()]);
      const volume = createTestVolume('volume-1', [chapter1, chapter2]);
      const book: Novel = {
        id: 'book-1',
        title: 'Test Book',
        volumes: [volume],
        lastEdited: new Date(),
        createdAt: new Date(),
      };

      await BookService.saveBook(book, { saveChapterContent: true });

      // 应该保存两个章节的内容
      expect(await countSavedContent()).toBe(2);
      expect(await readSavedContent('chapter-1')).toEqual(chapter1.content);
      expect(await readSavedContent('chapter-2')).toEqual(chapter2.content);
      // 应该保存书籍元数据
      const saved = await BookService.getBookById('book-1');
      expect(saved).toBeTruthy();
    });

    it('should not save chapter content when saveChapterContent is false', async () => {
      const chapter1 = createTestChapter('chapter-1', [createTestParagraph()]);
      const chapter2 = createTestChapter('chapter-2', [createTestParagraph()]);
      const volume = createTestVolume('volume-1', [chapter1, chapter2]);
      const book: Novel = {
        id: 'book-1',
        title: 'Test Book',
        volumes: [volume],
        lastEdited: new Date(),
        createdAt: new Date(),
      };

      await BookService.saveBook(book, { saveChapterContent: false });

      // 不应该保存章节内容
      expect(await countSavedContent()).toBe(0);
      // 应该保存书籍元数据
      const saved = await BookService.getBookById('book-1');
      expect(saved).toBeTruthy();
    });

    it('should skip empty chapter content arrays', async () => {
      const chapter1 = createTestChapter('chapter-1', [createTestParagraph()]);
      const chapter2 = createTestChapter('chapter-2', []); // 空内容
      const chapter3 = createTestChapter('chapter-3', [createTestParagraph()]);
      const volume = createTestVolume('volume-1', [chapter1, chapter2, chapter3]);
      const book: Novel = {
        id: 'book-1',
        title: 'Test Book',
        volumes: [volume],
        lastEdited: new Date(),
        createdAt: new Date(),
      };

      await BookService.saveBook(book);

      // 应该只保存有内容的章节（chapter-1 和 chapter-3）
      expect(await countSavedContent()).toBe(2);
      expect(await readSavedContent('chapter-1')).toEqual(chapter1.content);
      expect(await readSavedContent('chapter-3')).toEqual(chapter3.content);
      expect(await readSavedContent('chapter-2')).toBeUndefined();
    });

    it('should handle books without volumes', async () => {
      const book: Novel = {
        id: 'book-1',
        title: 'Test Book',
        lastEdited: new Date(),
        createdAt: new Date(),
      };

      await BookService.saveBook(book, { saveChapterContent: true });

      // 不应该保存章节内容（因为没有章节）
      expect(await countSavedContent()).toBe(0);
      const saved = await BookService.getBookById('book-1');
      expect(saved).toBeTruthy();
    });

    it('should handle volumes without chapters', async () => {
      const volume = createTestVolume('volume-1', []);
      const book: Novel = {
        id: 'book-1',
        title: 'Test Book',
        volumes: [volume],
        lastEdited: new Date(),
        createdAt: new Date(),
      };

      await BookService.saveBook(book, { saveChapterContent: true });

      // 不应该保存章节内容（因为没有章节）
      expect(await countSavedContent()).toBe(0);
      const saved = await BookService.getBookById('book-1');
      expect(saved).toBeTruthy();
    });

    it('should handle multiple volumes with chapters', async () => {
      const chapter1 = createTestChapter('chapter-1', [createTestParagraph()]);
      const chapter2 = createTestChapter('chapter-2', [createTestParagraph()]);
      const volume1 = createTestVolume('volume-1', [chapter1]);
      const volume2 = createTestVolume('volume-2', [chapter2]);
      const book: Novel = {
        id: 'book-1',
        title: 'Test Book',
        volumes: [volume1, volume2],
        lastEdited: new Date(),
        createdAt: new Date(),
      };

      await BookService.saveBook(book);

      // 应该保存所有章节的内容
      expect(await countSavedContent()).toBe(2);
      expect(await readSavedContent('chapter-1')).toEqual(chapter1.content);
      expect(await readSavedContent('chapter-2')).toEqual(chapter2.content);
    });

    it('should bulk save chapter content with skipIfUnchanged to avoid spurious re-embedding', async () => {
      // 回归测试：bulkSaveBooks 是同步路径（applyPartialNovelEntry → bulkAddBooks）
      // 的最终落盘点。实际未变的内容必须跳过写入和 markChapterDirty，
      // 避免同步使整本书重新计算嵌入。
      // 该 bug 的表现：同一份内容在多设备来回同步后仍然反复重算章节 embedding。
      const chapter1 = createTestChapter('chapter-1', [createTestParagraph()]);
      const chapter2 = createTestChapter('chapter-2', [createTestParagraph()]);
      const volume1 = createTestVolume('volume-1', [chapter1]);
      const volume2 = createTestVolume('volume-2', [chapter2]);
      const book1: Novel = {
        id: 'book-1',
        title: 'Test Book 1',
        volumes: [volume1],
        lastEdited: new Date(),
        createdAt: new Date(),
      };
      const book2: Novel = {
        id: 'book-2',
        title: 'Test Book 2',
        volumes: [volume2],
        lastEdited: new Date(),
        createdAt: new Date(),
      };

      await BookService.bulkSaveBooks([book1, book2]);

      expect(await countSavedContent()).toBe(2);
      expect(await readSavedContent('chapter-1')).toEqual(chapter1.content);
      expect(await readSavedContent('chapter-2')).toEqual(chapter2.content);
      const records = await (await getDB()).getAll('chapter-contents');
      vi.clearAllMocks();
      await BookService.bulkSaveBooks([book1, book2]);
      expect(await (await getDB()).getAll('chapter-contents')).toEqual(records);
      expect(debouncer.markChapterDirty).not.toHaveBeenCalled();
    });

    it('should strip legacy summary residue when saving', async () => {
      // 老数据里可能残留 summary 字段,新版不再使用,保存时应被 strip
      const chapterWithLegacySummary: Chapter = {
        ...createTestChapter('chapter-1', [createTestParagraph()]),
      };
      (chapterWithLegacySummary as unknown as Record<string, unknown>).summary = '旧摘要残留';

      const volume = createTestVolume('volume-1', [chapterWithLegacySummary]);
      const book: Novel = {
        id: 'book-1',
        title: 'Test Book',
        volumes: [volume],
        lastEdited: new Date(),
        createdAt: new Date(),
      };

      await BookService.saveBook(book);

      const savedBook = await BookService.getBookById('book-1');
      const savedChapter = savedBook?.volumes?.[0]?.chapters?.[0] as unknown as
        | Record<string, unknown>
        | undefined;
      expect(savedChapter?.summary).toBeUndefined();
    });
  });
});
