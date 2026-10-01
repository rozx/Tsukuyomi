import './setup';
import { expect, it } from 'vitest';
import type { Novel } from '../models/novel';
import { normalizeBookLanguages } from '../services/localization/normalize';
import { getDB } from '../utils/indexed-db';
import { entityKey } from '../services/localization/entity-identity';
import { prepareForceBook } from '../services/localization/force';
import { mergeBookEntityState } from '../services/localization/entities';

function book(): Novel {
  return normalizeBookLanguages({
    id: 'b',
    title: 'Local title',
    createdAt: new Date(0),
    lastEdited: new Date(0),
    terminologies: [
      { id: 't', name: 'Term', translation: { id: 'cn', translation: '术语', aiModelId: 'm' } },
    ],
    characterSettings: [
      {
        id: 'c',
        name: 'Alice',
        sex: undefined,
        translation: { id: 'cn-c', translation: '爱丽丝', aiModelId: 'm' },
        aliases: [
          { id: 'a', name: 'Al', translation: { id: 'cn-a', translation: '小爱', aiModelId: 'm' } },
        ],
      },
    ],
  });
}

it('强制覆盖只恢复已删除身份，保留本地值与活动 ID，明确删除远端独有实体和语言槽', async () => {
  const db = await getDB();
  const local = book();
  const remote = book();
  remote.title = 'Remote title';
  remote.entityTombstones![entityKey('character', 'c')] = {
    kind: 'character',
    id: 'c',
    revision: { counter: 100, actorId: 'remote' },
    deletedAt: 0,
  };
  remote.characterSettings = [];
  remote.terminologies![0]!.name = 'Remote name';
  remote.terminologies![0]!.fieldRevisions!.name = { counter: 101, actorId: 'remote' };
  remote.terminologies![0]!.translationsByLanguage!['en-US'] = {
    value: { id: 'en', translation: 'Remote', aiModelId: 'm', language: 'en-US' },
    revision: { counter: 102, actorId: 'remote' },
    updatedAt: 0,
  };
  remote.terminologies!.push({
    id: 'extra',
    name: 'Remote only',
    translation: { id: '', translation: '', aiModelId: '' },
  });
  const prepared = await prepareForceBook(db, local, remote, 'force');
  expect(prepared.title).toBe('Local title');
  expect(prepared.terminologies![0]!.id).toBe('t');
  expect(prepared.terminologies![0]!.name).toBe('Term');
  expect(prepared.terminologies![0]!.translationsByLanguage!['en-US']!.value).toBeNull();
  expect(prepared.characterSettings![0]!.id).not.toBe('c');
  expect(prepared.characterSettings![0]!.aliases[0]!.id).not.toBe('a');
  expect(prepared.entityTombstones![entityKey('term', 'extra')]).toBeDefined();
  expect(prepared.terminologies![0]!.fieldRevisions!.name!.counter).toBeGreaterThan(102);
  expect(mergeBookEntityState(prepared, remote).terminologies).toEqual(prepared.terminologies);
  expect(await prepareForceBook(db, local, remote, 'force')).toEqual(prepared);
  expect(await prepareForceBook(db, prepared, remote, 'force')).toEqual(prepared);
});

it('强制覆盖的标题和段落选用也压过迟到版本，缺少的语言明确清空', async () => {
  const db = await getDB();
  const local = book();
  const remote = book();
  const chapter = {
    id: 'chapter',
    title: {
      original: 'Source title',
      translation: { id: 'cn-title', translation: '标题', aiModelId: 'm' },
    },
    createdAt: new Date(0),
    lastEdited: new Date(0),
    content: [
      {
        id: 'p',
        text: 'Source',
        selectedTranslationId: 'cn',
        translations: [{ id: 'cn', translation: '译文', aiModelId: 'm' }],
      },
    ],
  };
  local.volumes = [{ id: 'v', title: 'V', chapters: [chapter] }];
  remote.volumes = [
    {
      id: 'v',
      title: 'V',
      chapters: [
        {
          ...chapter,
          title: {
            ...chapter.title,
            translationsByLanguage: {
              'en-US': {
                value: { id: 'en-title', translation: 'Title', aiModelId: 'm', language: 'en-US' },
                revision: { counter: 1000, actorId: 'remote' },
                updatedAt: 0,
              },
            },
          },
          content: [
            {
              ...chapter.content[0]!,
              selectedTranslations: {
                'en-US': {
                  value: null,
                  revision: { counter: 999, actorId: 'remote' },
                  updatedAt: 0,
                },
              },
            },
          ],
        },
      ],
    },
  ];
  const prepared = await prepareForceBook(db, local, remote, 'force-body');
  const result = prepared.volumes![0]!.chapters![0]!;
  expect(result.content![0]!.selectedTranslations!['zh-CN']!.revision.counter).toBeGreaterThan(
    1000,
  );
  expect(result.content![0]!.selectedTranslations!['en-US']!.value).toBeNull();
  if (typeof result.title === 'string') throw new Error('missing title');
  expect(result.title.translationsByLanguage!['en-US']!.value).toBeNull();
  expect(result.title.translationsByLanguage!['zh-CN']!.revision.counter).toBeGreaterThan(1000);
});

