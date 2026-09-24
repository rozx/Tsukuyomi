import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick, onMounted, ref } from 'vue';
import type { App } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

const variant = vi.hoisted(() => ({ current: undefined as unknown as { value: string } }));

vi.mock('src/composables/useDeviceVariant', async () => {
  const { ref: vueRef } = await import('vue');
  variant.current = vueRef('desktop');
  return { useDeviceVariant: () => ({ variant: variant.current }) };
});
vi.mock('src/composables/main-layout/useMainLayoutShell', () => ({
  useMainLayoutShell: () => ({
    handleToastClose: () => undefined,
    quickStartGuideVisible: false,
    dismissQuickStartGuide: () => undefined,
  }),
}));
// 变体外壳和全局弹窗与本测试无关，只保留每个变体里的页面出口
function shell(name: string) {
  return {
    default: defineComponent({
      setup: () => () =>
        h('div', { class: `shell-${name}` }, [
          h('div', { id: `route-outlet-${name}`, class: 'route-outlet' }),
        ]),
    }),
  };
}
vi.mock('src/layouts/main-layout/MainLayoutDesktop.vue', () => shell('desktop'));
vi.mock('src/layouts/main-layout/MainLayoutTablet.vue', () => shell('tablet'));
vi.mock('src/layouts/main-layout/MainLayoutMobile.vue', () => shell('mobile'));
vi.mock('src/components/dialogs/AskUserDialog.vue', () => ({ default: { render: () => null } }));
vi.mock('src/components/dialogs/QuickStartGuideDialog.vue', () => ({
  default: { render: () => null },
}));

const { default: MainLayout } = await import('src/layouts/MainLayout.vue');

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
});

async function flush() {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
    await nextTick();
  }
}

describe('主布局的页面出口', () => {
  it('断点切换只移动页面 DOM，页面组件不重新挂载，状态保留', async () => {
    let mounts = 0;
    const Page = defineComponent({
      setup() {
        const count = ref(0);
        onMounted(() => mounts++);
        return () =>
          h('button', { class: 'page', onClick: () => count.value++ }, `点击 ${count.value}`);
      },
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: Page }],
    });
    await router.push('/');
    const host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp(MainLayout);
    app.use(router);
    app.mount(host);
    await flush();

    expect(host.querySelector('#route-outlet-desktop .page')).not.toBeNull();
    host.querySelector<HTMLButtonElement>('.page')!.click();
    await flush();

    variant.current.value = 'mobile';
    await flush();
    expect(host.querySelector('.shell-desktop')).toBeNull();
    expect(host.querySelector('#route-outlet-mobile .page')?.textContent).toBe('点击 1');

    variant.current.value = 'tablet';
    await flush();
    expect(host.querySelector('#route-outlet-tablet .page')?.textContent).toBe('点击 1');
    expect(mounts).toBe(1);
    host.remove();
  });
});
