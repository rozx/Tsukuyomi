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

    return {
      ...tool,
      handler: async (args: Record<string, unknown>, context: Record<string, unknown>) => {
        const normalizedArgs = { ...args };
        const paragraphs = normalizedArgs.paragraphs;
        if (Array.isArray(paragraphs)) {
          const prefixByParagraphId = new Map<string, string>();
          const contextBookId = typeof context.bookId === 'string' ? context.bookId : undefined;

          if (contextBookId) {
            const book = await BookService.getBookById(contextBookId);
            if (book?.volumes) {
              for (const volume of book.volumes) {
                for (const chapter of volume.chapters || []) {
                  for (const paragraph of chapter.content || []) {
                    if (paragraph?.id && typeof paragraph.text === 'string') {
                      const trimmed = paragraph.text.trim();
                      if (trimmed.length > 0) {
                        prefixByParagraphId.set(paragraph.id, trimmed.slice(0, 5));
                      }
                    }
                  }
                }
              }
            }
          }

          normalizedArgs.paragraphs = paragraphs.map((item) => {
            if (
              !item ||
              typeof item !== 'object' ||
              !('paragraph_id' in item) ||
              typeof (item as { paragraph_id?: unknown }).paragraph_id !== 'string'
            ) {
              return item;
            }

            // 兼容既有测试：未显式提供 original_text_prefix 时，默认注入可通过前缀校验的占位值。
            // 新增前缀相关行为的专用用例会显式传入该字段，不受此兼容层影响。
            if (!Object.prototype.hasOwnProperty.call(item, 'original_text_prefix')) {
              const paragraphId = (item as { paragraph_id: string }).paragraph_id;
              const autoPrefix = prefixByParagraphId.get(paragraphId);
              // 注意：fallback 值须满足 MIN_ORIGINAL_TEXT_PREFIX_LENGTH（≥3 字符），
              // 避免在段落 ID 找不到对应原文时触发 ORIGINAL_TEXT_PREFIX_TOO_SHORT 错误。
              return {
                ...item,
                original_text_prefix: autoPrefix || '原文前',
              };
            }

            return item;
          });
        }

        return tool.handler(normalizedArgs, context as any);
      },
    };
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
          aiModelId: 'model-1',
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
          aiModelId: 'model-1',
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
          aiModelId: 'model-1',
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
          aiModelId: 'model-1',
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
          aiModelId: 'model-1',
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
          aiModelId: 'model-1',
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
          aiModelId: 'model-1',
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
          aiModelId: 'model-1',
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
          aiModelId: 'model-1',
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('书籍不存在');
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
          aiModelId: 'model-1',
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
          aiModelId: 'model-1',
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
          aiModelId: 'model-1',
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('必须提供 paragraph_id');
      expect(resultObj.error_code).toBe('MISSING_PARAGRAPH_ID');
      expect(Array.isArray(resultObj.invalid_items)).toBe(true);
      expect(resultObj.invalid_items[0]).toMatchObject({
        index: 0,
        reason: 'MISSING_PARAGRAPH_ID',
      });
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
          aiModelId: 'model-1',
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
          aiModelId: 'model-1',
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
          aiModelId: 'model-1',
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
          aiModelId: 'model-1',
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
          aiModelId: 'model-1',
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
          aiModelId: 'model-1',
          chunkBoundaries: createChunkBoundaries(['para1', 'para2']),
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('不在当前任务范围内');
      expect(resultObj.error).toContain('para-outside');
      expect(resultObj.error_code).toBe('OUT_OF_RANGE_PARAGRAPHS');
      expect(resultObj.invalid_paragraph_ids).toEqual(['para-outside']);
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
          aiModelId: 'model-1',
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
          aiModelId: 'model-1',
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
    test('翻译任务应验证通过并返回成功（实际写入由回调层完成）', async () => {
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
      expect(resultObj.processed_count).toBe(1);
      expect(resultObj.accepted_paragraphs).toEqual([
        {
          paragraph_id: 'para1',
          translated_text: '新翻译文本',
        },
      ]);

      // 工具层不再直接修改段落数据，翻译写入由 onParagraphsExtracted 回调统一完成
      expect(para1.translations?.length).toBe(originalTransCount);
    });

    test('纯符号段落提交与原文相同时应允许通过', async () => {
      const para1 = createTestParagraph('para1', '***');
      const chapter = createTestChapter('chapter1', [para1]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '***' }],
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
      expect(resultObj.processed_count).toBe(1);
    });

    test('纯符号段落提交与原文相同的各种符号形式应允许通过', async () => {
      const testCases = [
        { text: '***', translated: '***' },
        { text: '---', translated: '---' },
        // '……' 共 2 个 Unicode 码点，属于短原文，兼容层会自动注入 '……' 作为前缀，
        // 因为原文长度 < MIN_ORIGINAL_TEXT_PREFIX_LENGTH，有效最小长度会降至原文长度。
        { text: '……', translated: '……' },
        { text: '※※※', translated: '※※※' },
        { text: '☆★☆', translated: '☆★☆' },
      ];

      for (const { text, translated } of testCases) {
        const para1 = createTestParagraph('para1', text);
        const chapter = createTestChapter('chapter1', [para1]);
        const volume = createTestVolume('volume1', [chapter]);
        const novel = createTestNovel([volume]);

        mockGetBookById.mockImplementation(() => Promise.resolve(novel));
        mockBooksStore.books = [novel];

        const tool = getTool();
        const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

        const result = await tool.handler(
          {
            paragraphs: [{ paragraph_id: 'para1', translated_text: translated }],
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
      }
    });

    test('非纯符号段落提交与原文相同时应允许（不再阻止）', async () => {
      const para1 = createTestParagraph('para1', '这是原文');
      const chapter = createTestChapter('chapter1', [para1]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '这是原文' }],
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
    });

    test('与原文相同且命中当前选中版本时仍应拒绝', async () => {
      const para1 = createTestParagraph('para1', '这是原文', [
        { id: 'trans-selected', translation: '这是原文', aiModelId: 'model-old' },
      ]);
      para1.selectedTranslationId = 'trans-selected';

      const chapter = createTestChapter('chapter1', [para1]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '这是原文' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          aiModelId: 'model-new',
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(Array.isArray(resultObj.errors)).toBe(true);
      expect(resultObj.errors.join('\n')).toContain('当前选中版本相同');
    });

    test('重复译文命中当前选中版本时应拒绝提交', async () => {
      const para1 = createTestParagraph('para1', '原文1', [
        { id: 'trans-old', translation: '重复译文', aiModelId: 'model-old' },
        { id: 'trans-current', translation: '重复译文', aiModelId: 'model-current' },
      ]);
      para1.selectedTranslationId = 'trans-current';
      const originalCount = para1.translations?.length || 0;

      const chapter = createTestChapter('chapter1', [para1]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '重复译文' }],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          aiModelId: 'model-new',
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(Array.isArray(resultObj.errors)).toBe(true);
      expect(resultObj.errors.join('\n')).toContain('当前选中版本相同');
      expect(para1.selectedTranslationId).toBe('trans-current');
      expect(para1.translations?.length).toBe(originalCount);
    });

    test('重复译文未命中当前选中版本时应跳过并返回成功', async () => {
      const para1 = createTestParagraph('para1', '原文1', [
        { id: 'trans-old', translation: '重复译文', aiModelId: 'model-old' },
        { id: 'trans-selected', translation: '其他译文', aiModelId: 'model-selected' },
        { id: 'trans-latest', translation: '重复译文', aiModelId: 'model-latest' },
      ]);
      para1.selectedTranslationId = 'trans-selected';
      const originalCount = para1.translations?.length || 0;

      const chapter = createTestChapter('chapter1', [para1]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '重复译文' }],
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
      // 工具层不再修改段落数据，选中状态由回调层管理
      expect(para1.translations?.length).toBe(originalCount);
    });

    test('存在校验错误时重复译文错误应阻止提交', async () => {
      const para1 = createTestParagraph('para1', '原文1', [
        { id: 'trans-selected', translation: '重复译文', aiModelId: 'model-selected' },
      ]);
      para1.selectedTranslationId = 'trans-selected';
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
            { paragraph_id: 'para1', translated_text: '重复译文' },
            { paragraph_id: 'para2', translated_text: '原文2' },
          ],
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
      expect(resultObj.result_code).toBe('PARTIAL_SUCCESS');
      expect(resultObj.processed_count).toBe(1);
      expect(Array.isArray(resultObj.failed_paragraphs)).toBe(true);
      expect(resultObj.failed_paragraphs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            paragraph_id: 'para1',
          }),
        ]),
      );
    });

    test('润色任务应验证通过并返回成功（实际写入由回调层完成）', async () => {
      const para1 = createTestParagraph('para1', '原文1', [
        { id: 'trans1', translation: '原始翻译', aiModelId: 'model-old' },
      ]);
      para1.selectedTranslationId = 'trans1';

      const originalTransCount = para1.translations?.length || 0;

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
      expect(resultObj.task_type).toBe('polish');
      expect(resultObj.processed_count).toBe(1);

      // 工具层不再直接修改段落数据，翻译写入由 onParagraphsExtracted 回调统一完成
      expect(para1.translations?.length).toBe(originalTransCount);
    });

    test('校对任务应验证通过并返回成功（实际写入由回调层完成）', async () => {
      const para1 = createTestParagraph('para1', '原文1', [
        { id: 'trans1', translation: '原始翻译', aiModelId: 'model-old' },
      ]);
      para1.selectedTranslationId = 'trans1';

      const originalTransCount = para1.translations?.length || 0;

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
      expect(resultObj.task_type).toBe('proofreading');
      expect(resultObj.processed_count).toBe(1);

      // 工具层不再直接修改段落数据，翻译写入由 onParagraphsExtracted 回调统一完成
      expect(para1.translations?.length).toBe(originalTransCount);
    });

    test('当译文遗漏原文引号时应返回错误', async () => {
      const para1 = createTestParagraph('para1', '他说：「今天会下雨吗？」');
      const chapter = createTestChapter('chapter1', [para1]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');
      const originalTransCount = para1.translations?.length || 0;

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '他说今天会下雨吗？' }],
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
      expect(Array.isArray(resultObj.errors)).toBe(true);
      expect(resultObj.errors.join('\n')).toContain('缺少原文引号符号');
      expect(resultObj.errors.join('\n')).toContain('开引号');
      expect(resultObj.errors.join('\n')).toContain('闭引号');
      expect(para1.translations?.length).toBe(originalTransCount);
    });

    test('当「」转换为“”时应允许保存', async () => {
      const para1 = createTestParagraph('para1', '她说：「欢迎回来。」');
      const chapter = createTestChapter('chapter1', [para1]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [{ paragraph_id: 'para1', translated_text: '她说：“欢迎回来。”' }],
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
    });

    test('当原文引号不平衡时应按最小可用数量校验并允许提交', async () => {
      const para1 = createTestParagraph(
        'para1',
        '「え？　えっと、応援してくれると嬉しいです。具体的には最下部↓の「え？　えっと、応援してくれると嬉しいです。具体的には最下部↓の【☆☆☆☆☆】を【★★★★★】に、まだの方はブックマーク登録……なにこれ、理央ちゃん」',
      );
      const chapter = createTestChapter('chapter1', [para1]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [
            {
              paragraph_id: 'para1',
              translated_text:
                '“诶？呃，如果你愿意支持我就太好了。具体是在页面最下方把【☆☆☆☆☆】点成【★★★★★】，还没做的话请收藏……这什么啊，理央酱。”',
            },
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
      expect(resultObj.processed_count).toBe(1);
    });

    test('当原文引号不平衡且译文完全缺失引号时仍应拒绝', async () => {
      const para1 = createTestParagraph(
        'para1',
        '「え？　えっと、応援してくれると嬉しいです。具体的には最下部↓の「え？　えっと、応援してくれると嬉しいです。具体的には最下部↓の【☆☆☆☆☆】を【★★★★★】に、まだの方はブックマーク登録……なにこれ、理央ちゃん」',
      );
      const chapter = createTestChapter('chapter1', [para1]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [
            {
              paragraph_id: 'para1',
              translated_text:
                '诶？呃，如果你愿意支持我就太好了。具体是在页面最下方把【☆☆☆☆☆】点成【★★★★★】，还没做的话请收藏……这什么啊，理央酱。',
            },
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
      expect(resultObj.success).toBe(false);
      expect(Array.isArray(resultObj.errors)).toBe(true);
      expect(resultObj.errors.join('\n')).toContain('缺少原文引号符号');
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
            { paragraph_id: 'para1', original_text_prefix: '原文1', translated_text: '翻译1' },
            { paragraph_id: 'para2', original_text_prefix: '原文2', translated_text: '翻译2' },
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
    });

    test('当批次同时包含有效段落与前缀失败段落时应返回部分成功', async () => {
      const para1 = createTestParagraph('para1', '前缀校验原文一');
      const para2 = createTestParagraph('para2', '前缀校验原文二');
      const para3 = createTestParagraph('para3', '前缀校验原文三');
      const chapter = createTestChapter('chapter1', [para1, para2, para3]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      const result = await tool.handler(
        {
          paragraphs: [
            {
              paragraph_id: 'para1',
              original_text_prefix: '前缀校验',
              translated_text: '有效译文1',
            },
            {
              paragraph_id: 'para2',
              original_text_prefix: '',
              translated_text: '应失败译文2',
            },
            {
              paragraph_id: 'para3',
              original_text_prefix: '错误前缀',
              translated_text: '应失败译文3',
            },
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
      expect(resultObj.processed_count).toBe(1);
      expect(resultObj.result_code).toBe('PARTIAL_SUCCESS');
      expect(resultObj.accepted_paragraphs).toEqual([
        {
          paragraph_id: 'para1',
          translated_text: '有效译文1',
        },
      ]);
      expect(Array.isArray(resultObj.failed_paragraphs)).toBe(true);
      expect(resultObj.failed_paragraphs.length).toBe(2);
      expect(resultObj.failed_paragraphs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            paragraph_id: 'para2',
            error_code: 'MISSING_ORIGINAL_TEXT_PREFIX',
          }),
          expect.objectContaining({
            paragraph_id: 'para3',
            error_code: 'ORIGINAL_TEXT_PREFIX_MISMATCH',
          }),
        ]),
      );
    });

    test('当批次全部段落前缀校验失败时应返回整体失败并包含 failed_paragraphs', async () => {
      const para1 = createTestParagraph('para1', '全部失败原文一');
      const para2 = createTestParagraph('para2', '全部失败原文二');
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
            {
              paragraph_id: 'para1',
              original_text_prefix: '短',
              translated_text: '失败译文1',
            },
            {
              paragraph_id: 'para2',
              original_text_prefix: '错位前缀',
              translated_text: '失败译文2',
            },
          ],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          aiModelId: 'model-1',
          chunkBoundaries: createChunkBoundaries(['para1', 'para2']),
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error_code).toBe('ALL_PARAGRAPHS_FAILED');
      expect(Array.isArray(resultObj.failed_paragraphs)).toBe(true);
      expect(resultObj.failed_paragraphs.length).toBe(2);
      expect(resultObj.failed_paragraphs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            paragraph_id: 'para1',
            error_code: 'ORIGINAL_TEXT_PREFIX_TOO_SHORT',
          }),
          expect.objectContaining({
            paragraph_id: 'para2',
            error_code: 'ORIGINAL_TEXT_PREFIX_MISMATCH',
          }),
        ]),
      );
    });

    test('原文为单字符时应接受等于原文长度的前缀', async () => {
      // 场景：'♪' 这类单字符场景分隔符，合法前缀只能是 '♪' 本身（1字符），
      // 不应因 MIN_ORIGINAL_TEXT_PREFIX_LENGTH=3 被拒绝。
      const testCases = [
        { text: '♪', prefix: '♪' },
        { text: '…', prefix: '…' },
        { text: '—', prefix: '—' },
      ];

      for (const { text, prefix } of testCases) {
        const para1 = createTestParagraph('para1', text);
        const chapter = createTestChapter('chapter1', [para1]);
        const volume = createTestVolume('volume1', [chapter]);
        const novel = createTestNovel([volume]);

        mockGetBookById.mockImplementation(() => Promise.resolve(novel));
        mockBooksStore.books = [novel];

        const tool = getTool();
        const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

        const result = await tool.handler(
          {
            paragraphs: [
              { paragraph_id: 'para1', original_text_prefix: prefix, translated_text: '♫' },
            ],
          },
          {
            bookId: 'novel-1',
            taskId: 'task-1',
            aiProcessingStore: mockStore,
            aiModelId: 'model-1',
            chunkBoundaries: createChunkBoundaries(['para1']),
          },
        );

        const resultObj = JSON.parse(result as string);
        expect(resultObj.success).toBe(true);
      }
    });

    test('原文为两字符时前缀须至少等于原文长度', async () => {
      const para1 = createTestParagraph('para1', '……');
      const chapter = createTestChapter('chapter1', [para1]);
      const volume = createTestVolume('volume1', [chapter]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const tool = getTool();
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

      // 只提供 1 字符前缀（原文为 2 字符，有效最小长度为 2）→ 应失败
      const failResult = await tool.handler(
        {
          paragraphs: [
            { paragraph_id: 'para1', original_text_prefix: '…', translated_text: '...' },
          ],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          aiModelId: 'model-1',
          chunkBoundaries: createChunkBoundaries(['para1']),
        },
      );
      const failObj = JSON.parse(failResult as string);
      expect(failObj.success).toBe(false);
      expect(JSON.stringify(failObj)).toContain('ORIGINAL_TEXT_PREFIX_TOO_SHORT');

      // 提供完整原文 '……' 作为前缀 → 应通过
      const passResult = await tool.handler(
        {
          paragraphs: [
            { paragraph_id: 'para1', original_text_prefix: '……', translated_text: '...' },
          ],
        },
        {
          bookId: 'novel-1',
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          aiModelId: 'model-1',
          chunkBoundaries: createChunkBoundaries(['para1']),
        },
      );
      const passObj = JSON.parse(passResult as string);
      expect(passObj.success).toBe(true);
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

    test('当缺少 chapterId 时应记录性能风险警告并走回退路径', async () => {
      const para1 = createTestParagraph('para1', '原文1');
      const chapter1 = createTestChapter('chapter1', [para1]);
      const chapter2 = createTestChapter('chapter2', []);
      const volume = createTestVolume('volume1', [chapter1, chapter2]);
      const novel = createTestNovel([volume]);

      mockGetBookById.mockImplementation(() => Promise.resolve(novel));
      mockBooksStore.books = [novel];

      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

      const tool = getTool();
      // 不传 chapterId，触发回退路径
      const mockStore = createMockAIProcessingStore('task-1', 'working', 'translation');

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
      expect(warnSpy).toHaveBeenCalledWith(
        '[translation-tools] ⚠️ 未提供 chapterId，触发惰性章节扫描。建议确保任务对象包含 chapterId 以提升性能',
        expect.objectContaining({
          bookId: 'novel-1',
          taskType: 'translation',
          batchSize: 1,
          totalChapterCount: 2,
        }),
      );
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
          aiModelId: 'model-1',
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
          aiModelId: 'model-1',
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
          aiModelId: 'model-1',
          chunkBoundaries: createChunkBoundaries(['para0', 'para1']),
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('已废弃的 index 字段');
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
