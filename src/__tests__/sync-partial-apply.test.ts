import { describe, expect, it, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import './setup';

import { SyncDataService } from '../services/sync-data-service';
import { MemoryService } from '../services/memory-service';
import { GlobalConfig } from '../services/global-config-cache';
import { aiModelService } from '../services/ai-model-service';
import * as SettingsStore from '../stores/settings';
import * as BooksStore from '../stores/books';
import * as AIModelsStore from '../stores/ai-models';
import * as CoverHistoryStore from '../stores/cover-history';
import {
  filenamesForEntry,
  matchFilenamesInSnapshot,
  parseMemoriesEnvelope,
} from '../services/gist-sync-incremental';
import { manifestToEntries } from '../services/sync-manifest-builder';
import { MANIFEST_SCHEMA_VERSION, novelEntryKey } from '../models/manifest';
import type { SyncConfig } from '../models/sync';
import { SyncType } from '../models/sync';

const LAST_SYNC = 1_000_000;

function makeConfig(overrides: Partial<SyncConfig> = {}): SyncConfig {
  return {
    enabled: true,
    lastSyncTime: LAST_SYNC,
    syncInterval: 0,
    syncType: SyncType.Gist,
    syncParams: {},
    secret: '',
    apiEndpoint: '',
    deletedNovelIds: [],
    deletedModelIds: [],
    deletedCoverIds: [],
    deletedMemoryIds: [],
    ...overrides,
  };
}

describe('gist-sync-incremental: parseMemoriesEnvelope', () => {
  it('返回 null 当 raw 不是 array 或合规对象（损坏数据保护）', () => {
    expect(parseMemoriesEnvelope(null)).toBeNull();
    expect(parseMemoriesEnvelope(undefined)).toBeNull();
    expect(parseMemoriesEnvelope('not-json')).toBeNull();
    expect(parseMemoriesEnvelope({ wrong: 'shape' })).toBeNull();
    expect(parseMemoriesEnvelope({ memories: 'not-array' })).toBeNull();
  });

  it('扁平 Memory[] 数组（v2 旧格式）转为 envelope，无 tombstones 字段', () => {
    const arr = [
      {
        id: 'm1',
        bookId: 'b1',
        content: 'C',
        summary: '',
        createdAt: 1,
        lastAccessedAt: 1,
      },
    ];
    const env = parseMemoriesEnvelope(arr);
    expect(env).not.toBeNull();
    expect(env!.memories).toHaveLength(1);
    expect('tombstones' in env!).toBe(false);
  });

  it('v3 envelope 格式：memories + tombstones 都被保留', () => {
    const env = parseMemoriesEnvelope({
      memories: [
        {
          id: 'm1',
          bookId: 'b1',
          content: 'C',
          summary: '',
          createdAt: 1,
          lastAccessedAt: 1,
        },
      ],
      tombstones: [{ id: 'm-deleted', deletedAt: 12345 }],
    });
    expect(env!.memories).toHaveLength(1);
    expect(env!.tombstones).toEqual([{ id: 'm-deleted', deletedAt: 12345 }]);
  });

  it('envelope.tombstones 为空数组时省略字段（hash 与无墓碑形态保持一致）', () => {
    const env = parseMemoriesEnvelope({ memories: [], tombstones: [] });
    expect('tombstones' in env!).toBe(false);
  });

  it('过滤无效 tombstone（id 非字符串 / deletedAt 非有限数）', () => {
    const env = parseMemoriesEnvelope({
      memories: [],
      tombstones: [
        { id: 'good', deletedAt: 1 },
        { id: 123, deletedAt: 2 } as unknown as { id: string; deletedAt: number }, // bad id
        { id: 'bad', deletedAt: NaN },
        null,
      ],
    });
    expect(env!.tombstones).toEqual([{ id: 'good', deletedAt: 1 }]);
  });
});

describe('gist-sync-incremental: filenamesForEntry (C1 fix)', () => {
  it('aggregated entries map to a single fixed filename', () => {
    expect(filenamesForEntry('settings')).toEqual(['tsukuyomi-settings.json']);
    expect(filenamesForEntry('ai-models')).toEqual(['ai-models.json']);
    expect(filenamesForEntry('cover-history')).toEqual(['cover-history.json']);
  });

  it('novel/memories with no chunks map to a single .json', () => {
    expect(filenamesForEntry('novel:abc')).toEqual(['novel-abc.json']);
    expect(filenamesForEntry('novel:abc', 0)).toEqual(['novel-abc.json']);
    expect(filenamesForEntry('memories:xyz')).toEqual(['memories-xyz.json']);
  });

  it('novel/memories with chunks enumerate meta + all chunk files deterministically', () => {
    const novelFiles = filenamesForEntry('novel:abc', 3);
    expect(novelFiles).toEqual([
      'novel-abc.meta.json',
      'novel-chunk-abc_0.json',
      'novel-chunk-abc_1.json',
      'novel-chunk-abc_2.json',
    ]);

    const memoryFiles = filenamesForEntry('memories:xyz', 2);
    expect(memoryFiles).toEqual([
      'memories-xyz.meta.json',
      'memories-chunk-xyz_0.json',
      'memories-chunk-xyz_1.json',
    ]);
  });

  it('unknown entry key returns empty array', () => {
    expect(filenamesForEntry('unknown:foo')).toEqual([]);
  });
});

describe('gist-sync-incremental: matchFilenamesInSnapshot', () => {
  it('returns exact match for aggregated entries', () => {
    const files = [
      'tsukuyomi-settings.json',
      'ai-models.json',
      'cover-history.json',
      'novel-abc.json',
    ];
    expect(matchFilenamesInSnapshot('settings', files)).toEqual(['tsukuyomi-settings.json']);
    expect(matchFilenamesInSnapshot('ai-models', files)).toEqual(['ai-models.json']);
  });

  it('matches all novel files by bookId prefix (single + chunked)', () => {
    const files = [
      'novel-abc.json',
      'novel-abc.meta.json',
      'novel-chunk-abc_0.json',
      'novel-chunk-abc_1.json',
      'novel-def.json', // different book — should not match
    ];
    const matches = matchFilenamesInSnapshot('novel:abc', files);
    expect(matches.sort()).toEqual(
      [
        'novel-abc.json',
        'novel-abc.meta.json',
        'novel-chunk-abc_0.json',
        'novel-chunk-abc_1.json',
      ].sort(),
    );
    expect(matches).not.toContain('novel-def.json');
  });

  it('unknown entry key returns empty array', () => {
    expect(matchFilenamesInSnapshot('unknown:foo', ['novel-abc.json'])).toEqual([]);
  });
});

describe('sync-manifest-builder: manifestToEntries', () => {
  it('preserves chunks field when present', () => {
    const manifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      updatedAt: '2026-04-16T00:00:00Z',
      entries: {
        settings: { hash: 'h1', lastEdited: '' },
        [novelEntryKey('a')]: { hash: 'h2', lastEdited: '', chunks: 3 },
        [novelEntryKey('b')]: { hash: 'h3', lastEdited: '' }, // no chunks
      },
    };
    const entries = manifestToEntries(manifest);
    expect(entries.settings).toEqual({ hash: 'h1' });
    expect(entries[novelEntryKey('a')]).toEqual({ hash: 'h2', chunks: 3 });
    expect(entries[novelEntryKey('b')]).toEqual({ hash: 'h3' });
  });
});

