import { ref } from 'vue';
import type { Ref } from 'vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import type { Volume, Chapter, Novel } from 'src/models/novel';
import { useBooksStore } from 'src/stores/books';
import { ChapterService } from 'src/services/chapter-service';
import { TerminologyService } from 'src/services/terminology-service';
import { CharacterSettingService } from 'src/services/character-setting-service';
import { getNameTranslation } from 'src/services/localization/selection';
import { normalizeNameTranslations } from 'src/services/localization/normalize';
import { titleOriginal } from 'src/services/localization/title-edit';
import type { TitleEdit } from 'src/services/localization/title-edit';
import type { AppLocale } from 'src/models/locale';
import type { MessageKey } from 'src/i18n/types';
import { translateText } from 'src/i18n/translate';
import { useSettingsStore } from 'src/stores/settings';
import { getVolumeDisplayTitle, getChapterDisplayTitle } from 'src/utils';
import { cloneDeep } from 'lodash';

export function useChapterManagement(
  book: Ref<Novel | undefined>,
  saveState?: (description?: string) => void,
) {
  const booksStore = useBooksStore();
  const toast = useToastWithHistory();
  const settings = useSettingsStore();
  const text = (key: MessageKey, values: Record<string, string | number> = {}) =>
    translateText(settings.uiLocale, key, values);

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
  const volumeLanguage = ref<AppLocale>('zh-CN');
  const chapterLanguage = ref<AppLocale>('zh-CN');
  const volumeOriginal = ref('');
  const chapterOriginal = ref('');
  let chapterBefore: Chapter | null = null;
  const checkLanguage = (language: AppLocale) => {
    if (language === (book.value?.targetLanguage ?? 'zh-CN')) return true;
    toast.add({
      severity: 'warn',
      summary: translateText(settings.uiLocale, 'books.targetChanged'),
      detail: translateText(settings.uiLocale, 'books.reopenEditor'),
      life: 3000,
    });
    return false;
  };
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
        summary: text('readerUi.added'),
        detail: text('readerUi.addedVolume', { name: newVolumeTitle.value.trim() }),
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
        summary: text('readerUi.added'),
        detail: text('readerUi.addedChapter', { name: newChapterTitle.value.trim() }),
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
        summary: text('readerUi.cannotAddChapter'),
        detail: text('readerUi.addVolumeFirst'),
        life: 3000,
      });
      return;
    }
    showAddChapterDialog.value = true;
  };

  // --- Edit Logic ---

  const openEditVolumeDialog = (volume: Volume) => {
    editingVolumeId.value = volume.id;
    volumeLanguage.value = book.value?.targetLanguage ?? 'zh-CN';
    volumeOriginal.value = titleOriginal(volume.title);
    // Compatibility with old data format
    if (typeof volume.title === 'string') {
      editingVolumeTitle.value = volume.title;
      editingVolumeTranslation.value = '';
    } else {
      editingVolumeTitle.value = volume.title?.original || '';
      editingVolumeTranslation.value =
        getNameTranslation(volume.title, volumeLanguage.value)?.translation || '';
    }
    showEditVolumeDialog.value = true;
  };

  const extractTitleFields = (
    title: Chapter['title'] | undefined,
  ): { original: string; translation: string } => {
    if (typeof title === 'string') return { original: title, translation: '' };
    return {
      original: title?.original || '',
      translation: title ? getNameTranslation(title, chapterLanguage.value)?.translation || '' : '',
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
      book.value.volumes?.find((volume) => volume.chapters?.some((c) => c.id === chapter.id))?.id ??
      null;
    chapterLanguage.value = book.value.targetLanguage ?? 'zh-CN';
    chapterOriginal.value = titleOriginal(chapter.title);
    chapterBefore = cloneDeep(chapter);
    const titleFields = extractTitleFields(chapter.title);

    editingChapterId.value = chapter.id;
    editingChapterTitle.value = titleFields.original;
    editingChapterTranslation.value = titleFields.translation;
    editingChapterSourceVolumeId.value = sourceVolumeId;
    editingChapterTargetVolumeId.value = sourceVolumeId;
    primeChapterDialogInstructions(chapter);
    showEditChapterDialog.value = true;
  };

  const revertTitle = async (
    bookId: string,
    language: AppLocale,
    edit: TitleEdit,
    before: Chapter['title'],
  ) => {
    const owner = normalizeNameTranslations(
      typeof before === 'string'
        ? { original: before, translation: { id: '', translation: '', aiModelId: '' } }
        : before,
      0,
    );
    const original = titleOriginal(before);
    const restore: TitleEdit = {
      ...edit,
      expectedOriginal: edit.original ?? edit.expectedOriginal,
    };
    if (original !== restore.expectedOriginal) {
      restore.original = original;
      restore.restoreTranslations = owner.translationsByLanguage!;
      delete restore.translation;
    } else restore.translation = getNameTranslation(owner, language)?.translation ?? '';
    await booksStore.editTitle(bookId, language, restore);
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
      if (!currentVolume || !checkLanguage(volumeLanguage.value)) return;
      const bookId = book.value.id;
      const language = volumeLanguage.value;
      const before = cloneDeep(currentVolume.title);
      const edit: TitleEdit = {
        kind: 'volume',
        id: currentVolume.id,
        expectedOriginal: volumeOriginal.value,
        original: editingVolumeTitle.value.trim(),
        translation: editingVolumeTranslation.value.trim(),
      };
      await booksStore.editTitle(bookId, language, edit, language);
      toast.add({
        severity: 'success',
        summary: text('readerUi.updated'),
        detail: text('readerUi.volumeUpdated'),
        life: 3000,
        onRevert: () => revertTitle(bookId, language, edit, before),
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

  const buildChapterUpdatePayload = (): TitleEdit['updates'] => {
    const updates: NonNullable<TitleEdit['updates']> = {};
    const fields = {
      translationInstructions: editingChapterTranslationInstructions.value.trim(),
      polishInstructions: editingChapterPolishInstructions.value.trim(),
      proofreadingInstructions: editingChapterProofreadingInstructions.value.trim(),
      webUrl: editingChapterWebUrl.value.trim(),
    };
    for (const key of Object.keys(fields) as Array<keyof typeof fields>) {
      if (fields[key] !== (chapterBefore?.[key] ?? '')) updates[key] = fields[key] || undefined;
    }
    return updates;
  };

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
      if (!currentChapter || !checkLanguage(chapterLanguage.value)) return;
      const language = chapterLanguage.value;
      const before = cloneDeep(currentChapter);
      const previousVolumeId = bookValue.volumes?.find((volume) =>
        volume.chapters?.some((chapter) => chapter.id === currentChapter.id),
      )?.id;
      const updates = buildChapterUpdatePayload();
      const moved = editingChapterSourceVolumeId.value !== editingChapterTargetVolumeId.value;
      const edit: TitleEdit = {
        kind: 'chapter',
        id: currentChapter.id,
        expectedOriginal: chapterOriginal.value,
        original: editingChapterTitle.value.trim(),
        translation: editingChapterTranslation.value.trim(),
        ...(updates ? { updates } : {}),
        ...(moved ? { targetVolumeId: editingChapterTargetVolumeId.value } : {}),
      };
      await booksStore.editTitle(bookValue.id, language, edit, language);
      const revertUpdates: NonNullable<TitleEdit['updates']> = {};
      for (const key of Object.keys(updates ?? {}) as Array<
        keyof NonNullable<TitleEdit['updates']>
      >)
        revertUpdates[key] = before[key];
      toast.add({
        severity: 'success',
        summary: text('readerUi.updated'),
        detail: text(moved ? 'readerUi.chapterMoved' : 'readerUi.chapterUpdated'),
        life: 3000,
        onRevert: () =>
          revertTitle(
            bookValue.id,
            language,
            {
              ...edit,
              updates: revertUpdates,
              ...(moved && previousVolumeId ? { targetVolumeId: previousVolumeId } : {}),
            },
            before.title,
          ),
      });
      resetChapterEditDialog();
    } finally {
      isEditingChapter.value = false;
    }
  };

  // --- Delete Logic ---

  const openDeleteVolumeConfirm = (volume: Volume) => {
    deletingVolumeId.value = volume.id;
    deletingVolumeTitle.value = getVolumeDisplayTitle(volume, book.value);
    showDeleteVolumeConfirm.value = true;
  };

  const openDeleteChapterConfirm = (chapter: Chapter) => {
    deletingChapterId.value = chapter.id;
    deletingChapterTitle.value = getChapterDisplayTitle(chapter, book.value);
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
        summary: text('readerUi.deleted'),
        detail: text('readerUi.deletedVolume', { name: deletingVolumeTitle.value }),
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
        summary: text('readerUi.deleted'),
        detail: text('readerUi.deletedChapter', { name: deletingChapterTitle.value }),
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
