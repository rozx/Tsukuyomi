import { describe, expect, it } from 'vitest';
import './setup';
import { BookService } from '../services/book-service';
import { getNameTranslation } from '../services/localization/selection';
import type { Novel, Terminology } from '../models/novel';

const initial: Novel = {
  id: 'b',
  title: '书',
  targetLanguage: 'en-US',
  createdAt: new Date(0),
  lastEdited: new Date(0),
};

describe('实体文件多语言导入', () => {
  it('多个旧条目解析到同一活动身份时整批拒绝，避免重复恢复快照', async () => {
    const existing: Terminology = {
      id: 't',
      name: 'Term',
      translation: { id: 'cn', translation: '原译名', aiModelId: '' },
    };
    await BookService.saveBook({ ...initial, terminologies: [existing] });
    await expect(
      BookService.importEntities('b', 'term', [
        { ...existing, id: 'one' },
        { ...existing, id: 'two' },
      ]),
    ).rejects.toThrow('DUPLICATE_IMPORT_TARGET');
    expect((await BookService.getBookById('b'))!.terminologies?.[0]?.translation.translation).toBe(
      '原译名',
    );
  });
  it('旧同名别名重复项稳定归并到已有 ID，并显示冲突标记', async () => {
    const character = {
      id: 'c',
      name: 'Character',
      sex: undefined,
      translation: { id: '', translation: '', aiModelId: '' },
      aliases: [
        {
          id: 'existing-alias',
          name: 'Alias',
          translation: { id: 'before', translation: '原译名', aiModelId: '' },
        },
      ],
    };
    await BookService.saveBook({ ...initial, characterSettings: [character] });
    const duplicates = [
      { name: 'Alias', translation: { id: 'one', translation: '甲', aiModelId: '' } },
      { name: 'Alias', translation: { id: 'two', translation: '乙', aiModelId: '' } },
    ];
    await BookService.importEntities('b', 'character', [{ ...character, aliases: duplicates }]);
    let aliases = (await BookService.getBookById('b'))!.characterSettings![0]!.aliases;
    expect(aliases).toHaveLength(1);
    expect(aliases[0]?.id).toBe('existing-alias');
    expect(aliases[0]?.legacyConflict).toBe(true);
    const selected = getNameTranslation(aliases[0]!, 'zh-CN')?.translation;
    await BookService.importEntities('b', 'character', [
      { ...character, aliases: [...duplicates].reverse() },
    ]);
    aliases = (await BookService.getBookById('b'))!.characterSettings![0]!.aliases;
    expect(getNameTranslation(aliases[0]!, 'zh-CN')?.translation).toBe(selected);
  });
  it('按 ID 更新和改名，缺席语言保留；同名现代新 ID 保持独立', async () => {
    await BookService.saveBook(initial);
    const original: Terminology = {
      id: 't',
      name: 'Source',
      translation: { id: 'cn', translation: '简中', aiModelId: '' },
      translationsByLanguage: {
        'zh-CN': {
          value: { id: 'cn', translation: '简中', language: 'zh-CN', aiModelId: '' },
          revision: { counter: 1, actorId: 'a' },
          updatedAt: 1,
        },
        'en-US': {
          value: { id: 'en', translation: 'English', language: 'en-US', aiModelId: '' },
          revision: { counter: 2, actorId: 'a' },
          updatedAt: 2,
        },
      },
    };
    await BookService.importEntities('b', 'term', [original]);
    const changed = {
      ...original,
      name: 'Renamed',
      translationsByLanguage: {
        'en-US': {
          value: {
            id: 'new-en',
            translation: 'Changed English',
            language: 'en-US' as const,
            aiModelId: '',
          },
          revision: { counter: 20, actorId: 'file' },
          updatedAt: 20,
        },
      },
    };
    await BookService.importEntities('b', 'term', [changed]);
    await BookService.importEntities('b', 'term', [{ ...changed, id: 'independent' }]);
    const saved = (await BookService.getBookById('b'))!;
    expect(saved.terminologies).toHaveLength(2);
    const same = saved.terminologies!.find((value) => value.id === 't')!;
    expect(same.name).toBe('Renamed');
    expect(getNameTranslation(same, 'zh-CN')?.translation).toBe('简中');
    expect(getNameTranslation(same, 'en-US')?.translation).toBe('Changed English');
  });

  it('旧别名按唯一名字解析已有身份，数组重排和改名不丢其他语言', async () => {
    await BookService.saveBook({
      ...initial,
      characterSettings: [
        {
          id: 'c',
          name: 'Character',
          sex: undefined,
          translation: { id: 'c-cn', translation: '角色', aiModelId: '' },
          aliases: [
            {
              id: 'a',
              name: 'Alias',
              translation: { id: 'a-cn', translation: '简中别名', aiModelId: '' },
              translationsByLanguage: {
                'en-US': {
                  value: {
                    id: 'a-en',
                    translation: 'English alias',
                    language: 'en-US',
                    aiModelId: '',
                  },
                  revision: { counter: 1, actorId: 'a' },
                  updatedAt: 1,
                },
              },
            },
          ],
        },
      ],
    });
    await BookService.importEntities('b', 'character', [
      {
        id: 'external-old-id',
        name: 'Character',
        sex: undefined,
        translation: { id: 'c-cn', translation: '角色', aiModelId: '' },
        aliases: [
          { name: 'Alias', translation: { id: 'old', translation: '新的简中别名', aiModelId: '' } },
        ],
      },
    ]);
    const saved = (await BookService.getBookById('b'))!.characterSettings![0]!;
    expect(saved.id).toBe('c');
    expect(saved.aliases[0]?.id).toBe('a');
    expect(getNameTranslation(saved.aliases[0]!, 'zh-CN')?.translation).toBe('新的简中别名');
    expect(getNameTranslation(saved.aliases[0]!, 'en-US')?.translation).toBe('English alias');
  });

  it('重复 ID 或损坏语言数据整批拒绝，空输入保持现有成果', async () => {
    await BookService.saveBook(initial);
    const value: Terminology = {
      id: 't',
      name: 'Term',
      translation: { id: 'cn', translation: '术语', aiModelId: '' },
    };
    await expect(BookService.importEntities('b', 'term', [value, value])).rejects.toThrow(
      'INVALID_ENTITY_ID',
    );
    await BookService.importEntities('b', 'term', [value]);
    const before = (await BookService.getBookById('b'))!;
    await expect(
      BookService.importEntities('b', 'term', [
        {
          ...value,
          id: 'invalid',
          translationsByLanguage: {
            'fr-FR': { value: null, revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
          },
        } as unknown as Terminology,
      ]),
    ).rejects.toThrow();
    await BookService.importEntities('b', 'term', []);
    expect((await BookService.getBookById('b'))!.terminologies).toEqual(before.terminologies);
  });
  it('旧文件归简中，现代英文文件保留语言和 ID，不根据当前目标重标记', async () => {
    await BookService.saveBook(initial);
    const legacy: Terminology = {
      id: 'cn',
      name: '医者',
      translation: { id: 'cn-t', translation: '医生', aiModelId: '' },
    };
    const modern: Terminology = {
      id: 'en',
      name: '魔法',
      translation: { id: '', translation: '', aiModelId: '' },
      translationsByLanguage: {
        'en-US': {
          value: { id: 'en-t', translation: 'Magic', language: 'en-US', aiModelId: '' },
          revision: { counter: 1000, actorId: 'import' },
          updatedAt: 1,
        },
      },
    };
    await BookService.importEntities('b', 'term', [legacy, modern]);
    const saved = (await BookService.getBookById('b'))!;
    expect(saved.targetLanguage).toBe('en-US');
    const cn = saved.terminologies!.find((value) => value.id === 'cn')!;
    const en = saved.terminologies!.find((value) => value.id === 'en')!;
    expect(getNameTranslation(cn, 'zh-CN')?.translation).toBe('医生');
    expect(getNameTranslation(cn, 'en-US')).toBeUndefined();
    expect(getNameTranslation(en, 'en-US')?.id).toBe('en-t');
    expect(en.translationsByLanguage?.['zh-CN']).toBeUndefined();
    expect(en.translationsByLanguage?.['en-US']?.revision.counter).toBeGreaterThan(1000);
  });
});
