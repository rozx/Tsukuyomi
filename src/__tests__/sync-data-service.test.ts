import { describe, expect, it, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { SyncDataService, type RestorableItem } from '../services/sync-data-service';
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
  gistSync: {
    lastSyncTime: 0,
    deletedNovelIds: [] as Array<{ id: string; deletedAt: number }>,
    deletedModelIds: [] as Array<{ id: string; deletedAt: number }>,
    deletedCoverIds: [] as Array<{ id: string; deletedAt: number }>,
  },
  importSettings: mock((_settings: unknown) => Promise.resolve()),
  updateGistSync: mock((_config: unknown) => Promise.resolve()),
  getAllSettings: mock(() => ({ lastEdited: new Date(0) })),
  cleanupOldDeletionRecords: mock(() => Promise.resolve()),
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
    mockSettingsStore.cleanupOldDeletionRecords.mockClear();
    mockSettingsStore.gistSync = {
      lastSyncTime: 0,
      deletedNovelIds: [],
      deletedModelIds: [],
      deletedCoverIds: [],
    };
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

    it('自动同步时不应返回可恢复的项目', async () => {
      const lastSyncTime = new Date('2024-01-01').getTime();
      const deletionTime = new Date('2024-01-02').getTime(); // 删除时间晚于同步时间

      // 设置删除记录
      mockSettingsStore.gistSync.deletedNovelIds = [
        { id: 'n1', deletedAt: deletionTime },
      ];

      const remoteData = {
        novels: [{ id: 'n1', title: 'Deleted Novel', lastEdited: new Date('2024-01-01').toISOString() }],
      };

      const result = await SyncDataService.applyDownloadedData(remoteData, lastSyncTime, false);

      // 自动同步时应该返回空数组
      expect(result).toEqual([]);
      // 应该调用 bulkAddBooks（即使传入空数组），但不应该包含已删除的书籍
      if (mockBooksStore.bulkAddBooks.mock.calls.length > 0) {
        const addedBooks = mockBooksStore.bulkAddBooks.mock.calls[0]?.[0] as any[];
        expect(addedBooks).not.toContainEqual(expect.objectContaining({ id: 'n1' }));
      }
    });

    it('手动检索时应返回可恢复的书籍项目', async () => {
      const lastSyncTime = new Date('2024-01-01').getTime();
      const deletionTime = new Date('2024-01-02').getTime(); // 删除时间晚于同步时间

      // 设置删除记录
      mockSettingsStore.gistSync.deletedNovelIds = [
        { id: 'n1', deletedAt: deletionTime },
      ];

      const remoteData = {
        novels: [{ id: 'n1', title: 'Deleted Novel', lastEdited: new Date('2024-01-01').toISOString() }],
      };

      const result = await SyncDataService.applyDownloadedData(remoteData, lastSyncTime, true);

      // 手动检索时应该返回可恢复的项目
      expect(result).toHaveLength(1);
      const item = result[0]!;
      expect(item).toMatchObject({
        id: 'n1',
        type: 'novel',
        title: 'Deleted Novel',
        deletedAt: deletionTime,
      });
      expect(item.data).toMatchObject({ id: 'n1', title: 'Deleted Novel' });
      // 应该调用 bulkAddBooks，但不应该包含已删除的书籍（需要用户手动选择恢复）
      if (mockBooksStore.bulkAddBooks.mock.calls.length > 0) {
        const addedBooks = mockBooksStore.bulkAddBooks.mock.calls[0]?.[0] as any[];
        expect(addedBooks).not.toContainEqual(expect.objectContaining({ id: 'n1' }));
      }
    });

    it('手动检索时应返回可恢复的模型项目', async () => {
      const lastSyncTime = new Date('2024-01-01').getTime();
      const deletionTime = new Date('2024-01-02').getTime();

      // 设置删除记录
      mockSettingsStore.gistSync.deletedModelIds = [
        { id: 'm1', deletedAt: deletionTime },
      ];

      const remoteData = {
        aiModels: [{ id: 'm1', name: 'Deleted Model', lastEdited: new Date('2024-01-01').toISOString() }],
      };

      const result = await SyncDataService.applyDownloadedData(remoteData, lastSyncTime, true);

      // 手动检索时应该返回可恢复的项目
      expect(result).toHaveLength(1);
      const item = result[0]!;
      expect(item).toMatchObject({
        id: 'm1',
        type: 'model',
        deletedAt: deletionTime,
      });
      expect(item.data).toMatchObject({ id: 'm1', name: 'Deleted Model' });
    });

    it('手动检索时应返回可恢复的封面项目', async () => {
      const lastSyncTime = new Date('2024-01-01').getTime();
      const deletionTime = new Date('2024-01-02').getTime();

      // 设置删除记录
      mockSettingsStore.gistSync.deletedCoverIds = [
        { id: 'c1', deletedAt: deletionTime },
      ];

      const remoteData = {
        coverHistory: [{ id: 'c1', url: 'deleted.jpg', addedAt: new Date('2024-01-01').toISOString() }],
      };

      const result = await SyncDataService.applyDownloadedData(remoteData, lastSyncTime, true);

      // 手动检索时应该返回可恢复的项目
      expect(result).toHaveLength(1);
      const item = result[0]!;
      expect(item).toMatchObject({
        id: 'c1',
        type: 'cover',
        deletedAt: deletionTime,
      });
      expect(item.data).toMatchObject({ id: 'c1', url: 'deleted.jpg' });
    });

    it('手动检索时应返回多个不同类型的可恢复项目', async () => {
      const lastSyncTime = new Date('2024-01-01').getTime();
      const deletionTime = new Date('2024-01-02').getTime();

      // 设置多个删除记录
      mockSettingsStore.gistSync.deletedNovelIds = [
        { id: 'n1', deletedAt: deletionTime },
      ];
      mockSettingsStore.gistSync.deletedModelIds = [
        { id: 'm1', deletedAt: deletionTime },
      ];
      mockSettingsStore.gistSync.deletedCoverIds = [
        { id: 'c1', deletedAt: deletionTime },
      ];

      const remoteData = {
        novels: [{ id: 'n1', title: 'Deleted Novel', lastEdited: new Date('2024-01-01').toISOString() }],
        aiModels: [{ id: 'm1', name: 'Deleted Model', lastEdited: new Date('2024-01-01').toISOString() }],
        coverHistory: [{ id: 'c1', url: 'deleted.jpg', addedAt: new Date('2024-01-01').toISOString() }],
      };

      const result = await SyncDataService.applyDownloadedData(remoteData, lastSyncTime, true);

      // 应该返回三个可恢复的项目
      expect(result).toHaveLength(3);
      
      const novelItem = result.find((item) => item.type === 'novel');
      const modelItem = result.find((item) => item.type === 'model');
      const coverItem = result.find((item) => item.type === 'cover');

      expect(novelItem).toBeDefined();
      expect(novelItem?.id).toBe('n1');
      expect(modelItem).toBeDefined();
      expect(modelItem?.id).toBe('m1');
      expect(coverItem).toBeDefined();
      expect(coverItem?.id).toBe('c1');
    });

    it('当删除时间早于同步时间且远程有更新时，应自动恢复项目', async () => {
      const lastSyncTime = new Date('2024-01-02').getTime();
      const deletionTime = new Date('2024-01-01').getTime(); // 删除时间早于同步时间
      const remoteUpdateTime = new Date('2024-01-03').toISOString(); // 远程更新时间晚于同步时间

      // 设置删除记录
      mockSettingsStore.gistSync.deletedNovelIds = [
        { id: 'n1', deletedAt: deletionTime },
      ];

      const remoteData = {
        novels: [{ id: 'n1', title: 'Updated Novel', lastEdited: remoteUpdateTime }],
      };

      const result = await SyncDataService.applyDownloadedData(remoteData, lastSyncTime, false);

      // 自动同步时应该返回空数组
      expect(result).toEqual([]);
      // 应该自动恢复并更新书籍（因为远程有更新）
      expect(mockBooksStore.bulkAddBooks).toHaveBeenCalled();
      // 应该从删除记录中移除
      expect(mockSettingsStore.updateGistSync).toHaveBeenCalledWith(
        expect.objectContaining({
          deletedNovelIds: [],
        }),
      );
    });
  });
});
