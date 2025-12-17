import { ref, computed, watch, type Ref } from 'vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useBooksStore } from 'src/stores/books';
import { ChapterService } from 'src/services/chapter-service';
import { generateShortId } from 'src/utils/id-generator';
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
        summary: '章节已切换',
        detail: '检测到章节已切换，请重新编辑当前章节',
        life: 3000,
      });
      // 重置编辑状态
      isEditingOriginalText.value = false;
      originalTextEditChapterId.value = null;
      editMode.value = 'translation';
      return;
    }

    // 保存状态用于撤销
    saveState?.('编辑原始文本');

    try {
      // 将文本按换行符分割为段落（允许空段落）
      const textLines = originalTextEditValue.value.split('\n');

      // 获取现有段落以保留翻译
      const existingParagraphs = selectedChapterWithContent.value.content || [];

      // 更新段落文本，如果文本改变则清除翻译
      const updatedParagraphs: Paragraph[] = textLines.map((line, index) => {
        const existingParagraph = existingParagraphs[index];
        if (existingParagraph) {
          // 检查文本是否改变
          const textChanged = existingParagraph.text !== line;
          if (textChanged) {
            // 文本改变，清除翻译
            return {
              ...existingParagraph,
              text: line,
              selectedTranslationId: '',
              translations: [],
            };
          } else {
            // 文本未改变，保留翻译
            return {
              ...existingParagraph,
              text: line,
            };
          }
        } else {
          // 创建新段落
          return {
            id: generateShortId(),
            text: line,
            selectedTranslationId: '',
            translations: [],
          };
        }
      });

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
        summary: '保存成功',
        detail: '已更新原始文本',
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
        summary: '保存失败',
        detail: '保存原始文本时发生错误',
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
  const editModeOptions = [
    { value: 'original', icon: 'pi pi-pencil', title: '原文编辑' },
    { value: 'translation', icon: 'pi pi-language', title: '翻译模式' },
    { value: 'preview', icon: 'pi pi-eye', title: '译文预览' },
  ] as const;

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
