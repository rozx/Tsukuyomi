import { expect } from 'vitest';
import './setup';
import { describe, it, spyOn, mock, afterEach } from 'bun:test';
import { IDBObjectStore } from 'fake-indexeddb';
import type { Novel } from '../models/novel';
import { getDB } from '../utils/indexed-db';
import { LibraryPersistence } from '../services/library-persistence';
import { normalizeBookLanguages } from '../services/localization/normalize';
import { mergeBookEntityState } from '../services/localization/entities';
import { entityKey } from '../services/localization/entity-identity';
import { setNameTranslation } from '../services/localization/selection';

function book(): Novel {
  return normalizeBookLanguages({
    id: 'b',
    title: 'B',
    createdAt: new Date(0),
    lastEdited: new Date(0),
    terminologies: [
      {
        id: 't',
        name: 'Term',
        description: 'original',
        translation: { id: 'cn', translation: '术语', aiModelId: 'm' },
      },
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

afterEach(() => mock.restore());
describe('书内实体实际写入', () => {
  it('只写用户改变的字段，保留事务开始前收到的其他语言和其他字段', async () => {
    const db = await getDB();
    const base = book();
    const latest = book();
    latest.terminologies![0]!.description = 'remote';
    latest.terminologies![0]!.fieldRevisions!.description = { counter: 100, actorId: 'remote' };
    latest.terminologies![0] = setNameTranslation(
      latest.terminologies![0]!,
      'en-US',
      { id: 'en', translation: 'Term', aiModelId: 'm' },
      { counter: 101, actorId: 'remote' },
      0,
    );
    await db.put('books', latest);
    const edited = { ...base.terminologies![0]!, name: 'Renamed' };
    const result = await LibraryPersistence.editEntities(
      db,
      base,
      { terminologies: [edited] },
      'zh-CN',
    );
    const term = result.terminologies![0]!;
    expect(term.name).toBe('Renamed');
    expect(term.description).toBe('remote');
    expect(term.translationsByLanguage!['en-US']!.value!.translation).toBe('Term');
    expect(term.fieldRevisions!.name!.counter).toBeGreaterThan(101);
    expect(term.fieldRevisions!.description).toEqual(
      latest.terminologies![0]!.fieldRevisions!.description,
    );
    expect(await db.get('books', 'b')).toEqual(result);
  });

  it('删除和 tombstone 原子提交，长期离线回流仍不能复活，迟到编辑被拒绝', async () => {
    const db = await getDB();
    const base = book();
    await db.put('books', base);
    const deleted = await LibraryPersistence.editEntities(
      db,
      base,
      { characterSettings: [] },
      'zh-CN',
    );
    expect(deleted.characterSettings).toEqual([]);
    expect(deleted.entityTombstones![entityKey('character', 'c')]).toBeDefined();
    expect(deleted.entityTombstones![entityKey('alias', 'a', 'c')]).toBeDefined();
    expect(mergeBookEntityState(deleted, base).characterSettings).toEqual([]);
    await expect(
      LibraryPersistence.editEntities(
        db,
        base,
        { characterSettings: [{ ...base.characterSettings![0]!, name: 'Late' }] },
        'zh-CN',
      ),
    ).rejects.toThrow('ENTITY_DELETED');
    expect((await db.get('books', 'b'))!.characterSettings).toEqual([]);
  });

  it('书籍写入失败回滚实体和删除记录，已预留的逻辑版本不重用', async () => {
    const db = await getDB();
    const base = book();
    await db.put('books', base);
    const originalPut = Reflect.get(IDBObjectStore.prototype, 'put') as IDBObjectStore['put'];
    const put = spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<typeof originalPut>
    ) {
      if (this.name === 'books') throw new Error('disk full');
      return originalPut.apply(this, args);
    });
    await expect(
      LibraryPersistence.editEntities(db, base, { terminologies: [] }, 'zh-CN'),
    ).rejects.toThrow('disk full');
    put.mockRestore();
    const failedCounter = (await db.get('sync-metadata', 'clock'))!.counter;
    expect(await db.get('books', 'b')).toEqual(base);
    const result = await LibraryPersistence.editEntities(db, base, { terminologies: [] }, 'zh-CN');
    expect(result.entityTombstones![entityKey('term', 't')]!.revision.counter).toBeGreaterThan(
      failedCounter,
    );
  });
});

it('store 删除保存失败时仍显示原实体，成功时发布已持久化的版本和 tombstone', async () => {
  const { createPinia, setActivePinia } = await import('pinia');
  const { useBooksStore } = await import('../stores/books');
  setActivePinia(createPinia());
  const db = await getDB();
  const base = book();
  await db.put('books', base);
  const store = useBooksStore();
  store.books = [base];
  const originalPut = Reflect.get(IDBObjectStore.prototype, 'put') as IDBObjectStore['put'];
  const put = spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    ...args: Parameters<typeof originalPut>
  ) {
    if (this.name === 'books') throw new Error('disk full');
    return originalPut.apply(this, args);
  });
  await expect(store.updateBook('b', { terminologies: [] })).rejects.toThrow('disk full');
  expect(store.getBookById('b')!.terminologies![0]!.id).toBe('t');
  put.mockRestore();
  await store.updateBook('b', { terminologies: [] });
  expect(store.getBookById('b')!.entityTombstones![entityKey('term', 't')]).toBeDefined();
});

it('其他业务路径保存旧书籍副本时保留删除记录，不能重新写回已删实体', async () => {
  const { BookService } = await import('../services/book-service');
  const db = await getDB();
  const base = book();
  await LibraryPersistence.saveBooks(db, [base]);
  const deleted = await LibraryPersistence.editEntities(
    db,
    base,
    { characterSettings: [] },
    'zh-CN',
  );
  await BookService.saveBook({ ...base, title: 'New title' }, { saveChapterContent: false });
  const saved = (await BookService.getBookById('b'))!;
  expect(saved.characterSettings).toEqual([]);
  expect(saved.entityTombstones).toEqual(deleted.entityTombstones);
  expect(saved.title).toBe('New title');
});
