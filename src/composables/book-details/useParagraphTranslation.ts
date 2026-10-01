import type { MessageKey } from 'src/i18n/types';
import { localizedErrorMessage, localizedErrorCode } from 'src/utils/localized-error';
import { translateText } from 'src/i18n/translate';
import { useSettingsStore } from 'src/stores/settings';
import { ref, type Ref } from 'vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useBooksStore } from 'src/stores/books';
import { getLanguageTranslation } from 'src/services/localization/selection';
import type { ParagraphTranslationEdit } from 'src/services/localization/paragraph-edit';
import type { AppLocale } from 'src/models/locale';
import type { Chapter, Novel, Volume } from 'src/models/novel';

export function useParagraphTranslation(
  book: Ref<Novel | undefined>,
  selectedChapterWithContent: Ref<Chapter | null>,
  saveState?: (description?: string) => void,
) {
  const toast = useToastWithHistory();
  const settings = useSettingsStore();
  const text = (key: MessageKey, values: Record<string, string | number> = {}) =>
    translateText(settings.uiLocale, key, values);
  const booksStore = useBooksStore();
  const currentlyEditingParagraphId = ref<string | null>(null);

  /** 在最新数据库正文上修改指定语言，不回存已打开的整章快照。 */
  const persistEdits = async (
    chapter: Chapter,
    language: AppLocale,
    edits: ParagraphTranslationEdit[],
  ) => {
    const bookId = book.value?.id;
    if (!bookId) return;
    try {
      const content = await booksStore.editParagraphTranslations(
        bookId,
        chapter.id,
        language,
        edits,
        language,
      );
      if (book.value?.id === bookId && selectedChapterWithContent.value?.id === chapter.id) {
        selectedChapterWithContent.value = {
          ...selectedChapterWithContent.value,
          content,
          lastEdited: new Date(),
        };
      }
      return true;
    } catch (error) {
      toast.add({
        severity: 'error',
        summary: text('translationUi.saveFailed'),
        detail:
          localizedErrorCode(error, error instanceof Error ? error.message : '') ===
          'BOOK_TARGET_LANGUAGE_CHANGED'
            ? text('translationUi.targetChanged')
            : localizedErrorMessage(
                error,
                settings.uiLocale,
                'translationUi.cannotSaveTranslation',
              ),
        life: 3000,
      });
      return false;
    }
  };

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
      // 以及所有其他元数据字段（webUrl、originalContent、指令字段等）
      selectedChapterWithContent.value = {
        ...selectedChapterWithContent.value,
        // 只更新 content 和 lastEdited，不展开整个 updatedChapter 以避免覆盖元数据
        // 如果 updatedChapter 有 content（包括 null），使用它；否则保留现有的 content
        content:
          updatedChapter.content !== undefined
            ? updatedChapter.content
            : selectedChapterWithContent.value.content,
        // 使用最新的 lastEdited 时间戳
        lastEdited: updatedChapter.lastEdited ?? selectedChapterWithContent.value.lastEdited,
      };
    }
  };

  const resolveParagraphContext = (paragraphId: string) => {
    const chapter = selectedChapterWithContent.value;
    const language = book.value?.targetLanguage ?? 'zh-CN';
    const paragraph = chapter?.content?.find((value) => value.id === paragraphId);
    return book.value && chapter && paragraph ? { chapter, language, paragraph } : undefined;
  };

  // 更新当前目标语言选用的版本。
  const updateParagraphTranslation = async (paragraphId: string, newTranslation: string) => {
    const context = resolveParagraphContext(paragraphId);
    if (!context) return false;
    const { chapter, language, paragraph } = context;
    const selected = getLanguageTranslation(paragraph, language);
    if (!selected) return false;
    saveState?.(text('translationUi.updateParagraph'));
    const saved = await persistEdits(chapter, language, [
      {
        type: 'update',
        paragraphId,
        originalText: paragraph.text,
        translationId: selected.id,
        text: newTranslation,
      },
    ]);
    if (saved) currentlyEditingParagraphId.value = null;
    return saved === true;
  };

  const selectParagraphTranslation = async (paragraphId: string, translationId: string) => {
    const context = resolveParagraphContext(paragraphId);
    if (!context) return;
    const { chapter, language, paragraph } = context;
    saveState?.(text('translationUi.selectParagraph'));
    if (
      await persistEdits(chapter, language, [
        {
          type: 'select',
          paragraphId,
          originalText: paragraph.text,
          translationId,
        },
      ])
    )
      toast.add({
        severity: 'success',
        summary: text('translationUi.translationSelected'),
        detail: text('translationUi.translationSelectedHint'),
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
