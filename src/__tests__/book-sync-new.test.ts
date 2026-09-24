import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { App } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import routes from 'src/router/routes';
import { BookSyncService } from 'src/services/book-sync/book-sync-service';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import {
  provideBookSyncNew,
  type BookSyncNewContext,
} from 'src/composables/book-sync-new/useBookSyncNew';

vi.mock('src/composables/useToastHistory', () => ({
  useToastWithHistory: () => ({ add: vi.fn() }),
}));

const NCODE = 'https://ncode.syosetu.com/n1234ab/';

function session() {
  const changeset = {
    baseRevision: null,
    new: [{ url: `${NCODE}1/`, title: '第1话', target: { newTitle: '正文' }, groupKey: '1:a' }],
    updated: [],
    skipped: [],
    failed: [],
    unchecked: [],
    checked: [],
    status: 'ready' as const,
  };
  return {
    changeset,
    quickCheck: vi.fn(() => Promise.resolve(changeset)),
    apply: vi.fn(() =>
      Promise.resolve({
        bookId: 'new-book',
        revision: 1,
        status: 'success' as const,
        appliedUrls: [`${NCODE}1/`],
        failed: [],
        cover: { url: 'https://example.com/cover.jpg' },
      }),
    ),
  };
}

let app: App | undefined;
let ctx: BookSyncNewContext;
let open: ReturnType<typeof vi.spyOn>;

async function flush() {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await nextTick();
  }
}

async function mountAt(path: string): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
  });
  await router.push(path);
  app = createApp(
    defineComponent({
      setup() {
        ctx = provideBookSyncNew();
        return () => h('div');
      },
    }),
  );
  app.use(router);
  app.mount(document.createElement('div'));
  await flush();
  return router;
}

beforeEach(() => {
  open = vi
    .spyOn(BookSyncService, 'openSession')
    .mockImplementation(() => Promise.resolve(session() as never));
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
});

describe('新建工作区路由', () => {
  const router = () => createRouter({ history: createMemoryHistory(), routes });

  it('/books/new/web 不被 books/:id 截获', () => {
    const matched = router().resolve('/books/new/web?url=x').matched;
    expect(matched.at(-1)?.path).toBe('/books/new/web');
  });

  it('普通书籍详情路由不受影响', () => {
    expect(router().resolve('/books/abc').matched.at(-1)?.path).toBe('/books/:id');
    expect(router().resolve('/books/abc/settings/update').matched.at(-1)?.path).toContain(
      '/books/:id/settings/',
    );
  });
});

describe('新建工作区外壳', () => {
  it('带 url 参数进入时自动检查', async () => {
    await mountAt(`/books/new/web?url=${encodeURIComponent(NCODE)}`);
    expect(open).toHaveBeenCalledWith({ target: { newFrom: NCODE } });
    expect(ctx.url.value).toBe(NCODE);
    expect(ctx.sync.phase.value).toBe('ready');
  });

  it('没有 url 参数时等待输入，提交后开始检查', async () => {
    await mountAt('/books/new/web');
    expect(open).not.toHaveBeenCalled();
    ctx.url.value = NCODE;
    ctx.submit();
    await flush();
    expect(open).toHaveBeenCalledWith({ target: { newFrom: NCODE } });
  });

  it('无效网址不开始检查并提示', async () => {
    await mountAt('/books/new/web');
    ctx.url.value = 'not a url';
    ctx.submit();
    await flush();
    expect(ctx.error.value).toContain('网址');
    expect(open).not.toHaveBeenCalled();
  });

  it('应用后把封面记入封面历史并跳转到新书', async () => {
    const router = await mountAt(`/books/new/web?url=${encodeURIComponent(NCODE)}`);
    const addCover = vi.spyOn(useCoverHistoryStore(), 'addCover').mockResolvedValue();
    ctx.sync.requestApply();
    await ctx.sync.confirmApply();
    await flush();
    expect(addCover).toHaveBeenCalledWith({ url: 'https://example.com/cover.jpg' });
    expect(router.currentRoute.value.path).toBe('/books/new-book');
  });
});
