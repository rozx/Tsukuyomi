import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { CharacterSettingService } from 'src/services/character-setting-service';
import type { Novel, CharacterSetting } from 'src/types/novel';

const mockUpdateBook = mock(() => Promise.resolve());
const mockGetBookById = mock((id: string) => null as Novel | null);

// Mock useBooksStore
mock.module('src/stores/books', () => {
  return {
    useBooksStore: () => ({
      getBookById: mockGetBookById,
      updateBook: mockUpdateBook,
    }),
  };
});

describe('CharacterSettingService', () => {
  const bookId = 'book-1';
  let mockBook: Novel;

  beforeEach(() => {
    // 重置 mock 和数据
    mockUpdateBook.mockClear();
    mockGetBookById.mockClear();

    mockBook = {
      id: bookId,
      title: 'Test Novel',
      lastEdited: new Date(),
      createdAt: new Date(),
      characterSettings: [],
      volumes: [
        {
          id: 'vol-1',
          title: 'Volume 1',
          chapters: [
            {
              id: 'chap-1',
              title: 'Chapter 1',
              lastEdited: new Date(),
              createdAt: new Date(),
              content: [
                {
                  id: 'para-1',
                  text: 'Alice went to the market. Alice saw Bob.',
                  selectedTranslationId: '',
                  translations: [],
                },
              ],
            },
          ],
        },
      ],
    };

    mockGetBookById.mockImplementation((id: string) => {
      if (id === bookId) return mockBook;
      return null;
    });
  });

  describe('addCharacterSetting', () => {
    test('应该添加新角色', async () => {
      const charData = {
        name: 'Alice',
        translations: ['爱丽丝'],
        description: '主角',
        aliases: ['Ally'],
      };

      const result = await CharacterSettingService.addCharacterSetting(bookId, charData);

      expect(result).toBeTruthy();
      expect(result.name).toBe('Alice');
      expect(result.translation).toHaveLength(1);
      expect(result.translation[0].translation).toBe('爱丽丝');
      expect(result.description).toBe('主角');
      expect(result.aliases).toHaveLength(1);
      expect(result.aliases[0].name).toBe('Ally');
      
      // 验证出现次数统计 (Alice appears twice in the mock text)
      const totalOccurrences = result.occurrences.reduce((sum, occ) => sum + occ.count, 0);
      expect(totalOccurrences).toBe(2);

      expect(mockUpdateBook).toHaveBeenCalledTimes(1);
    });

    test('应该抛出错误如果角色名已存在', async () => {
      mockBook.characterSettings = [
        {
          id: 'char-1',
          name: 'Alice',
          translation: [],
          aliases: [],
          occurrences: [],
        },
      ];

      const charData = {
        name: 'Alice',
        translations: ['爱丽丝'],
      };

      await expect(
        CharacterSettingService.addCharacterSetting(bookId, charData)
      ).rejects.toThrow('角色 "Alice" 已存在');
    });
  });

  describe('updateCharacterSetting', () => {
    test('应该更新现有角色', async () => {
      const charId = 'char-1';
      mockBook.characterSettings = [
        {
          id: charId,
          name: 'Alice',
          translation: [{ id: 't1', translation: '爱丽丝', aiModelId: '' }],
          aliases: [],
          occurrences: [],
          description: 'Old description',
        },
      ];

      const updates = {
        description: 'New description',
        translations: ['艾丽丝'],
      };

      const result = await CharacterSettingService.updateCharacterSetting(bookId, charId, updates);

      expect(result.id).toBe(charId);
      expect(result.description).toBe('New description');
      expect(result.translation[0].translation).toBe('艾丽丝');
      expect(mockUpdateBook).toHaveBeenCalledTimes(1);
    });

    test('更新名称时应该检查冲突', async () => {
      const charId = 'char-1';
      mockBook.characterSettings = [
        {
          id: charId,
          name: 'Alice',
          translation: [],
          aliases: [],
          occurrences: [],
        },
        {
          id: 'char-2',
          name: 'Bob',
          translation: [],
          aliases: [],
          occurrences: [],
        },
      ];

      const updates = {
        name: 'Bob',
      };

      await expect(
        CharacterSettingService.updateCharacterSetting(bookId, charId, updates)
      ).rejects.toThrow('角色 "Bob" 已存在');
    });
  });

  describe('deleteCharacterSetting', () => {
    test('应该删除角色', async () => {
      const charId = 'char-1';
      mockBook.characterSettings = [
        {
          id: charId,
          name: 'Alice',
          translation: [],
          aliases: [],
          occurrences: [],
        },
      ];

      await CharacterSettingService.deleteCharacterSetting(bookId, charId);

      expect(mockUpdateBook).toHaveBeenCalledTimes(1);
    });

    test('如果角色不存在应该抛出错误', async () => {
      mockBook.characterSettings = [];
      
      await expect(
        CharacterSettingService.deleteCharacterSetting(bookId, 'non-existent')
      ).rejects.toThrow('角色不存在: non-existent');
    });
  });
});
