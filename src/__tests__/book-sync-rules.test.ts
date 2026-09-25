import { describe, expect, it } from 'vitest';
import type {
  BookSyncChangeset,
  SyncNewChapter,
  SyncUpdatedChapter,
  SyncVolumeTarget,
} from 'src/models/book-sync';
import {
  applyDescription,
  buildConfirmSummary,
  driftWarning,
  reconcileSelection,
  syncVerdict,
} from 'src/composables/book-sync/book-sync-rules';

function added(n: number, target: SyncVolumeTarget = { volumeId: 'v1' }, groupKey = 'g1') {
  return { url: `u${n}`, title: `第${n}话`, target, groupKey } satisfies SyncNewChapter;
}

function updated(n: number, clearedVersions = 0): SyncUpdatedChapter {
  return {
    url: `x${n}`,
    title: `旧${n}`,
    chapterId: `c${n}`,
    paragraphs: [],
    changes: [],
    revised: 1,
    inserted: 0,
    removed: 0,
    clearedVersions,
  };
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

describe('选择规则', () => {
  it('新章节首次出现时默认勾选，有更新章节从不自动勾选', () => {
    const next = reconcileSelection(
      changeset({ new: [added(1), added(2)], updated: [updated(1)] }),
      new Set(),
      new Set(),
    );
    expect([...next.selected].sort()).toEqual(['u1', 'u2']);
  });

  it('用户取消勾选的新章节在重新检查后保持不勾选', () => {
    const first = reconcileSelection(
      changeset({ new: [added(1), added(2)] }),
      new Set(),
      new Set(),
    );
    const userSelection = new Set(['u2']);
    const again = reconcileSelection(
      changeset({ new: [added(1), added(2), added(3)] }),
      userSelection,
      first.seenNew,
    );
    expect([...again.selected].sort()).toEqual(['u2', 'u3']);
  });

  it('保留用户手动勾选的有更新章节，移除已不存在的条目', () => {
    const next = reconcileSelection(
      changeset({ updated: [updated(1)] }),
      new Set(['x1', 'x2', 'gone']),
      new Set(),
    );
    expect([...next.selected]).toEqual(['x1']);
  });

  it('已跳过章节不会出现在勾选中', () => {
    const next = reconcileSelection(
      changeset({ new: [added(1)], skipped: [{ url: 'u2', title: '第2话' }] }),
      new Set(['u2']),
      new Set(['u2']),
    );
    expect([...next.selected]).toEqual(['u1']);
  });
});

describe('大面积差异提示', () => {
  const checked = (n: number) => Array.from({ length: n }, (_, i) => `x${i + 1}`);
  const updates = (n: number) => Array.from({ length: n }, (_, i) => updated(i + 1));

  it('没有比对过的章节时不提示', () => {
    expect(driftWarning(changeset())).toBe(false);
  });

  it('有更新占比恰好一半时不提示', () => {
    expect(driftWarning(changeset({ checked: checked(4), updated: updates(2) }))).toBe(false);
  });

  it('有更新占比超过一半时提示', () => {
    expect(driftWarning(changeset({ checked: checked(60), updated: updates(45) }))).toBe(true);
  });

  it('没有任何更新时不提示', () => {
    expect(driftWarning(changeset({ checked: checked(3) }))).toBe(false);
  });

  it('比对的章节太少时不提示：快速检查只抓日期变新的章节，它们本来就多半有修订', () => {
    expect(driftWarning(changeset({ checked: checked(1), updated: updates(1) }))).toBe(false);
    expect(driftWarning(changeset({ checked: checked(4), updated: updates(4) }))).toBe(false);
    expect(driftWarning(changeset({ checked: checked(5), updated: updates(3) }))).toBe(true);
  });
});

describe('确认摘要', () => {
  it('只统计已勾选的章节，清空译文版本数来自比对结果', () => {
    const summary = buildConfirmSummary(
      changeset({
        new: [added(1), added(2)],
        updated: [updated(1, 3), updated(2, 5)],
      }),
      new Set(['u1', 'x2']),
      new Map(),
    );
    expect(summary).toEqual({ newCount: 1, updatedCount: 1, clearedVersions: 5, newVolumes: [] });
  });

  it('新卷来自推断目标或用户覆盖，同名只列一次', () => {
    const summary = buildConfirmSummary(
      changeset({
        new: [
          added(1, { newTitle: '第二部' }, 'a'),
          added(2, { newTitle: '第二部' }, 'a'),
          added(3, { volumeId: 'v1' }, 'b'),
          added(4, { volumeId: 'v1' }, 'c'),
        ],
      }),
      new Set(['u1', 'u2', 'u3', 'u4']),
      new Map<string, SyncVolumeTarget>([
        ['b', { newTitle: '番外' }],
        ['a', { volumeId: 'v1' }],
      ]),
    );
    expect(summary.newVolumes).toEqual(['番外']);
    expect(summary.newCount).toBe(4);
  });

  it('没有勾选时各项为零', () => {
    expect(buildConfirmSummary(changeset({ new: [added(1)] }), new Set(), new Map())).toEqual({
      newCount: 0,
      updatedCount: 0,
      clearedVersions: 0,
      newVolumes: [],
    });
  });
});

describe('检查结论', () => {
  it('没有变化且都按日期判断过：已是最新', () => {
    const verdict = syncVerdict(
      changeset({ unchecked: ['a', 'b'], dateUnchanged: ['a', 'b'], checked: ['c'] }),
      false,
    );
    expect(verdict).toMatchObject({ tone: 'latest', title: '已是最新' });
    expect(verdict.details).toEqual(['已导入 3 章', '2 章按更新日期无变化', '1 章已比对无变化']);
    expect(verdict.deepHint).toContain('更新日期不一定可靠');
  });

  it('有新章节或修订时标题直接给出数量，只列出非零项', () => {
    const verdict = syncVerdict(
      changeset({
        new: [added(1), added(2)],
        updated: [updated(1)],
        checked: ['x1'],
        unchecked: ['a'],
        skipped: [{ url: 's', title: '人物' }],
      }),
      false,
    );
    expect(verdict).toMatchObject({ tone: 'changes', title: '2 章新章节 · 1 章原文有修订' });
    expect(verdict.details).toEqual(['已导入 2 章', '1 章未比对正文', '跳过 1 章']);
  });

  it('站点没有更新日期、正文也没比对时不宣称已是最新', () => {
    const verdict = syncVerdict(changeset({ unchecked: ['a', 'b'] }), false);
    expect(verdict).toMatchObject({ tone: 'pending', title: '没有新章节' });
    expect(verdict.deepHint).toContain('2 章');
  });

  it('日期较新但尚未比对的章节单独说明，不算作没有日期', () => {
    const verdict = syncVerdict(
      changeset({ unchecked: ['a', 'b', 'c'], dateNewer: ['a', 'b'] }),
      false,
    );
    expect(verdict).toMatchObject({ tone: 'pending', title: '没有新章节' });
    expect(verdict.details).toEqual(['已导入 3 章', '2 章更新日期较新、可能有修订', '1 章未比对正文']);
    expect(verdict.deepHint).toBe(
      '2 章更新日期较新、1 章没有可用的更新日期，逐章比对正文才能确认是否有修订。',
    );
  });

  it('只有日期较新未比对的章节时不提「没有可用的更新日期」', () => {
    const verdict = syncVerdict(changeset({ unchecked: ['a'], dateNewer: ['a'] }), false);
    expect(verdict.deepHint).toBe('1 章更新日期较新，逐章比对正文才能确认是否有修订。');
  });

  it('全部比对过就不再提示逐章比对', () => {
    expect(syncVerdict(changeset({ checked: ['a'] }), false).deepHint).toBeUndefined();
  });

  it('新建书籍：可导入的章数与目录总数', () => {
    const verdict = syncVerdict(
      changeset({ new: [added(1), added(2)], skipped: [{ url: 's', title: '人物' }] }),
      true,
    );
    expect(verdict).toMatchObject({ tone: 'changes', title: '可导入 2 章' });
    expect(verdict.details).toEqual(['目录共 3 章', '跳过 1 章']);
    expect(verdict.deepHint).toBeUndefined();
  });

  it('只有失败时提示检查失败', () => {
    const verdict = syncVerdict(
      changeset({ failed: [{ url: 'f', code: 'X', message: 'm' }], checked: ['a'] }),
      false,
    );
    expect(verdict).toMatchObject({ tone: 'failed', title: '部分章节检查失败' });
  });
});

describe('应用说明', () => {
  it('说明本次会写入什么', () => {
    expect(applyDescription({ newCount: 3, updatedCount: 0 })).toBe('将写入 3 章新章节');
    expect(applyDescription({ newCount: 2, updatedCount: 1 })).toBe('将写入 2 章新章节，更新 1 章');
    expect(applyDescription({ newCount: 0, updatedCount: 2 })).toBe('将更新 2 章');
    expect(applyDescription({ newCount: 0, updatedCount: 0 })).toBe('还没有勾选章节');
  });
});
