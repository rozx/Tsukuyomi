import { afterEach, describe, expect, it } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick, ref, type App, type Ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import { useUiStore } from '../stores/ui';
import { useAssistantToggle } from '../composables/layout/useAssistantToggle';

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
});

async function mount(path: string, importDocked: Ref<boolean> = ref(true)) {
  setActivePinia(createPinia());
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:any(.*)*', component: { render: () => null } }],
  });
  await router.push(path);
  let toggle!: ReturnType<typeof useAssistantToggle>;
  app = createApp(
    defineComponent({
      setup() {
        toggle = useAssistantToggle({ importDocked });
        return () => h('div');
      },
    }),
  );
  app.use(router).mount(document.createElement('div'));
  await nextTick();
  return { toggle, ui: useUiStore(), router };
}

describe('顶部栏的月詠助手按钮', () => {
  it('普通页面：点击打开助手，再点关闭，激活态跟随面板', async () => {
    const { toggle, ui } = await mount('/books');
    expect(toggle.active.value).toBe(false);
    toggle.toggle();
    expect(ui.rightPanelOpen).toBe(true);
    expect(ui.activeRightTab).toBe('chat');
    expect(toggle.active.value).toBe(true);
    toggle.toggle();
    expect(ui.rightPanelOpen).toBe(false);
    expect(toggle.active.value).toBe(false);
  });

  it('导入页对话常驻停靠：显示激活态，点击不改变面板开关', async () => {
    const { toggle, ui } = await mount('/import/task-1');
    expect(ui.rightPanelOpen).toBe(false);
    expect(toggle.active.value).toBe(true);
    expect(toggle.locked.value).toBe(true);
    toggle.toggle();
    expect(ui.rightPanelOpen).toBe(false);

    ui.openRightPanel();
    toggle.toggle();
    expect(ui.rightPanelOpen).toBe(true);
  });

  it('导入页对话不停靠（平板竖屏）：与普通页面一样开关滑入的导入对话', async () => {
    const { toggle, ui } = await mount('/import', ref(false));
    expect(toggle.active.value).toBe(false);
    expect(toggle.locked.value).toBe(false);
    toggle.toggle();
    expect(ui.rightPanelOpen).toBe(true);
    expect(toggle.active.value).toBe(true);
    toggle.toggle();
    expect(ui.rightPanelOpen).toBe(false);
  });

  it('离开导入页后按钮恢复普通开关', async () => {
    const { toggle, ui, router } = await mount('/import');
    await router.push('/books');
    await nextTick();
    expect(toggle.active.value).toBe(false);
    toggle.toggle();
    expect(ui.rightPanelOpen).toBe(true);
  });
});
