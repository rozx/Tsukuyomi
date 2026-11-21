import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import { getActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { createAppI18n } from '../i18n/vue';
import { useSettingsStore } from '../stores/settings';
import { EmbeddingService, MODEL_VERSION } from '../services/embedding-service';
import { CHAPTER_MODEL_VERSION } from '../services/chapter-embedding-service';
import EmbeddingSettingsTab from '../components/settings/EmbeddingSettingsTab.vue';

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
});

function mount(backend: 'webgpu' | 'wasm' | null) {
  const settings = useSettingsStore();
  settings.isLoaded = true;
  settings.settings.enableLocalEmbedding = true;
  vi.spyOn(settings, 'updateMemoryInjection').mockResolvedValue(undefined);
  vi.spyOn(EmbeddingService, 'getStatus').mockReturnValue(backend ? 'ready' : 'idle');
  vi.spyOn(EmbeddingService, 'getActiveBackend').mockReturnValue(backend);
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

describe('设置 → 嵌入：模型后端与版本', () => {
  it('模型分组显示运行后端与模型 / 章节模型版本，不带进度条', async () => {
    const { root } = mount('webgpu');
    await nextTick();
    const info = root.querySelector('[data-testid="embedding-backend-info"]')!;
    expect(info).not.toBeNull();
    expect(info.textContent).toContain('WebGPU');
    expect(info.textContent).toContain(MODEL_VERSION);
    expect(info.textContent).toContain(CHAPTER_MODEL_VERSION.split('@').pop()!);
    expect(info.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('WASM 后端标明较慢；状态变化后更新后端', async () => {
    const { root, emit } = mount('wasm');
    await nextTick();
    const info = () => root.querySelector('[data-testid="embedding-backend-info"]')!;
    expect(info().textContent).toContain('WASM');

    vi.spyOn(EmbeddingService, 'getActiveBackend').mockReturnValue('webgpu');
    emit('status-changed', { status: 'ready' });
    await nextTick();
    expect(info().textContent).toContain('WebGPU');
  });

  it('还没有加载模型时后端显示为占位', async () => {
    const { root } = mount(null);
    await nextTick();
    expect(root.querySelector('[data-testid="embedding-backend-info"]')!.textContent).toContain(
      '—',
    );
  });
});
