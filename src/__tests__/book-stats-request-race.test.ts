import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp } from 'vue';
import type { App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ToastService from 'primevue/toastservice';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useBooksStore } from '../stores/books';
import { provideBookDetailsPage } from '../composables/book-details/useBookDetailsPage';
import type * as NovelUtils from '../utils';
const counts = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('src/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof NovelUtils>()),
  getNovelCharCountAsync: counts.read,
}));
let app: App | undefined;
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
  counts.read.mockReset();
});
describe('书籍统计请求身份', () => {
  it('旧统计晚返回不能混入最新书籍结构，最后释放加载状态', async () => {
    let finish!: (count: number) => void;
    let first = true;
    counts.read.mockImplementation(() => {
      if (first) {
        first = false;
        return new Promise<number>((resolve) => {
          finish = resolve;
        });
      }
      return Promise.resolve(222);
    });
    const pinia = createPinia();
    setActivePinia(pinia);
    const books = useBooksStore();
    await books.addBook({
      id: 'b',
      title: '用户书名',
      createdAt: new Date(),
      lastEdited: new Date(),
      volumes: [],
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/books/:id', component: { render: () => null } }],
    });
    await router.push('/books/b');
    let details!: ReturnType<typeof provideBookDetailsPage>;
    app = createApp({
      setup() {
        details = provideBookDetailsPage();
        return () => null;
      },
    });
    app.use(pinia).use(router).use(ToastService).mount(document.createElement('div'));
    await vi.waitFor(() => expect(counts.read).toHaveBeenCalled());
    await books.updateBook('b', { volumes: [{ id: 'v', title: '用户卷名', chapters: [] }] });
    finish(111);
    await vi.waitFor(() => expect(details.stats.value?.wordCount).toBe(222));
    expect(details.stats.value).toEqual({ wordCount: 222, chapterCount: 0, volumeCount: 1 });
    expect(details.isStatsCalculating.value).toBe(false);
  });
});
