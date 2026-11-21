import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { computed, createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { createAppI18n } from '../i18n/vue';
import { useUiStore } from '../stores/ui';

function stub(name: string) {
  return {
    default: defineComponent({ setup: () => () => h('button', { class: name, type: 'button' }) }),
  };
}
vi.mock('src/components/task-center/TaskCenterChip.vue', () => stub('stub-task-chip'));
vi.mock('src/components/dialogs/ToastHistoryDialog.vue', () => stub('stub-history'));
vi.mock('src/components/sync/SyncStatusPanel.vue', () => stub('stub-sync-panel'));
vi.mock('src/composables/layout/useSystemBar', () => ({
  useSystemBar: () => ({
    unreadCount: ref(0),
    pendingCount: ref(0),
    syncState: computed(() => 'idle'),
    nextSyncTime: ref(null),
    toastHistoryRef: ref(null),
    syncPanelRef: ref(null),
    toggleHistory: () => undefined,
    toggleSync: () => undefined,
  }),
}));

const { default: AppHeader } = await import('src/components/layout/AppHeader.vue');

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
});

async function mount(path: string) {
  setActivePinia(createPinia());
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:any(.*)*', component: { render: () => null } }],
  });
  await router.push(path);
  const host = document.body.appendChild(document.createElement('div'));
  app = createApp(AppHeader);
  app.use(router).use(createAppI18n('zh-CN')).use(PrimeVue).mount(host);
  await nextTick();
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="月詠 AI 助手"]')!;
  return { ui: useUiStore(), host, button };
}

describe('桌面 header 的月詠按钮', () => {
  it('位于分隔线之后、通知之前，点击开关助手面板并显示激活态', async () => {
    const { ui, host, button } = await mount('/books');
    expect(button).not.toBeNull();
    // 任务 · 同步 | 月詠 · 通知
    expect(button.previousElementSibling?.classList.contains('dsk-sep')).toBe(true);
    const actions = [...host.querySelectorAll('.dsk-actions > button')];
    const index = actions.indexOf(button);
    expect(actions[index - 1]?.getAttribute('aria-label')).toBe('同步状态');
    expect(actions[index + 1]?.getAttribute('aria-label')).toBe('消息历史');
    expect(button.textContent).toContain('月詠');
    expect(button.getAttribute('aria-pressed')).toBe('false');

    button.click();
    await nextTick();
    expect(ui.rightPanelOpen).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.classList.contains('active')).toBe(true);

    button.click();
    await nextTick();
    expect(ui.rightPanelOpen).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('导入页：显示激活态，点击不关闭也不改变离开后的面板开关', async () => {
    const { ui, button } = await mount('/import');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    button.click();
    await nextTick();
    expect(ui.rightPanelOpen).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });
});
