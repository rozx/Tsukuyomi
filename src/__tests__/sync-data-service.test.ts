import { describe, expect, it, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { SyncDataService } from '../services/sync-data-service';
import { ChapterContentService } from '../services/chapter-content-service';
import { aiModelService } from '../services/ai-model-service';
import * as AIModelsStore from 'src/stores/ai-models';
import * as BooksStore from 'src/stores/books';
import * as CoverHistoryStore from 'src/stores/cover-history';
import * as SettingsStore from 'src/stores/settings';
import type { AppSettings, MemoryInjectionSettings } from 'src/models/settings';
import type { SyncConfig } from 'src/models/sync';

// Mock aiModelService methods
const mockSaveModel = mock((_model: unknown) => Promise.resolve());
const mockDeleteModel = mock((_id: string) => Promise.resolve());

// Mock Stores
const mockAIModelsStore = {
  models: [] as unknown[],
  clearModels: mock(() => Promise.resolve()),
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
  settings: {} as any,
  gistSync: {
    lastSyncTime: 0,
    deletedNovelIds: [] as Array<{ id: string; deletedAt: number }>,
    deletedModelIds: [] as Array<{ id: string; deletedAt: number }>,
    deletedCoverIds: [] as Array<{ id: string; deletedAt: number }>,
    deletedCoverUrls: [] as Array<{ url: string; deletedAt: number }>,
    deletedMemoryIds: [] as Array<{ id: string; deletedAt: number }>,
  },
  importSettings: mock((_settings: unknown) => Promise.resolve()),
  replaceSettingsFromSyncSnapshot: mock((_settings: unknown) => Promise.resolve()),
  updateGistSync: mock((_config: unknown) => Promise.resolve()),
  getAllSettings: mock(() => ({ lastEdited: new Date(0) })),
  cleanupOldDeletionRecords: mock(() => Promise.resolve()),
};

type MockSettingsInput = Omit<
  Partial<AppSettings>,
  'lastEdited' | 'taskDefaultModels' | 'memoryInjection'
> & {
  lastEdited?: string | Date | undefined;
  taskDefaultModels?: AppSettings['taskDefaultModels'] | undefined;
  memoryInjection?: Partial<MemoryInjectionSettings> | undefined;
  syncs?: SyncConfig[] | undefined;
};

const createMockMemoryInjection = (
  overrides: Partial<MemoryInjectionSettings> = {},
): MemoryInjectionSettings => ({
  charBudget: 2000,
  enableSemantic: true,
  minScoreThreshold: 0.3,
  hasSeenIntro: false,
  embeddingModelCached: false,
  ...overrides,
});

const createMockAppSettings = (overrides: MockSettingsInput = {}): AppSettings => {
  const { memoryInjection, taskDefaultModels, lastEdited, syncs: _syncs, ...rest } = overrides;

  const settings: AppSettings = {
    lastEdited:
      lastEdited !== undefined
        ? typeof lastEdited === 'string'
          ? new Date(lastEdited)
          : lastEdited
        : new Date(0),
    scraperConcurrencyLimit: 3,
    taskDefaultModels: { ...(taskDefaultModels ?? {}) },
    proxyEnabled: true,
    proxyUrl: '',
    proxyAutoSwitch: true,
    proxyAutoAddMapping: true,
    proxyList: [],
    proxySiteMapping: {},
    booksSortOption: 'default',
    quickStartDismissed: false,
    memoryInjection: createMockMemoryInjection(memoryInjection),
    enableLocalEmbedding: false,
    ...rest,
  };

  settings.taskDefaultModels = { ...(taskDefaultModels ?? {}) };
  settings.memoryInjection = createMockMemoryInjection(memoryInjection);

  return settings;
};

const setMockSettings = (settings: MockSettingsInput = {}) => {
  mockSettingsStore.settings = createMockAppSettings(settings);
  mockSettingsStore.getAllSettings.mockReturnValue(mockSettingsStore.settings);
};

const mergeImportedMockSettings = (
  currentSettings: AppSettings,
  settings: MockSettingsInput = {},
): AppSettings => {
  const {
    lastEdited,
    syncs: _syncs,
    memoryInjection,
    taskDefaultModels,
    ...settingsWithoutSpecial
  } = settings;

  return createMockAppSettings({
    ...currentSettings,
    ...settingsWithoutSpecial,
    lastEdited: lastEdited ?? currentSettings.lastEdited,
    taskDefaultModels:
      taskDefaultModels !== undefined
        ? {
            ...currentSettings.taskDefaultModels,
            ...taskDefaultModels,
          }
        : currentSettings.taskDefaultModels,
    memoryInjection:
      memoryInjection !== undefined
        ? {
            ...currentSettings.memoryInjection,
            ...memoryInjection,
            embeddingModelCached: currentSettings.memoryInjection?.embeddingModelCached ?? false,
          }
        : currentSettings.memoryInjection,
  });
};

const replaceMockSettingsFromSnapshot = (
  currentSettings: AppSettings,
  settings: MockSettingsInput = {},
): AppSettings => {
  const { syncs: _syncs, ...snapshotSettings } = settings;
  const nextSettings = createMockAppSettings(snapshotSettings);

  return {
    ...nextSettings,
    memoryInjection: createMockMemoryInjection({
      ...nextSettings.memoryInjection,
      embeddingModelCached: currentSettings.memoryInjection?.embeddingModelCached ?? false,
    }),
  };
};

const mockMemoryService = {
  getAllMemories: mock((_bookId: string) => Promise.resolve([] as any[])), // eslint-disable-line @typescript-eslint/no-explicit-any
  updateMemory: mock(
    (
      _bookId: string,
      _memoryId: string,
      _content: string,
      _summary: string,
      _preserveLastAccessedAt?: number,
    ) => Promise.resolve(),
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
  deleteMemory: mock((_bookId: string, _memoryId: string) => Promise.resolve()),
};

import { MemoryService } from 'src/services/memory-service';

// Mock ChapterContentService

describe('数据同步服务 (SyncDataService)', () => {
  beforeEach(() => {
    spyOn(AIModelsStore, 'useAIModelsStore').mockReturnValue(mockAIModelsStore as any);
    spyOn(BooksStore, 'useBooksStore').mockReturnValue(mockBooksStore as any);
    spyOn(CoverHistoryStore, 'useCoverHistoryStore').mockReturnValue(mockCoverHistoryStore as any);
    spyOn(SettingsStore, 'useSettingsStore').mockReturnValue(mockSettingsStore as any);

    spyOn(ChapterContentService, 'loadChapterContent').mockResolvedValue([]);
    spyOn(ChapterContentService, 'clearAllCache').mockImplementation(() => {});
    spyOn(ChapterContentService, 'clearCache').mockImplementation(() => {});

    mockAIModelsStore.models = [];
    mockAIModelsStore.clearModels.mockClear();
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
    mockSettingsStore.replaceSettingsFromSyncSnapshot.mockClear();
    mockSettingsStore.updateGistSync.mockClear();
    mockSettingsStore.cleanupOldDeletionRecords.mockClear();
    mockSettingsStore.getAllSettings.mockClear();
    setMockSettings();
    mockSettingsStore.gistSync = {
      lastSyncTime: 0,
      deletedNovelIds: [],
      deletedModelIds: [],
      deletedCoverIds: [],
      deletedCoverUrls: [],
      deletedMemoryIds: [],
    };
    mockSettingsStore.importSettings.mockImplementation((settings: unknown) => {
      setMockSettings(mergeImportedMockSettings(mockSettingsStore.settings, settings as MockSettingsInput));
      return Promise.resolve();
    });
    mockSettingsStore.replaceSettingsFromSyncSnapshot.mockImplementation((settings: unknown) => {
      setMockSettings(
        replaceMockSettingsFromSnapshot(mockSettingsStore.settings, settings as MockSettingsInput),
      );
      return Promise.resolve();
    });

    mockMemoryService.getAllMemories.mockClear();
    mockMemoryService.updateMemory.mockClear();
    mockMemoryService.createMemory.mockClear();
    mockMemoryService.createMemoryWithId.mockClear();
    mockMemoryService.deleteMemory.mockClear();

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
    spyOn(MemoryService, 'deleteMemory').mockImplementation(
      mockMemoryService.deleteMemory as unknown as typeof MemoryService.deleteMemory,
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
      expect(mockSettingsStore.importSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          theme: 'dark',
          quickStartDismissed: false,
        }),
      );

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

    it('当本地 quickStartDismissed=true 且远程为 false 时，应保持 true', async () => {
      const localLastEdited = new Date('2024-01-01');
      const remoteLastEdited = new Date('2024-01-02').toISOString();

      mockSettingsStore.getAllSettings.mockReturnValue({
        lastEdited: localLastEdited,
        quickStartDismissed: true,
        syncs: [],
      } as any);

      await SyncDataService.applyDownloadedData({
        appSettings: {
          lastEdited: remoteLastEdited,
          quickStartDismissed: false,
          syncs: [],
        },
      });

      expect(mockSettingsStore.importSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          quickStartDismissed: true,
        }),
      );
    });

    it('当远程 quickStartDismissed=true 且本地未关闭时，即使远程设置较旧也应同步为 true', async () => {
      const localLastEdited = new Date('2024-01-03');
      const remoteLastEdited = new Date('2024-01-02').toISOString();

      mockSettingsStore.getAllSettings.mockReturnValue({
        lastEdited: localLastEdited,
        quickStartDismissed: false,
        syncs: [],
      } as any);

      await SyncDataService.applyDownloadedData({
        appSettings: {
          lastEdited: remoteLastEdited,
          quickStartDismissed: true,
          syncs: [],
        },
      });

      expect(mockSettingsStore.importSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          quickStartDismissed: true,
        }),
      );
    });

    it('当远程书籍较新时，应应用远程段落的 selectedTranslationId', async () => {
      const oldDate = new Date('2024-01-01').toISOString();
      const newDate = new Date('2024-01-02').toISOString();

      mockBooksStore.books = [
        {
          id: 'n1',
          title: 'Local Novel',
          lastEdited: oldDate,
          createdAt: oldDate,
          volumes: [
            {
              id: 'v1',
              chapters: [
                {
                  id: 'c1',
                  lastEdited: oldDate,
                  createdAt: oldDate,
                  content: [
                    {
                      id: 'p1',
                      text: '原文',
                      selectedTranslationId: 't-local',
                      translations: [
                        { id: 't-local', translation: '本地译文', aiModelId: 'm1' },
                        { id: 't-remote', translation: '远程译文', aiModelId: 'm2' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ] as unknown[];

      const remoteData = {
        novels: [
          {
            id: 'n1',
            title: 'Remote Novel',
            lastEdited: newDate,
            createdAt: oldDate,
            volumes: [
              {
                id: 'v1',
                chapters: [
                  {
                    id: 'c1',
                    lastEdited: newDate,
                    createdAt: oldDate,
                    content: [
                      {
                        id: 'p1',
                        text: '原文',
                        selectedTranslationId: 't-remote',
                        translations: [
                          { id: 't-local', translation: '本地译文', aiModelId: 'm1' },
                          { id: 't-remote', translation: '远程译文', aiModelId: 'm2' },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      await SyncDataService.applyDownloadedData(remoteData);

      const addedBooks = mockBooksStore.bulkAddBooks.mock.calls[0]?.[0] as Array<any>;
      const selectedId =
        addedBooks?.[0]?.volumes?.[0]?.chapters?.[0]?.content?.[0]?.selectedTranslationId;

      expect(selectedId).toBe('t-remote');
    });

    it('当远程书籍较新时，应保留远程新增章节和实体配置', async () => {
      const oldDate = new Date('2024-01-01').toISOString();
      const newDate = new Date('2024-01-03').toISOString();

      mockBooksStore.books = [
        {
          id: 'n-remote-add',
          title: 'Local Novel',
          lastEdited: oldDate,
          createdAt: oldDate,
          terminologies: [],
          characterSettings: [],
          volumes: [
            {
              id: 'v1',
              chapters: [
                {
                  id: 'c1',
                  title: '第一章',
                  lastEdited: oldDate,
                  createdAt: oldDate,
                  content: [],
                },
              ],
            },
          ],
        },
      ] as unknown[];

      await SyncDataService.applyDownloadedData({
        novels: [
          {
            id: 'n-remote-add',
            title: 'Remote Novel',
            lastEdited: newDate,
            createdAt: oldDate,
            terminologies: [
              {
                id: 'term-1',
                name: '魔法',
                translation: { id: 'tt-1', translation: 'Magic', aiModelId: 'm1' },
              },
            ],
            characterSettings: [
              {
                id: 'char-1',
                name: '露娜',
                sex: 'female',
                translation: { id: 'ct-1', translation: 'Luna', aiModelId: 'm1' },
                aliases: [],
              },
            ],
            volumes: [
              {
                id: 'v1',
                chapters: [
                  {
                    id: 'c1',
                    title: '第一章',
                    lastEdited: newDate,
                    createdAt: oldDate,
                    content: [],
                  },
                  {
                    id: 'c2',
                    title: '第二章',
                    lastEdited: newDate,
                    createdAt: oldDate,
                    content: [],
                  },
                ],
              },
            ],
          },
        ],
      });

      const addedBooks = mockBooksStore.bulkAddBooks.mock.calls[0]?.[0] as Array<any>;
      expect(addedBooks?.[0]?.terminologies?.map((term: { id: string }) => term.id)).toContain(
        'term-1',
      );
      expect(
        addedBooks?.[0]?.characterSettings?.map((character: { id: string }) => character.id),
      ).toContain('char-1');
      expect(
        addedBooks?.[0]?.volumes?.[0]?.chapters?.map((chapter: { id: string }) => chapter.id),
      ).toContain('c2');
    });

    it('当远程书籍较新且同 ID 章节更新时，应采用远程章节元数据并保留翻译合并', async () => {
      const oldDate = new Date('2024-01-01').toISOString();
      const newDate = new Date('2024-01-03').toISOString();

      mockBooksStore.books = [
        {
          id: 'n-remote-update',
          title: 'Local Novel',
          lastEdited: oldDate,
          createdAt: oldDate,
          volumes: [
            {
              id: 'v1',
              chapters: [
                {
                  id: 'c1',
                  title: '旧标题',
                  lastEdited: oldDate,
                  createdAt: oldDate,
                  content: [
                    {
                      id: 'p1',
                      text: '原文',
                      selectedTranslationId: 't-local',
                      translations: [{ id: 't-local', translation: '本地译文', aiModelId: 'm1' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ] as unknown[];

      await SyncDataService.applyDownloadedData({
        novels: [
          {
            id: 'n-remote-update',
            title: 'Remote Novel',
            lastEdited: newDate,
            createdAt: oldDate,
            volumes: [
              {
                id: 'v1',
                chapters: [
                  {
                    id: 'c1',
                    title: '新标题',
                    lastEdited: newDate,
                    createdAt: oldDate,
                    content: [
                      {
                        id: 'p1',
                        text: '原文',
                        selectedTranslationId: 't-remote',
                        translations: [
                          { id: 't-remote', translation: '远程译文', aiModelId: 'm2' },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      const addedBooks = mockBooksStore.bulkAddBooks.mock.calls[0]?.[0] as Array<any>;
      const chapter = addedBooks?.[0]?.volumes?.[0]?.chapters?.[0];
      expect(chapter?.title).toBe('新标题');
      expect(chapter?.content?.[0]?.selectedTranslationId).toBe('t-remote');
      expect(
        chapter?.content?.[0]?.translations?.map((translation: { id: string }) => translation.id),
      ).toEqual(['t-remote', 't-local']);
    });

    it('当远程书籍较新且已删除本地旧卷时，不应在合并后复活该卷', async () => {
      const oldDate = new Date('2024-01-01').toISOString();
      const lastSyncDate = new Date('2024-01-02').getTime();
      const newDate = new Date('2024-01-03').toISOString();

      mockSettingsStore.gistSync.lastSyncTime = lastSyncDate;
      mockBooksStore.books = [
        {
          id: 'n-remote-delete',
          title: 'Local Novel',
          lastEdited: oldDate,
          createdAt: oldDate,
          volumes: [
            {
              id: 'v-keep',
              chapters: [
                {
                  id: 'c-keep',
                  title: '保留章节',
                  lastEdited: oldDate,
                  createdAt: oldDate,
                  content: [],
                },
              ],
            },
            {
              id: 'v-stale',
              chapters: [
                {
                  id: 'c-stale',
                  title: '陈旧章节',
                  lastEdited: oldDate,
                  createdAt: oldDate,
                  content: [],
                },
              ],
            },
          ],
        },
      ] as unknown[];

      await SyncDataService.applyDownloadedData({
        novels: [
          {
            id: 'n-remote-delete',
            title: 'Remote Novel',
            lastEdited: newDate,
            createdAt: oldDate,
            volumes: [
              {
                id: 'v-keep',
                chapters: [
                  {
                    id: 'c-keep',
                    title: '保留章节',
                    lastEdited: newDate,
                    createdAt: oldDate,
                    content: [],
                  },
                ],
              },
            ],
          },
        ],
      });

      const addedBooks = mockBooksStore.bulkAddBooks.mock.calls[0]?.[0] as Array<any>;
      expect(addedBooks?.[0]?.volumes?.map((volume: { id: string }) => volume.id)).toEqual([
        'v-keep',
      ]);
    });

    it('当本地章节在上次同步后离线新增时，远程较新也不应将其误删', async () => {
      const lastSyncTime = new Date('2024-01-02').getTime();
      const oldDate = new Date('2024-01-01').toISOString();
      const localOfflineDate = new Date('2024-01-03').toISOString();
      const remoteDate = new Date('2024-01-04').toISOString();

      mockSettingsStore.gistSync.lastSyncTime = lastSyncTime;
      mockBooksStore.books = [
        {
          id: 'n-remote-offline',
          title: 'Local Novel',
          lastEdited: localOfflineDate,
          createdAt: oldDate,
          volumes: [
            {
              id: 'v1',
              chapters: [
                {
                  id: 'c-remote',
                  title: '远端已知章节',
                  lastEdited: oldDate,
                  createdAt: oldDate,
                  content: [],
                },
                {
                  id: 'c-local-offline',
                  title: '本地离线新增章节',
                  lastEdited: localOfflineDate,
                  createdAt: localOfflineDate,
                  content: [],
                },
              ],
            },
          ],
        },
      ] as unknown[];

      await SyncDataService.applyDownloadedData({
        novels: [
          {
            id: 'n-remote-offline',
            title: 'Remote Novel',
            lastEdited: remoteDate,
            createdAt: oldDate,
            volumes: [
              {
                id: 'v1',
                chapters: [
                  {
                    id: 'c-remote',
                    title: '远端已知章节',
                    lastEdited: remoteDate,
                    createdAt: oldDate,
                    content: [],
                  },
                ],
              },
            ],
          },
        ],
      });

      const addedBooks = mockBooksStore.bulkAddBooks.mock.calls[0]?.[0] as Array<any>;
      expect(
        addedBooks?.[0]?.volumes?.[0]?.chapters?.map((chapter: { id: string }) => chapter.id),
      ).toContain('c-remote');
      expect(
        addedBooks?.[0]?.volumes?.[0]?.chapters?.map((chapter: { id: string }) => chapter.id),
      ).toContain('c-local-offline');
    });

    it('当本地空卷在上次同步后新增时，远程较新也不应将其误删', async () => {
      const lastSyncTime = new Date('2024-01-02').getTime();
      const oldDate = new Date('2024-01-01').toISOString();
      const localOfflineDate = new Date('2024-01-03').toISOString();
      const remoteDate = new Date('2024-01-04').toISOString();

      mockSettingsStore.gistSync.lastSyncTime = lastSyncTime;
      mockBooksStore.books = [
        {
          id: 'n-remote-empty-volume',
          title: 'Local Novel',
          lastEdited: localOfflineDate,
          createdAt: oldDate,
          volumes: [
            {
              id: 'v-remote',
              chapters: [
                {
                  id: 'c-remote',
                  title: '远端已知章节',
                  lastEdited: oldDate,
                  createdAt: oldDate,
                  content: [],
                },
              ],
            },
            {
              id: 'v-empty-local',
              title: '本地离线空卷',
              chapters: [],
            },
          ],
        },
      ] as unknown[];

      await SyncDataService.applyDownloadedData({
        novels: [
          {
            id: 'n-remote-empty-volume',
            title: 'Remote Novel',
            lastEdited: remoteDate,
            createdAt: oldDate,
            volumes: [
              {
                id: 'v-remote',
                chapters: [
                  {
                    id: 'c-remote',
                    title: '远端已知章节',
                    lastEdited: remoteDate,
                    createdAt: oldDate,
                    content: [],
                  },
                ],
              },
            ],
          },
        ],
      });

      const addedBooks = mockBooksStore.bulkAddBooks.mock.calls[0]?.[0] as Array<any>;
      expect(addedBooks?.[0]?.volumes?.map((volume: { id: string }) => volume.id)).toContain(
        'v-remote',
      );
      expect(addedBooks?.[0]?.volumes?.map((volume: { id: string }) => volume.id)).toContain(
        'v-empty-local',
      );
    });

    it('当本地书籍较新时，应保留本地段落的 selectedTranslationId', async () => {
      const oldDate = new Date('2024-01-01').toISOString();
      const newDate = new Date('2024-01-02').toISOString();

      mockBooksStore.books = [
        {
          id: 'n1',
          title: 'Local Novel',
          lastEdited: newDate,
          createdAt: oldDate,
          volumes: [
            {
              id: 'v1',
              chapters: [
                {
                  id: 'c1',
                  lastEdited: newDate,
                  createdAt: oldDate,
                  content: [
                    {
                      id: 'p1',
                      text: '原文',
                      selectedTranslationId: 't-local',
                      translations: [
                        { id: 't-local', translation: '本地译文', aiModelId: 'm1' },
                        { id: 't-remote', translation: '远程译文', aiModelId: 'm2' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ] as unknown[];

      const remoteData = {
        novels: [
          {
            id: 'n1',
            title: 'Remote Novel',
            lastEdited: oldDate,
            createdAt: oldDate,
            volumes: [
              {
                id: 'v1',
                chapters: [
                  {
                    id: 'c1',
                    lastEdited: oldDate,
                    createdAt: oldDate,
                    content: [
                      {
                        id: 'p1',
                        text: '原文',
                        selectedTranslationId: 't-remote',
                        translations: [
                          { id: 't-local', translation: '本地译文', aiModelId: 'm1' },
                          { id: 't-remote', translation: '远程译文', aiModelId: 'm2' },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      await SyncDataService.applyDownloadedData(remoteData);

      const addedBooks = mockBooksStore.bulkAddBooks.mock.calls[0]?.[0] as Array<any>;
      const selectedId =
        addedBooks?.[0]?.volumes?.[0]?.chapters?.[0]?.content?.[0]?.selectedTranslationId;

      expect(selectedId).toBe('t-local');
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
      // 第二次：本地已经有该 Memory（同 id），应通过 upsert 更新而非生成新 ID
      mockMemoryService.getAllMemories.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          ...remoteMemory,
          // 本地 lastAccessedAt 更大，合并后以本地为准
          lastAccessedAt: 2000,
        },
      ]);

      await SyncDataService.applyDownloadedData({ memories: [remoteMemory] });
      await SyncDataService.applyDownloadedData({ memories: [remoteMemory] });

      // 重建最终列表模式：每次同步都通过 createMemoryWithId（upsert）写入最终列表
      expect(mockMemoryService.createMemoryWithId).toHaveBeenCalledTimes(2);
      // 第一次：写入远程 Memory
      expect(mockMemoryService.createMemoryWithId).toHaveBeenCalledWith(
        'b1',
        'abcd1234',
        'c',
        's',
        expect.objectContaining({ createdAt: 1000, lastAccessedAt: 1500 }),
      );
      // 第二次：本地更新，保留同一 ID（upsert）
      expect(mockMemoryService.createMemoryWithId).toHaveBeenCalledWith(
        'b1',
        'abcd1234',
        'c',
        's',
        expect.objectContaining({ createdAt: 1000, lastAccessedAt: 2000 }),
      );

      // 旧逻辑会调用 createMemory()（生成新 id），这会导致重复；现在不应再调用
      expect(mockMemoryService.createMemory).not.toHaveBeenCalled();
    });

    it('同步 Memory 时应按内容去重（不同 ID、相同内容只保留一条）', async () => {
      mockBooksStore.books = [{ id: 'b1', title: 'Local Book' }] as unknown[];

      // 本地已有 Memory (id: local-1, content: '角色A总是使用敬语')
      const localMemory = {
        id: 'local-1',
        bookId: 'b1',
        content: '角色A总是使用敬语',
        summary: '角色A的语言风格',
        createdAt: 1000,
        lastAccessedAt: 2000,
      };

      // 远程有相同内容但不同 ID 的 Memory
      const remoteMemory = {
        id: 'remote-1',
        bookId: 'b1',
        content: '角色A总是使用敬语',
        summary: '角色A的用词',
        createdAt: 1500,
        lastAccessedAt: 1800,
      };

      mockMemoryService.getAllMemories.mockResolvedValueOnce([localMemory]);

      await SyncDataService.applyDownloadedData({ memories: [remoteMemory] });

      // 重建最终列表模式：内容去重后只保留 lastAccessedAt 更大的本地版本
      // 通过 createMemoryWithId（upsert）写入最终列表
      expect(mockMemoryService.createMemoryWithId).toHaveBeenCalledTimes(1);
      expect(mockMemoryService.createMemoryWithId).toHaveBeenCalledWith(
        'b1',
        'local-1', // 保留本地 ID（lastAccessedAt 更大）
        '角色A总是使用敬语',
        '角色A的语言风格',
        expect.objectContaining({ createdAt: 1000, lastAccessedAt: 2000 }),
      );
    });

    it('同步 Memory 内容去重时应保留 lastAccessedAt 更新的版本', async () => {
      mockBooksStore.books = [{ id: 'b1', title: 'Local Book' }] as unknown[];

      const localMemory = {
        id: 'local-1',
        bookId: 'b1',
        content: '角色A总是使用敬语',
        summary: '旧摘要',
        createdAt: 1000,
        lastAccessedAt: 1500,
      };

      // 远程有相同内容但更新的 lastAccessedAt
      const remoteMemory = {
        id: 'remote-1',
        bookId: 'b1',
        content: '角色A总是使用敬语',
        summary: '新摘要',
        createdAt: 1200,
        lastAccessedAt: 3000,
      };

      mockMemoryService.getAllMemories.mockResolvedValueOnce([localMemory]);

      await SyncDataService.applyDownloadedData({ memories: [remoteMemory] });

      // 重建最终列表模式：内容去重后保留 lastAccessedAt 更大的远程版本
      // 通过 createMemoryWithId（upsert）写入最终列表
      expect(mockMemoryService.createMemoryWithId).toHaveBeenCalledTimes(1);
      expect(mockMemoryService.createMemoryWithId).toHaveBeenCalledWith(
        'b1',
        'remote-1', // 远程版本 lastAccessedAt 更大，使用远程 ID
        '角色A总是使用敬语',
        '新摘要',
        expect.objectContaining({ createdAt: 1200, lastAccessedAt: 3000 }),
      );
      // 旧的本地 Memory 应被删除（不在最终列表中）
      expect(mockMemoryService.deleteMemory).toHaveBeenCalledWith('b1', 'local-1');
    });

    it('同步更新 Memory 时应保留远程 lastAccessedAt 时间戳（避免触发不必要的上传）', async () => {
      const remoteTimestamp = 3000;
      const localTimestamp = 2000;

      // 本地已有书籍和 Memory
      mockBooksStore.books = [{ id: 'b1', title: 'Local Book' }] as unknown[];

      const localMemory = {
        id: 'mem-1',
        bookId: 'b1',
        content: '旧内容',
        summary: '旧摘要',
        createdAt: 1000,
        lastAccessedAt: localTimestamp,
      };

      const remoteMemory = {
        id: 'mem-1',
        bookId: 'b1',
        content: '新内容',
        summary: '新摘要',
        createdAt: 1000,
        lastAccessedAt: remoteTimestamp,
      };

      // 本地有该 Memory，远程 lastAccessedAt 更大，应使用远程版本
      mockMemoryService.getAllMemories.mockResolvedValueOnce([localMemory]);

      await SyncDataService.applyDownloadedData({ memories: [remoteMemory] });

      // 重建最终列表模式：通过 createMemoryWithId（upsert）写入远程版本
      expect(mockMemoryService.createMemoryWithId).toHaveBeenCalledTimes(1);
      // 关键断言：时间戳应该是远程的 lastAccessedAt
      expect(mockMemoryService.createMemoryWithId).toHaveBeenCalledWith(
        'b1',
        'mem-1',
        '新内容',
        '新摘要',
        expect.objectContaining({ createdAt: 1000, lastAccessedAt: remoteTimestamp }),
      );
    });

    it('本地删除的 Memory 不应被远程同步恢复', async () => {
      mockBooksStore.books = [{ id: 'b1', title: 'Local Book' }] as unknown[];

      // 模拟 Memory 已在本地删除（删除时间 5000，晚于同步时间 1000）
      mockSettingsStore.gistSync = {
        ...mockSettingsStore.gistSync,
        lastSyncTime: 1000,
        deletedMemoryIds: [{ id: 'mem-deleted', deletedAt: 5000 }],
      };

      const remoteMemory = {
        id: 'mem-deleted',
        bookId: 'b1',
        content: '已删除的记忆',
        summary: '摘要',
        createdAt: 800,
        lastAccessedAt: 900,
      };

      mockMemoryService.getAllMemories.mockResolvedValueOnce([]);

      await SyncDataService.applyDownloadedData({ memories: [remoteMemory] });

      // 不应创建已删除的 Memory
      expect(mockMemoryService.createMemoryWithId).not.toHaveBeenCalled();
      expect(mockMemoryService.createMemory).not.toHaveBeenCalled();
    });

    it('删除时间早于同步时间且远程有更新时，Memory 应被自动恢复', async () => {
      mockBooksStore.books = [{ id: 'b1', title: 'Local Book' }] as unknown[];

      // 删除时间 500 早于同步时间 1000
      mockSettingsStore.gistSync = {
        ...mockSettingsStore.gistSync,
        lastSyncTime: 1000,
        deletedMemoryIds: [{ id: 'mem-old-delete', deletedAt: 500 }],
      };

      // 远程 Memory 在同步后有更新（lastAccessedAt: 2000 > syncTime: 1000）
      const remoteMemory = {
        id: 'mem-old-delete',
        bookId: 'b1',
        content: '远程更新的记忆',
        summary: '摘要',
        createdAt: 800,
        lastAccessedAt: 2000,
      };

      mockMemoryService.getAllMemories.mockResolvedValueOnce([]);

      await SyncDataService.applyDownloadedData({ memories: [remoteMemory] });

      // 应恢复该 Memory
      expect(mockMemoryService.createMemoryWithId).toHaveBeenCalledTimes(1);
      expect(mockMemoryService.createMemoryWithId).toHaveBeenCalledWith(
        'b1',
        'mem-old-delete',
        '远程更新的记忆',
        '摘要',
        expect.objectContaining({ createdAt: 800, lastAccessedAt: 2000 }),
      );

      // 应从删除记录中移除
      expect(mockSettingsStore.updateGistSync).toHaveBeenCalledWith(
        expect.objectContaining({
          deletedMemoryIds: [],
        }),
      );
    });

    it('手动检索时已删除的 Memory 应出现在可恢复列表中', async () => {
      mockBooksStore.books = [{ id: 'b1', title: 'Local Book' }] as unknown[];

      mockSettingsStore.gistSync = {
        ...mockSettingsStore.gistSync,
        lastSyncTime: 1000,
        deletedMemoryIds: [{ id: 'mem-deleted', deletedAt: 5000 }],
      };

      const remoteMemory = {
        id: 'mem-deleted',
        bookId: 'b1',
        content: '已删除的记忆',
        summary: '摘要',
        createdAt: 800,
        lastAccessedAt: 900,
      };

      mockMemoryService.getAllMemories.mockResolvedValueOnce([]);

      const restorableItems = await SyncDataService.applyDownloadedData(
        { memories: [remoteMemory] },
        undefined,
        true, // isManualRetrieval
      );

      // 不应创建
      expect(mockMemoryService.createMemoryWithId).not.toHaveBeenCalled();
      // 应出现在可恢复列表中
      expect(restorableItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'memory',
            id: 'mem-deleted',
          }),
        ]),
      );
    });

    // ── 远程删除同步测试（重建最终列表模式） ──

    it('远程已删除的 Memory 在本地也应被删除（lastAccessedAt <= syncTime 且不在远程）', async () => {
      mockBooksStore.books = [{ id: 'b1', title: 'Book' }] as unknown[];

      mockSettingsStore.gistSync = {
        ...mockSettingsStore.gistSync,
        lastSyncTime: 5000,
      };

      // 本地有两条 Memory：一条在远程也有，一条远程已删除
      const localMemory1 = {
        id: 'mem-1',
        bookId: 'b1',
        content: '保留的记忆',
        summary: '摘要1',
        createdAt: 1000,
        lastAccessedAt: 3000, // <= syncTime(5000)，但远程有
      };
      const localMemory2 = {
        id: 'mem-2',
        bookId: 'b1',
        content: '被删除的记忆',
        summary: '摘要2',
        createdAt: 1000,
        lastAccessedAt: 3000, // <= syncTime(5000)，远程没有 → 应删除
      };

      // 远程只有 mem-1
      const remoteMemory1 = {
        id: 'mem-1',
        bookId: 'b1',
        content: '保留的记忆',
        summary: '摘要1',
        createdAt: 1000,
        lastAccessedAt: 3000,
      };

      mockMemoryService.getAllMemories.mockResolvedValueOnce([localMemory1, localMemory2]);

      await SyncDataService.applyDownloadedData({ memories: [remoteMemory1] });

      // mem-1 应被写入（upsert）
      expect(mockMemoryService.createMemoryWithId).toHaveBeenCalledWith(
        'b1',
        'mem-1',
        expect.any(String),
        expect.any(String),
        expect.any(Object),
      );

      // mem-2 不在远程且 lastAccessedAt <= syncTime → 应被删除
      expect(mockMemoryService.deleteMemory).toHaveBeenCalledWith('b1', 'mem-2');
    });

    it('本地新增的 Memory（lastAccessedAt > syncTime）不应被删除，即使远程没有', async () => {
      mockBooksStore.books = [{ id: 'b1', title: 'Book' }] as unknown[];

      mockSettingsStore.gistSync = {
        ...mockSettingsStore.gistSync,
        lastSyncTime: 5000,
      };

      // 本地新增的 Memory（lastAccessedAt > syncTime）
      const localNewMemory = {
        id: 'mem-new',
        bookId: 'b1',
        content: '新增的记忆',
        summary: '新摘要',
        createdAt: 6000,
        lastAccessedAt: 6000, // > syncTime(5000)
      };

      // 远程有另一条新增 Memory（lastAccessedAt > syncTime → 远程新增）
      const remoteMemory = {
        id: 'mem-remote',
        bookId: 'b1',
        content: '远程记忆',
        summary: '远程摘要',
        createdAt: 5500,
        lastAccessedAt: 5500,
      };

      mockMemoryService.getAllMemories.mockResolvedValueOnce([localNewMemory]);

      await SyncDataService.applyDownloadedData({ memories: [remoteMemory] });

      // 本地新增的 Memory 不应被删除
      expect(mockMemoryService.deleteMemory).not.toHaveBeenCalled();
      // 两条 Memory 都应被写入
      expect(mockMemoryService.createMemoryWithId).toHaveBeenCalledTimes(2);
    });

    it('远程 Memory 列表为空时，应保留所有本地 Memory（安全守卫）', async () => {
      mockBooksStore.books = [{ id: 'b1', title: 'Book' }] as unknown[];

      mockSettingsStore.gistSync = {
        ...mockSettingsStore.gistSync,
        lastSyncTime: 5000,
      };

      const localMemory = {
        id: 'mem-1',
        bookId: 'b1',
        content: '本地记忆',
        summary: '摘要',
        createdAt: 1000,
        lastAccessedAt: 2000, // <= syncTime，但远程列表为空 → 应保留
      };

      mockMemoryService.getAllMemories.mockResolvedValueOnce([localMemory]);

      // 远程 memories 为空数组
      await SyncDataService.applyDownloadedData({ memories: [] });

      // 不应删除任何 Memory
      expect(mockMemoryService.deleteMemory).not.toHaveBeenCalled();
      // 本地 Memory 应被保留（写入最终列表）
      expect(mockMemoryService.createMemoryWithId).toHaveBeenCalledTimes(1);
      expect(mockMemoryService.createMemoryWithId).toHaveBeenCalledWith(
        'b1',
        'mem-1',
        '本地记忆',
        '摘要',
        expect.objectContaining({ createdAt: 1000, lastAccessedAt: 2000 }),
      );
    });

    it('某本书的所有 Memory 在远程被删除时，本地旧 Memory 也应被删除', async () => {
      mockBooksStore.books = [{ id: 'b1', title: 'Book' }] as unknown[];

      mockSettingsStore.gistSync = {
        ...mockSettingsStore.gistSync,
        lastSyncTime: 5000,
      };

      const localMemory = {
        id: 'mem-1',
        bookId: 'b1',
        content: '旧记忆',
        summary: '摘要',
        createdAt: 1000,
        lastAccessedAt: 2000, // <= syncTime
      };

      mockMemoryService.getAllMemories.mockResolvedValueOnce([localMemory]);

      // 远程有其他书的 Memory（非空），但 b1 没有任何 Memory
      const otherBookMemory = {
        id: 'mem-other',
        bookId: 'b2',
        content: '其他书的记忆',
        summary: '摘要',
        createdAt: 1000,
        lastAccessedAt: 4000,
      };

      await SyncDataService.applyDownloadedData({ memories: [otherBookMemory] });

      // b1 的旧 Memory 应被删除（远程列表非空，但 b1 没有远程 Memory）
      expect(mockMemoryService.deleteMemory).toHaveBeenCalledWith('b1', 'mem-1');
    });
  });

  // ── 翻译段落合并测试 ──

  describe('mergeParagraphTranslations (段落翻译合并)', () => {
    // mergeParagraphTranslations 是模块内部函数，通过 mergeDataForUpload 间接测试
    // 这里通过 applyDownloadedData 中的合并路径来验证文本回退匹配

    it('段落 ID 不同但文本相同时，应通过文本回退匹配合并翻译', async () => {
      mockBooksStore.books = [
        {
          id: 'b1',
          title: 'Book',
          lastEdited: new Date(2000),
          volumes: [
            {
              id: 'v1',
              chapters: [
                {
                  id: 'ch1',
                  lastEdited: new Date(1000),
                  content: [
                    {
                      id: 'para-local-1',
                      text: '同じテキスト',
                      selectedTranslationId: '',
                      translations: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ] as unknown[];

      const remoteNovel = {
        id: 'b1',
        title: 'Book',
        lastEdited: new Date(3000).toISOString(), // 远程更新
        volumes: [
          {
            id: 'v1',
            chapters: [
              {
                id: 'ch1',
                lastEdited: new Date(3000).toISOString(),
                content: [
                  {
                    id: 'para-remote-1', // 不同 ID
                    text: '同じテキスト', // 相同文本
                    selectedTranslationId: 'tr-1',
                    translations: [
                      {
                        id: 'tr-1',
                        translation: '相同的文本',
                        aiModelId: 'model-1',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      mockMemoryService.getAllMemories.mockResolvedValueOnce([]);

      await SyncDataService.applyDownloadedData({ novels: [remoteNovel] });

      // 验证 bulkAddBooks 被调用且章节内容包含远程翻译
      expect(mockBooksStore.bulkAddBooks).toHaveBeenCalledTimes(1);
      const savedBooks = mockBooksStore.bulkAddBooks.mock.calls[0]![0] as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      const chapter = savedBooks[0].volumes[0].chapters[0];

      // 本地段落应通过文本匹配获得远程翻译
      expect(chapter.content[0].translations).toHaveLength(1);
      expect(chapter.content[0].translations[0].translation).toBe('相同的文本');
    });

    it('同一章节内多个段落文本相同时，文本回退匹配必须一次性消费（不能复用）', async () => {
      // 回归保护：早期实现用单值 Map 做文本回退，重复文本会让多个本地段落同时
      // 吃到同一个远端段落，造成翻译被错误复制；且副方段落会在末尾重复追加。
      mockBooksStore.books = [
        {
          id: 'b1',
          title: 'Book',
          lastEdited: new Date(2000),
          volumes: [
            {
              id: 'v1',
              chapters: [
                {
                  id: 'ch1',
                  lastEdited: new Date(1000),
                  content: [
                    {
                      id: 'local-dup-1',
                      text: '……',
                      selectedTranslationId: '',
                      translations: [],
                    },
                    {
                      id: 'local-dup-2',
                      text: '……',
                      selectedTranslationId: '',
                      translations: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ] as unknown[];

      const remoteNovel = {
        id: 'b1',
        title: 'Book',
        lastEdited: new Date(3000).toISOString(),
        volumes: [
          {
            id: 'v1',
            chapters: [
              {
                id: 'ch1',
                lastEdited: new Date(3000).toISOString(),
                content: [
                  {
                    id: 'remote-dup-1',
                    text: '……',
                    selectedTranslationId: 't-a',
                    translations: [{ id: 't-a', translation: '译文 A', aiModelId: 'm1' }],
                  },
                  {
                    id: 'remote-dup-2',
                    text: '……',
                    selectedTranslationId: 't-b',
                    translations: [{ id: 't-b', translation: '译文 B', aiModelId: 'm1' }],
                  },
                ],
              },
            ],
          },
        ],
      };

      mockMemoryService.getAllMemories.mockResolvedValueOnce([]);

      await SyncDataService.applyDownloadedData({ novels: [remoteNovel] });

      const savedBooks = mockBooksStore.bulkAddBooks.mock.calls[0]![0] as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      const chapter = savedBooks[0].volumes[0].chapters[0];
      const content = chapter.content as Array<{
        id: string;
        translations: Array<{ id: string }>;
      }>;

      // 远端为主导（remoteTime > localTime）→ 结果顺序跟随远端；应恰好 2 段
      expect(content).toHaveLength(2);
      const translationIds = content.map((p) => p.translations.map((t) => t.id).join('|'));
      // 两段各拿到一个不同的远端翻译，而不是都指向 t-a
      expect(new Set(translationIds).size).toBe(2);
      expect(translationIds).toContain('t-a');
      expect(translationIds).toContain('t-b');
    });

    it('远程较新且有额外段落时，合并结果必须包含所有远程段落（union by id）', async () => {
      // 用户场景：本地落后、远端新增了段落。早期实现会丢弃远端独有段落、
      // 把缩减版推回远端造成数据丢失 + manifest hash 永远不匹配。
      mockBooksStore.books = [
        {
          id: 'b1',
          title: 'Book',
          lastEdited: new Date(1000),
          volumes: [
            {
              id: 'v1',
              chapters: [
                {
                  id: 'ch1',
                  lastEdited: new Date(1000),
                  content: [
                    {
                      id: 'p-old',
                      text: '旧段落',
                      selectedTranslationId: '',
                      translations: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ] as unknown[];

      const remoteNovel = {
        id: 'b1',
        title: 'Book',
        lastEdited: new Date(3000).toISOString(),
        volumes: [
          {
            id: 'v1',
            chapters: [
              {
                id: 'ch1',
                lastEdited: new Date(3000).toISOString(),
                content: [
                  {
                    id: 'p-old',
                    text: '旧段落',
                    selectedTranslationId: 't-old',
                    translations: [{ id: 't-old', translation: '旧段落译文', aiModelId: 'm1' }],
                  },
                  {
                    id: 'p-new',
                    text: '远端新增段落',
                    selectedTranslationId: 't-new',
                    translations: [{ id: 't-new', translation: '新段落译文', aiModelId: 'm1' }],
                  },
                ],
              },
            ],
          },
        ],
      };

      mockMemoryService.getAllMemories.mockResolvedValueOnce([]);

      await SyncDataService.applyDownloadedData({ novels: [remoteNovel] });

      expect(mockBooksStore.bulkAddBooks).toHaveBeenCalledTimes(1);
      const savedBooks = mockBooksStore.bulkAddBooks.mock.calls[0]![0] as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      const chapter = savedBooks[0].volumes[0].chapters[0];

      const paragraphIds = (chapter.content as Array<{ id: string }>).map((p) => p.id);
      expect(paragraphIds).toContain('p-old');
      expect(paragraphIds).toContain('p-new');
      // 远端为权威方时，顺序应跟随远端
      expect(paragraphIds[0]).toBe('p-old');
      expect(paragraphIds[1]).toBe('p-new');
    });
  });

  describe('mergeDataForUpload (上传前合并数据)', () => {
    it('设置合并时 quickStartDismissed 任一端为 true，结果应保持 true', async () => {
      const lastSyncTime = new Date('2024-01-02').getTime();
      const localData = {
        novels: [],
        aiModels: [],
        appSettings: {
          lastEdited: new Date('2024-01-03').toISOString(),
          quickStartDismissed: false,
          syncs: [],
        },
        coverHistory: [],
        memories: [],
      };

      const remoteData = {
        novels: [],
        aiModels: [],
        appSettings: {
          lastEdited: new Date('2024-01-01').toISOString(),
          quickStartDismissed: true,
          syncs: [],
        },
        coverHistory: [],
        memories: [],
      };

      const merged = await SyncDataService.mergeDataForUpload(
        localData as unknown as Parameters<typeof SyncDataService.mergeDataForUpload>[0],
        remoteData as unknown as Parameters<typeof SyncDataService.mergeDataForUpload>[1],
        lastSyncTime,
      );

      expect(merged.appSettings.quickStartDismissed).toBe(true);
    });

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

    it('当本地与远程存在相同内容但不同 ID 的 Memory 时，应按内容去重只保留一条', async () => {
      const lastSyncTime = 0;
      const localData = {
        novels: [],
        aiModels: [],
        appSettings: { lastEdited: new Date('2024-01-02').toISOString(), syncs: [] },
        coverHistory: [],
        memories: [
          {
            id: 'mem-local',
            bookId: 'b1',
            content: '角色A总是使用敬语',
            summary: '角色A语言风格',
            createdAt: 1000,
            lastAccessedAt: 2000,
          },
        ],
      };
      const remoteData = {
        memories: [
          {
            id: 'mem-remote',
            bookId: 'b1',
            content: '角色A总是使用敬语',
            summary: '角色A用词',
            createdAt: 1500,
            lastAccessedAt: 1800,
          },
        ],
        appSettings: { lastEdited: new Date('2024-01-02').toISOString(), syncs: [] },
      };

      const merged = await SyncDataService.mergeDataForUpload(
        localData as unknown as Parameters<typeof SyncDataService.mergeDataForUpload>[0],
        remoteData as unknown as Parameters<typeof SyncDataService.mergeDataForUpload>[1],
        lastSyncTime,
      );
      expect(merged.memories).toHaveLength(1);
      // 应保留 lastAccessedAt 更新的（本地）
      expect(merged.memories[0]).toMatchObject({ id: 'mem-local', content: '角色A总是使用敬语' });
    });

    it('内容去重时应保留 lastAccessedAt 更新的 Memory', async () => {
      const lastSyncTime = 0;
      const localData = {
        novels: [],
        aiModels: [],
        appSettings: { lastEdited: new Date('2024-01-02').toISOString(), syncs: [] },
        coverHistory: [],
        memories: [
          {
            id: 'mem-local',
            bookId: 'b1',
            content: '角色A总是使用敬语',
            summary: '旧摘要',
            createdAt: 1000,
            lastAccessedAt: 1500,
          },
        ],
      };
      const remoteData = {
        memories: [
          {
            id: 'mem-remote',
            bookId: 'b1',
            content: '角色A总是使用敬语',
            summary: '新摘要',
            createdAt: 1200,
            lastAccessedAt: 3000,
          },
        ],
        appSettings: { lastEdited: new Date('2024-01-02').toISOString(), syncs: [] },
      };

      const merged = await SyncDataService.mergeDataForUpload(
        localData as unknown as Parameters<typeof SyncDataService.mergeDataForUpload>[0],
        remoteData as unknown as Parameters<typeof SyncDataService.mergeDataForUpload>[1],
        lastSyncTime,
      );
      expect(merged.memories).toHaveLength(1);
      // 应保留 lastAccessedAt 更新的（远程）
      expect(merged.memories[0]).toMatchObject({ id: 'mem-remote', lastAccessedAt: 3000 });
    });

    it('上传合并时本地已删除的远程独有 Memory 不应被包含', async () => {
      const lastSyncTime = 1000;

      // 模拟 Memory 已在本地删除（删除时间 5000，晚于同步时间 1000）
      mockSettingsStore.gistSync = {
        ...mockSettingsStore.gistSync,
        lastSyncTime,
        deletedMemoryIds: [{ id: 'mem-deleted', deletedAt: 5000 }],
      };

      const localData = {
        novels: [],
        aiModels: [],
        appSettings: { lastEdited: new Date('2024-01-02').toISOString(), syncs: [] },
        coverHistory: [],
        memories: [],
      };
      const remoteData = {
        memories: [
          {
            id: 'mem-deleted',
            bookId: 'b1',
            content: '已删除的记忆',
            summary: '摘要',
            createdAt: 800,
            lastAccessedAt: 900,
          },
        ],
        appSettings: { lastEdited: new Date('2024-01-02').toISOString(), syncs: [] },
      };

      const merged = await SyncDataService.mergeDataForUpload(
        localData as unknown as Parameters<typeof SyncDataService.mergeDataForUpload>[0],
        remoteData as unknown as Parameters<typeof SyncDataService.mergeDataForUpload>[1],
        lastSyncTime,
      );

      // 已删除的 Memory 不应出现在合并结果中
      expect(merged.memories).toHaveLength(0);
    });
  });

  describe('hasChangesToUpload (检测是否需要上传)', () => {
    it.skip('当书籍 lastEdited 相同但本地章节摘要存在、远程缺失时，应触发上传（已废弃：summary 字段已移除）', () => {
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

    it.skip('当书籍 lastEdited 相同且远程章节摘要存在、本地缺失时，不应触发上传（已废弃：summary 字段已移除）', () => {
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

  describe('overwriteFromSnapshot (恢复修订版本完全覆盖)', () => {
    it('覆盖后本地独有的书籍/模型/封面/记忆不再出现', async () => {
      // 本地独有数据
      mockBooksStore.books = [
        { id: 'local-only-book', title: 'Local Only', lastEdited: new Date().toISOString() },
      ];
      mockAIModelsStore.models = [
        { id: 'local-only-model', name: 'Local Only', lastEdited: new Date().toISOString() },
      ];
      mockCoverHistoryStore.covers = [{ id: 'local-only-cover', url: 'local.jpg' }];
      spyOn(MemoryService, 'getAllMemories').mockImplementation(((bookId: string) => {
        if (bookId === 'local-only-book') {
          return Promise.resolve([
            {
              id: 'local-only-memory',
              bookId: 'local-only-book',
              content: 'local',
              summary: 's',
              createdAt: 1,
              lastAccessedAt: 1,
            },
          ] as any);
        }
        return Promise.resolve([]);
      }) as typeof MemoryService.getAllMemories);

      const remoteData = {
        novels: [{ id: 'snap-book', title: 'Snap', lastEdited: new Date().toISOString() }],
        aiModels: [{ id: 'snap-model', name: 'Snap', lastEdited: new Date().toISOString() }],
        appSettings: { theme: 'dark' },
        coverHistory: [{ id: 'snap-cover', url: 'snap.jpg' }],
        memories: [] as any[],
      };

      await SyncDataService.overwriteFromSnapshot(remoteData);

      // 本地数据被清空
      expect(mockBooksStore.clearBooks).toHaveBeenCalled();
      expect(mockAIModelsStore.clearModels).toHaveBeenCalled();
      expect(mockCoverHistoryStore.clearHistory).toHaveBeenCalled();
      // 旧 Memory 被删除
      expect(mockMemoryService.deleteMemory).toHaveBeenCalledWith(
        'local-only-book',
        'local-only-memory',
      );

      // 快照数据被写入
      expect(mockBooksStore.bulkAddBooks).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 'snap-book' })]),
      );
      expect(mockSaveModel).toHaveBeenCalledWith(expect.objectContaining({ id: 'snap-model' }));
      expect(mockCoverHistoryStore.addCover).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'snap-cover' }),
      );

      // store 内存状态仅包含快照模型
      expect(mockAIModelsStore.models).toHaveLength(1);
      expect(mockAIModelsStore.models[0]).toMatchObject({ id: 'snap-model' });
    });

    it('覆盖后快照条目全部出现，不受 lastEdited 影响', async () => {
      const oldDate = new Date('2020-01-01').toISOString();
      mockSettingsStore.gistSync.lastSyncTime = new Date('2024-01-01').getTime();

      // 本地已存在同 id 条目（更新时间较新），但覆盖不做任何 lastEdited 比较
      mockBooksStore.books = [
        { id: 'b1', title: 'Local Newer', lastEdited: new Date('2025-01-01').toISOString() },
      ];

      const remoteData = {
        novels: [{ id: 'b1', title: 'Snap Older', lastEdited: oldDate }],
        aiModels: [{ id: 'm1', name: 'Snap Model', lastEdited: oldDate }],
        coverHistory: [{ id: 'c1', url: 'old.jpg' }],
        memories: [
          {
            id: 'mem1',
            bookId: 'b1',
            content: 'c',
            summary: 's',
            createdAt: 1,
            lastAccessedAt: 1,
          },
        ],
      };

      await SyncDataService.overwriteFromSnapshot(remoteData);

      // 书籍使用快照版本（即使比本地旧）
      const addedBooks = mockBooksStore.bulkAddBooks.mock.calls[0]?.[0] as Array<any>;
      expect(addedBooks[0]).toMatchObject({ id: 'b1', title: 'Snap Older' });

      // 模型、封面、记忆都被写入
      expect(mockSaveModel).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
      expect(mockCoverHistoryStore.addCover).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'c1' }),
      );
      expect(mockMemoryService.createMemoryWithId).toHaveBeenCalledWith(
        'b1',
        'mem1',
        'c',
        's',
        expect.objectContaining({ createdAt: 1, lastAccessedAt: 1 }),
      );
    });

    it('覆盖后 deletedNovelIds / deletedModelIds 被清空', async () => {
      mockSettingsStore.gistSync = {
        lastSyncTime: 123,
        deletedNovelIds: [{ id: 'old-n', deletedAt: 100 }],
        deletedModelIds: [{ id: 'old-m', deletedAt: 100 }],
        deletedCoverIds: [{ id: 'old-c', deletedAt: 100 }],
        deletedCoverUrls: [],
        deletedMemoryIds: [{ id: 'old-mem', deletedAt: 100 }],
      };

      await SyncDataService.overwriteFromSnapshot({
        novels: [],
        aiModels: [],
        coverHistory: [],
        memories: [],
      });

      // updateGistSync 最后一次调用应包含清空的 deletedNovelIds/deletedModelIds
      const lastCall = mockSettingsStore.updateGistSync.mock.calls.at(-1)?.[0] as any;
      expect(lastCall.deletedNovelIds).toEqual([]);
      expect(lastCall.deletedModelIds).toEqual([]);
    });

    it('覆盖 appSettings 后保留本地 Gist 凭据与 lastSyncTime', async () => {
      const localGistSync = {
        enabled: true,
        lastSyncTime: 999,
        syncInterval: 60_000,
        syncType: 'gist',
        syncParams: { gistId: 'local-gist', username: 'local-user' },
        secret: 'local-token',
        apiEndpoint: '',
        deletedNovelIds: [],
        deletedModelIds: [],
        deletedCoverIds: [],
        deletedCoverUrls: [],
        deletedMemoryIds: [],
      };
      mockSettingsStore.gistSync = localGistSync as any;

      await SyncDataService.overwriteFromSnapshot({
        novels: [],
        aiModels: [],
        coverHistory: [],
        memories: [],
        appSettings: {
          theme: 'snap-theme',
          syncs: [
            {
              syncType: 'gist',
              enabled: false,
              secret: 'snap-token',
              syncParams: { gistId: 'snap-gist', username: 'snap-user' },
              lastSyncTime: 0,
            },
          ],
        },
      });

      // appSettings 走“按快照替换”入口
      expect(mockSettingsStore.replaceSettingsFromSyncSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ theme: 'snap-theme' }),
      );

      // 随后 updateGistSync 用本地凭据覆盖
      const lastCall = mockSettingsStore.updateGistSync.mock.calls.at(-1)?.[0] as any;
      expect(lastCall).toMatchObject({
        enabled: true,
        lastSyncTime: 999,
        secret: 'local-token',
        syncParams: { gistId: 'local-gist', username: 'local-user' },
        deletedNovelIds: [],
        deletedModelIds: [],
      });
    });

    it('恢复旧快照时不应继续沿用本地缺省外的设置残留', async () => {
      mockSettingsStore.settings = {
        lastEdited: new Date('2026-04-20T10:00:00.000Z'),
        scraperConcurrencyLimit: 9,
        taskDefaultModels: {
          translation: 'local-translation-model',
          assistant: 'local-assistant-model',
        },
        proxyEnabled: false,
        proxyUrl: 'https://local-proxy.example/{url}',
        proxyAutoSwitch: false,
        proxyAutoAddMapping: false,
        proxyList: [
          {
            id: 'local-proxy',
            name: '本地代理',
            url: 'https://local-proxy.example/{url}',
          },
        ],
        proxySiteMapping: {
          'example.com': {
            enabled: true,
            proxies: ['https://local-proxy.example/{url}'],
          },
        },
        booksSortOption: 'updatedAt-desc',
        quickStartDismissed: true,
        memoryInjection: {
          charBudget: 3600,
          enableSemantic: false,
          minScoreThreshold: 0.9,
          hasSeenIntro: true,
          embeddingModelCached: true,
        },
        enableLocalEmbedding: true,
      };
      mockSettingsStore.getAllSettings.mockReturnValue(mockSettingsStore.settings);

      await SyncDataService.overwriteFromSnapshot({
        novels: [],
        aiModels: [],
        coverHistory: [],
        memories: [],
        appSettings: {
          lastEdited: '2025-01-01T00:00:00.000Z',
          proxyEnabled: true,
          proxyUrl: 'https://remote-proxy.example/{url}',
          memoryInjection: {
            charBudget: 1800,
            enableSemantic: true,
            minScoreThreshold: 0.4,
            hasSeenIntro: false,
          },
        },
      });

      expect(mockSettingsStore.settings.proxyEnabled).toBe(true);
      expect(mockSettingsStore.settings.proxyUrl).toBe('https://remote-proxy.example/{url}');
      expect(mockSettingsStore.settings.taskDefaultModels).toEqual({});
      expect(mockSettingsStore.settings.enableLocalEmbedding).toBe(false);
      expect(mockSettingsStore.settings.memoryInjection).toMatchObject({
        charBudget: 1800,
        enableSemantic: true,
        minScoreThreshold: 0.4,
        hasSeenIntro: false,
        embeddingModelCached: true,
      });
    });

    it('validateRemoteData 失败时抛错且不触碰本地数据', async () => {
      const invalidData = {
        // novels 不是数组，应该触发验证失败
        novels: 'not-an-array' as any,
      };

      let thrown: unknown;
      try {
        await SyncDataService.overwriteFromSnapshot(invalidData as any);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toContain('远程数据格式无效');

      expect(mockBooksStore.clearBooks).not.toHaveBeenCalled();
      expect(mockAIModelsStore.clearModels).not.toHaveBeenCalled();
      expect(mockCoverHistoryStore.clearHistory).not.toHaveBeenCalled();
      expect(mockBooksStore.bulkAddBooks).not.toHaveBeenCalled();
    });

    it('写入过程抛异常时回滚到覆盖前状态', async () => {
      mockBooksStore.books = [
        { id: 'orig-book', title: 'Original', lastEdited: new Date().toISOString() },
      ];

      // bulkAddBooks 抛错，模拟写入失败
      mockBooksStore.bulkAddBooks.mockImplementationOnce(() => {
        throw new Error('write failed');
      });

      let thrown: unknown;
      try {
        await SyncDataService.overwriteFromSnapshot({
          novels: [{ id: 'snap-book', title: 'Snap', lastEdited: new Date().toISOString() }],
          aiModels: [],
          coverHistory: [],
          memories: [],
        });
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toContain('write failed');

      // 回滚：备份中的 orig-book 被重新写回
      const restoreCalls = mockBooksStore.bulkAddBooks.mock.calls;
      const lastRestoreCall = restoreCalls.at(-1)?.[0] as Array<any>;
      expect(lastRestoreCall).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'orig-book' })]),
      );
    });
  });
});
