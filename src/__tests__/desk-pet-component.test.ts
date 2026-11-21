import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createAppI18n } from '../i18n/vue';
import { provideTaskCenter, type TaskCenter } from '../composables/task-center/useTaskCenter';
import { useTaskQueueStore } from '../stores/task-queue';
import { useAIProcessingStore, type AIProcessingTask } from '../stores/ai-processing';
import { useSettingsStore } from '../stores/settings';
import { useUiStore } from '../stores/ui';
import type { TaskQueueItem } from '../models/task-queue';
import DeskPet from '../components/desk-pet/DeskPet.vue';

let app: App | undefined;
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

async function mount() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => null } }],
  });
  await router.push('/');
  let center!: TaskCenter;
  const host = document.body.appendChild(document.createElement('div'));
  app = createApp(
    defineComponent({
      setup() {
        center = provideTaskCenter();
        return () => h(DeskPet);
      },
    }),
  );
  app.use(router).use(createAppI18n('zh-CN')).mount(host);
  await new Promise((resolve) => setTimeout(resolve, 250));
  await nextTick();
  return { host, center, ui: useUiStore() };
}

const avatar = (host: HTMLElement) =>
  host.querySelector<HTMLButtonElement>('[data-testid="desk-pet-avatar"]')!;

describe('月詠桌宠组件', () => {
  it('空闲时只显示变暗的头像与 zzz；点头像打开助手面板，桌宠随之隐藏', async () => {
    const { host, ui } = await mount();
    expect(host.querySelector('.dp--idle')).not.toBeNull();
    expect(host.querySelector('.dp-bubble')).toBeNull();
    expect(host.textContent).toContain('zzz');
    expect(host.querySelectorAll('.dpa-zzz .dpa-z')).toHaveLength(3);
    avatar(host).click();
    await nextTick();
    expect(ui.rightPanelOpen).toBe(true);
    expect(ui.activeRightTab).toBe('chat');
    expect(host.querySelector('[data-testid="desk-pet"]')).toBeNull();
  });

  it('运行中显示气泡；点击展开后出现打开任务中心，状态记住', async () => {
    useTaskQueueStore().items = [
      {
        id: 'q1',
        bookId: 'b',
        chapterId: 'c1',
        kind: 'translation',
        mode: 'continue',
        origin: 'batch',
        status: 'running',
        order: 1,
        completedParagraphIds: [],
        aiTaskIds: ['t1'],
        enqueuedAt: 1,
      } as TaskQueueItem,
    ];
    useAIProcessingStore().activeTasks = [
      {
        id: 't1',
        type: 'translation',
        modelName: 'M',
        status: 'processing',
        startTime: 1,
        queueItemId: 'q1',
        thinkingMessage: '先看看前文\n[调用工具: query_chapter]\n',
      } as AIProcessingTask,
    ];
    const { host, ui } = await mount();
    expect(host.querySelector('.dp--running')).not.toBeNull();
    const bubble = host.querySelector('.dp-bubble')!;
    expect(bubble.textContent).toContain('工具');
    expect(bubble.textContent).toContain('query_chapter');
    expect(bubble.textContent).not.toContain('打开任务中心');

    host.querySelector<HTMLButtonElement>('.dp-toggle')!.click();
    await nextTick();
    expect(ui.deskPetBubbleExpanded).toBe(true);
    expect(host.querySelector('.dp-bubble')!.textContent).toContain('打开任务中心');

    host.querySelector<HTMLButtonElement>('.dp-toggle')!.click();
    await nextTick();
    expect(ui.deskPetBubbleExpanded).toBe(false);

    avatar(host).click();
    await nextTick();
    expect(ui.rightPanelOpen).toBe(true);
  });

  it('设置关闭时不渲染', async () => {
    const { host } = await mount();
    useSettingsStore().settings.showDeskPet = false;
    await nextTick();
    expect(host.querySelector('[data-testid="desk-pet"]')).toBeNull();
  });
});
