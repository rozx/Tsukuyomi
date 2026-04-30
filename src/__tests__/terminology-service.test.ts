import './setup';
import { TerminologyService } from 'src/services/terminology-service';
import {
  describe,
  test,
  expect,
  mock,
  beforeEach,
  spyOn,
  beforeAll,
  afterAll,
} from 'bun:test';
import type { Novel } from 'src/models/novel';
import * as BooksStoreModule from 'src/stores/books';

const mockUpdateBook = mock(() => Promise.resolve());
const mockGetBookById = mock((_id: string) => null as Novel | null);

describe('TerminologyService — 与角色冲突', () => {
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
    mockUpdateBook.mockClear();
    mockGetBookById.mockClear();

    mockBook = {
      id: bookId,
      title: 'Test Novel',
      lastEdited: new Date(),
      createdAt: new Date(),
      terminologies: [],
      characterSettings: [
        {
          id: 'char-1',
          name: '田中',
          sex: undefined,
          translation: { id: 't1', translation: '田中', aiModelId: '' },
          aliases: [],
        },
        {
          id: 'char-2',
          name: '佐藤太郎',
          sex: 'male',
          translation: { id: 't2', translation: '佐藤太郎', aiModelId: '' },
          aliases: [
            {
              name: '佐藤',
              translation: { id: 'a1', translation: '佐藤', aiModelId: '' },
            },
          ],
        },
      ],
      volumes: [],
    };

    mockGetBookById.mockImplementation((id: string) => (id === bookId ? mockBook : null));
  });

  describe('addTerminology', () => {
    test('应该拒绝与角色主名同名的术语', async () => {
      await (expect(
        TerminologyService.addTerminology(bookId, { name: '田中', translation: '田中' }),
      ).rejects.toThrow(/角色/) as unknown as Promise<void>);
      expect(mockUpdateBook).not.toHaveBeenCalled();
    });

    test('应该拒绝与角色别名同名的术语', async () => {
      await (expect(
        TerminologyService.addTerminology(bookId, { name: '佐藤', translation: '佐藤' }),
      ).rejects.toThrow(/角色/) as unknown as Promise<void>);
      expect(mockUpdateBook).not.toHaveBeenCalled();
    });

    test('应该允许与任何角色都不冲突的术语', async () => {
      const result = await TerminologyService.addTerminology(bookId, {
        name: '魔法石',
        translation: '魔法石',
      });
      expect(result.name).toBe('魔法石');
      expect(mockUpdateBook).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateTerminology', () => {
    beforeEach(() => {
      mockBook.terminologies = [
        {
          id: 'term-1',
          name: '魔法石',
          translation: { id: 'tt1', translation: '魔法石', aiModelId: '' },
        },
      ];
    });

    test('应该拒绝重命名为角色主名', async () => {
      await (expect(
        TerminologyService.updateTerminology(bookId, 'term-1', { name: '田中' }),
      ).rejects.toThrow(/角色/) as unknown as Promise<void>);
      expect(mockUpdateBook).not.toHaveBeenCalled();
    });

    test('应该拒绝重命名为角色别名', async () => {
      await (expect(
        TerminologyService.updateTerminology(bookId, 'term-1', { name: '佐藤' }),
      ).rejects.toThrow(/角色/) as unknown as Promise<void>);
      expect(mockUpdateBook).not.toHaveBeenCalled();
    });

    test('未改名时不应触发角色冲突检查', async () => {
      const result = await TerminologyService.updateTerminology(bookId, 'term-1', {
        translation: '魔法宝石',
      });
      expect(result.translation.translation).toBe('魔法宝石');
      expect(mockUpdateBook).toHaveBeenCalledTimes(1);
    });
  });
});

describe('TerminologyService', () => {
  describe('importTerminologiesFromFile', () => {
    test('should reject malformed translation object', async () => {
      const malformedData = [
        {
          id: '1',
          name: 'test',
          translation: {}, // Empty object, missing translation string
        },
      ];
      const file = new File([JSON.stringify(malformedData)], 'test.json', {
        type: 'application/json',
      });

      await (expect(TerminologyService.importTerminologiesFromFile(file)).rejects.toThrow(
        '文件格式错误：术语数据不完整',
      ) as unknown as Promise<void>);
    });

    test('should accept valid translation object', async () => {
      const validData = [
        {
          id: '1',
          name: 'test',
          translation: {
            id: 't1',
            translation: '测试',
            aiModelId: 'model1',
          },
        },
      ];
      const file = new File([JSON.stringify(validData)], 'test.json', {
        type: 'application/json',
      });

      const result = await TerminologyService.importTerminologiesFromFile(file);
      expect(result).toEqual(validData);
    });

    test('should accept key-value pair object', async () => {
      const kvData = {
        Excalibur: '誓约胜利之剑',
        Avalon: '远离尘世的理想乡',
      };
      const file = new File([JSON.stringify(kvData)], 'test.json', {
        type: 'application/json',
      });

      const imported = await TerminologyService.importTerminologiesFromFile(file);

      expect(imported).toHaveLength(2);

      const excalibur = imported.find((t) => t.name === 'Excalibur');
      expect(excalibur?.translation.translation).toBe('誓约胜利之剑');
      // Using regex match on ID since it's generated
      // expect(excalibur?.id).toMatch(/^import-/);
      expect(excalibur?.id.startsWith('import-')).toBe(true);
      expect(excalibur?.description).toBe(undefined);

      const avalon = imported.find((t) => t.name === 'Avalon');
      expect(avalon?.translation.translation).toBe('远离尘世的理想乡');
    });
  });
});
