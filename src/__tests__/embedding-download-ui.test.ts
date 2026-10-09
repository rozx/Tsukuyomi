import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import { getActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { createAppI18n } from '../i18n/vue';
import { useSettingsStore } from '../stores/settings';
import { EmbeddingService } from '../services/embedding-service';
import EmbeddingSettingsTab from '../components/settings/EmbeddingSettingsTab.vue';

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
});

function mountPanel() {
  const settings = useSettingsStore();
  settings.isLoaded = true;
  settings.settings.enableLocalEmbedding = true;
  vi.spyOn(settings, 'updateMemoryInjection').mockResolvedValue(undefined);
  vi.spyOn(EmbeddingService, 'getStatus').mockReturnValue('loading');
  const listeners = new Map<string, (event: CustomEvent) => void>();
  vi.spyOn(EmbeddingService, 'addEventListener').mockImplementation((name, listener) => {
    listeners.set(name, listener);
    return () => listeners.delete(name);
  });
  const root = document.createElement('div');
  app = createApp({ render: () => h(EmbeddingSettingsTab) });
  app.use(getActivePinia()!).use(PrimeVue).use(createAppI18n('zh-CN')).mount(root);
  return {
    root,
    emit: (name: string, detail: unknown) =>
      listeners.get(name)!(new CustomEvent(name, { detail })),
  };
}

describe('嵌入模型加载进度界面', () => {
  it('下载过程中打开设置页会恢复当前进度，重载和失败不会保留旧百分比', async () => {
    vi.spyOn(EmbeddingService, 'getProgress').mockReturnValue({
      status: 'progress',
      phase: 'downloading',
      file: 'onnx/model.onnx',
      aggregatePercent: 76,
    });
    const { root, emit } = mountPanel();
    await nextTick();
    expect(root.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('76');
    emit('status-changed', { status: 'loading' });
    await nextTick();
    expect(root.querySelector('[role="progressbar"]')!.hasAttribute('aria-valuenow')).toBe(false);
    expect(root.textContent).not.toContain('onnx/model.onnx');
    emit('error', { error: new Error('下载失败') });
    emit('status-changed', { status: 'failed' });
    await nextTick();
    expect(root.querySelector('[role="progressbar"]')).toBeNull();
    expect(root.textContent).toContain('下载失败');
  });

  it('总量未知时显示活动进度，不把单个配置文件的 100% 当作模型完成', async () => {
    vi.spyOn(EmbeddingService, 'getProgress').mockReturnValue(null);
    const { root, emit } = mountPanel();
    await nextTick();
    expect(root.querySelector('[role="progressbar"]')).not.toBeNull();

    emit('progress', { status: 'progress', file: 'config.json', progress: 100 });
    await nextTick();
    expect(root.textContent).not.toContain('100%');
    expect(root.querySelector('[role="progressbar"]')!.hasAttribute('aria-valuenow')).toBe(false);

    emit('progress', { status: 'progress', phase: 'downloading', aggregatePercent: 48 });
    await nextTick();
    expect(root.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('48');

    emit('progress', { status: 'progress', file: 'tokenizer.json', progress: 10 });
    await nextTick();
    expect(root.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('48');

    emit('progress', { status: 'done', phase: 'initializing', aggregatePercent: 95 });
    await nextTick();
    expect(root.textContent).toContain('正在初始化模型');
    expect(root.textContent).not.toContain('100%');

    emit('status-changed', { status: 'ready' });
    await nextTick();
    expect(root.querySelector('[role="progressbar"]')).toBeNull();
    expect(root.textContent).toContain('已就绪');
  });
});
