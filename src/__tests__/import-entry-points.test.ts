import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import messages from '../i18n';
import { provideBooksPage } from '../composables/books-page/useBooksPage';
import { provideIndexPage } from '../composables/index-page/useIndexPage';
import {
  provideImportPage,
  type ImportPageContext,
} from '../composables/import-page/useImportPage';
import { useImportWorkspaceStore } from '../stores/import-workspace';
import { webLocksFixture } from './web-locks-fixture';

const feedback = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('src/composables/useToastHistory', () => ({ useToastWithHistory: () => feedback }));
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }));

let app: App | undefined;
beforeEach(() => {
  vi.stubGlobal('navigator', { locks: webLocksFixture(), languages: ['en-US'] });
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
  useImportWorkspaceStore().dispose();
  vi.unstubAllGlobals();
});

async function settle() {
  for (let n = 0; n < 30; n++) {
    await Promise.resolve();
    await nextTick();
  }
}

async function mount<T>(path: string, setup: () => T): Promise<{ ctx: T; router: Router }> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => null } },
      { path: '/books', component: { render: () => null } },
      { path: '/import/:taskId?', component: { render: () => null } },
    ],
  });
  await router.push(path);
  let ctx!: T;
  app = createApp(
    defineComponent({
      setup() {
        ctx = setup();
        return () => h('div');
      },
    }),
  );
  app
    .use(pinia)
    .use(router)
    .use(createI18n({ legacy: false, locale: 'en-US', messages }))
    .mount(document.body.appendChild(document.createElement('div')));
  await settle();
  return { ctx, router };
}

describe('AI 导入入口', () => {
  it('书库的添加书籍菜单包含 AI 导入，选择后进入导入工作台', async () => {
    const { ctx, router } = await mount('/books', provideBooksPage);
    const item = ctx.addBookMenuItems.value.find((entry) => entry.label === 'AI import');
    expect(item).toBeDefined();
    expect(ctx.canAiImport).toBe(true);
    item!.command();
    await settle();
    expect(router.currentRoute.value.path).toBe('/import');
  });

  it('首页可以直接进入导入工作台', async () => {
    const { ctx, router } = await mount('/', provideIndexPage);
    ctx.navigateToImport();
    await settle();
    expect(router.currentRoute.value.path).toBe('/import');
  });
});

describe('导入工作台：返回任务列表', () => {
  it('打开任务后返回任务列表：路由回到 /import，分区回到任务', async () => {
    const { ctx, router } = await mount<ImportPageContext>('/import', provideImportPage);
    await ctx.createTask();
    await settle();
    expect(router.currentRoute.value.path).toMatch(/^\/import\/.+/);

    await ctx.closeTask();
    await settle();
    expect(router.currentRoute.value.path).toBe('/import');
    expect(ctx.section.value).toBe('tasks');
    expect(useImportWorkspaceStore().task).toBeNull();
  });
});

describe('导入工作台：离开导入页（手机任务列表的返回）', () => {
  it('从其他页面进入时返回上一页', async () => {
    const { ctx, router } = await mount<ImportPageContext>('/books', provideImportPage);
    await router.push('/import');
    await settle();
    // 浏览器的 web history 会在 state.back 记下上一页；内存 history 不记录，这里补上
    Object.defineProperty(router.options.history, 'state', { get: () => ({ back: '/books' }) });
    ctx.leave();
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/books'));
  });

  it('直接打开导入页（没有上一页）时回到首页', async () => {
    const { ctx, router } = await mount<ImportPageContext>('/import', provideImportPage);
    ctx.leave();
    await settle();
    expect(router.currentRoute.value.path).toBe('/');
  });
});