// ─────────────────────────────────────────────────────────────
// applyPartialRemoteData — cross-device deletion propagation (C2/C3/I1)
// ─────────────────────────────────────────────────────────────

describe('applyPartialRemoteData: AI models deletion propagation (C3)', () => {
  // 本地 stores & mocks
  let localModels: Array<{ id: string; name?: string; lastEdited: Date }>;
  let deletedModelIds: Array<{ id: string; deletedAt: number }>;
  let saveModelSpy: ReturnType<typeof mock>;
  let deleteModelSpy: ReturnType<typeof mock>;

  beforeEach(() => {
    localModels = [];
    deletedModelIds = [];
    saveModelSpy = mock(() => Promise.resolve());
    deleteModelSpy = mock(() => Promise.resolve());

    spyOn(GlobalConfig, 'ensureInitialized').mockResolvedValue(undefined);
    spyOn(GlobalConfig, 'getGistSyncSnapshot').mockImplementation(() =>
      makeConfig({ deletedModelIds }),
    );
    spyOn(AIModelsStore, 'useAIModelsStore').mockReturnValue({ models: localModels } as any);
    spyOn(BooksStore, 'useBooksStore').mockReturnValue({ books: [] } as any);
    spyOn(CoverHistoryStore, 'useCoverHistoryStore').mockReturnValue({
      covers: [],
      addCover: mock(() => Promise.resolve()),
      removeCover: mock(() => Promise.resolve()),
    } as any);
    spyOn(SettingsStore, 'useSettingsStore').mockReturnValue({
      getAllSettings: () => ({ lastEdited: new Date(0) }),
      importSettings: mock(() => Promise.resolve()),
    } as any);
    spyOn(aiModelService, 'saveModel').mockImplementation(saveModelSpy);
    spyOn(aiModelService, 'deleteModel').mockImplementation(deleteModelSpy);
  });

  afterEach(() => {
    mock.restore();
  });

  it('deletes a stale local model that is missing from the remote aggregate', async () => {
    // 本地有模型 A 和 B，远端只剩 A；B 是上次同步前添加、远端已删除
    localModels.push(
      { id: 'A', lastEdited: new Date(LAST_SYNC - 1000) },
      { id: 'B', lastEdited: new Date(LAST_SYNC - 1000) },
    );

    await SyncDataService.applyPartialRemoteData({
      'ai-models': {
        kind: 'ai-models',
        value: [{ id: 'A', lastEdited: new Date(LAST_SYNC + 100).toISOString() }],
      },
    });

    expect(deleteModelSpy).toHaveBeenCalledWith('B');
    expect(localModels.find((m) => m.id === 'B')).toBeUndefined();
  });

  it('keeps a local model that was edited after lastSyncTime (local wins)', async () => {
    localModels.push({ id: 'A', lastEdited: new Date(LAST_SYNC + 5000) });

    await SyncDataService.applyPartialRemoteData({
      'ai-models': { kind: 'ai-models', value: [] },
    });

    expect(deleteModelSpy).not.toHaveBeenCalled();
    expect(localModels).toHaveLength(1);
  });

  it('does not re-create a model whose local deletion is newer than lastSyncTime', async () => {
    deletedModelIds.push({ id: 'B', deletedAt: LAST_SYNC + 100 });

    await SyncDataService.applyPartialRemoteData({
      'ai-models': {
        kind: 'ai-models',
        value: [{ id: 'B', lastEdited: new Date(LAST_SYNC - 200).toISOString() }],
      },
    });

    expect(saveModelSpy).not.toHaveBeenCalled();
  });
});

describe('applyPartialRemoteData: cover history deletion propagation (C3)', () => {
  let localCovers: Array<{ id: string; addedAt: number }>;
  let removeCoverSpy: ReturnType<typeof mock>;
  let addCoverSpy: ReturnType<typeof mock>;

  beforeEach(() => {
    localCovers = [];
    removeCoverSpy = mock(() => Promise.resolve());
    addCoverSpy = mock(() => Promise.resolve());

    spyOn(GlobalConfig, 'ensureInitialized').mockResolvedValue(undefined);
    spyOn(GlobalConfig, 'getGistSyncSnapshot').mockImplementation(() =>
      makeConfig({ deletedCoverIds: [], deletedCoverUrls: [] }),
    );
    spyOn(AIModelsStore, 'useAIModelsStore').mockReturnValue({ models: [] } as any);
    spyOn(BooksStore, 'useBooksStore').mockReturnValue({ books: [] } as any);
    spyOn(CoverHistoryStore, 'useCoverHistoryStore').mockReturnValue({
      covers: localCovers,
      addCover: addCoverSpy,
      removeCover: removeCoverSpy,
    } as any);
    spyOn(SettingsStore, 'useSettingsStore').mockReturnValue({
      getAllSettings: () => ({ lastEdited: new Date(0) }),
      importSettings: mock(() => Promise.resolve()),
    } as any);
  });

  afterEach(() => {
    mock.restore();
  });

  it('removes a stale local cover missing from the remote aggregate', async () => {
    localCovers.push(
      { id: 'c1', addedAt: LAST_SYNC - 500 },
      { id: 'c2', addedAt: LAST_SYNC - 500 },
    );

    await SyncDataService.applyPartialRemoteData({
      'cover-history': {
        kind: 'cover-history',
        value: [{ id: 'c1', addedAt: LAST_SYNC }],
      },
    });

    expect(removeCoverSpy).toHaveBeenCalledWith('c2');
  });

  it('keeps a local cover added after lastSyncTime (pending upload)', async () => {
    localCovers.push({ id: 'c-new', addedAt: LAST_SYNC + 5000 });

    await SyncDataService.applyPartialRemoteData({
      'cover-history': { kind: 'cover-history', value: [] },
    });

    expect(removeCoverSpy).not.toHaveBeenCalled();
  });
});

