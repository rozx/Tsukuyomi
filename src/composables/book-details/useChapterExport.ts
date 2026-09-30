import type { MessageKey } from 'src/i18n/types';
import { localizedErrorMessage } from 'src/utils/localized-error';
import { translateText } from 'src/i18n/translate';
import { useSettingsStore } from 'src/stores/settings';
import { ref, computed } from 'vue';
import type { Ref } from 'vue';
import type { MenuItem } from 'primevue/menuitem';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import type { Chapter, Novel } from 'src/models/novel';
import { ChapterService } from 'src/services/chapter-service';
import type TieredMenu from 'primevue/tieredmenu';

export function useChapterExport(
  selectedChapter: Ref<Chapter | null>,
  selectedChapterParagraphs: Ref<Array<{ id: string }>>,
  book?: Ref<Novel | undefined>,
) {
  const toast = useToastWithHistory();
  const settings = useSettingsStore();
  const text = (key: MessageKey, values: Record<string, string | number> = {}) =>
    translateText(settings.uiLocale, key, values);

  // 导出菜单状态
  const exportMenuRef = ref<InstanceType<typeof TieredMenu> | null>(null);

  // 切换导出菜单
  const toggleExportMenu = (event: Event) => {
    exportMenuRef.value?.toggle(event);
  };

  // 导出章节内容
  const exportChapter = async (
    type: 'original' | 'translation' | 'bilingual',
    format: 'txt' | 'json' | 'clipboard',
  ) => {
    if (!selectedChapter.value || !selectedChapterParagraphs.value.length) return;

    try {
      // 避免把 `undefined` 作为第 4 个参数显式传入，保持调用签名更干净（也便于测试 mock）
      const currentBook = book?.value;
      if (currentBook) {
        await ChapterService.exportChapter(selectedChapter.value, type, format, currentBook);
      } else {
        await ChapterService.exportChapter(selectedChapter.value, type, format);
      }

      // 显示成功消息
      if (format === 'clipboard') {
        toast.add({ severity: 'success', summary: text('translationUi.copied'), life: 3000 });
      } else {
        toast.add({
          severity: 'success',
          summary: text('translationUi.exported'),
          detail: text('translationUi.exportFormat', { format: format.toUpperCase() }),
          life: 3000,
        });
      }
    } catch (err) {
      console.error('Export failed:', err);
      toast.add({
        severity: 'error',
        summary:
          format === 'clipboard'
            ? text('translationUi.copyFailed')
            : text('translationUi.exportFailed'),
        detail: localizedErrorMessage(err, settings.uiLocale, 'translationUi.retryPermissions'),
        life: 3000,
      });
    }
  };

  // 复制所有已翻译文本到剪贴板
  const copyAllTranslatedText = async () => {
    if (!selectedChapter.value || !selectedChapterParagraphs.value.length) {
      toast.add({
        severity: 'warn',
        summary: text('translationUi.cannotCopy'),
        detail: text('translationUi.noChapterContent'),
        life: 3000,
      });
      return;
    }

    try {
      const currentBook = book?.value;
      if (currentBook) {
        await ChapterService.exportChapter(
          selectedChapter.value,
          'translation',
          'clipboard',
          currentBook,
        );
      } else {
        await ChapterService.exportChapter(selectedChapter.value, 'translation', 'clipboard');
      }
      toast.add({
        severity: 'success',
        summary: text('translationUi.copied'),
        detail: text('translationUi.copiedTranslations'),
        life: 3000,
      });
    } catch (err) {
      console.error('Copy failed:', err);
      toast.add({
        severity: 'error',
        summary: text('translationUi.copyFailed'),
        detail: localizedErrorMessage(err, settings.uiLocale, 'translationUi.retryPermissions'),
        life: 3000,
      });
    }
  };

  // 导出菜单项
  const exportMenuItems = computed<MenuItem[]>(() => [
    {
      label: text('translationUi.exportOriginal'),
      icon: 'pi pi-file',
      items: [
        {
          label: text('translationUi.copyClipboard'),
          icon: 'pi pi-copy',
          command: () => void exportChapter('original', 'clipboard'),
        },
        {
          label: text('translationUi.exportJson'),
          icon: 'pi pi-code',
          command: () => void exportChapter('original', 'json'),
        },
        {
          label: text('translationUi.exportTxt'),
          icon: 'pi pi-file',
          command: () => void exportChapter('original', 'txt'),
        },
      ],
    },
    {
      label: text('translationUi.exportTranslation'),
      icon: 'pi pi-language',
      items: [
        {
          label: text('translationUi.copyClipboard'),
          icon: 'pi pi-copy',
          command: () => void exportChapter('translation', 'clipboard'),
        },
        {
          label: text('translationUi.exportJson'),
          icon: 'pi pi-code',
          command: () => void exportChapter('translation', 'json'),
        },
        {
          label: text('translationUi.exportTxt'),
          icon: 'pi pi-file',
          command: () => void exportChapter('translation', 'txt'),
        },
      ],
    },
    {
      label: text('translationUi.exportBilingual'),
      icon: 'pi pi-book',
      items: [
        {
          label: text('translationUi.copyClipboard'),
          icon: 'pi pi-copy',
          command: () => void exportChapter('bilingual', 'clipboard'),
        },
        {
          label: text('translationUi.exportJson'),
          icon: 'pi pi-code',
          command: () => void exportChapter('bilingual', 'json'),
        },
        {
          label: text('translationUi.exportTxt'),
          icon: 'pi pi-file',
          command: () => void exportChapter('bilingual', 'txt'),
        },
      ],
    },
  ]);

  return {
    exportMenuRef,
    exportMenuItems,
    toggleExportMenu,
    exportChapter,
    copyAllTranslatedText,
  };
}
