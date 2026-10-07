import './setup';
import { afterEach, describe, expect, it } from 'bun:test';
import { vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSettingsStore } from '../stores/settings';
import { SyncDataService } from '../services/sync-data-service';
import { parseAppSettings } from '../services/settings/settings-parsers';

afterEach(() => vi.useRealTimers());

describe('同步任务默认模型', () => {
  it('本机只切换过设置标签页时，仍应接收远端的任务模型选择并持久化', async () => {
    const settings = useSettingsStore();
    await settings.loadSettings();
    await settings.setLastOpenedSettingsTab(1);

    const failed = await SyncDataService.applyPartialRemoteData({
      settings: {
        kind: 'settings',
        value: {
          lastEdited: '2026-01-01T00:00:00.000Z',
          taskDefaultModels: {
            translation: 'translation-model',
            proofreading: 'proofreading-model',
          },
        },
      },
    });

    expect(failed).toEqual([]);
    expect(settings.getTaskDefaultModelId('translation')).toBe('translation-model');
    expect(settings.getTaskDefaultModelId('proofreading')).toBe('proofreading-model');
    setActivePinia(createPinia());
    const reopened = useSettingsStore();
    await reopened.loadSettings();
    expect(reopened.settings.taskDefaultModels).toEqual(settings.settings.taskDefaultModels);
  });

  it('已有选择按任务修改时间合并，无关设置和其他任务的修改不能覆盖远端选择', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1000);
    const settings = useSettingsStore();
    await settings.loadSettings();
    await settings.setTaskDefaultModelId('translation', 'old-model');
    vi.setSystemTime(3000);
    await settings.setTaskDefaultModelId('proofreading', 'local-proofreading');
    await settings.setLastOpenedSettingsTab(1);

    await SyncDataService.applyPartialRemoteData({
      settings: {
        kind: 'settings',
        value: {
          lastEdited: new Date(2000),
          taskDefaultModels: {
            translation: 'remote-translation',
            proofreading: 'old-proofreading',
          },
          taskDefaultModelsUpdatedAt: { translation: 2000, proofreading: 500 },
        },
      },
    });
    expect(settings.settings.taskDefaultModels).toEqual({
      translation: 'remote-translation',
      proofreading: 'local-proofreading',
    });
    expect(settings.settings.lastEdited.getTime()).toBe(3000);
  });

  it('并发保存不同任务时两项选择均持久化', async () => {
    const settings = useSettingsStore();
    await settings.loadSettings();
    await settings.setTaskDefaultModelId('translation', 'old-model');
    await Promise.all([
      settings.setTaskDefaultModelId('translation', 'new-translation'),
      settings.setTaskDefaultModelId('proofreading', 'new-proofreading'),
    ]);
    setActivePinia(createPinia());
    const reopened = useSettingsStore();
    await reopened.loadSettings();
    expect(reopened.settings.taskDefaultModels).toEqual({
      translation: 'new-translation',
      proofreading: 'new-proofreading',
    });
  });

  it('旧配置的任务时间在后续修改其他设置和导出解析时保持不变', async () => {
    const settings = useSettingsStore();
    await settings.loadSettings();
    await settings.importSettings({
      lastEdited: new Date(1000),
      taskDefaultModels: { translation: 'old-model' },
    });
    await settings.updateSettings({ lastEdited: new Date(3000), scraperConcurrencyLimit: 4 });
    const parsed = parseAppSettings(settings.getAllSettings());
    expect(parsed?.taskDefaultModelsUpdatedAt).toEqual({ translation: 1000 });
    setActivePinia(createPinia());
    const reopened = useSettingsStore();
    await reopened.loadSettings();
    expect(reopened.settings.taskDefaultModelsUpdatedAt).toEqual({ translation: 1000 });
  });

  const cases = [
    {
      name: '空输入不生成任务选择',
      local: {},
      remote: {},
      expected: {},
    },
    {
      name: '未配置的一侧不覆盖显式选择',
      local: { taskDefaultModels: {}, lastEdited: new Date(3000) },
      remote: { taskDefaultModels: { translation: 'remote' }, lastEdited: new Date(1000) },
      expected: { translation: 'remote' },
    },
    {
      name: '较新的取消选择 null 应传播',
      local: { taskDefaultModels: { translation: 'local' }, lastEdited: new Date(1000) },
      remote: { taskDefaultModels: { translation: null }, lastEdited: new Date(2000) },
      expected: { translation: null },
    },
    {
      name: '无关设置较新也不能复活已取消的选择',
      local: {
        taskDefaultModels: { translation: null },
        taskDefaultModelsUpdatedAt: { translation: 2000 },
        lastEdited: new Date(2000),
      },
      remote: {
        taskDefaultModels: { translation: 'remote' },
        taskDefaultModelsUpdatedAt: { translation: 1000 },
        lastEdited: new Date(3000),
      },
      expected: { translation: null },
    },
    {
      name: '相等时间的冲突双向合并结果一致',
      local: { taskDefaultModels: { translation: 'a' }, lastEdited: new Date(1000) },
      remote: { taskDefaultModels: { translation: 'b' }, lastEdited: new Date(1000) },
      expected: { translation: 'b' },
    },
    {
      name: '损坏的选择和时间不能抹掉有效值',
      local: {
        taskDefaultModels: { translation: 'local', proofreading: 'local-proofreading' },
        lastEdited: new Date(1000),
      },
      remote: {
        taskDefaultModels: { translation: '', proofreading: 123 },
        taskDefaultModelsUpdatedAt: { translation: Infinity },
        lastEdited: 'invalid',
      },
      expected: { translation: 'local', proofreading: 'local-proofreading' },
    },
    {
      name: '未来任务字段随旧配置合并保留',
      local: { taskDefaultModels: { translation: 'local' }, lastEdited: new Date(1000) },
      remote: { taskDefaultModels: { futureTask: 'future' }, lastEdited: new Date(2000) },
      expected: { translation: 'local', futureTask: 'future' },
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
      expect((await upload(local, remote)).appSettings.taskDefaultModels ?? {}).toEqual(expected);
      expect((await upload(remote, local)).appSettings.taskDefaultModels ?? {}).toEqual(expected);
      for (const incremental of [true, false]) {
        setActivePinia(createPinia());
        const settings = useSettingsStore();
        await settings.loadSettings();
        await settings.replaceSettingsFromSyncSnapshot(local as never);
        if (incremental) {
          expect(
            await SyncDataService.applyPartialRemoteData({
              settings: { kind: 'settings', value: remote },
            }),
          ).toEqual([]);
        } else {
          await SyncDataService.applyDownloadedData({ appSettings: remote });
        }
        expect(settings.settings.taskDefaultModels).toEqual(expected);
      }
    });
  }
});
