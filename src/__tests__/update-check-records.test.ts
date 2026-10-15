import { describe, expect, it } from 'vitest';
import './setup';
import type { BookSyncChangeset, BookUpdateRecipe, SyncNewChapter } from 'src/models/book-sync';
import type { Chapter, Novel } from 'src/models/novel';
import {
  buildUpdateCheckRecord,
  loadUpdateCheckRecords,
  pendingUpdateCounts,
  saveUpdateCheckRecords,
  type UpdateCheckRecord,
} from 'src/services/book-sync/update-check-records';

const STORAGE_KEY = 'tsukuyomi-book-update-checks';

function added(url: string): SyncNewChapter {
  return { url, title: url, target: { volumeId: 'v1' }, groupKey: 'g1' };
}

function changeset(partial: Partial<BookSyncChangeset> = {}): BookSyncChangeset {
  return {
    baseRevision: 1,
    new: [],
    updated: [],
    skipped: [],
    failed: [],
    unchecked: [],
    checked: [],
    dateUnchanged: [],
    dateNewer: [],
    status: 'ready',
    ...partial,
  };
}

function chapter(webUrl: string, partial: Partial<Chapter> = {}): Chapter {
  return {
    id: webUrl,
    title: webUrl,
    webUrl,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    lastEdited: new Date('2026-01-01T00:00:00Z'),
    ...partial,
  } as Chapter;
}

function book(chapters: Chapter[], partial: Partial<Novel> = {}): Novel {
  return {
    id: 'b1',
    title: '测试书',
    volumes: [{ id: 'v1', title: '卷一', chapters }],
    createdAt: new Date(0),
    lastEdited: new Date(0),
    ...partial,
  } as Novel;
}

describe('检查结果记录', () => {
  it('记下新章节网址，以及待比对章节检查时的本地日期', () => {
    const current = book([
      chapter('c1', { lastUpdated: new Date('2026-03-01T00:00:00Z') }),
      chapter('c2'),
    ]);

    const record = buildUpdateCheckRecord(
      current,
      changeset({ new: [added('n1'), added('n2')], dateNewer: ['c1', 'c2', 'gone'] }),
      1000,
    );

    expect(record).toEqual({
      checkedAt: 1000,
      newUrls: ['n1', 'n2'],
      changed: [
        { url: 'c1', stamp: Date.parse('2026-03-01T00:00:00Z') },
        { url: 'c2', stamp: Date.parse('2026-01-01T00:00:00Z') },
      ],
    });
  });

  it('lastUpdated 为空字符串等假值时按 createdAt 记录，与快速检查的判定一致', () => {
    const current = book([chapter('c1', { lastUpdated: '' as unknown as Date })]);

    const record = buildUpdateCheckRecord(current, changeset({ dateNewer: ['c1'] }), 1);

    expect(record.changed).toEqual([{ url: 'c1', stamp: Date.parse('2026-01-01T00:00:00Z') }]);
    expect(pendingUpdateCounts(current, record).changedCount).toBe(1);
  });

  it('按当前书籍计算待处理数：未变化时与检查结果一致', () => {
    const current = book([chapter('c1')]);
    const record = buildUpdateCheckRecord(
      current,
      changeset({ new: [added('n1'), added('n2')], dateNewer: ['c1'] }),
      1,
    );

    expect(pendingUpdateCounts(current, record)).toEqual({ newCount: 2, changedCount: 1 });
  });

  it('新章节导入后不再计数', () => {
    const record = buildUpdateCheckRecord(
      book([]),
      changeset({ new: [added('n1'), added('n2')] }),
      1,
    );

    expect(pendingUpdateCounts(book([chapter('n1')]), record)).toEqual({
      newCount: 1,
      changedCount: 0,
    });
  });

  it('被跳过的新章节不再计数', () => {
    const record = buildUpdateCheckRecord(book([]), changeset({ new: [added('n1')] }), 1);
    const skipped = book([], {
      updateRecipe: { skippedUrls: [{ url: 'n1', title: 'n1' }] } as BookUpdateRecipe,
    });

    expect(pendingUpdateCounts(skipped, record).newCount).toBe(0);
  });

  it('待比对章节的本地日期变化（已比对或已应用）后不再计数', () => {
    const record = buildUpdateCheckRecord(
      book([chapter('c1')]),
      changeset({ dateNewer: ['c1'] }),
      1,
    );
    const confirmed = book([chapter('c1', { lastUpdated: new Date('2026-05-01T00:00:00Z') })]);

    expect(pendingUpdateCounts(confirmed, record).changedCount).toBe(0);
  });

  it('待比对章节被删除后不再计数', () => {
    const record = buildUpdateCheckRecord(
      book([chapter('c1')]),
      changeset({ dateNewer: ['c1'] }),
      1,
    );

    expect(pendingUpdateCounts(book([]), record).changedCount).toBe(0);
  });

  it('日期为字符串（从存储读回）时同样可比较', () => {
    const record = buildUpdateCheckRecord(
      book([chapter('c1')]),
      changeset({ dateNewer: ['c1'] }),
      1,
    );
    const fromStorage = book([
      chapter('c1', { createdAt: '2026-01-01T00:00:00.000Z' as unknown as Date }),
    ]);

    expect(pendingUpdateCounts(fromStorage, record).changedCount).toBe(1);
  });
});

describe('检查结果持久化', () => {
  const record: UpdateCheckRecord = {
    checkedAt: 5,
    newUrls: ['n1'],
    changed: [{ url: 'c1', stamp: 9 }],
  };

  it('保存后可读回', () => {
    saveUpdateCheckRecords({ b1: record });
    expect(loadUpdateCheckRecords()).toEqual({ b1: record });
  });

  it('没有存储时为空', () => {
    expect(loadUpdateCheckRecords()).toEqual({});
  });

  it('存储损坏或不是对象时为空', () => {
    localStorage.setItem(STORAGE_KEY, '{oops');
    expect(loadUpdateCheckRecords()).toEqual({});
    localStorage.setItem(STORAGE_KEY, '[1,2]');
    expect(loadUpdateCheckRecords()).toEqual({});
    localStorage.setItem(STORAGE_KEY, 'null');
    expect(loadUpdateCheckRecords()).toEqual({});
  });

  it('丢弃格式不对的条目，保留合法条目', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        b1: record,
        b2: { checkedAt: 'x', newUrls: [], changed: [] },
        b3: { checkedAt: 1, newUrls: [1], changed: [] },
        b4: { checkedAt: 1, newUrls: [], changed: [{ url: 'c', stamp: 'x' }] },
        b5: 'nope',
      }),
    );

    expect(loadUpdateCheckRecords()).toEqual({ b1: record });
  });
});
