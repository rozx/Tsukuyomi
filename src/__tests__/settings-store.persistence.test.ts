import './setup';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import { EmbeddingQueue } from 'src/services/embedding-queue';

/**
 * 这里用 mock DB 来测试：当 localStorage 被迁移逻辑清空后，
 * settings store 仍然应当从 IndexedDB 读取 taskDefaultModels（避免刷新丢失）。
 *
 * 注意：项目测试体系是 bun:test，不使用 vitest。
 */

type AnyRecord = Record<string, any>;

// 必须在 mock.module 之后再导入（确保 store 使用的是 mock getDB）
const { useSettingsStore } = await import('src/stores/settings');

describe('settings store persistence (taskDefaultModels)', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    EmbeddingQueue.__resetForTesting();
  });

  afterEach(() => {
    EmbeddingQueue.__resetForTesting();
    mock.restore();
  });

  it('当 localStorage 为空但 IndexedDB 已存在 settings 时，loadSettings() 不应丢失 taskDefaultModels', async () => {
    // 模拟迁移后的状态：localStorage 已被清空，但 IndexedDB 已有 settings
    const settingsStore = useSettingsStore();
    await settingsStore.updateSettings({
      taskDefaultModels: {
        translation: 'model-translation-1',
        proofreading: 'model-proofread-1',
      },
    });

    // updateSettings 可能同时写入 localStorage，这里再次清空以模拟"localStorage 为空但 IndexedDB 已有数据"
    localStorage.clear();

    await settingsStore.loadSettings();

    expect(settingsStore.settings.taskDefaultModels?.translation).toBe('model-translation-1');
    expect(settingsStore.settings.taskDefaultModels?.proofreading).toBe('model-proofread-1');
  });

  it('updateSettings() 应写入 IndexedDB，重新创建 store 后仍可读取', async () => {
    const settingsStore = useSettingsStore();
    await settingsStore.loadSettings();

    await settingsStore.updateSettings({
      taskDefaultModels: {
        translation: 'model-translation-2',
      },
    });

    // 模拟“刷新”：新 Pinia + 新 store，但 IndexedDB（mock）仍保留
    setActivePinia(createPinia());
    const settingsStoreReloaded = useSettingsStore();
    await settingsStoreReloaded.loadSettings();

    expect(settingsStoreReloaded.settings.taskDefaultModels?.translation).toBe(
      'model-translation-2',
    );
  });

  it('恢复快照中的共享状态应可切换，供设置页和同步弹窗共同禁用操作按钮', () => {
    const settingsStore = useSettingsStore();

    expect(settingsStore.isRestoringSyncSnapshot).toBe(false);

    settingsStore.setRestoringSyncSnapshot(true);
    expect(settingsStore.isRestoringSyncSnapshot).toBe(true);

    settingsStore.setRestoringSyncSnapshot(false);
    expect(settingsStore.isRestoringSyncSnapshot).toBe(false);
  });

  it('replaceSettingsFromSyncSnapshot() 应忽略快照里的 syncs 字段，避免污染 settings', async () => {
    const settingsStore = useSettingsStore();

    await settingsStore.replaceSettingsFromSyncSnapshot({
      proxyEnabled: false,
      syncs: [
        {
          enabled: true,
          lastSyncTime: 123,
          syncInterval: 0,
          syncType: 'gist',
          syncParams: { gistId: 'remote-gist' },
          secret: 'test-secret',
          apiEndpoint: '',
        },
      ],
    } as AnyRecord);

    expect(settingsStore.settings.proxyEnabled).toBe(false);
    expect((settingsStore.settings as AnyRecord).syncs).toBeUndefined();
  });

  it('importSettings() 更新 enableSemantic 时应联动 EmbeddingQueue', async () => {
    const settingsStore = useSettingsStore();
    const pauseSpy = spyOn(EmbeddingQueue, 'pause').mockImplementation(() => {});

    await settingsStore.importSettings({
      memoryInjection: {
        charBudget: 2000,
        enableSemantic: false,
        minScoreThreshold: 0.3,
        hasSeenIntro: false,
        embeddingModelCached: false,
      },
    });

    expect(settingsStore.settings.memoryInjection?.enableSemantic).toBe(false);
    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cleanupOldDeletionRecords — TTL 边界、helper 行为、bookId 保留
// ─────────────────────────────────────────────────────────────────────────────

describe('cleanupOldDeletionRecords (TTL helper)', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    EmbeddingQueue.__resetForTesting();
  });

  afterEach(() => {
    EmbeddingQueue.__resetForTesting();
    mock.restore();
  });

  it('默认 daysToKeep 派生自 TOMBSTONE_TTL_DAYS = 90 天', async () => {
    const settingsStore = useSettingsStore();
    const now = Date.now();
    await settingsStore.updateGistSync({
      deletedNovelIds: [
        { id: 'recent', deletedAt: now - 10 * DAY_MS }, // 10 天前
        { id: 'just-old', deletedAt: now - 89 * DAY_MS }, // 89 天前
        { id: 'expired', deletedAt: now - 91 * DAY_MS }, // 91 天前
      ],
    });

    await settingsStore.cleanupOldDeletionRecords();

    const ids = settingsStore.gistSync.deletedNovelIds!.map((r) => r.id).sort();
    expect(ids).toEqual(['just-old', 'recent']);
  });

  it('显式 daysToKeep=30 仍可调用（兼容旧调用点）', async () => {
    const settingsStore = useSettingsStore();
    const now = Date.now();
    await settingsStore.updateGistSync({
      deletedNovelIds: [
        { id: 'recent', deletedAt: now - 10 * DAY_MS },
        { id: 'over-30', deletedAt: now - 31 * DAY_MS },
      ],
    });

    await settingsStore.cleanupOldDeletionRecords(30);

    const ids = settingsStore.gistSync.deletedNovelIds!.map((r) => r.id);
    expect(ids).toEqual(['recent']);
  });

  it('5 个删除列表统一处理（novel/model/cover/coverUrl/memory）', async () => {
    const settingsStore = useSettingsStore();
    const now = Date.now();
    await settingsStore.updateGistSync({
      deletedNovelIds: [{ id: 'n-old', deletedAt: now - 100 * DAY_MS }],
      deletedModelIds: [{ id: 'm-old', deletedAt: now - 100 * DAY_MS }],
      deletedCoverIds: [{ id: 'c-old', deletedAt: now - 100 * DAY_MS }],
      deletedCoverUrls: [{ url: 'https://x/y.jpg', deletedAt: now - 100 * DAY_MS }],
      deletedMemoryIds: [{ id: 'mem-old', deletedAt: now - 100 * DAY_MS }],
    });

    await settingsStore.cleanupOldDeletionRecords();

    expect(settingsStore.gistSync.deletedNovelIds).toEqual([]);
    expect(settingsStore.gistSync.deletedModelIds).toEqual([]);
    expect(settingsStore.gistSync.deletedCoverIds).toEqual([]);
    expect(settingsStore.gistSync.deletedCoverUrls).toEqual([]);
    expect(settingsStore.gistSync.deletedMemoryIds).toEqual([]);
  });

  it('memory 删除记录的 bookId 字段在保留时不丢失', async () => {
    const settingsStore = useSettingsStore();
    const now = Date.now();
    await settingsStore.updateGistSync({
      deletedMemoryIds: [
        { id: 'mem-fresh', bookId: 'book-1', deletedAt: now - 5 * DAY_MS },
        { id: 'mem-expired', bookId: 'book-2', deletedAt: now - 100 * DAY_MS },
      ],
    });

    await settingsStore.cleanupOldDeletionRecords();

    expect(settingsStore.gistSync.deletedMemoryIds).toEqual([
      { id: 'mem-fresh', bookId: 'book-1', deletedAt: expect.any(Number) },
    ]);
  });

  it('当无任何记录变化时不写入 store（避免无意义持久化）', async () => {
    const settingsStore = useSettingsStore();
    const now = Date.now();
    await settingsStore.updateGistSync({
      deletedNovelIds: [{ id: 'recent', deletedAt: now - 5 * DAY_MS }],
    });

    const updateSpy = spyOn(settingsStore, 'updateGistSync');
    await settingsStore.cleanupOldDeletionRecords();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('边界对齐：deletedAt 恰好等于 cutoff 时丢弃（与 buildLocalManifest 同口径）', async () => {
    const settingsStore = useSettingsStore();
    const now = Date.now();
    // 注入正好 90 天前的记录；cleanup 用 cutoff = now - 90d，predicate 是 deletedAt > cutoff
    // 因此 deletedAt == cutoff 时不通过保留条件 → 被丢弃。
    await settingsStore.updateGistSync({
      deletedNovelIds: [{ id: 'edge', deletedAt: now - 90 * DAY_MS }],
    });

    await settingsStore.cleanupOldDeletionRecords(90);

    expect(settingsStore.gistSync.deletedNovelIds).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// clearSyncDeletionPropagationState — 文件导入 + 修订恢复共用的清理 helper
// ─────────────────────────────────────────────────────────────────────────────

describe('clearSyncDeletionPropagationState', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    EmbeddingQueue.__resetForTesting();
  });

  afterEach(() => {
    EmbeddingQueue.__resetForTesting();
    mock.restore();
  });

  it('清空主动传播删除的 4 个字段（novel/model/memory + knownRemoteTombstones）', async () => {
    const settingsStore = useSettingsStore();
    await settingsStore.updateGistSync({
      deletedNovelIds: [{ id: 'n1', deletedAt: 100 }],
      deletedModelIds: [{ id: 'm1', deletedAt: 100 }],
      deletedMemoryIds: [{ id: 'mem1', bookId: 'book-x', deletedAt: 100 }],
      knownRemoteTombstones: { 'novel:n1': '2026-04-01T00:00:00.000Z' },
    });

    await settingsStore.clearSyncDeletionPropagationState();

    expect(settingsStore.gistSync.deletedNovelIds).toEqual([]);
    expect(settingsStore.gistSync.deletedModelIds).toEqual([]);
    expect(settingsStore.gistSync.deletedMemoryIds).toEqual([]);
    expect(settingsStore.gistSync.knownRemoteTombstones).toEqual({});
  });

  it('保留 deletedCoverIds / deletedCoverUrls（不主动跨设备传播）', async () => {
    const settingsStore = useSettingsStore();
    await settingsStore.updateGistSync({
      deletedCoverIds: [{ id: 'c1', deletedAt: 100 }],
      deletedCoverUrls: [{ url: 'https://x/y.jpg', deletedAt: 100 }],
    });

    await settingsStore.clearSyncDeletionPropagationState();

    expect(settingsStore.gistSync.deletedCoverIds).toEqual([{ id: 'c1', deletedAt: 100 }]);
    expect(settingsStore.gistSync.deletedCoverUrls).toEqual([
      { url: 'https://x/y.jpg', deletedAt: 100 },
    ]);
  });

  it('保留 secret / syncParams（不破坏 Gist 凭据）', async () => {
    const settingsStore = useSettingsStore();
    await settingsStore.updateGistSync({
      secret: 'token-abc',
      syncParams: { gistId: 'gist-123', username: 'rozx' },
      knownRemoteTombstones: { 'novel:foo': '2026-04-01T00:00:00.000Z' },
    });

    await settingsStore.clearSyncDeletionPropagationState();

    expect(settingsStore.gistSync.secret).toBe('token-abc');
    expect(settingsStore.gistSync.syncParams).toMatchObject({
      gistId: 'gist-123',
      username: 'rozx',
    });
    expect(settingsStore.gistSync.knownRemoteTombstones).toEqual({});
  });

  it('保留 knownRemoteHashes / knownRemoteEntries / lastRemoteETag（下次 diff 仍可用）', async () => {
    const settingsStore = useSettingsStore();
    await settingsStore.updateGistSync({
      knownRemoteHashes: { settings: 'h1' },
      knownRemoteEntries: { settings: { hash: 'h1' } },
      lastRemoteETag: 'etag-xyz',
    });

    await settingsStore.clearSyncDeletionPropagationState();

    expect(settingsStore.gistSync.knownRemoteHashes).toEqual({ settings: 'h1' });
    expect(settingsStore.gistSync.knownRemoteEntries).toEqual({ settings: { hash: 'h1' } });
    expect(settingsStore.gistSync.lastRemoteETag).toBe('etag-xyz');
  });

  it('Gist 配置不存在时是 no-op，不抛错', async () => {
    const settingsStore = useSettingsStore();
    settingsStore.syncs = []; // 清空所有 sync 配置

    await settingsStore.clearSyncDeletionPropagationState();
    expect(settingsStore.syncs).toEqual([]);
  });
});
