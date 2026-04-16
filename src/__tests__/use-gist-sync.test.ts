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
    updateLastSyncedModelIds: mock(() => Promise.resolve()),
    updateLastRemoteETag: mock(() => Promise.resolve()),
    updateKnownRemoteHashes: mock(() => Promise.resolve()),
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
    spyOn(ChapterContentService, 'loadAllChapterContentsForNovels').mockImplementation(
      (books) => Promise.resolve(books),
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
      const applySpy = spyOn(SyncDataService, 'applyPartialRemoteData').mockResolvedValue();
      const hasChangesSpy = spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(
        false,
      );
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
        remoteEntryKeys: Object.keys(remoteManifest.entries),
      } as any);
      const applySpy = spyOn(SyncDataService, 'applyPartialRemoteData').mockResolvedValue();
      spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(false);

      const { sync } = useGistSync();
      await sync();

      expect(applySpy).toHaveBeenCalledWith(
        expect.objectContaining({ [novelEntryKey('book-1')]: expect.any(Object) }),
      );
      expect(mockSettingsStore.updateLastRemoteETag).toHaveBeenCalledWith('etag-v2');
      expect(mockSettingsStore.updateKnownRemoteHashes).toHaveBeenCalled();
    });

    it('remote deletion: propagates to local via applyRemoteDeletions', async () => {
      const remoteManifest = makeManifest();
      // Simulate: book-2 was in knownRemote but is no longer in remote manifest
      spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
        success: true,
        skipped: false,
        remoteETag: 'etag-v2',
        remoteUpdatedAt: '2026-04-16T00:00:00Z',
        manifest: remoteManifest,
        changedEntries: {},
        deletedEntries: [novelEntryKey('book-2')],
        remoteEntryKeys: Object.keys(remoteManifest.entries),
      } as any);
      spyOn(SyncDataService, 'applyPartialRemoteData').mockResolvedValue();
      const deleteSpy = spyOn(SyncDataService, 'applyRemoteDeletions').mockResolvedValue();
      spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(false);

      const { sync } = useGistSync();
      await sync();

      expect(deleteSpy).toHaveBeenCalledWith([novelEntryKey('book-2')]);
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
        remoteEntryKeys: Object.keys(remoteManifest.entries),
      } as any);
      spyOn(SyncDataService, 'applyPartialRemoteData').mockResolvedValue();
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

    it('first sync (no gistId): uses legacy uploadToGist to create the Gist', async () => {
      mockSettingsStore.gistSync = createSyncConfigWithoutGistId();
      spyOn(SyncDataService, 'hasLocalChangesByHash').mockReturnValue(true);
      const legacyUploadSpy = spyOn(
        GistSyncService.prototype,
        'uploadToGist',
      ).mockResolvedValue({
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
