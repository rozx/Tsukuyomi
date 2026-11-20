import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, type App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ToastService from 'primevue/toastservice';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { Chapter, Novel } from '../models/novel';
import { ChapterService } from '../services/chapter-service';
import { useBookDetailsStore } from '../stores/book-details';
import { useBooksStore } from '../stores/books';
import { provideBookDetailsPage } from '../composables/book-details/useBookDetailsPage';

let app: App | undefined;

describe('跨章节段落导航目标（pendingParagraphTarget）', () => {
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('页面已停在旧章节时，切往需异步懒加载的新章节并定位段落时不得提前丢弃目标', async () => {
    const now = new Date();
    const ch1: Chapter = {
      id: 'ch-old',
      title: { original: '第一章', translation: { id: 't1', translation: '', aiModelId: '' } },
      contentLoaded: true,
      content: [
        { id: 'old-p1', text: '旧章第一段', selectedTranslationId: '', translations: [] },
        { id: 'old-p2', text: '旧章第二段', selectedTranslationId: '', translations: [] },
      ],
      createdAt: now,
      lastEdited: now,
    };
    const ch2Meta: Chapter = {
      id: 'ch-new',
      title: { original: '第二章', translation: { id: 't2', translation: '', aiModelId: '' } },
      contentLoaded: false,
      createdAt: now,
      lastEdited: now,
    };
    const ch2Loaded: Chapter = {
      ...ch2Meta,
      contentLoaded: true,
      content: [
        { id: 'new-p0', text: '新章第零段', selectedTranslationId: '', translations: [] },
        { id: 'new-p1', text: '新章第一段', selectedTranslationId: '', translations: [] },
        { id: 'new-p2', text: '新章第二段', selectedTranslationId: '', translations: [] },
      ],
    };

    const book: Novel = {
      id: 'book-nav-1',
      title: '导航测试书',
      volumes: [
        {
          id: 'vol-1',
          title: { original: '第一卷', translation: { id: 'vt1', translation: '', aiModelId: '' } },
          chapters: [ch1, ch2Meta],
        },
      ],
      createdAt: now,
      lastEdited: now,
    };

    let resolveCh2!: (ch: Chapter) => void;
    vi.spyOn(ChapterService, 'loadChapterContent').mockImplementation((ch) => {
      if (ch.id === 'ch-new') {
        return new Promise<Chapter>((resolve) => {
          resolveCh2 = resolve;
        });
      }
      return Promise.resolve(ch);
    });

    const pinia = createPinia();
    setActivePinia(pinia);
    const booksStore = useBooksStore();
    await booksStore.loadBooks();
    await booksStore.addBook(book);
    // addBook 会把内存中的 chapter.content 卸载或写入存储，确保 ch2Meta 无 content 以触发懒加载
    const storedBook = booksStore.getBookById('book-nav-1')!;
    storedBook.volumes![0]!.chapters![0]!.content = ch1.content;
    storedBook.volumes![0]!.chapters![0]!.contentLoaded = true;
    delete storedBook.volumes![0]!.chapters![1]!.content;
    storedBook.volumes![0]!.chapters![1]!.contentLoaded = false;

    const bookDetailsStore = useBookDetailsStore();
    bookDetailsStore.setSelectedChapter('book-nav-1', 'ch-old');

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/books/:id', component: { render: () => null } }],
    });
    await router.push('/books/book-nav-1');

    let details!: ReturnType<typeof provideBookDetailsPage>;
    app = createApp({
      setup() {
        details = provideBookDetailsPage();
        return () => null;
      },
    });
    app.use(pinia).use(router).use(ToastService).mount(document.createElement('div'));

    const scrolledTo: number[] = [];
    details.registerChapterScroller((index) => {
      scrolledTo.push(index);
    });

    // 先等待旧章节内容稳定加载在页面上
    await vi.waitFor(() => {
      expect(details.selectedChapterParagraphs.value.map((p) => p.id)).toEqual([
        'old-p1',
        'old-p2',
      ]);
    });

    // 模拟 navigate_to({ target: 'paragraph', book_id: 'book-nav-1', chapter_id: 'ch-new', paragraph_id: 'new-p2' })
    bookDetailsStore.setSelectedChapter('book-nav-1', 'ch-new');
    bookDetailsStore.requestParagraphNavigation({
      bookId: 'book-nav-1',
      chapterId: 'ch-new',
      paragraphId: 'new-p2',
    });

    // 在新章节尚未加载完成前，待定位目标必须仍保留（不能因旧章节段落列表中找不到 new-p2 就被清空）
    await Promise.resolve();
    await Promise.resolve();
    expect(bookDetailsStore.pendingParagraphTarget).not.toBeNull();

    // 放行异步加载的 ch-new 内容
    resolveCh2(ch2Loaded);

    await vi.waitFor(() => {
      expect(details.selectedParagraphIndex.value).toBe(2);
    });
    expect(scrolledTo).toContain(2);
    expect(bookDetailsStore.pendingParagraphTarget).toBeNull();
  });

  it('目标章节加载为空或加载失败时应清除待定位目标，避免后续意外跳转', async () => {
    const now = new Date();
    const emptyCh: Chapter = {
      id: 'ch-empty',
      title: { original: '空章', translation: { id: 'te', translation: '', aiModelId: '' } },
      contentLoaded: false,
      createdAt: now,
      lastEdited: now,
    };
    const book: Novel = {
      id: 'book-nav-empty',
      title: '空章测试书',
      volumes: [
        {
          id: 'vol-e',
          title: { original: '第一卷', translation: { id: 'vte', translation: '', aiModelId: '' } },
          chapters: [emptyCh],
        },
      ],
      createdAt: now,
      lastEdited: now,
    };

    vi.spyOn(ChapterService, 'loadChapterContent').mockResolvedValue({
      ...emptyCh,
      contentLoaded: true,
      content: [],
    });

    const pinia = createPinia();
    setActivePinia(pinia);
    const booksStore = useBooksStore();
    await booksStore.loadBooks();
    await booksStore.addBook(book);

    const bookDetailsStore = useBookDetailsStore();
    bookDetailsStore.setSelectedChapter('book-nav-empty', 'ch-empty');
    bookDetailsStore.requestParagraphNavigation({
      bookId: 'book-nav-empty',
      chapterId: 'ch-empty',
      paragraphId: 'missing-p',
    });

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/books/:id', component: { render: () => null } }],
    });
    await router.push('/books/book-nav-empty');

    app = createApp({
      setup() {
        provideBookDetailsPage();
        return () => null;
      },
    });
    app.use(pinia).use(router).use(ToastService).mount(document.createElement('div'));

    await vi.waitFor(() => {
      expect(bookDetailsStore.pendingParagraphTarget).toBeNull();
    });
  });
});
