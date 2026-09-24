import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { App } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { provideIndexPage } from 'src/composables/index-page/useIndexPage';
import { provideBooksPage } from 'src/composables/books-page/useBooksPage';

vi.mock('src/composables/useToastHistory', () => ({
  useToastWithHistory: () => ({ add: vi.fn() }),
}));
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }));

let app: App | undefined;

afterEach(() => {
  app?.unmount();
  app = undefined;
});

async function mountWith<T>(provide: () => T): Promise<{ ctx: T; path: () => string }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
  });
  await router.push('/');
  let ctx!: T;
  app = createApp(
    defineComponent({
      setup() {
        ctx = provide();
        return () => h('div');
      },
    }),
  );
  app.use(router);
  app.mount(document.createElement('div'));
  await nextTick();
  return { ctx, path: () => router.currentRoute.value.fullPath };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('从网站导入入口', () => {
  it('首页跳转到新建同步工作区', async () => {
    const { ctx, path } = await mountWith(provideIndexPage);
    ctx.importBookFromWeb();
    await settle();
    expect(path()).toBe('/books/new/web');
    expect('showImportDialog' in ctx).toBe(false);
    expect('handleImportBook' in ctx).toBe(false);
  });

  it('书库跳转到新建同步工作区', async () => {
    const { ctx, path } = await mountWith(provideBooksPage);
    ctx.importBookFromWeb();
    await settle();
    expect(path()).toBe('/books/new/web');
    expect('showImportDialog' in ctx).toBe(false);
    expect('handleImportBook' in ctx).toBe(false);
  });
});
