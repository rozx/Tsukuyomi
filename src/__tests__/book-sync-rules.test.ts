import { describe, expect, it } from 'vitest';
import type {
  BookSyncChangeset,
  SyncNewChapter,
  SyncUpdatedChapter,
  SyncVolumeTarget,
} from 'src/models/book-sync';
import {
  buildConfirmSummary,
  driftWarning,
  reconcileSelection,
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
