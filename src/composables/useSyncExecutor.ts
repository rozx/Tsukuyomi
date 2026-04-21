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
  manifestToEntries,
  manifestToHashes,
} from 'src/services/sync-manifest-builder';
import {
  normalizeMemoriesForSync,
  sortAIModelsById,
  sortCoversById,
  stripAppSettingsLocalFields,
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
   * 下载阶段进度回调工厂：把 0..progress.total 线性映射到 [0, DOWNLOAD_PHASE_MAX]。
   * executeSync / executeForceSync 都把该回调传进 downloadFromGistWithManifest。
   */
  const makeDownloadProgressHandler =
    (prefixMsg: (msg: string) => string) =>
    (progress: { current: number; total: number; message: string }): void => {
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
    };

  /**
   * 上传阶段进度回调工厂：把 0..progress.total 线性映射到 [UPLOAD_PHASE_START, OVERALL_TOTAL]。
   * uploadIncrementalAndPersist 和首次 legacy 上传共用同一个映射策略。
   */
  const makeUploadProgressHandler =
    (prefixMsg: (msg: string) => string) =>
    (progress: { current: number; total: number; message: string }): void => {
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
    };

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

  /**
   * 从本地 stores 构建同步上传所需的完整 bundle（manifest + 规范化的各 payload + 合并墓碑）
   * 供 executeSync（阶段 3）和 executeForceSync 复用
   */
  const buildLocalSyncBundle = async (config: SyncConfig) => {
    const novelsLoaded = await ChapterContentService.loadAllChapterContentsForNovels(
      booksStore.books,
    );
    const rawMemoriesByBook = await collectMemoriesByBook();

    const novelsWithContent = novelsLoaded.map(stripNovelLocalFields);
    const memoriesByBook = normalizeMemoriesForSync(rawMemoriesByBook);
    const aiModelsForSync = sortAIModelsById(aiModelsStore.models);
    const coverHistoryForSync = sortCoversById(coverHistoryStore.covers);
    const appSettingsForSync = stripAppSettingsLocalFields(settingsStore.getAllSettings());

    // 合并墓碑：本地删除记录 (deletedNovelIds) + 上次从远端拉取的墓碑快照
    // 过期墓碑（> 30 天）会在 buildLocalManifest 中被过滤
    const tombstones: Record<string, string> = {};
    for (const [k, ds] of Object.entries(config.knownRemoteTombstones ?? {})) {
      tombstones[k] = ds;
    }
    for (const record of config.deletedNovelIds ?? []) {
      const key = `novel:${record.id}`;
      const existing = tombstones[key];
      const existingMs = existing ? new Date(existing).getTime() : 0;
      if (!existing || record.deletedAt > existingMs) {
        tombstones[key] = new Date(record.deletedAt).toISOString();
      }
    }

    const localManifest = await buildLocalManifest({
      appSettings: appSettingsForSync,
      aiModels: aiModelsForSync,
      coverHistory: coverHistoryForSync,
      novels: novelsWithContent,
      memoriesByBook,
      tombstones,
    });

    return {
      localManifest,
      appSettingsForSync,
      aiModelsForSync,
      coverHistoryForSync,
      novelsWithContent,
      memoriesByBook,
      tombstones,
    };
  };

  /**
   * 执行增量上传并持久化远端同步状态。
   *
   * 本 helper 只封装两处上传点的严格共性：
   *   1. 调用 `uploadToGistIncremental`，按 UPLOAD_PHASE_START → OVERALL_TOTAL 线性映射上传进度
   *   2. 按固定顺序持久化 lastRemoteETag / knownRemoteHashes / knownRemoteEntries /
   *      knownRemoteTombstones / lastSyncTime，并清理过期墓碑
   *
   * 与上层方向相关的差异（首次上传 vs 增量上传、是否清空 known、onSuccess/forceSyncMode
   * 收尾、markFailure 等）均在调用点处理，不纳入 helper。持久化失败按原行为仅打印日志、
   * 不抛出——上层据此仍视为上传成功。
   */
  const uploadIncrementalAndPersist = async (
    config: SyncConfig,
    bundle: {
      appSettingsForSync: ReturnType<typeof stripAppSettingsLocalFields>;
      aiModelsForSync: ReturnType<typeof sortAIModelsById>;
      coverHistoryForSync: ReturnType<typeof sortCoversById>;
      novelsWithContent: Awaited<ReturnType<typeof buildLocalSyncBundle>>['novelsWithContent'];
      memoriesByBook: Record<string, Memory[]>;
      tombstones: Record<string, string>;
    },
    remoteFilesSnapshot: Record<string, unknown>,
    prefixMsg: (msg: string) => string,
  ) => {
    const uploadResult = await gistSyncService.uploadToGistIncremental(
      config,
      {
        appSettings: bundle.appSettingsForSync,
        aiModels: bundle.aiModelsForSync,
        coverHistory: bundle.coverHistoryForSync,
        novels: bundle.novelsWithContent,
        memoriesByBook: bundle.memoriesByBook,
        tombstones: bundle.tombstones,
      },
      remoteFilesSnapshot as Parameters<
        typeof gistSyncService.uploadToGistIncremental
      >[2],
      makeUploadProgressHandler(prefixMsg),
    );

    // 持久化新的远端状态（失败不影响上传成功判定，仅打印日志）
    try {
      await settingsStore.updateLastRemoteETag(uploadResult.remoteETag);
      await settingsStore.updateKnownRemoteHashes(manifestToHashes(uploadResult.manifest));
      await settingsStore.updateKnownRemoteEntries(manifestToEntries(uploadResult.manifest));
      // 同步上传后的 manifest.tombstones 回 knownRemoteTombstones，供下次上传合并
      const uploadedTombstones: Record<string, string> = {};
      for (const [k, v] of Object.entries(uploadResult.manifest.tombstones ?? {})) {
        uploadedTombstones[k] = v.deletedAt;
      }
      await settingsStore.updateKnownRemoteTombstones(uploadedTombstones);
      await settingsStore.updateLastSyncTime();
      await settingsStore.cleanupOldDeletionRecords();
    } catch (error) {
      console.error('[useSyncExecutor] 更新同步状态失败:', error);
    }

    return uploadResult;
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
            makeDownloadProgressHandler(prefixMsg),
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
          await settingsStore.updateKnownRemoteEntries({});
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
          // 处理远端删除：remote manifest 中不再存在的条目（曾经在 knownRemote 中）
          // 本地若未修改，传播该删除；若有未同步的本地编辑，保留本地
          if (downloadResult.deletedEntries.length > 0) {
            await SyncDataService.applyRemoteDeletions(downloadResult.deletedEntries);
          }
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
            await settingsStore.updateKnownRemoteEntries(
              manifestToEntries(downloadResult.manifest),
            );
          } catch (error) {
            console.error('[useSyncExecutor] 保存 knownRemoteHashes 失败:', error);
          }
        }
        try {
          await settingsStore.updateKnownRemoteTombstones(downloadResult.remoteTombstones);
        } catch (error) {
          console.error('[useSyncExecutor] 保存 knownRemoteTombstones 失败:', error);
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
      const latestConfig = configOverride ?? settingsStore.gistSync;
      const bundle = await buildLocalSyncBundle(latestConfig);
      const {
        localManifest,
        appSettingsForSync,
        aiModelsForSync,
        coverHistoryForSync,
        novelsWithContent,
        memoriesByBook,
        tombstones,
      } = bundle;

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
      // 迁移路径已在阶段 1 从 downloadResult 中取到真实文件列表，直接沿用避免再 GET 一次
      let remoteFilesSnapshot: Record<string, unknown> =
        downloadResult && !downloadResult.skipped
          ? (downloadResult.remoteFilesSnapshot ?? {})
          : {};
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
            makeUploadProgressHandler(prefixMsg),
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
        await uploadIncrementalAndPersist(
          latestConfig,
          {
            appSettingsForSync,
            aiModelsForSync,
            coverHistoryForSync,
            novelsWithContent,
            memoriesByBook,
            tombstones,
          },
          remoteFilesSnapshot,
          prefixMsg,
        );

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

  /**
   * 强制推送：本地覆盖远端（严格镜像）
   *
   * 与 executeSync 的差异：
   *   - 不 apply 远端数据到本地（仅取 remoteFilesSnapshot）
   *   - 不做 pseudo-CAS（用户已显式选择覆盖）
   *   - 清空内存中的 knownRemoteHashes/Entries，使 uploadToGistIncremental 将所有本地条目
   *     视为"新增/修改"；远端独有的条目（不在本地 manifest 中）会被 PATCH 删除，实现严格镜像
   *   - 成功后自动关闭 forceSyncMode；失败后保留 active=true 并写入 lastFailedAt
   *
   * 首次同步（无 gistId）会被判定为"无可覆盖远端"，退化为 executeSync 首次上传路径，
   * 并强制重置 forceSyncMode。
   */
  const executeForceSync = async (
    options: SyncExecutorOptions,
  ): Promise<SyncExecutorResult> => {
    const { messagePrefix, onError, onSuccess, configOverride } = options;
    const prefixMsg = (msg: string) => (messagePrefix ? `${messagePrefix}${msg}` : msg);
    const config = configOverride ?? settingsStore.gistSync;

    const markFailure = async () => {
      try {
        await settingsStore.updateForceSyncMode({ active: true, lastFailedAt: Date.now() });
      } catch (e) {
        console.error('[useSyncExecutor] 写入 forceSyncMode 失败状态出错:', e);
      }
    };

    // 首次同步（无 gistId）——没有远端可覆盖，走普通首次上传
    if (!config.syncParams.gistId) {
      const fallback = await executeSync(options);
      try {
        await settingsStore.updateForceSyncMode({ active: false });
      } catch (e) {
        console.error('[useSyncExecutor] 重置 forceSyncMode 失败:', e);
      }
      if (fallback.success && onSuccess) {
        onSuccess(
          '同步完成',
          '未检测到远程 Gist，已按普通同步处理',
        );
      }
      return fallback;
    }

    // ── 阶段 1：获取远端文件清单（不 apply）──
    settingsStore.updateSyncProgress({
      stage: 'downloading',
      message: prefixMsg('正在获取远程文件清单...'),
      current: 0,
      total: OVERALL_TOTAL,
    });

    let remoteFilesSnapshot: Record<string, unknown> = {};
    let remoteETag = '';
    try {
      // 绕过 If-None-Match：强制推送时总是需要最新的远端文件清单用于删除对比
      const { lastRemoteETag: _discarded, ...configWithoutETag } = config;
      void _discarded;
      const forceFetchConfig: SyncConfig = configWithoutETag;
      const downloadResult = await gistSyncService.downloadFromGistWithManifest(
        forceFetchConfig,
        makeDownloadProgressHandler(prefixMsg),
      );
      if (downloadResult.skipped) {
        // 绕过 ETag 后理论上不会走 304；保底兜底：没拿到 snapshot 直接上传所有本地条目
        remoteFilesSnapshot = {};
        remoteETag = config.lastRemoteETag ?? '';
      } else {
        remoteFilesSnapshot = downloadResult.remoteFilesSnapshot ?? {};
        remoteETag = downloadResult.remoteETag ?? '';
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '获取远端文件清单失败';
      console.error('[useSyncExecutor] 强制推送 阶段 1 失败:', errorMsg);
      await markFailure();
      onError('强制推送失败', errorMsg);
      return { success: false, restorableItems: [] };
    }

    // ── 阶段 2：构建本地 bundle ──
    settingsStore.updateSyncProgress({
      stage: 'applying',
      message: prefixMsg('正在准备本地数据...'),
      current: DOWNLOAD_PHASE_MAX,
      total: OVERALL_TOTAL,
    });

    const bundle = await buildLocalSyncBundle(config);
    const {
      appSettingsForSync,
      aiModelsForSync,
      coverHistoryForSync,
      novelsWithContent,
      memoriesByBook,
      tombstones,
    } = bundle;

    // ── 阶段 3：上传（清空 known 状态，跳过 pseudo-CAS）──
    settingsStore.updateSyncProgress({
      stage: 'uploading',
      message: prefixMsg(`正在强制推送到远程 (${booksStore.books.length} 本书籍)...`),
      current: UPLOAD_PHASE_START,
      total: OVERALL_TOTAL,
    });

    // 构造 effectiveConfig：清空 knownRemoteHashes/Entries，让 uploadToGistIncremental
    // 将所有本地 manifest 条目视为新增/修改，远端独有条目视为需删除
    const effectiveConfig: SyncConfig = {
      ...config,
      knownRemoteHashes: {},
      knownRemoteEntries: {},
    };

    try {
      await uploadIncrementalAndPersist(
        effectiveConfig,
        {
          appSettingsForSync,
          aiModelsForSync,
          coverHistoryForSync,
          novelsWithContent,
          memoriesByBook,
          tombstones,
        },
        remoteFilesSnapshot,
        prefixMsg,
      );

      // 关闭强制模式 —— 即使上面的状态持久化失败，推送本身已经成功，不应把用户困在强制模式里
      try {
        await settingsStore.updateForceSyncMode({ active: false });
      } catch (error) {
        console.error('[useSyncExecutor] 重置 forceSyncMode 失败:', error);
      }

      settingsStore.updateSyncProgress({
        stage: 'uploading',
        message: prefixMsg('强制推送完成'),
        current: OVERALL_TOTAL,
        total: OVERALL_TOTAL,
      });

      if (onSuccess) onSuccess('强制推送完成', '本地数据已覆盖远端');
      // 避免未使用变量警告：remoteETag 仅作日志留痕
      if (remoteETag) {
        console.info('[useSyncExecutor] 强制推送替换 ETag:', remoteETag);
      }
      return { success: true, restorableItems: [] };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '上传时发生未知错误';
      console.error('[useSyncExecutor] 强制推送上传失败:', errorMsg);
      await markFailure();
      onError('强制推送失败', errorMsg);
      return { success: false, restorableItems: [] };
    }
  };

  return {
    executeSync,
    executeForceSync,
  };
}
