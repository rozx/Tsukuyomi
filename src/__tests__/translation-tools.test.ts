import './setup'; // 导入测试环境设置（IndexedDB polyfill等）
import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import type { Novel, Volume, Chapter, Paragraph, Translation } from '../models/novel';
import { generateShortId } from '../utils/id-generator';
import type { AIProcessingStore } from '../services/ai/tasks/utils/task-types';
import type { ChunkBoundaries } from '../services/ai/tools/types';
import { MAX_TRANSLATION_BATCH_SIZE } from '../services/ai/constants';
// 使用 spyOn 替代 mock.module，避免全局污染 BookService 模块缓存
import { BookService } from '../services/book-service';
import { ChapterContentService } from '../services/chapter-content-service';

// 辅助函数：创建测试用小说
function createTestNovel(volumes: Volume[] = []): Novel {
  return {
    id: 'novel-1',
    title: 'Test Novel',
    lastEdited: new Date(),
    createdAt: new Date(),
    volumes: volumes,
  };
}

// 辅助函数：创建测试用段落
function createTestParagraph(id?: string, text?: string, translations?: Translation[]): Paragraph {
  const paraId = id || generateShortId();
  const transId = generateShortId();
  return {
    id: paraId,
    text: text || '测试段落文本',
    selectedTranslationId: translations?.[0]?.id || transId,
    translations: translations || [
      {
        id: transId,
        translation: '测试翻译',
        aiModelId: 'model-1',
      },
    ],
  };
}

// 辅助函数：创建测试用章节
function createTestChapter(id?: string, paragraphs?: Paragraph[], title?: string): Chapter {
  return {
    id: id || generateShortId(),
    title: {
      original: title || '测试章节',
      translation: {
        id: generateShortId(),
        translation: '',
        aiModelId: 'model-1',
      },
    },
    content: paragraphs,
    contentLoaded: paragraphs !== undefined,
    lastEdited: new Date(),
    createdAt: new Date(),
  };
}

// 辅助函数：创建测试用卷
function createTestVolume(id?: string, chapters?: Chapter[]): Volume {
  return {
    id: id || generateShortId(),
    title: {
      original: '测试卷',
      translation: {
        id: generateShortId(),
        translation: '',
        aiModelId: 'model-1',
      },
    },
    chapters: chapters || [],
  };
}

// 创建 mockUpdateBook
const mockUpdateBook = mock((_bookId: string, _updates: Partial<Novel>) => Promise.resolve());

// 创建一个 mock store 对象
const mockBooksStore: {
  books: Novel[];
  getBookById: (id: string) => Novel | undefined;
  updateBook: (
    id: string,
    updates: Partial<Novel>,
    options?: { persist?: boolean },
  ) => Promise<void>;
} = {
  books: [],
  getBookById: (id: string) => {
    return mockBooksStore.books.find((book) => book.id === id);
  },
  updateBook: mockUpdateBook,
  // Fix TS error since useBooksStore expects specific store interface, we cast later
};

// Mock useBooksStore（注意：useBooksStore 在运行时调用，不在模块加载时，所以 mock.module 可接受）
const mockUseBooksStore = mock(() => mockBooksStore);
await mock.module('src/stores/books', () => ({
  useBooksStore: mockUseBooksStore,
}));

// Import translationTools AFTER useBooksStore mock
const { translationTools } = await import('../services/ai/tools/translation-tools');
const { calculateAllowedBatchSize } = await import('../services/ai/tools/translation-tools');

// 使用 spyOn 替代 mock.module 来 mock BookService（避免全局污染模块缓存）
let mockGetBookById: ReturnType<typeof spyOn<typeof BookService, 'getBookById'>>;
let mockSaveBook: ReturnType<typeof spyOn<typeof BookService, 'saveBook'>>;

