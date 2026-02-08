import './setup';
import { beforeEach, describe, expect, it } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import { useUiStore } from 'src/stores/ui';

const STORAGE_KEY = 'tsukuyomi-ui-state';

describe('ui store mobile workspace mode', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    setActivePinia(createPinia());
  });

  it('应持久化并恢复小屏工作区模式', () => {
    const store = useUiStore();
    store.loadState();

    store.setBookWorkspaceMode('settings');

    const storedRaw = localStorage.getItem(STORAGE_KEY);
    expect(storedRaw).not.toBeNull();

    setActivePinia(createPinia());
    const restored = useUiStore();
    restored.loadState();

    expect(restored.bookWorkspaceMode).toBe('settings');
  });

  it('切换设备类型不应覆盖已保存的工作区模式', () => {
    const store = useUiStore();
    store.loadState();

    store.setBookWorkspaceMode('progress');
    store.setDeviceType('phone');
    store.setDeviceType('tablet');
    store.setDeviceType('desktop');

    expect(store.bookWorkspaceMode).toBe('progress');
  });
});
