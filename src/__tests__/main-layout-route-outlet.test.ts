import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick, onMounted, ref } from 'vue';
import type { App } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import ConfirmationService from 'primevue/confirmationservice';
import { createAppI18n } from '../i18n/vue';
import BatchEmbeddingsButton from '../components/novel/BatchEmbeddingsButton.vue';
import { useSettingsStore } from '../stores/settings';
import { useBooksStore } from '../stores/books';
import { setPlatformOverride } from '../utils/platform';

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
          h(BatchEmbeddingsButton),
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
  setPlatformOverride(null);
  document.body.innerHTML = '';
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
    app.use(router).use(createAppI18n('zh-CN'));
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

  it('嵌入开关控制入口，已打开的唯一向量面板跨布局保留，关停或离开书籍后关闭', async () => {
    setPlatformOverride({ is: { mobile: false } });
    const pinia = createPinia();
    setActivePinia(pinia);
    const settings = useSettingsStore();
    await useBooksStore().addBook({
      id: 'vectors-book',
      title: '向量测试书',
      createdAt: new Date(0),
      lastEdited: new Date(0),
      volumes: [],
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/books/:id', component: { render: () => null } },
        { path: '/settings', component: { render: () => null } },
      ],
    });
    await router.push('/books/vectors-book');
    app = createApp(MainLayout);
    app
      .use(pinia)
      .use(router)
      .use(createAppI18n('zh-CN'))
      .use(PrimeVue)
      .use(ToastService)
      .use(ConfirmationService)
      .mount(document.body.appendChild(document.createElement('div')));
    await flush();
    const button = () => document.querySelector<HTMLButtonElement>('button[aria-label="向量索引"]');
    const overlaySelector = '.batch-embeddings-drawer, .mbs-backdrop[aria-label="本地向量索引"]';
    const drawer = () => document.querySelector(overlaySelector);
    expect(button()).toBeNull();
    settings.settings.enableLocalEmbedding = true;
    await flush();
    expect(button()).not.toBeNull();
    button()!.click();
    await flush();
    expect(drawer()?.textContent).toContain('向量测试书');
    for (const layout of ['tablet', 'mobile', 'desktop']) {
      variant.current.value = layout;
      await flush();
      expect(button()?.getAttribute('aria-expanded')).toBe('true');
      expect(document.querySelectorAll(overlaySelector)).toHaveLength(1);
      if (layout === 'mobile') {
        const sheet = document.querySelector('.mbs-backdrop[aria-label="本地向量索引"]');
        expect(sheet).not.toBeNull();
        expect(document.body.style.overflow).toBe('hidden');
        sheet!.querySelector<HTMLButtonElement>('.mbs-grabber')!.click();
        await flush();
        expect(button()?.getAttribute('aria-expanded')).toBe('false');
        expect(document.body.style.overflow).toBe('');
        button()!.click();
        await flush();
      }
    }
    settings.settings.enableLocalEmbedding = false;
    await flush();
    expect(button()).toBeNull();
    expect(drawer()).toBeNull();
    settings.settings.enableLocalEmbedding = true;
    await flush();
    expect(button()?.getAttribute('aria-expanded')).toBe('false');
    button()!.click();
    await flush();
    await router.push('/settings');
    await flush();
    expect(button()).toBeNull();
    expect(drawer()).toBeNull();
    await router.push('/books/vectors-book');
    await flush();
    expect(button()?.getAttribute('aria-expanded')).toBe('false');
  });
});