describe('add_translation_batch', () => {
  const mockLoadChapterContentsBatch = mock((_chapterIds: string[]) =>
    Promise.resolve(new Map<string, Paragraph[]>()),
  );

  beforeEach(() => {
    mockLoadChapterContentsBatch.mockClear();
    mockUpdateBook.mockClear();
    mockUseBooksStore.mockClear();

    // 使用 spyOn 拦截 BookService 静态方法（不污染模块缓存）
    mockGetBookById = spyOn(BookService, 'getBookById').mockImplementation(
      (_bookId: string) => Promise.resolve(undefined) as any,
    );
    mockSaveBook = spyOn(BookService, 'saveBook').mockImplementation(
      (_book: Novel) => Promise.resolve() as any,
    );

    spyOn(ChapterContentService, 'loadChapterContentsBatch').mockImplementation(
      mockLoadChapterContentsBatch,
    );

    mockUseBooksStore.mockImplementation(() => mockBooksStore);

    // 重置 mock store
    mockBooksStore.books = [];
  });

  afterEach(() => {
    mock.restore();
  });

  // 辅助函数：获取工具
  const getTool = () => {
    const tool = translationTools.find(
      (t) => t.definition.function?.name === 'add_translation_batch',
    );
    if (!tool?.handler) throw new Error('工具未找到');
    return tool;
  };

  // 辅助函数：创建 AI Processing Store
  const createMockAIProcessingStore = (
    taskId: string,
    status: string,
    taskType: string,
    chapterId?: string,
  ): AIProcessingStore => ({
    activeTasks: [
      {
        id: taskId,
        workflowStatus: status as any,
        type: taskType,
        bookId: 'novel-1',
        targetId: 'chapter-1',
        targetType: 'chapter',
        chapterId,
        status: status as any,
      } as any,
    ],
    addTask: mock(() => Promise.resolve('task-id')),
    updateTask: mock(() => Promise.resolve()),
    appendThinkingMessage: mock(() => Promise.resolve()),
    appendOutputContent: mock(() => Promise.resolve()),
    removeTask: mock(() => Promise.resolve()),
  });

  // 辅助函数：创建块边界
  const createChunkBoundaries = (paragraphIds: string[]): ChunkBoundaries => ({
    allowedParagraphIds: new Set(paragraphIds),
    paragraphIds,
    firstParagraphId: paragraphIds[0] || '',
    lastParagraphId: paragraphIds[paragraphIds.length - 1] || '',
  });

  describe('任务状态验证', () => {
    test('当 AI Processing Store 未初始化时应返回错误', async () => {
      const tool = getTool();
      const result = await tool.handler(
        { paragraphs: [{ paragraph_id: 'para1', translated_text: '翻译' }] },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('AI 处理 Store 未初始化');
    });

    test('当未提供任务 ID 时应返回错误', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        { paragraphs: [{ paragraph_id: 'para1', translated_text: '翻译' }] },
        {
          bookId: 'novel-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('未提供任务 ID');
    });

    test('当任务不存在时应返回错误', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        { paragraphs: [{ paragraph_id: 'para1', translated_text: '翻译' }] },
        {
          bookId: 'novel-1',
          taskId: 'non-existent-task',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('任务不存在');
    });

    test('当任务状态不是 working 时应返回错误', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'planning', 'translation');

      const result = await tool.handler(
        { paragraphs: [{ paragraph_id: 'para1', translated_text: '翻译' }] },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain("只能在 'working' 状态下调用此工具");
    });

    test('当任务状态为 review 时应返回错误', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'review', 'translation');

      const result = await tool.handler(
        { paragraphs: [{ paragraph_id: 'para1', translated_text: '翻译' }] },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain("只能在 'working' 状态下调用此工具");
    });

    test('当任务状态为 end 时应返回错误', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'end', 'translation');

      const result = await tool.handler(
        { paragraphs: [{ paragraph_id: 'para1', translated_text: '翻译' }] },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain("只能在 'working' 状态下调用此工具");
    });

    test('当任务状态为 working 时应通过验证', async () => {
      const para1 = createTestParagraph('para1', '原文1');
      const chapter = createTestChapter('chapter1', [para1]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        { paragraphs: [{ paragraph_id: 'para1', translated_text: '翻译文本' }] },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          aiModelId: 'model-1',
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);
    });
  });

  describe('批次参数验证', () => {
    test('当段落列表为空时应返回错误', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        { paragraphs: [] },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('段落列表不能为空');
    });

    test('当段落列表为 null 时应返回错误', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        { paragraphs: null as any },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('段落列表不能为空');
    });

    test('当段落列表超过容差范围时应返回错误', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const maxAllowed = Math.ceil(MAX_TRANSLATION_BATCH_SIZE * 1.1);
      // 创建超过容差范围的段落列表
      const paragraphs = Array(maxAllowed + 1)
        .fill(null)
        .map((_, i) => ({
          paragraph_id: `para${i}`,
          translated_text: `翻译${i}`,
        }));

      const result = await tool.handler(
        { paragraphs },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain(`单次批次最多支持 ${maxAllowed} 个段落`);
    });

    test('当段落列表在容差范围内时应通过并返回警告', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const maxAllowed = Math.ceil(MAX_TRANSLATION_BATCH_SIZE * 1.1);
      const paragraphs = Array(maxAllowed)
        .fill(null)
        .map((_, i) => ({
          paragraph_id: `para${i}`,
          translated_text: `翻译${i}`,
        }));

      const result = await tool.handler(
        { paragraphs },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('未提供 AI 模型 ID');
      expect(typeof resultObj.warning).toBe('string');
      expect(resultObj.warning).toContain('容差范围');
    });

    test('当段落项缺少翻译文本时应返回错误', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('缺少翻译文本');
    });

    test('当段落项翻译文本为空字符串时应返回错误', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('缺少翻译文本');
    });

    test('当段落项缺少 paragraph_id 时应返回错误', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [{ translated_text: '翻译' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('必须提供 paragraph_id');
    });
  });

  describe('段落标识符解析', () => {
    test('应使用 paragraph_id 成功提交', async () => {
      const para1 = createTestParagraph('para1', '原文1');
      const chapter = createTestChapter('chapter1', [para1]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '翻译' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          aiModelId: 'model-1',
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);
      expect(resultObj.processed_paragraph_ids).toContain('para1');
    });

    test('当仅使用 index 提交时应被拒绝（BREAKING）', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [{ index: 0, translated_text: '翻译' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          chunkBoundaries: createChunkBoundaries(['para1', 'para2']),
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('已废弃的 index 字段');
    });

    test('当同时提供 index 和 paragraph_id 时，index 存在不影响 paragraph_id 的使用', async () => {
      const para1 = createTestParagraph('para1', '原文1');
      const chapter = createTestChapter('chapter1', [para1]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      // 当 paragraph_id 有效时，即使 index 也存在，应正常通过
      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', index: 999, translated_text: '翻译' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          aiModelId: 'model-1',
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);
    });

    test('当 paragraph_id 为空字符串时应返回错误', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: '', translated_text: '翻译' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('必须提供 paragraph_id');
    });

    test('当 paragraph_id 为空白字符串时应返回错误', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: '   ', translated_text: '翻译' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('paragraph_id 必须是非空字符串');
    });
  });

  describe('重复段落 ID 检测', () => {
    test('当批次中存在重复 paragraph_id 时应返回错误', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [
            { paragraph_id: 'para1', translated_text: '翻译1' },
            { paragraph_id: 'para1', translated_text: '翻译2' },
          ],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('存在重复的段落 ID');
      expect(resultObj.error).toContain('para1');
    });

    test('当批次中存在多个重复段落时应列出所有重复 ID', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [
            { paragraph_id: 'para1', translated_text: '翻译1' },
            { paragraph_id: 'para2', translated_text: '翻译2' },
            { paragraph_id: 'para1', translated_text: '翻译3' },
            { paragraph_id: 'para2', translated_text: '翻译4' },
          ],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('存在重复的段落 ID');
      expect(resultObj.error).toContain('para1');
      expect(resultObj.error).toContain('para2');
    });
  });

  describe('段落范围验证', () => {
    test('当段落不在允许的范围内时应返回错误', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para-outside', translated_text: '翻译' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          chunkBoundaries: createChunkBoundaries(['para1', 'para2']),
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('不在当前任务范围内');
      expect(resultObj.error).toContain('para-outside');
    });

    test('当没有 chunkBoundaries 时应允许所有段落', async () => {
      const para1 = createTestParagraph('para1', '原文1');
      const chapter = createTestChapter('chapter1', [para1]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '翻译' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          aiModelId: 'model-1',
          // 不提供 chunkBoundaries
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);
    });
  });

  describe('书籍 ID 验证', () => {
    test('当未提供书籍 ID 时应返回错误', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '翻译' }],
        },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('未提供书籍 ID');
    });
  });

  describe('任务类型验证', () => {
    test('当任务类型不是 translation/polish/proofreading 时应返回错误', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'chapter_summary');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '翻译' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('任务类型不支持批量提交');
    });

    test('当任务类型为 polish 时应通过验证', async () => {
      const para1 = createTestParagraph('para1', '原文1');
      const chapter = createTestChapter('chapter1', [para1]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'polish');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '润色文本' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          aiModelId: 'model-1',
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);
      expect(resultObj.task_type).toBe('polish');
    });

    test('当任务类型为 proofreading 时应通过验证', async () => {
      const para1 = createTestParagraph('para1', '原文1');
      const chapter = createTestChapter('chapter1', [para1]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'proofreading');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '校对文本' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          aiModelId: 'model-1',
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);
      expect(resultObj.task_type).toBe('proofreading');
    });
  });

  describe('AI 模型 ID 验证', () => {
    test('当未提供 AI 模型 ID 时应返回错误', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '翻译' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          // 不提供 aiModelId
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('未提供 AI 模型 ID');
    });
  });

  describe('翻译保存逻辑', () => {
    test('翻译任务应创建新的翻译版本并设为选中', async () => {
      const para1 = createTestParagraph('para1', '原文1');
      const chapter = createTestChapter('chapter1', [para1]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      // 获取原始翻译数量
      const originalTransCount = para1.translations?.length || 0;
      const originalSelectedId = para1.selectedTranslationId;

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '新翻译文本' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          aiModelId: 'model-new',
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);

      // 验证新翻译已添加
      expect(para1.translations?.length).toBe(originalTransCount + 1);
      // 验证新翻译被设为选中
      expect(para1.selectedTranslationId).not.toBe(originalSelectedId);
      // 验证新翻译内容正确
      const newTranslation = para1.translations?.find((t) => t.id === para1.selectedTranslationId);
      expect(newTranslation?.translation).toBe('新翻译文本');
      expect(newTranslation?.aiModelId).toBe('model-new');
    });

    test('润色任务应创建新的翻译版本并设为选中', async () => {
      const para1 = createTestParagraph('para1', '原文1', [
        { id: 'trans1', translation: '原始翻译', aiModelId: 'model-old' },
      ]);
      para1.selectedTranslationId = 'trans1';

      const originalTransCount = para1.translations?.length || 0;
      const originalSelectedId = para1.selectedTranslationId;

      const chapter = createTestChapter('chapter1', [para1]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'polish');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '润色后的翻译' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          aiModelId: 'model-new',
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);

      // 验证新翻译被设为选中
      const selectedTrans = para1.translations?.find((t) => t.id === para1.selectedTranslationId);
      expect(selectedTrans?.translation).toBe('润色后的翻译');
      expect(selectedTrans?.aiModelId).toBe('model-new');
      expect(para1.selectedTranslationId).not.toBe(originalSelectedId);

      // 验证新增了翻译版本，并保留原翻译
      expect(para1.translations?.length).toBe(originalTransCount + 1);
      const originalTrans = para1.translations?.find((t) => t.id === 'trans1');
      expect(originalTrans?.translation).toBe('原始翻译');
      expect(originalTrans?.aiModelId).toBe('model-old');
    });

    test('校对任务应创建新的翻译版本并设为选中', async () => {
      const para1 = createTestParagraph('para1', '原文1', [
        { id: 'trans1', translation: '原始翻译', aiModelId: 'model-old' },
      ]);
      para1.selectedTranslationId = 'trans1';

      const originalTransCount = para1.translations?.length || 0;
      const originalSelectedId = para1.selectedTranslationId;

      const chapter = createTestChapter('chapter1', [para1]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'proofreading');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '校对后的翻译' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          aiModelId: 'model-proofread',
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);

      const selectedTrans = para1.translations?.find((t) => t.id === para1.selectedTranslationId);
      expect(selectedTrans?.translation).toBe('校对后的翻译');
      expect(selectedTrans?.aiModelId).toBe('model-proofread');
      expect(para1.selectedTranslationId).not.toBe(originalSelectedId);

      expect(para1.translations?.length).toBe(originalTransCount + 1);
      const originalTrans = para1.translations?.find((t) => t.id === 'trans1');
      expect(originalTrans?.translation).toBe('原始翻译');
      expect(originalTrans?.aiModelId).toBe('model-old');
    });

    test('当段落不存在时应返回错误', async () => {
      const para1 = createTestParagraph('para1', '原文1');
      const chapter = createTestChapter('chapter1', [para1]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'non-existent-para', translated_text: '翻译' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          aiModelId: 'model-1',
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('未找到以下段落');
    });

    test('应处理多个段落的批量保存', async () => {
      const para1 = createTestParagraph('para1', '原文1');
      const para2 = createTestParagraph('para2', '原文2');
      const chapter = createTestChapter('chapter1', [para1, para2]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [
            { paragraph_id: 'para1', translated_text: '翻译1' },
            { paragraph_id: 'para2', translated_text: '翻译2' },
          ],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          aiModelId: 'model-1',
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);
      expect(resultObj.processed_count).toBe(2);

      // 验证两个段落的翻译都已保存
      const trans1 = para1.translations?.find((t) => t.id === para1.selectedTranslationId);
      const trans2 = para2.translations?.find((t) => t.id === para2.selectedTranslationId);
      expect(trans1?.translation).toBe('翻译1');
      expect(trans2?.translation).toBe('翻译2');
    });

    test('当书籍不存在时应返回错误', async () => {
      mockGetBookById.mockImplementation(() => Promise.resolve(undefined));

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '翻译' }],
        },
        {
          bookId: 'non-existent-book',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          aiModelId: 'model-1',
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('书籍不存在');
    });

    test('当书籍缺少章节数据时应返回错误', async () => {
      const novel = createTestNovel([]);
      novel.volumes = undefined as any;

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '翻译' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          aiModelId: 'model-1',
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('缺少章节数据');
    });

    test('当任务包含 chapterId 时应仅加载指定章节（性能优化）', async () => {
      const para1 = createTestParagraph('para1', '原文1');
      const chapter1 = createTestChapter('chapter1', [para1]);
      const paraOther = createTestParagraph('para-other', '其他章节内容');
      const chapter2 = createTestChapter('chapter2', [paraOther]);
      const volume = createTestVolume('volume1', [chapter1, chapter2]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      // 传入 chapterId，触发优化路径
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation', 'chapter1');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '翻译文本' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          aiModelId: 'model-1',
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);
      expect(resultObj.processed_count).toBe(1);

      // 验证只访问了 chapter1 的段落
      const trans = para1.translations?.find((t) => t.id === para1.selectedTranslationId);
      expect(trans?.translation).toBe('翻译文本');
    });

    test('当 chapterId 指向不存在的章节时应返回错误', async () => {
      const para1 = createTestParagraph('para1', '原文1');
      const chapter1 = createTestChapter('chapter1', [para1]);
      const volume = createTestVolume('volume1', [chapter1]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore(
        'task-1',
        'working',
        'translation',
        'non-existent-chapter',
      );

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '翻译文本' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          aiModelId: 'model-1',
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('章节不存在');
    });
  });

  describe('多段落索引边界情况', () => {
    test('当多个段落在数组边界时应正确处理', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      // 创建刚好达到最大批次大小的段落列表
      const paragraphs = Array(MAX_TRANSLATION_BATCH_SIZE)
        .fill(null)
        .map((_, i) => ({
          paragraph_id: `para${i}`,
          translated_text: `翻译${i}`,
        }));

      const result = await tool.handler(
        { paragraphs },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          chunkBoundaries: createChunkBoundaries(paragraphs.map((p) => p.paragraph_id)),
        },
      );

      // 不会返回批次大小错误，但会因为找不到段落而失败（没有mock书籍数据）
      const resultObj = JSON.parse(result as string);
      // 验证批次大小没有超过限制
      expect(resultObj.error).not.toContain('单次批次最多支持');
    });
  });

  describe('拒绝旧 index 提交（BREAKING）', () => {
    test('仅使用 index 提交应被明确拒绝', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [{ index: 0, translated_text: '翻译' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          chunkBoundaries: createChunkBoundaries(['para0', 'para1']),
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('已废弃的 index 字段');
    });

    test('批次中包含 index-only 条目时整批应失败', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [
            { paragraph_id: 'para0', translated_text: '翻译0' },
            { index: 1, translated_text: '翻译1' },
          ],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          chunkBoundaries: createChunkBoundaries(['para0', 'para1']),
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('已废弃的 index 字段');
    });
  });

  describe('响应格式验证（paragraph_id 语义）', () => {
    test('成功响应应包含 processed_paragraph_ids 而非 processed_paragraphs', async () => {
      const para1 = createTestParagraph('para1', '原文1');
      const para2 = createTestParagraph('para2', '原文2');
      const chapter = createTestChapter('chapter1', [para1, para2]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [
            { paragraph_id: 'para1', translated_text: '翻译1' },
            { paragraph_id: 'para2', translated_text: '翻译2' },
          ],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          aiModelId: 'model-1',
          chunkBoundaries: createChunkBoundaries(['para1', 'para2', 'para3']),
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);
      // 新格式：processed_paragraph_ids（数组）
      expect(Array.isArray(resultObj.processed_paragraph_ids)).toBe(true);
      expect(resultObj.processed_paragraph_ids).toContain('para1');
      expect(resultObj.processed_paragraph_ids).toContain('para2');
      // 不再有旧格式的 processed_paragraphs（对象数组）
      expect(resultObj.processed_paragraphs).toBeUndefined();
    });

    test('翻译任务应返回 remaining_paragraph_ids 而非 remaining_paragraphs', async () => {
      const para1 = createTestParagraph('para1', '原文1');
      const para2 = createTestParagraph('para2', '原文2');
      const para3 = createTestParagraph('para3', '原文3');
      const chapter = createTestChapter('chapter1', [para1, para2, para3]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '翻译1' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          aiModelId: 'model-1',
          chunkBoundaries: createChunkBoundaries(['para1', 'para2', 'para3']),
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);
      expect(resultObj.remaining_count).toBe(2);
      // 新格式：remaining_paragraph_ids（字符串数组）
      expect(Array.isArray(resultObj.remaining_paragraph_ids)).toBe(true);
      expect(resultObj.remaining_paragraph_ids).toContain('para2');
      expect(resultObj.remaining_paragraph_ids).toContain('para3');
      // 不再有旧格式
      expect(resultObj.remaining_paragraphs).toBeUndefined();
    });
  });

  describe('onAction 回调', () => {
    test('成功保存后应调用 onAction 回调', async () => {
      const para1 = createTestParagraph('para1', '原文1');
      const chapter = createTestChapter('chapter1', [para1]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');
      const onAction = mock(() => {});

      await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '翻译文本' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          aiModelId: 'model-1',
          onAction,
        },
      );

      expect(onAction).toHaveBeenCalled();
      const actionArg = (onAction as any).mock.calls[0][0];
      expect(actionArg.type).toBe('update');
      expect(actionArg.entity).toBe('translation');
    });
  });
});

