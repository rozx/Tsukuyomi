import { describe, expect, it, jest, mock, beforeEach } from 'bun:test';
import { translationTools } from './translation-tools';
import { taskStatusTools } from './task-status-tools';
import { bookTools } from './book-tools';
import { BookService } from 'src/services/book-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { ChapterService } from 'src/services/chapter-service';
import { useBooksStore } from 'src/stores/books';
import { generateShortId } from 'src/utils/id-generator';

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
          type: 'translation',
          workflowStatus: 'working',
        },
      ],
      updateTask: jest.fn(),
    },
    chunkBoundaries: {
      paragraphIds: ['p1', 'p2', 'p3'],
      allowedParagraphIds: new Set(['p1', 'p2', 'p3']),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset store mock
    mockContext.aiProcessingStore.activeTasks = [
      { id: mockTaskId, type: 'translation', workflowStatus: 'working' },
    ];
  });

  describe('Translation Batch Tools (add_translation_batch)', () => {
    const addTranslationBatchTool = translationTools.find(
      (t) => t.definition.function.name === 'add_translation_batch',
    );

    it('should validate inputs correctly', async () => {
      const result = await addTranslationBatchTool?.handler(
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
          activeTasks: [{ id: mockTaskId, workflowStatus: 'planning', type: 'translation' }],
        },
      };
      const result = await addTranslationBatchTool?.handler(
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
      const result = await addTranslationBatchTool?.handler(
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
      const result = await addTranslationBatchTool?.handler(
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

      const result = await addTranslationBatchTool?.handler(
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
      const result = await updateTaskStatusTool?.handler({ status: 'invalid_status' }, mockContext);
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('无效的状态值');
    });

    it('should allow valid transition (working -> review for translation)', async () => {
      // Current status: working
      const result = await updateTaskStatusTool?.handler({ status: 'review' }, mockContext);
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(true);
      expect(mockContext.aiProcessingStore.updateTask).toHaveBeenCalledWith(mockTaskId, {
        workflowStatus: 'review',
      });
    });

    it('should prevent invalid transition (working -> planning)', async () => {
      // Current status: working
      const result = await updateTaskStatusTool?.handler({ status: 'planning' }, mockContext);
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('无效的状态转换');
    });

    it('should allow working -> end for polish', async () => {
      const polishContext = {
        ...mockContext,
        aiProcessingStore: {
          activeTasks: [{ id: mockTaskId, type: 'polish', workflowStatus: 'working' }],
          updateTask: jest.fn(),
        },
      };
      const result = await updateTaskStatusTool?.handler({ status: 'end' }, polishContext);
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
          activeTasks: [{ id: mockTaskId, type: 'polish', workflowStatus: 'working' }],
          updateTask: jest.fn(),
        },
      };
      const result = await updateTaskStatusTool?.handler({ status: 'review' }, polishContext);
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
      const result = await updateChapterTitleTool?.handler({}, mockContext);
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

      const result = await updateChapterTitleTool?.handler(
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
