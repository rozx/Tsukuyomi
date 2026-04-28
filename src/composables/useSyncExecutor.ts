import { GistSyncService } from 'src/services/gist-sync-service';
import { SyncDataService, type RestorableItem } from 'src/services/sync-data-service';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';
import { MemoryService } from 'src/services/memory-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { GlobalConfig } from 'src/services/global-config-cache';
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
import { MANIFEST_FILE_NAME, type GistManifest } from 'src/models/manifest';
import { readFile, type GistFileLike } from 'src/services/gist-sync-incremental';

/** downloadFromGistWithManifest 的非跳过分支（含 changedEntries/manifest 等字段） */
type DownloadResult = Awaited<ReturnType<GistSyncService['downloadFromGistWithManifest']>>;
type DownloadResultActive = Extract<DownloadResult, { skipped: false }>;

/** 类型守卫：把 DownloadResult 窄化为 active 分支 */
function isActiveDownload(r: DownloadResult | undefined): r is DownloadResultActive {
  return !!r && !r.skipped;
}

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

  const ensureSyncStoresInitialized = async (): Promise<void> => {
    await GlobalConfig.ensureInitialized({ ensureSettings: true, ensureBooks: true });

    if (!aiModelsStore.isLoaded && typeof aiModelsStore.loadModels === 'function') {
      await aiModelsStore.loadModels();
    }

    if (!coverHistoryStore.isLoaded && typeof coverHistoryStore.loadCoverHistory === 'function') {
      await coverHistoryStore.loadCoverHistory();
    }
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
   * 供 executeSync（阶段 3）和 executeForceSync 复用。
   *
   * 调用前会先 `cleanupOldDeletionRecords`：
   * 让本地 deleted*Ids 与下面构造的 `tombstones` 在同一时间锚点上完成 TTL 过滤，
   * 避免 builder 端的"再过滤"和上传后清理这两层窗口出现 1ms 级漂移。
   */
  const buildLocalSyncBundle = async (config: SyncConfig) => {
    // 先修剪本地 deleted*Ids；buildLocalManifest 会再做一次墓碑级过滤兜底。
    try {
      await settingsStore.cleanupOldDeletionRecords();
    } catch (error) {
      console.warn('[useSyncExecutor] 修剪过期删除记录失败，继续上传:', error);
    }
    // 修剪后重新读取最新 config（上面 await 期间 store 已更新）
    const freshConfig: SyncConfig = settingsStore.gistSync ?? config;
    const novelsLoaded = await ChapterContentService.loadAllChapterContentsForNovels(
      booksStore.books,
    );
    const rawMemoriesByBook = await collectMemoriesByBook();

    const novelsWithContent = novelsLoaded.map(stripNovelLocalFields);
    const memoriesByBook = normalizeMemoriesForSync(rawMemoriesByBook);
    const aiModelsForSync = sortAIModelsById(aiModelsStore.models);
    const coverHistoryForSync = sortCoversById(coverHistoryStore.covers);
    const appSettingsForSync = stripAppSettingsLocalFields(settingsStore.getAllSettings());

    // 合并 manifest 级墓碑（仅 collection 级：novel:<id> / memories:<id>）：
    // - 上次从远端拉取的墓碑快照（knownRemoteTombstones）
    // - 本地的 collection 级删除记录（deletedNovelIds + 整本书 memories 被清空的 deletedMemoryCollections）
    // 过期墓碑（>= TTL）由 buildLocalManifest 兜底再过滤一次
    const tombstones: Record<string, string> = {};
    for (const [k, ds] of Object.entries(freshConfig.knownRemoteTombstones ?? {})) {
      tombstones[k] = ds;
    }
    for (const record of freshConfig.deletedNovelIds ?? []) {
      const key = `novel:${record.id}`;
      const existing = tombstones[key];
      const existingMs = existing ? new Date(existing).getTime() : 0;
      if (!existing || record.deletedAt > existingMs) {
        tombstones[key] = new Date(record.deletedAt).toISOString();
      }
    }

    // 单条 memory 的删除：按 bookId 归集为 envelope 的 tombstones 字段
    // （collection 级的整本删除走上面的 manifest tombstones 通道）
    // 旧记录可能没有 bookId（升级前写入），跳过 envelope 注入但仍参与 TTL 修剪。
    const memoryTombstonesByBook: Record<string, Array<{ id: string; deletedAt: number }>> = {};
    for (const record of freshConfig.deletedMemoryIds ?? []) {
      if (!record.bookId) continue;
      const list =
        memoryTombstonesByBook[record.bookId] ?? (memoryTombstonesByBook[record.bookId] = []);
      list.push({ id: record.id, deletedAt: record.deletedAt });
    }

    const localManifest = await buildLocalManifest({
      appSettings: appSettingsForSync,
      aiModels: aiModelsForSync,
      coverHistory: coverHistoryForSync,
      novels: novelsWithContent,
      memoriesByBook,
      memoryTombstonesByBook,
      tombstones,
    });

    return {
      localManifest,
      appSettingsForSync,
      aiModelsForSync,
      coverHistoryForSync,
      novelsWithContent,
      memoriesByBook,
      memoryTombstonesByBook,
      tombstones,
    };
  };

  /**
   * 构建下载阶段的进度回调：把 downloadResult 的 0-100% 映射到整体的 downloading 区段
   */
  const makeDownloadProgressHandler = (prefixMsg: (m: string) => string) => {
    return (progress: { current: number; total: number; message: string }) => {
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
  };

  /**
   * 构建上传阶段的进度回调：把 uploadResult 的 0-100% 映射到整体的 uploading 区段
   */
  const makeUploadProgressHandler = (prefixMsg: (m: string) => string) => {
    return (progress: { current: number; total: number; message: string }) => {
      const uploadPhaseRange = OVERALL_TOTAL - UPLOAD_PHASE_START;
      const mapped =
        progress.total > 0
          ? UPLOAD_PHASE_START + Math.round((progress.current / progress.total) * uploadPhaseRange)
          : UPLOAD_PHASE_START;
      settingsStore.updateSyncProgress({
        stage: 'uploading',
        current: mapped,
        total: OVERALL_TOTAL,
        message: prefixMsg(progress.message),
      });
    };
  };

  /**
   * 阶段 1：下载远端数据（带 manifest）。失败返回错误（执行器退出）；成功返回 downloadResult。
   * 无 gistId 时返回 undefined（首次同步）。
   */
  const runDownloadPhase = async (
    config: SyncConfig,
    prefixMsg: (m: string) => string,
    onError: SyncExecutorOptions['onError'],
  ): Promise<
    | {
        ok: true;
        result:
          | Awaited<ReturnType<typeof gistSyncService.downloadFromGistWithManifest>>
          | undefined;
      }
    | { ok: false }
  > => {
    settingsStore.updateSyncProgress({
      stage: 'downloading',
      message: prefixMsg('正在检查远程变更...'),
      current: 0,
      total: OVERALL_TOTAL,
    });

    if (!config.syncParams.gistId) {
      return { ok: true, result: undefined };
    }

    try {
      const result = await gistSyncService.downloadFromGistWithManifest(
        config,
        makeDownloadProgressHandler(prefixMsg),
      );
      return { ok: true, result };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '下载时发生未知错误';
      console.error('[useSyncExecutor] 同步下载失败:', errorMsg);
      onError('下载失败', errorMsg);
      return { ok: false };
    }
  };

  /**
   * 一次性迁移路径：远端无 manifest 时走 legacy 下载+合并，随后清空 known 状态让后续常规上传产出新布局
   */
  const runLegacyMigration = async (
    config: SyncConfig,
    downloadResult: DownloadResultActive,
    prefixMsg: (m: string) => string,
    options: SyncExecutorOptions,
    restorableItems: RestorableItem[],
  ): Promise<boolean> => {
    const { onError } = options;
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
      return false;
    }

    if (!legacyDownload.success) {
      const errorMsg = legacyDownload.error || '旧布局下载失败';
      onError('迁移失败', `${errorMsg}（本地数据未改动，下次同步将重试）`);
      return false;
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
        return false;
      }
    }

    // 清空 knownRemoteHashes/Entries，使后续 uploadToGistIncremental 将所有条目视为新增
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
    return true;
  };

  /**
   * 阶段 2：应用 changedEntries 并持久化已知远端状态。失败时调用 onError 并返回 false。
   */
  const runApplyPhase = async (
    downloadResult: DownloadResultActive,
    prefixMsg: (m: string) => string,
    onError: SyncExecutorOptions['onError'],
  ): Promise<boolean> => {
    settingsStore.updateSyncProgress({
      stage: 'applying',
      message: prefixMsg('正在应用下载的数据...'),
      current: DOWNLOAD_PHASE_MAX,
      total: OVERALL_TOTAL,
    });

    try {
      await SyncDataService.applyPartialRemoteData(downloadResult.changedEntries);
      if (downloadResult.deletedEntries.length > 0) {
        await SyncDataService.applyRemoteDeletions(downloadResult.deletedEntries);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '应用远程数据时发生未知错误';
      console.error('[useSyncExecutor] 应用失败:', errorMsg);
      onError('应用失败', errorMsg);
      return false;
    }

    // 更新本地持久化的已知远端状态——每步独立 try/catch，单步失败不回滚前序持久化
    if (downloadResult.manifest) {
      try {
        await settingsStore.updateKnownRemoteHashes(manifestToHashes(downloadResult.manifest));
        await settingsStore.updateKnownRemoteEntries(manifestToEntries(downloadResult.manifest));
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
    return true;
  };

  /**
   * 诊断日志：打印哪些 entry 触发了上传（local hash vs known hash 差异）
   */
  const logUploadDiffs = (
    localHashes: Record<string, string>,
    knownHashes: Record<string, string>,
  ): void => {
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
  };

  /**
   * 从 verify 返回的 gist files 中提取 manifest.json 并计算其 hashes。
   * 用于伪 CAS 内容相等性兜底：ETag 抖动（GitHub 后端漂移、description 写入、
   * 用户在 web UI 编辑非 manifest 文件等）会让 verify 误报 'changed'，但若远端
   * manifest 跟踪的内容未变，应当视为 unchanged。
   *
   * 失败（缺文件 / 截断且无 raw_url / 解析异常）一律返回 null —— 落回常规重试路径。
   */
  const tryReadRemoteManifestHashes = async (
    files: Record<string, unknown> | undefined,
  ): Promise<Record<string, string> | null> => {
    if (!files) return null;
    try {
      const content = await readFile(
        MANIFEST_FILE_NAME,
        files as Record<string, GistFileLike>,
        async (url) => {
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          return resp.text();
        },
      );
      if (!content) return null;
      return manifestToHashes(JSON.parse(content) as GistManifest);
    } catch {
      return null;
    }
  };

  /** 浅比较两组 entryKey -> hash 是否完全一致。 */
  const hashesEqual = (a: Record<string, string>, b: Record<string, string>): boolean => {
    const ak = Object.keys(a);
    if (ak.length !== Object.keys(b).length) return false;
    return ak.every((k) => a[k] === b[k]);
  };

  /**
   * 伪 CAS 预检：若远端自上次已知 ETag 之后发生变化，返回 'conflict'（重试）或 'abort'（退出）；
   * 未变化返回 'unchanged'；失败返回 'error'。
   *
   * 当 verify 报 'changed' 时，先用远端 manifest 的 hashes 与 `knownRemoteHashes` 做内容相等性兜底：
   * 一致则视为 'unchanged'，避免单设备场景下的 ETag 抖动误报"其他设备正在频繁写入"。
   */
  const runPseudoCasCheck = async (
    latestConfig: SyncConfig,
    prefixMsg: (m: string) => string,
    onError: SyncExecutorOptions['onError'],
    retriesRemaining: number,
  ): Promise<
    | { status: 'unchanged' }
    | { status: 'retry'; files: Record<string, unknown> }
    | { status: 'abort' }
  > => {
    settingsStore.updateSyncProgress({
      stage: 'uploading',
      message: prefixMsg('正在检查远程并发写入...'),
      current: UPLOAD_PHASE_START,
      total: OVERALL_TOTAL,
    });

    if (!latestConfig.syncParams.gistId || !latestConfig.lastRemoteETag) {
      return { status: 'unchanged' };
    }

    try {
      const verify = await gistSyncService.verifyRemoteUnchanged(latestConfig);
      if (verify.status === 'unchanged') return { status: 'unchanged' };

      // ETag 报"changed"，先尝试基于 manifest 内容判定是否真的有冲突
      const remoteHashes = await tryReadRemoteManifestHashes(verify.files);
      const knownHashes = latestConfig.knownRemoteHashes ?? {};
      if (remoteHashes && hashesEqual(remoteHashes, knownHashes)) {
        console.info(
          '[useSyncExecutor] 伪 CAS：ETag 漂移但远端 manifest 内容未变，视为 unchanged',
        );
        return { status: 'unchanged' };
      }

      // 真冲突
      if (retriesRemaining > 0) {
        console.info(
          `[useSyncExecutor] 伪 CAS 检测到并发写入，重试中（剩余 ${retriesRemaining} 次）`,
        );
        return { status: 'retry', files: verify.files };
      }
      onError('同步冲突', '其他设备正在频繁写入，请稍后再试');
      return { status: 'abort' };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '伪 CAS 检查失败';
      console.error('[useSyncExecutor] 伪 CAS 失败:', errorMsg);
      onError('同步失败', errorMsg);
      return { status: 'abort' };
    }
  };

  /**
   * 首次同步：无 gistId，走 legacy `uploadToGist` 完成 Gist 创建；
   * 下一轮同步自然会走增量路径
   */
  const runFirstTimeUpload = async (
    latestConfig: SyncConfig,
    prefixMsg: (m: string) => string,
    options: SyncExecutorOptions,
    restorableItems: RestorableItem[],
  ): Promise<SyncExecutorResult> => {
    const { onError, onSuccess } = options;
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
      await settingsStore.updateLastSyncTime();
      if (onSuccess) onSuccess('同步完成', '数据已同步到 Gist（首次）');
      return { success: true, restorableItems };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '上传时发生未知错误';
      onError('上传失败', errorMsg);
      return { success: false, restorableItems };
    }
  };

  /**
   * 上传成功后持久化新的远端状态（ETag / hashes / entries / tombstones / lastSyncTime）。
   * 整块独立 try/catch：持久化失败不应影响"上传已成功"的返回值。
   */
  const persistUploadState = async (
    uploadResult: Awaited<ReturnType<typeof gistSyncService.uploadToGistIncremental>>,
  ): Promise<void> => {
    try {
      await settingsStore.updateLastRemoteETag(uploadResult.remoteETag);
      await settingsStore.updateKnownRemoteHashes(manifestToHashes(uploadResult.manifest));
      await settingsStore.updateKnownRemoteEntries(manifestToEntries(uploadResult.manifest));
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
  };

  /**
   * 阶段 4：增量上传到已存在 Gist，并持久化新的远端状态
   */
  const runIncrementalUpload = async (
    latestConfig: SyncConfig,
    bundle: Awaited<ReturnType<typeof buildLocalSyncBundle>>,
    remoteFilesSnapshot: Record<string, unknown>,
    prefixMsg: (m: string) => string,
    options: SyncExecutorOptions,
    restorableItems: RestorableItem[],
  ): Promise<SyncExecutorResult> => {
    const { onError, onSuccess } = options;
    try {
      const uploadResult = await gistSyncService.uploadToGistIncremental(
        latestConfig,
        {
          appSettings: bundle.appSettingsForSync,
          aiModels: bundle.aiModelsForSync,
          coverHistory: bundle.coverHistoryForSync,
          novels: bundle.novelsWithContent,
          memoriesByBook: bundle.memoriesByBook,
          memoryTombstonesByBook: bundle.memoryTombstonesByBook,
          tombstones: bundle.tombstones,
        },
        remoteFilesSnapshot as Parameters<typeof gistSyncService.uploadToGistIncremental>[2],
        makeUploadProgressHandler(prefixMsg),
      );

      await persistUploadState(uploadResult);

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
  };

  /**
   * 无需上传分支：仅更新 lastSyncTime、清理过期墓碑，并报告成功
   */
  const finalizeNoUploadNeeded = async (
    prefixMsg: (m: string) => string,
    onSuccess: SyncExecutorOptions['onSuccess'],
    restorableItems: RestorableItem[],
  ): Promise<SyncExecutorResult> => {
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
  };

  /**
   * 单轮同步迭代：执行阶段 1-4。
   * 返回 'retry' 表示伪 CAS 检测到并发写入需要重启循环；否则返回最终结果。
   */
  const runSyncIteration = async (
    options: SyncExecutorOptions,
    prefixMsg: (m: string) => string,
    restorableItems: RestorableItem[],
    retriesRemaining: number,
  ): Promise<SyncExecutorResult | { retry: true }> => {
    const { onError, onSuccess, configOverride } = options;
    await ensureSyncStoresInitialized();
    const config = configOverride ?? settingsStore.gistSync;

    // ── 阶段 1：条件下载 + 解析 manifest ──
    const downloadOutcome = await runDownloadPhase(config, prefixMsg, onError);
    if (!downloadOutcome.ok) return { success: false, restorableItems: [] };
    const downloadResult = downloadOutcome.result;
    const activeDownload: DownloadResultActive | undefined = isActiveDownload(downloadResult)
      ? downloadResult
      : undefined;

    if (activeDownload?.schemaVersionTooNew) {
      onError('同步中止', '远程数据由较新版本的应用写入，请升级客户端后再同步');
      return { success: false, restorableItems: [] };
    }

    if (activeDownload?.needsMigration) {
      const migrated = await runLegacyMigration(
        config,
        activeDownload,
        prefixMsg,
        options,
        restorableItems,
      );
      if (!migrated) return { success: false, restorableItems: [] };
    }

    // ── 阶段 2：应用 changedEntries ──
    if (activeDownload) {
      const applied = await runApplyPhase(activeDownload, prefixMsg, onError);
      if (!applied) return { success: false, restorableItems: [] };
    }

    // ── 阶段 3：计算本地 manifest，判断是否需要上传 ──
    const latestConfig = configOverride ?? settingsStore.gistSync;
    const bundle = await buildLocalSyncBundle(latestConfig);
    const knownHashes = latestConfig.knownRemoteHashes ?? {};
    const localHashes = manifestToHashes(bundle.localManifest);
    const shouldUpload = SyncDataService.hasLocalChangesByHash(localHashes, knownHashes);

    if (!shouldUpload) return finalizeNoUploadNeeded(prefixMsg, onSuccess, restorableItems);
    logUploadDiffs(localHashes, knownHashes);

    // ── 阶段 4：伪 CAS 预检 + 增量上传 ──
    // 迁移路径已从 downloadResult 中取到真实文件列表，直接沿用避免再 GET 一次
    const remoteFilesSnapshot: Record<string, unknown> = activeDownload
      ? (activeDownload.remoteFilesSnapshot ?? {})
      : {};
    const casResult = await runPseudoCasCheck(latestConfig, prefixMsg, onError, retriesRemaining);
    if (casResult.status === 'abort') return { success: false, restorableItems };
    if (casResult.status === 'retry') {
      // 伪 CAS 检测到并发写入——重启循环（外层 while 会重新下载）
      return { retry: true };
    }

    settingsStore.updateSyncProgress({
      stage: 'uploading',
      message: prefixMsg(`正在上传数据 (${booksStore.books.length} 本书籍)...`),
      current: UPLOAD_PHASE_START,
      total: OVERALL_TOTAL,
    });

    if (!latestConfig.syncParams.gistId) {
      return runFirstTimeUpload(latestConfig, prefixMsg, options, restorableItems);
    }

    return runIncrementalUpload(
      latestConfig,
      bundle,
      remoteFilesSnapshot,
      prefixMsg,
      options,
      restorableItems,
    );
  };

  const executeSync = async (options: SyncExecutorOptions): Promise<SyncExecutorResult> => {
    const { messagePrefix, onError } = options;
    const prefixMsg = (msg: string) => (messagePrefix ? `${messagePrefix}${msg}` : msg);

    const restorableItems: RestorableItem[] = [];
    let retriesRemaining = MAX_CONCURRENT_WRITE_RETRIES;

    while (retriesRemaining > 0) {
      retriesRemaining -= 1;
      const outcome = await runSyncIteration(options, prefixMsg, restorableItems, retriesRemaining);
      if ('retry' in outcome) continue; // 伪 CAS 触发重试
      return outcome;
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
  const executeForceSync = async (options: SyncExecutorOptions): Promise<SyncExecutorResult> => {
    const { messagePrefix, onError, onSuccess, configOverride } = options;
    const prefixMsg = (msg: string) => (messagePrefix ? `${messagePrefix}${msg}` : msg);
    await ensureSyncStoresInitialized();
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
        onSuccess('同步完成', '未检测到远程 Gist，已按普通同步处理');
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
      memoryTombstonesByBook,
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
      const uploadResult = await gistSyncService.uploadToGistIncremental(
        effectiveConfig,
        {
          appSettings: appSettingsForSync,
          aiModels: aiModelsForSync,
          coverHistory: coverHistoryForSync,
          novels: novelsWithContent,
          memoriesByBook,
          memoryTombstonesByBook,
          tombstones,
        },
        remoteFilesSnapshot as Parameters<typeof gistSyncService.uploadToGistIncremental>[2],
        makeUploadProgressHandler(prefixMsg),
      );

      // 持久化新的远端状态（失败不影响推送成功判定）
      await persistUploadState(uploadResult);

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
