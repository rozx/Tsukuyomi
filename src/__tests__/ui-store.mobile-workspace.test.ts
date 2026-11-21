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

    store.setBookWorkspaceMode('catalog');
    store.setDeviceType('phone');
    store.setDeviceType('tablet');
    store.setDeviceType('desktop');

    expect(store.bookWorkspaceMode).toBe('catalog');
  });

  it('旧版本保存的 activeRightTab=progress 加载后回退为 chat，且不改变右侧面板开合', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ sideMenuOpen: true, rightPanelOpen: true, activeRightTab: 'progress' }),
    );

    const store = useUiStore();
    store.loadState();

    expect(store.activeRightTab).toBe('chat');
    expect(store.rightPanelOpen).toBe(true);
  });

  it('localStorage 中没有 activeRightTab 时应回退到默认 chat', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ sideMenuOpen: true, rightPanelOpen: false }),
    );

    const store = useUiStore();
    store.loadState();

    expect(store.activeRightTab).toBe('chat');
  });

  it('旧版本保存的工作区模式 progress 加载后回退为默认值', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ bookWorkspaceMode: 'progress' }));
    const store = useUiStore();
    store.loadState();
    expect(store.bookWorkspaceMode).not.toBe('progress');
  });
});
