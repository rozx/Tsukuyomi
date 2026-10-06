import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';
import type { App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useMainLayoutShell } from '../composables/main-layout/useMainLayoutShell';
import { useSettingsStore } from '../stores/settings';
import { EmbeddingService } from '../services/embedding-service';

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
});

describe('模型升级后的本地预热', () => {
  it('旧模型缓存标记不能触发未缓存 Bekko 的下载', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const settings = useSettingsStore();
    settings.isLoaded = true;
    settings.settings.enableLocalEmbedding = true;
    settings.settings.memoryInjection!.embeddingModelCached = true;
    vi.spyOn(EmbeddingService, 'isReady').mockReturnValue(false);
    vi.spyOn(EmbeddingService, 'cleanupLegacyModelCache').mockResolvedValue(0);
    vi.spyOn(EmbeddingService, 'isModelCachedInBrowser').mockResolvedValue(false);
    const warmup = vi.spyOn(EmbeddingService, 'warmup').mockResolvedValue(undefined);
    app = createApp({
      setup() {
        useMainLayoutShell();
        return () => null;
      },
    });
    app.use(pinia).mount(document.createElement('div'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(warmup).not.toHaveBeenCalled();
    expect(settings.settings.memoryInjection?.embeddingModelCached).toBe(false);
  });
});
