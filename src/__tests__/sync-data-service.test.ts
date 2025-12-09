import { describe, expect, it, mock, beforeEach } from 'bun:test';
import { SyncDataService } from '../services/sync-data-service';
import type { ConflictResolution } from '../services/conflict-detection-service';
import { ConflictType } from '../services/conflict-detection-service';

// Mock Stores
const mockAIModelsStore = {
  models: [] as unknown[],
  clearModels: mock(() => Promise.resolve()),
  addModel: mock((_model: unknown) => Promise.resolve()),
};

const mockBooksStore = {
  books: [] as unknown[],
  clearBooks: mock(() => Promise.resolve()),
  bulkAddBooks: mock((_books: unknown[]) => Promise.resolve()),
};

const mockCoverHistoryStore = {
  covers: [] as unknown[],
  clearHistory: mock(() => Promise.resolve()),
  addCover: mock((_cover: unknown) => Promise.resolve()),
};

const mockSettingsStore = {
  gistSync: { lastSyncTime: 0 },
  importSettings: mock((_settings: unknown) => Promise.resolve()),
  updateGistSync: mock((_config: unknown) => Promise.resolve()),
  getAllSettings: mock(() => ({ lastEdited: new Date(0) })),
};

// Mock Modules
await mock.module('src/stores/ai-models', () => ({
  useAIModelsStore: () => mockAIModelsStore,
}));

await mock.module('src/stores/books', () => ({
  useBooksStore: () => mockBooksStore,
}));

await mock.module('src/stores/cover-history', () => ({
  useCoverHistoryStore: () => mockCoverHistoryStore,
}));

await mock.module('src/stores/settings', () => ({
  useSettingsStore: () => mockSettingsStore,
}));

// Mock ChapterContentService
await mock.module('src/services/chapter-content-service', () => ({
  ChapterContentService: {
    loadChapterContent: mock(() => Promise.resolve([])),
  },
}));

// Mock SyncDataService static methods that involve complex logic we don't want to test here
// Note: We can't easily mock static methods of the class we are testing if we import the class directly.
// However, we can mock the dependencies they use.
// For mergeNovelWithLocalContent and ensureNovelContentLoaded, they use ChapterContentService which we mocked.

