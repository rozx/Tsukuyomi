import { GistSyncService } from 'src/services/gist-sync-service';
import { SyncDataService, type RestorableItem } from 'src/services/sync-data-service';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';
import { MemoryService } from 'src/services/memory-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import {
  buildLocalManifest,
  manifestToHashes,
} from 'src/services/sync-manifest-builder';
import {
  normalizeMemoriesForSync,
  stripNovelLocalFields,
} from 'src/utils/sync-strip';
import type { SyncConfig } from 'src/models/sync';
import type { Memory } from 'src/models/memory';

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
const DOWNLOAD_PHASE_MAX = 50;
const APPLY_PHASE_MAX = 10;
const UPLOAD_PHASE_START = DOWNLOAD_PHASE_MAX + APPLY_PHASE_MAX;

/** 伪 CAS 检测到并发写入时的最大重试轮数 */
const MAX_CONCURRENT_WRITE_RETRIES = 3;

/**
 * 共享同步执行器：基于 manifest 的增量同步
 *
 * 流程：
 *   1. 条件 GET（If-None-Match）下载远端
 *      - 304 跳过 → 直接进入本地变更检测
 *      - 200 且无 manifest → 触发迁移（在 Group 6 中实现；当前回退到 legacy 路径）
 *      - 200 且 schemaVersion 超前 → 报错
 *      - 200 正常 → 选择性反序列化 changed entries
 *   2. 应用 changedEntries 到本地各 store
 *   3. 基于 hash 比对检测本地是否有待上传的变更
 *   4. 伪 CAS 预检 + 增量上传（失败则重试）
 */
