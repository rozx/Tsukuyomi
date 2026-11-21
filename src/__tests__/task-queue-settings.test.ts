import './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { pickTaskQueueMaxConcurrent } from 'src/models/task-queue';
import { parseAppSettings } from 'src/services/settings/settings-parsers';

describe('pickTaskQueueMaxConcurrent', () => {
  it('缺失或非数字时返回默认值 2', () => {
    expect(pickTaskQueueMaxConcurrent(undefined)).toBe(2);
    expect(pickTaskQueueMaxConcurrent(null)).toBe(2);
    expect(pickTaskQueueMaxConcurrent('3')).toBe(2);
    expect(pickTaskQueueMaxConcurrent(Number.NaN)).toBe(2);
  });

  it('范围内的整数原样返回', () => {
    for (const value of [1, 2, 3, 4, 5]) expect(pickTaskQueueMaxConcurrent(value)).toBe(value);
  });

  it('越界值钳制到 1–5', () => {
    expect(pickTaskQueueMaxConcurrent(0)).toBe(1);
    expect(pickTaskQueueMaxConcurrent(-3)).toBe(1);
    expect(pickTaskQueueMaxConcurrent(6)).toBe(5);
    expect(pickTaskQueueMaxConcurrent(Number.POSITIVE_INFINITY)).toBe(5);
  });

  it('非整数四舍五入后再钳制', () => {
    expect(pickTaskQueueMaxConcurrent(2.4)).toBe(2);
    expect(pickTaskQueueMaxConcurrent(2.6)).toBe(3);
    expect(pickTaskQueueMaxConcurrent(0.2)).toBe(1);
    expect(pickTaskQueueMaxConcurrent(9.9)).toBe(5);
  });
});

describe('parseAppSettings · taskQueueMaxConcurrent', () => {
  it('同步导入时透传并钳制该字段', () => {
    expect(parseAppSettings({ taskQueueMaxConcurrent: 4 })?.taskQueueMaxConcurrent).toBe(4);
    expect(parseAppSettings({ taskQueueMaxConcurrent: 99 })?.taskQueueMaxConcurrent).toBe(5);
  });

  it('远端没有该字段时不写入（保留本地值由合并逻辑决定）', () => {
    expect(parseAppSettings({})).not.toHaveProperty('taskQueueMaxConcurrent');
  });
});

describe('settings store · taskQueueMaxConcurrent', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('默认值为 2', async () => {
    const { useSettingsStore } = await import('src/stores/settings');
    const store = useSettingsStore();
    await store.loadSettings();
    expect(store.taskQueueMaxConcurrent).toBe(2);
  });

  it('加载时把存储中的越界值钳制到 1–5', async () => {
    const { useSettingsStore } = await import('src/stores/settings');
    const store = useSettingsStore();
    await store.loadSettings();
    await store.updateSettings({ taskQueueMaxConcurrent: 42 });
    setActivePinia(createPinia());
    const reloaded = useSettingsStore();
    await reloaded.loadSettings();
    expect(reloaded.settings.taskQueueMaxConcurrent).toBe(5);
    expect(reloaded.taskQueueMaxConcurrent).toBe(5);
  });

  it('setTaskQueueMaxConcurrent 钳制后保存', async () => {
    const { useSettingsStore } = await import('src/stores/settings');
    const store = useSettingsStore();
    await store.loadSettings();
    await store.setTaskQueueMaxConcurrent(0);
    expect(store.taskQueueMaxConcurrent).toBe(1);
    await store.setTaskQueueMaxConcurrent(3);
    expect(store.settings.taskQueueMaxConcurrent).toBe(3);
  });
});
