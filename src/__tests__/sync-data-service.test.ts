import { describe, expect, it, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { SyncDataService } from '../services/sync-data-service';
import { ChapterContentService } from '../services/chapter-content-service';
import { aiModelService } from '../services/ai-model-service';

// Mock aiModelService methods
const mockSaveModel = mock((_model: unknown) => Promise.resolve());
const mockDeleteModel = mock((_id: string) => Promise.resolve());

// Mock Stores
const mockAIModelsStore = {
  models: [] as unknown[],
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
    deletedCoverUrls: [] as Array<{ url: string; deletedAt: number }>,
  },
  importSettings: mock((_settings: unknown) => Promise.resolve()),
  updateGistSync: mock((_config: unknown) => Promise.resolve()),
  getAllSettings: mock(() => ({ lastEdited: new Date(0) })),
  cleanupOldDeletionRecords: mock(() => Promise.resolve()),
};

const mockMemoryService = {
  getAllMemories: mock((_bookId: string) => Promise.resolve([] as any[])), // eslint-disable-line @typescript-eslint/no-explicit-any
  updateMemory: mock((_bookId: string, _memoryId: string, _content: string, _summary: string) =>
    Promise.resolve(),
  ),
  createMemory: mock((_bookId: string, _content: string, _summary: string) => Promise.resolve()),
  createMemoryWithId: mock(
    (
      _bookId: string,
      _memoryId: string,
      _content: string,
      _summary: string,
      _timestamps?: { createdAt?: number; lastAccessedAt?: number },
    ) => Promise.resolve(),
  ),
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

import { MemoryService } from 'src/services/memory-service';

// Mock ChapterContentService

describe('数据同步服务 (SyncDataService)', () => {
  beforeEach(() => {
    spyOn(ChapterContentService, 'loadChapterContent').mockResolvedValue([]);
    spyOn(ChapterContentService, 'clearAllCache').mockImplementation(() => {});
    spyOn(ChapterContentService, 'clearCache').mockImplementation(() => {});

    mockAIModelsStore.models = [];
    mockSaveModel.mockClear();
    mockDeleteModel.mockClear();
    spyOn(aiModelService, 'saveModel').mockImplementation(mockSaveModel as any);
    spyOn(aiModelService, 'deleteModel').mockImplementation(mockDeleteModel as any);

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
      deletedCoverUrls: [],
    };

    mockMemoryService.getAllMemories.mockClear();
    mockMemoryService.updateMemory.mockClear();
    mockMemoryService.createMemory.mockClear();
    mockMemoryService.createMemoryWithId.mockClear();

    spyOn(MemoryService, 'getAllMemories').mockImplementation(
      mockMemoryService.getAllMemories as typeof MemoryService.getAllMemories,
    );
    spyOn(MemoryService, 'updateMemory').mockImplementation(
      mockMemoryService.updateMemory as unknown as typeof MemoryService.updateMemory,
    );
    spyOn(MemoryService, 'createMemory').mockImplementation(
      mockMemoryService.createMemory as unknown as typeof MemoryService.createMemory,
    );
    spyOn(MemoryService, 'createMemoryWithId').mockImplementation(
      mockMemoryService.createMemoryWithId as unknown as typeof MemoryService.createMemoryWithId,
    );
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
      expect(mockSaveModel).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'm1', name: 'Remote Model' }),
      );
      // Verify store models updated
      expect(mockAIModelsStore.models).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'm1', name: 'Remote Model' })]),
      );

      // Verify Novels (uses put/upsert via bulkAddBooks, no clearBooks)
      expect(mockBooksStore.bulkAddBooks).toHaveBeenCalled();
      const addedBooks = mockBooksStore.bulkAddBooks.mock.calls[0]?.[0] as Array<
        Record<string, unknown>
      >;
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

      expect(mockSaveModel).toHaveBeenCalledWith(expect.objectContaining({ name: 'Remote Model' }));
      expect(mockAIModelsStore.models).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'Remote Model' })]),
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

      expect(mockSaveModel).toHaveBeenCalledWith(expect.objectContaining({ name: 'Local Model' }));
      expect(mockAIModelsStore.models).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'Local Model' })]),
      );
    });

    it('同步时应保留本地章节摘要（远程缺失 summary 不应覆盖）', async () => {
      const localLastEdited = new Date('2024-01-03').toISOString();
      const remoteLastEdited = new Date('2024-01-02').toISOString();

      // 本地书籍较新 → 走 mergeRemoteTranslationsIntoLocalNovel 分支
      mockBooksStore.books = [
        {
          id: 'n1',
          title: 'Local Novel',
          lastEdited: localLastEdited,
          createdAt: new Date('2024-01-01').toISOString(),
          volumes: [
            {
              id: 'v1',
              title: { original: 'v', translation: { id: 't1', translation: '', aiModelId: '' } },
              chapters: [
                {
                  id: 'c1',
                  title: {
                    original: 'c',
                    translation: { id: 't2', translation: '', aiModelId: '' },
                  },
                  summary: '本地摘要',
                  lastEdited: localLastEdited,
                  createdAt: new Date('2024-01-01').toISOString(),
                  content: [],
                },
              ],
            },
          ],
        },
      ];

      const remoteData = {
        novels: [
          {
            id: 'n1',
            title: 'Remote Novel',
            lastEdited: remoteLastEdited,
            createdAt: new Date('2024-01-01').toISOString(),
            volumes: [
              {
                id: 'v1',
                title: { original: 'v', translation: { id: 't1', translation: '', aiModelId: '' } },
                chapters: [
                  {
                    id: 'c1',
                    title: {
                      original: 'c',
                      translation: { id: 't2', translation: '', aiModelId: '' },
                    },
                    // 远程缺失 summary
                    lastEdited: remoteLastEdited,
                    createdAt: new Date('2024-01-01').toISOString(),
                  },
                ],
              },
            ],
          },
        ],
      };

      await SyncDataService.applyDownloadedData(remoteData);

      const addedBooks = mockBooksStore.bulkAddBooks.mock.calls[0]?.[0] as Array<any>;
      const summary = addedBooks?.[0]?.volumes?.[0]?.chapters?.[0]?.summary;
      expect(summary).toBe('本地摘要');
    });

    it('同步时应从远程补齐章节摘要（本地缺失 summary 时）', async () => {
      const localLastEdited = new Date('2024-01-03').toISOString();
      const remoteLastEdited = new Date('2024-01-02').toISOString();

      // 本地书籍较新 → 走 mergeRemoteTranslationsIntoLocalNovel 分支
      mockBooksStore.books = [
        {
          id: 'n1',
          title: 'Local Novel',
          lastEdited: localLastEdited,
          createdAt: new Date('2024-01-01').toISOString(),
          volumes: [
            {
              id: 'v1',
              title: { original: 'v', translation: { id: 't1', translation: '', aiModelId: '' } },
              chapters: [
                {
                  id: 'c1',
                  title: {
                    original: 'c',
                    translation: { id: 't2', translation: '', aiModelId: '' },
                  },
                  // 本地缺失 summary
                  lastEdited: localLastEdited,
                  createdAt: new Date('2024-01-01').toISOString(),
                  content: [],
                },
              ],
            },
          ],
        },
      ];

      const remoteData = {
        novels: [
          {
            id: 'n1',
            title: 'Remote Novel',
            lastEdited: remoteLastEdited,
            createdAt: new Date('2024-01-01').toISOString(),
            volumes: [
              {
                id: 'v1',
                title: { original: 'v', translation: { id: 't1', translation: '', aiModelId: '' } },
                chapters: [
                  {
                    id: 'c1',
                    title: {
                      original: 'c',
                      translation: { id: 't2', translation: '', aiModelId: '' },
                    },
                    summary: '远程摘要',
                    lastEdited: remoteLastEdited,
                    createdAt: new Date('2024-01-01').toISOString(),
                  },
                ],
              },
            ],
          },
        ],
      };

      await SyncDataService.applyDownloadedData(remoteData);

      const addedBooks = mockBooksStore.bulkAddBooks.mock.calls[0]?.[0] as Array<any>;
      const summary = addedBooks?.[0]?.volumes?.[0]?.chapters?.[0]?.summary;
      expect(summary).toBe('远程摘要');
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

      expect(mockSaveModel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Local Model' }),
      );
      expect(mockSaveModel).toHaveBeenCalledWith(expect.objectContaining({ name: 'Remote Model' }));
      expect(mockAIModelsStore.models).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'New Local Model' }),
          expect.objectContaining({ name: 'Remote Model' }),
        ]),
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

      // Should NOT save the old model (effectively deleting it)
      expect(mockSaveModel).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Old Local Model' }),
      );
      // Should save the remote model
      expect(mockSaveModel).toHaveBeenCalledWith(expect.objectContaining({ name: 'Remote Model' }));
      // Old model should be deleted
      expect(mockDeleteModel).toHaveBeenCalledWith('m1');
    });

    it('自动同步时不应返回可恢复的项目', async () => {
      const lastSyncTime = new Date('2024-01-01').getTime();
      const deletionTime = new Date('2024-01-02').getTime(); // 删除时间晚于同步时间

      // 设置删除记录
      mockSettingsStore.gistSync.deletedNovelIds = [{ id: 'n1', deletedAt: deletionTime }];

      const remoteData = {
        novels: [
          { id: 'n1', title: 'Deleted Novel', lastEdited: new Date('2024-01-01').toISOString() },
        ],
      };

      const result = await SyncDataService.applyDownloadedData(remoteData, lastSyncTime, false);

      // 自动同步时应该返回空数组
      expect(result).toEqual([]);
      // 应该调用 bulkAddBooks（即使传入空数组），但不应该包含已删除的书籍
      if (mockBooksStore.bulkAddBooks.mock.calls.length > 0) {
        const addedBooks = mockBooksStore.bulkAddBooks.mock.calls[0]?.[0] as Array<
          Record<string, unknown>
        >;
        expect(addedBooks).not.toContainEqual(expect.objectContaining({ id: 'n1' }));
      }
    });

    it('手动检索时应返回可恢复的书籍项目', async () => {
      const lastSyncTime = new Date('2024-01-01').getTime();
      const deletionTime = new Date('2024-01-02').getTime(); // 删除时间晚于同步时间

      // 设置删除记录
      mockSettingsStore.gistSync.deletedNovelIds = [{ id: 'n1', deletedAt: deletionTime }];

      const remoteData = {
        novels: [
          { id: 'n1', title: 'Deleted Novel', lastEdited: new Date('2024-01-01').toISOString() },
        ],
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
        const addedBooks = mockBooksStore.bulkAddBooks.mock.calls[0]?.[0] as Array<
          Record<string, unknown>
        >;
        expect(addedBooks).not.toContainEqual(expect.objectContaining({ id: 'n1' }));
      }
    });

    it('手动检索时应返回可恢复的模型项目', async () => {
      const lastSyncTime = new Date('2024-01-01').getTime();
      const deletionTime = new Date('2024-01-02').getTime();

      // 设置删除记录
      mockSettingsStore.gistSync.deletedModelIds = [{ id: 'm1', deletedAt: deletionTime }];

      const remoteData = {
        aiModels: [
          { id: 'm1', name: 'Deleted Model', lastEdited: new Date('2024-01-01').toISOString() },
        ],
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
      mockSettingsStore.gistSync.deletedCoverIds = [{ id: 'c1', deletedAt: deletionTime }];

      const remoteData = {
        coverHistory: [
          { id: 'c1', url: 'deleted.jpg', addedAt: new Date('2024-01-01').toISOString() },
        ],
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
      mockSettingsStore.gistSync.deletedNovelIds = [{ id: 'n1', deletedAt: deletionTime }];
      mockSettingsStore.gistSync.deletedModelIds = [{ id: 'm1', deletedAt: deletionTime }];
      mockSettingsStore.gistSync.deletedCoverIds = [{ id: 'c1', deletedAt: deletionTime }];

      const remoteData = {
        novels: [
          { id: 'n1', title: 'Deleted Novel', lastEdited: new Date('2024-01-01').toISOString() },
        ],
        aiModels: [
          { id: 'm1', name: 'Deleted Model', lastEdited: new Date('2024-01-01').toISOString() },
        ],
        coverHistory: [
          { id: 'c1', url: 'deleted.jpg', addedAt: new Date('2024-01-01').toISOString() },
        ],
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
      mockSettingsStore.gistSync.deletedNovelIds = [{ id: 'n1', deletedAt: deletionTime }];

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

    it('当远程数据格式无效时，应抛出错误', async () => {
      // 测试 novels 不是数组的情况
      const invalidData1 = {
        novels: 'not-an-array',
      } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      await (expect(
        SyncDataService.applyDownloadedData(invalidData1),
      ).rejects.toThrow() as unknown as Promise<void>);

      // 测试 novel 缺少 id 的情况
      const invalidData2 = {
        novels: [{ title: 'Novel without id' }],
      };
      await (expect(
        SyncDataService.applyDownloadedData(invalidData2),
      ).rejects.toThrow() as unknown as Promise<void>);

      // 测试 aiModels 不是数组的情况
      const invalidData3 = {
        aiModels: 'not-an-array',
      } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      await (expect(
        SyncDataService.applyDownloadedData(invalidData3),
      ).rejects.toThrow() as unknown as Promise<void>);

      // 测试 model 缺少 id 的情况
      const invalidData4 = {
        aiModels: [{ name: 'Model without id' }],
      };
      await (expect(
        SyncDataService.applyDownloadedData(invalidData4),
      ).rejects.toThrow() as unknown as Promise<void>);

      // 测试 coverHistory 不是数组的情况
      const invalidData5 = {
        coverHistory: 'not-an-array',
      } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      await (expect(
        SyncDataService.applyDownloadedData(invalidData5),
      ).rejects.toThrow() as unknown as Promise<void>);

      // 测试 cover 缺少 id 的情况
      const invalidData6 = {
        coverHistory: [{ url: 'cover without id' }],
      };
      await (expect(
        SyncDataService.applyDownloadedData(invalidData6),
      ).rejects.toThrow() as unknown as Promise<void>);
    });

    it('当远程数据为 null 时，应正常处理（不抛出错误）', async () => {
      const result = await SyncDataService.applyDownloadedData(null);
      expect(result).toEqual([]);
    });

    it('应调用 cleanupOldDeletionRecords 清理旧的删除记录', async () => {
      const remoteData = {
        novels: [],
        aiModels: [],
      };

      await SyncDataService.applyDownloadedData(remoteData);

      expect(mockSettingsStore.cleanupOldDeletionRecords).toHaveBeenCalled();
    });

    it('当封面在本地按 URL 删除且删除时间晚于同步时间时，自动同步不应恢复该 URL 的远程封面（即使 id 不同）', async () => {
      const lastSyncTime = new Date('2024-01-01').getTime();
      const deletionTime = new Date('2024-01-02').getTime();

      mockSettingsStore.gistSync.deletedCoverUrls = [{ url: 'same.jpg', deletedAt: deletionTime }];

      const remoteData = {
        coverHistory: [
          { id: 'remote-id', url: 'same.jpg', addedAt: new Date('2024-01-01').toISOString() },
        ],
      };

      const result = await SyncDataService.applyDownloadedData(remoteData, lastSyncTime, false);
      expect(result).toEqual([]);
      // 不应把该封面写回（即 addCover 不应被调用）
      expect(mockCoverHistoryStore.addCover).not.toHaveBeenCalled();
    });

    it('同步 Memory 时不应因为生成新 ID 而重复创建（应保留远程 memory.id）', async () => {
      // 本地已有书籍（同步 Memory 合并逻辑依赖 booksStore.books）
      mockBooksStore.books = [{ id: 'b1', title: 'Local Book' }] as unknown[];

      const remoteMemory = {
        id: 'abcd1234',
        bookId: 'b1',
        content: 'c',
        summary: 's',
        createdAt: 1000,
        lastAccessedAt: 1500,
      };

      // 第一次：本地没有该 Memory，应该创建（并且使用远程 id）
      // 第二次：本地已经有该 Memory（同 id），不应该再创建
      mockMemoryService.getAllMemories.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          ...remoteMemory,
          // 确保不会触发 updateMemory（远程 lastAccessedAt 不更大）
          lastAccessedAt: 2000,
        },
      ]);

      await SyncDataService.applyDownloadedData({ memories: [remoteMemory] });
      await SyncDataService.applyDownloadedData({ memories: [remoteMemory] });

      expect(mockMemoryService.createMemoryWithId).toHaveBeenCalledTimes(1);
      expect(mockMemoryService.createMemoryWithId).toHaveBeenCalledWith(
        'b1',
        'abcd1234',
        'c',
        's',
        expect.objectContaining({ createdAt: 1000, lastAccessedAt: 1500 }),
      );

      // 旧逻辑会调用 createMemory()（生成新 id），这会导致重复；现在不应再调用
      expect(mockMemoryService.createMemory).not.toHaveBeenCalled();
    });
  });

  describe('mergeDataForUpload (上传前合并数据)', () => {
    it('当远程 aiModels 为空但本地存在旧模型时，应全量带上本地模型（避免远端一直为空）', async () => {
      const lastSyncTime = new Date('2024-01-02').getTime();
      const oldDate = new Date('2024-01-01').toISOString(); // 早于 lastSyncTime

      const localData = {
        novels: [],
        aiModels: [{ id: 'm1', name: 'Local Old Model', lastEdited: oldDate }],
        appSettings: { lastEdited: new Date('2024-01-02').toISOString(), syncs: [] },
        coverHistory: [],
      };

      const remoteData = {
        aiModels: [],
        appSettings: { lastEdited: new Date('2024-01-02').toISOString(), syncs: [] },
      };

      const merged = await SyncDataService.mergeDataForUpload(
        localData as unknown as Parameters<typeof SyncDataService.mergeDataForUpload>[0],
        remoteData as unknown as Parameters<typeof SyncDataService.mergeDataForUpload>[1],
        lastSyncTime,
      );

      expect(merged.aiModels).toHaveLength(1);
      expect(merged.aiModels[0]).toMatchObject({ id: 'm1', name: 'Local Old Model' });
    });

    it('当远程 coverHistory 为空但本地存在旧封面时，应全量带上本地封面（避免远端一直为空）', async () => {
      const lastSyncTime = new Date('2024-01-02').getTime();
      const oldAddedAt = new Date('2024-01-01').toISOString(); // 早于 lastSyncTime

      const localData = {
        novels: [],
        aiModels: [],
        appSettings: { lastEdited: new Date('2024-01-02').toISOString(), syncs: [] },
        coverHistory: [{ id: 'c1', url: 'local.jpg', addedAt: oldAddedAt }],
      };

      const remoteData = {
        coverHistory: [],
        appSettings: { lastEdited: new Date('2024-01-02').toISOString(), syncs: [] },
      };

      const merged = await SyncDataService.mergeDataForUpload(
        localData as unknown as Parameters<typeof SyncDataService.mergeDataForUpload>[0],
        remoteData as unknown as Parameters<typeof SyncDataService.mergeDataForUpload>[1],
        lastSyncTime,
      );

      expect(merged.coverHistory).toHaveLength(1);
      expect(merged.coverHistory[0]).toMatchObject({ id: 'c1', url: 'local.jpg' });
    });

    it('当本地与远程存在相同 url 但不同 id 的封面时，应按 url 去重只保留一条', async () => {
      const lastSyncTime = 0;
      const localData = {
        novels: [],
        aiModels: [],
        appSettings: { lastEdited: new Date('2024-01-02').toISOString(), syncs: [] },
        coverHistory: [
          { id: 'c-local', url: 'same.jpg', addedAt: new Date('2024-01-01').toISOString() },
        ],
      };
      const remoteData = {
        coverHistory: [
          { id: 'c-remote', url: 'same.jpg', addedAt: new Date('2024-01-02').toISOString() },
        ],
        appSettings: { lastEdited: new Date('2024-01-02').toISOString(), syncs: [] },
      };

      const merged = await SyncDataService.mergeDataForUpload(
        localData as unknown as Parameters<typeof SyncDataService.mergeDataForUpload>[0],
        remoteData as unknown as Parameters<typeof SyncDataService.mergeDataForUpload>[1],
        lastSyncTime,
      );
      expect(merged.coverHistory).toHaveLength(1);
      // 应该保留 addedAt 更新的那条（远程）
      expect(merged.coverHistory[0]).toMatchObject({ id: 'c-remote', url: 'same.jpg' });
    });
  });

  describe('hasChangesToUpload (检测是否需要上传)', () => {
    it('当书籍 lastEdited 相同但本地章节摘要存在、远程缺失时，应触发上传', () => {
      const sameTime = new Date('2024-01-03').toISOString();

      const local = {
        novels: [
          {
            id: 'n1',
            title: 'Local Novel',
            lastEdited: sameTime,
            volumes: [
              {
                id: 'v1',
                chapters: [
                  {
                    id: 'c1',
                    summary: '本地摘要',
                    lastEdited: sameTime,
                    createdAt: sameTime,
                  },
                ],
              },
            ],
          },
        ],
        aiModels: [],
        appSettings: { lastEdited: sameTime },
        coverHistory: [],
        memories: [],
      };

      const remote = {
        novels: [
          {
            id: 'n1',
            title: 'Remote Novel',
            lastEdited: sameTime,
            volumes: [
              {
                id: 'v1',
                chapters: [
                  {
                    id: 'c1',
                    // 远程缺失 summary
                    lastEdited: sameTime,
                    createdAt: sameTime,
                  },
                ],
              },
            ],
          },
        ],
        aiModels: [],
        appSettings: { lastEdited: sameTime },
        coverHistory: [],
        memories: [],
      };

      const shouldUpload = SyncDataService.hasChangesToUpload(local as any, remote as any);
      expect(shouldUpload).toBe(true);
    });

    it('当书籍 lastEdited 相同且远程章节摘要存在、本地缺失时，不应触发上传（避免覆盖远程摘要）', () => {
      const sameTime = new Date('2024-01-03').toISOString();

      const local = {
        novels: [
          {
            id: 'n1',
            title: 'Local Novel',
            lastEdited: sameTime,
            volumes: [
              {
                id: 'v1',
                chapters: [
                  {
                    id: 'c1',
                    // 本地缺失 summary
                    lastEdited: sameTime,
                    createdAt: sameTime,
                  },
                ],
              },
            ],
          },
        ],
        aiModels: [],
        appSettings: { lastEdited: sameTime },
        coverHistory: [],
        memories: [],
      };

      const remote = {
        novels: [
          {
            id: 'n1',
            title: 'Remote Novel',
            lastEdited: sameTime,
            volumes: [
              {
                id: 'v1',
                chapters: [
                  {
                    id: 'c1',
                    summary: '远程摘要',
                    lastEdited: sameTime,
                    createdAt: sameTime,
                  },
                ],
              },
            ],
          },
        ],
        aiModels: [],
        appSettings: { lastEdited: sameTime },
        coverHistory: [],
        memories: [],
      };

      const shouldUpload = SyncDataService.hasChangesToUpload(local as any, remote as any);
      expect(shouldUpload).toBe(false);
    });
  });
});
