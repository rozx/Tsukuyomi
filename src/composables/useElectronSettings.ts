import { onMounted, onUnmounted } from 'vue';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';
import { SettingsService } from 'src/services/settings-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { MemoryService } from 'src/services/memory-service';
import { isElectron } from 'src/utils/platform';
import type { Memory } from 'src/models/memory';

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
      // 加载所有书籍的章节内容
      const novelsWithContent = await ChapterContentService.loadAllChapterContentsForNovels(
        booksStore.books,
      );

      // 使用批量加载方法加载所有 Memory 数据
      const bookIds = booksStore.books.map((book) => book.id);
      const memories = await MemoryService.getAllMemoriesForBooksFlat(bookIds);

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

  const importAiModels = async (
    models: Exclude<ReturnType<typeof SettingsService.validateAndParseSettings>['data'], undefined>['models'],
  ): Promise<void> => {
    if (models && models.length > 0) {
      await aiModelsStore.bulkImportModels(models);
    }
  };

  const importNovels = async (novels: Array<Parameters<typeof booksStore.bulkAddBooks>[0][number]> | undefined): Promise<void> => {
    if (novels && novels.length > 0) {
      await booksStore.clearBooks();
      await booksStore.bulkAddBooks(novels);
    }
  };

  const importCoverHistory = async (
    covers: Array<Parameters<typeof coverHistoryStore.addCover>[0]> | undefined,
  ): Promise<void> => {
    if (!covers || covers.length === 0) return;
    await coverHistoryStore.clearHistory();
    for (const cover of covers) {
      await coverHistoryStore.addCover(cover);
    }
  };

  const importMemories = async (memories: Memory[] | undefined): Promise<void> => {
    if (!memories || memories.length === 0) return;
    const memoriesByBook = new Map<string, Memory[]>();
    for (const memory of memories) {
      if (!memoriesByBook.has(memory.bookId)) memoriesByBook.set(memory.bookId, []);
      memoriesByBook.get(memory.bookId)!.push(memory);
    }
    for (const [bookId, list] of memoriesByBook.entries()) {
      try {
        for (const memory of list) {
          await MemoryService.createMemory(bookId, memory.content, memory.summary);
        }
      } catch (error) {
        console.warn(`[useElectronSettings] 导入书籍 ${bookId} 的 Memory 失败:`, error);
      }
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
      const data = result.data;
      await importAiModels(data.models);
      await importNovels(data.novels);
      await importCoverHistory(data.coverHistory);
      await importMemories(data.memories);
      if (data.appSettings) await settingsStore.importSettings(data.appSettings);
      if (data.sync && data.sync.length > 0) await settingsStore.importSyncs(data.sync);
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
