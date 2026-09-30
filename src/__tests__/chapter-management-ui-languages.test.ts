import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { computed, createApp } from 'vue';
import type { App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useChapterManagement } from '../composables/book-details/useChapterManagement';
import { useSettingsStore } from '../stores/settings';
import { useBooksStore } from '../stores/books';
const toast = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('src/composables/useToastHistory', () => ({ useToastWithHistory: () => toast }));
let app: App | undefined;
afterEach(() => {
  app?.unmount();
  toast.add.mockClear();
});
describe('卷章操作界面反馈', () => {
  it('创建反馈使用UI语言但原标题和独立书籍目标保持', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    await useSettingsStore().setUiLocale('en-US');
    const books = useBooksStore();
    await books.addBook({
      id: 'b',
      title: '用户书名',
      targetLanguage: 'zh-CN',
      createdAt: new Date(),
      lastEdited: new Date(),
    });
    let management!: ReturnType<typeof useChapterManagement>;
    app = createApp({
      setup() {
        management = useChapterManagement(computed(() => books.getBookById('b')));
        return () => null;
      },
    });
    app.use(pinia).mount(document.createElement('div'));
    management.newVolumeTitle.value = '用户卷名';
    await management.handleAddVolume();
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({ summary: 'Added', detail: 'Added volume “用户卷名”' }),
    );
    expect(books.getBookById('b')!.targetLanguage).toBe('zh-CN');
  });
});