describe('applyPartialRemoteData: memories deletion propagation (C2)', () => {
  const BOOK_ID = 'book-1';
  let getAllSpy: ReturnType<typeof spyOn>;
  let createSpy: ReturnType<typeof spyOn>;
  let deleteSpy: ReturnType<typeof spyOn>;
  let localMemories: Array<{
    id: string;
    bookId: string;
    content: string;
    summary: string;
    createdAt: number;
    lastAccessedAt: number;
  }>;
  let deletedMemoryIds: Array<{ id: string; deletedAt: number }>;

  beforeEach(() => {
    localMemories = [];
    deletedMemoryIds = [];

    spyOn(GlobalConfig, 'ensureInitialized').mockResolvedValue(undefined);
    spyOn(GlobalConfig, 'getGistSyncSnapshot').mockImplementation(() =>
      makeConfig({ deletedMemoryIds }),
    );
    spyOn(AIModelsStore, 'useAIModelsStore').mockReturnValue({ models: [] } as any);
    spyOn(BooksStore, 'useBooksStore').mockReturnValue({ books: [] } as any);
    spyOn(CoverHistoryStore, 'useCoverHistoryStore').mockReturnValue({
      covers: [],
      addCover: mock(() => Promise.resolve()),
      removeCover: mock(() => Promise.resolve()),
    } as any);
    spyOn(SettingsStore, 'useSettingsStore').mockReturnValue({
      getAllSettings: () => ({ lastEdited: new Date(0) }),
      importSettings: mock(() => Promise.resolve()),
    } as any);

    getAllSpy = spyOn(MemoryService, 'getAllMemories').mockImplementation(() =>
      Promise.resolve(localMemories.map((m) => ({ ...m })) as any),
    );
    createSpy = spyOn(MemoryService, 'upsertMemoryForSync').mockResolvedValue(undefined as any);
    deleteSpy = spyOn(MemoryService, 'deleteMemory').mockResolvedValue(undefined);
  });

  afterEach(() => {
    mock.restore();
  });

  it('deletes a stale local memory missing from the remote memories list', async () => {
    // Local m1 (stale) + m2 (stale); remote only has m1 → m2 should be removed
    localMemories.push(
      {
        id: 'm1',
        bookId: BOOK_ID,
        content: 'A',
        summary: '',
        createdAt: LAST_SYNC - 1000,
        lastAccessedAt: LAST_SYNC - 500,
      },
      {
        id: 'm2',
        bookId: BOOK_ID,
        content: 'B',
        summary: '',
        createdAt: LAST_SYNC - 1000,
        lastAccessedAt: LAST_SYNC - 500,
      },
    );

    await SyncDataService.applyPartialRemoteData({
      [`memories:${BOOK_ID}`]: {
        kind: 'memories',
        bookId: BOOK_ID,
        value: [
          {
            id: 'm1',
            bookId: BOOK_ID,
            content: 'A',
            summary: '',
            createdAt: LAST_SYNC - 1000,
            lastAccessedAt: LAST_SYNC - 500,
          },
        ],
      },
    });

    expect(deleteSpy).toHaveBeenCalledWith(BOOK_ID, 'm2');
    // m1 should be preserved (upserted)
    const createCalls = createSpy.mock.calls.map((c: unknown[]) => (c[0] as { id: string }).id);
    expect(createCalls).toContain('m1');
    expect(getAllSpy).toHaveBeenCalled();
  });

  it('keeps a local memory whose lastAccessedAt is newer than lastSyncTime', async () => {
    localMemories.push({
      id: 'm-fresh',
      bookId: BOOK_ID,
      content: 'fresh',
      summary: '',
      createdAt: LAST_SYNC + 100,
      lastAccessedAt: LAST_SYNC + 100,
    });

    await SyncDataService.applyPartialRemoteData({
      [`memories:${BOOK_ID}`]: {
        kind: 'memories',
        bookId: BOOK_ID,
        value: [],
      },
    });

    expect(deleteSpy).not.toHaveBeenCalled();
    const createCalls = createSpy.mock.calls.map((c: unknown[]) => (c[0] as { id: string }).id);
    expect(createCalls).toContain('m-fresh');
  });

  it('does not delete locals when remote memories list is empty (safety)', async () => {
    localMemories.push({
      id: 'm-old',
      bookId: BOOK_ID,
      content: 'old',
      summary: '',
      createdAt: LAST_SYNC - 1000,
      lastAccessedAt: LAST_SYNC - 500,
    });

    await SyncDataService.applyPartialRemoteData({
      [`memories:${BOOK_ID}`]: {
        kind: 'memories',
        bookId: BOOK_ID,
        value: [],
      },
    });

    // 远端空时保留本地，避免误删
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('does not restore a memory whose local deletion is newer than lastSyncTime', async () => {
    deletedMemoryIds.push({ id: 'm-deleted', deletedAt: LAST_SYNC + 100 });

    await SyncDataService.applyPartialRemoteData({
      [`memories:${BOOK_ID}`]: {
        kind: 'memories',
        bookId: BOOK_ID,
        value: [
          {
            id: 'm-deleted',
            bookId: BOOK_ID,
            content: 'ghost',
            summary: '',
            createdAt: LAST_SYNC - 1000,
            lastAccessedAt: LAST_SYNC - 500,
          },
        ],
      },
    });

    const createCalls = createSpy.mock.calls.map((c: unknown[]) => c[1]);
    expect(createCalls).not.toContain('m-deleted');
  });
});

describe('applyPartialRemoteData: novel structure merge regression', () => {
  let localBooks: Array<Record<string, unknown>>;
  let bulkAddBooksSpy: ReturnType<typeof mock>;

  beforeEach(() => {
    localBooks = [];
    bulkAddBooksSpy = mock((books: Array<Record<string, unknown>>) => Promise.resolve(books));

    spyOn(GlobalConfig, 'ensureInitialized').mockResolvedValue(undefined);
    spyOn(GlobalConfig, 'getGistSyncSnapshot').mockImplementation(() => makeConfig());
    spyOn(AIModelsStore, 'useAIModelsStore').mockReturnValue({ models: [] } as any);
    spyOn(BooksStore, 'useBooksStore').mockReturnValue({
      books: localBooks,
      bulkAddBooks: bulkAddBooksSpy,
    } as any);
    spyOn(CoverHistoryStore, 'useCoverHistoryStore').mockReturnValue({
      covers: [],
      addCover: mock(() => Promise.resolve()),
      removeCover: mock(() => Promise.resolve()),
    } as any);
    spyOn(SettingsStore, 'useSettingsStore').mockReturnValue({
      getAllSettings: () => ({ lastEdited: new Date(0) }),
      importSettings: mock(() => Promise.resolve()),
    } as any);
  });

  afterEach(() => {
    mock.restore();
  });

  it('当本地时间更新但远端 novel 结构更完整时，仍保留远端新增章节和实体', async () => {
    localBooks.push({
      id: 'book-1',
      title: 'Local Book',
      lastEdited: new Date(LAST_SYNC + 5_000),
      createdAt: new Date(LAST_SYNC - 5_000),
      terminologies: [],
      characterSettings: [],
      volumes: [
        {
          id: 'v1',
          title: '卷一',
          chapters: [
            {
              id: 'c1',
              title: '第一章',
              lastEdited: new Date(LAST_SYNC + 5_000),
              createdAt: new Date(LAST_SYNC - 5_000),
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
    });

    await SyncDataService.applyPartialRemoteData({
      'novel:book-1': {
        kind: 'novel',
        bookId: 'book-1',
        value: {
          id: 'book-1',
          title: 'Remote Book',
          lastEdited: new Date(LAST_SYNC + 1_000),
          createdAt: new Date(LAST_SYNC - 5_000),
          terminologies: [
            {
              id: 'term-1',
              name: '魔法',
              translation: { id: 'term-t1', translation: 'Magic', aiModelId: 'm1' },
            },
          ],
          characterSettings: [
            {
              id: 'char-1',
              name: '露娜',
              sex: 'female',
              translation: { id: 'char-t1', translation: 'Luna', aiModelId: 'm1' },
              aliases: [],
            },
          ],
          volumes: [
            {
              id: 'v1',
              title: '卷一',
              chapters: [
                {
                  id: 'c1',
                  title: '第一章',
                  lastEdited: new Date(LAST_SYNC + 1_000),
                  createdAt: new Date(LAST_SYNC - 5_000),
                  content: [
                    {
                      id: 'p1',
                      text: '原文',
                      selectedTranslationId: 't-remote',
                      translations: [{ id: 't-remote', translation: '远端译文', aiModelId: 'm1' }],
                    },
                  ],
                },
                {
                  id: 'c2',
                  title: '第二章',
                  lastEdited: new Date(LAST_SYNC + 1_000),
                  createdAt: new Date(LAST_SYNC - 4_000),
                  content: [
                    {
                      id: 'p2',
                      text: '新增章节',
                      selectedTranslationId: 't2',
                      translations: [{ id: 't2', translation: '新增译文', aiModelId: 'm1' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    });

    expect(bulkAddBooksSpy).toHaveBeenCalledTimes(1);
    const mergedBook = bulkAddBooksSpy.mock.calls[0]?.[0]?.[0] as {
      terminologies?: Array<{ id: string }>;
      characterSettings?: Array<{ id: string }>;
      volumes?: Array<{ chapters?: Array<{ id: string }> }>;
    };
    expect(mergedBook.terminologies?.map((term) => term.id)).toContain('term-1');
    expect(mergedBook.characterSettings?.map((character) => character.id)).toContain('char-1');
    expect(mergedBook.volumes?.[0]?.chapters?.map((chapter) => chapter.id)).toContain('c2');
  });

  it('当 book 级时间戳本地更大但远端章节本身更新更晚时，应采用远端章节元数据', async () => {
    localBooks.push({
      id: 'book-2',
      title: 'Local Book',
      lastEdited: new Date(LAST_SYNC + 10_000),
      createdAt: new Date(LAST_SYNC - 5_000),
      volumes: [
        {
          id: 'v1',
          title: '卷一',
          chapters: [
            {
              id: 'c1',
              title: '旧标题',
              lastEdited: new Date(LAST_SYNC + 1_000),
              createdAt: new Date(LAST_SYNC - 5_000),
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
    });

    await SyncDataService.applyPartialRemoteData({
      'novel:book-2': {
        kind: 'novel',
        bookId: 'book-2',
        value: {
          id: 'book-2',
          title: 'Remote Book',
          lastEdited: new Date(LAST_SYNC + 5_000),
          createdAt: new Date(LAST_SYNC - 5_000),
          volumes: [
            {
              id: 'v1',
              title: '卷一',
              chapters: [
                {
                  id: 'c1',
                  title: '新标题',
                  lastEdited: new Date(LAST_SYNC + 8_000),
                  createdAt: new Date(LAST_SYNC - 5_000),
                  content: [
                    {
                      id: 'p1',
                      text: '原文',
                      selectedTranslationId: 't-remote',
                      translations: [{ id: 't-remote', translation: '远端译文', aiModelId: 'm2' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    });

    const mergedBook = bulkAddBooksSpy.mock.calls[0]?.[0]?.[0] as {
      volumes?: Array<{
        chapters?: Array<{
          title: string;
          content?: Array<{
            selectedTranslationId: string;
            translations: Array<{ id: string }>;
          }>;
        }>;
      }>;
    };
    const mergedChapter = mergedBook.volumes?.[0]?.chapters?.[0];
    expect(mergedChapter?.title).toBe('新标题');
    expect(mergedChapter?.content?.[0]?.selectedTranslationId).toBe('t-remote');
    expect(mergedChapter?.content?.[0]?.translations.map((translation) => translation.id)).toEqual([
      't-remote',
      't-local',
    ]);
  });

  it('当本地保留了陈旧章节但远端书籍版本已删掉它时，不应在合并后复活该章节', async () => {
    localBooks.push({
      id: 'book-3',
      title: 'Local Book',
      lastEdited: new Date(LAST_SYNC + 12_000),
      createdAt: new Date(LAST_SYNC - 5_000),
      volumes: [
        {
          id: 'v1',
          title: '卷一',
          chapters: [
            {
              id: 'c-keep',
              title: '保留章节',
              lastEdited: new Date(LAST_SYNC + 2_000),
              createdAt: new Date(LAST_SYNC - 5_000),
              content: [],
            },
            {
              id: 'c-deleted',
              title: '已删章节',
              lastEdited: new Date(LAST_SYNC - 1_000),
              createdAt: new Date(LAST_SYNC - 5_000),
              content: [],
            },
          ],
        },
      ],
    });

    await SyncDataService.applyPartialRemoteData({
      'novel:book-3': {
        kind: 'novel',
        bookId: 'book-3',
        value: {
          id: 'book-3',
          title: 'Remote Book',
          lastEdited: new Date(LAST_SYNC + 9_000),
          createdAt: new Date(LAST_SYNC - 5_000),
          volumes: [
            {
              id: 'v1',
              title: '卷一',
              chapters: [
                {
                  id: 'c-keep',
                  title: '保留章节',
                  lastEdited: new Date(LAST_SYNC + 2_000),
                  createdAt: new Date(LAST_SYNC - 5_000),
                  content: [],
                },
              ],
            },
          ],
        },
      },
    });

    const mergedBook = bulkAddBooksSpy.mock.calls[0]?.[0]?.[0] as {
      volumes?: Array<{ chapters?: Array<{ id: string }> }>;
    };
    expect(mergedBook.volumes?.[0]?.chapters?.map((chapter) => chapter.id)).toContain('c-keep');
    expect(mergedBook.volumes?.[0]?.chapters?.map((chapter) => chapter.id)).not.toContain(
      'c-deleted',
    );
  });

  it('当本地较新且本地章节在上次同步后离线新增时，不应被远端缺失结构误删', async () => {
    localBooks.push({
      id: 'book-3b',
      title: 'Local Book',
      lastEdited: new Date(LAST_SYNC + 12_000),
      createdAt: new Date(LAST_SYNC - 5_000),
      volumes: [
        {
          id: 'v1',
          title: '卷一',
          chapters: [
            {
              id: 'c-remote',
              title: '远端已知章节',
              lastEdited: new Date(LAST_SYNC - 1_000),
              createdAt: new Date(LAST_SYNC - 5_000),
              content: [],
            },
            {
              id: 'c-local-offline',
              title: '本地离线新增章节',
              lastEdited: new Date(LAST_SYNC + 5_000),
              createdAt: new Date(LAST_SYNC + 5_000),
              content: [],
            },
          ],
        },
      ],
    });

    await SyncDataService.applyPartialRemoteData({
      'novel:book-3b': {
        kind: 'novel',
        bookId: 'book-3b',
        value: {
          id: 'book-3b',
          title: 'Remote Book',
          lastEdited: new Date(LAST_SYNC + 9_000),
          createdAt: new Date(LAST_SYNC - 5_000),
          volumes: [
            {
              id: 'v1',
              title: '卷一',
              chapters: [
                {
                  id: 'c-remote',
                  title: '远端已知章节',
                  lastEdited: new Date(LAST_SYNC + 9_000),
                  createdAt: new Date(LAST_SYNC - 5_000),
                  content: [],
                },
              ],
            },
          ],
        },
      },
    });

    const mergedBook = bulkAddBooksSpy.mock.calls[0]?.[0]?.[0] as {
      volumes?: Array<{ chapters?: Array<{ id: string }> }>;
    };
    expect(mergedBook.volumes?.[0]?.chapters?.map((chapter) => chapter.id)).toContain('c-remote');
    expect(mergedBook.volumes?.[0]?.chapters?.map((chapter) => chapter.id)).toContain(
      'c-local-offline',
    );
  });

  it('当远端较新且本地章节在上次同步后离线新增时，不应被误删', async () => {
    localBooks.push({
      id: 'book-3c',
      title: 'Local Book',
      lastEdited: new Date(LAST_SYNC + 7_000),
      createdAt: new Date(LAST_SYNC - 5_000),
      volumes: [
        {
          id: 'v1',
          title: '卷一',
          chapters: [
            {
              id: 'c-remote',
              title: '远端已知章节',
              lastEdited: new Date(LAST_SYNC - 1_000),
              createdAt: new Date(LAST_SYNC - 5_000),
              content: [],
            },
            {
              id: 'c-local-offline',
              title: '本地离线新增章节',
              lastEdited: new Date(LAST_SYNC + 5_000),
              createdAt: new Date(LAST_SYNC + 5_000),
              content: [],
            },
          ],
        },
      ],
    });

    await SyncDataService.applyPartialRemoteData({
      'novel:book-3c': {
        kind: 'novel',
        bookId: 'book-3c',
        value: {
          id: 'book-3c',
          title: 'Remote Book',
          lastEdited: new Date(LAST_SYNC + 9_000),
          createdAt: new Date(LAST_SYNC - 5_000),
          volumes: [
            {
              id: 'v1',
              title: '卷一',
              chapters: [
                {
                  id: 'c-remote',
                  title: '远端已知章节',
                  lastEdited: new Date(LAST_SYNC + 9_000),
                  createdAt: new Date(LAST_SYNC - 5_000),
                  content: [],
                },
              ],
            },
          ],
        },
      },
    });

    const mergedBook = bulkAddBooksSpy.mock.calls[0]?.[0]?.[0] as {
      volumes?: Array<{ chapters?: Array<{ id: string }> }>;
    };
    expect(mergedBook.volumes?.[0]?.chapters?.map((chapter) => chapter.id)).toContain('c-remote');
    expect(mergedBook.volumes?.[0]?.chapters?.map((chapter) => chapter.id)).toContain(
      'c-local-offline',
    );
  });

  it('当本地较新但远端已删除旧卷时，不应在合并后复活该卷', async () => {
    localBooks.push({
      id: 'book-3d',
      title: 'Local Book',
      lastEdited: new Date(LAST_SYNC + 12_000),
      createdAt: new Date(LAST_SYNC - 5_000),
      volumes: [
        {
          id: 'v-keep',
          title: '保留卷',
          chapters: [
            {
              id: 'c-keep',
              title: '保留章节',
              lastEdited: new Date(LAST_SYNC + 11_000),
              createdAt: new Date(LAST_SYNC - 5_000),
              content: [],
            },
          ],
        },
        {
          id: 'v-stale',
          title: '陈旧卷',
          chapters: [
            {
              id: 'c-stale',
              title: '陈旧章节',
              lastEdited: new Date(LAST_SYNC - 1_000),
              createdAt: new Date(LAST_SYNC - 5_000),
              content: [],
            },
          ],
        },
      ],
    });

    await SyncDataService.applyPartialRemoteData({
      'novel:book-3d': {
        kind: 'novel',
        bookId: 'book-3d',
        value: {
          id: 'book-3d',
          title: 'Remote Book',
          lastEdited: new Date(LAST_SYNC + 9_000),
          createdAt: new Date(LAST_SYNC - 5_000),
          volumes: [
            {
              id: 'v-keep',
              title: '保留卷',
              chapters: [
                {
                  id: 'c-keep',
                  title: '保留章节',
                  lastEdited: new Date(LAST_SYNC + 9_000),
                  createdAt: new Date(LAST_SYNC - 5_000),
                  content: [],
                },
              ],
            },
          ],
        },
      },
    });

    const mergedBook = bulkAddBooksSpy.mock.calls[0]?.[0]?.[0] as {
      volumes?: Array<{ id: string }>;
    };
    expect(mergedBook.volumes?.map((volume) => volume.id)).toContain('v-keep');
    expect(mergedBook.volumes?.map((volume) => volume.id)).not.toContain('v-stale');
  });

  it('当本地较新但远端保留着本地已删除的旧章节时，不应在合并后复活该章节', async () => {
    localBooks.push({
      id: 'book-3e',
      title: 'Local Book',
      lastEdited: new Date(LAST_SYNC + 12_000),
      createdAt: new Date(LAST_SYNC - 5_000),
      volumes: [
        {
          id: 'v1',
          title: '卷一',
          chapters: [
            {
              id: 'c-keep',
              title: '保留章节',
              lastEdited: new Date(LAST_SYNC + 11_000),
              createdAt: new Date(LAST_SYNC - 5_000),
              content: [],
            },
          ],
        },
      ],
    });

    await SyncDataService.applyPartialRemoteData({
      'novel:book-3e': {
        kind: 'novel',
        bookId: 'book-3e',
        value: {
          id: 'book-3e',
          title: 'Remote Book',
          lastEdited: new Date(LAST_SYNC + 9_000),
          createdAt: new Date(LAST_SYNC - 5_000),
          volumes: [
            {
              id: 'v1',
              title: '卷一',
              chapters: [
                {
                  id: 'c-keep',
                  title: '保留章节',
                  lastEdited: new Date(LAST_SYNC + 9_000),
                  createdAt: new Date(LAST_SYNC - 5_000),
                  content: [],
                },
                {
                  id: 'c-stale',
                  title: '陈旧章节',
                  lastEdited: new Date(LAST_SYNC - 1_000),
                  createdAt: new Date(LAST_SYNC - 5_000),
                  content: [],
                },
              ],
            },
          ],
        },
      },
    });

    const mergedBook = bulkAddBooksSpy.mock.calls[0]?.[0]?.[0] as {
      volumes?: Array<{ chapters?: Array<{ id: string }> }>;
    };
    const mergedChapterIds = mergedBook.volumes?.[0]?.chapters?.map((chapter) => chapter.id);
    expect(mergedChapterIds).toContain('c-keep');
    expect(mergedChapterIds).not.toContain('c-stale');
  });

  it('当同 ID note 的 lastEdited 更晚时，应采用较新的 note 内容', async () => {
    localBooks.push({
      id: 'book-4',
      title: 'Local Book',
      lastEdited: new Date(LAST_SYNC + 20_000),
      createdAt: new Date(LAST_SYNC - 5_000),
      notes: [
        {
          id: 'note-1',
          text: '本地旧笔记',
          aiResults: [],
          defaultAIModelId: 'm1',
          lastEdited: new Date(LAST_SYNC + 1_000),
          createdAt: new Date(LAST_SYNC - 5_000),
          references: [],
        },
      ],
      volumes: [],
    });

    await SyncDataService.applyPartialRemoteData({
      'novel:book-4': {
        kind: 'novel',
        bookId: 'book-4',
        value: {
          id: 'book-4',
          title: 'Remote Book',
          lastEdited: new Date(LAST_SYNC + 10_000),
          createdAt: new Date(LAST_SYNC - 5_000),
          notes: [
            {
              id: 'note-1',
              text: '远端新笔记',
              aiResults: [],
              defaultAIModelId: 'm1',
              lastEdited: new Date(LAST_SYNC + 15_000),
              createdAt: new Date(LAST_SYNC - 5_000),
              references: [],
            },
          ],
          volumes: [],
        },
      },
    });

    const mergedBook = bulkAddBooksSpy.mock.calls[0]?.[0]?.[0] as {
      notes?: Array<{ text: string }>;
    };
    expect(mergedBook.notes?.[0]?.text).toBe('远端新笔记');
  });
});

// ─────────────────────────────────────────────────────────────
// applyRemoteDeletions — tombstone / lastSyncTime threshold semantics
// ─────────────────────────────────────────────────────────────

describe('applyRemoteDeletions: tombstone threshold', () => {
  let localBooks: Array<{ id: string; title: string; lastEdited: Date }>;
  let deleteBookSpy: ReturnType<typeof mock>;

  beforeEach(() => {
    localBooks = [];
    deleteBookSpy = mock(() => Promise.resolve());

    spyOn(GlobalConfig, 'ensureInitialized').mockResolvedValue(undefined);
    spyOn(GlobalConfig, 'getGistSyncSnapshot').mockImplementation(() => makeConfig());
    spyOn(AIModelsStore, 'useAIModelsStore').mockReturnValue({ models: [] } as any);
    spyOn(BooksStore, 'useBooksStore').mockReturnValue({
      books: localBooks,
      deleteBook: deleteBookSpy,
    } as any);
    spyOn(CoverHistoryStore, 'useCoverHistoryStore').mockReturnValue({
      covers: [],
    } as any);
    spyOn(SettingsStore, 'useSettingsStore').mockReturnValue({} as any);
    spyOn(MemoryService, 'getAllMemories').mockResolvedValue([]);
    spyOn(MemoryService, 'deleteMemory').mockResolvedValue(undefined);
  });

  afterEach(() => {
    mock.restore();
  });

  it('deletes a local book when tombstone is newer than local lastEdited', async () => {
    localBooks.push({
      id: 'b1',
      title: 'old',
      lastEdited: new Date(LAST_SYNC - 1000),
    });

    await SyncDataService.applyRemoteDeletions([
      { key: novelEntryKey('b1'), deletedAt: new Date(LAST_SYNC + 100).toISOString() },
    ]);

    expect(deleteBookSpy).toHaveBeenCalledWith('b1');
  });

  it('keeps a local book when lastEdited is newer than tombstone deletedAt', async () => {
    localBooks.push({
      id: 'b1',
      title: 'local wins',
      lastEdited: new Date(LAST_SYNC + 5000),
    });

    await SyncDataService.applyRemoteDeletions([
      { key: novelEntryKey('b1'), deletedAt: new Date(LAST_SYNC + 100).toISOString() },
    ]);

    expect(deleteBookSpy).not.toHaveBeenCalled();
  });

  it('falls back to lastSyncTime when deletedAt is missing (implicit deletion)', async () => {
    localBooks.push({
      id: 'b-stale',
      title: 'stale',
      lastEdited: new Date(LAST_SYNC - 500),
    });

    await SyncDataService.applyRemoteDeletions([{ key: novelEntryKey('b-stale') }]);

    expect(deleteBookSpy).toHaveBeenCalledWith('b-stale');
  });

  it('ignores aggregated entry deletions (ai-models / cover-history / settings)', async () => {
    await SyncDataService.applyRemoteDeletions([
      { key: 'ai-models', deletedAt: new Date().toISOString() },
      { key: 'cover-history' },
      { key: 'settings' },
    ]);

    expect(deleteBookSpy).not.toHaveBeenCalled();
  });

  it('returns early on empty deletions list without touching stores', async () => {
    await SyncDataService.applyRemoteDeletions([]);
    expect(deleteBookSpy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyPartialRemoteData — memories envelope tombstones (v3 root-cause fix)
// ─────────────────────────────────────────────────────────────────────────────

describe('applyPartialRemoteData: memories envelope tombstones', () => {
  const BOOK_ID = 'book-1';
  let createSpy: ReturnType<typeof spyOn>;
  let deleteSpy: ReturnType<typeof spyOn>;
  let localMemories: Array<{
    id: string;
    bookId: string;
    content: string;
    summary: string;
    createdAt: number;
    lastAccessedAt: number;
  }>;

  beforeEach(() => {
    localMemories = [];
    spyOn(GlobalConfig, 'ensureInitialized').mockResolvedValue(undefined);
    spyOn(GlobalConfig, 'getGistSyncSnapshot').mockImplementation(() => makeConfig());
    spyOn(AIModelsStore, 'useAIModelsStore').mockReturnValue({ models: [] } as any);
    spyOn(BooksStore, 'useBooksStore').mockReturnValue({ books: [] } as any);
    spyOn(CoverHistoryStore, 'useCoverHistoryStore').mockReturnValue({
      covers: [],
      addCover: mock(() => Promise.resolve()),
      removeCover: mock(() => Promise.resolve()),
    } as any);
    spyOn(SettingsStore, 'useSettingsStore').mockReturnValue({
      getAllSettings: () => ({ lastEdited: new Date(0) }),
      importSettings: mock(() => Promise.resolve()),
    } as any);
    spyOn(MemoryService, 'getAllMemories').mockImplementation(() =>
      Promise.resolve(localMemories.map((m) => ({ ...m })) as any),
    );
    createSpy = spyOn(MemoryService, 'upsertMemoryForSync').mockResolvedValue(undefined as any);
    deleteSpy = spyOn(MemoryService, 'deleteMemory').mockResolvedValue(undefined);
  });

  afterEach(() => {
    mock.restore();
  });

  it('远端 envelope 墓碑删除本地 memory（lastAccessedAt < deletedAt）', async () => {
    localMemories.push({
      id: 'mem-victim',
      bookId: BOOK_ID,
      content: 'will-be-deleted',
      summary: '',
      createdAt: LAST_SYNC - 1000,
      lastAccessedAt: LAST_SYNC - 100, // 早于墓碑
    });

    await SyncDataService.applyPartialRemoteData({
      [`memories:${BOOK_ID}`]: {
        kind: 'memories',
        bookId: BOOK_ID,
        value: {
          memories: [],
          tombstones: [{ id: 'mem-victim', deletedAt: LAST_SYNC + 500 }],
        },
      },
    });

    expect(deleteSpy).toHaveBeenCalledWith(BOOK_ID, 'mem-victim');
  });

  it('远端 envelope 墓碑保留本地 memory（lastAccessedAt > deletedAt = 本地后续编辑赢）', async () => {
    localMemories.push({
      id: 'mem-survivor',
      bookId: BOOK_ID,
      content: 'edited-after-delete',
      summary: '',
      createdAt: LAST_SYNC - 1000,
      lastAccessedAt: LAST_SYNC + 10_000, // 晚于墓碑
    });

    await SyncDataService.applyPartialRemoteData({
      [`memories:${BOOK_ID}`]: {
        kind: 'memories',
        bookId: BOOK_ID,
        value: {
          memories: [],
          tombstones: [{ id: 'mem-survivor', deletedAt: LAST_SYNC + 500 }],
        },
      },
    });

    expect(deleteSpy).not.toHaveBeenCalled();
    const ids = createSpy.mock.calls.map((c: unknown[]) => (c[0] as { id: string }).id);
    expect(ids).toContain('mem-survivor');
  });

  it('envelope 仅含 tombstones 时（无 live memories）也能正确应用删除', async () => {
    localMemories.push(
      {
        id: 'mem-A',
        bookId: BOOK_ID,
        content: 'A',
        summary: '',
        createdAt: LAST_SYNC - 1000,
        lastAccessedAt: LAST_SYNC - 100,
      },
      {
        id: 'mem-B',
        bookId: BOOK_ID,
        content: 'B',
        summary: '',
        createdAt: LAST_SYNC - 1000,
        lastAccessedAt: LAST_SYNC - 100,
      },
    );

    await SyncDataService.applyPartialRemoteData({
      [`memories:${BOOK_ID}`]: {
        kind: 'memories',
        bookId: BOOK_ID,
        value: {
          memories: [],
          tombstones: [{ id: 'mem-A', deletedAt: LAST_SYNC + 500 }],
        },
      },
    });

    expect(deleteSpy).toHaveBeenCalledWith(BOOK_ID, 'mem-A');
    expect(deleteSpy).not.toHaveBeenCalledWith(BOOK_ID, 'mem-B');
  });

  it('envelope 兼容性：扁平 Memory[] 数组形态仍然能被解析（v2 数据）', async () => {
    localMemories.push({
      id: 'mem-stale',
      bookId: BOOK_ID,
      content: 'old',
      summary: '',
      createdAt: LAST_SYNC - 1000,
      lastAccessedAt: LAST_SYNC - 500,
    });

    // 旧的扁平数组形态（v2）：value 是 Memory[]
    await SyncDataService.applyPartialRemoteData({
      [`memories:${BOOK_ID}`]: {
        kind: 'memories',
        bookId: BOOK_ID,
        value: [
          {
            id: 'mem-stale',
            bookId: BOOK_ID,
            content: 'old',
            summary: '',
            createdAt: LAST_SYNC - 1000,
            lastAccessedAt: LAST_SYNC - 500,
          },
        ],
      },
    });

    // 应作为正常合并处理，不抛错
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyRemoteDeletions — memories collection-level tombstone (createdAt rule)
// ─────────────────────────────────────────────────────────────────────────────

describe('applyRemoteDeletions: memories collection-level tombstone', () => {
  const BOOK_ID = 'book-cleared';
  let getAllSpy: ReturnType<typeof spyOn>;
  let deleteSpy: ReturnType<typeof spyOn>;
  let localMemories: Array<{
    id: string;
    bookId: string;
    content: string;
    summary: string;
    createdAt: number;
    lastAccessedAt: number;
  }>;

  beforeEach(() => {
    localMemories = [];

    spyOn(GlobalConfig, 'ensureInitialized').mockResolvedValue(undefined);
    spyOn(GlobalConfig, 'getGistSyncSnapshot').mockImplementation(() => makeConfig());
    spyOn(AIModelsStore, 'useAIModelsStore').mockReturnValue({ models: [] } as any);
    spyOn(BooksStore, 'useBooksStore').mockReturnValue({
      books: [],
      deleteBook: mock(() => Promise.resolve()),
    } as any);
    spyOn(CoverHistoryStore, 'useCoverHistoryStore').mockReturnValue({ covers: [] } as any);
    spyOn(SettingsStore, 'useSettingsStore').mockReturnValue({} as any);
    getAllSpy = spyOn(MemoryService, 'getAllMemories').mockImplementation(() =>
      Promise.resolve(localMemories.map((m) => ({ ...m })) as any),
    );
    deleteSpy = spyOn(MemoryService, 'deleteMemory').mockResolvedValue(undefined);
  });

  afterEach(() => {
    mock.restore();
  });

  it('显式墓碑：createdAt <= deletedAt 的 memory 被删除', async () => {
    localMemories.push({
      id: 'old-mem',
      bookId: BOOK_ID,
      content: 'pre-tombstone',
      summary: '',
      createdAt: LAST_SYNC - 5000,
      lastAccessedAt: LAST_SYNC + 999_999, // 即使本地反复读取，仍删除
    });

    await SyncDataService.applyRemoteDeletions([
      {
        key: `memories:${BOOK_ID}`,
        deletedAt: new Date(LAST_SYNC + 100).toISOString(),
      },
    ]);

    expect(deleteSpy).toHaveBeenCalledWith(BOOK_ID, 'old-mem');
  });

  it('显式墓碑：createdAt > deletedAt 的本地新增 memory 被保留', async () => {
    localMemories.push(
      {
        id: 'old-mem',
        bookId: BOOK_ID,
        content: 'pre-tombstone',
        summary: '',
        createdAt: LAST_SYNC - 5000,
        lastAccessedAt: LAST_SYNC,
      },
      {
        id: 'fresh-mem',
        bookId: BOOK_ID,
        content: 'created-after-tombstone',
        summary: '',
        createdAt: LAST_SYNC + 1000, // 墓碑发布后才创建
        lastAccessedAt: LAST_SYNC + 1000,
      },
    );

    await SyncDataService.applyRemoteDeletions([
      {
        key: `memories:${BOOK_ID}`,
        deletedAt: new Date(LAST_SYNC + 500).toISOString(),
      },
    ]);

    expect(deleteSpy).toHaveBeenCalledWith(BOOK_ID, 'old-mem');
    expect(deleteSpy).not.toHaveBeenCalledWith(BOOK_ID, 'fresh-mem');
  });

  it('lastAccessedAt 不再用于判断本地持有（修复假阳性）', async () => {
    // 旧启发式会因"本地有较新 lastAccessedAt"而保留全部，导致永远删不掉
    localMemories.push({
      id: 'often-read',
      bookId: BOOK_ID,
      content: 'should-be-deleted',
      summary: '',
      createdAt: LAST_SYNC - 5000,
      lastAccessedAt: LAST_SYNC + 999_999, // 本地反复读取
    });

    await SyncDataService.applyRemoteDeletions([
      {
        key: `memories:${BOOK_ID}`,
        deletedAt: new Date(LAST_SYNC + 100).toISOString(),
      },
    ]);

    expect(deleteSpy).toHaveBeenCalledWith(BOOK_ID, 'often-read');
  });

  it('隐式删除（无墓碑）保守跳过，不再触发批量删除', async () => {
    localMemories.push({
      id: 'safe-mem',
      bookId: BOOK_ID,
      content: 'no-tombstone',
      summary: '',
      createdAt: LAST_SYNC - 5000,
      lastAccessedAt: LAST_SYNC - 100,
    });

    await SyncDataService.applyRemoteDeletions([{ key: `memories:${BOOK_ID}` }]);

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(getAllSpy).toHaveBeenCalled();
  });

  it('墓碑 deletedAt 字符串无效时跳过（不误删）', async () => {
    localMemories.push({
      id: 'safe-mem',
      bookId: BOOK_ID,
      content: 'protected',
      summary: '',
      createdAt: LAST_SYNC - 5000,
      lastAccessedAt: LAST_SYNC,
    });

    await SyncDataService.applyRemoteDeletions([
      { key: `memories:${BOOK_ID}`, deletedAt: 'not-a-date' },
    ]);

    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
