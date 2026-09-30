import { ref, computed, watch, type Ref } from 'vue';
import { useSettingsStore } from 'src/stores/settings';
import { translateText } from 'src/i18n/translate';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useBooksStore } from 'src/stores/books';
import { ChapterService } from 'src/services/chapter-service';
import { UniqueIdGenerator } from 'src/utils/id-generator';
import { matchImportParagraphs } from 'src/services/import/import-paragraph-matching';
import type { Chapter, Novel, Paragraph } from 'src/models/novel';

export type EditMode = 'original' | 'translation' | 'preview';

export function useEditMode(
  book: Ref<Novel | undefined>,
  selectedChapterWithContent: Ref<Chapter | null>,
  selectedChapterParagraphs: Ref<Paragraph[]>,
  selectedChapterId: Ref<string | null>,
  updateSelectedChapterWithContent: (updatedVolumes: any) => void,
  saveState?: (description?: string) => void,
) {
  const toast = useToastWithHistory();
  const settings = useSettingsStore();
  const booksStore = useBooksStore();

  // 编辑模式状态
  const editMode = ref<EditMode>('translation');

  // 原始文本编辑状态
  const isEditingOriginalText = ref(false);
  const originalTextEditValue = ref('');
  const originalTextEditBackup = ref('');
  const originalTextEditChapterId = ref<string | null>(null);

  // 获取章节的原始文本内容（用于编辑）
  const chapterOriginalText = computed(() => {
    if (!selectedChapterWithContent.value || !selectedChapterWithContent.value.content) {
      return '';
    }
    return selectedChapterWithContent.value.content.map((para) => para.text).join('\n');
  });

  // 开始编辑原始文本
  const startEditingOriginalText = () => {
    if (!isEditingOriginalText.value && selectedChapterWithContent.value) {
      originalTextEditValue.value = chapterOriginalText.value;
      originalTextEditBackup.value = chapterOriginalText.value;
      originalTextEditChapterId.value = selectedChapterWithContent.value.id;
      isEditingOriginalText.value = true;
    }
  };

  // 保存原始文本编辑
  const saveOriginalTextEdit = async () => {
    if (!book.value || !selectedChapterWithContent.value) {
      return;
    }

    // 安全检查：验证正在编辑的章节与当前选中的章节一致
    if (originalTextEditChapterId.value !== selectedChapterWithContent.value.id) {
      toast.add({
        severity: 'warn',
        summary: translateText(settings.uiLocale, 'translationUi.chapterChanged'),
        detail: translateText(settings.uiLocale, 'translationUi.chapterChangedHint'),
        life: 3000,
      });
      // 重置编辑状态
      isEditingOriginalText.value = false;
      originalTextEditChapterId.value = null;
      editMode.value = 'translation';
      return;
    }

    // 保存状态用于撤销
    saveState?.(translateText(settings.uiLocale, 'translationUi.editOriginal'));

    try {
      // 将文本按换行符分割为段落（允许空段落）
      const textLines = originalTextEditValue.value.split('\n');

      // 获取现有段落以保留翻译
      const existingParagraphs = selectedChapterWithContent.value.content || [];

      // 按明确原文匹配保留身份；插入、移动和拆合不会按数组位置移植译文。
      const chapterId = selectedChapterWithContent.value.id;
      const bookId = book.value.id;
      const ids = new UniqueIdGenerator(existingParagraphs.map((paragraph) => paragraph.id));
      const matched = await matchImportParagraphs({
        scopeId: chapterId,
        old: existingParagraphs.map((paragraph) => ({ chapterId, paragraph })),
        next: textLines.map((text, index) => ({
          key: String(index),
          chapterId,
          text,
          newId: ids.generate(),
        })),
      });
      if (book.value?.id !== bookId || selectedChapterWithContent.value?.id !== chapterId) return;
      const updatedParagraphs = matched.paragraphs.map((entry) => entry.paragraph);

      // 更新章节内容（ChapterService.updateChapter 会自动更新 lastEdited 时间）
      const updatedVolumes = ChapterService.updateChapter(
        book.value,
        selectedChapterWithContent.value.id,
        {
          content: updatedParagraphs,
        },
      );

      // 先保存章节内容
      await booksStore.updateBook(book.value.id, {
        volumes: updatedVolumes,
        lastEdited: new Date(),
      });

      // 更新 selectedChapterWithContent 以反映保存的更改
      updateSelectedChapterWithContent(updatedVolumes);

      toast.add({
        severity: 'success',
        summary: translateText(settings.uiLocale, 'translationUi.saved'),
        detail: translateText(settings.uiLocale, 'translationUi.originalUpdated'),
        life: 3000,
      });

      isEditingOriginalText.value = false;
      originalTextEditChapterId.value = null;
      // 切换回翻译模式
      editMode.value = 'translation';
    } catch (error) {
      console.error('保存原始文本失败:', error);
      toast.add({
        severity: 'error',
        summary: translateText(settings.uiLocale, 'translationUi.saveFailed'),
        detail: translateText(settings.uiLocale, 'translationUi.originalSaveUnknown'),
        life: 3000,
      });
    }
  };

  // 取消原始文本编辑
  const cancelOriginalTextEdit = () => {
    originalTextEditValue.value = originalTextEditBackup.value;
    isEditingOriginalText.value = false;
    originalTextEditChapterId.value = null;
    // 切换回翻译模式
    editMode.value = 'translation';
  };

  // 编辑模式选项（只用于图标，不显示标签）
  const editModeOptions = computed(
    () =>
      [
        {
          value: 'original',
          icon: 'pi pi-pencil',
          title: translateText(settings.uiLocale, 'readerUi.originalEdit'),
        },
        {
          value: 'translation',
          icon: 'pi pi-language',
          title: translateText(settings.uiLocale, 'readerUi.translationMode'),
        },
        {
          value: 'preview',
          icon: 'pi pi-eye',
          title: translateText(settings.uiLocale, 'readerUi.previewMode'),
        },
      ] as const,
  );

  // 监听编辑模式变化
  watch(editMode, (newMode: EditMode) => {
    if (newMode === 'original') {
      startEditingOriginalText();
    } else {
      if (isEditingOriginalText.value) {
        isEditingOriginalText.value = false;
        originalTextEditChapterId.value = null;
      }
    }
  });

  // 监听章节切换：当章节改变时，如果正在编辑，则重置编辑状态
  watch(selectedChapterId, (newChapterId, oldChapterId) => {
    // 如果章节确实改变了，且正在编辑状态，则重置编辑状态
    if (oldChapterId !== null && newChapterId !== oldChapterId && isEditingOriginalText.value) {
      isEditingOriginalText.value = false;
      originalTextEditChapterId.value = null;
      // 如果当前在原始文本编辑模式，切换回翻译模式
      if (editMode.value === 'original') {
        editMode.value = 'translation';
      }
    }
  });

  return {
    editMode,
    isEditingOriginalText,
    originalTextEditValue,
    originalTextEditChapterId,
    chapterOriginalText,
    editModeOptions,
    startEditingOriginalText,
    saveOriginalTextEdit,
    cancelOriginalTextEdit,
  };
}
