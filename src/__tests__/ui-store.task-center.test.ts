import './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useUiStore } from 'src/stores/ui';

const STORAGE_KEY = 'tsukuyomi-ui-state';

function reload() {
  setActivePinia(createPinia());
  const store = useUiStore();
  store.loadState();
  return store;
}

describe('ui store · 任务中心状态', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    setActivePinia(createPinia());
  });

  it('默认未固定、未收起、无位置、无展开项、其他 AI 活动区展开', () => {
    const store = useUiStore();
    store.loadState();
    expect(store.taskCenterPinned).toBe(false);
    expect(store.taskCenterCollapsed).toBe(false);
    expect(store.taskCenterPosition).toBeNull();
    expect(store.taskCenterExpandedId).toBeNull();
    expect(store.taskCenterOtherCollapsed).toBe(false);
  });

  it('固定、收起、位置、展开项与其他 AI 活动区折叠状态刷新后恢复', () => {
    const store = useUiStore();
    store.loadState();
    store.setTaskCenterPinned(true);
    store.setTaskCenterCollapsed(true);
    store.setTaskCenterPosition({ x: 120, y: 80 });
    store.setTaskCenterExpandedId('q-1');
    store.setTaskCenterOtherCollapsed(true);

    const restored = reload();
    expect(restored.taskCenterPinned).toBe(true);
    expect(restored.taskCenterCollapsed).toBe(true);
    expect(restored.taskCenterPosition).toEqual({ x: 120, y: 80 });
    expect(restored.taskCenterExpandedId).toBe('q-1');
    expect(restored.taskCenterOtherCollapsed).toBe(true);
  });

  it('后台向量化区默认折叠，展开后刷新仍保持展开', () => {
    const store = useUiStore();
    store.loadState();
    expect(store.taskCenterEmbeddingCollapsed).toBe(true);
    store.setTaskCenterEmbeddingCollapsed(false);
    expect(reload().taskCenterEmbeddingCollapsed).toBe(false);
    reload().setTaskCenterEmbeddingCollapsed(true);
    expect(reload().taskCenterEmbeddingCollapsed).toBe(true);
  });

  it('取消固定时同时清除收起状态', () => {
    const store = useUiStore();
    store.loadState();
    store.setTaskCenterPinned(true);
    store.setTaskCenterCollapsed(true);
    store.setTaskCenterPinned(false);
    expect(store.taskCenterCollapsed).toBe(false);
  });

  it('存储中的位置不是有效坐标时忽略', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ taskCenterPinned: true, taskCenterPosition: { x: 'a', y: null } }),
    );
    const store = useUiStore();
    store.loadState();
    expect(store.taskCenterPinned).toBe(true);
    expect(store.taskCenterPosition).toBeNull();
  });

  it('固定面板尺寸默认为空，设置后刷新恢复', () => {
    const store = useUiStore();
    store.loadState();
    expect(store.taskCenterSize).toBeNull();
    store.setTaskCenterSize({ width: 520, height: 640 });

    const restored = reload();
    expect(restored.taskCenterSize).toEqual({ width: 520, height: 640 });
    restored.setTaskCenterSize(null);
    expect(reload().taskCenterSize).toBeNull();
  });

  it('存储中的尺寸不是有效正数时忽略', () => {
    for (const taskCenterSize of [
      { width: 'a', height: 400 },
      { width: 400, height: -1 },
      null,
      3,
    ]) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ taskCenterSize }));
      expect(reload().taskCenterSize).toBeNull();
    }
  });

  it('切换到手机断点不改变固定状态', () => {
    const store = useUiStore();
    store.loadState();
    store.setTaskCenterPinned(true);
    store.setDeviceType('phone');
    store.setDeviceType('desktop');
    expect(store.taskCenterPinned).toBe(true);
  });
});
