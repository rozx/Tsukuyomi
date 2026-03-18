import './setup';
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import type { Novel } from '../models/novel';

// Mock updateBook
const mockUpdateBook = mock((_bookId: string, _updates: Partial<Novel>) => Promise.resolve());

// Create mock store
const mockBooksStore: any = {
  books: [],
  getBookById: (id: string) => {
    return mockBooksStore.books.find((book: Novel) => book.id === id);
  },
  updateBook: mockUpdateBook,
};

// Mock useBooksStore
const mockUseBooksStore = mock(() => mockBooksStore);
await mock.module('src/stores/books', () => ({
  useBooksStore: mockUseBooksStore,
}));

// Import tools after mock
const { characterTools } = await import('../services/ai/tools/character-tools');
const { terminologyTools } = await import('../services/ai/tools/terminology-tools');

describe('Fallback Search for AI Tools', () => {
  beforeEach(() => {
    mockUseBooksStore.mockClear();

    // Create test book with characters and terms
    const testBook: Novel = {
      id: 'novel-1',
      title: 'Test Novel',
      lastEdited: new Date(),
      createdAt: new Date(),
      characterSettings: [
        {
          id: 'char-1',
          name: '田中太郎',
          sex: 'male',
          translation: { translation: 'Tanaka Taro', id: 't-1', aiModelId: 'm-1' },
          aliases: [
            { name: '田中', translation: { translation: 'Tanaka', id: 't-1-1', aiModelId: 'm-1' } },
          ],
        },
        {
          id: 'char-2',
          name: '佐藤花子',
          sex: 'female',
          translation: { translation: 'Sato Hanako', id: 't-2', aiModelId: 'm-1' },
          aliases: [
            { name: '花子', translation: { translation: 'Hanako', id: 't-2-1', aiModelId: 'm-1' } },
          ],
        },
      ],
      terminologies: [
        {
          id: 'term-1',
          name: '魔法',
          translation: { translation: 'Magic', id: 't-3', aiModelId: 'm-1' },
        },
        {
          id: 'term-2',
          name: '魔剑',
          translation: { translation: 'Magic Sword', id: 't-4', aiModelId: 'm-1' },
        },
      ],
    };

    mockBooksStore.books = [testBook];
  });

  afterEach(() => {
    mock.restore();
  });

  describe('get_character tool', () => {
    const getCharacterTool = characterTools.find(
      (t) => t.definition.function?.name === 'get_character',
    );

    test('should return exact match', async () => {
      const result = await getCharacterTool!.handler({ name: '田中太郎', include_memory: false }, {
        bookId: 'novel-1',
      } as any);
      const resObj = JSON.parse(result as string);
      expect(resObj.success).toBe(true);
      expect(resObj.character.name).toBe('田中太郎');
      expect(resObj.truncated).toBeUndefined();
    });

    test('should return fallback matches for partial name match', async () => {
      const result = await getCharacterTool!.handler({ name: '田中', include_memory: false }, {
        bookId: 'novel-1',
      } as any);
      const resObj = JSON.parse(result as string);
      expect(resObj.success).toBe(true);
      expect(resObj.characters).toBeDefined();
      expect(resObj.characters.length).toBe(1);
      expect(resObj.characters[0].name).toBe('田中太郎');
      expect(resObj.message).toContain('精确匹配未找到');
    });

    test('should fall back correctly for completely mismatched names', async () => {
      const result = await getCharacterTool!.handler({ name: '鬼', include_memory: false }, {
        bookId: 'novel-1',
      } as any);
      const resObj = JSON.parse(result as string);
      expect(resObj.success).toBe(false);
      expect(resObj.message).toContain('不存在');
      expect(resObj.characters).toBeUndefined();
    });
  });

  describe('get_term tool', () => {
    const getTermTool = terminologyTools.find((t) => t.definition.function?.name === 'get_term');

    test('should return exact match', async () => {
      const result = await getTermTool!.handler({ name: '魔法', include_memory: false }, {
        bookId: 'novel-1',
      } as any);
      const resObj = JSON.parse(result as string);
      expect(resObj.success).toBe(true);
      expect(resObj.term.name).toBe('魔法');
      expect(resObj.truncated).toBeUndefined();
    });

    test('should return fallback matches for partial name match', async () => {
      const result = await getTermTool!.handler({ name: '魔', include_memory: false }, {
        bookId: 'novel-1',
      } as any);
      const resObj = JSON.parse(result as string);
      expect(resObj.success).toBe(true);
      expect(resObj.terms).toBeDefined();
      expect(resObj.terms.length).toBe(2);
      expect(resObj.message).toContain('精确匹配未找到');
    });

    test('should return fallback matches for translation text', async () => {
      const result = await getTermTool!.handler({ name: 'Magic Sword', include_memory: false }, {
        bookId: 'novel-1',
      } as any);
      const resObj = JSON.parse(result as string);
      expect(resObj.success).toBe(true);
      expect(resObj.terms).toBeDefined();
      expect(resObj.terms.length).toBe(1);
      expect(resObj.terms[0].name).toBe('魔剑');
    });

    test('should fall back correctly for completely mismatched terms', async () => {
      const result = await getTermTool!.handler({ name: '刀', include_memory: false }, {
        bookId: 'novel-1',
      } as any);
      const resObj = JSON.parse(result as string);
      expect(resObj.success).toBe(false);
      expect(resObj.message).toContain('不存在');
      expect(resObj.terms).toBeUndefined();
    });
  });
});
