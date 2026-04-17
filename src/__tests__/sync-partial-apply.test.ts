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
    createSpy = spyOn(MemoryService, 'upsertMemoryForSync').mockResolvedValue(
      undefined as any,
    );
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
