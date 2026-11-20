import { computed, ref, type Ref } from 'vue';
import type { Novel, Volume } from 'src/models/novel';

export type VolumeSelectionState = 'none' | 'some' | 'all';

/**
 * 章节列表多选模式的状态（桌面、平板、手机三个变体共用，由书籍详情页 composable 创建一次）。
 */
export function createChapterBatchSelection(book: Ref<Novel | undefined>) {
  const active = ref(false);
  const selected = ref<Set<string>>(new Set());

  /** 书中章节的顺序（用于按书序入队） */
  const chapterOrder = computed(() =>
    (book.value?.volumes ?? []).flatMap((volume) => (volume.chapters ?? []).map((c) => c.id)),
  );

  const replace = (next: Set<string>) => {
    selected.value = next;
  };

  const enter = () => {
    active.value = true;
  };
  const exit = () => {
    active.value = false;
    replace(new Set());
  };
  const isSelected = (chapterId: string) => selected.value.has(chapterId);
  const toggle = (chapterId: string) => {
    const next = new Set(selected.value);
    if (next.has(chapterId)) next.delete(chapterId);
    else next.add(chapterId);
    replace(next);
  };

  const volumeState = (volume: Volume): VolumeSelectionState => {
    const ids = (volume.chapters ?? []).map((chapter) => chapter.id);
    const picked = ids.filter((id) => selected.value.has(id)).length;
    if (picked === 0 || ids.length === 0) return 'none';
    return picked === ids.length ? 'all' : 'some';
  };
  /** 未全选的卷：勾选整卷；已全选：取消整卷 */
  const toggleVolume = (volume: Volume) => {
    const ids = (volume.chapters ?? []).map((chapter) => chapter.id);
    const next = new Set(selected.value);
    if (volumeState(volume) === 'all') ids.forEach((id) => next.delete(id));
    else ids.forEach((id) => next.add(id));
    replace(next);
  };

  /** 按条件勾选全书章节（如「选未翻译」） */
  const selectWhere = (predicate: (chapterId: string) => boolean) => {
    replace(new Set(chapterOrder.value.filter(predicate)));
  };

  const orderedIds = computed(() => chapterOrder.value.filter((id) => selected.value.has(id)));
  const count = computed(() => selected.value.size);

  return {
    active,
    count,
    orderedIds,
    chapterOrder,
    enter,
    exit,
    isSelected,
    toggle,
    volumeState,
    toggleVolume,
    selectWhere,
  };
}

export type ChapterBatchSelection = ReturnType<typeof createChapterBatchSelection>;
