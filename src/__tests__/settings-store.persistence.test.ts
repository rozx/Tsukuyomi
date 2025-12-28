import './setup';
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';

/**
 * 这里用 mock DB 来测试：当 localStorage 被迁移逻辑清空后，
 * settings store 仍然应当从 IndexedDB 读取 taskDefaultModels（避免刷新丢失）。
 *
 * 注意：项目测试体系是 bun:test，不使用 vitest。
 */

type AnyRecord = Record<string, any>;

const settingsTable = new Map<string, AnyRecord>();
const syncConfigsTable = new Map<string, AnyRecord>();

const mockDb = {
  get: mock((storeName: string, key: string) => {
    if (storeName === 'settings') return Promise.resolve(settingsTable.get(key));
    if (storeName === 'sync-configs') return Promise.resolve(syncConfigsTable.get(key));
    return Promise.resolve(undefined);
  }),
  put: mock((storeName: string, value: AnyRecord) => {
    if (storeName === 'settings') {
      settingsTable.set(String(value.key), value);
      return Promise.resolve(undefined);
    }
    if (storeName === 'sync-configs') {
      syncConfigsTable.set(String(value.id), value);
      return Promise.resolve(undefined);
    }
    return Promise.resolve(undefined);
  }),
  getAll: mock((storeName: string) => {
    if (storeName === 'sync-configs') return Promise.resolve(Array.from(syncConfigsTable.values()));
    return Promise.resolve([]);
  }),
  clear: mock((storeName: string) => {
    if (storeName === 'settings') settingsTable.clear();
    if (storeName === 'sync-configs') syncConfigsTable.clear();
    return Promise.resolve(undefined);
  }),
  transaction: mock((_storeName: string, _mode: string) => {
    return {
      objectStore: (_name: string) => ({
        clear: mock(() => {
          syncConfigsTable.clear();
          return Promise.resolve(undefined);
        }),
        put: mock((value: AnyRecord) => {
          syncConfigsTable.set(String(value.id), value);
          return Promise.resolve(undefined);
        }),
      }),
      done: Promise.resolve(),
    };
  }),
};

await mock.module('src/utils/indexed-db', () => ({
  getDB: () => Promise.resolve(mockDb),
}));

// 必须在 mock.module 之后再导入（确保 store 使用的是 mock getDB）
const { useSettingsStore } = await import('src/stores/settings');

describe('settings store persistence (taskDefaultModels)', () => {
  beforeEach(() => {
    localStorage.clear();
    settingsTable.clear();
    syncConfigsTable.clear();
    setActivePinia(createPinia());
  });

  it('当 localStorage 为空但 IndexedDB 已存在 settings 时，loadSettings() 不应丢失 taskDefaultModels', async () => {
    // 模拟迁移后的状态：localStorage 已被清空，但 IndexedDB 已有 settings
    settingsTable.set('app', {
      key: 'app',
      lastEdited: new Date(0).toISOString(),
      scraperConcurrencyLimit: 3,
      taskDefaultModels: {
        translation: 'model-translation-1',
        proofreading: 'model-proofread-1',
      },
    });

    const settingsStore = useSettingsStore();
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

    expect(settingsStoreReloaded.settings.taskDefaultModels?.translation).toBe('model-translation-2');
  });
});


