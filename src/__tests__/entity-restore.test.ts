import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBObjectStore } from 'fake-indexeddb';
afterEach(() => vi.restoreAllMocks());
import type { Novel } from '../models/novel';
import { normalizeBookLanguages } from '../services/localization/normalize';
import { mergeBookEntityState } from '../services/localization/entities';
import { entityKey } from '../services/localization/entity-identity';
import { prepareBookRestore } from '../services/localization/restore';
import { getDB } from '../utils/indexed-db';

function snapshot(): Novel {
  return normalizeBookLanguages({
    id: 'b',
    title: 'Book',
    createdAt: new Date(0),
    lastEdited: new Date(0),
    characterSettings: [
      {
        id: 'c',
        name: 'Alice',
        sex: undefined,
        description: 'Keep c and a in free text',
        translation: { id: 'cn', translation: '爱丽丝', aiModelId: 'm' },
        aliases: [
          { id: 'a', name: 'Al', translation: { id: 'cn-a', translation: '小爱', aiModelId: 'm' } },
        ],
      },
    ],
    volumes: [
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
                selectedTranslationId: 't',
                translations: [{ id: 't', translation: '译文', aiModelId: 'm' }],
              },
            ],
          },
        ],
      },
    ],
  });
}

describe('明确实体恢复', () => {
  it('新身份保留可见快照、旧删除记录及自由文本，相同操作重复准备使用固定身份和版本', async () => {
    const db = await getDB();
    const desired = snapshot();
    const current = snapshot();
    current.characterSettings = [];
    current.entityTombstones![entityKey('character', 'c')] = {
      kind: 'character',
      id: 'c',
      revision: { counter: 80, actorId: 'old' },
      deletedAt: 0,
    };
    const a = await prepareBookRestore(db, desired, current, 'operation');
    const b = await prepareBookRestore(db, desired, current, 'operation');
    expect(a).toEqual(b);
    expect(a.characterSettings![0]!.id).not.toBe('c');
    expect(a.characterSettings![0]!.aliases[0]!.id).not.toBe('a');
    expect(a.characterSettings![0]!.description).toBe('Keep c and a in free text');
    expect(a.entityTombstones![entityKey('character', 'c')]).toEqual(
      current.entityTombstones![entityKey('character', 'c')],
    );
    expect(mergeBookEntityState(a, current).characterSettings).toHaveLength(1);
    expect(a.characterSettings![0]!.fieldRevisions!.name!.counter).toBeGreaterThan(80);
    expect(
      a.volumes![0]!.chapters![0]!.content![0]!.selectedTranslations!['zh-CN']!.revision.counter,
    ).toBeGreaterThan(80);
    await expect(
      prepareBookRestore(db, { ...desired, title: 'Different' }, current, 'operation'),
    ).rejects.toThrow('RESTORE_OPERATION_CONFLICT');
  });

  it('空库导入保留原身份、语言槽与版本，不复制设备分配记录', async () => {
    const db = await getDB();
    const desired = snapshot();
    expect(await prepareBookRestore(db, desired, undefined, 'empty-import')).toEqual(desired);
    expect(await db.get('sync-metadata', 'clock')).toBeUndefined();
  });
});

it('撤销单个实体删除保留全部语言，其他实体身份不变，重复撤销不增殖', async () => {
  const { LibraryPersistence } = await import('../services/library-persistence');
  const db = await getDB();
  const original = snapshot();
  const character = original.characterSettings![0]!;
  const current = snapshot();
  current.characterSettings = [{ ...character, id: 'other', name: 'Other', aliases: [] }];
  current.entityTombstones![entityKey('character', 'c')] = {
    kind: 'character',
    id: 'c',
    revision: { counter: 50, actorId: 'old' },
    deletedAt: 0,
  };
  await db.put('books', current);
  const restored = await LibraryPersistence.restoreEntity(
    db,
    'b',
    'character',
    character,
    'undo-delete',
  );
  expect(restored.id).not.toBe('c');
  expect(restored.aliases[0]!.id).not.toBe('a');
  const again = await LibraryPersistence.restoreEntity(
    db,
    'b',
    'character',
    character,
    'undo-delete',
  );
  expect(again.id).toBe(restored.id);
  const saved = (await db.get('books', 'b'))!;
  expect(saved.characterSettings!.map((value) => value.id).sort()).toEqual(
    ['other', restored.id].sort(),
  );
  expect(
    saved.characterSettings!.find((value) => value.id === restored.id)!.translationsByLanguage![
      'zh-CN'
    ]!.value!.translation,
  ).toBe('爱丽丝');
  expect(saved.entityTombstones![entityKey('character', 'c')]).toEqual(
    current.entityTombstones![entityKey('character', 'c')],
  );
});

