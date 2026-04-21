import type { MenuItem } from 'primevue/menuitem';

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

/**
 * 构建 ⋮ 动作菜单「编辑卷 / 删除卷」两项。被 VolumesListTablet 与 BooksPageTablet
 * 复用，避免重复样板（两处仅是 command 回调实现不同）。
 */
export const buildVolumeActionMenuItems = (handlers: {
  onEdit: () => void;
  onDelete: () => void;
}): MenuItem[] => [
  {
    label: '编辑卷',
    icon: 'pi pi-pencil',
    command: handlers.onEdit,
  },
  {
    label: '删除卷',
    icon: 'pi pi-trash',
    class: 'p-menuitem-danger',
    command: handlers.onDelete,
  },
];

/**
 * 构建 ⋮ 动作菜单「编辑章节 / 上移 / 下移 / 删除章节」四项。被 VolumesListTablet
 * 与 BooksPageTablet 复用。
 */
export const buildChapterActionMenuItems = (handlers: {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}): MenuItem[] => [
  {
    label: '编辑章节',
    icon: 'pi pi-pencil',
    command: handlers.onEdit,
  },
  {
    label: '上移',
    icon: 'pi pi-arrow-up',
    disabled: !handlers.canMoveUp,
    command: handlers.onMoveUp,
  },
  {
    label: '下移',
    icon: 'pi pi-arrow-down',
    disabled: !handlers.canMoveDown,
    command: handlers.onMoveDown,
  },
  { separator: true },
  {
    label: '删除章节',
    icon: 'pi pi-trash',
    class: 'p-menuitem-danger',
    command: handlers.onDelete,
  },
];
