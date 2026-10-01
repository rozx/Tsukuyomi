import './setup';
import { describe, expect, it, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import * as AIModelsStore from 'src/stores/ai-models';
import * as BooksStore from 'src/stores/books';
import * as CoverHistoryStore from 'src/stores/cover-history';
import * as SettingsStore from 'src/stores/settings';

/**
 * 强制推送模式测试
 *
 * 覆盖 executeForceSync 的核心行为契约：
 *   - 跳过 pseudo-CAS（不调用 verifyRemoteUnchanged）
 *   - 清空 knownRemoteHashes/Entries 传给 uploadToGistIncremental
 *   - 成功后重置 forceSyncMode
 *   - 失败后保留 forceSyncMode.active 并写入 lastFailedAt
 *   - 无 gistId 时退化为 executeSync 并重置 toggle
 *
 * 注意：使用 spyOn 隔离 store 访问，避免 mock.module 在 bun:test 中跨文件污染模块缓存。
 */

// ── 可变的 mock store 状态 —— 每个测试在 beforeEach 中重置 ──
type ForceSyncMode = { active: boolean; lastFailedAt?: number; operationId?: string };

const mockSettings = {
  syncState: {
    gistId: 'abc',
    username: 'u',
    secret: 'token',
    knownRemoteHashes: {} as Record<string, string>,
    knownRemoteEntries: {} as Record<string, { hash: string; chunks?: number }>,
    forceSyncMode: { active: false } as ForceSyncMode,
    deletedNovelIds: [] as Array<{ id: string; deletedAt: number }>,
    knownRemoteTombstones: {} as Record<string, string>,
  },
};

const makeMockSettingsStore = () => ({
  uiLocale: 'zh-CN',
  get gistSync() {
    const s = mockSettings.syncState;
    return {
      enabled: true,
      lastSyncTime: 0,
      syncInterval: 300000,
      syncType: 'gist',
      syncParams: { username: s.username, gistId: s.gistId },
      secret: s.secret,
      apiEndpoint: '',
      knownRemoteHashes: s.knownRemoteHashes,
      knownRemoteEntries: s.knownRemoteEntries,
      knownRemoteTombstones: s.knownRemoteTombstones,
      deletedNovelIds: s.deletedNovelIds,
      forceSyncMode: s.forceSyncMode,
    };
  },
  get forceSyncMode(): ForceSyncMode {
    return mockSettings.syncState.forceSyncMode;
  },
  getAllSettings: () => ({ lastEdited: new Date(0) }),
  updateSyncProgress: () => {},
  updateLastRemoteETag: () => Promise.resolve(),
  updateKnownRemoteHashes: () => Promise.resolve(),
  updateKnownRemoteEntries: () => Promise.resolve(),
  updateKnownRemoteSchemaVersion: () => Promise.resolve(),
  updateKnownRemoteTombstones: () => Promise.resolve(),
  updateLastSyncTime: () => Promise.resolve(),
  cleanupOldDeletionRecords: () => Promise.resolve(),
  setGistId: (id: string) => {
    mockSettings.syncState.gistId = id;
    return Promise.resolve();
  },
  updateForceSyncMode: (partial: ForceSyncMode, expectedOperationId?: string) => {
    const current = mockSettings.syncState.forceSyncMode;
    if (expectedOperationId && expectedOperationId !== current.operationId)
      return Promise.resolve();
    mockSettings.syncState.forceSyncMode = partial.active
      ? {
          active: true,
          ...((partial.operationId ?? current.operationId)
            ? { operationId: partial.operationId ?? current.operationId }
            : {}),
          ...(partial.lastFailedAt !== undefined ? { lastFailedAt: partial.lastFailedAt } : {}),
        }
      : { active: false };
    return Promise.resolve();
  },
});

const mockBooksStore = { books: [] as unknown[] };
const mockAIModelsStore = { models: [] as unknown[] };
const mockCoverHistoryStore = { covers: [] as unknown[] };

const { useSyncExecutor } = await import('src/composables/useSyncExecutor');
const { GistSyncService } = await import('src/services/gist-sync-service');
const { ChapterContentService } = await import('src/services/chapter-content-service');
const { MemoryService } = await import('src/services/memory-service');

describe('executeForceSync', () => {
  beforeEach(() => {
    mockBooksStore.books = [];
    spyOn(SettingsStore, 'useSettingsStore').mockImplementation(makeMockSettingsStore as any);
    spyOn(BooksStore, 'useBooksStore').mockReturnValue(mockBooksStore as any);
    spyOn(AIModelsStore, 'useAIModelsStore').mockReturnValue(mockAIModelsStore as any);
    spyOn(CoverHistoryStore, 'useCoverHistoryStore').mockReturnValue(mockCoverHistoryStore as any);

    mockSettings.syncState = {
      gistId: 'abc',
      username: 'u',
      secret: 'token',
      knownRemoteHashes: {},
      knownRemoteEntries: {},
      forceSyncMode: { active: false },
      deletedNovelIds: [],
      knownRemoteTombstones: {},
    };
    spyOn(ChapterContentService, 'loadAllChapterContentsForNovels').mockImplementation((novels) =>
      Promise.resolve(novels),
    );
    spyOn(MemoryService, 'getAllMemories').mockResolvedValue([]);
  });

  afterEach(() => {
    mock.restore();
  });

  const stubSuccessfulDownload = () =>
    spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
      skipped: false,
      remoteETag: 'etag-new',
      remoteFilesSnapshot: { 'novel-remote-only.json': { content: 'x', size: 1 } },
      changedEntries: {},
      deletedEntries: [],
      manifest: { schemaVersion: 1, tombstones: {}, entries: {} },
      remoteTombstones: {},
      needsMigration: false,
      schemaVersionTooNew: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

  const stubSuccessfulUpload = () =>
    spyOn(GistSyncService.prototype, 'uploadToGistIncremental').mockResolvedValue({
      remoteETag: 'etag-after',
      manifest: { schemaVersion: 1, tombstones: {}, entries: {} },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

  it('远端更高协议、读取失败或不完整快照时不上传，并强制读取所有远端条目', async () => {
    for (const overrides of [
      { schemaVersionTooNew: true },
      { failedEntryKeys: ['novel:b'] },
      { skipped: true },
    ]) {
      const download = spyOn(
        GistSyncService.prototype,
        'downloadFromGistWithManifest',
      ).mockResolvedValue({
        success: true,
        skipped: false,
        remoteETag: 'etag',
        remoteUpdatedAt: '',
        manifest: { schemaVersion: 3, updatedAt: new Date(0).toISOString(), entries: {} },
        changedEntries: {},
        deletedEntries: [],
        remoteTombstones: {},
        remoteFilesSnapshot: {},
        ...overrides,
      } as any);
      const upload = stubSuccessfulUpload();
      mockSettings.syncState.knownRemoteHashes = { 'novel:b': 'known' };
      const { executeForceSync } = useSyncExecutor();
      expect(
        (await executeForceSync({ messagePrefix: '', isManualRetrieval: true, onError: () => {} }))
          .success,
      ).toBe(false);
      expect(upload).not.toHaveBeenCalled();
      expect(download.mock.calls[0]![0].knownRemoteHashes).toEqual({});
      download.mockRestore();
      upload.mockRestore();
    }
  });

  it('恢复远端已删除的本地身份，上传失败重试使用相同新 ID 和语言槽版本', async () => {
    const { BookService } = await import('../services/book-service');
    const local = {
      id: 'b',
      title: 'Book',
      createdAt: new Date(0),
      lastEdited: new Date(0),
      characterSettings: [
        {
          id: 'c',
          name: 'Alice',
          sex: undefined,
          translation: { id: 'cn', translation: '爱丽丝', aiModelId: 'm' },
          aliases: [],
        },
      ],
    };
    await BookService.saveBook(local);
    mockBooksStore.books = [local];
    const remote = {
      ...local,
      characterSettings: [],
      entityTombstones: {
        '["character",null,"c"]': {
          kind: 'character' as const,
          id: 'c',
          revision: { counter: 100, actorId: 'remote' },
          deletedAt: 0,
        },
      },
    };
    spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
      success: true,
      skipped: false,
      remoteETag: 'etag',
      remoteUpdatedAt: '',
      manifest: { schemaVersion: 3, updatedAt: new Date(0).toISOString(), entries: {} },
      remoteFilesSnapshot: {},
      changedEntries: { 'novel:b': { kind: 'novel', bookId: 'b', value: remote } },
      deletedEntries: [],
      remoteTombstones: {},
      remoteEntryKeys: ['novel:b'],
    });
    const upload = stubSuccessfulUpload();
    upload.mockRejectedValueOnce(new Error('network failure'));
    const { executeForceSync } = useSyncExecutor();
    expect(
      (await executeForceSync({ messagePrefix: '', isManualRetrieval: true, onError: () => {} }))
        .success,
    ).toBe(false);
    const first = upload.mock.calls[0]![1].novels[0]!;
    expect(first.characterSettings![0]!.id).not.toBe('c');
    expect(
      (await executeForceSync({ messagePrefix: '', isManualRetrieval: true, onError: () => {} }))
        .success,
    ).toBe(true);
    expect(upload.mock.calls[1]![1].novels[0]).toEqual(first);
    expect((await BookService.getBookById('b'))!.characterSettings![0]!.id).toBe(
      first.characterSettings![0]!.id,
    );
  });

  it('远端独有书籍的实体协议超前也拒绝强制上传', async () => {
    spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
      success: true,
      skipped: false,
      remoteETag: 'etag',
      remoteUpdatedAt: '',
      manifest: { schemaVersion: 3, updatedAt: new Date(0).toISOString(), entries: {} },
      remoteFilesSnapshot: {},
      changedEntries: {
        'novel:future': {
          kind: 'novel',
          bookId: 'future',
          value: {
            id: 'future',
            title: 'Future',
            createdAt: new Date(0),
            lastEdited: new Date(0),
            entitySyncVersion: 2,
          },
        },
      },
      deletedEntries: [],
      remoteTombstones: {},
    } as any);
    const upload = stubSuccessfulUpload();
    const { executeForceSync } = useSyncExecutor();
    expect(
      (await executeForceSync({ messagePrefix: '', isManualRetrieval: true, onError: () => {} }))
        .success,
    ).toBe(false);
    expect(upload).not.toHaveBeenCalled();
  });

  it('强制推送后放回 Pinia 的书籍不带章节正文，上传载荷仍包含正文', async () => {
    const { BookService } = await import('../services/book-service');
    const chapter = { id: 'c1', title: '第一章', createdAt: new Date(0), lastEdited: new Date(0) };
    mockBooksStore.books = [
      {
        id: 'b1',
        title: '书',
        lastEdited: new Date(0),
        volumes: [{ id: 'v1', title: '卷', chapters: [chapter] }],
      },
    ];
    const body = [{ id: 'p1', text: '原文', translations: [], selectedTranslationId: '' }];
    (
      ChapterContentService.loadAllChapterContentsForNovels as ReturnType<typeof spyOn>
    ).mockImplementation((novels: any[]) =>
      Promise.resolve(
        novels.map((novel) => ({
          ...novel,
          volumes: novel.volumes.map((volume: any) => ({
            ...volume,
            chapters: volume.chapters.map((item: any) => ({
              ...item,
              content: body,
              contentLoaded: true,
            })),
          })),
        })),
      ),
    );
    spyOn(BookService, 'prepareForceBooks').mockImplementation((books: any) =>
      Promise.resolve(books),
    );
    stubSuccessfulDownload();
    const uploadSpy = stubSuccessfulUpload();

    const { executeForceSync } = useSyncExecutor();
    const result = await executeForceSync({
      messagePrefix: '',
      isManualRetrieval: true,
      onError: () => {},
      onSuccess: () => {},
    });

    expect(result.success).toBe(true);
    const stored = mockBooksStore.books[0] as any;
    expect(stored.volumes[0].chapters[0].content).toBeUndefined();
    expect(stored.volumes[0].chapters[0].contentLoaded).toBe(false);
    const uploaded = (uploadSpy.mock.calls[0]![1] as any).novels[0];
    expect(uploaded.volumes[0].chapters[0].content).toEqual(body);
  });

  it('跳过 pseudo-CAS —— 不调用 verifyRemoteUnchanged', async () => {
    stubSuccessfulDownload();
    stubSuccessfulUpload();
    const verifySpy = spyOn(GistSyncService.prototype, 'verifyRemoteUnchanged').mockResolvedValue({
      status: 'unchanged',
      etag: 'etag',
    });

    const { executeForceSync } = useSyncExecutor();
    const result = await executeForceSync({
      messagePrefix: '',
      isManualRetrieval: true,
      onError: () => {},
      onSuccess: () => {},
    });

    expect(result.success).toBe(true);
    expect(verifySpy).not.toHaveBeenCalled();
  });

  it('上传时 effectiveConfig.knownRemoteHashes 和 knownRemoteEntries 都是空对象', async () => {
    stubSuccessfulDownload();
    const uploadSpy = stubSuccessfulUpload();

    // 预置 known 状态，看 executeForceSync 是否会在调用上传时清空
    mockSettings.syncState.knownRemoteHashes = { 'settings:app': 'hash-old' };
    mockSettings.syncState.knownRemoteEntries = { 'settings:app': { hash: 'hash-old' } };

    const { executeForceSync } = useSyncExecutor();
    await executeForceSync({
      messagePrefix: '',
      isManualRetrieval: true,
      onError: () => {},
      onSuccess: () => {},
    });

    expect(uploadSpy).toHaveBeenCalled();
    const [effectiveConfig] = uploadSpy.mock.calls[0] as unknown as [
      { knownRemoteHashes: Record<string, string>; knownRemoteEntries: Record<string, unknown> },
    ];
    expect(effectiveConfig.knownRemoteHashes).toEqual({});
    expect(effectiveConfig.knownRemoteEntries).toEqual({});
  });

  it('成功后 forceSyncMode.active 被重置为 false', async () => {
    stubSuccessfulDownload();
    stubSuccessfulUpload();

    mockSettings.syncState.forceSyncMode = { active: true, lastFailedAt: Date.now() };

    const { executeForceSync } = useSyncExecutor();
    const result = await executeForceSync({
      messagePrefix: '',
      isManualRetrieval: true,
      onError: () => {},
      onSuccess: () => {},
    });

    expect(result.success).toBe(true);
    expect(mockSettings.syncState.forceSyncMode.active).toBe(false);
    expect(mockSettings.syncState.forceSyncMode.lastFailedAt).toBeUndefined();
  });

  it('上传失败后 forceSyncMode.active 保持 true 且 lastFailedAt 被设置', async () => {
    stubSuccessfulDownload();
    spyOn(GistSyncService.prototype, 'uploadToGistIncremental').mockRejectedValue(
      new Error('simulated upload failure'),
    );

    const errors: string[] = [];
    const { executeForceSync } = useSyncExecutor();
    const result = await executeForceSync({
      messagePrefix: '',
      isManualRetrieval: true,
      onError: (_s, d) => errors.push(d),
      onSuccess: () => {},
    });

    expect(result.success).toBe(false);
    expect(errors.length).toBe(1);
    expect(mockSettings.syncState.forceSyncMode.active).toBe(true);
    expect(typeof mockSettings.syncState.forceSyncMode.lastFailedAt).toBe('number');
  });

  it('阶段 1 拉取远端失败也会写入失败状态', async () => {
    spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockRejectedValue(
      new Error('network down'),
    );
    const uploadSpy = spyOn(
      GistSyncService.prototype,
      'uploadToGistIncremental',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ).mockResolvedValue({} as any);

    const { executeForceSync } = useSyncExecutor();
    const result = await executeForceSync({
      messagePrefix: '',
      isManualRetrieval: true,
      onError: () => {},
      onSuccess: () => {},
    });

    expect(result.success).toBe(false);
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(mockSettings.syncState.forceSyncMode.active).toBe(true);
    expect(typeof mockSettings.syncState.forceSyncMode.lastFailedAt).toBe('number');
  });

  it('无 gistId 时委托给 executeSync 的首次上传并重置 toggle', async () => {
    mockSettings.syncState.gistId = '';
    mockSettings.syncState.forceSyncMode = { active: true, lastFailedAt: Date.now() };

    // executeSync 的首次同步分支：跳过下载（无 gistId 分支）+ uploadToGist 创建 Gist
    // 这里简化 —— executeSync 读取 gistSync 时我们 gistId 为空，会进入首次分支
    spyOn(GistSyncService.prototype, 'uploadToGist').mockResolvedValue({
      success: true,
      gistId: 'new-gist-id',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    // 别的分支防御性 stub（不应被调用）
    spyOn(GistSyncService.prototype, 'downloadFromGistWithManifest').mockResolvedValue({
      skipped: true,
      remoteETag: '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const successes: string[] = [];
    const { executeForceSync } = useSyncExecutor();
    await executeForceSync({
      messagePrefix: '',
      isManualRetrieval: true,
      onError: () => {},
      onSuccess: (_s, d) => successes.push(d),
    });

    // toggle 应被关闭
    expect(mockSettings.syncState.forceSyncMode.active).toBe(false);
    // 成功 toast 应提示"未检测到远程 Gist"
    expect(successes.some((m) => m.includes('未检测到远程 Gist'))).toBe(true);
  });
});

it('强制模式持久化操作身份，失败沿用，旧执行不能关闭后来开启的新操作', async () => {
  const { createPinia, setActivePinia } = await import('pinia');
  setActivePinia(createPinia());
  const store = SettingsStore.useSettingsStore();
  await store.loadSettings();
  await store.updateForceSyncMode({ active: true });
  const first = store.gistSync.forceSyncMode!.operationId;
  expect(first).toBeTruthy();
  await store.updateForceSyncMode({ active: true, lastFailedAt: 1 });
  expect(store.gistSync.forceSyncMode!.operationId).toBe(first);
  await store.updateForceSyncMode({ active: false });
  await store.updateForceSyncMode({ active: true });
  const next = store.gistSync.forceSyncMode!.operationId;
  expect(next).not.toBe(first);
  await store.updateForceSyncMode({ active: false }, first);
  expect(store.gistSync.forceSyncMode!.operationId).toBe(next);
  expect(store.gistSync.forceSyncMode!.active).toBe(true);
});

it('操作身份持久化失败时不启用强制模式', async () => {
  const { expect: check } = await import('vitest');
  const { createPinia, setActivePinia } = await import('pinia');
  const configPersistence = await import('../services/sync-config-persistence');
  setActivePinia(createPinia());
  const store = SettingsStore.useSettingsStore();
  await store.loadSettings();
  const patch = spyOn(configPersistence, 'patchGistSyncConfig').mockRejectedValue(
    new Error('quota'),
  );
  try {
    await check(store.updateForceSyncMode({ active: true })).rejects.toThrow('quota');
    expect(store.forceSyncMode.active).toBe(false);
  } finally {
    patch.mockRestore();
  }
});
