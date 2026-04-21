import { describe, expect, it, jest, mock, beforeEach, spyOn } from 'bun:test';
import { vi } from 'vitest';
import { createTranslationTools } from './translation-tools';
import { taskStatusTools } from './task-status-tools';
import { bookTools } from './book-tools';
import { terminologyTools } from './terminology-tools';
import { characterTools } from './character-tools';
import { memoryTools } from './memory-tools';
import { BookService } from 'src/services/book-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { ChapterService } from 'src/services/chapter-service';
import { TerminologyService } from 'src/services/terminology-service';
import { CharacterSettingService } from 'src/services/character-setting-service';
import { MemoryService } from 'src/services/memory-service';
import { useBooksStore } from 'src/stores/books';

// Mock dependencies
vi.mock('src/services/book-service', () => ({
  BookService: {
    getBookById: jest.fn(),
    saveBook: jest.fn(),
  },
}));

vi.mock('src/services/chapter-content-service', () => ({
  ChapterContentService: {
    loadChapterContentsBatch: jest.fn(),
    loadChapterContent: jest.fn(),
  },
}));

vi.mock('src/services/chapter-service', () => ({
  ChapterService: {
    updateChapter: jest.fn(),
    findChapterById: jest.fn(),
  },
}));

vi.mock('src/stores/books', () => ({
  useBooksStore: jest.fn(() => ({
    getBookById: jest.fn(),
    updateBook: jest.fn(),
  })),
}));

vi.mock('src/utils/id-generator', () => ({
  generateShortId: jest.fn(() => 'mock-id'),
}));

// Mock utils
vi.mock('src/utils/novel-utils', () => ({
  getChapterDisplayTitle: jest.fn((c) => c.title),
  getChapterContentText: jest.fn(() => ''),
}));

