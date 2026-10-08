import './setup';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { effectScope, reactive } from 'vue';
import { useGistCleanup } from '../composables/useGistCleanup';
import { useSettingsStore } from '../stores/settings';
import { SyncType, type SyncConfig } from '../models/sync';

let scope = effectScope();
beforeEach(() => {
  scope = effectScope();
});
afterEach(() => {
  scope.stop();
  vi.restoreAllMocks();
});

function config(): SyncConfig {
  return reactive({
    enabled: true,
    syncType: SyncType.Gist,
    syncParams: { username: 'tester', gistId: 'test-gist' },
    secret: 'test-token',
    apiEndpoint: '',
    lastSyncTime: 0,
    syncInterval: 0,
  });
}

function response() {
  return new Response(
    JSON.stringify({
      history: [{ version: 'a'.repeat(40) }],
      files: {
        'manifest.json': { content: JSON.stringify({ schemaVersion: 6, entries: {} }) },
        'novel-old.json': { size: 100 },
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

it('扫描期间持有同步锁，只生成预览；切换 Gist 后预览失效', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response());
  const settings = useSettingsStore();
  const current = config();
  const cleanup = scope.run(() => useGistCleanup(() => current))!;
  const pending = cleanup.scan();
  expect(settings.isSyncing).toBe(true);
  await pending;
  expect(settings.isSyncing).toBe(false);
  expect(cleanup.plan.value?.files).toEqual([{ filename: 'novel-old.json', size: 100 }]);
  expect(fetch.mock.calls.every(([, init]) => init?.method !== 'PATCH')).toBe(true);
  current.syncParams.gistId = 'other-gist';
  expect(cleanup.plan.value).toBeNull();
});

it('同步或恢复正在进行时不扫描，也不释放别人的锁', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  const settings = useSettingsStore();
  const current = config();
  const cleanup = scope.run(() => useGistCleanup(() => current))!;
  settings.setSyncing(true);
  await cleanup.scan();
  expect(fetch).not.toHaveBeenCalled();
  expect(settings.isSyncing).toBe(true);
  settings.setSyncing(false);
  settings.isRestoringSyncSnapshot = true;
  await cleanup.scan();
  expect(fetch).not.toHaveBeenCalled();
});

it('网络失败后释放锁并显示错误，无法重复提交旧预览', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response());
  const current = config();
  const cleanup = scope.run(() => useGistCleanup(() => current))!;
  await cleanup.scan();
  fetch.mockRejectedValue(new Error('Network unavailable'));
  expect(await cleanup.cleanup()).toBe(false);
  expect(cleanup.plan.value).toBeNull();
  expect(cleanup.error.value).toContain('Network unavailable');
  expect(useSettingsStore().isSyncing).toBe(false);
});

it('设备变体重挂载时保留扫描结果，打开其它 Gist 时丢弃旧预览', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(response());
  const current = config();
  const first = scope.run(() => useGistCleanup(() => current))!;
  await first.scan();
  const preview = first.plan.value;
  scope.stop();
  scope = effectScope();
  const second = scope.run(() => useGistCleanup(() => current))!;
  expect(second.plan.value).toEqual(preview);
  scope.stop();
  scope = effectScope();
  current.syncParams.gistId = 'another-gist';
  const third = scope.run(() => useGistCleanup(() => current))!;
  expect(third.plan.value).toBeNull();
});

it('扫描中切换变体只保留一个请求，并在新界面交付扫描结果', async () => {
  let resolve!: (response: Response) => void;
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const current = config();
  const first = scope.run(() => useGistCleanup(() => current))!;
  const pending = first.scan();
  scope.stop();
  scope = effectScope();
  const second = scope.run(() => useGistCleanup(() => current))!;
  expect(second.phase.value).toBe('scan');
  await second.scan();
  expect(fetch).toHaveBeenCalledOnce();
  resolve(response());
  await pending;
  expect(second.plan.value?.files).toHaveLength(1);
  expect(second.phase.value).toBeNull();
  expect(useSettingsStore().isSyncing).toBe(false);
});
