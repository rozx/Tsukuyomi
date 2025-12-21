import { ref, type Ref } from 'vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useBooksStore } from 'src/stores/books';
import { ChapterService } from 'src/services/chapter-service';
import type { Chapter, Novel, Volume } from 'src/models/novel';

export function useParagraphTranslation(
  book: Ref<Novel | undefined>,
  selectedChapterWithContent: Ref<Chapter | null>,
  saveState?: (description?: string) => void,
) {
  const toast = useToastWithHistory();
  const booksStore = useBooksStore();
  const currentlyEditingParagraphId = ref<string | null>(null);

  /**
   * 更新 selectedChapterWithContent 以反映保存的更改
   * @param updatedVolumes 更新后的卷数组
   */
  const updateSelectedChapterWithContent = (updatedVolumes: Volume[] | undefined) => {
    if (!updatedVolumes || !selectedChapterWithContent.value) return;

    const updatedChapter = updatedVolumes
      .flatMap((v) => v.chapters || [])
      .find((c) => c.id === selectedChapterWithContent.value?.id);

    if (updatedChapter && updatedChapter.content !== undefined) {
      // 更新 selectedChapterWithContent，保留现有的 title 和 content（避免覆盖并发更新的标题）
      // 注意：只更新 content 和 lastEdited，保留现有的 title（可能已被 updateTitleTranslation 更新）
      selectedChapterWithContent.value = {
        ...selectedChapterWithContent.value,
        ...updatedChapter,
        // 保留现有的 title（可能已被 updateTitleTranslation 更新）
        title: selectedChapterWithContent.value.title,
        // 如果 updatedChapter 有 content，使用它；否则保留现有的 content
        content: updatedChapter.content ?? selectedChapterWithContent.value.content,
        // 使用最新的 lastEdited 时间戳
        lastEdited: updatedChapter.lastEdited ?? selectedChapterWithContent.value.lastEdited,
      };
    }
  };

  // 更新段落翻译
  const updateParagraphTranslation = async (paragraphId: string, newTranslation: string) => {
    const chapter = selectedChapterWithContent.value;
    if (!book.value || !chapter || !chapter.content) return;

    // 清除编辑状态
    if (currentlyEditingParagraphId.value === paragraphId) {
      currentlyEditingParagraphId.value = null;
    }

    // 保存状态用于撤销
    saveState?.('更新段落翻译');

    // 查找段落
    const paragraph = chapter.content.find((p) => p.id === paragraphId);
    if (!paragraph || !paragraph.selectedTranslationId || !paragraph.translations) return;

    // 更新章节内容中的翻译
    const updatedContent = chapter.content.map((para) => {
      if (para.id === paragraphId) {
        return {
          ...para,
          translations: para.translations?.map((t) =>
            t.id === paragraph.selectedTranslationId ? { ...t, translation: newTranslation } : t,
          ),
        };
      }
      return para;
    });

    // 优化：直接保存章节内容到 IndexedDB，避免通过 updateBook 保存整个书籍
    // 这样可以避免遍历所有章节来保留内容
    const updatedChapter = {
      ...chapter,
      content: updatedContent,
      lastEdited: new Date(),
    };
    await ChapterService.saveChapterContent(updatedChapter);

    // 立即更新 UI，避免等待 updateBook 完成
    selectedChapterWithContent.value = updatedChapter;

    // 使用 ChapterService.updateChapter 更新章节的 lastEdited 时间
    // 注意：这里传入的 content 是完整的数组，所以 updateBook 会跳过内容保留逻辑
    // 同时传入 title 以确保使用最新的标题（可能已被 AI 翻译更新）
    const updatedVolumes = ChapterService.updateChapter(book.value, chapter.id, {
      title: chapter.title,
      content: updatedContent,
      lastEdited: new Date(),
    });

    // 保存书籍（由于 updatedContent 是完整数组，updateBook 会跳过内容保留逻辑）
    await booksStore.updateBook(book.value.id, {
      volumes: updatedVolumes,
      lastEdited: new Date(),
    });
  };

  // 选择段落翻译
  const selectParagraphTranslation = async (paragraphId: string, translationId: string) => {
    const chapter = selectedChapterWithContent.value;
    if (!book.value || !chapter || !chapter.content) return;

    // 查找段落
    const paragraph = chapter.content.find((p) => p.id === paragraphId);
    if (!paragraph) return;

    // 验证翻译ID是否存在
    const translation = paragraph.translations?.find((t) => t.id === translationId);
    if (!translation) {
      toast.add({
        severity: 'error',
        summary: '选择失败',
        detail: '未找到指定的翻译版本',
        life: 3000,
      });
      return;
    }

    // 更新章节内容中的选中翻译ID
    if (!chapter.content) return;

    const updatedContent = chapter.content.map((para) => {
      if (para.id !== paragraphId) return para;
      return {
        ...para,
        selectedTranslationId: translationId,
      };
    });

    // 优化：直接保存章节内容到 IndexedDB
    const updatedChapter = {
      ...chapter,
      content: updatedContent,
      lastEdited: new Date(),
    };
    await ChapterService.saveChapterContent(updatedChapter);

    // 立即更新 UI，避免等待 updateBook 完成
    selectedChapterWithContent.value = updatedChapter;

    // 使用 ChapterService.updateChapter 确保更新章节的 lastEdited 时间
    // 注意：这里传入的 content 是完整的数组，所以 updateBook 会跳过内容保留逻辑
    // 同时传入 title 以确保使用最新的标题（可能已被 AI 翻译更新）
    const updatedVolumes = ChapterService.updateChapter(book.value, chapter.id, {
      title: chapter.title,
      content: updatedContent,
      lastEdited: new Date(),
    });

    // 保存书籍（由于 updatedContent 是完整数组，updateBook 会跳过内容保留逻辑）
    await booksStore.updateBook(book.value.id, {
      volumes: updatedVolumes,
      lastEdited: new Date(),
    });

    toast.add({
      severity: 'success',
      summary: '已切换翻译',
      detail: '已切换到选中的翻译版本',
      life: 2000,
    });
  };

  return {
    currentlyEditingParagraphId,
    updateParagraphTranslation,
    selectParagraphTranslation,
    updateSelectedChapterWithContent,
  };
}
