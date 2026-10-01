import { ref } from 'vue';
import type { Ref } from 'vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useBooksStore } from 'src/stores/books';
import { ChapterService } from 'src/services/chapter-service';
import { getChapterDisplayTitle } from 'src/utils';
import type { Chapter, Novel } from 'src/models/novel';
import { useSettingsStore } from 'src/stores/settings';
import { translateText } from 'src/i18n/translate';
import type { MessageKey } from 'src/i18n/types';

export function useChapterDragDrop(
  book: Ref<Novel | undefined>,
  saveState?: (description?: string) => void,
) {
  const toast = useToastWithHistory();
  const booksStore = useBooksStore();
  const settings = useSettingsStore();
  const text = (key: MessageKey, values?: Record<string, string | number>) =>
    translateText(settings.uiLocale, key, values);

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

    // 保存状态用于撤销
    saveState?.(text('bookUi.details.moveChapterState'));

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
      summary: text('bookUi.details.moved'),
      detail: text(
        sourceVolumeId === targetVolumeId
          ? 'bookUi.details.chapterReordered'
          : 'bookUi.details.chapterMovedVolume',
        { title: getChapterDisplayTitle(chapter, book.value) },
      ),
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
