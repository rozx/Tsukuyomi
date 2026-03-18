import { GistSyncService } from 'src/services/gist-sync-service';
import { SyncDataService, type RestorableItem } from 'src/services/sync-data-service';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';
import { MemoryService } from 'src/services/memory-service';
import type { SyncConfig } from 'src/models/sync';

/**
 * 同步执行器选项接口
 * 用于控制共享同步逻辑的行为差异
 */
export interface SyncExecutorOptions {
  /** 进度消息前缀，如 '[自动同步] ' 或 '' */
  messagePrefix: string;
  /** 是否为手动同步（控制 applyDownloadedData 是否返回可恢复项） */
  isManualRetrieval: boolean;
  /** 错误回调 */
  onError: (summary: string, detail: string) => void;
  /** 成功回调 */
  onSuccess?: (summary: string, detail: string) => void;
  /** 可选的配置覆盖（用于设置页面传入的临时配置） */
  configOverride?: SyncConfig;
}

/**
 * 同步执行器返回结果
 */
export interface SyncExecutorResult {
  /** 同步是否成功完成 */
  success: boolean;
  /** 可恢复的已删除项目列表（仅手动同步时有值） */
  restorableItems: RestorableItem[];
}

// 进度阶段分配常量
const OVERALL_TOTAL = 100;
const DOWNLOAD_PHASE_MAX = 50; // 下载阶段占 50%
const APPLY_PHASE_MAX = 10; // 应用阶段占 10%
const UPLOAD_PHASE_START = DOWNLOAD_PHASE_MAX + APPLY_PHASE_MAX; // 60

/**
 * 共享同步执行器 composable
 * 封装核心同步流程：远程检测 → 条件下载 → apply → 本地变更检测 → 条件上传
 *
 * useAutoSync 和 useGistSync 通过不同的 SyncExecutorOptions 调用此执行器，
 * 消除两个 composable 之间的代码重复。
 */
