import { describe, expect, it, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import './setup';
import { BookService } from '../services/book-service';
import type { Novel, Volume, Chapter, Paragraph } from '../models/novel';
import { ChapterContentService } from '../services/chapter-content-service';
import { generateShortId } from '../utils/id-generator';

// Mock ChapterContentService
const mockSaveChapterContent = mock(
  (_chapterId: string, _content: Paragraph[], _options?: { skipIfUnchanged?: boolean }) =>
    Promise.resolve(true),
);

describe('BookService', () => {
  beforeEach(() => {
    mockSaveChapterContent.mockClear();

    // Mock ChapterContentService.saveChapterContent
    spyOn(ChapterContentService, 'saveChapterContent').mockImplementation(mockSaveChapterContent);
  });

  afterEach(() => {
    mock.restore();
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
      expect(mockSaveChapterContent).toHaveBeenCalledTimes(2);
      expect(mockSaveChapterContent).toHaveBeenCalledWith('chapter-1', chapter1.content, {
        skipIfUnchanged: true,
      });
      expect(mockSaveChapterContent).toHaveBeenCalledWith('chapter-2', chapter2.content, {
        skipIfUnchanged: true,
      });
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
      expect(mockSaveChapterContent).toHaveBeenCalledTimes(2);
      expect(mockSaveChapterContent).toHaveBeenCalledWith('chapter-1', chapter1.content, {
        skipIfUnchanged: true,
      });
      expect(mockSaveChapterContent).toHaveBeenCalledWith('chapter-2', chapter2.content, {
        skipIfUnchanged: true,
      });
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
      expect(mockSaveChapterContent).not.toHaveBeenCalled();
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
      expect(mockSaveChapterContent).toHaveBeenCalledTimes(2);
      expect(mockSaveChapterContent).toHaveBeenCalledWith('chapter-1', chapter1.content, {
        skipIfUnchanged: true,
      });
      expect(mockSaveChapterContent).toHaveBeenCalledWith('chapter-3', chapter3.content, {
        skipIfUnchanged: true,
      });
      expect(mockSaveChapterContent).not.toHaveBeenCalledWith('chapter-2', expect.anything());
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
      expect(mockSaveChapterContent).not.toHaveBeenCalled();
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
      expect(mockSaveChapterContent).not.toHaveBeenCalled();
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
      expect(mockSaveChapterContent).toHaveBeenCalledTimes(2);
      expect(mockSaveChapterContent).toHaveBeenCalledWith('chapter-1', chapter1.content, {
        skipIfUnchanged: true,
      });
      expect(mockSaveChapterContent).toHaveBeenCalledWith('chapter-2', chapter2.content, {
        skipIfUnchanged: true,
      });
    });

    it('should preserve chapter summary when stripping content for storage', async () => {
      const chapterWithSummary: Chapter = {
        ...createTestChapter('chapter-1', [createTestParagraph()]),
        summary: '这是章节摘要',
      };
      const volume = createTestVolume('volume-1', [chapterWithSummary]);
      const book: Novel = {
        id: 'book-1',
        title: 'Test Book',
        volumes: [volume],
        lastEdited: new Date(),
        createdAt: new Date(),
      };

      await BookService.saveBook(book);

      const savedBook = await BookService.getBookById('book-1');
      const savedSummary = savedBook?.volumes?.[0]?.chapters?.[0]?.summary;
      expect(savedSummary).toBe('这是章节摘要');
    });
  });
});
