import './setup';
import { describe, expect, it } from 'bun:test';
import type { Novel } from '../models/novel';
import { normalizeBookLanguages } from '../services/localization/normalize';

function oldBook(): Novel {
  return {
    id: 'book-1',
    title: '原书名',
    lastEdited: new Date(1000),
    createdAt: new Date(0),
    characterSettings: [
      {
        id: 'char-1',
        name: 'Alice',
        sex: undefined,
        translation: { id: 'name-1', translation: '爱丽丝', aiModelId: 'm' },
        aliases: [
          { name: 'Al', translation: { id: 'alias-name-1', translation: '小爱', aiModelId: 'm' } },
        ],
      },
    ],
    volumes: [
      {
        id: 'v1',
        title: '第一卷',
        chapters: [
          {
            id: 'c1',
            title: {
              original: 'Chapter 1',
              translation: { id: 'title-1', translation: '第一章', aiModelId: 'm' },
            },
            createdAt: new Date(0),
            lastEdited: new Date(1000),
            content: [
              {
                id: 'p1',
                text: 'Hello',
                selectedTranslationId: 't1',
                translations: [
                  {
                    id: 't1',
                    translation: '你好',
                    aiModelId: 'm',
                    referencedMemories: ['memory-1'],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('多语言旧数据归一化', () => {
  it('旧书归简中并保留版本、选用、译名和修改时间，重复读取不再变化', () => {
    const original = oldBook();
    const normalized = normalizeBookLanguages(original);
    expect(normalized.targetLanguage).toBe('zh-CN');
    const paragraph = normalized.volumes![0]!.chapters![0]!.content![0]!;
    expect(paragraph.translations[0]).toMatchObject({
      id: 't1',
      language: 'zh-CN',
      referencedMemories: ['memory-1'],
    });
    expect(paragraph.selectedTranslations?.['zh-CN']?.value).toBe('t1');
    expect(
      normalized.characterSettings![0]!.translationsByLanguage?.['zh-CN']?.value?.translation,
    ).toBe('爱丽丝');
    expect(normalized.characterSettings![0]!.aliases[0]!.id).toBeTruthy();
    expect(normalized.lastEdited).toEqual(new Date(1000));
    expect(normalizeBookLanguages(normalized)).toEqual(normalized);
    expect(original).toEqual(oldBook());
  });

  it('拒绝未来协议、显式非法语言和跨语言选用，不把损坏数据当成旧简中', () => {
    expect(() =>
      normalizeBookLanguages({ ...oldBook(), targetLanguage: 'ja-JP' } as unknown as Novel),
    ).toThrow('INVALID_LOCALE');
    expect(() =>
      normalizeBookLanguages({ ...oldBook(), entitySyncVersion: 2 } as unknown as Novel),
    ).toThrow('UNSUPPORTED_ENTITY_SYNC_VERSION');
    const book = normalizeBookLanguages(oldBook());
    const paragraph = book.volumes![0]!.chapters![0]!.content![0]!;
    paragraph.selectedTranslations = {
      'en-US': { value: 't1', revision: { counter: 1, actorId: 'device-A' }, updatedAt: 2000 },
    };
    expect(() => normalizeBookLanguages(book)).toThrow('INVALID_LANGUAGE_SELECTION');
    paragraph.selectedTranslations = {
      'zh-CN': { value: 't1', revision: { counter: -1, actorId: '' }, updatedAt: 2000 },
    };
    expect(() => normalizeBookLanguages(book)).toThrow('INVALID_SYNC_REVISION');
  });

  it('明确清空优先于旧简中投影，英文选用不写入简中兼容字段', () => {
    const book = normalizeBookLanguages(oldBook());
    const character = book.characterSettings![0]!;
    character.translationsByLanguage!['zh-CN']!.value = null;
    const paragraph = book.volumes![0]!.chapters![0]!.content![0]!;
    paragraph.translations.push({
      id: 'en1',
      translation: 'Hello',
      aiModelId: 'm',
      language: 'en-US',
    });
    paragraph.selectedTranslations = {
      'en-US': { value: 'en1', revision: { counter: 1, actorId: 'device-A' }, updatedAt: 2000 },
    };
    const normalized = normalizeBookLanguages(book);
    expect(normalized.characterSettings![0]!.translation.translation).toBe('');
    expect(normalized.volumes![0]!.chapters![0]!.content![0]!.selectedTranslationId).toBe('');
  });

  it('书内删除记录需要合法的身份、父级与版本，不能默默丢弃坏记录', () => {
    const book = oldBook();
    book.entityTombstones = {
      bad: {
        kind: 'alias',
        id: 'a1',
        revision: { counter: 1, actorId: 'A' },
        deletedAt: 2000,
      },
    };
    expect(() => normalizeBookLanguages(book)).toThrow('INVALID_ENTITY_TOMBSTONE');
  });

  it('旧别名身份与数组顺序无关，已赋予身份的改名保留身份', () => {
    const book = oldBook();
    book.characterSettings![0]!.aliases.push({
      name: 'Other',
      translation: { id: 'o1', translation: '其他', aiModelId: 'm' },
    });
    const first = normalizeBookLanguages(book);
    book.characterSettings![0]!.aliases.reverse();
    const reversed = normalizeBookLanguages(book);
    expect(reversed.characterSettings![0]!.aliases.find((a) => a.name === 'Al')?.id).toBe(
      first.characterSettings![0]!.aliases[0]!.id,
    );
    const renamed = first.characterSettings![0]!.aliases[0]!;
    const id = renamed.id;
    renamed.name = 'New name';
    expect(normalizeBookLanguages(first).characterSettings![0]!.aliases[0]!.id).toBe(id);
  });

  it('旧格式悬空选用清空而不丢弃已有译文，不借另一语言版本补位', () => {
    const book = oldBook();
    book.volumes![0]!.chapters![0]!.content![0]!.selectedTranslationId = 'deleted-version';
    const p = normalizeBookLanguages(book).volumes![0]!.chapters![0]!.content![0]!;
    expect(p.translations).toHaveLength(1);
    expect(p.selectedTranslationId).toBe('');
    expect(p.selectedTranslations?.['zh-CN']).toBeUndefined();
  });
});

it('旧重复别名确定归并且记录冲突，数组换序不影响迁移，新 ID 同名仍独立保留', () => {
  const input = oldBook();
  const character = input.characterSettings![0]!;
  character.aliases.push({
    name: 'Al',
    translation: { id: 'different', translation: '别称', aiModelId: 'm' },
  });
  const a = normalizeBookLanguages(input);
  character.aliases.reverse();
  const b = normalizeBookLanguages(input);
  expect(a.characterSettings![0]!.aliases).toEqual(b.characterSettings![0]!.aliases);
  expect(a.characterSettings![0]!.aliases).toHaveLength(1);
  expect(a.characterSettings![0]!.aliases[0]!.legacyConflict).toBe(true);
  expect(normalizeBookLanguages(a)).toEqual(a);
  character.aliases = character.aliases.map((alias, i) => ({ ...alias, id: String(i) }));
  expect(normalizeBookLanguages(input).characterSettings![0]!.aliases).toHaveLength(2);
});
