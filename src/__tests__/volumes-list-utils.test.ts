import { describe, expect, it } from 'bun:test';
import {
  isSelectedChapterLoading,
  canNavigateToChapter,
} from 'src/components/novel/volumes-list-utils';

describe('volumes-list-utils', () => {
  it('加载中时仅选中章节返回 true（用于 spinner 与 loading 样式）', () => {
    const state = {
      isLoadingChapterContent: true,
      selectedChapterId: 'chapter-1',
    };

    expect(isSelectedChapterLoading(state, 'chapter-1')).toBe(true);
    expect(isSelectedChapterLoading(state, 'chapter-2')).toBe(false);
  });

  it('加载中时应阻止选中章节导航', () => {
    const state = {
      isLoadingChapterContent: true,
      selectedChapterId: 'chapter-1',
    };

    expect(canNavigateToChapter(state, 'chapter-1')).toBe(false);
  });

  it('其他章节保持可交互（可导航）', () => {
    const state = {
      isLoadingChapterContent: true,
      selectedChapterId: 'chapter-1',
    };

    expect(canNavigateToChapter(state, 'chapter-2')).toBe(true);
  });
});
