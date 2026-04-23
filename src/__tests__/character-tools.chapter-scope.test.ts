import './setup';
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { CharacterSetting, Novel } from '../models/novel';
import * as BooksStore from '../stores/books';

const mockBooksStore: {
  books: Novel[];
  getBookById: (id: string) => Novel | undefined;
} = {
  books: [],
  getBookById(id: string) {
    return this.books.find((book) => book.id === id);
  },
};

const { characterTools } = await import('../services/ai/tools/character-tools');

function createBook(characterSettings: CharacterSetting[], chapterText: string): Novel {
  return {
    id: 'book-1',
    title: 'Test Book',
    lastEdited: new Date(),
    createdAt: new Date(),
    terminologies: [],
    characterSettings,
    volumes: [
      {
        id: 'volume-1',
        title: '第一卷',
        chapters: [
          {
            id: 'chapter-1',
            title: '第一章',
            content: [
              {
                id: 'paragraph-1',
                text: chapterText,
                selectedTranslationId: '',
                translations: [],
              },
            ],
            lastEdited: new Date(),
            createdAt: new Date(),
          },
        ],
      },
    ],
  };
}

describe('list_characters chapter scope', () => {
  const listCharactersTool = characterTools.find(
    (tool) => tool.definition.function?.name === 'list_characters',
  );

  beforeEach(() => {
    spyOn(BooksStore, 'useBooksStore').mockReturnValue(mockBooksStore as never);
  });

  afterEach(() => {
    mock.restore();
    mockBooksStore.books = [];
  });

  test('returns aliases as an empty array for legacy characters without aliases', async () => {
    const legacyCharacter = {
      id: 'char-1',
      name: '田中太郎',
      sex: 'male',
      translation: { id: 'trans-1', translation: 'Tanaka Taro', aiModelId: 'model-1' },
    } as unknown as CharacterSetting;

    mockBooksStore.books = [createBook([legacyCharacter], '田中太郎走进了教室。')];

    const result = await listCharactersTool!.handler({ chapter_id: 'chapter-1' }, {
      bookId: 'book-1',
    } as never);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.characters).toHaveLength(1);
    expect(parsed.characters[0]).toMatchObject({
      name: '田中太郎',
      aliases: [],
    });
  });

  test('preserves alias names for chapter-scoped fetches when alias translation is missing', async () => {
    const partiallyMigratedCharacter = {
      id: 'char-1',
      name: '田中太郎',
      sex: 'male',
      translation: { id: 'trans-1', translation: 'Tanaka Taro', aiModelId: 'model-1' },
      aliases: [{ name: '田中' }],
    } as unknown as CharacterSetting;

    mockBooksStore.books = [createBook([partiallyMigratedCharacter], '田中向大家点了点头。')];

    const result = await listCharactersTool!.handler({ chapter_id: 'chapter-1' }, {
      bookId: 'book-1',
    } as never);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.characters).toHaveLength(1);
    expect(parsed.characters[0]).toMatchObject({
      name: '田中太郎',
      aliases: [{ name: '田中', translation: '' }],
    });
  });

  test('matches aliases after separator normalization in chapter-scoped fetches', async () => {
    const characterWithPunctuatedAlias = {
      id: 'char-1',
      name: 'リリーガーデン',
      sex: 'female',
      translation: { id: 'trans-1', translation: '莉莉花园', aiModelId: 'model-1' },
      aliases: [
        {
          name: 'リリー・ガーデン',
          translation: {
            id: 'alias-trans-1',
            translation: '莉莉花园',
            aiModelId: 'model-1',
          },
        },
      ],
    } as CharacterSetting;

    mockBooksStore.books = [createBook([characterWithPunctuatedAlias], 'リリーガーデンが来た。')];

    const result = await listCharactersTool!.handler({ chapter_id: 'chapter-1' }, {
      bookId: 'book-1',
    } as never);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.characters).toHaveLength(1);
    expect(parsed.characters[0]).toMatchObject({
      name: 'リリーガーデン',
      aliases: [{ name: 'リリー・ガーデン', translation: '莉莉花园' }],
    });
  });

  test('matches names and aliases inside parenthetical monologue at chapter end', async () => {
    const characters = [
      {
        id: 'char-1',
        name: '若本',
        sex: 'male',
        translation: { id: 'trans-1', translation: '若本', aiModelId: 'model-1' },
        aliases: [],
      },
      {
        id: 'char-2',
        name: '本名A',
        sex: 'female',
        translation: { id: 'trans-2', translation: '镜花', aiModelId: 'model-1' },
        aliases: [
          {
            name: '鏡花',
            translation: { id: 'alias-2', translation: '镜花', aiModelId: 'model-1' },
          },
        ],
      },
      {
        id: 'char-3',
        name: '本名B',
        sex: 'female',
        translation: { id: 'trans-3', translation: '赛莲', aiModelId: 'model-1' },
        aliases: [
          {
            name: 'せれん',
            translation: { id: 'alias-3', translation: '赛莲', aiModelId: 'model-1' },
          },
        ],
      },
    ] as CharacterSetting[];

    mockBooksStore.books = [
      createBook(
        characters,
        '前文。\n（若本さんだけじゃなく、鏡花さんやせれんにも電話した方がいいか）',
      ),
    ];

    const result = await listCharactersTool!.handler({ chapter_id: 'chapter-1' }, {
      bookId: 'book-1',
    } as never);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.characters).toHaveLength(3);
    expect(parsed.characters.map((char: { name: string }) => char.name)).toEqual(
      expect.arrayContaining(['若本', '本名A', '本名B']),
    );
  });
});
