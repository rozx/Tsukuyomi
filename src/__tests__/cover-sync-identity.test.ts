import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { getDB } from '../utils/indexed-db';
import { useCoverHistoryStore } from '../stores/cover-history';
import { useSettingsStore } from '../stores/settings';
import { GlobalConfig } from '../services/global-config-cache';
import { SyncDataService } from '../services/sync-data-service';
import type { SyncConfig } from '../models/sync';
import { SyncType } from '../models/sync';

const LAST_SYNC = Date.parse('2026-01-01T00:00:00.000Z');
const URL_A = 'https://img.example/a.png';
const URL_B = 'https://img.example/b.png';

let gistSync: SyncConfig;

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
    deletedCoverUrls: [],
    deletedMemoryIds: [],
    ...overrides,
  };
}

/** 读出库与 store 中的封面身份（id + addedAt 毫秒），按 id 排序便于比较 */
async function snapshotIdentities() {
  const toIdentity = (c: { id: string; url: string; addedAt: Date }) => ({
    id: c.id,
    url: c.url,
    addedAt: c.addedAt.getTime(),
  });
  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  const db = await getDB();
  return {
    db: (await db.getAll('cover-history')).map(toIdentity).sort(byId),
    store: useCoverHistoryStore().covers.map(toIdentity).sort(byId),
  };
}

async function seedLocal(items: Array<{ id: string; url: string; addedAt: Date }>) {
  const db = await getDB();
  for (const item of items) await db.put('cover-history', item);
  await useCoverHistoryStore().loadCoverHistory();
}

beforeEach(async () => {
  setActivePinia(createPinia());
  const settings = useSettingsStore();
  await settings.loadSettings();
  gistSync = makeConfig();
  vi.spyOn(GlobalConfig, 'ensureInitialized').mockResolvedValue(undefined);
  vi.spyOn(GlobalConfig, 'getGistSyncSnapshot').mockImplementation(() => gistSync);
  await (await getDB()).clear('cover-history');
});

afterEach(() => vi.restoreAllMocks());

describe('增量同步 cover-history 条目保留封面身份', () => {
  it('同一远端封面历史应用两次，id 与 addedAt 都不变', async () => {
    await useCoverHistoryStore().loadCoverHistory();
    const remote = [
      { id: 'r-a', url: URL_A, addedAt: '2025-06-01T00:00:00.000Z' },
      { id: 'r-b', url: URL_B, addedAt: '2025-07-01T00:00:00.000Z' },
    ];
    const entry = { 'cover-history': { kind: 'cover-history', value: remote } };

    await SyncDataService.applyPartialRemoteData(entry);
    const first = await snapshotIdentities();
    await SyncDataService.applyPartialRemoteData(entry);
    const second = await snapshotIdentities();

    const expected = [
      { id: 'r-a', url: URL_A, addedAt: Date.parse('2025-06-01T00:00:00.000Z') },
      { id: 'r-b', url: URL_B, addedAt: Date.parse('2025-07-01T00:00:00.000Z') },
    ];
    expect(first).toEqual({ db: expected, store: expected });
    expect(second).toEqual(first);
  });

  it('本地同 URL 不同 id 的旧记录被远端身份取代，且不会被当作远端删除', async () => {
    await seedLocal([{ id: 'legacy-local', url: URL_A, addedAt: new Date(LAST_SYNC - 1000) }]);
    const remote = [{ id: 'r-a', url: URL_A, addedAt: '2025-06-01T00:00:00.000Z' }];

    await SyncDataService.applyPartialRemoteData({
      'cover-history': { kind: 'cover-history', value: remote },
    });

    const { db, store } = await snapshotIdentities();
    expect(db.map((c) => c.id)).toEqual(['r-a']);
    expect(store.map((c) => c.id)).toEqual(['r-a']);
    expect(gistSync.deletedCoverUrls ?? []).toEqual([]);
    expect(useSettingsStore().gistSync.deletedCoverUrls ?? []).toEqual([]);
  });

  it('缺少 id 的旧远端记录每次同步得到同一个 id', async () => {
    await useCoverHistoryStore().loadCoverHistory();
    const entry = {
      'cover-history': {
        kind: 'cover-history',
        value: [{ url: URL_A, addedAt: '2025-06-01T00:00:00.000Z' }],
      },
    };

    await SyncDataService.applyPartialRemoteData(entry);
    const first = await snapshotIdentities();
    await SyncDataService.applyPartialRemoteData(entry);
    const second = await snapshotIdentities();

    expect(first.db).toHaveLength(1);
    expect(first.db[0]!.id).toBeTruthy();
    expect(second).toEqual(first);
  });

  it('本设备按 URL 记录的删除（id 不同）不会被远端增量复活', async () => {
    await useCoverHistoryStore().loadCoverHistory();
    gistSync = makeConfig({
      deletedCoverIds: [{ id: 'local-a', deletedAt: LAST_SYNC + 10 }],
      deletedCoverUrls: [{ url: URL_A, deletedAt: LAST_SYNC + 10 }],
    });

    await SyncDataService.applyPartialRemoteData({
      'cover-history': {
        kind: 'cover-history',
        value: [{ id: 'remote-a', url: URL_A, addedAt: '2025-06-01T00:00:00.000Z' }],
      },
    });

    const { db, store } = await snapshotIdentities();
    expect(db).toEqual([]);
    expect(store).toEqual([]);
  });

  it('远端已删除的封面在本设备下一次同步时被传播删除', async () => {
    const syncedAt = new Date(LAST_SYNC - 1000);
    await seedLocal([
      { id: 'r-a', url: URL_A, addedAt: syncedAt },
      { id: 'r-b', url: URL_B, addedAt: syncedAt },
    ]);

    await SyncDataService.applyPartialRemoteData({
      'cover-history': {
        kind: 'cover-history',
        value: [{ id: 'r-b', url: URL_B, addedAt: syncedAt.toISOString() }],
      },
    });

    const { db, store } = await snapshotIdentities();
    expect(db.map((c) => c.id)).toEqual(['r-b']);
    expect(store.map((c) => c.id)).toEqual(['r-b']);
    expect(store[0]!.addedAt).toBe(syncedAt.getTime());
  });
});

