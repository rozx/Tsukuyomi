import './setup';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import { useSettingsStore } from '../stores/settings';
import { parseAppSettings } from '../services/settings/settings-parsers';
import { SyncDataService } from '../services/sync-data-service';
import * as database from '../utils/indexed-db';

describe('界面语言偏好持久化', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });
  afterEach(() => {
    mock.restore();
  });

  it('只持久化用户选择，重启后仍保留，备份解析不会丢失偏好', async () => {
    const settings = useSettingsStore();
    await settings.loadSettings();
    expect(settings.settings.uiLocale).toBeUndefined();
    const initialTime = settings.settings.lastEdited.getTime();
    await settings.setUiLocale('zh-TW');
    expect(settings.settings.lastEdited.getTime()).toBeGreaterThan(initialTime);
    expect(parseAppSettings(settings.getAllSettings())?.uiLocale).toBe('zh-TW');
    setActivePinia(createPinia());
    const reopened = useSettingsStore();
    await reopened.loadSettings();
    expect(reopened.settings.uiLocale).toBe('zh-TW');
  });

  it('缺省语言不会覆盖远端显式偏好，即使本机其他设置较新；上传与下载相同', async () => {
    const settings = useSettingsStore();
    await settings.loadSettings();
    await settings.updateSettings({ lastEdited: new Date(2000), scraperConcurrencyLimit: 4 });
    const remote = {
      appSettings: { uiLocale: 'zh-TW', lastEdited: new Date(1000), scraperConcurrencyLimit: 3 },
    };
    const merged = await SyncDataService.mergeDataForUpload(
      {
        novels: [],
        aiModels: [],
        coverHistory: [],
        memories: [],
        appSettings: settings.getAllSettings(),
      },
      remote,
      0,
    );
    expect(merged.appSettings.uiLocale).toBe('zh-TW');
    expect(merged.appSettings.scraperConcurrencyLimit).toBe(4);
    await SyncDataService.applyDownloadedData(remote, 0, false);
    expect(settings.settings.uiLocale).toBe('zh-TW');
    expect(settings.settings.lastEdited.getTime()).toBe(2000);
  });

  it('语言偏好写入失败时抛出错误且不宣称已经切换成功', async () => {
    const settings = useSettingsStore();
    await settings.loadSettings();
    await settings.setUiLocale('zh-CN');
    spyOn(database, 'getDB').mockRejectedValue(new Error('disk unavailable'));
    const failure = await settings.setUiLocale('en-US').catch((error: unknown) => error);
    expect(failure).toMatchObject({ message: 'disk unavailable' });
    expect(settings.settings.uiLocale).toBe('zh-CN');
  });

  it('并发修改语言和其他设置时两项修改都持久化', async () => {
    const settings = useSettingsStore();
    await settings.loadSettings();
    await Promise.all([
      settings.setUiLocale('en-US'),
      settings.updateSettings({ scraperConcurrencyLimit: 5 }),
    ]);
    setActivePinia(createPinia());
    const reopened = useSettingsStore();
    await reopened.loadSettings();
    expect(reopened.settings.uiLocale).toBe('en-US');
    expect(reopened.settings.scraperConcurrencyLimit).toBe(5);
  });
});
