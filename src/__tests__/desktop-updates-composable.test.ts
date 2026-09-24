import { expect } from 'vitest';
import { describe, it, mock, afterEach } from 'bun:test';
import './setup';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { initializeDesktopUpdates, useDesktopUpdates } from '../composables/useDesktopUpdates';
import { useAIProcessingStore } from '../stores/ai-processing';
import { desktopRestartGuard } from '../services/desktop-restart-guard';

afterEach(() => {
  delete window.electronAPI;
  desktopRestartGuard.release();
  document.body.inert = false;
});

describe('桌面更新界面桥接', () => {
  it('仅注册一次应用订阅，活跃 AI 任务拒绝更新准备', async () => {
    let prepare!: () => Promise<void>;
    const onState = mock(() => () => {});
    window.electronAPI = {
      updates: {
        getState: () => Promise.resolve({ phase: 'idle', currentVersion: '0.16.0' }),
        check: () =>
          Promise.resolve({ phase: 'ready', currentVersion: '0.16.0', targetVersion: '0.16.1' }),
        restart: () => Promise.resolve({ phase: 'ready', currentVersion: '0.16.0' }),
        onState,
        onPrepare: (callback: () => Promise<void>) => {
          prepare = callback;
          return () => {};
        },
        onRelease: () => () => {},
      },
    } as unknown as NonNullable<Window['electronAPI']>;
    const pinia = createPinia();
    const element = document.createElement('div');
    const app = createApp({
      setup() {
        initializeDesktopUpdates();
        return () => null;
      },
    });
    app.use(pinia);
    app.mount(element);
    try {
      const ai = useAIProcessingStore(pinia);
      ai.activeTasks.push({
        id: 'active',
        status: 'processing',
      } as (typeof ai.activeTasks)[number]);
      await expect(prepare()).rejects.toThrow('任务');
      expect(document.body.inert).toBe(false);
      expect(onState).toHaveBeenCalledTimes(1);
      await useDesktopUpdates().check();
      expect(useDesktopUpdates().state.value.phase).toBe('ready');
    } finally {
      app.unmount();
    }
  });
});
