import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, type App, type Component } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createAppI18n } from '../i18n/vue';
import { provideTaskCenter, type TaskCenter } from '../composables/task-center/useTaskCenter';
import TaskCenterMobile from '../components/task-center/TaskCenterMobile.vue';
import TaskCenterDesktop from '../components/task-center/TaskCenterDesktop.vue';

const stub = vi.hoisted(() => ({ render: () => null }));
vi.mock('src/components/task-center/TaskCenterBody.vue', () => ({ default: stub }));
vi.mock('src/components/task-center/TaskCenterDetailView.vue', () => ({ default: stub }));
vi.mock('src/components/task-center/TaskCenterMiniBar.vue', () => ({ default: stub }));
vi.mock('src/components/layout/MobileBottomSheet.vue', () => ({ default: stub }));
vi.mock('primevue/popover', () => ({ default: stub }));

let app: App | undefined;
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
});

async function mount(variant: Component) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => null } }],
  });
  await router.push('/');
  let center!: TaskCenter;
  const host = document.body.appendChild(document.createElement('div'));
  const mounted = createApp(
    defineComponent({
      setup() {
        center = provideTaskCenter();
        return () => h(variant);
      },
    }),
  );
  mounted.use(router).use(createAppI18n('zh-CN')).mount(host);
  app = mounted;
  await nextTick();
  return { center, unmount: () => mounted.unmount() };
}

describe('任务中心变体卸载时清除打开标记', () => {
  it('手机抽屉打开时切到别的断点（变体被卸载）：共享的打开状态随之清除', async () => {
    const { center, unmount } = await mount(TaskCenterMobile);
    center.open();
    await nextTick();
    expect(center.isOpen.value).toBe(true);
    expect(center.surfaceVisible.value).toBe(true);
    unmount();
    app = undefined;
    expect(center.isOpen.value).toBe(false);
    expect(center.surfaceVisible.value).toBe(false);
  });

  it('桌面弹出层打开时切到手机断点：共享的打开状态随之清除', async () => {
    const { center, unmount } = await mount(TaskCenterDesktop);
    // 弹出层显示时由 @show 记为打开
    center.setOpen(true);
    unmount();
    app = undefined;
    expect(center.isOpen.value).toBe(false);
  });
});