export function useSyncExecutor() {
  const settingsStore = useSettingsStore();
  const aiModelsStore = useAIModelsStore();
  const booksStore = useBooksStore();
  const coverHistoryStore = useCoverHistoryStore();
  const gistSyncService = new GistSyncService();

  /**
   * 执行完整的双向同步流程
   * 流程：远程检测 → 条件下载 → apply → 本地变更检测 → 条件上传
   */
  const executeSync = async (options: SyncExecutorOptions): Promise<SyncExecutorResult> => {
    const { messagePrefix, isManualRetrieval, onError, onSuccess, configOverride } = options;
    const config = configOverride ?? settingsStore.gistSync;

    const prefixMsg = (msg: string) => (messagePrefix ? `${messagePrefix}${msg}` : msg);

    let restorableItems: RestorableItem[] = [];

    // ── 阶段 1：下载远程数据（带远程变更检测） ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let remoteData: any = undefined;
    let downloadSkipped = false;

    if (config.syncParams.gistId) {
      settingsStore.updateSyncProgress({
        stage: 'downloading',
        message: prefixMsg('正在下载远程数据...'),
        current: 0,
        total: OVERALL_TOTAL,
      });

      let downloadPhaseTotal: number | undefined = undefined;

      // 传递 lastRemoteUpdatedAt 以启用远程变更检测
      let downloadResult;
      try {
        downloadResult = await gistSyncService.downloadFromGist(
          config,
          (progress) => {
            if (downloadPhaseTotal === undefined) {
              downloadPhaseTotal = progress.total;
            }

            const mappedCurrent =
              progress.total > 0
                ? Math.round((progress.current / progress.total) * DOWNLOAD_PHASE_MAX)
                : 0;

            settingsStore.updateSyncProgress({
              stage: 'downloading',
              current: mappedCurrent,
              total: OVERALL_TOTAL,
              message: prefixMsg(progress.message),
            });
          },
          config.lastRemoteUpdatedAt,
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : '下载时发生未知错误';
        console.error('[useSyncExecutor] 同步下载失败:', errorMsg);
        onError('下载失败', errorMsg);
        return { success: false, restorableItems: [] };
      }

      if (downloadResult.success && downloadResult.skipped) {
        // 远程无变更，跳过了下载解析
        downloadSkipped = true;

        // 更新 remoteUpdatedAt（仅在实际变化时写入，避免自动同步周期性冗余写盘）
        if (
          downloadResult.remoteUpdatedAt &&
          downloadResult.remoteUpdatedAt !== config.lastRemoteUpdatedAt
        ) {
          try {
            await settingsStore.updateLastRemoteUpdatedAt(downloadResult.remoteUpdatedAt);
          } catch (error) {
            console.error('[useSyncExecutor] 更新 lastRemoteUpdatedAt 失败:', error);
          }
        }

        settingsStore.updateSyncProgress({
          stage: 'downloading',
          message: prefixMsg('远程无变更，跳过下载'),
          current: DOWNLOAD_PHASE_MAX,
          total: OVERALL_TOTAL,
        });
      } else if (downloadResult.success && downloadResult.data) {
        // 有新数据，继续处理
        remoteData = downloadResult.data;

        // 更新 remoteUpdatedAt
        if (downloadResult.remoteUpdatedAt) {
          try {
            await settingsStore.updateLastRemoteUpdatedAt(downloadResult.remoteUpdatedAt);
          } catch (error) {
            console.error('[useSyncExecutor] 更新 lastRemoteUpdatedAt 失败:', error);
          }
        }
      } else if (!downloadResult.success) {
        // 下载失败，终止同步
        const errorMsg = downloadResult.error || '从 Gist 下载数据时发生未知错误';
        console.error('[useSyncExecutor] 同步下载失败:', errorMsg);
        onError('下载失败', errorMsg);
        return { success: false, restorableItems: [] };
      } else {
        // success 为 true 但无 data（空 Gist），继续上传
        console.info('[useSyncExecutor] 下载成功但无数据，继续尝试上传本地数据');
      }
    }

    // ── 阶段 2：应用远程数据 ──
    if (remoteData) {
      settingsStore.updateSyncProgress({
        stage: 'applying',
        message: prefixMsg('正在应用下载的数据...'),
        current: DOWNLOAD_PHASE_MAX,
        total: OVERALL_TOTAL,
      });

      // 手动同步时返回可恢复项
      restorableItems = await SyncDataService.applyDownloadedData(
        remoteData,
        undefined,
        isManualRetrieval,
      );

      settingsStore.updateSyncProgress({
        stage: 'applying',
        message: prefixMsg('应用完成'),
        current: UPLOAD_PHASE_START,
        total: OVERALL_TOTAL,
      });

      // 更新同步状态
      try {
        await settingsStore.updateLastSyncTime();
        await settingsStore.updateLastSyncedModelIds(aiModelsStore.models.map((m) => m.id));
        await settingsStore.cleanupOldDeletionRecords();
      } catch (error) {
        console.error('[useSyncExecutor] 更新同步状态失败:', error);
      }
    }

    // ── 阶段 3：检测本地变更并决定是否上传 ──
    const bookIds = booksStore.books.map((book) => book.id);
    const memories = await MemoryService.getAllMemoriesForBooksFlat(bookIds);

    const localData = {
      novels: booksStore.books,
      aiModels: aiModelsStore.models,
      appSettings: settingsStore.getAllSettings(),
      coverHistory: coverHistoryStore.covers,
      memories,
    };

    // 当下载被跳过时（远程无变更），仍然需要判断本地是否有变更需要上传
    // 此时没有 remoteData，与空数据比较即可检测到本地有内容
    // 但更准确的做法是：如果下载被跳过且上次同步后本地没有修改，则也跳过上传
    // hasChangesToUpload 实际上比较的是 local vs remote data 的差异
    // 当 downloadSkipped 时，说明远程没变，需要判断本地相对上次同步是否有变化
    let shouldUpload: boolean;

    if (downloadSkipped) {
      // 远程无变更且下载被跳过：没有 remoteData 来做 local vs remote 差异比较
      // 改为检查自上次同步以来本地是否有任何数据变更（基于 lastSyncTime）
      const lastSyncTime = config.lastSyncTime ?? 0;
      shouldUpload = SyncDataService.hasLocalChangesSinceLastSync(localData, lastSyncTime);
    } else if (remoteData) {
      shouldUpload = SyncDataService.hasChangesToUpload(localData, remoteData);
    } else {
      // 没有远程数据（首次同步或空 Gist），与空数据比较
      shouldUpload = SyncDataService.hasChangesToUpload(localData, {
        novels: [],
        aiModels: [],
        appSettings: {},
        coverHistory: [],
        memories: [],
      });
    }

    if (!shouldUpload) {
      settingsStore.updateSyncProgress({
        stage: 'uploading',
        message: prefixMsg('同步完成（无更改需要上传）'),
        current: OVERALL_TOTAL,
        total: OVERALL_TOTAL,
      });

      if (onSuccess) {
        onSuccess('同步完成', '数据已是最新，无需上传');
      }

      return { success: true, restorableItems };
    }

    // ── 阶段 4：上传本地数据 ──
    settingsStore.updateSyncProgress({
      stage: 'uploading',
      message: prefixMsg(`正在上传数据 (${localData.novels.length} 本书籍)...`),
      current: UPLOAD_PHASE_START,
      total: OVERALL_TOTAL,
    });

    let uploadPhaseTotal: number | undefined = undefined;
    let uploadResult;
    try {
      uploadResult = await gistSyncService.uploadToGist(
        config,
        {
          aiModels: aiModelsStore.models,
          appSettings: settingsStore.getAllSettings(),
          novels: booksStore.books,
          coverHistory: coverHistoryStore.covers,
        },
        (progress) => {
          if (uploadPhaseTotal === undefined) {
            uploadPhaseTotal = progress.total;
          }

          const uploadPhaseRange = OVERALL_TOTAL - UPLOAD_PHASE_START;
          const mappedCurrent =
            progress.total > 0
              ? UPLOAD_PHASE_START +
                Math.round((progress.current / progress.total) * uploadPhaseRange)
              : UPLOAD_PHASE_START;

          settingsStore.updateSyncProgress({
            stage: 'uploading',
            current: mappedCurrent,
            total: OVERALL_TOTAL,
            message: prefixMsg(progress.message),
          });
        },
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '上传时发生未知错误';
      console.error('[useSyncExecutor] 上传失败:', errorMsg);
      onError('上传失败', errorMsg);
      return { success: false, restorableItems };
    }

    if (uploadResult.success) {
      // 更新进度：上传完成
      settingsStore.updateSyncProgress({
        stage: 'uploading',
        message: prefixMsg('同步完成'),
        current: OVERALL_TOTAL,
        total: OVERALL_TOTAL,
      });

      // 更新 Gist ID（如果是新创建的 Gist）
      if (uploadResult.gistId) {
        try {
          await settingsStore.setGistId(uploadResult.gistId);
        } catch (error) {
          console.error('[useSyncExecutor] 设置 Gist ID 失败:', error);
        }
      }

      // 上传成功后更新同步时间
      try {
        await settingsStore.updateLastSyncTime();
        await settingsStore.cleanupOldDeletionRecords();
      } catch (error) {
        console.error('[useSyncExecutor] 更新同步状态失败:', error);
      }

      // 上传成功后更新 lastRemoteUpdatedAt
      if (uploadResult.remoteUpdatedAt) {
        try {
          await settingsStore.updateLastRemoteUpdatedAt(uploadResult.remoteUpdatedAt);
        } catch (error) {
          console.error('[useSyncExecutor] 更新 lastRemoteUpdatedAt 失败:', error);
        }
      }

      if (onSuccess) {
        onSuccess('同步完成', '数据已同步到 Gist');
      }

      return { success: true, restorableItems };
    } else {
      const errorMsg = uploadResult.error || '上传到 Gist 时发生未知错误';
      console.error('[useSyncExecutor] 上传失败:', errorMsg);
      onError('上传失败', errorMsg);
      return { success: false, restorableItems };
    }
  };

  return {
    executeSync,
  };
}
