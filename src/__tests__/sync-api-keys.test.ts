import './setup';
import { afterEach, describe, expect, it } from 'bun:test';
import { vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSettingsStore } from '../stores/settings';
import { SyncDataService } from '../services/sync-data-service';
import { parseAppSettings } from '../services/settings/settings-parsers';
import { stripAppSettingsLocalFields } from '../utils/sync-strip';

afterEach(() => vi.useRealTimers());

describe('同步搜索与抓取 API Key', () => {
  it('本机只切换过设置标签页时，仍应接收远端 Key 并持久化', async () => {
    const settings = useSettingsStore();
    await settings.loadSettings();
    await settings.setLastOpenedSettingsTab(1);

    expect(
      await SyncDataService.applyPartialRemoteData({
        settings: {
          kind: 'settings',
          value: {
            lastEdited: '2026-01-01T00:00:00.000Z',
            tavilyApiKey: 'test-tavily-key',
            firecrawlApiKey: 'test-firecrawl-key',
          },
        },
      }),
    ).toEqual([]);
    expect(settings.tavilyApiKey).toBe('test-tavily-key');
    expect(settings.firecrawlApiKey).toBe('test-firecrawl-key');

    setActivePinia(createPinia());
    const reopened = useSettingsStore();
    await reopened.loadSettings();
    expect(reopened.tavilyApiKey).toBe('test-tavily-key');
    expect(reopened.firecrawlApiKey).toBe('test-firecrawl-key');
  });

  it('只改变远端整份设置时间时，新版本可接收 Key，导出解析也保留 Key', async () => {
    const settings = useSettingsStore();
    await settings.loadSettings();
    await settings.updateSettings({ lastEdited: new Date(3000), lastOpenedSettingsTab: 1 });
    await SyncDataService.applyPartialRemoteData({
      settings: {
        kind: 'settings',
        value: {
          lastEdited: new Date(4000),
          tavilyApiKey: 'test-tavily-key',
          firecrawlApiKey: 'test-firecrawl-key',
        },
      },
    });
    const exported = parseAppSettings(settings.getAllSettings());
    expect(exported?.tavilyApiKey).toBe('test-tavily-key');
    expect(exported?.firecrawlApiKey).toBe('test-firecrawl-key');
  });

  it('旧配置的 Key 时间在无关修改、导出解析和重新加载后保持不变', async () => {
    const settings = useSettingsStore();
    await settings.loadSettings();
    await settings.importSettings({ lastEdited: new Date(1000), tavilyApiKey: 'old-key' });
    await settings.updateSettings({ lastEdited: new Date(3000), scraperConcurrencyLimit: 4 });
    expect(parseAppSettings(settings.getAllSettings())?.apiKeysUpdatedAt).toEqual({
      tavilyApiKey: 1000,
    });
    setActivePinia(createPinia());
    const reopened = useSettingsStore();
    await reopened.loadSettings();
    expect(reopened.settings.apiKeysUpdatedAt).toEqual({ tavilyApiKey: 1000 });
  });

  it('同一时刻先清空 Firecrawl 再并发保存其他字段，两项变更均持久化且 Key 时间递增', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1000);
    const settings = useSettingsStore();
    await settings.loadSettings();
    await settings.setFirecrawlApiKey('old-key');
    await Promise.all([
      settings.setFirecrawlApiKey(undefined),
      settings.updateSettings({ tavilyApiKey: 'new-key' }),
    ]);
    setActivePinia(createPinia());
    const reopened = useSettingsStore();
    await reopened.loadSettings();
    expect(reopened.firecrawlApiKey).toBeUndefined();
    expect(reopened.tavilyApiKey).toBe('new-key');
    expect(reopened.settings.apiKeysUpdatedAt).toEqual({
      tavilyApiKey: 1000,
      firecrawlApiKey: 1001,
    });
  });

  it('相同 Key 的再次保存不推进字段时间', async () => {
    const settings = useSettingsStore();
    await settings.loadSettings();
    await settings.updateSettings({ lastEdited: new Date(1000), tavilyApiKey: 'key' });
    await settings.updateSettings({ lastEdited: new Date(3000), tavilyApiKey: 'key' });
    expect(settings.settings.apiKeysUpdatedAt).toEqual({ tavilyApiKey: 1000 });
  });

  it('未配置设备主动保存空 Key 时也记录清空意图', async () => {
    const settings = useSettingsStore();
    await settings.loadSettings();
    await settings.updateSettings({ lastEdited: new Date(1000), tavilyApiKey: undefined });
    expect(settings.settings.apiKeysUpdatedAt).toEqual({ tavilyApiKey: 1000 });
  });

  const cases = [
    { name: '空输入', local: {}, remote: {}, expected: [undefined, undefined] },
    {
      name: '未配置设备的无关修改不覆盖另一设备的 Key',
      local: { lastEdited: new Date(3000) },
      remote: { lastEdited: new Date(1000), tavilyApiKey: 'remote' },
      expected: ['remote', undefined],
    },
    {
      name: '两端各保存一种 Key 时均保留',
      local: { lastEdited: new Date(3000), tavilyApiKey: 'local' },
      remote: { lastEdited: new Date(1000), firecrawlApiKey: 'remote' },
      expected: ['local', 'remote'],
    },
    {
      name: '两种 Key 独立按字段时间合并',
      local: {
        lastEdited: new Date(3000),
        tavilyApiKey: 'old',
        firecrawlApiKey: 'local',
        apiKeysUpdatedAt: { tavilyApiKey: 1000, firecrawlApiKey: 3000 },
      },
      remote: {
        lastEdited: new Date(2000),
        tavilyApiKey: 'remote',
        firecrawlApiKey: 'old',
        apiKeysUpdatedAt: { tavilyApiKey: 2000, firecrawlApiKey: 500 },
      },
      expected: ['remote', 'local'],
    },
    {
      name: '清空记录经 JSON 传输后仍能删除远端旧 Key',
      local: { lastEdited: new Date(3000), tavilyApiKey: 'old', firecrawlApiKey: 'old' },
      remote: {
        lastEdited: new Date(4000),
        apiKeysUpdatedAt: { tavilyApiKey: 4000, firecrawlApiKey: 4000 },
      },
      expected: [undefined, undefined],
    },
    {
      name: '无关设置的较新时间不能复活已清空的 Key',
      local: { lastEdited: new Date(2000), apiKeysUpdatedAt: { tavilyApiKey: 2000 } },
      remote: {
        lastEdited: new Date(3000),
        tavilyApiKey: 'old',
        apiKeysUpdatedAt: { tavilyApiKey: 1000 },
      },
      expected: [undefined, undefined],
    },
    {
      name: '旧版本的空字符串表示清空',
      local: { lastEdited: new Date(1000), tavilyApiKey: 'old' },
      remote: { lastEdited: new Date(2000), tavilyApiKey: '' },
      expected: [undefined, undefined],
    },
    {
      name: '相等字段时间的清空优先',
      local: { lastEdited: new Date(1000), tavilyApiKey: 'old' },
      remote: { lastEdited: new Date(1000), apiKeysUpdatedAt: { tavilyApiKey: 1000 } },
      expected: [undefined, undefined],
    },
    {
      name: '相等时间的 Key 冲突双向收敛',
      local: { lastEdited: new Date(1000), tavilyApiKey: 'a' },
      remote: { lastEdited: new Date(1000), tavilyApiKey: 'b' },
      expected: ['b', undefined],
    },
    {
      name: '损坏的 Key 和时间不抹掉有效配置',
      local: { lastEdited: new Date(1000), tavilyApiKey: 'local', firecrawlApiKey: 'local' },
      remote: {
        lastEdited: new Date(3000),
        tavilyApiKey: 123,
        firecrawlApiKey: null,
        apiKeysUpdatedAt: { tavilyApiKey: 3000, firecrawlApiKey: 3000 },
      },
      expected: ['local', 'local'],
    },
    {
      name: '缺失 Key 的损坏时间不成为删除记录',
      local: { lastEdited: new Date(1000), tavilyApiKey: 'local', firecrawlApiKey: 'local' },
      remote: {
        lastEdited: new Date(3000),
        apiKeysUpdatedAt: { tavilyApiKey: -1, firecrawlApiKey: 'broken' },
      },
      expected: ['local', 'local'],
    },
  ];

  for (const { name, local, remote, expected } of cases) {
    it(`${name}：上传及两种下载路径一致`, async () => {
      const upload = async (a: unknown, b: unknown) =>
        SyncDataService.mergeDataForUpload(
          { novels: [], aiModels: [], coverHistory: [], memories: [], appSettings: a },
          { appSettings: b },
          0,
        );
      for (const [a, b] of [
        [local, remote],
        [remote, local],
      ]) {
        const merged = (await upload(a, b)).appSettings;
        expect([merged.tavilyApiKey, merged.firecrawlApiKey]).toEqual(expected);
      }
      for (const incremental of [true, false]) {
        setActivePinia(createPinia());
        const settings = useSettingsStore();
        await settings.loadSettings();
        await settings.replaceSettingsFromSyncSnapshot(local as never);
        const transferred = JSON.parse(JSON.stringify(remote)) as Record<string, unknown>;
        if (incremental) {
          expect(
            await SyncDataService.applyPartialRemoteData({
              settings: { kind: 'settings', value: transferred },
            }),
          ).toEqual([]);
        } else {
          await SyncDataService.applyDownloadedData({ appSettings: transferred });
        }
        expect([settings.tavilyApiKey, settings.firecrawlApiKey]).toEqual(expected);
        setActivePinia(createPinia());
        const reopened = useSettingsStore();
        await reopened.loadSettings();
        expect([reopened.tavilyApiKey, reopened.firecrawlApiKey]).toEqual(expected);
      }
    });
  }

  it('清空记录经过导出解析和同步字段剥离后仍保留，不携带 Gist 凭据', async () => {
    const settings = useSettingsStore();
    await settings.loadSettings();
    await settings.setFirecrawlApiKey('old');
    await settings.setFirecrawlApiKey(undefined);
    const parsed = parseAppSettings(JSON.parse(JSON.stringify(settings.getAllSettings())));
    const payload = JSON.parse(JSON.stringify(stripAppSettingsLocalFields(parsed!))) as Record<
      string,
      unknown
    >;
    expect(payload.firecrawlApiKey).toBeUndefined();
    expect(payload.apiKeysUpdatedAt).toEqual(settings.settings.apiKeysUpdatedAt);
    expect(payload.apiKeysUpdatedAt).toHaveProperty('firecrawlApiKey');
    expect(payload).not.toHaveProperty('syncs');
  });

  it('手动恢复设置快照仍使用快照中的 Key 和清空状态', async () => {
    const settings = useSettingsStore();
    await settings.loadSettings();
    await settings.setFirecrawlApiKey('local');
    await settings.updateSettings({ tavilyApiKey: 'local' });
    await settings.replaceSettingsFromSyncSnapshot({
      lastEdited: new Date(1000),
      tavilyApiKey: 'snapshot',
    });
    expect(settings.tavilyApiKey).toBe('snapshot');
    expect(settings.firecrawlApiKey).toBeUndefined();
    expect(settings.settings.apiKeysUpdatedAt).toEqual({ tavilyApiKey: 1000 });
  });
});
