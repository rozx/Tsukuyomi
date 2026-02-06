import { describe, expect, it, jest, mock, beforeEach } from 'bun:test';
import { translationTools } from './translation-tools';
import { taskStatusTools } from './task-status-tools';
import { bookTools } from './book-tools';
import { BookService } from 'src/services/book-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { ChapterService } from 'src/services/chapter-service';

// Mock dependencies
mock.module('src/services/book-service', () => ({
  BookService: {
    getBookById: jest.fn(),
    saveBook: jest.fn(),
  },
}));

mock.module('src/services/chapter-content-service', () => ({
  ChapterContentService: {
    loadChapterContentsBatch: jest.fn(),
    loadChapterContent: jest.fn(),
  },
}));

mock.module('src/services/chapter-service', () => ({
  ChapterService: {
    updateChapter: jest.fn(),
    findChapterById: jest.fn(),
  },
}));

mock.module('src/stores/books', () => ({
  useBooksStore: jest.fn(() => ({
    getBookById: jest.fn(),
    updateBook: jest.fn(),
  })),
}));

mock.module('src/utils/id-generator', () => ({
  generateShortId: jest.fn(() => 'mock-id'),
}));

// Mock utils
mock.module('src/utils/novel-utils', () => ({
  getChapterDisplayTitle: jest.fn((c) => c.title),
  getChapterContentText: jest.fn(() => ''),
}));

mock.module('./memory-helper', () => ({
  searchRelatedMemoriesHybrid: jest.fn(() => []),
}));

