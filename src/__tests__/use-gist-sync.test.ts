import { describe, expect, it, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import './setup';

import { useGistSync } from '../composables/useGistUploadWithConflictCheck';
import { GistSyncService } from '../services/gist-sync-service';
import { SyncDataService } from '../services/sync-data-service';
import { MemoryService } from '../services/memory-service';
import { ChapterContentService } from '../services/chapter-content-service';
import * as SettingsStore from '../stores/settings';
import * as BooksStore from '../stores/books';
import * as AIModelsStore from '../stores/ai-models';
import * as CoverHistoryStore from '../stores/cover-history';
import * as ToastHistory from '../composables/useToastHistory';
import type { SyncConfig } from '../models/sync';
import { SyncType } from '../models/sync';
import type { GistManifest } from '../models/manifest';
import { MANIFEST_SCHEMA_VERSION, novelEntryKey } from '../models/manifest';

const mockToastAdd = mock(() => {});

function createSyncConfig(overrides: Partial<SyncConfig> = {}): SyncConfig {
  return {
    enabled: true,
    lastSyncTime: 1000,
    syncInterval: 300000,
    syncType: SyncType.Gist,
    syncParams: { gistId: 'test-gist-id', token: 'test-token', username: 'test-user' },
    secret: 'test-secret',
    apiEndpoint: '',
    lastRemoteETag: 'etag-v1',
    knownRemoteHashes: { 'novel:book-1': 'old-hash' },
    ...overrides,
  };
}

function createSyncConfigWithoutGistId(): SyncConfig {
  return createSyncConfig({
    syncParams: { token: 'test-token', username: 'test-user' },
    lastRemoteETag: '',
    knownRemoteHashes: {},
  });
}

function createMockSettingsStore(overrides: Record<string, unknown> = {}) {
  return {
    isSyncing: false,
    gistSync: createSyncConfig(),
    setSyncing: mock(() => {}),
    updateSyncProgress: mock(() => {}),
    resetSyncProgress: mock(() => {}),
    setGistId: mock(() => Promise.resolve()),
    updateLastSyncTime: mock(() => Promise.resolve()),
    updateLastRemoteETag: mock(() => Promise.resolve()),
    updateKnownRemoteHashes: mock(() => Promise.resolve()),
    updateKnownRemoteEntries: mock(() => Promise.resolve()),
    updateKnownRemoteTombstones: mock(() => Promise.resolve()),
    cleanupOldDeletionRecords: mock(() => Promise.resolve()),
    getAllSettings: mock(() => ({ lastEdited: new Date(0) })),
    updateGistSync: mock(() => Promise.resolve()),
    ...overrides,
  };
}

function makeManifest(novelHash = 'remote-hash'): GistManifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    updatedAt: '2026-04-16T00:00:00Z',
    entries: {
      [novelEntryKey('book-1')]: { hash: novelHash, lastEdited: '2026-04-16T00:00:00Z' },
      settings: { hash: 'settings-hash', lastEdited: '2026-04-16T00:00:00Z' },
      'ai-models': { hash: 'ai-hash', lastEdited: '2026-04-16T00:00:00Z' },
      'cover-history': { hash: 'cover-hash', lastEdited: '2026-04-16T00:00:00Z' },
    },
  };
}