describe('calculateAllowedBatchSize', () => {
  const MAX_BATCH_SIZE = MAX_TRANSLATION_BATCH_SIZE;
  const MAX_WITH_TOLERANCE = Math.ceil(MAX_BATCH_SIZE * 1.1);
  const MAX_DOUBLE = MAX_BATCH_SIZE * 2;

  test('没有 chunk 信息时应返回容差上限', () => {
    const result = calculateAllowedBatchSize(undefined, undefined);
    expect(result.hardMax).toBe(MAX_WITH_TOLERANCE);
    expect(result.allowDoubleBatchSize).toBe(false);
    expect(result.remainingCount).toBe(0);
  });

  test('chunkTotal 为 0 时应返回容差上限', () => {
    const result = calculateAllowedBatchSize(0, 0);
    expect(result.hardMax).toBe(MAX_WITH_TOLERANCE);
    expect(result.allowDoubleBatchSize).toBe(false);
    expect(result.remainingCount).toBe(0);
  });

  test('剩余段落数超过 2x MAX_BATCH_SIZE 时应返回容差上限', () => {
    const chunkTotal = MAX_DOUBLE + 10;
    const result = calculateAllowedBatchSize(chunkTotal, 0);
    expect(result.hardMax).toBe(MAX_WITH_TOLERANCE);
    expect(result.allowDoubleBatchSize).toBe(false);
    expect(result.remainingCount).toBe(chunkTotal);
  });

  test('剩余段落数恰好等于 2x MAX_BATCH_SIZE 时应启用双倍模式', () => {
    const result = calculateAllowedBatchSize(MAX_DOUBLE, 0);
    expect(result.hardMax).toBe(MAX_DOUBLE);
    expect(result.allowDoubleBatchSize).toBe(true);
    expect(result.remainingCount).toBe(MAX_DOUBLE);
  });

  test('剩余段落数小于 2x MAX_BATCH_SIZE 时应启用双倍模式', () => {
    const chunkTotal = MAX_DOUBLE - 5;
    const result = calculateAllowedBatchSize(chunkTotal, 0);
    expect(result.hardMax).toBe(MAX_DOUBLE);
    expect(result.allowDoubleBatchSize).toBe(true);
    expect(result.remainingCount).toBe(chunkTotal);
  });

  test('已提交部分段落后，剩余数进入双倍范围时应启用双倍模式', () => {
    const chunkTotal = MAX_DOUBLE + 20;
    const submitted = chunkTotal - MAX_DOUBLE; // 剩余恰好 MAX_DOUBLE
    const result = calculateAllowedBatchSize(chunkTotal, submitted);
    expect(result.hardMax).toBe(MAX_DOUBLE);
    expect(result.allowDoubleBatchSize).toBe(true);
    expect(result.remainingCount).toBe(MAX_DOUBLE);
  });

  test('已提交部分段落后，剩余数仍超出双倍范围时应返回容差上限', () => {
    const chunkTotal = MAX_DOUBLE * 2;
    const submitted = 5; // 剩余远超 MAX_DOUBLE
    const result = calculateAllowedBatchSize(chunkTotal, submitted);
    expect(result.hardMax).toBe(MAX_WITH_TOLERANCE);
    expect(result.allowDoubleBatchSize).toBe(false);
    expect(result.remainingCount).toBe(chunkTotal - submitted);
  });

  test('submittedCount 为 undefined 时应视为 0', () => {
    const result = calculateAllowedBatchSize(MAX_BATCH_SIZE, undefined);
    expect(result.remainingCount).toBe(MAX_BATCH_SIZE);
    expect(result.allowDoubleBatchSize).toBe(true); // MAX_BATCH_SIZE <= MAX_DOUBLE
  });

  test('剩余数为 1 时应启用双倍模式', () => {
    const result = calculateAllowedBatchSize(10, 9);
    expect(result.hardMax).toBe(MAX_DOUBLE);
    expect(result.allowDoubleBatchSize).toBe(true);
    expect(result.remainingCount).toBe(1);
  });
});
