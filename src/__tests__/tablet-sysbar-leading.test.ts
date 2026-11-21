import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import messages from '../i18n';
import { provideTaskCenter } from '../composables/task-center/useTaskCenter';
import { useUiStore } from '../stores/ui';

const pages = vi.hoisted(() => ({
  books: {} as Record<string, unknown>,
  details: {} as Record<string, unknown>,
}));
vi.mock('src/composables/books-page/useBooksTabletPage', () => ({
  injectBooksTabletPage: () => pages.books,
}));
vi.mock('src/composables/book-details/useBookDetailsPage', () => ({
  injectBookDetailsPage: () => pages.details,
}));
vi.mock('src/pages/book-details/BookDetailsDesktop.vue', () => ({
  default: { render: () => null },
}));
vi.mock('src/components/sync/SyncStatusPanel.vue', () => ({ default: { render: () => null } }));
vi.mock('src/components/dialogs/ToastHistoryDialog.vue', () => ({
  default: { render: () => null },
}));

const { default: TabletSysBar } = await import('src/components/layout/TabletSysBar.vue');
const { default: BooksTabletListToggle } =
  await import('src/pages/books-page/BooksTabletListToggle.vue');
const { default: BookDetailsTablet } = await import('src/pages/book-details/BookDetailsTablet.vue');

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

function stubOrientation(portrait: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('portrait') ? portrait : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

async function flush() {
  for (let i = 0; i < 3; i++) {
    await Promise.resolve();
    await nextTick();
  }
}

async function mount(path: string) {
  setActivePinia(createPinia());
  const isListOpen = ref(true);
  const isTabletSidebarOpen = ref(true);
  pages.books = { isListOpen, toggleList: () => (isListOpen.value = !isListOpen.value) };
  pages.details = {
    book: ref({ targetLanguage: 'zh-CN' }),
    isTabletSidebarOpen,
    toggleTabletSidebar: () => (isTabletSidebarOpen.value = !isTabletSidebarOpen.value),
  };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => null } },
      { path: '/books', component: BooksTabletListToggle },
      { path: '/books/:id', component: BookDetailsTablet },
      { path: '/import/:taskId?', component: { render: () => null } },
    ],
  });
  await router.push(path);
  app = createApp(
    defineComponent({
      setup() {
        provideTaskCenter();
        return () => h('div', [h(TabletSysBar), h(RouterView)]);
      },
    }),
  );
  app
    .use(router)
    .use(createI18n({ legacy: false, locale: 'zh-CN', messages }))
    .mount(document.body.appendChild(document.createElement('div')));
  await flush();
  return { router, isListOpen, isTabletSidebarOpen, ui: useUiStore() };
}

const leading = () => document.querySelector<HTMLElement>('#tablet-sysbar-leading')!;
const toggle = () => leading().querySelector<HTMLButtonElement>('button');
const assistant = () =>
  document.querySelector<HTMLButtonElement>(
    '.tsm-sysbar-tablet button[aria-label="月詠 AI 助手"]',
  )!;

describe('平板顶部信息条：页面开关挂载点', () => {
  it('书库页的书籍列表开关出现在品牌左侧，点击切换并同步标题、图标与 aria-pressed', async () => {
    const { isListOpen } = await mount('/books');
    const brand = document.querySelector('.tst-brand')!;
    expect(
      leading().compareDocumentPosition(brand) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(toggle()?.getAttribute('title')).toBe('收起书籍列表');
    expect(toggle()?.getAttribute('aria-pressed')).toBe('true');
    expect(toggle()?.querySelector('i')?.classList.contains('pi-angle-double-left')).toBe(true);

    toggle()!.click();
    await nextTick();
    expect(isListOpen.value).toBe(false);
    expect(toggle()?.getAttribute('title')).toBe('展开书籍列表');
    expect(toggle()?.getAttribute('aria-pressed')).toBe('false');
    expect(toggle()?.querySelector('i')?.classList.contains('pi-bars')).toBe(true);
  });

  it('书籍详情页的目录开关切换 isTabletSidebarOpen，页面不再有右侧竖栏', async () => {
    const { isTabletSidebarOpen } = await mount('/books/b1');
    expect(toggle()?.getAttribute('title')).toBe('收起目录');
    toggle()!.click();
    await nextTick();
    expect(isTabletSidebarOpen.value).toBe(false);
    expect(toggle()?.getAttribute('title')).toBe('展开目录');
    expect(toggle()?.getAttribute('aria-pressed')).toBe('false');

    // 竖屏点叠层外侧关闭后，顶部栏的开关同步为收起
    isTabletSidebarOpen.value = true;
    await nextTick();
    document.querySelector<HTMLElement>('.bdt-sidebar-scrim')!.click();
    await nextTick();
    expect(toggle()?.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('.tsr-rail')).toBeNull();
  });

  it('离开书库页后挂载点为空', async () => {
    const { router } = await mount('/books');
    expect(toggle()).not.toBeNull();
    await router.push('/');
    await flush();
    expect(leading().children).toHaveLength(0);
  });
});

describe('平板顶部信息条：月詠助手按钮', () => {
  it('位于分隔线之后、通知之前，点击开关助手并显示激活态', async () => {
    const { ui } = await mount('/');
    // 任务 · 同步 | 月詠 · 通知
    expect(assistant().previousElementSibling?.classList.contains('tst-sep')).toBe(true);
    const actions = [...document.querySelectorAll('.tst-actions > button')];
    const index = actions.indexOf(assistant());
    expect(actions[index - 1]?.getAttribute('data-testid')).toBe('tst-sync-chip');
    expect(actions[index + 1]?.getAttribute('aria-label')).toBe('通知');
    expect(assistant().getAttribute('aria-pressed')).toBe('false');

    assistant().click();
    await nextTick();
    expect(ui.rightPanelOpen).toBe(true);
    expect(assistant().getAttribute('aria-pressed')).toBe('true');
    assistant().click();
    await nextTick();
    expect(ui.rightPanelOpen).toBe(false);
  });

  it('导入页横屏：显示激活态，点击不改变面板开关', async () => {
    stubOrientation(false);
    const { ui } = await mount('/import');
    expect(assistant().getAttribute('aria-pressed')).toBe('true');
    assistant().click();
    await nextTick();
    expect(ui.rightPanelOpen).toBe(false);
  });

  it('导入页竖屏：照常开关滑入的导入对话', async () => {
    stubOrientation(true);
    const { ui } = await mount('/import');
    expect(assistant().getAttribute('aria-pressed')).toBe('false');
    assistant().click();
    await nextTick();
    expect(ui.rightPanelOpen).toBe(true);
    expect(assistant().getAttribute('aria-pressed')).toBe('true');
  });
});
