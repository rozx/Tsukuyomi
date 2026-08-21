/**
 * 回归测试：平板系统栏的弹层锚点按钮在状态切换时必须保持同一个 DOM 节点。
 *
 * 背景 bug：PrimeVue Popover 在 show() 时记住触发按钮作为定位锚点，
 * 且其 ResizeObserver 会在弹层内容尺寸变化时重新调用 alignOverlay()。
 * 如果模板用 v-if/v-else-if 在多个按钮之间切换（比如点"同步"后
 * syncState 从 'ok'/'changes' 变为 'syncing' 换了一个按钮），原锚点按钮
 * 会被卸载，getBoundingClientRect 全为 0，弹层就跳到屏幕左上角。
 *
 * 因此这里断言：同步 chip 与 AI 思考 chip 在状态切换前后是同一个元素且仍在文档中。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import { useSettingsStore } from 'src/stores/settings';
import { useAIProcessingStore, type AIProcessingTask } from 'src/stores/ai-processing';
import { SyncType, type SyncConfig } from 'src/models/sync';

// 三个弹层面板与 PrimeVue Button 都替换成空壳：
// 本测试只关心触发按钮的 DOM 身份，不需要真正渲染 Popover / Dialog。
// vi.mock 会被静态提升到所有 import 之前，因此 stub 工厂必须用 vi.hoisted 构造。
const { stub } = vi.hoisted(() => {
  const stub = (name: string) => ({
    name,
    render: () => null,
  });
  return { stub };
});

vi.mock('src/components/sync/SyncStatusPanel.vue', () => ({
  default: stub('SyncStatusPanel'),
}));
vi.mock('src/components/ai/ThinkingProcessPanel.vue', () => ({
  default: stub('ThinkingProcessPanel'),
}));
vi.mock('src/components/dialogs/ToastHistoryDialog.vue', () => ({
  default: stub('ToastHistoryDialog'),
}));
vi.mock('primevue/button', () => ({
  default: stub('PvButton'),
}));

import TabletSysBar from 'src/components/layout/TabletSysBar.vue';

const createGistConfig = (overrides: Partial<SyncConfig>): SyncConfig => ({
  enabled: false,
  lastSyncTime: 0,
  syncInterval: 300000,
  syncType: SyncType.Gist,
  syncParams: {},
  secret: '',
  apiEndpoint: '',
  lastSyncedModelIds: [],
  deletedNovelIds: [],
  deletedModelIds: [],
  deletedCoverIds: [],
  deletedCoverUrls: [],
  deletedMemoryIds: [],
  ...overrides,
});

let app: App | null = null;
let host: HTMLElement | null = null;

const mountSysBar = () => {
  host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp(TabletSysBar);
  app.mount(host);
  return host;
};

afterEach(() => {
  app?.unmount();
  app = null;
  host?.remove();
  host = null;
});

describe('TabletSysBar 弹层锚点稳定性', () => {
  it('同步 chip 在 syncState 变化（ok → syncing）时保持同一个按钮元素', async () => {
    const settingsStore = useSettingsStore();
    settingsStore.syncs.push(createGistConfig({ enabled: true, lastSyncTime: Date.now() }));

    const el = mountSysBar();
    await nextTick();

    const before = el.querySelector('[data-testid="tst-sync-chip"]');
    expect(before).not.toBeNull();

    // 模拟用户在弹层里点击"同步"：isSyncing 翻转，syncState 'ok' → 'syncing'
    settingsStore.setSyncing(true);
    await nextTick();

    const after = el.querySelector('[data-testid="tst-sync-chip"]');
    expect(after).not.toBeNull();
    // 锚点按钮必须是同一个节点且仍挂在文档里，否则 Popover 会跳到左上角
    expect(after).toBe(before);
    expect(before!.isConnected).toBe(true);
  });

  it('AI 思考 chip 在 thinking 变化时保持同一个按钮元素', async () => {
    const aiProcessing = useAIProcessingStore();

    const el = mountSysBar();
    await nextTick();

    const before = el.querySelector('[data-testid="tst-thinking-chip"]');
    expect(before).not.toBeNull();

    // 模拟 AI 任务启动：thinking false → true
    aiProcessing.activeTasks.push({
      id: 'task-1',
      type: 'translation',
      modelName: 'test-model',
      status: 'thinking',
      startTime: Date.now(),
    } as AIProcessingTask);
    await nextTick();

    const after = el.querySelector('[data-testid="tst-thinking-chip"]');
    expect(after).not.toBeNull();
    expect(after).toBe(before);
    expect(before!.isConnected).toBe(true);
  });
});
