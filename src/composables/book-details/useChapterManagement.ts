import { ref } from 'vue';
import type { Ref } from 'vue';
import { useToast } from 'primevue/usetoast';
import type { Volume, Chapter, Novel } from 'src/types/novel';
import { useBooksStore } from 'src/stores/books';
import { ChapterService } from 'src/services/chapter-service';
import { TerminologyService } from 'src/services/terminology-service';
import { CharacterSettingService } from 'src/services/character-setting-service';
import { generateShortId } from 'src/utils/id-generator';
import { getVolumeDisplayTitle, getChapterDisplayTitle } from 'src/utils';

export function useChapterManagement(book: Ref<Novel | undefined>) {
  const booksStore = useBooksStore();
  const toast = useToast();

  // Add Volume/Chapter Dialog State
  const showAddVolumeDialog = ref(false);
  const showAddChapterDialog = ref(false);
  const newVolumeTitle = ref('');
  const newChapterTitle = ref('');
  const selectedVolumeId = ref<string | null>(null);

  // Edit Volume/Chapter Dialog State
  const showEditVolumeDialog = ref(false);
  const showEditChapterDialog = ref(false);
  const editingVolumeId = ref<string | null>(null);
  const editingChapterId = ref<string | null>(null);
  const editingVolumeTitle = ref('');
  const editingVolumeTranslation = ref('');
  const editingChapterTitle = ref('');
  const editingChapterTranslation = ref('');
  const editingChapterSourceVolumeId = ref<string | null>(null);
  const editingChapterTargetVolumeId = ref<string | null>(null);

  // Delete Confirm Dialog State
  const showDeleteVolumeConfirm = ref(false);
  const showDeleteChapterConfirm = ref(false);
  const deletingVolumeId = ref<string | null>(null);
  const deletingChapterId = ref<string | null>(null);
  const deletingVolumeTitle = ref('');
  const deletingChapterTitle = ref('');

  // --- Add Logic ---

  const handleAddVolume = async () => {
    if (!book.value || !newVolumeTitle.value.trim()) {
      return;
    }

    const updatedVolumes = ChapterService.addVolume(book.value, newVolumeTitle.value);
    await booksStore.updateBook(book.value.id, {
      volumes: updatedVolumes,
      lastEdited: new Date(),
    });

    toast.add({
      severity: 'success',
      summary: '添加成功',
      detail: `已添加卷 "${newVolumeTitle.value.trim()}"`,
      life: 3000,
    });

    showAddVolumeDialog.value = false;
    newVolumeTitle.value = '';
  };

  const handleAddChapter = async () => {
    if (!book.value || !newChapterTitle.value.trim() || !selectedVolumeId.value) {
      return;
    }

    const updatedVolumes = ChapterService.addChapter(
      book.value,
      selectedVolumeId.value,
      newChapterTitle.value,
    );

    await booksStore.updateBook(book.value.id, {
      volumes: updatedVolumes,
      lastEdited: new Date(),
    });

    // Refresh occurrences
    await TerminologyService.refreshAllTermOccurrences(book.value.id);
    await CharacterSettingService.refreshAllCharacterOccurrences(book.value.id);

    toast.add({
      severity: 'success',
      summary: '添加成功',
      detail: `已添加章节 "${newChapterTitle.value.trim()}"`,
      life: 3000,
    });

    showAddChapterDialog.value = false;
    newChapterTitle.value = '';
    selectedVolumeId.value = null;
  };

  const openAddChapterDialog = () => {
    if (!book.value || !book.value.volumes || book.value.volumes.length === 0) {
      toast.add({
        severity: 'warn',
        summary: '无法添加章节',
        detail: '请先添加至少一个卷',
        life: 3000,
      });
      return;
    }
    showAddChapterDialog.value = true;
  };

  // --- Edit Logic ---

  const openEditVolumeDialog = (volume: Volume) => {
    editingVolumeId.value = volume.id;
    // Compatibility with old data format
    if (typeof volume.title === 'string') {
      editingVolumeTitle.value = volume.title;
      editingVolumeTranslation.value = '';
    } else {
      editingVolumeTitle.value = volume.title?.original || '';
      editingVolumeTranslation.value = volume.title?.translation?.translation || '';
    }
    showEditVolumeDialog.value = true;
  };

  const openEditChapterDialog = (chapter: Chapter) => {
    if (!book.value) return;

    // Find source volume
    const sourceVolume = book.value.volumes?.find((volume) =>
      volume.chapters?.some((c) => c.id === chapter.id),
    );

    editingChapterId.value = chapter.id;
    // Compatibility with old data format
    if (typeof chapter.title === 'string') {
      editingChapterTitle.value = chapter.title;
      editingChapterTranslation.value = '';
    } else {
      editingChapterTitle.value = chapter.title?.original || '';
      editingChapterTranslation.value = chapter.title?.translation?.translation || '';
    }
    editingChapterSourceVolumeId.value = sourceVolume?.id || null;
    editingChapterTargetVolumeId.value = sourceVolume?.id || null;
    showEditChapterDialog.value = true;
  };

  const handleEditVolume = async () => {
    if (!book.value || !editingVolumeId.value || !editingVolumeTitle.value.trim()) {
      return;
    }

    const currentVolume = book.value.volumes?.find((v) => v.id === editingVolumeId.value);

    let translationId = '';
    let aiModelId = '';

    if (currentVolume) {
      if (typeof currentVolume.title === 'string') {
        translationId = generateShortId();
      } else {
        translationId = currentVolume.title.translation?.id || generateShortId();
        aiModelId = currentVolume.title.translation?.aiModelId || '';
      }
    } else {
      translationId = generateShortId();
    }

    const updatedVolumes = ChapterService.updateVolume(book.value, editingVolumeId.value, {
      title: {
        original: editingVolumeTitle.value.trim(),
        translation: {
          id: translationId,
          translation: editingVolumeTranslation.value.trim(),
          aiModelId: aiModelId,
        },
      },
    });

    await booksStore.updateBook(book.value.id, {
      volumes: updatedVolumes,
      lastEdited: new Date(),
    });

    toast.add({
      severity: 'success',
      summary: '更新成功',
      detail: `已更新卷标题`,
      life: 3000,
    });

    showEditVolumeDialog.value = false;
    editingVolumeId.value = null;
    editingVolumeTitle.value = '';
    editingVolumeTranslation.value = '';
  };

  const handleEditChapter = async () => {
    if (
      !book.value ||
      !editingChapterId.value ||
      !editingChapterTitle.value.trim() ||
      !editingChapterTargetVolumeId.value
    ) {
      return;
    }

    let currentChapter: Chapter | null = null;
    for (const volume of book.value.volumes || []) {
      const chapter = volume.chapters?.find((c) => c.id === editingChapterId.value);
      if (chapter) {
        currentChapter = chapter;
        break;
      }
    }

    let translationId = '';
    let aiModelId = '';

    if (currentChapter) {
      if (typeof currentChapter.title === 'string') {
        translationId = generateShortId();
      } else {
        translationId = currentChapter.title.translation?.id || generateShortId();
        aiModelId = currentChapter.title.translation?.aiModelId || '';
      }
    } else {
      translationId = generateShortId();
    }

    const updatedVolumes = ChapterService.updateChapter(
      book.value,
      editingChapterId.value,
      {
        title: {
          original: editingChapterTitle.value.trim(),
          translation: {
            id: translationId,
            translation: editingChapterTranslation.value.trim(),
            aiModelId: aiModelId,
          },
        },
      },
      editingChapterTargetVolumeId.value,
    );

    await booksStore.updateBook(book.value.id, {
      volumes: updatedVolumes,
      lastEdited: new Date(),
    });

    const moveMessage =
      editingChapterSourceVolumeId.value !== editingChapterTargetVolumeId.value
        ? '并移动到新卷'
        : '';

    toast.add({
      severity: 'success',
      summary: '更新成功',
      detail: `已更新章节标题${moveMessage}`,
      life: 3000,
    });

    showEditChapterDialog.value = false;
    editingChapterId.value = null;
    editingChapterTitle.value = '';
    editingChapterTranslation.value = '';
    editingChapterSourceVolumeId.value = null;
    editingChapterTargetVolumeId.value = null;
  };

  // --- Delete Logic ---

  const openDeleteVolumeConfirm = (volume: Volume) => {
    deletingVolumeId.value = volume.id;
    deletingVolumeTitle.value = getVolumeDisplayTitle(volume);
    showDeleteVolumeConfirm.value = true;
  };

  const openDeleteChapterConfirm = (chapter: Chapter) => {
    deletingChapterId.value = chapter.id;
    deletingChapterTitle.value = getChapterDisplayTitle(chapter);
    showDeleteChapterConfirm.value = true;
  };

  const handleDeleteVolume = async () => {
    if (!book.value || !deletingVolumeId.value) {
      return;
    }

    const updatedVolumes = ChapterService.deleteVolume(book.value, deletingVolumeId.value);

    await booksStore.updateBook(book.value.id, {
      volumes: updatedVolumes,
      lastEdited: new Date(),
    });

    toast.add({
      severity: 'success',
      summary: '删除成功',
      detail: `已删除卷 "${deletingVolumeTitle.value}"`,
      life: 3000,
    });

    showDeleteVolumeConfirm.value = false;
    deletingVolumeId.value = null;
    deletingVolumeTitle.value = '';
  };

  const handleDeleteChapter = async () => {
    if (!book.value || !deletingChapterId.value) {
      return;
    }

    const updatedVolumes = ChapterService.deleteChapter(book.value, deletingChapterId.value);

    await booksStore.updateBook(book.value.id, {
      volumes: updatedVolumes,
      lastEdited: new Date(),
    });

    // Refresh occurrences
    await TerminologyService.refreshAllTermOccurrences(book.value.id);
    await CharacterSettingService.refreshAllCharacterOccurrences(book.value.id);

    toast.add({
      severity: 'success',
      summary: '删除成功',
      detail: `已删除章节 "${deletingChapterTitle.value}"`,
      life: 3000,
    });

    showDeleteChapterConfirm.value = false;
    deletingChapterId.value = null;
    deletingChapterTitle.value = '';
  };

  return {
    // Add
    showAddVolumeDialog,
    showAddChapterDialog,
    newVolumeTitle,
    newChapterTitle,
    selectedVolumeId,
    handleAddVolume,
    handleAddChapter,
    openAddChapterDialog,

    // Edit
    showEditVolumeDialog,
    showEditChapterDialog,
    editingVolumeId,
    editingChapterId,
    editingVolumeTitle,
    editingVolumeTranslation,
    editingChapterTitle,
    editingChapterTranslation,
    editingChapterSourceVolumeId,
    editingChapterTargetVolumeId,
    openEditVolumeDialog,
    openEditChapterDialog,
    handleEditVolume,
    handleEditChapter,

    // Delete
    showDeleteVolumeConfirm,
    showDeleteChapterConfirm,
    deletingVolumeId,
    deletingChapterId,
    deletingVolumeTitle,
    deletingChapterTitle,
    openDeleteVolumeConfirm,
    openDeleteChapterConfirm,
    handleDeleteVolume,
    handleDeleteChapter,
  };
}