describe('AI Tools Tests', () => {
  // Basic Mock Data
  const mockBookId = 'book-1';
  const mockTaskId = 'task-1';
  const mockAIModelId = 'model-1';
  const mockContext = {
    bookId: mockBookId,
    taskId: mockTaskId,
    aiModelId: mockAIModelId,
    onAction: jest.fn(),
    aiProcessingStore: {
      activeTasks: [
        {
          id: mockTaskId,
          type: 'translation' as const,
          workflowStatus: 'working' as any,
          modelName: 'gpt-4',
          status: 'working' as any,
          startTime: 1234567890,
        },
      ],
      updateTask: jest.fn(),
      addTask: jest.fn(),
      appendThinkingMessage: jest.fn(),
      appendOutputContent: jest.fn(),
      removeTask: jest.fn(),
    },
    chunkBoundaries: {
      paragraphIds: ['p1', 'p2', 'p3'],
      allowedParagraphIds: new Set(['p1', 'p2', 'p3']),
      firstParagraphId: 'p1',
      lastParagraphId: 'p3',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset store mock
    mockContext.aiProcessingStore.activeTasks = [
      {
        id: mockTaskId,
        type: 'translation' as const,
        workflowStatus: 'working',
        modelName: 'gpt-4',
        status: 'working' as const,
        startTime: 1234567890,
      },
    ];
  });

  describe('Translation Batch Tools (add_translation_batch)', () => {
    const addTranslationBatchTool = translationTools.find(
      (t) => t.definition.function.name === 'add_translation_batch',
    );

    it('should validate inputs correctly', async () => {
      const result = await addTranslationBatchTool!.handler(
        {
          paragraphs: [],
        },
        mockContext,
      );
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('段落列表不能为空');
    });

    it('should validate status (must be working)', async () => {
      const contextClone = {
        ...mockContext,
        aiProcessingStore: {
          ...mockContext.aiProcessingStore,
          activeTasks: [
            {
              id: mockTaskId,
              workflowStatus: 'planning' as any,
              type: 'translation' as const,
              modelName: 'gpt-4',
              status: 'planning' as any,
              startTime: 1234567890,
            },
          ],
        },
      };
      const result = await addTranslationBatchTool!.handler(
        {
          paragraphs: [{ index: 0, translated_text: 'test' }],
        },
        contextClone,
      );
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("只能在 'working' 状态下调用此工具");
    });

    it('should validate parameters (index out of range)', async () => {
      const result = await addTranslationBatchTool!.handler(
        {
          paragraphs: [{ index: 99, translated_text: 'test' }],
        },
        mockContext,
      );
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('超出范围');
    });

    it('should detect duplicate paragraph ids', async () => {
      const result = await addTranslationBatchTool!.handler(
        {
          paragraphs: [
            { index: 0, translated_text: 'test1' },
            { index: 0, translated_text: 'test2' },
          ],
        },
        mockContext,
      );
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('重复的段落 ID');
    });

    it('should process batch successfully', async () => {
      // Mock BookService behavior
      const mockBook = {
        id: mockBookId,
        volumes: [
          {
            chapters: [
              {
                id: 'c1',
                content: [{ id: 'p1', text: 'orig' }],
              },
            ],
          },
        ],
      };
      (BookService.getBookById as jest.Mock).mockResolvedValue(mockBook);
      (ChapterContentService.loadChapterContentsBatch as jest.Mock).mockResolvedValue(
        new Map([['c1', [{ id: 'p1', text: 'orig' }]]]),
      );

      const result = await addTranslationBatchTool!.handler(
        {
          paragraphs: [{ index: 0, translated_text: 'translated' }],
        },
        mockContext,
      );
      const parsed = JSON.parse(result as string);

      expect(parsed.success).toBe(true);
      expect(parsed.processed_count).toBe(1);
      expect(BookService.saveBook).toHaveBeenCalled();
    });
  });

  describe('Task Status Tools (update_task_status)', () => {
    const updateTaskStatusTool = taskStatusTools.find(
      (t) => t.definition.function.name === 'update_task_status',
    );

    it('should validate status values', async () => {
      const handler = updateTaskStatusTool!.handler;
      const result = await handler({ status: 'invalid_status' }, mockContext);
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('无效的状态值');
    });

    it('should allow valid transition (working -> review for translation)', async () => {
      // Current status: working
      const handler = updateTaskStatusTool!.handler;
      const result = await handler({ status: 'review' }, mockContext);
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(true);
      expect(mockContext.aiProcessingStore.updateTask).toHaveBeenCalledWith(mockTaskId, {
        workflowStatus: 'review',
      });
    });

    it('should fail review if chapter title not translated', async () => {
      const reviewContext = {
        ...mockContext,
        bookId: mockBookId,
        aiProcessingStore: {
          ...mockContext.aiProcessingStore,
          activeTasks: [
            {
              id: mockTaskId,
              type: 'translation' as const,
              workflowStatus: 'working' as any,
              status: 'working' as any,
              modelName: 'gpt-4',
              startTime: 1234567890,
              bookId: mockBookId,
              chapterId: 'c1',
            },
          ],
        },
      };

      const mockChapter = {
        id: 'c1',
        title: { original: 'Original Title', translation: null }, // No translation
        content: [],
      };
      const mockBook = {
        id: mockBookId,
        volumes: [{ chapters: [mockChapter] }],
      };

      (BookService.getBookById as jest.Mock).mockResolvedValue(mockBook);
      (ChapterService.findChapterById as jest.Mock).mockReturnValue({
        chapter: mockChapter,
      });

      const handler = updateTaskStatusTool!.handler;
      const result = await handler({ status: 'review' }, reviewContext);
      const parsed = JSON.parse(result as string);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('章节标题尚未翻译');
    });

    it('should fail review if paragraphs not translated', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { chunkBoundaries, ...contextWithoutBoundaries } = mockContext;
      const reviewContext = {
        ...contextWithoutBoundaries,
        bookId: mockBookId,
        aiProcessingStore: {
          ...mockContext.aiProcessingStore,
          activeTasks: [
            {
              id: mockTaskId,
              type: 'translation' as const,
              workflowStatus: 'working' as any,
              status: 'working' as any,
              modelName: 'gpt-4',
              startTime: 1234567890,
              bookId: mockBookId,
              chapterId: 'c1',
            },
          ],
        },
      };

      const mockChapter = {
        id: 'c1',
        title: { original: 'Orig', translation: { translation: 'Trans' } },
        content: [
          { id: 'p1', text: 'Text 1', translations: [] }, // Not translated
          { id: 'p2', text: 'Text 2', translations: [{ translation: 'T2' }] },
        ],
      };

      const mockBook = {
        id: mockBookId,
        volumes: [{ chapters: [mockChapter] }],
      };

      (BookService.getBookById as jest.Mock).mockResolvedValue(mockBook);
      (ChapterService.findChapterById as jest.Mock).mockReturnValue({
        chapter: mockChapter,
      });
      // Mock loadChapterContent to return undefined or content depending on implementation
      // My implementation checks chapter.content || loadChapterContent
      // With chapter.content set, it uses it.

      const handler = updateTaskStatusTool!.handler;
      const result = await handler({ status: 'review' }, reviewContext);
      const parsed = JSON.parse(result as string);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('全文章节内仍有 1 个非空段落未翻译');
    });

    it('should ignore untranslated paragraphs outside chunk boundaries', async () => {
      const reviewContext = {
        ...mockContext,
        bookId: mockBookId,
        chunkBoundaries: {
          allowedParagraphIds: new Set(['p1']),
          paragraphIds: ['p1'],
          firstParagraphId: 'p1',
          lastParagraphId: 'p1',
        },
        aiProcessingStore: {
          ...mockContext.aiProcessingStore,
          activeTasks: [
            {
              id: mockTaskId,
              type: 'translation' as const,
              workflowStatus: 'working' as any,
              status: 'working' as any,
              modelName: 'gpt-4',
              startTime: 1234567890,
              bookId: mockBookId,
              chapterId: 'c1',
            },
          ],
        },
      };

      const mockChapter = {
        id: 'c1',
        title: { original: 'Orig', translation: { translation: 'Trans' } },
        content: [
          { id: 'p1', text: 'Text 1', translations: [{ translation: 'T1' }] }, // Translated (in chunk)
          { id: 'p2', text: 'Text 2', translations: [] }, // Untranslated (OUTSIDE chunk)
        ],
      };

      const mockBook = {
        id: mockBookId,
        volumes: [{ chapters: [mockChapter] }],
      };

      (BookService.getBookById as jest.Mock).mockResolvedValue(mockBook);
      (ChapterService.findChapterById as jest.Mock).mockReturnValue({
        chapter: mockChapter,
      });

      const handler = updateTaskStatusTool!.handler;
      const result = await handler({ status: 'review' }, reviewContext);
      const parsed = JSON.parse(result as string);

      // Should succeed because p2 is ignored
      expect(parsed.success).toBe(true);
    });

    it('should fail review if untranslated paragraphs inside chunk boundaries', async () => {
      const reviewContext = {
        ...mockContext,
        bookId: mockBookId,
        chunkBoundaries: {
          allowedParagraphIds: new Set(['p2']),
          paragraphIds: ['p2'],
          firstParagraphId: 'p2',
          lastParagraphId: 'p2',
        },
        aiProcessingStore: {
          ...mockContext.aiProcessingStore,
          activeTasks: [
            {
              id: mockTaskId,
              type: 'translation' as const,
              workflowStatus: 'working' as any,
              status: 'working' as any,
              modelName: 'gpt-4',
              startTime: 1234567890,
              bookId: mockBookId,
              chapterId: 'c1',
            },
          ],
        },
      };

      const mockChapter = {
        id: 'c1',
        title: { original: 'Orig', translation: { translation: 'Trans' } },
        content: [
          { id: 'p1', text: 'Text 1', translations: [{ translation: 'T1' }] }, // Translated (OUTSIDE chunk)
          { id: 'p2', text: 'Text 2', translations: [] }, // Untranslated (INSIDE chunk)
        ],
      };

      const mockBook = {
        id: mockBookId,
        volumes: [{ chapters: [mockChapter] }],
      };

      (BookService.getBookById as jest.Mock).mockResolvedValue(mockBook);
      (ChapterService.findChapterById as jest.Mock).mockReturnValue({
        chapter: mockChapter,
      });

      const handler = updateTaskStatusTool!.handler;
      const result = await handler({ status: 'review' }, reviewContext);
      const parsed = JSON.parse(result as string);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('当前分块内仍有 1 个非空段落未翻译');
    });

    it('should pass review if all translated', async () => {
      const reviewContext = {
        ...mockContext,
        bookId: mockBookId,
        aiProcessingStore: {
          ...mockContext.aiProcessingStore,
          activeTasks: [
            {
              id: mockTaskId,
              type: 'translation' as const,
              workflowStatus: 'working' as any,
              status: 'working' as any,
              modelName: 'gpt-4',
              startTime: 1234567890,
              bookId: mockBookId,
              chapterId: 'c1',
            },
          ],
        },
      };

      const mockChapter = {
        id: 'c1',
        title: { original: 'Orig', translation: { translation: 'Trans' } },
        content: [
          { id: 'p1', text: 'Text 1', translations: [{ translation: 'T1' }] },
          { id: 'p2', text: 'Text 2', translations: [{ translation: 'T2' }] },
        ],
      };

      const mockBook = {
        id: mockBookId,
        volumes: [{ chapters: [mockChapter] }],
      };

      (BookService.getBookById as jest.Mock).mockResolvedValue(mockBook);
      (ChapterService.findChapterById as jest.Mock).mockReturnValue({
        chapter: mockChapter,
      });

      const handler = updateTaskStatusTool!.handler;
      const result = await handler({ status: 'review' }, reviewContext);
      const parsed = JSON.parse(result as string);

      expect(parsed.success).toBe(true);
      expect(reviewContext.aiProcessingStore.updateTask).toHaveBeenCalledWith(mockTaskId, {
        workflowStatus: 'review',
      });
    });

    it('should prevent invalid transition (working -> planning)', async () => {
      // Current status: working
      const handler = updateTaskStatusTool!.handler;
      const result = await handler({ status: 'planning' }, mockContext);
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('无效的状态转换');
    });

    it('should allow working -> end for polish', async () => {
      const polishContext = {
        ...mockContext,
        aiProcessingStore: {
          activeTasks: [
            {
              id: mockTaskId,
              type: 'polish' as const,
              workflowStatus: 'working' as any,
              modelName: 'gpt-4',
              status: 'working' as any,
              startTime: 1234567890,
            },
          ],
          updateTask: jest.fn(),
          addTask: jest.fn(),
          appendThinkingMessage: jest.fn(),
          appendOutputContent: jest.fn(),
          removeTask: jest.fn(),
        },
      };
      const handler = updateTaskStatusTool!.handler;
      const result = await handler({ status: 'end' }, polishContext);
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(true);
      expect(polishContext.aiProcessingStore.updateTask).toHaveBeenCalledWith(mockTaskId, {
        workflowStatus: 'end',
        status: 'end',
      });
    });
    it('should prevent working -> review for polish', async () => {
      const polishContext = {
        ...mockContext,
        aiProcessingStore: {
          activeTasks: [
            {
              id: mockTaskId,
              type: 'polish' as const,
              workflowStatus: 'working' as any,
              modelName: 'gpt-4',
              status: 'working' as any,
              startTime: 1234567890,
            },
          ],
          updateTask: jest.fn(),
          addTask: jest.fn(),
          appendThinkingMessage: jest.fn(),
          appendOutputContent: jest.fn(),
          removeTask: jest.fn(),
        },
      };
      const handler = updateTaskStatusTool!.handler;
      const result = await handler({ status: 'review' }, polishContext);
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('无效的状态转换');
    });
  });

  describe('Chapter Title Tools (update_chapter_title)', () => {
    const updateChapterTitleTool = bookTools.find(
      (t) => t.definition.function.name === 'update_chapter_title',
    );

    it('should validate inputs', async () => {
      const handler = updateChapterTitleTool!.handler;
      const result = await handler({}, mockContext);
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('章节 ID 不能为空');
    });

    it('should update chapter title', async () => {
      const mockChapter = {
        id: 'c1',
        title: { original: 'Old Title' },
      };
      const mockBook = {
        id: mockBookId,
        volumes: [
          {
            chapters: [mockChapter],
          },
        ],
      };
      (BookService.getBookById as jest.Mock).mockResolvedValue(mockBook);
      (ChapterService.updateChapter as jest.Mock).mockReturnValue([]); // mock return updated volumes
      (ChapterService.findChapterById as jest.Mock).mockReturnValue({
        chapter: mockChapter,
        volume: mockBook.volumes[0],
      });

      const handler = updateChapterTitleTool!.handler;
      const result = await handler(
        {
          chapter_id: 'c1',
          title_translation: 'New Title',
        },
        mockContext,
      );
      const parsed = JSON.parse(result as string);

      expect(parsed.success).toBe(true);
      expect(ChapterService.updateChapter).toHaveBeenCalled();
      expect(mockContext.onAction).toHaveBeenCalled();
    });
  });
});
