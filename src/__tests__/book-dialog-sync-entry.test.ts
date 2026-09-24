import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { App } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import PrimeVue from 'primevue/config';
import type { Novel } from 'src/models/novel';
import BookDialog from 'src/components/dialogs/BookDialog.vue';

vi.mock('src/composables/useToastHistory', () => ({
  useToastWithHistory: () => ({ add: vi.fn() }),
}));

// Textarea 的自动高度依赖 ResizeObserver，jsdom 没有实现
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

let app: App | undefined;

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
});

async function mount(mode: 'add' | 'edit', book: Novel | null = null) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
  });
  await router.push('/books');
  const visible = vi.fn();
  app = createApp(
    defineComponent({
      setup: () => () => h(BookDialog, { visible: true, mode, book, 'onUpdate:visible': visible }),
    }),
  );
  app.use(router);
  app.use(PrimeVue);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await nextTick();
  await nextTick();
  return { router, visible };
}

function clickFetch() {
  const button = [...document.body.querySelectorAll('button')].find((b) =>
    (b.textContent ?? '').includes('从网站获取'),
  );
  if (!button) throw new Error('找不到「从网站获取」');
  button.click();
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('书籍对话框的从网站获取', () => {
  it('新建模式关闭对话框并跳到新建同步工作区', async () => {
    const { router, visible } = await mount('add');
    clickFetch();
    await settle();
    expect(visible).toHaveBeenCalledWith(false);
    expect(router.currentRoute.value.path).toBe('/books/new/web');
  });

  it('编辑模式跳到本书的检查更新', async () => {
    const book = {
      id: 'b1',
      title: '书',
      createdAt: new Date(),
      lastEdited: new Date(),
      volumes: [],
    } as Novel;
    const { router, visible } = await mount('edit', book);
    clickFetch();
    await settle();
    expect(visible).toHaveBeenCalledWith(false);
    expect(router.currentRoute.value.path).toBe('/books/b1/settings/update');
  });
});
