import './setup';
import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { terminologyTools } from 'src/services/ai/tools/terminology-tools';
import { characterTools } from 'src/services/ai/tools/character-tools';
import { bookTools } from 'src/services/ai/tools/book-tools';
import { paragraphTools } from 'src/services/ai/tools/paragraph-tools';
import * as MemoryHelperModule from 'src/services/ai/tools/memory-helper';
import { MemoryService } from 'src/services/memory-service';
import type { ToolContext } from 'src/services/ai/tools/types';
import type { Memory } from 'src/models/memory';
import type { Novel } from 'src/models/novel';

// Mock IndexedDB
const mockStoreGet = mock((_key: string) => Promise.resolve(undefined as unknown));
const mockStorePut = mock(() => Promise.resolve(undefined));
const mockStoreDelete = mock(() => Promise.resolve(undefined));
const mockStoreGetAll = mock(() => Promise.resolve([]));
const mockStoreCount = mock(() => Promise.resolve(0));

const mockIndexGetAll = mock(() => Promise.resolve([]));
const mockIndexCount = mock(() => Promise.resolve(0));

const mockTransaction = mock((_mode: 'readonly' | 'readwrite') => ({
  objectStore: () => ({
    get: mockStoreGet,
    put: mockStorePut,
    delete: mockStoreDelete,
    getAll: mockStoreGetAll,
    count: mockStoreCount,
    index: () => ({
      getAll: mockIndexGetAll,
      count: mockIndexCount,
    }),
  }),
  store: {
    index: () => ({
      getAll: mockIndexGetAll,
      count: mockIndexCount,
    }),
  },
  done: Promise.resolve(),
}));

const mockPut = mock((_storeName: string, _value: unknown) => Promise.resolve(undefined));
const mockGet = mock((_storeName: string, _key: string) => Promise.resolve(undefined as unknown));
const mockDelete = mock((_storeName: string, _key: string) => Promise.resolve(undefined));

const mockDb = {
  getAll: mock(() => Promise.resolve([])),
  get: mockGet,
  put: mockPut,
  delete: mockDelete,
  transaction: mockTransaction,
  objectStoreNames: {
    contains: mock(() => false),
  },
};

await mock.module('src/utils/indexed-db', () => ({
  getDB: () => Promise.resolve(mockDb),
}));

// Mock searchRelatedMemoriesHybrid（局部使用，不在文件顶层全局 mock）
const mockSearchRelatedMemoriesHybrid = mock(
  (
    _bookId: string,
    _attachments: Array<{ type: string; id: string }>,
    _keywords: string[],
    _limit: number = 5,
  ): Promise<Array<{ id: string; summary: string }>> => {
    return Promise.resolve([]);
  },
);

// Mock useAIModelsStore
const mockUseAIModelsStore = mock(() => ({
  getModelById: mock((id: string) => ({
    id,
    name: `Model ${id}`,
    provider: 'openai',
    model: 'gpt-4',
  })),
  getDefaultModelForTask: mock(() => ({
    id: 'model-1',
    name: 'Test Model',
    provider: 'openai',
    model: 'gpt-4',
  })),
}));

await mock.module('src/stores/ai-models', () => ({
  useAIModelsStore: mockUseAIModelsStore,
}));

// Mock useBooksStore
const mockBooksStore = {
  getBookById: mock((_id: string): Novel | undefined => undefined),
  updateBook: mock(() => Promise.resolve()),
};
await mock.module('src/stores/books', () => ({
  useBooksStore: () => mockBooksStore,
}));

// Mock BookService
const mockBookService = {
  getBookById: mock((_id: string, _loadContent?: boolean): Promise<Novel | undefined> => Promise.resolve(undefined)),
};
await mock.module('src/services/book-service', () => ({
  BookService: mockBookService,
}));

let searchRelatedMemoriesSpy: ReturnType<typeof spyOn>;

