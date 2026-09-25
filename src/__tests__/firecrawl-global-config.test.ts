import './setup';
import { beforeEach, describe, expect, it } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import { GlobalConfig } from 'src/services/global-config-cache';

const { useSettingsStore } = await import('src/stores/settings');

describe('GlobalConfig Firecrawl 读取', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('默认值：无 Key、回退开启、自动添加映射开启', async () => {
    await useSettingsStore().loadSettings();
    expect(GlobalConfig.getFirecrawlApiKey()).toBeUndefined();
    expect(GlobalConfig.getFirecrawlFallbackEnabled()).toBe(true);
    expect(GlobalConfig.getFirecrawlAutoAddMapping()).toBe(true);
  });

  it('store 更新后立即反映最新值', async () => {
    const store = useSettingsStore();
    await store.loadSettings();

    await store.setFirecrawlApiKey('fc-abc');
    await store.setFirecrawlFallbackEnabled(false);
    await store.setFirecrawlAutoAddMapping(false);

    expect(GlobalConfig.getFirecrawlApiKey()).toBe('fc-abc');
    expect(GlobalConfig.getFirecrawlFallbackEnabled()).toBe(false);
    expect(GlobalConfig.getFirecrawlAutoAddMapping()).toBe(false);
  });
});
