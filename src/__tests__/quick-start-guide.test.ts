import './setup';
import { beforeEach, describe, expect, it } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import { resetDbForTests } from 'src/utils/indexed-db';
import { useQuickStartGuide } from 'src/composables/useQuickStartGuide';
import { useSettingsStore } from 'src/stores/settings';

describe('useQuickStartGuide', () => {
  beforeEach(async () => {
    await resetDbForTests();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('首次加载时应显示快速开始弹窗', async () => {
    const settingsStore = useSettingsStore();
    await settingsStore.loadSettings();

    const { quickStartGuideVisible } = useQuickStartGuide();
    await Promise.resolve();

    expect(quickStartGuideVisible.value).toBe(true);
  });

  it('关闭后应持久化状态，重启后不再显示', async () => {
    const settingsStore = useSettingsStore();
    await settingsStore.loadSettings();

    const { quickStartGuideVisible, dismissQuickStartGuide } = useQuickStartGuide();
    await Promise.resolve();
    expect(quickStartGuideVisible.value).toBe(true);

    await dismissQuickStartGuide();
    expect(quickStartGuideVisible.value).toBe(false);
    expect(settingsStore.settings.quickStartDismissed).toBe(true);

    setActivePinia(createPinia());
    const reloadedStore = useSettingsStore();
    await reloadedStore.loadSettings();

    const { quickStartGuideVisible: visibleAfterReload } = useQuickStartGuide();
    await Promise.resolve();

    expect(reloadedStore.settings.quickStartDismissed).toBe(true);
    expect(visibleAfterReload.value).toBe(false);
  });

  it('读取设置异常时应回退为未关闭并继续展示', async () => {
    localStorage.setItem('tsukuyomi-settings', '{invalid json');

    const settingsStore = useSettingsStore();
    await settingsStore.loadSettings();

    const { quickStartGuideVisible } = useQuickStartGuide();
    await Promise.resolve();

    expect(settingsStore.settings.quickStartDismissed).toBe(false);
    expect(quickStartGuideVisible.value).toBe(true);
  });
});
