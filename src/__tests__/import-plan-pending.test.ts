import { describe, expect, it } from 'vitest';
import { planPendingItems } from 'src/composables/import-page/import-plan-pending';
import type { ImportPlan } from 'src/models/import';

type Range = NonNullable<ImportPlan['replacements']>[number];

function range(
  signature: string,
  chapterId: string,
  sizes: [number, number, number],
  confirmed = false,
): Range {
  const [removed, added, versions] = sizes;
  return {
    signature,
    oldKeys: Array.from({ length: removed }, (_, i) => ({
      chapterId,
      paragraphId: `${signature}-${i}`,
    })),
    newKeys: Array.from({ length: added }, (_, i) => `${signature}-n${i}`),
    clearedVersions: versions,
    confirmed,
  };
}

/** 跨越多章的替换：每章各一段旧原文 */
function spanning(signature: string, chapterIds: string[], versions: number): Range {
  return {
    signature,
    oldKeys: chapterIds.map((chapterId, i) => ({ chapterId, paragraphId: `${signature}-${i}` })),
    newKeys: [`${signature}-n0`],
    clearedVersions: versions,
    confirmed: false,
  };
}

const conflict = (code: string) => ({ code, message: code });

function plan(partial: Partial<ImportPlan>): ImportPlan {
  return { conflicts: [], replacements: [], ...partial } as unknown as ImportPlan;
}

describe('planPendingItems', () => {
  it('替换按所在章节合并，按首次出现的顺序，汇总段数与译文损失', () => {
    const items = planPendingItems(
      plan({
        replacements: [
          range('a', 'c1', [7, 27, 0]),
          range('b', 'c2', [1, 6, 2]),
          range('c', 'c1', [4, 16, 1]),
        ],
      }),
    );
    expect(items.replacementGroups).toEqual([
      {
        key: 'c1',
        chapterIds: ['c1'],
        signatures: ['a', 'c'],
        ranges: 2,
        removed: 11,
        added: 43,
        versions: 1,
        entries: expect.any(Array),
      },
      {
        key: 'c2',
        chapterIds: ['c2'],
        signatures: ['b'],
        ranges: 1,
        removed: 1,
        added: 6,
        versions: 2,
        entries: expect.any(Array),
      },
    ]);
    expect(items.pending).toBe(2);
  });

  it('已确认的替换不计入', () => {
    const items = planPendingItems(
      plan({ replacements: [range('a', 'c1', [1, 2, 0], true), range('b', 'c1', [1, 2, 0])] }),
    );
    expect(items.replacementGroups.map((group) => group.signatures)).toEqual([['b']]);
  });

  it('替换带出的冲突不重复计入，其他冲突照常计入', () => {
    const items = planPendingItems(
      plan({
        conflicts: [
          conflict('REPLACEMENT_REQUIRED'),
          conflict('AMBIGUOUS_PARAGRAPH'),
          conflict('MATCHING_LIMIT'),
          conflict('CHAPTER_MATCH_REQUIRED'),
        ] as ImportPlan['conflicts'],
        replacements: [range('a', 'c1', [1, 2, 0])],
      }),
    );
    expect(items.conflicts.map((entry) => entry.code)).toEqual(['CHAPTER_MATCH_REQUIRED']);
    expect(items.pending).toBe(2);
  });

  it('964 处替换分布在 18 章：只算 18 项', () => {
    const replacements = Array.from({ length: 964 }, (_, i) =>
      range(`r${i}`, `c${i % 18}`, [4, 16, 0]),
    );
    const conflicts = replacements.map(() => conflict('REPLACEMENT_REQUIRED'));
    const items = planPendingItems(
      plan({ replacements, conflicts: conflicts as ImportPlan['conflicts'] }),
    );
    expect(items.pending).toBe(18);
  });

  it('旧方案的替换缺少 oldKeys 时归入同一组，不报错', () => {
    const items = planPendingItems(
      plan({ replacements: [{ signature: 'x', confirmed: false } as Range] }),
    );
    expect(items.replacementGroups).toHaveLength(1);
    expect(items.replacementGroups[0]!.chapterIds).toEqual([]);
  });

  it('跨章替换按受影响章节集合单独成组，列出全部章节，不并入首章', () => {
    const items = planPendingItems(
      plan({
        replacements: [
          range('a', 'c1', [1, 2, 0]),
          spanning('x', ['c1', 'c2'], 1),
          range('b', 'c2', [1, 2, 0]),
          spanning('y', ['c1', 'c2'], 2),
          spanning('z', ['c2', 'c3'], 0),
        ],
      }),
    );
    expect(
      items.replacementGroups.map((group) => [group.chapterIds, group.signatures, group.removed]),
    ).toEqual([
      [['c1'], ['a'], 1],
      [['c1', 'c2'], ['x', 'y'], 4],
      [['c2'], ['b'], 1],
      [['c2', 'c3'], ['z'], 2],
    ]);
    expect(items.pending).toBe(4);
  });

  it('同一替换内章节按出现顺序去重', () => {
    const entry = spanning('x', ['c2', 'c1'], 0);
    entry.oldKeys.push({ chapterId: 'c2', paragraphId: 'x-extra' });
    const items = planPendingItems(plan({ replacements: [entry] }));
    expect(items.replacementGroups[0]!.chapterIds).toEqual(['c2', 'c1']);
  });
});
