import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import PrimeVue from 'primevue/config';
import { BookSyncService } from 'src/services/book-sync/book-sync-service';
import { provideBookSync } from 'src/composables/book-sync/useBookSync';

const pageCtx = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
}));
vi.mock('src/composables/book-details/useBookDetailsPage', () => ({
  injectBookDetailsPage: () => pageCtx.ctx,
}));
vi.mock('src/composables/useToastHistory', () => ({
  useToastWithHistory: () => ({ add: vi.fn() }),
}));
vi.mock('src/composables/useDeviceVariant', async () => {
  const { ref: vueRef } = await import('vue');
  return { useDeviceVariant: () => ({ variant: vueRef('mobile') }) };
});
vi.mock('src/pages/book-details/BookDetailsMobileOverview.vue', () => ({
  default: { render: () => h('div', { 'data-testid': 'overview' }) },
}));
vi.mock('src/pages/book-details/BookDetailsMobileReader.vue', () => ({
  default: { render: () => h('div', { 'data-testid': 'reader' }) },
}));

import BookDetailsMobile from 'src/pages/book-details/BookDetailsMobile.vue';

let app: App | undefined;

async function flush() {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await nextTick();
  }
}

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

async function mount(setting: string | null) {
  const changeset = {
    baseRevision: 1,
    new: [{ url: 'u1', title: '第9话', target: { volumeId: 'v' }, groupKey: 'g' }],
    updated: [],
    skipped: [],
    failed: [],
    unchecked: [],
    checked: [],
    status: 'ready' as const,
  };
  vi.spyOn(BookSyncService, 'openSession').mockResolvedValue({
    changeset,
    quickCheck: vi.fn(() => Promise.resolve(changeset)),
  } as never);
  pageCtx.ctx = {
    book: ref({ id: 'b1', title: '书' }),
    bookId: ref('b1'),
    selectedChapter: ref(null),
    selectedSettingMenu: ref(setting),
  };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
  });
  await router.push(setting ? `/books/b1/settings/${setting}` : '/books/b1');
  const host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp(
    defineComponent({
      setup() {
        provideBookSync(ref(setting === 'update' ? { bookId: 'b1' } : null));
        return () => h(BookDetailsMobile);
      },
    }),
  );
  app.use(router);
  app.use(PrimeVue);
  app.mount(host);
  await flush();
  return { host, router };
}

describe('手机端检查更新全屏页', () => {
  it('setting=update 时以全屏页面显示同步工作区，返回回到书籍概览', async () => {
    const { host, router } = await mount('update');
    expect(host.querySelector('[data-testid="overview"]')).toBeNull();
    expect(host.querySelector('.bsw--mobile')).not.toBeNull();
    expect(host.textContent).toContain('第9话');

    host.querySelector<HTMLButtonElement>('button[aria-label="返回书籍概览"]')!.click();
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(router.currentRoute.value.path).toBe('/books/b1');
  });

  it('其他情况仍显示书籍概览', async () => {
    const { host } = await mount(null);
    expect(host.querySelector('[data-testid="overview"]')).not.toBeNull();
    expect(host.querySelector('.bsw--mobile')).toBeNull();
  });
});