describe('数据同步服务 (SyncDataService)', () => {
  beforeEach(() => {
    mockAIModelsStore.models = [];
    mockAIModelsStore.clearModels.mockClear();
    mockAIModelsStore.addModel.mockClear();

    mockBooksStore.books = [];
    mockBooksStore.clearBooks.mockClear();
    mockBooksStore.bulkAddBooks.mockClear();

    mockCoverHistoryStore.covers = [];
    mockCoverHistoryStore.clearHistory.mockClear();
    mockCoverHistoryStore.addCover.mockClear();

    mockSettingsStore.importSettings.mockClear();
    mockSettingsStore.updateGistSync.mockClear();
  });

  describe('applyDownloadedData (应用下载数据)', () => {
    it('当没有冲突（resolutions 为空）且意图为下载时，应应用远程数据', async () => {
      const remoteData = {
        novels: [{ id: 'n1', title: 'Remote Novel' }],
        aiModels: [{ id: 'm1', name: 'Remote Model' }],
        appSettings: { theme: 'dark' },
        coverHistory: [{ id: 'c1', url: 'remote.jpg' }],
      };

      // Local state is empty or different but no conflict detected (simulated by empty resolutions)
      mockAIModelsStore.models = [{ id: 'm1', name: 'Local Model' }];

      await SyncDataService.applyDownloadedData(remoteData, [], 'download');

      // Verify AI Models
      expect(mockAIModelsStore.clearModels).toHaveBeenCalled();
      expect(mockAIModelsStore.addModel).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'm1', name: 'Remote Model' }),
      );

      // Verify Novels
      expect(mockBooksStore.clearBooks).toHaveBeenCalled();
      expect(mockBooksStore.bulkAddBooks).toHaveBeenCalled();
      const addedBooks = mockBooksStore.bulkAddBooks.mock.calls[0]?.[0] as any[];
      expect(addedBooks[0]).toMatchObject({ id: 'n1', title: 'Remote Novel' });

      // Verify Settings
      expect(mockSettingsStore.importSettings).toHaveBeenCalledWith(remoteData.appSettings);

      // Verify Cover History
      expect(mockCoverHistoryStore.clearHistory).toHaveBeenCalled();
      expect(mockCoverHistoryStore.addCover).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'c1', url: 'remote.jpg' }),
      );
    });

    it('当没有冲突（resolutions 为空）且意图为上传时，应保留本地数据', async () => {
      const remoteData = {
        aiModels: [{ id: 'm1', name: 'Remote Model' }],
      };
      mockAIModelsStore.models = [{ id: 'm1', name: 'Local Model' }];

      await SyncDataService.applyDownloadedData(remoteData, [], 'upload');

      // Should use Local Model
      expect(mockAIModelsStore.addModel).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'm1', name: 'Local Model' }),
      );
    });

    it('当冲突解决策略明确为 "remote" 时，应应用远程数据', async () => {
      const remoteData = {
        aiModels: [{ id: 'm1', name: 'Remote Model' }],
      };
      mockAIModelsStore.models = [{ id: 'm1', name: 'Local Model' }];

      const resolutions: ConflictResolution[] = [
        { conflictId: 'm1', type: ConflictType.AIModel, choice: 'remote' },
      ];

      await SyncDataService.applyDownloadedData(remoteData, resolutions);

      expect(mockAIModelsStore.addModel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Remote Model' }),
      );
    });

    it('当冲突解决策略明确为 "local" 时，应应用本地数据', async () => {
      const remoteData = {
        aiModels: [{ id: 'm1', name: 'Remote Model' }],
      };
      mockAIModelsStore.models = [{ id: 'm1', name: 'Local Model' }];

      const resolutions: ConflictResolution[] = [
        { conflictId: 'm1', type: ConflictType.AIModel, choice: 'local' },
      ];

      await SyncDataService.applyDownloadedData(remoteData, resolutions);

      expect(mockAIModelsStore.addModel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Local Model' }),
      );
    });

    it('即使其他项有冲突，非冲突项也应根据意图应用数据（下载：远程）', async () => {
      // m1 has conflict (resolved to local), m2 has no conflict (should update to remote)
      const remoteData = {
        aiModels: [
          { id: 'm1', name: 'Remote Model 1' },
          { id: 'm2', name: 'Remote Model 2' },
        ],
      };
      mockAIModelsStore.models = [
        { id: 'm1', name: 'Local Model 1' },
        { id: 'm2', name: 'Local Model 2' },
      ];

      const resolutions: ConflictResolution[] = [
        { conflictId: 'm1', type: ConflictType.AIModel, choice: 'local' },
      ];

      await SyncDataService.applyDownloadedData(remoteData, resolutions, 'download');

      // m1 should be local
      expect(mockAIModelsStore.addModel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Local Model 1' }),
      );
      // m2 should be remote (because resolution is undefined, and intent is download)
      expect(mockAIModelsStore.addModel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Remote Model 2' }),
      );
    });

    it('即使其他项有冲突，非冲突项也应根据意图应用数据（上传：本地）', async () => {
      // m1 has conflict (resolved to local), m2 has no conflict (should keep local)
      const remoteData = {
        aiModels: [
          { id: 'm1', name: 'Remote Model 1' },
          { id: 'm2', name: 'Remote Model 2' },
        ],
      };
      mockAIModelsStore.models = [
        { id: 'm1', name: 'Local Model 1' },
        { id: 'm2', name: 'Local Model 2' },
      ];

      const resolutions: ConflictResolution[] = [
        { conflictId: 'm1', type: ConflictType.AIModel, choice: 'local' },
      ];

      await SyncDataService.applyDownloadedData(remoteData, resolutions, 'upload');

      // m1 should be local
      expect(mockAIModelsStore.addModel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Local Model 1' }),
      );
      // m2 should be local (because resolution is undefined, and intent is upload)
      expect(mockAIModelsStore.addModel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Local Model 2' }),
      );
    });

    it('当意图为自动同步时，应选择较新的数据（远程较新）', async () => {
      const baseDate = new Date('2024-01-01T00:00:00.000Z');
      const laterDate = new Date('2024-01-02T00:00:00.000Z');

      const remoteData = {
        aiModels: [{ id: 'm1', name: 'Remote Model', lastEdited: laterDate }],
      };
      mockAIModelsStore.models = [{ id: 'm1', name: 'Local Model', lastEdited: baseDate }];

      await SyncDataService.applyDownloadedData(remoteData, [], 'auto');

      // Should use Remote Model (newer)
      expect(mockAIModelsStore.addModel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Remote Model' }),
      );
    });

    it('当意图为自动同步时，应选择较新的数据（本地较新）', async () => {
      const baseDate = new Date('2024-01-01T00:00:00.000Z');
      const laterDate = new Date('2024-01-02T00:00:00.000Z');

      const remoteData = {
        aiModels: [{ id: 'm1', name: 'Remote Model', lastEdited: baseDate }],
      };
      mockAIModelsStore.models = [{ id: 'm1', name: 'Local Model', lastEdited: laterDate }];

      await SyncDataService.applyDownloadedData(remoteData, [], 'auto');

      // Should use Local Model (newer)
      expect(mockAIModelsStore.addModel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Local Model' }),
      );
    });

    it('当设置没有冲突解决记录时，应应用远程设置', async () => {
      const remoteData = {
        appSettings: { theme: 'remote' },
      };

      // Resolutions might contain other items, but not settings
      const resolutions: ConflictResolution[] = [
        { conflictId: 'some-novel', type: ConflictType.Novel, choice: 'local' },
      ];

      await SyncDataService.applyDownloadedData(remoteData, resolutions);

      expect(mockSettingsStore.importSettings).toHaveBeenCalledWith({ theme: 'remote' });
    });

    it('当设置的冲突解决策略为 "local" 时，不应应用远程设置', async () => {
      const remoteData = {
        appSettings: { theme: 'remote' },
      };

      const resolutions: ConflictResolution[] = [
        { conflictId: 'app-settings', type: ConflictType.Settings, choice: 'local' },
      ];

      await SyncDataService.applyDownloadedData(remoteData, resolutions);

      expect(mockSettingsStore.importSettings).not.toHaveBeenCalled();
    });
  });
});
