import { v4 } from 'uuid';
import { onMounted, onUnmounted } from 'vue';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';
import { SettingsService } from 'src/services/settings-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { MemoryService } from 'src/services/memory-service';
import { SyncDataService } from 'src/services/sync-data-service';
import { isElectron } from 'src/utils/platform';
import type { Memory } from 'src/models/memory';
import type { Novel } from 'src/models/novel';

/**
 * 汇总导出所需的所有书籍数据：带章节内容的 novels + 扁平 memories。
 * 被 SPA 端（ImportExportTab.vue）与 Electron 端（useElectronSettings）共用，避免重复样板。
 */
export async function loadBooksWithContentAndMemories(
  books: Novel[],
): Promise<{ novelsWithContent: Novel[]; memories: Memory[] }> {
  // 加载所有书籍的章节内容
  const novelsWithContent = await ChapterContentService.loadAllChapterContentsForNovels(books);

  // 使用批量加载方法加载所有 Memory 数据
  const bookIds = books.map((book) => book.id);
  const memories = await MemoryService.getAllMemoriesForBooksFlat(bookIds);

  return { novelsWithContent, memories };
}

/**
 * Electron 环境下的设置导入/导出处理
 */
export function useElectronSettings() {
  const aiModelsStore = useAIModelsStore();
  const booksStore = useBooksStore();
  const coverHistoryStore = useCoverHistoryStore();
  const settingsStore = useSettingsStore();

  // 处理导出设置请求
  const handleExportRequest = async (filePath: string) => {
    try {
      const { novelsWithContent, memories } = await loadBooksWithContentAndMemories(
        booksStore.books,
      );

      // 获取当前设置
      const settings = {
        aiModels: aiModelsStore.models,
        novels: novelsWithContent,
        coverHistory: coverHistoryStore.covers,
        memories,
        sync: settingsStore.syncs,
        appSettings: settingsStore.settings,
      };

      // 转换为 JSON 字符串
      const jsonString = JSON.stringify(settings, null, 2);

      // 通过 IPC 发送给主进程保存
      if (window.electronAPI?.settings) {
        window.electronAPI.settings.saveExport(filePath, jsonString);
      }
    } catch (error) {
      console.error('Export settings error:', error);
    }
  };

  // 处理导入设置数据
  const handleImportData = async (content: string) => {
    try {
      const settings = JSON.parse(content);
      const result = SettingsService.validateAndParseSettings(settings);
      if (!result.success || !result.data) {
        console.error('Import validation failed:', result.error);
        return;
      }
      await SyncDataService.importSettingsSnapshot(result.data, v4());
    } catch (error) {
      console.error('Import settings error:', error);
    }
  };

  // 存储清理函数
  let cleanupExport: (() => void) | null = null;
  let cleanupImport: (() => void) | null = null;

  onMounted(() => {
    if (!isElectron()) return;
    const api = window.electronAPI;
    if (!api?.settings) return;
    try {
      cleanupExport = api.settings.onExportRequest(handleExportRequest);
      cleanupImport = api.settings.onImportData(handleImportData);
    } catch (error) {
      console.error('Failed to setup Electron IPC:', error);
    }
  });

  onUnmounted(() => {
    // 清理监听器
    if (cleanupExport) {
      cleanupExport();
      cleanupExport = null;
    }
    if (cleanupImport) {
      cleanupImport();
      cleanupImport = null;
    }
  });
}
