import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createPinia, setActivePinia } from 'pinia';
import { getDB } from '../utils/indexed-db';
import { useCoverHistoryStore } from '../stores/cover-history';

afterEach(() => vi.restoreAllMocks());

describe('封面历史原样替换', () => {
  it('任一写入失败时整体拒绝，库与内存都保持替换前状态', async () => {
    setActivePinia(createPinia());
    const db = await getDB();
    await db.clear('cover-history');
    const before = { id: 'keep', url: 'https://img.example/keep.png', addedAt: new Date(1) };
    await db.put('cover-history', before);
    const covers = useCoverHistoryStore();
    await covers.loadCoverHistory();

    const realPut = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, 'put')!
      .value as IDBObjectStore['put'];
    let calls = 0;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['put']>
    ) {
      calls += 1;
      if (calls === 2) throw new DOMException('quota', 'QuotaExceededError');
      return Reflect.apply(realPut, this, args) as IDBRequest<IDBValidKey>;
    });

    await expect(
      covers.replaceHistory([
        { id: 'a', url: 'https://img.example/a.png', addedAt: new Date(2) },
        { id: 'b', url: 'https://img.example/b.png', addedAt: new Date(3) },
      ]),
    ).rejects.toThrow();
    vi.restoreAllMocks();

    expect(covers.covers).toEqual([before]);
    expect(await db.getAll('cover-history')).toEqual([before]);
  });
});

describe('封面历史按原身份合并', () => {
  const URL_A = 'https://img.example/a.png';
  const URL_B = 'https://img.example/b.png';

  async function persisted() {
    const db = await getDB();
    return (await db.getAll('cover-history')).sort((a, b) => a.id.localeCompare(b.id));
  }

  it('载荷含同 id 不同 URL 的记录时只保留 addedAt 较新的一条，内存与库一致', async () => {
    setActivePinia(createPinia());
    await (await getDB()).clear('cover-history');
    const covers = useCoverHistoryStore();
    await covers.loadCoverHistory();

    await covers.upsertCovers([
      { id: 'dup', url: URL_B, addedAt: new Date(5) },
      { id: 'dup', url: URL_A, addedAt: new Date(2) },
    ]);

    const expected = [{ id: 'dup', url: URL_B, addedAt: new Date(5) }];
    expect(await persisted()).toEqual(expected);
    expect(covers.covers.map((c) => ({ id: c.id, url: c.url, addedAt: c.addedAt }))).toEqual(
      expected,
    );
  });

  it('原样替换时同 id 重复记录同样只保留一条，内存与库一致', async () => {
    setActivePinia(createPinia());
    await (await getDB()).clear('cover-history');
    const covers = useCoverHistoryStore();
    await covers.loadCoverHistory();

    await covers.replaceHistory([
      { id: 'dup', url: URL_A, addedAt: new Date(2) },
      { id: 'dup', url: URL_B, addedAt: new Date(5) },
    ]);

    const expected = [{ id: 'dup', url: URL_B, addedAt: new Date(5) }];
    expect(await persisted()).toEqual(expected);
    expect(covers.covers).toHaveLength(1);
    expect(covers.covers[0]).toMatchObject(expected[0]!);
  });

  it('远端身份取代本地记录时保留较新的本地 addedAt', async () => {
    setActivePinia(createPinia());
    const db = await getDB();
    await db.clear('cover-history');
    await db.put('cover-history', { id: 'local-a', url: URL_A, addedAt: new Date(900) });
    await db.put('cover-history', { id: 'same-b', url: URL_B, addedAt: new Date(800) });
    const covers = useCoverHistoryStore();
    await covers.loadCoverHistory();

    await covers.upsertCovers([
      { id: 'remote-a', url: URL_A, addedAt: new Date(100) },
      { id: 'same-b', url: URL_B, addedAt: new Date(200) },
    ]);

    const expected = [
      { id: 'remote-a', url: URL_A, addedAt: new Date(900) },
      { id: 'same-b', url: URL_B, addedAt: new Date(800) },
    ];
    expect(await persisted()).toEqual(expected);
    expect(
      [...covers.covers]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((c) => ({ id: c.id, url: c.url, addedAt: c.addedAt })),
    ).toEqual(expected);
  });
});