it('强制覆盖的本地协议写入原子提交，准备期间发生编辑时拒绝旧结果', async () => {
  const { LibraryPersistence } = await import('../services/library-persistence');
  const db = await getDB();
  const local = book();
  const remote = book();
  await LibraryPersistence.saveBooks(db, [local]);
  remote.entityTombstones![entityKey('character', 'c')] = {
    kind: 'character',
    id: 'c',
    revision: { counter: 100, actorId: 'remote' },
    deletedAt: 0,
  };
  remote.characterSettings = [];
  const prepared = await prepareForceBook(db, local, remote, 'commit-force');
  await LibraryPersistence.commitForceBooks(db, [local], [prepared]);
  expect((await db.get('books', 'b'))!.characterSettings![0]!.id).toBe(
    prepared.characterSettings![0]!.id,
  );
  const changed = { ...prepared, title: 'Edited later' };
  await LibraryPersistence.saveBooks(db, [changed]);
  await expect(LibraryPersistence.commitForceBooks(db, [prepared], [prepared])).rejects.toThrow(
    'FORCE_SOURCE_CHANGED',
  );
  expect((await db.get('books', 'b'))!.title).toBe('Edited later');
});

it('强制协议写入失败不会留下仅删除记录或新身份，重试保留准备时的映射', async () => {
  const { IDBObjectStore } = await import('fake-indexeddb');
  const { vi } = await import('vitest');
  const { LibraryPersistence } = await import('../services/library-persistence');
  const db = await getDB();
  const local = book();
  const remote = book();
  await LibraryPersistence.saveBooks(db, [local]);
  remote.entityTombstones![entityKey('character', 'c')] = {
    kind: 'character',
    id: 'c',
    revision: { counter: 10, actorId: 'remote' },
    deletedAt: 0,
  };
  remote.characterSettings = [];
  const prepared = await prepareForceBook(db, local, remote, 'quota-force');
  const before = await db.get('books', 'b');
  const original = Reflect.get(IDBObjectStore.prototype, 'put') as IDBObjectStore['put'];
  const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    ...args: Parameters<typeof original>
  ) {
    if (this.name === 'books') throw new Error('quota');
    return original.apply(this, args);
  });
  try {
    await expect(LibraryPersistence.commitForceBooks(db, [local], [prepared])).rejects.toThrow(
      'quota',
    );
  } finally {
    put.mockRestore();
  }
  expect(await db.get('books', 'b')).toEqual(before);
  expect(await prepareForceBook(db, local, remote, 'quota-force')).toEqual(prepared);
  await LibraryPersistence.commitForceBooks(db, [local], [prepared]);
  expect((await db.get('books', 'b'))!.characterSettings![0]!.id).toBe(
    prepared.characterSettings![0]!.id,
  );
});

it('正文在强制准备后改变会阻止提交，不会覆盖较新的段落', async () => {
  const { LibraryPersistence } = await import('../services/library-persistence');
  const db = await getDB();
  const local = book();
  local.volumes = [
    {
      id: 'v',
      title: 'V',
      chapters: [
        {
          id: 'chapter',
          title: 'C',
          createdAt: new Date(0),
          lastEdited: new Date(0),
          content: [
            {
              id: 'p',
              text: 'Source',
              selectedTranslationId: 'cn',
              translations: [{ id: 'cn', translation: '译文', aiModelId: 'm' }],
            },
          ],
        },
      ],
    },
  ];
  await LibraryPersistence.saveBooks(db, [local]);
  const prepared = await prepareForceBook(db, local, undefined, 'body-cas');
  await LibraryPersistence.commitForceBooks(db, [local], [prepared]);
  const modified = [{ id: 'p', text: 'Changed', selectedTranslationId: '', translations: [] }];
  await LibraryPersistence.saveChapter(db, 'b', 'chapter', modified);
  await expect(LibraryPersistence.commitForceBooks(db, [prepared], [prepared])).rejects.toThrow(
    'FORCE_SOURCE_CHANGED',
  );
  expect(JSON.parse((await db.get('chapter-contents', 'chapter'))!.content)[0].text).toBe(
    'Changed',
  );
});
