import { describe, expect, it, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import './setup';

import { useGistSync } from '../composables/useGistUploadWithConflictCheck';
import { GistSyncService } from '../services/gist-sync-service';
import { SyncDataService } from '../services/sync-data-service';
import { MemoryService } from '../services/memory-service';
import * as SettingsStore from '../stores/settings';
import * as BooksStore from '../stores/books';
import * as AIModelsStore from '../stores/ai-models';
import * as CoverHistoryStore from '../stores/cover-history';
import * as ToastHistory from '../composables/useToastHistory';
import type { SyncConfig } from '../models/sync';
import { SyncType } from '../models/sync';

// ── Mock 工具函数 ──────────────────────────────────────────────────

const mockToastAdd = mock(() => {});

/** 创建 mock 远程数据（使用 as any 绕过严格类型） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockRemoteData(overrides: Record<string, any> = {}): any {
  return {
    novels: [],
    aiModels: [],
    appSettings: {},
    coverHistory: [],
    memories: [],
    ...overrides,
  };
}

/** 创建一个带默认值的 settings store mock */
function createMockSettingsStore(overrides: Record<string, unknown> = {}) {
  return {
    isSyncing: false,
    gistSync: createSyncConfig(),
    setSyncing: mock(() => {}),
    updateSyncProgress: mock(() => {}),
    resetSyncProgress: mock(() => {}),
    setGistId: mock(() => Promise.resolve()),
    updateLastSyncTime: mock(() => Promise.resolve()),
    updateLastSyncedModelIds: mock(() => Promise.resolve()),
    updateLastRemoteUpdatedAt: mock(() => Promise.resolve()),
    cleanupOldDeletionRecords: mock(() => Promise.resolve()),
    getAllSettings: mock(() => ({ theme: 'dark' })),
    updateGistSync: mock(() => Promise.resolve()),
    ...overrides,
  };
}

function createSyncConfig(overrides: Partial<SyncConfig> = {}): SyncConfig {
  return {
    enabled: true,
    lastSyncTime: 1000,
    syncInterval: 300000,
    syncType: SyncType.Gist,
    syncParams: { gistId: 'test-gist-id', token: 'test-token' },
    secret: 'test-secret',
    apiEndpoint: '',
    ...overrides,
  };
}

function createSyncConfigWithoutGistId(): SyncConfig {
  return createSyncConfig({ syncParams: { token: 'test-token' } });
}

/** 创建成功下载的 mock 返回值 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockDownloadSuccess(data: any = createMockRemoteData()) {
  return { success: true, data } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** 创建成功上传的 mock 返回值 */
function mockUploadSuccess(gistId = 'test-gist-id') {
  return { success: true, gistId } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ── 测试 ──────────────────────────────────────────────────────────

describe('useGistSync', () => {
  let mockSettingsStore: ReturnType<typeof createMockSettingsStore>;

  beforeEach(() => {
    mockToastAdd.mockClear();

    mockSettingsStore = createMockSettingsStore();

    spyOn(SettingsStore, 'useSettingsStore').mockReturnValue(mockSettingsStore as any);
    spyOn(BooksStore, 'useBooksStore').mockReturnValue({
      books: [{ id: 'book-1' }, { id: 'book-2' }],
      addBook: mock(() => Promise.resolve()),
    } as any);
    spyOn(AIModelsStore, 'useAIModelsStore').mockReturnValue({
      models: [{ id: 'model-1' }],
      addModel: mock(() => Promise.resolve()),
    } as any);
    spyOn(CoverHistoryStore, 'useCoverHistoryStore').mockReturnValue({
      covers: [{ id: 'cover-1', url: 'http://example.com/cover.jpg' }],
      addCover: mock(() => Promise.resolve()),
    } as any);
    spyOn(ToastHistory, 'useToastWithHistory').mockReturnValue({ add: mockToastAdd } as any);
  });

  afterEach(() => {
    mock.restore();
  });

  // ── sync() 测试 ──────────────────────────────────────────────

  describe('sync()', () => {
    it('正常双向同步：下载成功 → 有变更 → 上传成功', async () => {
      const remoteData = createMockRemoteData({ novels: [{ id: 'remote-book' }] });

      const downloadSpy = spyOn(GistSyncService.prototype, 'downloadFromGist').mockResolvedValue(
        mockDownloadSuccess(remoteData),
      );
      const applySpy = spyOn(SyncDataService, 'applyDownloadedData').mockResolvedValue([]);
      const hasChangesSpy = spyOn(SyncDataService, 'hasChangesToUpload').mockReturnValue(true);
      spyOn(MemoryService, 'getAllMemoriesForBooksFlat').mockResolvedValue([]);
      const uploadSpy = spyOn(GistSyncService.prototype, 'uploadToGist').mockResolvedValue(
        mockUploadSuccess(),
      );

      const { sync } = useGistSync();
      const result = await sync();

      // 验证流程完整执行
      expect(downloadSpy).toHaveBeenCalledTimes(1);
      expect(applySpy).toHaveBeenCalledWith(remoteData, undefined, true);
      expect(hasChangesSpy).toHaveBeenCalledTimes(1);
      expect(uploadSpy).toHaveBeenCalledTimes(1);

      // 验证 setSyncing 状态管理
      expect(mockSettingsStore.setSyncing).toHaveBeenCalledWith(true);
      expect(mockSettingsStore.setSyncing).toHaveBeenCalledWith(false);

      // 验证成功 toast
      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'success', summary: '同步完成' }),
      );

      expect(result).toEqual([]);
    });

    it('首次同步（无 gistId）：跳过下载，与空远程数据比较，有数据则上传', async () => {
      mockSettingsStore.gistSync = createSyncConfigWithoutGistId();

      const applySpy = spyOn(SyncDataService, 'applyDownloadedData').mockResolvedValue([]);
      const hasChangesSpy = spyOn(SyncDataService, 'hasChangesToUpload').mockReturnValue(true);
      spyOn(MemoryService, 'getAllMemoriesForBooksFlat').mockResolvedValue([]);
      const uploadSpy = spyOn(GistSyncService.prototype, 'uploadToGist').mockResolvedValue(
        mockUploadSuccess('new-gist-id'),
      );

      const { sync } = useGistSync();
      const result = await sync();

      // applyDownloadedData 不应被调用（因为没有远程数据）
      expect(applySpy).not.toHaveBeenCalled();

      // hasChangesToUpload 应使用空远程数据比较
      expect(hasChangesSpy).toHaveBeenCalledWith(
        expect.objectContaining({ novels: expect.any(Array) }),
        expect.objectContaining({
          novels: [],
          aiModels: [],
          appSettings: {},
          coverHistory: [],
          memories: [],
        }),
      );

      // 应执行上传
      expect(uploadSpy).toHaveBeenCalledTimes(1);

      expect(result).toEqual([]);
    });

    it('下载后无本地变更：跳过上传，显示无更改 toast', async () => {
      const remoteData = createMockRemoteData({
        novels: [{ id: 'book-1' }],
        aiModels: [{ id: 'model-1' }],
      });

      spyOn(GistSyncService.prototype, 'downloadFromGist').mockResolvedValue(
        mockDownloadSuccess(remoteData),
      );
      spyOn(SyncDataService, 'applyDownloadedData').mockResolvedValue([]);
      spyOn(SyncDataService, 'hasChangesToUpload').mockReturnValue(false);
      spyOn(MemoryService, 'getAllMemoriesForBooksFlat').mockResolvedValue([]);

      const { sync } = useGistSync();
      const result = await sync();

      // 应显示"无更改"toast
      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'success',
          summary: '同步完成',
          detail: '数据已是最新，无需上传',
        }),
      );

      expect(result).toEqual([]);
    });

    it('下载失败：终止同步，显示错误 toast，不上传', async () => {
      spyOn(GistSyncService.prototype, 'downloadFromGist').mockResolvedValue({
        success: false,
        error: '网络错误',
      } as any);
      const applySpy = spyOn(SyncDataService, 'applyDownloadedData').mockResolvedValue([]);
      spyOn(MemoryService, 'getAllMemoriesForBooksFlat').mockResolvedValue([]);

      const { sync } = useGistSync();
      const result = await sync();

      // 不应调用 applyDownloadedData 或上传
      expect(applySpy).not.toHaveBeenCalled();

      // 应显示下载失败 toast
      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'error', summary: '下载失败' }),
      );

      // setSyncing 应被重置为 false
      expect(mockSettingsStore.setSyncing).toHaveBeenCalledWith(false);

      expect(result).toEqual([]);
    });

    it('下载抛异常：终止同步，显示错误 toast，不上传', async () => {
      spyOn(GistSyncService.prototype, 'downloadFromGist').mockRejectedValue(new Error('连接超时'));
      const applySpy = spyOn(SyncDataService, 'applyDownloadedData').mockResolvedValue([]);
      spyOn(MemoryService, 'getAllMemoriesForBooksFlat').mockResolvedValue([]);

      const { sync } = useGistSync();
      const result = await sync();

      // 不应调用 applyDownloadedData
      expect(applySpy).not.toHaveBeenCalled();

      // 应显示错误 toast
      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'error', summary: '下载失败', detail: '连接超时' }),
      );

      // setSyncing 应被重置
      expect(mockSettingsStore.setSyncing).toHaveBeenCalledWith(false);

      expect(result).toEqual([]);
    });

    it('上传失败：显示错误 toast，但仍返回下载阶段的 restorable items', async () => {
      const restorableItems = [
        { id: 'novel-1', type: 'novel' as const, title: '测试小说', deletedAt: 1000, data: {} },
      ];

      spyOn(GistSyncService.prototype, 'downloadFromGist').mockResolvedValue(mockDownloadSuccess());
      spyOn(SyncDataService, 'applyDownloadedData').mockResolvedValue(restorableItems);
      spyOn(SyncDataService, 'hasChangesToUpload').mockReturnValue(true);
      spyOn(MemoryService, 'getAllMemoriesForBooksFlat').mockResolvedValue([]);
      spyOn(GistSyncService.prototype, 'uploadToGist').mockResolvedValue({
        success: false,
        error: '上传被拒绝',
      } as any);

      const { sync } = useGistSync();
      const result = await sync();

      // 应显示上传失败 toast
      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'error', summary: '上传失败' }),
      );

      // 应返回 restorableItems（下载阶段产出的）
      expect(result).toEqual(restorableItems);
    });

    it('上传抛异常：显示错误 toast，返回 restorable items', async () => {
      const restorableItems = [
        { id: 'model-1', type: 'model' as const, title: '测试模型', deletedAt: 2000, data: {} },
      ];

      spyOn(GistSyncService.prototype, 'downloadFromGist').mockResolvedValue(mockDownloadSuccess());
      spyOn(SyncDataService, 'applyDownloadedData').mockResolvedValue(restorableItems);
      spyOn(SyncDataService, 'hasChangesToUpload').mockReturnValue(true);
      spyOn(MemoryService, 'getAllMemoriesForBooksFlat').mockResolvedValue([]);
      spyOn(GistSyncService.prototype, 'uploadToGist').mockRejectedValue(new Error('网络中断'));

      const { sync } = useGistSync();
      const result = await sync();

      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'error', summary: '上传失败', detail: '网络中断' }),
      );

      expect(result).toEqual(restorableItems);
    });

    it('已在同步中（isSyncing=true）：立即返回空数组', async () => {
      mockSettingsStore.isSyncing = true;

      const { sync } = useGistSync();
      const result = await sync();

      // 不应调用任何同步操作
      expect(mockSettingsStore.setSyncing).not.toHaveBeenCalled();

      expect(result).toEqual([]);
    });

    it('applyDownloadedData 返回 restorable items：通过返回值传递', async () => {
      const restorableItems = [
        {
          id: 'novel-1',
          type: 'novel' as const,
          title: '已删除的小说',
          deletedAt: 500,
          data: { id: 'novel-1', title: '已删除的小说' },
        },
        {
          id: 'cover-1',
          type: 'cover' as const,
          title: '已删除的封面',
          deletedAt: 600,
          data: { id: 'cover-1', url: 'http://example.com/old.jpg' },
        },
      ];

      spyOn(GistSyncService.prototype, 'downloadFromGist').mockResolvedValue(mockDownloadSuccess());
      spyOn(SyncDataService, 'applyDownloadedData').mockResolvedValue(restorableItems);
      spyOn(SyncDataService, 'hasChangesToUpload').mockReturnValue(false);
      spyOn(MemoryService, 'getAllMemoriesForBooksFlat').mockResolvedValue([]);

      const { sync } = useGistSync();
      const result = await sync();

      expect(result).toEqual(restorableItems);
      expect(result).toHaveLength(2);
    });

    it('下载成功但返回无数据（空 Gist）：与空远程数据比较', async () => {
      spyOn(GistSyncService.prototype, 'downloadFromGist').mockResolvedValue(
        mockDownloadSuccess(null),
      );
      const hasChangesSpy = spyOn(SyncDataService, 'hasChangesToUpload').mockReturnValue(true);
      spyOn(MemoryService, 'getAllMemoriesForBooksFlat').mockResolvedValue([]);
      spyOn(GistSyncService.prototype, 'uploadToGist').mockResolvedValue(mockUploadSuccess());

      const { sync } = useGistSync();
      const result = await sync();

      // hasChangesToUpload 应使用空远程数据比较
      expect(hasChangesSpy).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          novels: [],
          aiModels: [],
          appSettings: {},
          coverHistory: [],
          memories: [],
        }),
      );

      expect(result).toEqual([]);
    });

    it('sync() 内部异常：捕获错误，显示 toast，返回空数组', async () => {
      // 让 MemoryService 抛出异常（发生在阶段3检测变更之前）
      spyOn(GistSyncService.prototype, 'downloadFromGist').mockResolvedValue(mockDownloadSuccess());
      spyOn(SyncDataService, 'applyDownloadedData').mockResolvedValue([]);
      spyOn(MemoryService, 'getAllMemoriesForBooksFlat').mockRejectedValue(
        new Error('数据库访问失败'),
      );

      const { sync } = useGistSync();
      const result = await sync();

      // 应显示同步失败 toast
      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          summary: '同步失败',
          detail: '数据库访问失败',
        }),
      );

      // setSyncing 应被重置
      expect(mockSettingsStore.setSyncing).toHaveBeenCalledWith(false);

      expect(result).toEqual([]);
    });

    it('setSyncing 在 finally 中始终重置为 false（即使有异常）', async () => {
      spyOn(GistSyncService.prototype, 'downloadFromGist').mockRejectedValue(
        new Error('fatal error'),
      );

      const { sync } = useGistSync();
      await sync();

      // 验证 setSyncing(false) 被调用（finally 块）
      const calls = mockSettingsStore.setSyncing.mock.calls;
      const setVals = calls.map((c: unknown[]) => c[0]);
      expect(setVals).toContain(true);
      expect(setVals).toContain(false);
      // 最后一次调用应是 false
      expect(setVals[setVals.length - 1]).toBe(false);
    });

    it('使用自定义 config 参数覆盖 store 配置', async () => {
      const customConfig = createSyncConfig({
        syncParams: { gistId: 'custom-gist-id', token: 'custom-token' },
      });

      const downloadSpy = spyOn(GistSyncService.prototype, 'downloadFromGist').mockResolvedValue(
        mockDownloadSuccess(),
      );
      spyOn(SyncDataService, 'applyDownloadedData').mockResolvedValue([]);
      spyOn(SyncDataService, 'hasChangesToUpload').mockReturnValue(false);
      spyOn(MemoryService, 'getAllMemoriesForBooksFlat').mockResolvedValue([]);

      const { sync } = useGistSync();
      await sync(customConfig);

      // 应使用自定义配置调用下载（第三个参数是 lastRemoteUpdatedAt）
      expect(downloadSpy).toHaveBeenCalledWith(
        customConfig,
        expect.any(Function),
        customConfig.lastRemoteUpdatedAt,
      );
    });

    it('上传成功后更新 gistId 和同步时间', async () => {
      spyOn(GistSyncService.prototype, 'downloadFromGist').mockResolvedValue(mockDownloadSuccess());
      spyOn(SyncDataService, 'applyDownloadedData').mockResolvedValue([]);
      spyOn(SyncDataService, 'hasChangesToUpload').mockReturnValue(true);
      spyOn(MemoryService, 'getAllMemoriesForBooksFlat').mockResolvedValue([]);
      spyOn(GistSyncService.prototype, 'uploadToGist').mockResolvedValue(
        mockUploadSuccess('new-gist-id-123'),
      );

      const { sync } = useGistSync();
      await sync();

      // 应更新 gistId
      expect(mockSettingsStore.setGistId).toHaveBeenCalledWith('new-gist-id-123');
      // 应更新同步时间（上传成功后也会调用）
      expect(mockSettingsStore.updateLastSyncTime).toHaveBeenCalled();
      // 应清理旧删除记录
      expect(mockSettingsStore.cleanupOldDeletionRecords).toHaveBeenCalled();
    });

    it('下载成功后更新同步状态（lastSyncTime、lastSyncedModelIds）', async () => {
      spyOn(GistSyncService.prototype, 'downloadFromGist').mockResolvedValue(mockDownloadSuccess());
      spyOn(SyncDataService, 'applyDownloadedData').mockResolvedValue([]);
      spyOn(SyncDataService, 'hasChangesToUpload').mockReturnValue(false);
      spyOn(MemoryService, 'getAllMemoriesForBooksFlat').mockResolvedValue([]);

      const { sync } = useGistSync();
      await sync();

      // 应更新同步状态（在 apply 完成后）
      expect(mockSettingsStore.updateLastSyncTime).toHaveBeenCalled();
      expect(mockSettingsStore.updateLastSyncedModelIds).toHaveBeenCalledWith(['model-1']);
      expect(mockSettingsStore.cleanupOldDeletionRecords).toHaveBeenCalled();
    });

    it('进度更新：下载阶段设置 downloading stage', async () => {
      spyOn(GistSyncService.prototype, 'downloadFromGist').mockResolvedValue(mockDownloadSuccess());
      spyOn(SyncDataService, 'applyDownloadedData').mockResolvedValue([]);
      spyOn(SyncDataService, 'hasChangesToUpload').mockReturnValue(false);
      spyOn(MemoryService, 'getAllMemoriesForBooksFlat').mockResolvedValue([]);

      const { sync } = useGistSync();
      await sync();

      // 验证 updateSyncProgress 被调用过
      expect(mockSettingsStore.updateSyncProgress).toHaveBeenCalled();

      // 验证调用了 downloading 和 applying 阶段
      const progressCalls = mockSettingsStore.updateSyncProgress.mock.calls as unknown[][];
      const stages = progressCalls
        .map((c) => (c[0] as Record<string, unknown>)?.stage)
        .filter(Boolean);
      expect(stages).toContain('downloading');
      expect(stages).toContain('applying');
    });
  });

  // ── restoreDeletedItems() 测试 ────────────────────────────────

  describe('restoreDeletedItems()', () => {
    it('恢复小说、模型和封面到各自 store', async () => {
      const mockAddBook = mock(() => Promise.resolve());
      const mockAddModel = mock(() => Promise.resolve());
      const mockAddCover = mock(() => Promise.resolve());

      spyOn(BooksStore, 'useBooksStore').mockReturnValue({
        books: [],
        addBook: mockAddBook,
      } as any);
      spyOn(AIModelsStore, 'useAIModelsStore').mockReturnValue({
        models: [],
        addModel: mockAddModel,
      } as any);
      spyOn(CoverHistoryStore, 'useCoverHistoryStore').mockReturnValue({
        covers: [],
        addCover: mockAddCover,
      } as any);

      mockSettingsStore.gistSync = createSyncConfig({
        deletedNovelIds: [{ id: 'novel-1', deletedAt: 1000 }],
        deletedModelIds: [{ id: 'model-1', deletedAt: 1000 }],
        deletedCoverIds: [{ id: 'cover-1', deletedAt: 1000 }],
        deletedCoverUrls: [{ url: 'http://example.com/cover.jpg', deletedAt: 1000 }],
      });

      const items = [
        {
          id: 'novel-1',
          type: 'novel' as const,
          title: '小说1',
          deletedAt: 1000,
          data: { id: 'novel-1', title: '小说1' },
        },
        {
          id: 'model-1',
          type: 'model' as const,
          title: '模型1',
          deletedAt: 1000,
          data: { id: 'model-1', name: '模型1' },
        },
        {
          id: 'cover-1',
          type: 'cover' as const,
          title: '封面1',
          deletedAt: 1000,
          data: { id: 'cover-1', url: 'http://example.com/cover.jpg' },
        },
      ];

      const { restoreDeletedItems } = useGistSync();
      await restoreDeletedItems(items);

      // 验证各 store 的 add 方法被调用
      expect(mockAddBook).toHaveBeenCalledWith(items[0]!.data);
      expect(mockAddModel).toHaveBeenCalledWith(items[1]!.data);
      expect(mockAddCover).toHaveBeenCalledWith(items[2]!.data);
    });

    it('从删除记录中移除已恢复的项目', async () => {
      const mockAddBook = mock(() => Promise.resolve());
      const mockAddModel = mock(() => Promise.resolve());

      spyOn(BooksStore, 'useBooksStore').mockReturnValue({
        books: [],
        addBook: mockAddBook,
      } as any);
      spyOn(AIModelsStore, 'useAIModelsStore').mockReturnValue({
        models: [],
        addModel: mockAddModel,
      } as any);

      mockSettingsStore.gistSync = createSyncConfig({
        deletedNovelIds: [
          { id: 'novel-1', deletedAt: 1000 },
          { id: 'novel-2', deletedAt: 2000 },
        ],
        deletedModelIds: [{ id: 'model-1', deletedAt: 1000 }],
        deletedCoverIds: [],
        deletedCoverUrls: [],
      });

      const items = [
        {
          id: 'novel-1',
          type: 'novel' as const,
          title: '小说1',
          deletedAt: 1000,
          data: { id: 'novel-1' },
        },
      ];

      const { restoreDeletedItems } = useGistSync();
      await restoreDeletedItems(items);

      // 应调用 updateGistSync，保留 novel-2 但移除 novel-1
      expect(mockSettingsStore.updateGistSync).toHaveBeenCalledWith(
        expect.objectContaining({
          deletedNovelIds: [{ id: 'novel-2', deletedAt: 2000 }],
          deletedModelIds: [{ id: 'model-1', deletedAt: 1000 }],
        }),
      );
    });

    it('恢复封面时从 deletedCoverUrls 中移除对应 URL', async () => {
      const mockAddCover = mock(() => Promise.resolve());

      spyOn(CoverHistoryStore, 'useCoverHistoryStore').mockReturnValue({
        covers: [],
        addCover: mockAddCover,
      } as any);

      mockSettingsStore.gistSync = createSyncConfig({
        deletedNovelIds: [],
        deletedModelIds: [],
        deletedCoverIds: [{ id: 'cover-1', deletedAt: 1000 }],
        deletedCoverUrls: [
          { url: 'http://example.com/old.jpg', deletedAt: 1000 },
          { url: 'http://example.com/keep.jpg', deletedAt: 2000 },
        ],
      });

      const items = [
        {
          id: 'cover-1',
          type: 'cover' as const,
          title: '封面1',
          deletedAt: 1000,
          data: { id: 'cover-1', url: 'http://example.com/old.jpg' },
        },
      ];

      const { restoreDeletedItems } = useGistSync();
      await restoreDeletedItems(items);

      // 验证 deletedCoverUrls 中移除了匹配的 URL
      expect(mockSettingsStore.updateGistSync).toHaveBeenCalledWith(
        expect.objectContaining({
          deletedCoverIds: [],
          deletedCoverUrls: [{ url: 'http://example.com/keep.jpg', deletedAt: 2000 }],
        }),
      );
    });

    it('恢复成功后显示成功 toast', async () => {
      mockSettingsStore.gistSync = createSyncConfig({
        deletedNovelIds: [],
        deletedModelIds: [],
        deletedCoverIds: [],
        deletedCoverUrls: [],
      });

      const items = [
        {
          id: 'novel-1',
          type: 'novel' as const,
          title: '小说',
          deletedAt: 1000,
          data: { id: 'novel-1' },
        },
        {
          id: 'model-1',
          type: 'model' as const,
          title: '模型',
          deletedAt: 1000,
          data: { id: 'model-1' },
        },
      ];

      const mockAddBook = mock(() => Promise.resolve());
      const mockAddModel = mock(() => Promise.resolve());

      spyOn(BooksStore, 'useBooksStore').mockReturnValue({
        books: [],
        addBook: mockAddBook,
      } as any);
      spyOn(AIModelsStore, 'useAIModelsStore').mockReturnValue({
        models: [],
        addModel: mockAddModel,
      } as any);

      const { restoreDeletedItems } = useGistSync();
      await restoreDeletedItems(items);

      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'success',
          summary: '恢复成功',
          detail: '已恢复 2 个项目',
        }),
      );
    });
  });
});
