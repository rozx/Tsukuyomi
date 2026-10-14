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
        chapterId: 'c1',
        signatures: ['a', 'c'],
        ranges: 2,
        removed: 11,
        added: 43,
        versions: 1,
        entries: expect.any(Array),
      },
      {
        chapterId: 'c2',
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
    expect(items.replacementGroups[0]!.chapterId).toBe('');
  });
});
