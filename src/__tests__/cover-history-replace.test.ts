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
