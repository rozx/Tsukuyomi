import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp } from 'vue';
import type { App } from 'vue';
import ToastService from 'primevue/toastservice';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useSettingsStore } from '../stores/settings';
import { useBooksStore } from '../stores/books';
import { useToastHistoryStore } from '../stores/toast-history';
import { BookService } from '../services/book-service';
import { provideBookDetailsPage } from '../composables/book-details/useBookDetailsPage';
let app: App | undefined;
afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
});
describe('书籍详情显示格式', () => {
  it('实际保存书籍翻译设置使用英文反馈，原书籍目标不变', async () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
    const pinia = createPinia();
    setActivePinia(pinia);
    await useSettingsStore().setUiLocale('en-US');
    await useBooksStore().addBook({
      id: 'b',
      title: '用户书名',
      targetLanguage: 'zh-CN',
      createdAt: new Date(),
      lastEdited: new Date(),
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
    await details.handleSaveChapterSettings({ preserveIndents: false });
    expect(useToastHistoryStore().historyItems).toContainEqual(
      expect.objectContaining({ summary: 'Saved', detail: 'Saved Book settings' }),
    );
    const saved = (await BookService.getBookById('b'))!;
    expect(saved.targetLanguage).toBe('zh-CN');
    expect(saved.preserveIndents).toBe(false);
  });

  it('详情数量格式随界面语言更新', async () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
    const pinia = createPinia();
    setActivePinia(pinia);
    await useSettingsStore().setUiLocale('en-US');
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:path(.*)*', component: { render: () => null } }],
    });
    await router.push('/books/no-book');
    let details!: ReturnType<typeof provideBookDetailsPage>;
    app = createApp({
      setup() {
        details = provideBookDetailsPage();
        return () => null;
      },
    });
    app.use(pinia).use(router).use(ToastService).mount(document.createElement('div'));
    expect(details.formatWordCount(15000)).toBe('15.0k');
    const modes = details.editModeOptions as unknown as {
      value: Array<{ title: string; value: string }>;
    };
    expect(modes.value[0]!.title).toBe('Edit original');
    await useSettingsStore().setUiLocale('zh-TW');
    expect(details.formatWordCount(15000)).toBe('1.5萬');
    expect(modes.value[0]!.title).toBe('原文編輯');
  });
});