vi.mock('./memory-helper', () => ({
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
          bookId: mockBookId,
          chapterId: 'c1',
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
    // 确保 findChapterById 默认返回 undefined（防止跨测试泄露）
    (ChapterService.findChapterById as unknown as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    // 默认不返回章节内容，避免上一个测试的 mock 实现泄露到下一个测试
    (ChapterContentService.loadChapterContent as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    // Reset store mock
    mockContext.aiProcessingStore.activeTasks = [
      {
        id: mockTaskId,
        type: 'translation' as const,
        workflowStatus: 'working',
        modelName: 'gpt-4',
        status: 'working' as const,
        startTime: 1234567890,
        bookId: mockBookId,
        chapterId: 'c1',
      },
    ];
  });

  describe('Translation Batch Tools (add_translation_batch)', () => {
    const addTranslationBatchTool = createTranslationTools().find(
      (t: { definition: { function: { name: string } } }) =>
        t.definition.function.name === 'add_translation_batch',
    );

    const withPrefix = (
      paragraphs: Array<Record<string, unknown>>,
    ): Array<Record<string, unknown>> => {
      return paragraphs.map((item) => {
        if (
          item &&
          typeof item === 'object' &&
          'paragraph_id' in item &&
          typeof (item as { paragraph_id?: unknown }).paragraph_id === 'string' &&
          !Object.prototype.hasOwnProperty.call(item, 'original_text_prefix')
        ) {
          return {
            ...item,
            // 注意：此处硬编码 'orig-' 是因为该文件所有使用 withPrefix 的测试
            // 中段落文本均以 'orig-' 开头（如 `orig-p1`、`orig-p2`）。
            // 若新增测试的段落文本不以 'orig-' 开头，请显式传入 original_text_prefix
            // 字段，而非依赖此辅助函数。
            original_text_prefix: 'orig-',
          };
        }

        return item;
      });
    };

    it('should validate inputs correctly', async () => {
      const result = await addTranslationBatchTool!.handler(
        {
          paragraphs: [],
        },
        mockContext,
      );
      const parsed = JSON.parse(result);
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
          paragraphs: withPrefix([{ paragraph_id: 'p1', translated_text: 'test' }]),
        },
        contextClone,
      );
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("只能在 'working' 或 'review' 状态下调用此工具");
    });

    it('should reject legacy index-based submission', async () => {
      const result = await addTranslationBatchTool!.handler(
        {
          paragraphs: [{ index: 99, translated_text: 'test' }],
        },
        mockContext,
      );
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('已废弃的 index 字段');
    });

    it('should detect duplicate paragraph ids', async () => {
      // Mock BookService so the handler reaches the duplicate check
      const mockChapter = {
        id: 'c1',
        content: [{ id: 'p1', text: 'orig-p1' }],
      };
      const mockBook = {
        id: mockBookId,
        volumes: [{ chapters: [mockChapter] }],
      };
      (BookService.getBookById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockBook);
      (ChapterService.findChapterById as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        chapter: mockChapter,
        volume: mockBook.volumes[0],
      });

      const result = await addTranslationBatchTool!.handler(
        {
          paragraphs: withPrefix([
            { paragraph_id: 'p1', translated_text: 'test1' },
            { paragraph_id: 'p1', translated_text: 'test2' },
          ]),
        },
        mockContext,
      );
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('重复的段落 ID');
    });

    it('should process batch successfully', async () => {
      // Mock BookService behavior
      const mockChapter = {
        id: 'c1',
        content: [{ id: 'p1', text: 'orig' }],
      };
      const mockBook = {
        id: mockBookId,
        volumes: [
          {
            chapters: [mockChapter],
          },
        ],
      };
      (BookService.getBookById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockBook);
      (ChapterService.findChapterById as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        chapter: mockChapter,
        volume: mockBook.volumes[0],
      });

      const result = await addTranslationBatchTool!.handler(
        {
          paragraphs: [
            { paragraph_id: 'p1', original_text_prefix: 'orig', translated_text: 'translated' },
          ],
        },
        mockContext,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.processed_count).toBe(1);
    });

    it('should reject translation for blank paragraph', async () => {
      // Mock BookService behavior with a blank paragraph
      const mockChapter = {
        id: 'c1',
        content: [{ id: 'p_blank', text: '   ' }], // Blank paragraph
      };
      const mockBook = {
        id: mockBookId,
        volumes: [
          {
            chapters: [mockChapter],
          },
        ],
      };
      (BookService.getBookById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockBook);
      (ChapterService.findChapterById as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        chapter: mockChapter,
        volume: mockBook.volumes[0],
      });

      const blankContext = {
        ...mockContext,
        chunkBoundaries: {
          paragraphIds: ['p_blank'],
          allowedParagraphIds: new Set(['p_blank']),
          firstParagraphId: 'p_blank',
          lastParagraphId: 'p_blank',
        },
      };

      const result = await addTranslationBatchTool!.handler(
        {
          paragraphs: [
            { paragraph_id: 'p_blank', original_text_prefix: '', translated_text: 'translated' },
          ],
        },
        blankContext,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('无法翻译空段落');
    });

    it('should allow translation for symbol-only paragraph', async () => {
      // Mock BookService behavior with a symbol-only paragraph
      const mockChapter = {
        id: 'c1',
        content: [{ id: 'p_symbol', text: '...' }], // Symbol only paragraph
      };
      const mockBook = {
        id: mockBookId,
        volumes: [
          {
            chapters: [mockChapter],
          },
        ],
      };
      (BookService.getBookById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockBook);
      (ChapterService.findChapterById as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        chapter: mockChapter,
        volume: mockBook.volumes[0],
      });

      const symbolContext = {
        ...mockContext,
        chunkBoundaries: {
          paragraphIds: ['p_symbol'],
          allowedParagraphIds: new Set(['p_symbol']),
          firstParagraphId: 'p_symbol',
          lastParagraphId: 'p_symbol',
        },
      };

      const result = await addTranslationBatchTool!.handler(
        {
          paragraphs: [
            { paragraph_id: 'p_symbol', original_text_prefix: '...', translated_text: '……' },
          ],
        },
        symbolContext,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.processed_count).toBe(1);
    });

    it('should allow up to 2x max batch size when chunk total paragraphs <= 2x max', async () => {
      // MAX_TRANSLATION_BATCH_SIZE = 10 in src/services/ai/constants.ts
      const paragraphIds = Array.from({ length: 20 }, (_, i) => `p${i + 1}`);

      const mockChapter = {
        id: 'c1',
        content: paragraphIds.map((id) => ({ id, text: `orig-${id}` })),
      };
      const mockBook = {
        id: mockBookId,
        volumes: [
          {
            chapters: [mockChapter],
          },
        ],
      };
      (BookService.getBookById as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockBook);
      (ChapterService.findChapterById as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        chapter: mockChapter,
        volume: mockBook.volumes[0],
      });

      const doubleLimitContext = {
        ...mockContext,
        chunkBoundaries: {
          paragraphIds,
          allowedParagraphIds: new Set(paragraphIds),
          firstParagraphId: paragraphIds[0]!,
          lastParagraphId: paragraphIds[paragraphIds.length - 1]!,
        },
      };

      const result = await addTranslationBatchTool!.handler(
        {
          paragraphs: withPrefix(
            paragraphIds.map((id) => ({
              paragraph_id: id,
              translated_text: `t-${id}`,
            })),
          ),
        },
        doubleLimitContext,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.processed_count).toBe(20);
    });

    it('should still enforce original limit when chunk total paragraphs > 2x max', async () => {
      const paragraphIds = Array.from({ length: 30 }, (_, i) => `p${i + 1}`);
      const largeChunkContext = {
        ...mockContext,
        chunkBoundaries: {
          paragraphIds,
          allowedParagraphIds: new Set(paragraphIds),
          firstParagraphId: paragraphIds[0]!,
          lastParagraphId: paragraphIds[paragraphIds.length - 1]!,
        },
      };

      const result = await addTranslationBatchTool!.handler(
        {
          // 12 > 11 (10% tolerance of 10 is 11)
          paragraphs: withPrefix(
            Array.from({ length: 12 }, (_, i) => ({
              paragraph_id: paragraphIds[i]!,
              translated_text: `t-${i}`,
            })),
          ),
        },
        largeChunkContext,
      );
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('单次批次最多支持 11 个段落');
    });
  });

  describe('Task Status Tools (update_task_status)', () => {
    const updateTaskStatusTool = taskStatusTools.find(
      (t) => t.definition.function.name === 'update_task_status',
    );

    it('should validate status values', async () => {
      const handler = updateTaskStatusTool!.handler;
      const result = await handler({ status: 'invalid_status' }, mockContext);
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('无效的状态值');
    });

    it('should allow valid transition (working -> review for translation)', async () => {
      // Current status: working
      const handler = updateTaskStatusTool!.handler;
      const result = await handler({ status: 'review' }, mockContext);
      const parsed = JSON.parse(result);
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

      (BookService.getBookById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockBook);
      (ChapterService.findChapterById as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        chapter: mockChapter,
      });
      (ChapterContentService.loadChapterContent as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockChapter.content,
      );

      const handler = updateTaskStatusTool!.handler;
      const result = await handler({ status: 'review' }, reviewContext);
      const parsed = JSON.parse(result);

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

      (BookService.getBookById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockBook);
      (ChapterService.findChapterById as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        chapter: mockChapter,
      });
      (ChapterContentService.loadChapterContent as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockChapter.content,
      );

      const handler = updateTaskStatusTool!.handler;
      const result = await handler({ status: 'review' }, reviewContext);
      const parsed = JSON.parse(result);

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

      (BookService.getBookById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockBook);
      (ChapterService.findChapterById as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        chapter: mockChapter,
      });
      (ChapterContentService.loadChapterContent as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockChapter.content,
      );

      const handler = updateTaskStatusTool!.handler;
      const result = await handler({ status: 'review' }, reviewContext);
      const parsed = JSON.parse(result);

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

      (BookService.getBookById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockBook);
      (ChapterService.findChapterById as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        chapter: mockChapter,
      });
      (ChapterContentService.loadChapterContent as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockChapter.content,
      );

      const handler = updateTaskStatusTool!.handler;
      const result = await handler({ status: 'review' }, reviewContext);
      const parsed = JSON.parse(result);

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

      (BookService.getBookById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockBook);
      (ChapterService.findChapterById as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        chapter: mockChapter,
      });

      const handler = updateTaskStatusTool!.handler;
      const result = await handler({ status: 'review' }, reviewContext);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(reviewContext.aiProcessingStore.updateTask).toHaveBeenCalledWith(mockTaskId, {
        workflowStatus: 'review',
      });
    });

    it('should prevent invalid transition (working -> planning)', async () => {
      // Current status: working
      const handler = updateTaskStatusTool!.handler;
      const result = await handler({ status: 'planning' }, mockContext);
      const parsed = JSON.parse(result);
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
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      // 只更新 workflowStatus，不要设置 store 级 status='end'：那会写入 endTime
      // 并在后续 chunk 开始时造成计时器卡住。任务真正结束由 completeTask() 负责。
      expect(polishContext.aiProcessingStore.updateTask).toHaveBeenCalledWith(mockTaskId, {
        workflowStatus: 'end',
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
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('润色任务不支持 review 状态');
    });
  });

  describe('Chapter Title Tools (update_chapter_title)', () => {
    const updateChapterTitleTool = bookTools.find(
      (t) => t.definition.function.name === 'update_chapter_title',
    );

    it('should validate inputs', async () => {
      const handler = updateChapterTitleTool!.handler;
      const result = await handler({}, mockContext);
      const parsed = JSON.parse(result);
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
      const mockStore = {
        getBookById: jest.fn().mockReturnValue(mockBook),
        updateBook: jest.fn().mockResolvedValue(undefined),
      };
      (useBooksStore as unknown as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockStore);
      (ChapterService.updateChapter as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]); // mock return updated volumes
      (ChapterService.findChapterById as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
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
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(ChapterService.updateChapter).toHaveBeenCalled();
      expect(mockContext.onAction).toHaveBeenCalled();
    });
  });

  // 断言 handler 调用会抛出包含指定消息的错误
  // （handler 返回类型是 Promise<string> | string，不能直接用 expect().rejects，
  // 否则会触发 @typescript-eslint/await-thenable）
  const expectThrows = async (
    invoke: () => Promise<string> | string,
    message: string,
  ) => {
    let caught: unknown;
    try {
      await Promise.resolve(invoke());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain(message);
  };

  describe('Terminology Tools (blank-value validation)', () => {
    const createTermTool = terminologyTools.find(
      (t) => t.definition.function.name === 'create_term',
    );
    const updateTermTool = terminologyTools.find(
      (t) => t.definition.function.name === 'update_term',
    );

    describe('create_term', () => {
      it('rejects blank name', async () => {
        await expectThrows(
          () => createTermTool!.handler({ name: '   ', translation: '英雄' }, mockContext),
          '术语名称和翻译不能为空',
        );
      });

      it('rejects blank translation', async () => {
        await expectThrows(
          () => createTermTool!.handler({ name: 'hero', translation: '   ' }, mockContext),
          '术语名称和翻译不能为空',
        );
      });

      it('rejects missing fields', async () => {
        await expectThrows(
          () => createTermTool!.handler({ translation: '英雄' }, mockContext),
          '术语名称和翻译不能为空',
        );
        await expectThrows(
          () => createTermTool!.handler({ name: 'hero' }, mockContext),
          '术语名称和翻译不能为空',
        );
      });

      it('trims name and translation before persisting', async () => {
        const addSpy = spyOn(TerminologyService, 'addTerminology').mockResolvedValue({
          id: 'term-1',
          name: 'hero',
          translation: { translation: '英雄' },
        } as any);

        await createTermTool!.handler(
          { name: '  hero  ', translation: '  英雄  ' },
          mockContext,
        );

        expect(addSpy).toHaveBeenCalledWith(
          mockBookId,
          expect.objectContaining({ name: 'hero', translation: '英雄' }),
        );
        addSpy.mockRestore();
      });
    });

    describe('update_term', () => {
      it('rejects whitespace-only translation', async () => {
        await expectThrows(
          () => updateTermTool!.handler({ term_id: 't1', translation: '   ' }, mockContext),
          '术语翻译不能为空',
        );
      });

      it('allows empty description (intentional delete)', async () => {
        const updateSpy = spyOn(TerminologyService, 'updateTerminology').mockResolvedValue({
          id: 't1',
          name: 'hero',
          translation: { translation: '英雄' },
          description: '',
        } as any);

        await updateTermTool!.handler(
          { term_id: 't1', description: '' },
          mockContext,
        );

        expect(updateSpy).toHaveBeenCalledWith(
          mockBookId,
          't1',
          expect.objectContaining({ description: '' }),
        );
        updateSpy.mockRestore();
      });

      it('trims translation before persisting', async () => {
        const updateSpy = spyOn(TerminologyService, 'updateTerminology').mockResolvedValue({
          id: 't1',
          name: 'hero',
          translation: { translation: '英雄' },
        } as any);

        await updateTermTool!.handler(
          { term_id: 't1', translation: '  英雄  ' },
          mockContext,
        );

        expect(updateSpy).toHaveBeenCalledWith(
          mockBookId,
          't1',
          expect.objectContaining({ translation: '英雄' }),
        );
        updateSpy.mockRestore();
      });
    });
  });

  describe('Character Tools (blank-value validation)', () => {
    const createCharacterTool = characterTools.find(
      (t) => t.definition.function.name === 'create_character',
    );
    const updateCharacterTool = characterTools.find(
      (t) => t.definition.function.name === 'update_character',
    );

    describe('create_character', () => {
      it('rejects blank name', async () => {
        await expectThrows(
          () => createCharacterTool!.handler({ name: '   ', translation: '田中' }, mockContext),
          '角色名称和翻译不能为空',
        );
      });

      it('rejects blank translation', async () => {
        await expectThrows(
          () => createCharacterTool!.handler({ name: '田中', translation: '   ' }, mockContext),
          '角色名称和翻译不能为空',
        );
      });

      it('rejects aliases with blank name or translation', async () => {
        await expectThrows(
          () =>
            createCharacterTool!.handler(
              {
                name: '田中太郎',
                translation: '田中太郎',
                aliases: [{ name: '   ', translation: '太郎' }],
              },
              mockContext,
            ),
          '别名的名称和翻译不能为空',
        );

        await expectThrows(
          () =>
            createCharacterTool!.handler(
              {
                name: '田中太郎',
                translation: '田中太郎',
                aliases: [{ name: '太郎', translation: '   ' }],
              },
              mockContext,
            ),
          '别名的名称和翻译不能为空',
        );
      });

      it('trims name, translation and aliases before persisting', async () => {
        const addSpy = spyOn(CharacterSettingService, 'addCharacterSetting').mockResolvedValue({
          id: 'char-1',
          name: '田中太郎',
          translation: { translation: '田中太郎' },
          aliases: [],
        } as any);

        await createCharacterTool!.handler(
          {
            name: '  田中太郎  ',
            translation: '  田中太郎  ',
            aliases: [{ name: '  田中  ', translation: '  田中  ' }],
          },
          mockContext,
        );

        expect(addSpy).toHaveBeenCalledWith(
          mockBookId,
          expect.objectContaining({
            name: '田中太郎',
            translation: '田中太郎',
            aliases: [{ name: '田中', translation: '田中' }],
          }),
        );
        addSpy.mockRestore();
      });
    });

    describe('update_character', () => {
      it('rejects whitespace-only name', async () => {
        await expectThrows(
          () =>
            updateCharacterTool!.handler({ character_id: 'c1', name: '   ' }, mockContext),
          '角色名称不能为空',
        );
      });

      it('rejects whitespace-only translation', async () => {
        await expectThrows(
          () =>
            updateCharacterTool!.handler(
              { character_id: 'c1', translation: '   ' },
              mockContext,
            ),
          '角色翻译不能为空',
        );
      });

      it('rejects aliases with blank values', async () => {
        await expectThrows(
          () =>
            updateCharacterTool!.handler(
              {
                character_id: 'c1',
                aliases: [{ name: '田中', translation: '   ' }],
              },
              mockContext,
            ),
          '别名的名称和翻译不能为空',
        );
      });

      it('allows empty description and speaking_style (intentional delete)', async () => {
        const updateSpy = spyOn(
          CharacterSettingService,
          'updateCharacterSetting',
        ).mockResolvedValue({
          id: 'c1',
          name: '田中',
          translation: { translation: '田中' },
          description: '',
          speakingStyle: '',
        } as any);

        await updateCharacterTool!.handler(
          { character_id: 'c1', description: '', speaking_style: '' },
          mockContext,
        );

        expect(updateSpy).toHaveBeenCalledWith(
          mockBookId,
          'c1',
          expect.objectContaining({ description: '', speakingStyle: '' }),
        );
        updateSpy.mockRestore();
      });
    });
  });

  describe('Memory Tools (blank-value validation)', () => {
    const createMemoryTool = memoryTools.find(
      (t) => t.definition.function.name === 'create_memory',
    );
    const updateMemoryTool = memoryTools.find(
      (t) => t.definition.function.name === 'update_memory',
    );

    describe('create_memory', () => {
      it('rejects whitespace-only content', async () => {
        const result = await createMemoryTool!.handler(
          { content: '   ', summary: '摘要' },
          mockContext,
        );
        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain('内容不能为空');
      });

      it('rejects whitespace-only summary', async () => {
        const result = await createMemoryTool!.handler(
          { content: '内容', summary: '   ' },
          mockContext,
        );
        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain('摘要不能为空');
      });

      it('trims content and summary before persisting', async () => {
        const createSpy = spyOn(MemoryService, 'createMemory').mockResolvedValue({
          id: 'm1',
          content: '内容',
          summary: '摘要',
          createdAt: 0,
          lastAccessedAt: 0,
        } as any);

        await createMemoryTool!.handler(
          { content: '  内容  ', summary: '  摘要  ' },
          mockContext,
        );

        expect(createSpy).toHaveBeenCalledWith(mockBookId, '内容', '摘要');
        createSpy.mockRestore();
      });
    });

    describe('update_memory', () => {
      it('rejects whitespace-only content', async () => {
        const result = await updateMemoryTool!.handler(
          { memory_id: 'm1', content: '   ', summary: '摘要' },
          mockContext,
        );
        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain('内容不能为空');
      });

      it('rejects whitespace-only summary', async () => {
        const result = await updateMemoryTool!.handler(
          { memory_id: 'm1', content: '内容', summary: '   ' },
          mockContext,
        );
        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain('摘要不能为空');
      });

      it('trims content and summary before persisting', async () => {
        const getSpy = spyOn(MemoryService, 'getMemory').mockResolvedValue({
          id: 'm1',
          content: 'old',
          summary: 'old',
          createdAt: 0,
          lastAccessedAt: 0,
        } as any);
        const updateSpy = spyOn(MemoryService, 'updateMemory').mockResolvedValue({
          id: 'm1',
          content: '内容',
          summary: '摘要',
          createdAt: 0,
          lastAccessedAt: 0,
        } as any);

        await updateMemoryTool!.handler(
          { memory_id: 'm1', content: '  内容  ', summary: '  摘要  ' },
          mockContext,
        );

        expect(updateSpy).toHaveBeenCalledWith(mockBookId, 'm1', '内容', '摘要');
        getSpy.mockRestore();
        updateSpy.mockRestore();
      });
    });
  });
});
