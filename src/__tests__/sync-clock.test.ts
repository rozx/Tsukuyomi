import { expect } from 'vitest';
import './setup';
import { describe, it } from 'bun:test';
import { getDB } from '../utils/indexed-db';
import { reserveSyncRevision } from '../services/localization/clock';

describe('本地逻辑版本分配', () => {
  it('并发请求串行分配且高于远端观察版本，系统时间不参与', async () => {
    const db = await getDB();
    const values = await Promise.all(
      Array.from({ length: 12 }, () =>
        reserveSyncRevision(db, [{ counter: 100, actorId: 'remote' }]),
      ),
    );
    expect(new Set(values.map((v) => v.counter)).size).toBe(12);
    expect(values.map((v) => v.counter).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 101),
    );
    expect(new Set(values.map((v) => v.actorId)).size).toBe(1);
    expect(values[0]!.actorId).not.toBe('remote');
  });

  it('业务事务失败不会复用已预留的版本', async () => {
    const db = await getDB();
    const first = await reserveSyncRevision(db);
    const tx = db.transaction('books', 'readwrite');
    const done = tx.done.catch(() => undefined);
    await tx.store.put({ id: 'b', title: 'Book', createdAt: new Date(), lastEdited: new Date() });
    tx.abort();
    await done;
    expect(await db.get('books', 'b')).toBeUndefined();
    const second = await reserveSyncRevision(db);
    expect(second.actorId).toBe(first.actorId);
    expect(second.counter).toBe(first.counter + 1);
  });

  it('计数溢出、损坏的本地状态与非法远端版本被拒绝', async () => {
    const db = await getDB();
    await expect(reserveSyncRevision(db, [{ counter: -1, actorId: 'bad' }])).rejects.toThrow(
      'INVALID_SYNC_REVISION',
    );
    await expect(
      reserveSyncRevision(db, [{ counter: Number.MAX_SAFE_INTEGER, actorId: 'remote' }]),
    ).rejects.toThrow('SYNC_COUNTER_OVERFLOW');
    await db.put('sync-metadata', { key: 'clock', actorId: '', counter: 1 });
    await expect(reserveSyncRevision(db)).rejects.toThrow('INVALID_SYNC_REVISION');
  });
});

it('收到远端实体版本立即推进本地计数，恢复书籍不会克隆或重置本机 actorId', async () => {
  const { LibraryPersistence } = await import('../services/library-persistence');
  const db = await getDB();
  const first = await reserveSyncRevision(db);
  await LibraryPersistence.saveBooks(db, [
    {
      id: 'remote-book',
      title: 'Remote',
      createdAt: new Date(0),
      lastEdited: new Date(0),
      terminologies: [
        {
          id: 't',
          name: 'Term',
          fieldRevisions: { name: { counter: 700, actorId: 'remote' } },
          translation: { id: '', translation: '', aiModelId: '' },
        },
      ],
    },
  ]);
  expect((await db.get('sync-metadata', 'clock'))!.counter).toBe(700);
  expect((await db.get('sync-metadata', 'clock'))!.actorId).toBe(first.actorId);
  await LibraryPersistence.clear(db, true);
  const next = await reserveSyncRevision(db);
  expect(next.actorId).toBe(first.actorId);
  expect(next.counter).toBe(701);
});

it('批量书籍和单章正文中的选用版本也推进计数器', async () => {
  const { LibraryPersistence } = await import('../services/library-persistence');
  const db = await getDB();
  const paragraph = {
    id: 'p',
    text: 'Source',
    selectedTranslationId: '',
    translations: [],
    selectedTranslations: {
      'en-US': { value: null, revision: { counter: 1000, actorId: 'remote' }, updatedAt: 0 },
    },
  };
  await LibraryPersistence.saveBooks(db, [
    {
      id: 'b',
      title: 'Book',
      createdAt: new Date(0),
      lastEdited: new Date(0),
      volumes: [
        {
          id: 'v',
          title: 'V',
          chapters: [
            {
              id: 'c',
              title: 'C',
              createdAt: new Date(0),
              lastEdited: new Date(0),
              content: [paragraph],
            },
          ],
        },
      ],
    },
  ]);
  expect((await db.get('sync-metadata', 'clock'))!.counter).toBe(1000);
  await LibraryPersistence.saveChapter(db, 'b', 'c', [
    {
      ...paragraph,
      selectedTranslations: {
        'en-US': { value: null, revision: { counter: 2000, actorId: 'remote' }, updatedAt: 0 },
      },
    },
  ]);
  expect((await db.get('sync-metadata', 'clock'))!.counter).toBe(2000);
});
