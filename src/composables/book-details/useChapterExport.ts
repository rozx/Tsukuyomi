import { ref, computed } from 'vue';
import type { Ref } from 'vue';
import type { MenuItem } from 'primevue/menuitem';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import type { Chapter } from 'src/models/novel';
import { ChapterService } from 'src/services/chapter-service';
import TieredMenu from 'primevue/tieredmenu';

export function useChapterExport(
  selectedChapter: Ref<Chapter | null>,
  selectedChapterParagraphs: Ref<Array<{ id: string }>>,
) {
  const toast = useToastWithHistory();

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
      await ChapterService.exportChapter(selectedChapter.value, type, format);

      // 显示成功消息
      if (format === 'clipboard') {
        toast.add({ severity: 'success', summary: '已复制到剪贴板', life: 3000 });
      } else {
        toast.add({
          severity: 'success',
          summary: '导出成功',
          detail: `已导出为 ${format.toUpperCase()} 文件`,
          life: 3000,
        });
      }
    } catch (err) {
      console.error('Export failed:', err);
      toast.add({
        severity: 'error',
        summary: format === 'clipboard' ? '复制失败' : '导出失败',
        detail: err instanceof Error ? err.message : '请重试或检查权限',
        life: 3000,
      });
    }
  };

  // 复制所有已翻译文本到剪贴板
  const copyAllTranslatedText = async () => {
    if (!selectedChapter.value || !selectedChapterParagraphs.value.length) {
      toast.add({
        severity: 'warn',
        summary: '无法复制',
        detail: '当前章节没有内容',
        life: 3000,
      });
      return;
    }

    try {
      await ChapterService.exportChapter(selectedChapter.value, 'translation', 'clipboard');
      toast.add({
        severity: 'success',
        summary: '已复制到剪贴板',
        detail: '已复制所有已翻译文本',
        life: 3000,
      });
    } catch (err) {
      console.error('Copy failed:', err);
      toast.add({
        severity: 'error',
        summary: '复制失败',
        detail: err instanceof Error ? err.message : '请重试或检查权限',
        life: 3000,
      });
    }
  };

  // 导出菜单项
  const exportMenuItems = computed<MenuItem[]>(() => [
    {
      label: '导出原文',
      icon: 'pi pi-file',
      items: [
        {
          label: '复制到剪贴板',
          icon: 'pi pi-copy',
          command: () => void exportChapter('original', 'clipboard'),
        },
        {
          label: '导出为 JSON',
          icon: 'pi pi-code',
          command: () => void exportChapter('original', 'json'),
        },
        {
          label: '导出为 TXT',
          icon: 'pi pi-file',
          command: () => void exportChapter('original', 'txt'),
        },
      ],
    },
    {
      label: '导出译文',
      icon: 'pi pi-language',
      items: [
        {
          label: '复制到剪贴板',
          icon: 'pi pi-copy',
          command: () => void exportChapter('translation', 'clipboard'),
        },
        {
          label: '导出为 JSON',
          icon: 'pi pi-code',
          command: () => void exportChapter('translation', 'json'),
        },
        {
          label: '导出为 TXT',
          icon: 'pi pi-file',
          command: () => void exportChapter('translation', 'txt'),
        },
      ],
    },
    {
      label: '导出双语',
      icon: 'pi pi-book',
      items: [
        {
          label: '复制到剪贴板',
          icon: 'pi pi-copy',
          command: () => void exportChapter('bilingual', 'clipboard'),
        },
        {
          label: '导出为 JSON',
          icon: 'pi pi-code',
          command: () => void exportChapter('bilingual', 'json'),
        },
        {
          label: '导出为 TXT',
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
