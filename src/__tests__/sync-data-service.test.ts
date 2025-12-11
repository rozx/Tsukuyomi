import { describe, expect, it, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { SyncDataService } from '../services/sync-data-service';
import { ChapterContentService } from '../services/chapter-content-service';

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
  getBookById: mock(() => null),
  updateBook: mock(() => Promise.resolve()),
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

describe('数据同步服务 (SyncDataService)', () => {
  beforeEach(() => {
    spyOn(ChapterContentService, 'loadChapterContent').mockResolvedValue([]);
    spyOn(ChapterContentService, 'clearAllCache').mockImplementation(() => {});
    spyOn(ChapterContentService, 'clearCache').mockImplementation(() => {});

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

  afterEach(() => {
    mock.restore();
  });

  describe('applyDownloadedData (应用下载数据)', () => {
    it('当本地为空时，应应用所有远程数据', async () => {
      const remoteData = {
        novels: [{ id: 'n1', title: 'Remote Novel', lastEdited: new Date().toISOString() }],
        aiModels: [{ id: 'm1', name: 'Remote Model', lastEdited: new Date().toISOString() }],
        appSettings: { theme: 'dark' },
        coverHistory: [{ id: 'c1', url: 'remote.jpg' }],
      };

      await SyncDataService.applyDownloadedData(remoteData);

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

    it('当远程数据较新时，应更新本地数据', async () => {
      const oldDate = new Date('2024-01-01').toISOString();
      const newDate = new Date('2024-01-02').toISOString();

      const remoteData = {
        aiModels: [{ id: 'm1', name: 'Remote Model', lastEdited: newDate }],
      };
      mockAIModelsStore.models = [{ id: 'm1', name: 'Local Model', lastEdited: oldDate }];

      await SyncDataService.applyDownloadedData(remoteData);

      expect(mockAIModelsStore.addModel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Remote Model' }),
      );
    });

    it('当本地数据较新时，应保留本地数据', async () => {
      const oldDate = new Date('2024-01-01').toISOString();
      const newDate = new Date('2024-01-02').toISOString();

      const remoteData = {
        aiModels: [{ id: 'm1', name: 'Remote Model', lastEdited: oldDate }],
      };
      mockAIModelsStore.models = [{ id: 'm1', name: 'Local Model', lastEdited: newDate }];

      await SyncDataService.applyDownloadedData(remoteData);

      expect(mockAIModelsStore.addModel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Local Model' }),
      );
    });

    it('应保留上次同步后新增的本地数据', async () => {
      const lastSyncTime = new Date('2024-01-01').getTime();
      const newDate = new Date('2024-01-02').toISOString();

      const remoteData = {
        aiModels: [{ id: 'm2', name: 'Remote Model', lastEdited: newDate }],
      };
      // Local has a new model added after sync
      mockAIModelsStore.models = [{ id: 'm1', name: 'New Local Model', lastEdited: newDate }];

      await SyncDataService.applyDownloadedData(remoteData, lastSyncTime);

      expect(mockAIModelsStore.addModel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Local Model' }),
      );
      expect(mockAIModelsStore.addModel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Remote Model' }),
      );
    });

    it('应删除上次同步前存在但远程已删除的本地数据', async () => {
      const lastSyncTime = new Date('2024-01-02').getTime();
      const oldDate = new Date('2024-01-01').toISOString();
      const newDate = new Date('2024-01-03').toISOString();

      const remoteData = {
        aiModels: [{ id: 'm2', name: 'Remote Model', lastEdited: newDate }],
      };
      // Local has an old model (not modified since sync)
      mockAIModelsStore.models = [{ id: 'm1', name: 'Old Local Model', lastEdited: oldDate }];

      await SyncDataService.applyDownloadedData(remoteData, lastSyncTime);

      // Should NOT add the old model back (effectively deleting it)
      expect(mockAIModelsStore.addModel).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Old Local Model' }),
      );
      // Should add the remote model
      expect(mockAIModelsStore.addModel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Remote Model' }),
      );
    });
  });
});
