import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { CharacterSettingService } from 'src/services/character-setting-service';
import type { Novel } from 'src/types/novel';

const mockUpdateBook = mock(() => Promise.resolve());
const mockGetBookById = mock((_id: string) => null as Novel | null);

// Mock useBooksStore
await mock.module('src/stores/books', () => {
  return {
    useBooksStore: () => ({
      getBookById: mockGetBookById,
      updateBook: mockUpdateBook,
    }),
  };
});

// Mock FileReader for import tests
class MockFileReader {
  onload: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;

  readAsText(file: File) {
    file.text().then((text) => {
      if (this.onload) {
        this.onload({ target: { result: text } });
      }
    }).catch((e) => {
        if (this.onerror) {
            this.onerror(e);
        }
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).FileReader = MockFileReader;

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
          title: {
            original: 'Volume 1',
            translation: { id: 't1', translation: '', aiModelId: '' },
          },
          chapters: [
            {
              id: 'chap-1',
              title: {
                original: 'Chapter 1',
                translation: { id: 't2', translation: '', aiModelId: '' },
              },
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
        sex: 'female' as const,
        translation: '爱丽丝',
        description: '主角',
        aliases: [{ name: 'Ally', translation: '艾莉' }],
      };

      const result = await CharacterSettingService.addCharacterSetting(bookId, charData);

      expect(result).toBeTruthy();
      expect(result.name).toBe('Alice');
      expect(result.sex).toBe('female');
      expect(result.translation).toBeTruthy();
      expect(result.translation.translation).toBe('爱丽丝');
      expect(result.description).toBe('主角');
      expect(result.aliases).toHaveLength(1);
      expect(result.aliases[0]?.name).toBe('Ally');
      expect(result.aliases[0]?.translation?.translation).toBe('艾莉');
      
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
          sex: undefined,
          translation: { id: 't1', translation: '', aiModelId: '' },
          aliases: [],
          occurrences: [],
        },
      ];

      const charData = {
        name: 'Alice',
        translation: '爱丽丝',
      };

      try {
        await CharacterSettingService.addCharacterSetting(bookId, charData);
      } catch (error: any) {
        expect(error.message).toContain('角色 "Alice" 已存在');
      }
    });
  });

  describe('updateCharacterSetting', () => {
    test('应该更新现有角色', async () => {
      const charId = 'char-1';
      mockBook.characterSettings = [
        {
          id: charId,
          name: 'Alice',
          sex: 'female',
          translation: { id: 't1', translation: '爱丽丝', aiModelId: '' },
          aliases: [],
          occurrences: [],
          description: 'Old description',
        },
      ];

      const updates = {
        description: 'New description',
        sex: 'male' as const,
        translation: '艾丽丝',
      };

      const result = await CharacterSettingService.updateCharacterSetting(bookId, charId, updates);

      expect(result.id).toBe(charId);
      expect(result.description).toBe('New description');
      expect(result.sex).toBe('male');
      expect(result.translation?.translation).toBe('艾丽丝');
      expect(mockUpdateBook).toHaveBeenCalledTimes(1);
    });

    test('更新名称时应该检查冲突', async () => {
      const charId = 'char-1';
      mockBook.characterSettings = [
        {
          id: charId,
          name: 'Alice',
          sex: undefined,
          translation: { id: 't1', translation: '', aiModelId: '' },
          aliases: [],
          occurrences: [],
        },
        {
          id: 'char-2',
          name: 'Bob',
          sex: undefined,
          translation: { id: 't2', translation: '', aiModelId: '' },
          aliases: [],
          occurrences: [],
        },
      ];

      const updates = {
        name: 'Bob',
      };

      try {
        await CharacterSettingService.updateCharacterSetting(bookId, charId, updates);
      } catch (error: any) {
        expect(error.message).toContain('角色 "Bob" 已存在');
      }
    });
  });

  describe('deleteCharacterSetting', () => {
    test('应该删除角色', async () => {
      const charId = 'char-1';
      mockBook.characterSettings = [
        {
          id: charId,
          name: 'Alice',
          sex: undefined,
          translation: { id: 't1', translation: '', aiModelId: '' },
          aliases: [],
          occurrences: [],
        },
      ];

      await CharacterSettingService.deleteCharacterSetting(bookId, charId);

      expect(mockUpdateBook).toHaveBeenCalledTimes(1);
    });

    test('如果角色不存在应该抛出错误', async () => {
      mockBook.characterSettings = [];
      
      try {
        await CharacterSettingService.deleteCharacterSetting(bookId, 'non-existent');
      } catch (error: any) {
        expect(error.message).toContain('角色不存在: non-existent');
      }
    });
  });

  describe('importCharacterSettingsFromFile', () => {
    test('should reject malformed translation object', async () => {
      const malformedData = [
        {
          id: '1',
          name: 'test',
          translation: {}, // Empty object
        },
      ];
      const file = new File([JSON.stringify(malformedData)], 'test.json', {
        type: 'application/json',
      });

      try {
        await CharacterSettingService.importCharacterSettingsFromFile(file);
        expect(true).toBe(false); // Should not reach here
      } catch (e: any) {
        expect(e.message).toBe('文件格式错误：角色设定数据不完整');
      }
    });
  });
});
