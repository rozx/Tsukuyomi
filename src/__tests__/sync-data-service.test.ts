import { describe, expect, it, mock, beforeEach } from 'bun:test';
import { SyncDataService } from '../services/sync-data-service';

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
    it('应总是使用最新的 lastEdited 时间（远程较新）', async () => {
      const baseDate = new Date('2024-01-01T00:00:00.000Z');
      const laterDate = new Date('2024-01-02T00:00:00.000Z');

      const remoteData = {
        novels: [{ id: 'n1', title: 'Remote Novel', lastEdited: laterDate }],
        aiModels: [{ id: 'm1', name: 'Remote Model', lastEdited: laterDate }],
        appSettings: { theme: 'dark', lastEdited: laterDate },
        coverHistory: [{ id: 'c1', url: 'remote.jpg', addedAt: laterDate }],
      };

      mockAIModelsStore.models = [{ id: 'm1', name: 'Local Model', lastEdited: baseDate }];
      mockBooksStore.books = [{ id: 'n1', title: 'Local Novel', lastEdited: baseDate }];
      mockCoverHistoryStore.covers = [{ id: 'c1', url: 'local.jpg', addedAt: baseDate }];
      mockSettingsStore.getAllSettings = mock(() => ({ lastEdited: baseDate }));

      await SyncDataService.applyDownloadedData(remoteData);

      // Should use Remote Model (newer)
      expect(mockAIModelsStore.addModel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Remote Model' }),
      );

      // Verify Novels
      expect(mockBooksStore.bulkAddBooks).toHaveBeenCalled();
      const addedBooks = mockBooksStore.bulkAddBooks.mock.calls[0]?.[0] as any[];
      expect(addedBooks[0]).toMatchObject({ title: 'Remote Novel' });

      // Verify Settings
      expect(mockSettingsStore.importSettings).toHaveBeenCalledWith(
        expect.objectContaining({ theme: 'dark' }),
      );

      // Verify Cover History
      expect(mockCoverHistoryStore.addCover).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'remote.jpg' }),
      );
    });

    it('应总是使用最新的 lastEdited 时间（本地较新）', async () => {
      const baseDate = new Date('2024-01-01T00:00:00.000Z');
      const laterDate = new Date('2024-01-02T00:00:00.000Z');

      const remoteData = {
        aiModels: [{ id: 'm1', name: 'Remote Model', lastEdited: baseDate }],
        appSettings: { theme: 'remote', lastEdited: baseDate },
      };
      mockAIModelsStore.models = [{ id: 'm1', name: 'Local Model', lastEdited: laterDate }];
      mockSettingsStore.getAllSettings = mock(() => ({ lastEdited: laterDate }));

      await SyncDataService.applyDownloadedData(remoteData);

      // Should use Local Model (newer)
      expect(mockAIModelsStore.addModel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Local Model' }),
      );

      // Settings should not be updated (local is newer)
      expect(mockSettingsStore.importSettings).not.toHaveBeenCalled();
    });

    it('当远程数据较新时，应应用远程数据', async () => {
      const baseDate = new Date('2024-01-01T00:00:00.000Z');
      const laterDate = new Date('2024-01-02T00:00:00.000Z');

      const remoteData = {
        aiModels: [{ id: 'm1', name: 'Remote Model', lastEdited: laterDate }],
      };
      mockAIModelsStore.models = [{ id: 'm1', name: 'Local Model', lastEdited: baseDate }];

      await SyncDataService.applyDownloadedData(remoteData);

      // Should use Remote Model (newer)
      expect(mockAIModelsStore.addModel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Remote Model' }),
      );
    });

    it('当本地数据较新时，应保留本地数据', async () => {
      const baseDate = new Date('2024-01-01T00:00:00.000Z');
      const laterDate = new Date('2024-01-02T00:00:00.000Z');

      const remoteData = {
        aiModels: [{ id: 'm1', name: 'Remote Model', lastEdited: baseDate }],
      };
      mockAIModelsStore.models = [{ id: 'm1', name: 'Local Model', lastEdited: laterDate }];

      await SyncDataService.applyDownloadedData(remoteData);

      // Should use Local Model (newer)
      expect(mockAIModelsStore.addModel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Local Model' }),
      );
    });
  });
});
