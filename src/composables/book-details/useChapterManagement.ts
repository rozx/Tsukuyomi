import { ref } from 'vue';
import type { Ref } from 'vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import type { Volume, Chapter, Novel } from 'src/models/novel';
import { useBooksStore } from 'src/stores/books';
import { ChapterService } from 'src/services/chapter-service';
import { TerminologyService } from 'src/services/terminology-service';
import { CharacterSettingService } from 'src/services/character-setting-service';
import { generateShortId } from 'src/utils/id-generator';
import {
  getVolumeDisplayTitle,
  getChapterDisplayTitle,
  removeChapterOccurrencesInBackground,
} from 'src/utils';
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
    if (!book.value || !newChapterTitle.value.trim() || !selectedVolumeId.value || isAddingChapter.value) {
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
    if (!book.value || !editingVolumeId.value || !editingVolumeTitle.value.trim() || isEditingVolume.value) {
      return;
    }

    isEditingVolume.value = true;
    try {
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
    try {
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

      // 保存原始数据用于撤销
      const oldVolumes = book.value.volumes ? cloneDeep(book.value.volumes) : null;

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
        onRevert: async () => {
          if (book.value && oldVolumes) {
            // 恢复原始 volumes（包括章节位置和标题）
            await booksStore.updateBook(book.value.id, {
              volumes: oldVolumes,
              lastEdited: new Date(),
            });
          }
        },
      });

      showEditChapterDialog.value = false;
      editingChapterId.value = null;
      editingChapterTitle.value = '';
      editingChapterTranslation.value = '';
      editingChapterSourceVolumeId.value = null;
      editingChapterTargetVolumeId.value = null;
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

      // 高效移除该章节的出现记录，无需重新扫描所有章节
      removeChapterOccurrencesInBackground(
        book.value.id,
        chapterIdToDelete,
        'useChapterManagement',
      );

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
