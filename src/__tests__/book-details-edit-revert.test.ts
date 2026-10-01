import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';
import type { App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ToastService from 'primevue/toastservice';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useBooksStore } from '../stores/books';
import { provideBookDetailsPage } from '../composables/book-details/useBookDetailsPage';

const toast = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('src/composables/useToastHistory', () => ({
  useToastWithHistory: () => toast,
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
  app = undefined;
  vi.unstubAllGlobals();
  toast.add.mockReset();
});

describe('书籍详情页编辑书籍后的撤销', () => {
  it('撤销只恢复本次表单改动的字段，不回滚之后写入的卷章节', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const books = useBooksStore();
    await books.addBook({
      id: 'b',
      title: '书',
      author: '作者',
      createdAt: new Date(0),
      lastEdited: new Date(0),
      volumes: [{ id: 'v1', title: '旧卷', chapters: [] }],
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
    await vi.waitFor(() => expect(details.book.value?.id).toBe('b'));

    await details.handleBookSave({ author: '新作者' });
    expect(books.getBookById('b')?.author).toBe('新作者');
    expect(books.getBookById('b')?.title).toBe('书');

    // 保存后又有其他流程（翻译 / 同步）写入了新的卷章节
    await books.updateBook('b', { volumes: [{ id: 'v2', title: '新卷', chapters: [] }] });

    const toastCall = toast.add.mock.calls.find(
      ([message]) => typeof (message as { onRevert?: unknown }).onRevert === 'function',
    );
    if (!toastCall) throw new Error('保存后没有可撤销的提示');
    await (toastCall[0] as { onRevert: () => Promise<void> }).onRevert();

    const reverted = books.getBookById('b');
    expect(reverted?.author).toBe('作者');
    expect(reverted?.volumes?.map((volume) => volume.id)).toEqual(['v2']);
  });
});
