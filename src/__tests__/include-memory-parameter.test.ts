import './setup';
import { describe, test, expect, beforeEach, spyOn } from 'bun:test';
import { terminologyTools } from 'src/services/ai/tools/terminology-tools';
import { characterTools } from 'src/services/ai/tools/character-tools';
import { bookTools } from 'src/services/ai/tools/book-tools';
import { paragraphTools } from 'src/services/ai/tools/paragraph-tools';
import { searchRelatedMemories } from 'src/services/ai/tools/memory-helper';
import { MemoryService } from 'src/services/memory-service';
import { useBooksStore } from 'src/stores/books';
import type { ToolContext } from 'src/services/ai/tools/types';
import type { Memory } from 'src/models/memory';
import type { Novel } from 'src/models/novel';

// Mock searchRelatedMemories
const mockSearchRelatedMemories = spyOn(
  { searchRelatedMemories },
  'searchRelatedMemories',
).mockResolvedValue([]);

describe('include_memory 参数测试', () => {
  const bookId = 'test-book-1';
  const context: ToolContext = {
    bookId,
  };

  beforeEach(() => {
    mockSearchRelatedMemories.mockClear();
    mockSearchRelatedMemories.mockResolvedValue([]);
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
            sex: 'unknown',
            description: '测试角色描述',
            speakingStyle: '',
            aliases: [],
          },
        ],
        volumes: [],
      };

      spyOn(useBooksStore(), 'getBookById').mockReturnValue(mockBook);
    });

    test('get_term: include_memory=true 时应该搜索相关记忆', async () => {
      const mockMemories: Array<{ id: string; summary: string }> = [
        { id: 'memory-1', summary: '相关记忆1' },
        { id: 'memory-2', summary: '相关记忆2' },
      ];
      mockSearchRelatedMemories.mockResolvedValue(mockMemories);

      const tool = terminologyTools.find((t) => t.definition.function.name === 'get_term');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ name: 'テスト', include_memory: true }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.term).toBeDefined();
      expect(parsed.related_memories).toEqual(mockMemories);
      expect(mockSearchRelatedMemories).toHaveBeenCalledWith(bookId, ['テスト'], 5);
    });

    test('get_term: include_memory=false 时不应该搜索相关记忆', async () => {
      const tool = terminologyTools.find((t) => t.definition.function.name === 'get_term');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ name: 'テスト', include_memory: false }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.term).toBeDefined();
      expect(parsed.related_memories).toBeUndefined();
      expect(mockSearchRelatedMemories).not.toHaveBeenCalled();
    });

    test('get_term: 默认 include_memory 应该为 true', async () => {
      const mockMemories: Array<{ id: string; summary: string }> = [
        { id: 'memory-1', summary: '相关记忆1' },
      ];
      mockSearchRelatedMemories.mockResolvedValue(mockMemories);

      const tool = terminologyTools.find((t) => t.definition.function.name === 'get_term');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ name: 'テスト' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.related_memories).toBeDefined();
      expect(mockSearchRelatedMemories).toHaveBeenCalled();
    });

    test('search_terms_by_keywords: include_memory=true 时应该搜索相关记忆', async () => {
      const mockMemories: Array<{ id: string; summary: string }> = [
        { id: 'memory-1', summary: '相关记忆1' },
      ];
      mockSearchRelatedMemories.mockResolvedValue(mockMemories);

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
      expect(mockSearchRelatedMemories).toHaveBeenCalledWith(bookId, ['テスト'], 5);
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
      expect(mockSearchRelatedMemories).not.toHaveBeenCalled();
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
            sex: 'unknown',
            description: '测试角色描述',
            speakingStyle: '',
            aliases: [],
          },
        ],
        volumes: [],
      };

      spyOn(useBooksStore(), 'getBookById').mockReturnValue(mockBook);
    });

    test('get_character: include_memory=true 时应该搜索相关记忆', async () => {
      const mockMemories: Array<{ id: string; summary: string }> = [
        { id: 'memory-1', summary: '相关记忆1' },
      ];
      mockSearchRelatedMemories.mockResolvedValue(mockMemories);

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
      expect(mockSearchRelatedMemories).toHaveBeenCalledWith(bookId, ['テストキャラ'], 5);
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
      expect(mockSearchRelatedMemories).not.toHaveBeenCalled();
    });

    test('search_characters_by_keywords: include_memory=true 时应该搜索相关记忆', async () => {
      const mockMemories: Array<{ id: string; summary: string }> = [
        { id: 'memory-1', summary: '相关记忆1' },
      ];
      mockSearchRelatedMemories.mockResolvedValue(mockMemories);

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
      expect(mockSearchRelatedMemories).toHaveBeenCalledWith(bookId, ['テスト'], 5);
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

      spyOn(useBooksStore(), 'getBookById').mockReturnValue(mockBook);
    });

    test('get_book_info: include_memory=true 时应该搜索相关记忆', async () => {
      const mockMemories: Array<{ id: string; summary: string }> = [
        { id: 'memory-1', summary: '相关记忆1' },
      ];
      mockSearchRelatedMemories.mockResolvedValue(mockMemories);

      const tool = bookTools.find((t) => t.definition.function.name === 'get_book_info');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ include_memory: true }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.book).toBeDefined();
      expect(parsed.related_memories).toEqual(mockMemories);
      expect(mockSearchRelatedMemories).toHaveBeenCalledWith(
        bookId,
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
      expect(mockSearchRelatedMemories).not.toHaveBeenCalled();
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

      spyOn(useBooksStore(), 'getBookById').mockReturnValue(mockBook);
    });

    test('get_paragraph_info: include_memory=true 时应该搜索相关记忆', async () => {
      const mockMemories: Array<{ id: string; summary: string }> = [
        { id: 'memory-1', summary: '相关记忆1' },
      ];
      mockSearchRelatedMemories.mockResolvedValue(mockMemories);

      const tool = paragraphTools.find((t) => t.definition.function.name === 'get_paragraph_info');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ paragraph_id: 'para-1', include_memory: true }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.paragraph).toBeDefined();
      // 注意：由于 extractKeywordsFromParagraph 会从段落文本中提取关键词，这里只验证是否调用了搜索
      expect(mockSearchRelatedMemories).toHaveBeenCalled();
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
      expect(mockSearchRelatedMemories).not.toHaveBeenCalled();
    });

    test('find_paragraph_by_keywords: include_memory=true 时应该搜索相关记忆', async () => {
      const mockMemories: Array<{ id: string; summary: string }> = [
        { id: 'memory-1', summary: '相关记忆1' },
      ];
      mockSearchRelatedMemories.mockResolvedValue(mockMemories);

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
      expect(mockSearchRelatedMemories).toHaveBeenCalledWith(bookId, ['テスト'], 5);
    });
  });

  describe('错误处理', () => {
    test('当记忆搜索失败时应该静默处理，不影响主要功能', async () => {
      mockSearchRelatedMemories.mockRejectedValue(new Error('Memory search failed'));

      const tool = terminologyTools.find((t) => t.definition.function.name === 'get_term');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ name: 'テスト', include_memory: true }, context);
      const parsed = JSON.parse(result);

      // 主要功能应该仍然成功
      expect(parsed.success).toBe(true);
      expect(parsed.term).toBeDefined();
      // 相关记忆应该为空或不存在
      expect(parsed.related_memories).toBeUndefined();
    });
  });
});

