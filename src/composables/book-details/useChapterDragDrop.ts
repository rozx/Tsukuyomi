import { ref } from 'vue';
import type { Ref } from 'vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useBooksStore } from 'src/stores/books';
import { ChapterService } from 'src/services/chapter-service';
import { getChapterDisplayTitle } from 'src/utils';
import type { Chapter, Novel } from 'src/models/novel';

export function useChapterDragDrop(
  book: Ref<Novel | undefined>,
  saveState?: (description?: string) => void,
) {
  const toast = useToastWithHistory();
  const booksStore = useBooksStore();

  // 拖拽状态
  const draggedChapter = ref<{
    chapter: Chapter;
    sourceVolumeId: string;
    sourceIndex: number;
  } | null>(null);
  const dragOverVolumeId = ref<string | null>(null);
  const dragOverIndex = ref<number | null>(null);

  // 拖拽处理函数
  const handleDragStart = (event: DragEvent, chapter: Chapter, volumeId: string, index: number) => {
    if (!event.dataTransfer) return;
    draggedChapter.value = { chapter, sourceVolumeId: volumeId, sourceIndex: index };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', chapter.id);
    if (event.target instanceof HTMLElement) {
      event.target.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (event: DragEvent) => {
    draggedChapter.value = null;
    dragOverVolumeId.value = null;
    dragOverIndex.value = null;
    if (event.target instanceof HTMLElement) {
      event.target.style.opacity = '1';
    }
  };

  const handleDragOver = (event: DragEvent, volumeId: string, index?: number) => {
    event.preventDefault();
    if (!event.dataTransfer) return;
    event.dataTransfer.dropEffect = 'move';
    dragOverVolumeId.value = volumeId;
    if (index !== undefined) {
      dragOverIndex.value = index;
    }
  };

  const handleDrop = async (event: DragEvent, targetVolumeId: string, targetIndex?: number) => {
    event.preventDefault();
    if (!draggedChapter.value || !book.value) return;

    const { chapter, sourceVolumeId } = draggedChapter.value;

    const updatedVolumes = ChapterService.moveChapter(
      book.value,
      chapter.id,
      targetVolumeId,
      targetIndex,
    );

    // 更新书籍
    await booksStore.updateBook(book.value.id, {
      volumes: updatedVolumes,
      lastEdited: new Date(),
    });

    toast.add({
      severity: 'success',
      summary: '移动成功',
      detail: `已将章节 "${getChapterDisplayTitle(chapter)}" ${
        sourceVolumeId === targetVolumeId ? '重新排序' : '移动到新卷'
      }`,
      life: 3000,
    });

    // 重置拖拽状态
    draggedChapter.value = null;
    dragOverVolumeId.value = null;
    dragOverIndex.value = null;
  };

  const handleDragLeave = () => {
    // 延迟清除，避免在子元素间移动时闪烁
    setTimeout(() => {
      if (!draggedChapter.value) {
        dragOverVolumeId.value = null;
        dragOverIndex.value = null;
      }
    }, 50);
  };

  return {
    draggedChapter,
    dragOverVolumeId,
    dragOverIndex,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
    handleDragLeave,
  };
}