describe('include_memory 参数测试', () => {
  const bookId = 'test-book-1';
  const context: ToolContext = {
    bookId,
  };

  beforeEach(() => {
    mockSearchRelatedMemoriesHybrid.mockClear();
    mockSearchRelatedMemoriesHybrid.mockReset();
    mockSearchRelatedMemoriesHybrid.mockResolvedValue([]);
    if (searchRelatedMemoriesSpy) {
      searchRelatedMemoriesSpy.mockRestore();
    }
    const hybridMock =
      mockSearchRelatedMemoriesHybrid as unknown as typeof MemoryHelperModule.searchRelatedMemoriesHybrid;
    searchRelatedMemoriesSpy = spyOn(
      MemoryHelperModule,
      'searchRelatedMemoriesHybrid',
    ).mockImplementation(hybridMock);
    // 重置 IndexedDB mocks
    mockStoreGet.mockClear();
    mockStorePut.mockClear();
    mockStoreDelete.mockClear();
    mockStoreGetAll.mockClear();
    mockStoreCount.mockClear();
    mockIndexGetAll.mockClear();
    mockIndexCount.mockClear();
    mockTransaction.mockClear();
    mockGet.mockClear();
    mockPut.mockClear();
    mockDelete.mockClear();
  });

  afterEach(() => {
    mockSearchRelatedMemoriesHybrid.mockReset();
    mockSearchRelatedMemoriesHybrid.mockResolvedValue([]);
    if (searchRelatedMemoriesSpy) {
      searchRelatedMemoriesSpy.mockRestore();
    }
  });

  describe('terminology-tools', () => {
    beforeEach(() => {
      // Mock useBooksStore
      const mockBook: Novel = {
        id: bookId,
        title: 'Test Book',
        lastEdited: new Date(),
        createdAt: new Date(),
        terminologies: [
          {
            id: 'term-1',
            name: 'テスト',
            translation: {
              id: 'trans-1',
              translation: '测试',
              aiModelId: 'model-1',
            },
            description: '测试术语',
          },
        ],
        characterSettings: [
          {
            id: 'char-1',
            name: 'テストキャラ',
            translation: {
              id: 'trans-2',
              translation: '测试角色',
              aiModelId: 'model-1',
            },
            sex: undefined,
            description: '测试角色描述',
            speakingStyle: '',
            aliases: [],
          },
        ],
        volumes: [],
      };

      mockBooksStore.getBookById.mockReturnValue(mockBook);
      mockBookService.getBookById.mockResolvedValue(mockBook);
    });

    test('get_term: include_memory=true 时应该搜索相关记忆', async () => {
      const mockMemories: Array<{ id: string; summary: string }> = [
        { id: 'memory-1', summary: '相关记忆1' },
        { id: 'memory-2', summary: '相关记忆2' },
      ];
      mockSearchRelatedMemoriesHybrid.mockResolvedValue(mockMemories);

      const tool = terminologyTools.find((t) => t.definition.function.name === 'get_term');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ name: 'テスト', include_memory: true }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.term).toBeDefined();
      expect(parsed.related_memories).toEqual(mockMemories);
      expect(mockSearchRelatedMemoriesHybrid).toHaveBeenCalledWith(
        bookId,
        [{ type: 'term', id: 'term-1' }],
        ['テスト'],
        5,
      );
    });

    test('get_term: include_memory=false 时不应该搜索相关记忆', async () => {
      const tool = terminologyTools.find((t) => t.definition.function.name === 'get_term');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ name: 'テスト', include_memory: false }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.term).toBeDefined();
      expect(parsed.related_memories).toBeUndefined();
      expect(mockSearchRelatedMemoriesHybrid).not.toHaveBeenCalled();
    });

    test('get_term: 默认 include_memory 应该为 true', async () => {
      const mockMemories: Array<{ id: string; summary: string }> = [
        { id: 'memory-1', summary: '相关记忆1' },
      ];
      mockSearchRelatedMemoriesHybrid.mockResolvedValue(mockMemories);

      const tool = terminologyTools.find((t) => t.definition.function.name === 'get_term');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ name: 'テスト' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.related_memories).toBeDefined();
      expect(mockSearchRelatedMemoriesHybrid).toHaveBeenCalled();
    });

    test('search_terms_by_keywords: include_memory=true 时应该搜索相关记忆', async () => {
      const mockMemories: Array<{ id: string; summary: string }> = [
        { id: 'memory-1', summary: '相关记忆1' },
      ];
      mockSearchRelatedMemoriesHybrid.mockResolvedValue(mockMemories);

      const tool = terminologyTools.find(
        (t) => t.definition.function.name === 'search_terms_by_keywords',
      );
      expect(tool).toBeDefined();

      const result = await tool!.handler(
        { keywords: ['テスト'], include_memory: true },
        context,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.terms).toBeDefined();
      expect(parsed.related_memories).toEqual(mockMemories);
      expect(mockSearchRelatedMemoriesHybrid).toHaveBeenCalledWith(
        bookId,
        [{ type: 'term', id: 'term-1' }],
        ['テスト'],
        5,
      );
    });

    test('search_terms_by_keywords: include_memory=false 时不应该搜索相关记忆', async () => {
      const tool = terminologyTools.find(
        (t) => t.definition.function.name === 'search_terms_by_keywords',
      );
      expect(tool).toBeDefined();

      const result = await tool!.handler(
        { keywords: ['テスト'], include_memory: false },
        context,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.terms).toBeDefined();
      expect(parsed.related_memories).toBeUndefined();
      expect(mockSearchRelatedMemoriesHybrid).not.toHaveBeenCalled();
    });
  });

  describe('character-tools', () => {
    beforeEach(() => {
      const mockBook: Novel = {
        id: bookId,
        title: 'Test Book',
        lastEdited: new Date(),
        createdAt: new Date(),
        terminologies: [],
        characterSettings: [
          {
            id: 'char-1',
            name: 'テストキャラ',
            translation: {
              id: 'trans-2',
              translation: '测试角色',
              aiModelId: 'model-1',
            },
            sex: undefined,
            description: '测试角色描述',
            speakingStyle: '',
            aliases: [],
          },
        ],
        volumes: [],
      };

      mockBooksStore.getBookById.mockReturnValue(mockBook);
      mockBookService.getBookById.mockResolvedValue(mockBook);
    });

    test('get_character: include_memory=true 时应该搜索相关记忆', async () => {
      const mockMemories: Array<{ id: string; summary: string }> = [
        { id: 'memory-1', summary: '相关记忆1' },
      ];
      mockSearchRelatedMemoriesHybrid.mockResolvedValue(mockMemories);

      const tool = characterTools.find((t) => t.definition.function.name === 'get_character');
      expect(tool).toBeDefined();

      const result = await tool!.handler(
        { name: 'テストキャラ', include_memory: true },
        context,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.character).toBeDefined();
      expect(parsed.related_memories).toEqual(mockMemories);
      expect(mockSearchRelatedMemoriesHybrid).toHaveBeenCalledWith(
        bookId,
        [{ type: 'character', id: 'char-1' }],
        ['テストキャラ'],
        5,
      );
    });

    test('get_character: include_memory=false 时不应该搜索相关记忆', async () => {
      const tool = characterTools.find((t) => t.definition.function.name === 'get_character');
      expect(tool).toBeDefined();

      const result = await tool!.handler(
        { name: 'テストキャラ', include_memory: false },
        context,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.character).toBeDefined();
      expect(parsed.related_memories).toBeUndefined();
      expect(mockSearchRelatedMemoriesHybrid).not.toHaveBeenCalled();
    });

    test('search_characters_by_keywords: include_memory=true 时应该搜索相关记忆', async () => {
      const mockMemories: Array<{ id: string; summary: string }> = [
        { id: 'memory-1', summary: '相关记忆1' },
      ];
      mockSearchRelatedMemoriesHybrid.mockResolvedValue(mockMemories);

      const tool = characterTools.find(
        (t) => t.definition.function.name === 'search_characters_by_keywords',
      );
      expect(tool).toBeDefined();

      const result = await tool!.handler(
        { keywords: ['テスト'], include_memory: true },
        context,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.characters).toBeDefined();
      expect(parsed.related_memories).toEqual(mockMemories);
      expect(mockSearchRelatedMemoriesHybrid).toHaveBeenCalledWith(
        bookId,
        [{ type: 'character', id: 'char-1' }],
        ['テスト'],
        5,
      );
    });
  });

  describe('book-tools', () => {
    beforeEach(() => {
      const mockBook: Novel = {
        id: bookId,
        title: 'Test Book',
        author: 'Test Author',
        lastEdited: new Date(),
        createdAt: new Date(),
        terminologies: [],
        characterSettings: [],
        volumes: [],
      };

      mockBooksStore.getBookById.mockReturnValue(mockBook);
      mockBookService.getBookById.mockResolvedValue(mockBook);
    });

    test('get_book_info: include_memory=true 时应该搜索相关记忆', async () => {
      const mockMemories: Array<{ id: string; summary: string }> = [
        { id: 'memory-1', summary: '相关记忆1' },
      ];
      mockSearchRelatedMemoriesHybrid.mockResolvedValue(mockMemories);

      const tool = bookTools.find((t) => t.definition.function.name === 'get_book_info');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ include_memory: true }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.book).toBeDefined();
      expect(parsed.related_memories).toEqual(mockMemories);
      expect(mockSearchRelatedMemoriesHybrid).toHaveBeenCalledWith(
        bookId,
        [{ type: 'book', id: bookId }],
        ['Test Book', 'Test Author'],
        5,
      );
    });

    test('get_book_info: include_memory=false 时不应该搜索相关记忆', async () => {
      const tool = bookTools.find((t) => t.definition.function.name === 'get_book_info');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ include_memory: false }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.book).toBeDefined();
      expect(parsed.related_memories).toBeUndefined();
      expect(mockSearchRelatedMemoriesHybrid).not.toHaveBeenCalled();
    });
  });

  describe('paragraph-tools', () => {
    beforeEach(() => {
      const mockBook: Novel = {
        id: bookId,
        title: 'Test Book',
        lastEdited: new Date(),
        createdAt: new Date(),
        terminologies: [],
        characterSettings: [],
        volumes: [
          {
            id: 'volume-1',
            title: {
              original: 'Volume 1',
              translation: {
                id: 'trans-1',
                translation: '',
                aiModelId: 'model-1',
              },
            },
            chapters: [
              {
                id: 'chapter-1',
                title: {
                  original: 'Chapter 1',
                  translation: {
                    id: 'trans-2',
                    translation: '',
                    aiModelId: 'model-1',
                  },
                },
                content: [
                  {
                    id: 'para-1',
                    text: 'テスト段落',
                    selectedTranslationId: 'trans-3',
                    translations: [
                      {
                        id: 'trans-3',
                        translation: '测试段落',
                        aiModelId: 'model-1',
                      },
                    ],
                  },
                ],
                contentLoaded: true,
                lastEdited: new Date(),
                createdAt: new Date(),
              },
            ],
          },
        ],
      };

      mockBooksStore.getBookById.mockReturnValue(mockBook);
      mockBookService.getBookById.mockResolvedValue(mockBook);
    });

    test('get_paragraph_info: include_memory=true 时应该搜索相关记忆', async () => {
      const mockMemories: Array<{ id: string; summary: string }> = [
        { id: 'memory-1', summary: '相关记忆1' },
      ];
      mockSearchRelatedMemoriesHybrid.mockResolvedValue(mockMemories);

      const tool = paragraphTools.find((t) => t.definition.function.name === 'get_paragraph_info');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ paragraph_id: 'para-1', include_memory: true }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.paragraph).toBeDefined();
      // 注意：由于 extractKeywordsFromParagraph 会从段落文本中提取关键词，这里只验证是否调用了搜索
      expect(mockSearchRelatedMemoriesHybrid).toHaveBeenCalled();
    });

    test('get_paragraph_info: include_memory=false 时不应该搜索相关记忆', async () => {
      const tool = paragraphTools.find((t) => t.definition.function.name === 'get_paragraph_info');
      expect(tool).toBeDefined();

      const result = await tool!.handler(
        { paragraph_id: 'para-1', include_memory: false },
        context,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.paragraph).toBeDefined();
      expect(parsed.related_memories).toBeUndefined();
      expect(mockSearchRelatedMemoriesHybrid).not.toHaveBeenCalled();
    });

    test('find_paragraph_by_keywords: include_memory=true 时应该搜索相关记忆', async () => {
      const mockMemories: Array<{ id: string; summary: string }> = [
        { id: 'memory-1', summary: '相关记忆1' },
      ];
      mockSearchRelatedMemoriesHybrid.mockResolvedValue(mockMemories);

      const tool = paragraphTools.find(
        (t) => t.definition.function.name === 'find_paragraph_by_keywords',
      );
      expect(tool).toBeDefined();

      const result = await tool!.handler(
        { keywords: ['テスト'], include_memory: true },
        context,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.paragraphs).toBeDefined();
      expect(parsed.related_memories).toEqual(mockMemories);
      expect(mockSearchRelatedMemoriesHybrid).toHaveBeenCalledWith(
        bookId,
        [],
        ['テスト'],
        5,
      );
    });
  });

  describe('错误处理', () => {
    beforeEach(() => {
      // Mock book for error handling tests
      const mockBook: Novel = {
        id: bookId,
        title: 'Test Book',
        lastEdited: new Date(),
        createdAt: new Date(),
        terminologies: [
          {
            id: 'term-1',
            name: 'テスト',
            translation: {
              id: 'trans-1',
              translation: '测试',
              aiModelId: 'model-1',
            },
            description: '测试术语',
          },
        ],
        characterSettings: [],
        volumes: [],
      };

      mockBooksStore.getBookById.mockReturnValue(mockBook);
      mockBookService.getBookById.mockResolvedValue(mockBook);
    });

    test('当记忆搜索失败时应该静默处理，不影响主要功能', async () => {
      mockSearchRelatedMemoriesHybrid.mockRejectedValue(new Error('Memory search failed'));

      const tool = terminologyTools.find((t) => t.definition.function.name === 'get_term');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ name: 'テスト', include_memory: true }, context);
      const parsed = JSON.parse(result);

      // 主要功能应该仍然成功
      expect(parsed.success).toBe(true);
      expect(parsed.term).toBeDefined();
      // 相关记忆应该为空或不存在
      expect(parsed.related_memories).toBeUndefined();
      
      // 重置 mock，避免影响后续测试
      mockSearchRelatedMemoriesHybrid.mockReset();
      mockSearchRelatedMemoriesHybrid.mockResolvedValue([]);
    });
  });

});