describe('下载合并路径保留封面身份', () => {
  it('同一远端封面历史合并两次，id 与 addedAt 都不变', async () => {
    await seedLocal([{ id: 'local-b', url: URL_B, addedAt: new Date(LAST_SYNC + 500) }]);
    const remoteData = {
      coverHistory: [{ id: 'r-a', url: URL_A, addedAt: new Date(LAST_SYNC + 100).toISOString() }],
    };

    await SyncDataService.applyDownloadedData(remoteData, LAST_SYNC);
    const first = await snapshotIdentities();
    await SyncDataService.applyDownloadedData(remoteData, LAST_SYNC);
    const second = await snapshotIdentities();

    const expected = [
      { id: 'local-b', url: URL_B, addedAt: LAST_SYNC + 500 },
      { id: 'r-a', url: URL_A, addedAt: LAST_SYNC + 100 },
    ];
    expect(first).toEqual({ db: expected, store: expected });
    expect(second).toEqual(first);
  });

  it('本设备已删除（按 URL 记录）的封面不会被合并复活', async () => {
    await useCoverHistoryStore().loadCoverHistory();
    gistSync = makeConfig({
      deletedCoverUrls: [{ url: URL_A, deletedAt: LAST_SYNC + 10 }],
    });

    await SyncDataService.applyDownloadedData(
      {
        coverHistory: [
          { id: 'remote-a', url: URL_A, addedAt: new Date(LAST_SYNC - 100).toISOString() },
        ],
      },
      LAST_SYNC,
    );

    expect(await snapshotIdentities()).toEqual({ db: [], store: [] });
  });
});

describe('远端快照覆盖路径保留封面身份', () => {
  it('覆盖后写入的是远端 id 与 addedAt，同 URL 只留最新一条', async () => {
    await seedLocal([{ id: 'local-old', url: URL_B, addedAt: new Date(1) }]);

    await SyncDataService.overwriteFromSnapshot({
      coverHistory: [
        { id: 'r-a-old', url: URL_A, addedAt: '2025-01-01T00:00:00.000Z' },
        { id: 'r-a', url: URL_A, addedAt: '2025-06-01T00:00:00.000Z' },
        { id: 'r-b', url: URL_B, addedAt: '2025-07-01T00:00:00.000Z' },
      ],
    });

    const expected = [
      { id: 'r-a', url: URL_A, addedAt: Date.parse('2025-06-01T00:00:00.000Z') },
      { id: 'r-b', url: URL_B, addedAt: Date.parse('2025-07-01T00:00:00.000Z') },
    ];
    expect(await snapshotIdentities()).toEqual({ db: expected, store: expected });
  });
});

describe('损坏时间戳不影响按 URL 去重', () => {
  it('快照里同 URL 较早一条 addedAt 损坏时，仍保留后面时间有效的记录', async () => {
    await useCoverHistoryStore().loadCoverHistory();

    await SyncDataService.overwriteFromSnapshot({
      coverHistory: [
        { id: 'broken', url: URL_A, addedAt: 'not-a-date' },
        { id: 'valid', url: URL_A, addedAt: '2025-06-01T00:00:00.000Z' },
      ],
    });

    const expected = [{ id: 'valid', url: URL_A, addedAt: Date.parse('2025-06-01T00:00:00.000Z') }];
    expect(await snapshotIdentities()).toEqual({ db: expected, store: expected });
  });
});
