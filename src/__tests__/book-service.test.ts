import { describe, expect, it, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { BookService } from '../services/book-service';
import type { Novel, Volume, Chapter, Paragraph } from '../models/novel';
import { ChapterContentService } from '../services/chapter-content-service';
import { generateShortId } from '../utils/id-generator';

// Mock objects
const mockPut = mock((_storeName: string, _value: unknown) => Promise.resolve(undefined));
const mockGetAll = mock((_storeName: string) => Promise.resolve([]));
const mockGet = mock((_storeName: string, _key: string) => Promise.resolve(undefined as unknown));
const mockDelete = mock((_storeName: string, _key: string) => Promise.resolve(undefined));
const mockClear = mock((_storeName: string) => Promise.resolve(undefined));
const mockStorePut = mock(() => Promise.resolve(undefined));
const mockTransaction = mock(() => ({
  objectStore: () => ({
    put: mockStorePut,
  }),
  done: Promise.resolve(),
}));

const mockDb = {
  getAll: mockGetAll,
  get: mockGet,
  put: mockPut,
  delete: mockDelete,
  clear: mockClear,
  transaction: mockTransaction,
};

// Mock the module
await mock.module('src/utils/indexed-db', () => ({
  getDB: () => Promise.resolve(mockDb),
}));

// Mock ChapterContentService
const mockSaveChapterContent = mock(
  (_chapterId: string, _content: Paragraph[], _options?: { skipIfUnchanged?: boolean }) =>
    Promise.resolve(true),
);

describe('BookService', () => {
  beforeEach(() => {
    mockPut.mockClear();
    mockGetAll.mockClear();
    mockGet.mockClear();
    mockDelete.mockClear();
    mockClear.mockClear();
    mockStorePut.mockClear();
    mockTransaction.mockClear();
    mockSaveChapterContent.mockClear();

    // Mock ChapterContentService.saveChapterContent
    spyOn(ChapterContentService, 'saveChapterContent').mockImplementation(
      mockSaveChapterContent,
    );
  });

  afterEach(() => {
    mock.restore();
  });

  it('should get all books', async () => {
    mockGetAll.mockResolvedValueOnce([]);
    const books = await BookService.getAllBooks();
    expect(books).toEqual([]);
    expect(mockGetAll).toHaveBeenCalledWith('books');
  });

  it('should get a book by id', async () => {
    const mockBook = { id: '1', title: 'Test' };
    mockGet.mockResolvedValueOnce(mockBook);
    
    const book = await BookService.getBookById('1');
    expect(book).toEqual(mockBook as Novel);
    expect(mockGet).toHaveBeenCalledWith('books', '1');
  });

  it('should save a book', async () => {
    const book = { id: '1', title: 'Test', createdAt: new Date() } as Novel;
    await BookService.saveBook(book);
    expect(mockPut).toHaveBeenCalled();
    // Check that the first argument to put was 'books'
    expect(mockPut.mock.calls[0]?.[0]).toBe('books');
    // Check that dates were serialized
    const savedBook = mockPut.mock.calls[0]?.[1] as any;
    expect(typeof savedBook?.createdAt).toBe('string');
  });

  it('should bulk save books', async () => {
    const books = [
      { id: '1', title: 'Book 1' },
      { id: '2', title: 'Book 2' },
    ] as Novel[];

    await BookService.bulkSaveBooks(books);
    expect(mockTransaction).toHaveBeenCalledWith('books', 'readwrite');
    expect(mockStorePut).toHaveBeenCalledTimes(2);
  });

  it('should delete a book', async () => {
    await BookService.deleteBook('1');
    expect(mockDelete).toHaveBeenCalledWith('books', '1');
  });

  it('should clear all books', async () => {
    await BookService.clearBooks();
    expect(mockClear).toHaveBeenCalledWith('books');
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
      expect(mockPut).toHaveBeenCalled();
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
      expect(mockPut).toHaveBeenCalled();
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
      expect(mockPut).toHaveBeenCalled();
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
      // 应该保存书籍元数据
      expect(mockPut).toHaveBeenCalled();
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
      // 应该保存书籍元数据
      expect(mockPut).toHaveBeenCalled();
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
  });
});