describe('useGistSync (manifest-driven flow)', () => {
  let mockSettingsStore: ReturnType<typeof createMockSettingsStore>;

  beforeEach(() => {
    mockToastAdd.mockClear();
    mockSettingsStore = createMockSettingsStore();

    spyOn(SettingsStore, 'useSettingsStore').mockReturnValue(mockSettingsStore as any);
    spyOn(BooksStore, 'useBooksStore').mockReturnValue({
      books: [{ id: 'book-1' }],
      addBook: mock(() => Promise.resolve()),
      bulkAddBooks: mock(() => Promise.resolve()),
    } as any);
    spyOn(AIModelsStore, 'useAIModelsStore').mockReturnValue({
      models: [{ id: 'model-1' }],
      addModel: mock(() => Promise.resolve()),
    } as any);
    spyOn(CoverHistoryStore, 'useCoverHistoryStore').mockReturnValue({
      covers: [],
      addCover: mock(() => Promise.resolve()),
    } as any);
    spyOn(ToastHistory, 'useToastWithHistory').mockReturnValue({ add: mockToastAdd } as any);

    // Default memory + chapter content mocks
    spyOn(MemoryService, 'getAllMemories').mockResolvedValue([]);
    spyOn(ChapterContentService, 'loadAllChapterContentsForNovels').mockImplementation((books) =>
      Promise.resolve(books),
    );
  });

  afterEach(() => {
    mock.restore();
  });

  describe('download phase', () => {
    it('304 skipped: no changes — completes without apply or upload', async () => {
      spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
        success: true,
        skipped: true,
        remoteETag: 'etag-v1',
      });
      const applySpy = spyOn(SyncDataService, 'applyPartialRemoteData').mockResolvedValue([]);
      const hasChangesSpy = spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(false);
      const uploadSpy = spyOn(
        GistSyncService.prototype,
        'uploadToGistIncremental',
      ).mockResolvedValue({} as any);

      const { sync } = useGistSync();
      const result = await sync();

      expect(applySpy).not.toHaveBeenCalled();
      expect(uploadSpy).not.toHaveBeenCalled();
      expect(hasChangesSpy).toHaveBeenCalled();
      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'success', summary: '同步完成' }),
      );
      expect(result).toEqual([]);
    });

    it('200 with remote changes: applies changedEntries and updates knownRemoteHashes', async () => {
      const remoteManifest = makeManifest();
      spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
        success: true,
        skipped: false,
        remoteETag: 'etag-v2',
        remoteUpdatedAt: '2026-04-16T00:00:00Z',
        manifest: remoteManifest,
        changedEntries: {
          [novelEntryKey('book-1')]: {
            kind: 'novel',
            bookId: 'book-1',
            value: { id: 'book-1', title: 'New Title', lastEdited: new Date() },
          },
        },
        deletedEntries: [],
        remoteTombstones: {},
        remoteEntryKeys: Object.keys(remoteManifest.entries),
      } as any);
      const applySpy = spyOn(SyncDataService, 'applyPartialRemoteData').mockResolvedValue([]);
      spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(false);

      const { sync } = useGistSync();
      await sync();

      expect(applySpy).toHaveBeenCalledWith(
        expect.objectContaining({ [novelEntryKey('book-1')]: expect.any(Object) }),
      );
      expect(mockSettingsStore.updateLastRemoteETag).toHaveBeenCalledWith('etag-v2');
      expect(mockSettingsStore.updateKnownRemoteHashes).toHaveBeenCalled();
    });

    it('remote deletion with tombstone: propagates with deletedAt timestamp', async () => {
      const remoteManifest = makeManifest();
      spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
        success: true,
        skipped: false,
        remoteETag: 'etag-v2',
        remoteUpdatedAt: '2026-04-16T00:00:00Z',
        manifest: remoteManifest,
        changedEntries: {},
        deletedEntries: [{ key: novelEntryKey('book-2'), deletedAt: '2026-04-15T12:00:00Z' }],
        remoteTombstones: { [novelEntryKey('book-2')]: '2026-04-15T12:00:00Z' },
        remoteEntryKeys: Object.keys(remoteManifest.entries),
      } as any);
      spyOn(SyncDataService, 'applyPartialRemoteData').mockResolvedValue([]);
      const deleteSpy = spyOn(SyncDataService, 'applyRemoteDeletions').mockResolvedValue();
      spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(false);

      const { sync } = useGistSync();
      await sync();

      expect(deleteSpy).toHaveBeenCalledWith([
        { key: novelEntryKey('book-2'), deletedAt: '2026-04-15T12:00:00Z' },
      ]);
      expect(mockSettingsStore.updateKnownRemoteTombstones).toHaveBeenCalledWith({
        [novelEntryKey('book-2')]: '2026-04-15T12:00:00Z',
      });
    });

    it('remote deletion empty: skips applyRemoteDeletions entirely', async () => {
      const remoteManifest = makeManifest();
      spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
        success: true,
        skipped: false,
        remoteETag: 'etag-v2',
        remoteUpdatedAt: '2026-04-16T00:00:00Z',
        manifest: remoteManifest,
        changedEntries: {},
        deletedEntries: [],
        remoteTombstones: {},
        remoteEntryKeys: Object.keys(remoteManifest.entries),
      } as any);
      spyOn(SyncDataService, 'applyPartialRemoteData').mockResolvedValue([]);
      const deleteSpy = spyOn(SyncDataService, 'applyRemoteDeletions').mockResolvedValue();
      spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(false);

      const { sync } = useGistSync();
      await sync();

      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('schemaVersionTooNew: aborts with upgrade error', async () => {
      spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
        success: true,
        skipped: false,
        remoteETag: 'etag-v2',
        remoteUpdatedAt: '2026-04-16T00:00:00Z',
        manifest: { schemaVersion: 999, updatedAt: '', entries: {} },
        schemaVersionTooNew: true,
        changedEntries: {},
        deletedEntries: [],
        remoteTombstones: {},
        remoteEntryKeys: [],
      } as any);

      const { sync } = useGistSync();
      await sync();

      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          summary: '同步中止',
          detail: expect.stringContaining('升级'),
        }),
      );
    });

    it('download throws: reports error toast and stops', async () => {
      spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockRejectedValue(
        new Error('网络错误'),
      );
      const uploadSpy = spyOn(
        GistSyncService.prototype,
        'uploadToGistIncremental',
      ).mockResolvedValue({} as any);

      const { sync } = useGistSync();
      await sync();

      expect(uploadSpy).not.toHaveBeenCalled();
      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'error', summary: '下载失败' }),
      );
    });
  });

  describe('upload phase', () => {
    it('no local changes: skips upload and sets lastSyncTime', async () => {
      spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
        success: true,
        skipped: true,
        remoteETag: 'etag-v1',
      });
      spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(false);
      const uploadSpy = spyOn(
        GistSyncService.prototype,
        'uploadToGistIncremental',
      ).mockResolvedValue({} as any);

      const { sync } = useGistSync();
      await sync();

      expect(uploadSpy).not.toHaveBeenCalled();
      expect(mockSettingsStore.updateLastSyncTime).toHaveBeenCalled();
    });

    it('local changes detected: pseudo-CAS passes, uploads incrementally', async () => {
      spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
        success: true,
        skipped: true,
        remoteETag: 'etag-v1',
      });
      spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(true);
      spyOn(GistSyncService.prototype, 'verifyRemoteUnchanged').mockResolvedValue({
        status: 'unchanged',
        etag: 'etag-v1',
      });
      const uploadSpy = spyOn(
        GistSyncService.prototype,
        'uploadToGistIncremental',
      ).mockResolvedValue({
        success: true,
        gistId: 'test-gist-id',
        remoteETag: 'etag-v2',
        remoteUpdatedAt: '2026-04-16T00:00:00Z',
        manifest: makeManifest('new-hash'),
        uploadedEntries: [novelEntryKey('book-1')],
        deletedEntries: [],
      });

      const { sync } = useGistSync();
      await sync();

      expect(uploadSpy).toHaveBeenCalled();
      expect(mockSettingsStore.updateLastRemoteETag).toHaveBeenCalledWith('etag-v2');
      expect(mockSettingsStore.updateKnownRemoteHashes).toHaveBeenCalled();
    });

    it('cold start sync loads stores before uploading ai models and memories', async () => {
      const coldSettingsStore = createMockSettingsStore({
        isLoaded: false,
        loadSettings: mock(function (this: { isLoaded: boolean }) {
          this.isLoaded = true;
          return Promise.resolve();
        }),
      });
      const coldBooksStore = {
        books: [] as Array<{ id: string; title?: string }>,
        isLoaded: false,
        loadBooks: mock(function (this: {
          books: Array<{ id: string; title?: string }>;
          isLoaded: boolean;
        }) {
          this.books = [{ id: 'book-1', title: 'Cold Book' }];
          this.isLoaded = true;
          return Promise.resolve();
        }),
        addBook: mock(() => Promise.resolve()),
        bulkAddBooks: mock(() => Promise.resolve()),
      };
      const coldAIModelsStore = {
        models: [] as Array<{ id: string; lastEdited?: Date }>,
        isLoaded: false,
        loadModels: mock(function (this: {
          models: Array<{ id: string; lastEdited?: Date }>;
          isLoaded: boolean;
        }) {
          this.models = [{ id: 'model-cold', lastEdited: new Date('2026-04-16T00:00:00Z') }];
          this.isLoaded = true;
          return Promise.resolve();
        }),
        addModel: mock(() => Promise.resolve()),
      };
      const coldCoverHistoryStore = {
        covers: [] as Array<{ id: string; url: string; addedAt: Date }>,
        isLoaded: false,
        loadCoverHistory: mock(function (this: {
          covers: Array<{ id: string; url: string; addedAt: Date }>;
          isLoaded: boolean;
        }) {
          this.covers = [
            {
              id: 'cover-cold',
              url: 'https://example.com/cover.png',
              addedAt: new Date('2026-04-16T00:00:00Z'),
            },
          ];
          this.isLoaded = true;
          return Promise.resolve();
        }),
        addCover: mock(() => Promise.resolve()),
      };

      spyOn(SettingsStore, 'useSettingsStore').mockReturnValue(coldSettingsStore as any);
      spyOn(BooksStore, 'useBooksStore').mockReturnValue(coldBooksStore as any);
      spyOn(AIModelsStore, 'useAIModelsStore').mockReturnValue(coldAIModelsStore as any);
      spyOn(CoverHistoryStore, 'useCoverHistoryStore').mockReturnValue(
        coldCoverHistoryStore as any,
      );

      spyOn(MemoryService, 'getAllMemories').mockImplementation((bookId: string) => {
        if (bookId !== 'book-1') return Promise.resolve([]);
        return Promise.resolve([
          {
            id: 'memory-cold',
            bookId,
            content: '冷启动 memory',
            summary: '冷启动',
            createdAt: Date.parse('2026-04-16T00:00:00Z'),
            lastAccessedAt: Date.parse('2026-04-16T00:00:00Z'),
          },
        ] as any);
      });

      spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
        success: true,
        skipped: true,
        remoteETag: 'etag-v1',
      });
      spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(true);
      spyOn(GistSyncService.prototype, 'verifyRemoteUnchanged').mockResolvedValue({
        status: 'unchanged',
        etag: 'etag-v1',
      });
      const uploadSpy = spyOn(
        GistSyncService.prototype,
        'uploadToGistIncremental',
      ).mockResolvedValue({
        success: true,
        gistId: 'test-gist-id',
        remoteETag: 'etag-v2',
        remoteUpdatedAt: '2026-04-16T00:00:00Z',
        manifest: makeManifest('new-hash'),
        uploadedEntries: [novelEntryKey('book-1')],
        deletedEntries: [],
      });

      const { sync } = useGistSync();
      await sync();

      expect(coldBooksStore.loadBooks).toHaveBeenCalled();
      expect(coldAIModelsStore.loadModels).toHaveBeenCalled();
      expect(coldCoverHistoryStore.loadCoverHistory).toHaveBeenCalled();
      expect(uploadSpy).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          aiModels: expect.arrayContaining([expect.objectContaining({ id: 'model-cold' })]),
          memoriesByBook: expect.objectContaining({
            'book-1': expect.arrayContaining([expect.objectContaining({ id: 'memory-cold' })]),
          }),
        }),
        expect.any(Object),
        expect.any(Function),
      );
    });

    it('pseudo-CAS detects concurrent write: retries by re-downloading', async () => {
      const downloadSpy = spyOn(
        GistSyncService.prototype,
        'downloadFromGistWithManifest',
      ).mockResolvedValue({
        success: true,
        skipped: true,
        remoteETag: 'etag-v1',
      });
      spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(true);
      // First verify returns 'changed', second returns 'unchanged'
      const verifySpy = spyOn(GistSyncService.prototype, 'verifyRemoteUnchanged')
        .mockResolvedValueOnce({
          status: 'changed',
          etag: 'etag-v2',
          files: {},
        })
        .mockResolvedValueOnce({
          status: 'unchanged',
          etag: 'etag-v2',
        });
      const uploadSpy = spyOn(
        GistSyncService.prototype,
        'uploadToGistIncremental',
      ).mockResolvedValue({
        success: true,
        gistId: 'test-gist-id',
        remoteETag: 'etag-v3',
        remoteUpdatedAt: '2026-04-16T00:00:00Z',
        manifest: makeManifest(),
        uploadedEntries: [],
        deletedEntries: [],
      });

      const { sync } = useGistSync();
      await sync();

      expect(downloadSpy).toHaveBeenCalledTimes(2); // initial + 1 retry
      expect(verifySpy).toHaveBeenCalledTimes(2);
      expect(uploadSpy).toHaveBeenCalledTimes(1);
    });

    it('CAS 报 "changed" 但 manifest 内容与 knownRemoteHashes 一致：单设备 ETag 漂移误报，应判为 unchanged 直接上传', async () => {
      // 单设备复现：GitHub Gist 返回新的 ETag（例如 description 写入、用户在 web 端
      // 编辑了非 manifest 文件、或后端 ETag 抖动），但 manifest 跟踪的内容未变。
      // 现状：3 轮 verify 都返回 'changed' → 弹"其他设备正在频繁写入"。
      // 期望：runPseudoCasCheck 应比对远端 manifest 的 hashes 与本地 knownRemoteHashes，
      // 一致时视为 unchanged，跳过重试直接上传。
      const stableManifest = makeManifest('remote-hash-stable');
      mockSettingsStore.gistSync = createSyncConfig({
        knownRemoteHashes: {
          [novelEntryKey('book-1')]: 'remote-hash-stable',
          settings: 'settings-hash',
          'ai-models': 'ai-hash',
          'cover-history': 'cover-hash',
        },
      });

      spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
        success: true,
        skipped: true,
        remoteETag: 'etag-v1',
      });
      spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(true);

      const verifySpy = spyOn(
        GistSyncService.prototype,
        'verifyRemoteUnchanged',
      ).mockResolvedValue({
        status: 'changed',
        etag: 'etag-v2',
        files: {
          'manifest.json': { content: JSON.stringify(stableManifest) },
        },
      });

      const uploadSpy = spyOn(
        GistSyncService.prototype,
        'uploadToGistIncremental',
      ).mockResolvedValue({
        success: true,
        gistId: 'test-gist-id',
        remoteETag: 'etag-v3',
        remoteUpdatedAt: '2026-04-16T00:00:00Z',
        manifest: stableManifest,
        uploadedEntries: [],
        deletedEntries: [],
      });

      const { sync } = useGistSync();
      await sync();

      expect(verifySpy).toHaveBeenCalledTimes(1);
      expect(uploadSpy).toHaveBeenCalledTimes(1);
      expect(mockToastAdd).not.toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'error', summary: '同步冲突' }),
      );
    });

    it('CAS 报 "changed" 且 manifest hashes 与 knownRemoteHashes 不一致：真冲突，走重试，重试预算耗尽时弹同步冲突', async () => {
      // 反向用例：远端真的有别人写入（manifest hashes 漂移）。
      // 应当继续走重试路径，3 轮都失败时报"其他设备正在频繁写入"。
      const driftedManifest = makeManifest('remote-hash-NEW-from-other-device');
      mockSettingsStore.gistSync = createSyncConfig({
        knownRemoteHashes: {
          [novelEntryKey('book-1')]: 'remote-hash-stable',
          settings: 'settings-hash',
          'ai-models': 'ai-hash',
          'cover-history': 'cover-hash',
        },
      });

      spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
        success: true,
        skipped: true,
        remoteETag: 'etag-v1',
      });
      spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(true);
      spyOn(GistSyncService.prototype, 'verifyRemoteUnchanged').mockResolvedValue({
        status: 'changed',
        etag: 'etag-v2',
        files: {
          'manifest.json': { content: JSON.stringify(driftedManifest) },
        },
      });
      const uploadSpy = spyOn(
        GistSyncService.prototype,
        'uploadToGistIncremental',
      ).mockResolvedValue({} as any);

      const { sync } = useGistSync();
      await sync();

      expect(uploadSpy).not.toHaveBeenCalled();
      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'error', summary: '同步冲突' }),
      );
    });

    it('first sync (no gistId): uses legacy uploadToGist to create the Gist', async () => {
      mockSettingsStore.gistSync = createSyncConfigWithoutGistId();
      spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(true);
      const legacyUploadSpy = spyOn(GistSyncService.prototype, 'uploadToGist').mockResolvedValue({
        success: true,
        gistId: 'new-gist-id',
      } as any);
      const incrementalSpy = spyOn(
        GistSyncService.prototype,
        'uploadToGistIncremental',
      ).mockResolvedValue({} as any);

      const { sync } = useGistSync();
      await sync();

      expect(legacyUploadSpy).toHaveBeenCalled();
      expect(incrementalSpy).not.toHaveBeenCalled();
      expect(mockSettingsStore.setGistId).toHaveBeenCalledWith('new-gist-id');
    });
  });

  describe('migration from legacy layout', () => {
    it('needsMigration: runs legacy download+apply, then uploads new layout', async () => {
      spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
        success: true,
        skipped: false,
        remoteETag: 'etag-migration',
        remoteUpdatedAt: '2026-04-16T00:00:00Z',
        manifest: null,
        needsMigration: true,
        changedEntries: {},
        deletedEntries: [],
        remoteTombstones: {},
        remoteEntryKeys: [],
      } as any);
      const legacyDownloadSpy = spyOn(
        GistSyncService.prototype,
        'downloadFromGist',
      ).mockResolvedValue({
        success: true,
        data: { novels: [{ id: 'book-1' }], aiModels: [], appSettings: {} },
      } as any);
      const applySpy = spyOn(SyncDataService, 'applyDownloadedData').mockResolvedValue([]);
      spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(true);
      spyOn(GistSyncService.prototype, 'verifyRemoteUnchanged').mockResolvedValue({
        status: 'unchanged',
        etag: 'etag-migration',
      });
      const uploadSpy = spyOn(
        GistSyncService.prototype,
        'uploadToGistIncremental',
      ).mockResolvedValue({
        success: true,
        gistId: 'test-gist-id',
        remoteETag: 'etag-post-migration',
        remoteUpdatedAt: '2026-04-16T00:00:00Z',
        manifest: makeManifest(),
        uploadedEntries: [],
        deletedEntries: [],
      });

      const { sync } = useGistSync();
      await sync();

      expect(legacyDownloadSpy).toHaveBeenCalled();
      expect(applySpy).toHaveBeenCalled();
      // After migration, knownRemoteHashes is cleared to trigger full upload
      expect(mockSettingsStore.updateKnownRemoteHashes).toHaveBeenCalledWith({});
      expect(uploadSpy).toHaveBeenCalled();
    });

    it('legacy download fails during migration: errors out, local preserved', async () => {
      spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
        success: true,
        skipped: false,
        remoteETag: 'etag-migration',
        remoteUpdatedAt: '2026-04-16T00:00:00Z',
        manifest: null,
        needsMigration: true,
        changedEntries: {},
        deletedEntries: [],
        remoteTombstones: {},
        remoteEntryKeys: [],
      } as any);
      spyOn(GistSyncService.prototype, 'downloadFromGist').mockResolvedValue({
        success: false,
        error: '网络错误',
      } as any);
      const applySpy = spyOn(SyncDataService, 'applyDownloadedData').mockResolvedValue([]);
      const uploadSpy = spyOn(
        GistSyncService.prototype,
        'uploadToGistIncremental',
      ).mockResolvedValue({} as any);

      const { sync } = useGistSync();
      await sync();

      expect(applySpy).not.toHaveBeenCalled();
      expect(uploadSpy).not.toHaveBeenCalled();
      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'error', summary: '迁移失败' }),
      );
    });
  });

  describe('审计修复回归 (executor)', () => {
    it('lastSyncTime 应取自本地快照构建时刻，而非上传完成时刻', async () => {
      // 场景：上传耗时较长，期间用户新增/编辑的条目 lastEdited 必须大于持久化的
      // lastSyncTime，否则下轮合并会把它们误判为"远端已删除"而静默删掉。
      spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
        success: true,
        skipped: true,
        remoteETag: 'etag-v1',
      });
      spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(true);
      spyOn(GistSyncService.prototype, 'verifyRemoteUnchanged').mockResolvedValue({
        status: 'unchanged',
        etag: 'etag-v1',
      });
      let uploadFinishedAt = 0;
      spyOn(GistSyncService.prototype, 'uploadToGistIncremental').mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        uploadFinishedAt = Date.now();
        return { remoteETag: 'etag-v2', manifest: makeManifest('local-hash') } as any;
      });

      const { sync } = useGistSync();
      await sync();

      const timestampArg = (
        mockSettingsStore.updateLastSyncTime.mock.calls[0] as unknown as unknown[] | undefined
      )?.[0] as number | undefined;
      expect(timestampArg).toBeDefined();
      expect(timestampArg!).toBeLessThan(uploadFinishedAt);
    });

    it('传入 configOverride 时，上传阶段必须读取 apply 阶段刚持久化的最新 ETag/哈希', async () => {
      // 场景：设置页手动同步传入点击时刻的浅拷贝配置；阶段 2 应用远端数据后
      // 持久化了新 ETag/哈希，阶段 4 的伪 CAS 若仍读冻结副本会误报"同步冲突"。
      mockSettingsStore.updateLastRemoteETag = mock((etag: string) => {
        mockSettingsStore.gistSync.lastRemoteETag = etag;
        return Promise.resolve();
      }) as unknown as typeof mockSettingsStore.updateLastRemoteETag;
      mockSettingsStore.updateKnownRemoteHashes = mock((hashes: Record<string, string>) => {
        mockSettingsStore.gistSync.knownRemoteHashes = hashes;
        return Promise.resolve();
      }) as unknown as typeof mockSettingsStore.updateKnownRemoteHashes;

      const staleOverride = createSyncConfig(); // 冻结的 etag-v1 / old-hash 副本

      spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
        success: true,
        skipped: false,
        manifest: makeManifest('new-remote-hash'),
        changedEntries: {},
        deletedEntries: [],
        remoteTombstones: {},
        remoteETag: 'etag-v2',
        remoteFilesSnapshot: {},
      } as any);
      spyOn(SyncDataService, 'applyPartialRemoteData').mockResolvedValue([]);
      spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(true);
      const verifySpy = spyOn(GistSyncService.prototype, 'verifyRemoteUnchanged').mockResolvedValue(
        {
          status: 'unchanged',
          etag: 'etag-v2',
        },
      );
      spyOn(GistSyncService.prototype, 'uploadToGistIncremental').mockResolvedValue({
        remoteETag: 'etag-v3',
        manifest: makeManifest('local-hash'),
      } as any);

      const { sync } = useGistSync();
      await sync(staleOverride);

      const verifyConfigArg = verifySpy.mock.calls[0]?.[0] as SyncConfig;
      expect(verifyConfigArg.lastRemoteETag).toBe('etag-v2');
      expect(verifyConfigArg.knownRemoteHashes?.[novelEntryKey('book-1')]).toBe('new-remote-hash');
    });

    it('下载失败的条目不得把新远端哈希记为已知（否则永不重拉且会用陈旧本地覆盖远端）', async () => {
      mockSettingsStore.gistSync = createSyncConfig({
        knownRemoteHashes: { [novelEntryKey('book-1')]: 'old-hash', settings: 'settings-hash' },
      });
      spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
        success: true,
        skipped: false,
        manifest: makeManifest('new-remote-hash'),
        changedEntries: {}, // novel:book-1 拉取失败，没有进入 changedEntries
        failedEntryKeys: [novelEntryKey('book-1')],
        deletedEntries: [],
        remoteTombstones: {},
        remoteETag: 'etag-v2',
        remoteFilesSnapshot: {},
      } as any);
      spyOn(SyncDataService, 'applyPartialRemoteData').mockResolvedValue([] as never);
      spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(false);

      const { sync } = useGistSync();
      await sync();

      const persisted = (
        mockSettingsStore.updateKnownRemoteHashes.mock.calls[0] as unknown as
          | unknown[]
          | undefined
      )?.[0] as Record<string, string>;
      // 失败条目保留旧哈希 → 下轮 diff 会重新拉取；其余条目正常采用新 manifest 值
      expect(persisted?.[novelEntryKey('book-1')]).toBe('old-hash');
      expect(persisted?.['ai-models']).toBe('ai-hash');
    });

    it('应用失败的条目不得把新远端哈希记为已知', async () => {
      mockSettingsStore.gistSync = createSyncConfig({
        knownRemoteHashes: { [novelEntryKey('book-1')]: 'old-hash' },
      });
      spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
        success: true,
        skipped: false,
        manifest: makeManifest('new-remote-hash'),
        changedEntries: {
          [novelEntryKey('book-1')]: { kind: 'novel', value: { id: 'book-1' } },
        },
        deletedEntries: [],
        remoteTombstones: {},
        remoteETag: 'etag-v2',
        remoteFilesSnapshot: {},
      } as any);
      // apply 阶段报告该条目应用失败
      spyOn(SyncDataService, 'applyPartialRemoteData').mockResolvedValue([
        novelEntryKey('book-1'),
      ] as never);
      spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(false);

      const { sync } = useGistSync();
      await sync();

      const persisted = (
        mockSettingsStore.updateKnownRemoteHashes.mock.calls[0] as unknown as
          | unknown[]
          | undefined
      )?.[0] as Record<string, string>;
      expect(persisted?.[novelEntryKey('book-1')]).toBe('old-hash');
    });

    it('恢复已删除项目时应刷新时间戳并清除对应墓碑，防止下轮同步"僵尸删除"', async () => {
      // 场景：恢复的 data 携带删除前的旧 lastEdited/lastAccessedAt；
      // 各设备墓碑的 deletedAt 晚于它 → 复活规则保留墓碑 → 下轮同步再次删除。
      // 恢复时必须把时间戳刷新为当前时刻，并清掉本地已知的远端墓碑。
      const staleDate = new Date('2020-01-01T00:00:00.000Z');
      const deletedAt = new Date('2023-01-01T00:00:00.000Z').getTime();
      const addBookSpy = mock(() => Promise.resolve());
      spyOn(BooksStore, 'useBooksStore').mockReturnValue({
        books: [],
        addBook: addBookSpy,
        bulkAddBooks: mock(() => Promise.resolve()),
      } as any);
      mockSettingsStore.gistSync = createSyncConfig({
        knownRemoteTombstones: {
          'novel:novel-1': new Date(deletedAt).toISOString(),
          'novel:other': new Date(deletedAt).toISOString(),
        },
      });
      const upsertSpy = spyOn(MemoryService, 'upsertMemoryForSync').mockResolvedValue(
        undefined as never,
      );

      const { restoreDeletedItems } = useGistSync();
      const before = Date.now();
      await restoreDeletedItems([
        {
          id: 'novel-1',
          type: 'novel',
          title: 'Book',
          deletedAt,
          data: { id: 'novel-1', title: 'Book', lastEdited: staleDate, createdAt: staleDate },
        },
        {
          id: 'mem-1',
          type: 'memory',
          title: 'Memory',
          deletedAt,
          data: {
            id: 'mem-1',
            bookId: 'novel-1',
            content: '内容',
            summary: '摘要',
            createdAt: staleDate.getTime(),
            lastAccessedAt: staleDate.getTime(),
          },
        },
      ]);

      const restoredNovel = (addBookSpy.mock.calls[0] as unknown as unknown[] | undefined)?.[0] as {
        lastEdited: Date | string;
      };
      expect(new Date(restoredNovel.lastEdited).getTime()).toBeGreaterThanOrEqual(before);

      const restoredMemory = upsertSpy.mock.calls[0]?.[0] as { lastAccessedAt: number };
      expect(restoredMemory.lastAccessedAt).toBeGreaterThanOrEqual(before);

      // 恢复的 novel 对应的墓碑被清除，其他墓碑保留
      const gistSyncPatch = (
        mockSettingsStore.updateGistSync.mock.calls[0] as unknown as unknown[] | undefined
      )?.[0] as {
        knownRemoteTombstones?: Record<string, string>;
      };
      expect(gistSyncPatch?.knownRemoteTombstones?.['novel:novel-1']).toBeUndefined();
      expect(gistSyncPatch?.knownRemoteTombstones?.['novel:other']).toBeDefined();
    });

    it('首次上传失败但 Gist 已创建时，应持久化 gistId 防止重试产生孤儿 Gist', async () => {
      mockSettingsStore.gistSync = createSyncConfigWithoutGistId();
      spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(true);
      spyOn(GistSyncService.prototype, 'uploadToGist').mockResolvedValue({
        success: false,
        gistId: 'created-but-unverified',
        error: '上传验证失败',
      } as any);

      const { sync } = useGistSync();
      await sync();

      expect(mockSettingsStore.setGistId).toHaveBeenCalledWith('created-but-unverified');
      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'error', summary: '上传失败' }),
      );
    });

    it('首次上传（无 gistId）不得把 syncs（含 GitHub token）写入 Gist', async () => {
      mockSettingsStore.gistSync = createSyncConfigWithoutGistId();
      mockSettingsStore.getAllSettings = mock(
        () =>
          ({
            lastEdited: new Date(0),
            syncs: [{ secret: 'super-secret-token', syncParams: { token: 'super-secret-token' } }],
          }) as any,
      );
      spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(true);
      const legacyUploadSpy = spyOn(GistSyncService.prototype, 'uploadToGist').mockResolvedValue({
        success: true,
        gistId: 'new-gist-id',
      } as any);

      const { sync } = useGistSync();
      await sync();

      expect(legacyUploadSpy).toHaveBeenCalled();
      const dataArg = legacyUploadSpy.mock.calls[0]?.[1] as { appSettings?: { syncs?: unknown } };
      expect(dataArg?.appSettings).toBeDefined();
      expect(dataArg?.appSettings?.syncs).toBeUndefined();
    });
  });

  describe('error paths', () => {
    it('upload fails: surfaces error toast', async () => {
      spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
        success: true,
        skipped: true,
        remoteETag: 'etag-v1',
      });
      spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(true);
      spyOn(GistSyncService.prototype, 'verifyRemoteUnchanged').mockResolvedValue({
        status: 'unchanged',
        etag: 'etag-v1',
      });
      spyOn(GistSyncService.prototype, 'uploadToGistIncremental').mockRejectedValue(
        new Error('PATCH 失败'),
      );

      const { sync } = useGistSync();
      await sync();

      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'error', summary: '上传失败' }),
      );
    });
  });
});
