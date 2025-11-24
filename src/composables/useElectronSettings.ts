import { onMounted, onUnmounted } from 'vue';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';
import { SettingsService } from 'src/services/settings-service';

/**
 * Electron 环境下的设置导入/导出处理
 */
export function useElectronSettings() {
  const aiModelsStore = useAIModelsStore();
  const booksStore = useBooksStore();
  const coverHistoryStore = useCoverHistoryStore();
  const settingsStore = useSettingsStore();

  // 处理导出设置请求
  const handleExportRequest = (filePath: string) => {
    try {
      // 获取当前设置
      const settings = {
        aiModels: aiModelsStore.models,
        novels: booksStore.books,
        coverHistory: coverHistoryStore.covers,
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
      // 解析 JSON
      const settings = JSON.parse(content);

      // 使用 SettingsService 验证和解析
      const result = SettingsService.validateAndParseSettings(settings);

      if (result.success && result.data) {
        // 导入 AI 模型
        if (result.data.models && result.data.models.length > 0) {
          for (const model of result.data.models) {
            await aiModelsStore.addModel(model);
          }
        }

        // 导入书籍
        if (result.data.novels && result.data.novels.length > 0) {
          for (const novel of result.data.novels) {
            await booksStore.addBook(novel);
          }
        }

        // 导入封面历史
        if (result.data.coverHistory && result.data.coverHistory.length > 0) {
          for (const cover of result.data.coverHistory) {
            await coverHistoryStore.addCover(cover);
          }
        }

        // 导入应用设置
        if (result.data.appSettings) {
          await settingsStore.updateSettings(result.data.appSettings);
        }

        // 导入同步配置
        if (result.data.sync && result.data.sync.length > 0) {
          // 假设只有一个 Gist 同步配置
          const gistSync = result.data.sync[0];
          if (gistSync) {
            await settingsStore.updateGistSync(gistSync);
          }
        }
      } else {
        console.error('Import validation failed:', result.error);
      }
    } catch (error) {
      console.error('Import settings error:', error);
    }
  };

  onMounted(() => {
    // 只在 Electron 环境中注册监听器
    if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
      try {
        if (window.electronAPI.settings) {
          window.electronAPI.settings.onExportRequest(handleExportRequest);
          window.electronAPI.settings.onImportData(handleImportData);
        }
      } catch (error) {
        console.error('Failed to setup Electron IPC:', error);
      }
    }
  });

  onUnmounted(() => {
    // 清理监听器
    if (typeof window !== 'undefined' && window.electronAPI?.settings) {
      window.electronAPI.settings.removeListeners();
    }
  });
}
