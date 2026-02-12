export interface ChapterLoadingState {
  isLoadingChapterContent?: boolean;
  selectedChapterId: string | null;
}

export const isSelectedChapterLoading = (
  state: ChapterLoadingState,
  chapterId: string,
): boolean => {
  return Boolean(state.isLoadingChapterContent && state.selectedChapterId === chapterId);
};

export const canNavigateToChapter = (state: ChapterLoadingState, chapterId: string): boolean => {
  return !isSelectedChapterLoading(state, chapterId);
};
