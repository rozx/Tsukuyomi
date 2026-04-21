import { ref } from 'vue';
import type { Ref } from 'vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import type { Volume, Chapter, Novel } from 'src/models/novel';
import { useBooksStore } from 'src/stores/books';
import { ChapterService } from 'src/services/chapter-service';
import { TerminologyService } from 'src/services/terminology-service';
import { CharacterSettingService } from 'src/services/character-setting-service';
import { generateShortId } from 'src/utils/id-generator';
import { getVolumeDisplayTitle, getChapterDisplayTitle } from 'src/utils';
import { cloneDeep } from 'lodash';

export function useChapterManagement(
  book: Ref<Novel | undefined>,
  saveState?: (description?: string) => void,
) {
  const booksStore = useBooksStore();
  const toast = useToastWithHistory();

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
  const editingChapterTranslationInstructions = ref('');
  const editingChapterPolishInstructions = ref('');
  const editingChapterProofreadingInstructions = ref('');
  const editingChapterWebUrl = ref('');
  const editingChapterLastUpdated = ref<Date | undefined>(undefined);
  const editingChapterLastEdited = ref<Date | undefined>(undefined);
  const editingChapterCreatedAt = ref<Date | undefined>(undefined);

  // Delete Confirm Dialog State
  const showDeleteVolumeConfirm = ref(false);
  const showDeleteChapterConfirm = ref(false);
  const deletingVolumeId = ref<string | null>(null);
  const deletingChapterId = ref<string | null>(null);
  const deletingVolumeTitle = ref('');
  const deletingChapterTitle = ref('');

  // Loading states for CRUD operations
  const isAddingVolume = ref(false);
  const isAddingChapter = ref(false);
  const isEditingVolume = ref(false);
  const isEditingChapter = ref(false);
  const isDeletingVolume = ref(false);
  const isDeletingChapter = ref(false);

  // --- Add Logic ---

  const handleAddVolume = async () => {
    if (!book.value || !newVolumeTitle.value.trim() || isAddingVolume.value) {
      return;
    }

    isAddingVolume.value = true;
    try {
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
    } finally {
      isAddingVolume.value = false;
    }
  };

  const handleAddChapter = async () => {
    if (
      !book.value ||
      !newChapterTitle.value.trim() ||
      !selectedVolumeId.value ||
      isAddingChapter.value
    ) {
      return;
    }

    isAddingChapter.value = true;
    try {
      const updatedVolumes = ChapterService.addChapter(
        book.value,
        selectedVolumeId.value,
        newChapterTitle.value,
      );

      await booksStore.updateBook(book.value.id, {
        volumes: updatedVolumes,
        lastEdited: new Date(),
      });

      // 新添加的章节没有内容，无需刷新出现次数
      // 当章节内容被编辑时，会自动更新出现次数

      toast.add({
        severity: 'success',
        summary: '添加成功',
        detail: `已添加章节 "${newChapterTitle.value.trim()}"`,
        life: 3000,
      });

      showAddChapterDialog.value = false;
      newChapterTitle.value = '';
      selectedVolumeId.value = null;
    } finally {
      isAddingChapter.value = false;
    }
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

  const extractTitleFields = (
    title: Chapter['title'] | undefined,
  ): { original: string; translation: string } => {
    if (typeof title === 'string') return { original: title, translation: '' };
    return {
      original: title?.original || '',
      translation: title?.translation?.translation || '',
    };
  };

  const primeChapterDialogInstructions = (chapter: Chapter): void => {
    editingChapterTranslationInstructions.value = chapter.translationInstructions || '';
    editingChapterPolishInstructions.value = chapter.polishInstructions || '';
    editingChapterProofreadingInstructions.value = chapter.proofreadingInstructions || '';
    editingChapterWebUrl.value = chapter.webUrl || '';
    editingChapterLastUpdated.value = chapter.lastUpdated;
    editingChapterLastEdited.value = chapter.lastEdited;
    editingChapterCreatedAt.value = chapter.createdAt;
  };

  const openEditChapterDialog = (chapter: Chapter) => {
    if (!book.value) return;

    const sourceVolumeId =
      book.value.volumes?.find((volume) => volume.chapters?.some((c) => c.id === chapter.id))
        ?.id ?? null;
    const titleFields = extractTitleFields(chapter.title);

    editingChapterId.value = chapter.id;
    editingChapterTitle.value = titleFields.original;
    editingChapterTranslation.value = titleFields.translation;
    editingChapterSourceVolumeId.value = sourceVolumeId;
    editingChapterTargetVolumeId.value = sourceVolumeId;
    primeChapterDialogInstructions(chapter);
    showEditChapterDialog.value = true;
  };

  type VolumeLike = { title?: { translation?: { id: string; aiModelId: string } } | string };

  const resolveTranslationIdentity = (
    entity: VolumeLike | null | undefined,
  ): { translationId: string; aiModelId: string } => {
    if (!entity || typeof entity.title === 'string') {
      return { translationId: generateShortId(), aiModelId: '' };
    }
    return {
      translationId: entity.title?.translation?.id || generateShortId(),
      aiModelId: entity.title?.translation?.aiModelId || '',
    };
  };

  const handleEditVolume = async () => {
    if (
      !book.value ||
      !editingVolumeId.value ||
      !editingVolumeTitle.value.trim() ||
      isEditingVolume.value
    ) {
      return;
    }

    isEditingVolume.value = true;
    try {
      const currentVolume = book.value.volumes?.find((v) => v.id === editingVolumeId.value);
      const { translationId, aiModelId } = resolveTranslationIdentity(currentVolume);

      // 保存原始数据用于撤销
      const oldVolumes = book.value.volumes ? cloneDeep(book.value.volumes) : null;

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
        onRevert: async () => {
          if (book.value && oldVolumes) {
            await booksStore.updateBook(book.value.id, {
              volumes: oldVolumes,
              lastEdited: new Date(),
            });
          }
        },
      });

      showEditVolumeDialog.value = false;
      editingVolumeId.value = null;
      editingVolumeTitle.value = '';
      editingVolumeTranslation.value = '';
    } finally {
      isEditingVolume.value = false;
    }
  };

  const findChapterInAnyVolume = (chapterId: string): Chapter | null => {
    if (!book.value) return null;
    for (const volume of book.value.volumes || []) {
      const chapter = volume.chapters?.find((c) => c.id === chapterId);
      if (chapter) return chapter;
    }
    return null;
  };

  const buildChapterUpdatePayload = (
    translationId: string,
    aiModelId: string,
  ): Parameters<typeof ChapterService.updateChapter>[2] => ({
    title: {
      original: editingChapterTitle.value.trim(),
      translation: {
        id: translationId,
        translation: editingChapterTranslation.value.trim(),
        aiModelId: aiModelId,
      },
    },
    translationInstructions: editingChapterTranslationInstructions.value.trim() || undefined,
    polishInstructions: editingChapterPolishInstructions.value.trim() || undefined,
    proofreadingInstructions: editingChapterProofreadingInstructions.value.trim() || undefined,
    webUrl: editingChapterWebUrl.value.trim() || undefined,
  });

  const resetChapterEditDialog = (): void => {
    showEditChapterDialog.value = false;
    editingChapterId.value = null;
    editingChapterTitle.value = '';
    editingChapterTranslation.value = '';
    editingChapterSourceVolumeId.value = null;
    editingChapterTargetVolumeId.value = null;
    editingChapterTranslationInstructions.value = '';
    editingChapterPolishInstructions.value = '';
    editingChapterProofreadingInstructions.value = '';
    editingChapterWebUrl.value = '';
    editingChapterLastUpdated.value = undefined;
    editingChapterLastEdited.value = undefined;
    editingChapterCreatedAt.value = undefined;
  };

  const showChapterEditToast = (
    oldVolumes: Volume[] | null,
    bookValue: NonNullable<typeof book.value>,
  ): void => {
    const moved =
      editingChapterSourceVolumeId.value !== editingChapterTargetVolumeId.value;
    toast.add({
      severity: 'success',
      summary: '更新成功',
      detail: `已更新章节标题${moved ? '并移动到新卷' : ''}`,
      life: 3000,
      onRevert: async () => {
        if (oldVolumes) {
          await booksStore.updateBook(bookValue.id, {
            volumes: oldVolumes,
            lastEdited: new Date(),
          });
        }
      },
    });
  };

  const handleEditChapter = async () => {
    if (
      !book.value ||
      !editingChapterId.value ||
      !editingChapterTitle.value.trim() ||
      !editingChapterTargetVolumeId.value ||
      isEditingChapter.value
    ) {
      return;
    }

    isEditingChapter.value = true;
    const bookValue = book.value;
    try {
      const currentChapter = findChapterInAnyVolume(editingChapterId.value);
      const { translationId, aiModelId } = resolveTranslationIdentity(currentChapter);
      const oldVolumes = bookValue.volumes ? cloneDeep(bookValue.volumes) : null;

      const updatedVolumes = ChapterService.updateChapter(
        bookValue,
        editingChapterId.value,
        buildChapterUpdatePayload(translationId, aiModelId),
        editingChapterTargetVolumeId.value,
      );
      await booksStore.updateBook(bookValue.id, {
        volumes: updatedVolumes,
        lastEdited: new Date(),
      });
      showChapterEditToast(oldVolumes, bookValue);
      resetChapterEditDialog();
    } finally {
      isEditingChapter.value = false;
    }
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
    if (!book.value || !deletingVolumeId.value || isDeletingVolume.value) {
      return;
    }

    isDeletingVolume.value = true;
    try {
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
    } finally {
      isDeletingVolume.value = false;
    }
  };

  const handleDeleteChapter = async () => {
    if (!book.value || !deletingChapterId.value || isDeletingChapter.value) {
      return;
    }

    isDeletingChapter.value = true;
    try {
      const chapterIdToDelete = deletingChapterId.value;
      const updatedVolumes = ChapterService.deleteChapter(book.value, chapterIdToDelete);

      await booksStore.updateBook(book.value.id, {
        volumes: updatedVolumes,
        lastEdited: new Date(),
      });

      toast.add({
        severity: 'success',
        summary: '删除成功',
        detail: `已删除章节 "${deletingChapterTitle.value}"`,
        life: 3000,
      });

      showDeleteChapterConfirm.value = false;
      deletingChapterId.value = null;
      deletingChapterTitle.value = '';
    } finally {
      isDeletingChapter.value = false;
    }
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
    editingChapterTranslationInstructions,
    editingChapterPolishInstructions,
    editingChapterProofreadingInstructions,
    editingChapterWebUrl,
    editingChapterLastUpdated,
    editingChapterLastEdited,
    editingChapterCreatedAt,
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
    // Loading states
    isAddingVolume,
    isAddingChapter,
    isEditingVolume,
    isEditingChapter,
    isDeletingVolume,
    isDeletingChapter,
  };
}