export function useSyncExecutor() {
  const settingsStore = useSettingsStore();
  const aiModelsStore = useAIModelsStore();
  const booksStore = useBooksStore();
  const coverHistoryStore = useCoverHistoryStore();
  const gistSyncService = new GistSyncService();

  /**
   * 收集所有书籍的 memories，按 bookId 分组
   */
  const collectMemoriesByBook = async (): Promise<Record<string, Memory[]>> => {
    const bookIds = booksStore.books.map((b) => b.id);
    const result: Record<string, Memory[]> = {};
    for (const bookId of bookIds) {
      try {
        const memories = await MemoryService.getAllMemories(bookId);
        if (memories.length > 0) {
          result[bookId] = memories;
        }
      } catch (e) {
        console.warn(`[useSyncExecutor] 读取书籍 ${bookId} 的 Memory 失败:`, e);
      }
    }
    return result;
  };

  const executeSync = async (options: SyncExecutorOptions): Promise<SyncExecutorResult> => {
    const { messagePrefix, onError, onSuccess, configOverride } = options;
    const prefixMsg = (msg: string) => (messagePrefix ? `${messagePrefix}${msg}` : msg);

    const restorableItems: RestorableItem[] = [];
    let retriesRemaining = MAX_CONCURRENT_WRITE_RETRIES;

    while (retriesRemaining > 0) {
      retriesRemaining -= 1;
      const config = configOverride ?? settingsStore.gistSync;

      // ── 阶段 1：条件下载 + 解析 manifest ──
      settingsStore.updateSyncProgress({
        stage: 'downloading',
        message: prefixMsg('正在检查远程变更...'),
        current: 0,
        total: OVERALL_TOTAL,
      });

      let downloadResult;
      if (config.syncParams.gistId) {
        try {
          downloadResult = await gistSyncService.downloadFromGistWithManifest(
            config,
            (progress) => {
              const mapped =
                progress.total > 0
                  ? Math.round((progress.current / progress.total) * DOWNLOAD_PHASE_MAX)
                  : 0;
              settingsStore.updateSyncProgress({
                stage: 'downloading',
                current: mapped,
                total: OVERALL_TOTAL,
                message: prefixMsg(progress.message),
              });
            },
          );
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : '下载时发生未知错误';
          console.error('[useSyncExecutor] 同步下载失败:', errorMsg);
          onError('下载失败', errorMsg);
          return { success: false, restorableItems: [] };
        }
      }

      // 远端要求更高的客户端版本
      if (downloadResult && !downloadResult.skipped && downloadResult.schemaVersionTooNew) {
        onError(
          '同步中止',
          '远程数据由较新版本的应用写入，请升级客户端后再同步',
        );
        return { success: false, restorableItems: [] };
      }

      // 远端无 manifest——一次性迁移：
      // 走 legacy 下载+合并流程，随后让常规上传路径写入 manifest 和拆分后的新布局
      if (downloadResult && !downloadResult.skipped && downloadResult.needsMigration) {
        settingsStore.updateSyncProgress({
          stage: 'downloading',
          message: prefixMsg('检测到旧布局 Gist，正在执行一次性迁移...'),
          current: DOWNLOAD_PHASE_MAX / 2,
          total: OVERALL_TOTAL,
        });

        let legacyDownload;
        try {
          legacyDownload = await gistSyncService.downloadFromGist(config);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : '迁移下载失败';
          console.error('[useSyncExecutor] 迁移下载失败:', errorMsg);
          onError('迁移失败', `${errorMsg}（本地数据未改动，下次同步将重试）`);
          return { success: false, restorableItems: [] };
        }

        if (!legacyDownload.success) {
          const errorMsg = legacyDownload.error || '旧布局下载失败';
          onError('迁移失败', `${errorMsg}（本地数据未改动，下次同步将重试）`);
          return { success: false, restorableItems: [] };
        }

        if (legacyDownload.data) {
          try {
            const applied = await SyncDataService.applyDownloadedData(
              legacyDownload.data,
              undefined,
              options.isManualRetrieval,
            );
            restorableItems.push(...applied);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : '应用旧布局数据失败';
            console.error('[useSyncExecutor] 迁移 apply 失败:', errorMsg);
            onError('迁移失败', `${errorMsg}（本地数据已回滚）`);
            return { success: false, restorableItems: [] };
          }
        }

        // 记下当前 ETag 供后续伪 CAS 使用；清空 knownRemoteHashes，
        // 使后续 uploadToGistIncremental 将所有条目视为新增，产出完整的新布局
        try {
          await settingsStore.updateLastRemoteETag(downloadResult.remoteETag);
          await settingsStore.updateKnownRemoteHashes({});
        } catch (error) {
          console.error('[useSyncExecutor] 保存迁移状态失败:', error);
        }

        settingsStore.updateSyncProgress({
          stage: 'applying',
          message: prefixMsg('迁移合并完成，准备写入新布局...'),
          current: UPLOAD_PHASE_START,
          total: OVERALL_TOTAL,
        });

        // 继续流转到阶段 3（计算本地 manifest）与阶段 4（上传）
        // 下面的代码会自然地把当前本地状态作为完整的新布局上传
      }

      // ── 阶段 2：应用 changedEntries ──
      if (downloadResult && !downloadResult.skipped) {
        settingsStore.updateSyncProgress({
          stage: 'applying',
          message: prefixMsg('正在应用下载的数据...'),
          current: DOWNLOAD_PHASE_MAX,
          total: OVERALL_TOTAL,
        });

        try {
          await SyncDataService.applyPartialRemoteData(downloadResult.changedEntries);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : '应用远程数据时发生未知错误';
          console.error('[useSyncExecutor] 应用失败:', errorMsg);
          onError('应用失败', errorMsg);
          return { success: false, restorableItems: [] };
        }

        // 更新本地持久化的已知远端状态
        if (downloadResult.manifest) {
          try {
            await settingsStore.updateKnownRemoteHashes(manifestToHashes(downloadResult.manifest));
          } catch (error) {
            console.error('[useSyncExecutor] 保存 knownRemoteHashes 失败:', error);
          }
        }
        try {
          await settingsStore.updateLastRemoteETag(downloadResult.remoteETag);
        } catch (error) {
          console.error('[useSyncExecutor] 保存 lastRemoteETag 失败:', error);
        }

        settingsStore.updateSyncProgress({
          stage: 'applying',
          message: prefixMsg('应用完成'),
          current: UPLOAD_PHASE_START,
          total: OVERALL_TOTAL,
        });
      }

      // ── 阶段 3：计算本地 manifest，判断是否需要上传 ──
      // 加载所有章节内容以用于 manifest 哈希与上传
      const novelsLoaded = await ChapterContentService.loadAllChapterContentsForNovels(
        booksStore.books,
      );
      const rawMemoriesByBook = await collectMemoriesByBook();

      // 规范化：剥离本地字段 + 按 id 排序 memory，确保内容不变时 hash 稳定
      // （embedding / memoryScoreBreakdown 等字段会异步变化，会污染 hash 导致误认为"有变更"）
      const novelsWithContent = novelsLoaded.map(stripNovelLocalFields);
      const memoriesByBook = normalizeMemoriesForSync(rawMemoriesByBook);

      const localManifest = await buildLocalManifest({
        appSettings: settingsStore.getAllSettings(),
        aiModels: aiModelsStore.models,
        coverHistory: coverHistoryStore.covers,
        novels: novelsWithContent,
        memoriesByBook,
      });

      const latestConfig = configOverride ?? settingsStore.gistSync;
      const knownHashes = latestConfig.knownRemoteHashes ?? {};
      const localHashes = manifestToHashes(localManifest);
      const shouldUpload = SyncDataService.hasLocalChangesByHash(localHashes, knownHashes);

      if (shouldUpload) {
        // 诊断：记录哪些 entry 触发了上传
        const diffs: Array<{ key: string; local: string; known: string | undefined }> = [];
        for (const [key, localHash] of Object.entries(localHashes)) {
          const known = knownHashes[key];
          if (known !== localHash) {
            diffs.push({ key, local: localHash.slice(0, 12), known: known?.slice(0, 12) });
          }
        }
        for (const key of Object.keys(knownHashes)) {
          if (!(key in localHashes)) {
            diffs.push({ key, local: '(absent)', known: knownHashes[key]?.slice(0, 12) });
          }
        }
        console.info('[useSyncExecutor] 检测到本地变更，将上传:', diffs);
      }

      if (!shouldUpload) {
        settingsStore.updateSyncProgress({
          stage: 'uploading',
          message: prefixMsg('同步完成（无更改需要上传）'),
          current: OVERALL_TOTAL,
          total: OVERALL_TOTAL,
        });
        try {
          await settingsStore.updateLastSyncTime();
          await settingsStore.cleanupOldDeletionRecords();
        } catch (error) {
          console.error('[useSyncExecutor] 更新同步状态失败:', error);
        }
        if (onSuccess) onSuccess('同步完成', '数据已是最新，无需上传');
        return { success: true, restorableItems };
      }

      // ── 阶段 4：伪 CAS 预检 + 增量上传 ──
      settingsStore.updateSyncProgress({
        stage: 'uploading',
        message: prefixMsg('正在检查远程并发写入...'),
        current: UPLOAD_PHASE_START,
        total: OVERALL_TOTAL,
      });

      // 仅当有已知 ETag 时才做伪 CAS（首次同步无 ETag，跳过）
      let remoteFilesSnapshot: Record<string, unknown> = {};
      if (latestConfig.syncParams.gistId && latestConfig.lastRemoteETag) {
        try {
          const verify = await gistSyncService.verifyRemoteUnchanged(latestConfig);
          if (verify.status === 'changed') {
            // 远端自上次已知状态后发生了变更：重启同步循环
            if (retriesRemaining > 0) {
              console.info(
                `[useSyncExecutor] 伪 CAS 检测到并发写入，重试中（剩余 ${retriesRemaining} 次）`,
              );
              remoteFilesSnapshot = verify.files;
              continue; // 回到 while 顶部，重新下载
            }
            onError(
              '同步冲突',
              '其他设备正在频繁写入，请稍后再试',
            );
            return { success: false, restorableItems };
          }
          // unchanged: 继续
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : '伪 CAS 检查失败';
          console.error('[useSyncExecutor] 伪 CAS 失败:', errorMsg);
          onError('同步失败', errorMsg);
          return { success: false, restorableItems };
        }
      }

      settingsStore.updateSyncProgress({
        stage: 'uploading',
        message: prefixMsg(`正在上传数据 (${booksStore.books.length} 本书籍)...`),
        current: UPLOAD_PHASE_START,
        total: OVERALL_TOTAL,
      });

      if (!latestConfig.syncParams.gistId) {
        // 首次同步且无 gistId——按照 legacy 流程创建 Gist。
        // 此时 knownRemoteHashes 为空，incremental 上传会把所有 entry 当作 added 上传。
        // 但需要先 create Gist；委托给 legacy `uploadToGist` 完成初次创建。
        // 初始上传后，下一轮同步就会走增量路径。
        try {
          const uploadResult = await gistSyncService.uploadToGist(
            latestConfig,
            {
              aiModels: aiModelsStore.models,
              appSettings: settingsStore.getAllSettings(),
              novels: booksStore.books,
              coverHistory: coverHistoryStore.covers,
            },
            (progress) => {
              const uploadPhaseRange = OVERALL_TOTAL - UPLOAD_PHASE_START;
              const mapped =
                progress.total > 0
                  ? UPLOAD_PHASE_START +
                    Math.round((progress.current / progress.total) * uploadPhaseRange)
                  : UPLOAD_PHASE_START;
              settingsStore.updateSyncProgress({
                stage: 'uploading',
                current: mapped,
                total: OVERALL_TOTAL,
                message: prefixMsg(progress.message),
              });
            },
          );
          if (!uploadResult.success) {
            onError('上传失败', uploadResult.error || '创建 Gist 失败');
            return { success: false, restorableItems };
          }
          if (uploadResult.gistId) {
            await settingsStore.setGistId(uploadResult.gistId);
          }
          // 初次创建后，下一次同步会建立 manifest。返回成功。
          await settingsStore.updateLastSyncTime();
          if (onSuccess) onSuccess('同步完成', '数据已同步到 Gist（首次）');
          return { success: true, restorableItems };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : '上传时发生未知错误';
          onError('上传失败', errorMsg);
          return { success: false, restorableItems };
        }
      }

      try {
        const uploadResult = await gistSyncService.uploadToGistIncremental(
          latestConfig,
          {
            appSettings: settingsStore.getAllSettings(),
            aiModels: aiModelsStore.models,
            coverHistory: coverHistoryStore.covers,
            novels: novelsWithContent,
            memoriesByBook,
          },
          remoteFilesSnapshot as Parameters<
            typeof gistSyncService.uploadToGistIncremental
          >[2],
          (progress) => {
            const uploadPhaseRange = OVERALL_TOTAL - UPLOAD_PHASE_START;
            const mapped =
              progress.total > 0
                ? UPLOAD_PHASE_START +
                  Math.round((progress.current / progress.total) * uploadPhaseRange)
                : UPLOAD_PHASE_START;
            settingsStore.updateSyncProgress({
              stage: 'uploading',
              current: mapped,
              total: OVERALL_TOTAL,
              message: prefixMsg(progress.message),
            });
          },
        );

        // 持久化新的远端状态
        try {
          await settingsStore.updateLastRemoteETag(uploadResult.remoteETag);
          await settingsStore.updateKnownRemoteHashes(manifestToHashes(uploadResult.manifest));
          await settingsStore.updateLastSyncTime();
          await settingsStore.cleanupOldDeletionRecords();
        } catch (error) {
          console.error('[useSyncExecutor] 更新同步状态失败:', error);
        }

        settingsStore.updateSyncProgress({
          stage: 'uploading',
          message: prefixMsg('同步完成'),
          current: OVERALL_TOTAL,
          total: OVERALL_TOTAL,
        });

        if (onSuccess) onSuccess('同步完成', '数据已同步到 Gist');
        return { success: true, restorableItems };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : '上传时发生未知错误';
        console.error('[useSyncExecutor] 上传失败:', errorMsg);
        onError('上传失败', errorMsg);
        return { success: false, restorableItems };
      }
    }

    // 超出重试预算
    onError('同步冲突', '其他设备正在频繁写入，请稍后再试');
    return { success: false, restorableItems };
  };

  return {
    executeSync,
  };
}
