import { describe, expect, it } from 'vitest';
import {
  DRAFT_PAGE,
  draftChapterWindows,
  moreDraftChapters,
  toggleDraftVolume,
} from 'src/composables/import-page/import-draft-windows';

const volumes = (...counts: number[]) => counts.map((count, index) => ({ id: `v${index}`, count }));

describe('草稿章节分批渲染', () => {
  it('空草稿与小草稿全部显示', () => {
    expect(draftChapterWindows([], {})).toEqual({});
    expect(draftChapterWindows(volumes(3, 12), {})).toEqual({ v0: 3, v1: 12 });
  });

  it('单卷超过一页时只显示第一页', () => {
    expect(draftChapterWindows(volumes(1000), {})).toEqual({ v0: DRAFT_PAGE });
  });

  it('默认总行数有预算，超出预算的后续卷折叠，但不会只显示半页', () => {
    const shown = draftChapterWindows(
      volumes(200, 200, 200, 200, 200, 200),
      {},
      {
        page: 50,
        budget: 120,
      },
    );
    expect(shown).toEqual({ v0: 50, v1: 50, v2: 50, v3: 0, v4: 0, v5: 0 });
  });

  it('用户展开或加载更多的卷按其选择显示，不影响其他卷的默认状态', () => {
    const shown = draftChapterWindows(
      volumes(200, 200, 200),
      { v2: 150, v0: 0 },
      {
        page: 50,
        budget: 60,
      },
    );
    expect(shown).toEqual({ v0: 0, v1: 50, v2: 150 });
  });

  it('展开或加载更多前面的卷不会让后面已折叠的卷自动展开', () => {
    const options = { page: 50, budget: 60 };
    expect(draftChapterWindows(volumes(200, 200, 200), {}, options)).toEqual({
      v0: 50,
      v1: 50,
      v2: 0,
    });
    expect(draftChapterWindows(volumes(200, 200, 200), { v0: 100 }, options)).toEqual({
      v0: 100,
      v1: 50,
      v2: 0,
    });
  });

  it('选择数超过卷章数时按实际章数显示，删除章节后不越界', () => {
    expect(draftChapterWindows(volumes(30), { v0: 400 })).toEqual({ v0: 30 });
  });

  it('加载更多每次增加一页并封顶', () => {
    expect(moreDraftChapters(50, 1000, 50)).toBe(100);
    expect(moreDraftChapters(980, 1000, 50)).toBe(1000);
  });

  it('折叠与展开：展开后显示第一页，折叠后为 0', () => {
    expect(toggleDraftVolume(0, 300, 50)).toBe(50);
    expect(toggleDraftVolume(0, 12, 50)).toBe(12);
    expect(toggleDraftVolume(150, 300, 50)).toBe(0);
  });
});