it('备份覆盖书库为已存在书籍重建实体身份，拒绝未来协议且不先清空本地书库', async () => {
  const { LibraryPersistence } = await import('../services/library-persistence');
  const db = await getDB();
  const current = snapshot();
  await LibraryPersistence.saveBooks(db, [current]);
  await expect(
    LibraryPersistence.replaceBooks(
      db,
      [{ ...current, entitySyncVersion: 2 } as unknown as Novel],
      'future',
    ),
  ).rejects.toThrow('UNSUPPORTED_ENTITY_SYNC_VERSION');
  expect(await db.get('books', 'b')).toBeDefined();
  await LibraryPersistence.replaceBooks(db, [snapshot()], 'backup-restore');
  const restored = (await db.get('books', 'b'))!;
  expect(restored.characterSettings![0]!.id).not.toBe('c');
  expect(restored.entityTombstones![entityKey('character', 'c')]).toBeDefined();
  const chapter = await db.get('chapter-contents', 'chapter');
  expect(JSON.parse(chapter!.content)[0].selectedTranslationId).toBe('t');
  expect(restored.targetLanguage).toBe('zh-CN');
});

it('备份替换失败回滚全部书籍、正文和删除记录，重试复用已准备的身份', async () => {
  const { LibraryPersistence } = await import('../services/library-persistence');
  const db = await getDB();
  await LibraryPersistence.saveBooks(db, [snapshot()]);
  const beforeBooks = await db.getAll('books');
  const beforeContent = await db.getAll('chapter-contents');
  const beforeRevisions = await db.getAll('book-revisions');
  const originalPut = Reflect.get(IDBObjectStore.prototype, 'put') as IDBObjectStore['put'];
  const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    ...args: Parameters<typeof originalPut>
  ) {
    if (this.name === 'books') throw new Error('quota');
    return originalPut.apply(this, args);
  });
  await expect(LibraryPersistence.replaceBooks(db, [snapshot()], 'failed-backup')).rejects.toThrow(
    'quota',
  );
  put.mockRestore();
  expect(await db.getAll('books')).toEqual(beforeBooks);
  expect(await db.getAll('chapter-contents')).toEqual(beforeContent);
  expect(await db.getAll('book-revisions')).toEqual(beforeRevisions);
  const preparedId = (await db.getAll('entity-operations')).find(
    (record) => record.scope === 'book',
  )!.result!.characterSettings![0]!.id;
  await LibraryPersistence.replaceBooks(db, [snapshot()], 'failed-backup');
  expect((await db.get('books', 'b'))!.characterSettings![0]!.id).toBe(preparedId);
});

it('空库首次恢复也固定身份，成功操作重试不会覆盖随后编辑，空快照重试不会删除后来创建的书', async () => {
  const { LibraryPersistence } = await import('../services/library-persistence');
  const db = await getDB();
  await LibraryPersistence.replaceBooks(db, [snapshot()], 'initial-backup');
  expect((await db.get('books', 'b'))!.characterSettings![0]!.id).toBe('c');
  const changed = (await db.get('books', 'b'))!;
  await LibraryPersistence.saveBooks(db, [{ ...changed, title: 'Edited later' }]);
  await LibraryPersistence.replaceBooks(db, [snapshot()], 'initial-backup');
  expect((await db.get('books', 'b'))!.title).toBe('Edited later');
  expect((await db.get('books', 'b'))!.characterSettings![0]!.id).toBe('c');
  await LibraryPersistence.replaceBooks(db, [], 'empty-backup');
  await LibraryPersistence.saveBooks(db, [{ ...snapshot(), id: 'later' }]);
  await LibraryPersistence.replaceBooks(db, [], 'empty-backup');
  expect(await db.get('books', 'later')).toBeDefined();
});

it('内部失败回滚准确还原原身份和删除历史，区别于用户明确恢复', async () => {
  const { LibraryPersistence } = await import('../services/library-persistence');
  const db = await getDB();
  const original = snapshot();
  await LibraryPersistence.saveBooks(db, [original]);
  await LibraryPersistence.replaceBooks(db, [snapshot()], 'temporary-restore');
  const restoredId = (await db.get('books', 'b'))!.characterSettings![0]!.id;
  expect(restoredId).not.toBe('c');
  await LibraryPersistence.rollbackBooks(db, [original]);
  const rolledBack = (await db.get('books', 'b'))!;
  expect(rolledBack.characterSettings![0]!.id).toBe('c');
  expect(rolledBack.entityTombstones).toEqual(original.entityTombstones);
  expect(
    JSON.parse((await db.get('chapter-contents', 'chapter'))!.content)[0].selectedTranslations,
  ).toEqual(original.volumes![0]!.chapters![0]!.content![0]!.selectedTranslations);
});
