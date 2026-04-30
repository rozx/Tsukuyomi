import './setup';
import { describe, test, expect, mock, beforeEach, spyOn, beforeAll, afterAll } from 'bun:test';
import { CharacterSettingService } from 'src/services/character-setting-service';
import type { Novel } from 'src/models/novel';
import * as BooksStoreModule from 'src/stores/books';

const mockUpdateBook = mock(() => Promise.resolve());
const mockGetBookById = mock((_id: string) => null as Novel | null);

describe('CharacterSettingService', () => {
  beforeAll(() => {
    spyOn(BooksStoreModule, 'useBooksStore').mockReturnValue({
      getBookById: mockGetBookById,
      updateBook: mockUpdateBook,
    } as any);
  });

  afterAll(() => {
    mock.restore();
  });

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


      expect(mockUpdateBook).toHaveBeenCalledTimes(1);
    });

    test('应该拒绝与已有术语主名同名的角色', async () => {
      mockBook.terminologies = [
        {
          id: 'term-1',
          name: '魔法石',
          translation: { id: 'tt1', translation: '魔法石', aiModelId: '' },
        },
      ];

      await (expect(
        CharacterSettingService.addCharacterSetting(bookId, {
          name: '魔法石',
          translation: '魔法石',
        }),
      ).rejects.toThrow(/术语/) as unknown as Promise<void>);
      expect(mockUpdateBook).not.toHaveBeenCalled();
    });

    test('应该拒绝别名与已有术语同名的角色', async () => {
      mockBook.terminologies = [
        {
          id: 'term-1',
          name: '魔法石',
          translation: { id: 'tt1', translation: '魔法石', aiModelId: '' },
        },
      ];

      await (expect(
        CharacterSettingService.addCharacterSetting(bookId, {
          name: 'Alice',
          translation: '爱丽丝',
          aliases: [{ name: '魔法石', translation: '魔法石' }],
        }),
      ).rejects.toThrow(/术语/) as unknown as Promise<void>);
      expect(mockUpdateBook).not.toHaveBeenCalled();
    });

    test('应该抛出错误如果角色名已存在', async () => {
      mockBook.characterSettings = [
        {
          id: 'char-1',
          name: 'Alice',
          sex: undefined,
          translation: { id: 't1', translation: '', aiModelId: '' },
          aliases: [],
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

    test('应该允许另一个角色已使用的别名（不同角色可以共享姓氏）', async () => {
      const charId = 'char-2';
      mockBook.characterSettings = [
        {
          id: 'char-1',
          name: '田中太郎',
          sex: 'male',
          translation: { id: 't1', translation: '田中太郎', aiModelId: '' },
          aliases: [
            {
              name: '田中',
              translation: { id: 'a1', translation: '田中', aiModelId: '' },
            },
          ],
        },
        {
          id: charId,
          name: '田中花子',
          sex: 'female',
          translation: { id: 't2', translation: '田中花子', aiModelId: '' },
          aliases: [],
        },
      ];

      const updates = {
        aliases: [{ name: '田中', translation: '田中' }],
      };

      const result = await CharacterSettingService.updateCharacterSetting(bookId, charId, updates);

      expect(result.aliases).toHaveLength(1);
      expect(result.aliases[0]?.name).toBe('田中');
      expect(result.aliases[0]?.translation?.translation).toBe('田中');
      expect(mockUpdateBook).toHaveBeenCalledTimes(1);
    });

    test('应该允许等于另一个角色主名的别名', async () => {
      const charId = 'char-2';
      mockBook.characterSettings = [
        {
          id: 'char-1',
          name: '田中',
          sex: undefined,
          translation: { id: 't1', translation: '田中', aiModelId: '' },
          aliases: [],
        },
        {
          id: charId,
          name: '田中花子',
          sex: 'female',
          translation: { id: 't2', translation: '田中花子', aiModelId: '' },
          aliases: [],
        },
      ];

      const updates = {
        aliases: [{ name: '田中', translation: '田中' }],
      };

      const result = await CharacterSettingService.updateCharacterSetting(bookId, charId, updates);

      expect(result.aliases).toHaveLength(1);
      expect(result.aliases[0]?.name).toBe('田中');
    });

    test('应该拒绝把角色名改成已有术语', async () => {
      const charId = 'char-1';
      mockBook.characterSettings = [
        {
          id: charId,
          name: 'Alice',
          sex: undefined,
          translation: { id: 't1', translation: '', aiModelId: '' },
          aliases: [],
        },
      ];
      mockBook.terminologies = [
        {
          id: 'term-1',
          name: '魔法石',
          translation: { id: 'tt1', translation: '魔法石', aiModelId: '' },
        },
      ];

      await (expect(
        CharacterSettingService.updateCharacterSetting(bookId, charId, { name: '魔法石' }),
      ).rejects.toThrow(/术语/) as unknown as Promise<void>);
      expect(mockUpdateBook).not.toHaveBeenCalled();
    });

    test('应该拒绝把别名改成已有术语', async () => {
      const charId = 'char-1';
      mockBook.characterSettings = [
        {
          id: charId,
          name: 'Alice',
          sex: undefined,
          translation: { id: 't1', translation: '爱丽丝', aiModelId: '' },
          aliases: [],
        },
      ];
      mockBook.terminologies = [
        {
          id: 'term-1',
          name: '魔法石',
          translation: { id: 'tt1', translation: '魔法石', aiModelId: '' },
        },
      ];

      await (expect(
        CharacterSettingService.updateCharacterSetting(bookId, charId, {
          aliases: [{ name: '魔法石', translation: '魔法石' }],
        }),
      ).rejects.toThrow(/术语/) as unknown as Promise<void>);
      expect(mockUpdateBook).not.toHaveBeenCalled();
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
        },
        {
          id: 'char-2',
          name: 'Bob',
          sex: undefined,
          translation: { id: 't2', translation: '', aiModelId: '' },
          aliases: [],
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
