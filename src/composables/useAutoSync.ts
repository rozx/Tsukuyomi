import { ref, watch } from 'vue';
import { useSettingsStore } from 'src/stores/settings';
import { GistSyncService } from 'src/services/gist-sync-service';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { ConflictDetectionService } from 'src/services/conflict-detection-service';
import { SyncDataService } from 'src/services/sync-data-service';
import type { ConflictResolution, ConflictItem } from 'src/services/conflict-detection-service';
import type { Novel } from 'src/models/novel';
import co from 'co';

// 单例状态（在模块级别共享）
let autoSyncInterval: ReturnType<typeof setInterval> | null = null;
const showConflictDialog = ref(false);
const detectedConflicts = ref<ConflictItem[]>([]);
const pendingRemoteData = ref<{
  novels: any[];
  aiModels: any[];
  appSettings?: any;
  coverHistory?: any[];
} | null>(null);

// 单例 watch 清理函数
let watchStopHandle: (() => void) | null = null;

/**
 * 自动同步 composable（单例模式）
 */
export function useAutoSync() {
  const settingsStore = useSettingsStore();
  const aiModelsStore = useAIModelsStore();
  const booksStore = useBooksStore();
  const coverHistoryStore = useCoverHistoryStore();
  const gistSyncService = new GistSyncService();

  /**
   * 应用下载的数据（根据冲突解决结果）
   * 注意：自动同步需要特殊处理（检测本地删除），所以使用自定义逻辑
   */
  const applyDownloadedData = async (
    remoteData: {
      novels?: any[] | null;
      aiModels?: any[] | null;
      appSettings?: any;
      coverHistory?: any[] | null;
    } | null,
    resolutions: ConflictResolution[],
  ) => {
    // 如果 remoteData 为 null，直接返回
    if (!remoteData) {
      return;
    }

    const resolutionMap = new Map(resolutions.map((r) => [r.conflictId, r.choice]));

    // 处理 AI 模型
    // AI 模型没有时间戳，使用上次同步时的模型 ID 列表来判断是"远程新添加"还是"本地已删除"
    if (
      remoteData.aiModels &&
      Array.isArray(remoteData.aiModels) &&
      remoteData.aiModels.length > 0
    ) {
      const finalModels: any[] = [];
      const lastSyncedModelIds = settingsStore.gistSync.lastSyncedModelIds || [];

      for (const remoteModel of remoteData.aiModels) {
        const localModel = aiModelsStore.models.find((m) => m.id === remoteModel.id);
        if (localModel) {
          // 本地存在，根据冲突解决选择
          const resolution = resolutionMap.get(remoteModel.id);
          if (resolution === 'remote') {
            finalModels.push(remoteModel);
          } else {
            finalModels.push(localModel);
          }
        } else {
          // 本地不存在，检查是否是远程新添加的（而不是本地已删除的）
          // 如果该模型在上次同步时的列表中，说明是本地删除的，不应该添加
          // 如果不在上次同步时的列表中，说明是远程新添加的，应该添加
          if (!lastSyncedModelIds.includes(remoteModel.id)) {
            // 远程新添加的，应该添加
            finalModels.push(remoteModel);
          }
          // 否则，说明是本地已删除的，不添加
        }
      }

      // 添加本地独有的模型
      for (const localModel of aiModelsStore.models) {
        if (!remoteData.aiModels.find((m) => m.id === localModel.id)) {
          finalModels.push(localModel);
        }
      }

      void aiModelsStore.clearModels();
      for (const model of finalModels) {
        void aiModelsStore.addModel(model);
      }
    }

    // 处理书籍（确保 novels 存在且为数组）
    // 即使远程书籍列表为空，也需要处理（可能远程删除了所有书籍）
    if (remoteData && remoteData.novels && Array.isArray(remoteData.novels)) {
      const finalBooksMap = new Map<string, Novel>();
      const lastSyncTime = settingsStore.gistSync.lastSyncTime || 0;

      // 处理远程书籍（根据冲突解决选择）
      for (const remoteNovel of remoteData.novels) {
        const localNovel = booksStore.books.find((b) => b.id === remoteNovel.id);
        if (localNovel) {
          // 本地存在，根据冲突解决选择
          const resolution = resolutionMap.get(remoteNovel.id);
          if (resolution === 'remote') {
            // 使用远程书籍，但需要保留本地章节内容
            const mergedNovel = await SyncDataService.mergeNovelWithLocalContent(
              remoteNovel as Novel,
              localNovel,
            );
            finalBooksMap.set(remoteNovel.id, mergedNovel);
          } else {
            // 使用本地书籍，但需要确保章节内容已加载
            const localNovelWithContent =
              await SyncDataService.ensureNovelContentLoaded(localNovel);
            finalBooksMap.set(localNovel.id, localNovelWithContent);
          }
        } else {
          // 本地不存在，检查是否是远程新添加的（而不是本地已删除的）
          // 如果远程的 lastEdited 时间晚于上次同步时间，说明是远程新添加的
          const remoteLastEdited = new Date(remoteNovel.lastEdited).getTime();
          if (remoteLastEdited > lastSyncTime) {
            // 远程新添加的，应该添加
            finalBooksMap.set(remoteNovel.id, remoteNovel as Novel);
          }
          // 否则，说明是本地已删除的，不添加
        }
      }

      // 处理本地独有的书籍（本地存在但远程不存在）
      // 如果用户选择了 'remote'，则不添加（删除本地书籍）
      // 如果用户选择了 'local' 或没有冲突，则保留本地书籍
      for (const localBook of booksStore.books) {
        if (!finalBooksMap.has(localBook.id)) {
          // 检查是否有冲突解决选择
          const resolution = resolutionMap.get(localBook.id);
          if (resolution === 'remote') {
            // 用户选择使用远程（删除），不添加本地书籍
            continue;
          }
          // 用户选择保留本地或没有冲突，添加本地书籍（确保章节内容已加载）
          const localBookWithContent = await SyncDataService.ensureNovelContentLoaded(localBook);
          finalBooksMap.set(localBook.id, localBookWithContent);
        }
      }

      const finalBooks = Array.from(finalBooksMap.values());
      await booksStore.clearBooks();
      await booksStore.bulkAddBooks(finalBooks);
    } else if (remoteData && (!remoteData.novels || !Array.isArray(remoteData.novels))) {
      // 如果远程数据中没有 novels 字段或不是数组，说明可能有问题
      // 在这种情况下，保留本地书籍不变
    }

    // 处理封面历史
    if (
      remoteData.coverHistory &&
      Array.isArray(remoteData.coverHistory) &&
      remoteData.coverHistory.length > 0
    ) {
      const finalCovers: any[] = [];
      const lastSyncTime = settingsStore.gistSync.lastSyncTime || 0;

      for (const remoteCover of remoteData.coverHistory) {
        const localCover = coverHistoryStore.covers.find((c) => c.id === remoteCover.id);
        if (localCover) {
          const resolution = resolutionMap.get(remoteCover.id);
          if (resolution === 'remote') {
            finalCovers.push(remoteCover);
          } else {
            finalCovers.push(localCover);
          }
        } else {
          // 本地不存在，检查是否是远程新添加的
          const remoteAddedAt = new Date(remoteCover.addedAt).getTime();
          if (remoteAddedAt > lastSyncTime) {
            // 远程新添加的，应该添加
            finalCovers.push(remoteCover);
          }
          // 否则，说明是本地已删除的，不添加
        }
      }

      for (const localCover of coverHistoryStore.covers) {
        if (!remoteData.coverHistory.find((c) => c.id === localCover.id)) {
          finalCovers.push(localCover);
        }
      }

      void coverHistoryStore.clearHistory();
      for (const cover of finalCovers) {
        void coverHistoryStore.addCover(cover);
      }
    }

    // 处理设置
    if (remoteData.appSettings) {
      const resolution = resolutionMap.get('app-settings');
      if (resolution === 'remote' || resolutions.length === 0) {
        const currentGistSync = settingsStore.gistSync;
        // importSettings 已经实现了深度合并，直接调用即可
        void settingsStore.importSettings(remoteData.appSettings);
        void settingsStore.updateGistSync(currentGistSync);
      }
    }
  };

  /**
   * 执行自动同步
   */
  const performAutoSync = async () => {
    const config = settingsStore.gistSync;
    if (
      !config.enabled ||
      !config.syncParams.gistId ||
      !config.syncParams.username ||
      !config.secret
    ) {
      return;
    }

    try {
      settingsStore.setSyncing(true);

      // 1. 先下载远程更改（避免覆盖）
      const result = await gistSyncService.downloadFromGist(config);

      if (result.success && result.data) {
        // 检测冲突（确保数据不为 null/undefined）
        const remoteData = result.data;

        // 获取上次同步时间
        const lastSyncTime = config.lastSyncTime || 0;

        const conflictResult = ConflictDetectionService.detectConflicts(
          {
            novels: booksStore.books || [],
            aiModels: aiModelsStore.models || [],
            appSettings: settingsStore.getAllSettings(),
            coverHistory: coverHistoryStore.covers || [],
          },
          {
            novels: remoteData?.novels || [],
            aiModels: remoteData?.aiModels || [],
            ...(remoteData?.appSettings ? { appSettings: remoteData.appSettings } : {}),
            ...(remoteData?.coverHistory ? { coverHistory: remoteData.coverHistory } : {}),
          },
        );

        if (conflictResult && conflictResult.hasConflicts) {
          // 有冲突，显示对话框
          // 确保 result.data 不为 null 且包含必要的字段
          if (!result.data) {
            return;
          }

          // 确保 novels 和 aiModels 是数组（即使为空）
          const safeRemoteData = SyncDataService.createSafeRemoteData(result.data);

          detectedConflicts.value = conflictResult.conflicts;
          pendingRemoteData.value = safeRemoteData;
          showConflictDialog.value = true;
          return;
        }

        // 无冲突，直接应用
        await applyDownloadedData(result.data, []);
        void co(function* () {
          try {
            yield settingsStore.updateLastSyncTime();
            // 更新上次同步时的模型 ID 列表（使用应用后的模型列表）
            yield settingsStore.updateLastSyncedModelIds(aiModelsStore.models.map((m) => m.id));
          } catch (error) {
            console.error('[useAutoSync] 更新同步状态失败:', error);
          }
        });

        // 检查是否需要上传（如果有本地更改）
        const shouldUpload = SyncDataService.hasChangesToUpload(
          {
            novels: booksStore.books,
            aiModels: aiModelsStore.models,
            appSettings: settingsStore.getAllSettings(),
            coverHistory: coverHistoryStore.covers,
          },
          result.data,
        );

        if (!shouldUpload) {
          return;
        }
      } else if (!result.success) {
        // 下载失败，不继续上传
        return;
      }

      // 2. 然后上传本地更改（包含刚刚合并的远程更改）
      // 注意：上传时使用当前的模型列表，这样远程会包含本地删除后的状态
      await gistSyncService.uploadToGist(config, {
        aiModels: aiModelsStore.models,
        appSettings: settingsStore.getAllSettings(),
        novels: booksStore.books,
        coverHistory: coverHistoryStore.covers,
      });
    } catch {
      // 静默失败，避免干扰用户
    } finally {
      settingsStore.setSyncing(false);
    }
  };

  /**
   * 处理冲突解决
   */
  const handleConflictResolve = async (resolutions: ConflictResolution[]) => {
    if (!pendingRemoteData.value) {
      showConflictDialog.value = false;
      pendingRemoteData.value = null;
      detectedConflicts.value = [];
      return;
    }

    // 确保 remoteData 不为 null 且包含必要的字段
    const remoteData = pendingRemoteData.value;

    if (!remoteData || (typeof remoteData === 'object' && !('novels' in remoteData))) {
      throw new Error('远程数据无效');
    }

    // 确保 novels 和 aiModels 是数组（即使为空）
    const safeRemoteData = SyncDataService.createSafeRemoteData(remoteData);

    await applyDownloadedData(safeRemoteData, resolutions);
    void co(function* () {
      try {
        yield settingsStore.updateLastSyncTime();
        // 更新上次同步时的模型 ID 列表
        yield settingsStore.updateLastSyncedModelIds(aiModelsStore.models.map((m) => m.id));
      } catch (error) {
        console.error('[useAutoSync] 更新同步状态失败:', error);
      }
    });

    showConflictDialog.value = false;
    pendingRemoteData.value = null;
    detectedConflicts.value = [];

    // 冲突解决后，上传最终状态到 Gist
    const config = settingsStore.gistSync;
    if (config.enabled) {
      try {
        settingsStore.setSyncing(true);
        await gistSyncService.uploadToGist(config, {
          aiModels: aiModelsStore.models,
          appSettings: settingsStore.getAllSettings(),
          novels: booksStore.books,
          coverHistory: coverHistoryStore.covers,
        });
      } catch {
        // 静默失败
      } finally {
        settingsStore.setSyncing(false);
      }
    }
  };

  /**
   * 取消冲突解决
   */
  const handleConflictCancel = () => {
    showConflictDialog.value = false;
    pendingRemoteData.value = null;
    detectedConflicts.value = [];
  };

  /**
   * 设置自动同步定时器
   */
  const setupAutoSync = () => {
    // 清除现有定时器
    if (autoSyncInterval) {
      clearInterval(autoSyncInterval);
      autoSyncInterval = null;
    }

    const config = settingsStore.gistSync;
    if (config.enabled && config.syncInterval > 0) {
      // 检查是否需要立即同步（但不要立即同步，避免在配置更新时触发）
      // 只在定时器触发时同步

      // 设置定时器
      autoSyncInterval = setInterval(() => {
        void performAutoSync();
      }, config.syncInterval);
    }
  };

  /**
   * 停止自动同步
   */
  const stopAutoSync = () => {
    if (autoSyncInterval) {
      clearInterval(autoSyncInterval);
      autoSyncInterval = null;
    }
  };

  // 只在第一次调用时设置 watch（单例模式）
  if (!watchStopHandle) {
    watchStopHandle = watch(
      () => settingsStore.gistSync,
      () => {
        setupAutoSync();
      },
      { deep: true },
    );
  }

  return {
    showConflictDialog,
    detectedConflicts,
    handleConflictResolve,
    handleConflictCancel,
    setupAutoSync,
    stopAutoSync,
  };
}
