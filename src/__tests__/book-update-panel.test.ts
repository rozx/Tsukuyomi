import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import PrimeVue from 'primevue/config';
import type { Novel } from 'src/models/novel';
import { BookSyncService } from 'src/services/book-sync/book-sync-service';
import { provideBookSync } from 'src/composables/book-sync/useBookSync';
import BookUpdatePanel from 'src/components/novel/BookUpdatePanel.vue';

vi.mock('src/composables/useToastHistory', () => ({
  useToastWithHistory: () => ({ add: vi.fn() }),
}));
vi.mock('src/composables/useDeviceVariant', async () => {
  const { ref: vueRef } = await import('vue');
  return { useDeviceVariant: () => ({ variant: vueRef('desktop') }) };
});

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

describe('检查更新面板', () => {
  it('承载同步工作区，返回回到书籍工作台', async () => {
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
    const open = vi.spyOn(BookSyncService, 'openSession').mockResolvedValue({
      changeset,
      quickCheck: vi.fn(() => Promise.resolve(changeset)),
    } as never);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
    });
    await router.push('/books/b1/settings/update');
    const book = { id: 'b1', title: '书', createdAt: new Date(), lastEdited: new Date() } as Novel;
    const host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp(
      defineComponent({
        setup() {
          provideBookSync(ref({ bookId: 'b1' }));
          return () => h(BookUpdatePanel, { book });
        },
      }),
    );
    app.use(router);
    app.use(PrimeVue);
    app.mount(host);
    await flush();

    expect(open).toHaveBeenCalledWith({ target: { bookId: 'b1' } });
    expect(host.textContent).toContain('检查更新');
    expect(host.textContent).toContain('第9话');

    host.querySelector<HTMLButtonElement>('button[aria-label="返回书籍"]')!.click();
    await flush();
    await router.isReady();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(router.currentRoute.value.path).toBe('/books/b1');
  });
});
