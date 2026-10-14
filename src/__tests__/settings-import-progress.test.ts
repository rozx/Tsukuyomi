import './setup';
import { afterEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSettingsStore } from '../stores/settings';
import { SyncDataService, SETTINGS_IMPORT_STAGES } from '../services/sync-data-service';
import type { SettingsImportStage } from '../services/sync-data-service';

afterEach(() => vi.restoreAllMocks());

it('整份导入按固定顺序报告各阶段', async () => {
  setActivePinia(createPinia());
  const settings = useSettingsStore();
  await settings.loadSettings();
  const stages: SettingsImportStage[] = [];

  await SyncDataService.importSettingsSnapshot(
    {
      models: [],
      novels: [],
      coverHistory: [],
      memories: [],
      appSettings: settings.getAllSettings(),
      sync: [],
    },
    'progress-full',
    (stage) => stages.push(stage),
  );

  expect(stages).toEqual([...SETTINGS_IMPORT_STAGES]);
  expect(SETTINGS_IMPORT_STAGES).toEqual([
    'backup',
    'models',
    'novels',
    'covers',
    'memories',
    'settings',
    'finalize',
  ]);
});

it('缺少的部分不报告对应阶段，顺序不变', async () => {
  setActivePinia(createPinia());
  await useSettingsStore().loadSettings();
  const stages: SettingsImportStage[] = [];

  await SyncDataService.importSettingsSnapshot({ novels: [] }, 'progress-partial', (stage) =>
    stages.push(stage),
  );

  expect(stages).toEqual(['backup', 'novels', 'memories', 'settings', 'finalize']);
});

it('不传回调时照常导入', async () => {
  setActivePinia(createPinia());
  await useSettingsStore().loadSettings();
  await expect(
    SyncDataService.importSettingsSnapshot({ novels: [] }, 'progress-none'),
  ).resolves.toBeUndefined();
});
