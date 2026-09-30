import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, createApp, ref } from 'vue';
import type { App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ToastService from 'primevue/toastservice';
import './setup';
import type { Novel, Paragraph } from '../models/novel';
import { BookService } from '../services/book-service';
import { ChapterContentService } from '../services/chapter-content-service';
import { useBooksStore } from '../stores/books';
import { useSettingsStore } from '../stores/settings';
import { useParagraphTranslation } from '../composables/book-details/useParagraphTranslation';
import { useSearchReplace } from '../composables/book-details/useSearchReplace';
import { useToastHistoryStore } from '../stores/toast-history';

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
});

const paragraph: Paragraph = {
  id: 'p',
  text: '原文',
  selectedTranslationId: 'cn',
  translations: [
    { id: 'cn', translation: '中文', language: 'zh-CN', aiModelId: '' },
    { id: 'en', translation: 'English', language: 'en-US', aiModelId: '' },
    { id: 'en2', translation: 'English two', language: 'en-US', aiModelId: '' },
  ],
  selectedTranslations: {
    'zh-CN': { value: 'cn', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
    'en-US': { value: 'en', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
  },
};
const initial: Novel = {
  id: 'b',
  title: '书',
  targetLanguage: 'en-US',
  createdAt: new Date(0),
  lastEdited: new Date(0),
  volumes: [
    {
      id: 'v',
      title: '卷',
      chapters: [
        {
          id: 'c',
          title: '章',
          createdAt: new Date(0),
          lastEdited: new Date(0),
          content: [paragraph],
        },
      ],
    },
  ],
};

describe('目标语言段落编辑事务', () => {
  it('不支持的写入语言在持久化前被拒绝', async () => {
    await BookService.saveBook(initial);
    await expect(
      BookService.editParagraphTranslations('b', 'c', 'fr-FR' as never, [
        {
          type: 'select',
          paragraphId: 'p',
          originalText: '原文',
          translationId: null,
        },
      ]),
    ).rejects.toThrow('INVALID_LOCALE');
    expect((await ChapterContentService.loadChapterContent('c'))![0]!.translations).toEqual(
      paragraph.translations,
    );
  });
  it('持久化拒绝旧原文时，单次替换不报告成功', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const books = useBooksStore();
    await books.addBook(initial);
    const chapter = ref(initial.volumes![0]!.chapters![0]!);
    let search: ReturnType<typeof useSearchReplace> | undefined;
    app = createApp({
      setup() {
        const book = computed(() => books.getBookById('b'));
        const editor = useParagraphTranslation(book, chapter);
        search = useSearchReplace(
          book,
          chapter,
          computed(() => chapter.value.content ?? []),
          editor.updateParagraphTranslation,
        );
        return () => null;
      },
    });
    app.use(pinia).use(ToastService).mount(document.createElement('div'));
    search!.searchQuery.value = 'English';
    search!.replaceQuery.value = 'Rejected';
    search!.currentSearchMatchIndex.value = 0;
    await ChapterContentService.saveChapterContent(
      'c',
      [
        {
          ...paragraph,
          text: '修订后的原文',
          translations: [],
          selectedTranslations: {},
          selectedTranslationId: '',
        },
      ],
      { bookId: 'b' },
    );
    await search!.replaceCurrent();
    expect(useToastHistoryStore().historyItems.some((item) => item.severity === 'success')).toBe(
      false,
    );
    expect((await ChapterContentService.loadChapterContent('c'))![0]!.text).toBe('修订后的原文');
  });
  it('搜索与批量替换仅命中当前语言，保存不修改其他语言', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    await useSettingsStore().setUiLocale('en-US');
    const books = useBooksStore();
    const other: Paragraph = {
      id: 'other',
      text: '别的原文',
      selectedTranslationId: '',
      translations: [
        { id: 'other-en', translation: 'Untouched', language: 'en-US', aiModelId: '' },
      ],
      selectedTranslations: {
        'en-US': { value: 'other-en', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
      },
    };
    const withOther = {
      ...initial,
      volumes: initial.volumes!.map((volume) => ({
        ...volume,
        chapters: volume.chapters!.map((chapter) => ({ ...chapter, content: [paragraph, other] })),
      })),
    };
    await books.addBook(withOther);
    const chapter = ref(withOther.volumes![0]!.chapters![0]!);
    const saveState = vi.fn();
    let search: ReturnType<typeof useSearchReplace> | undefined;
    app = createApp({
      setup() {
        const book = computed(() => books.getBookById('b'));
        const editor = useParagraphTranslation(book, chapter);
        search = useSearchReplace(
          book,
          chapter,
          computed(() => chapter.value.content ?? []),
          editor.updateParagraphTranslation,
          editor.currentlyEditingParagraphId,
          saveState,
          editor.updateSelectedChapterWithContent,
        );
        return () => null;
      },
    });
    app.use(pinia).use(ToastService).mount(document.createElement('div'));
    search!.searchQuery.value = '中文';
    expect(search!.searchMatches.value).toEqual([]);
    search!.searchQuery.value = 'English';
    search!.replaceQuery.value = 'Replaced';
    expect(search!.searchMatches.value).toHaveLength(1);
    await BookService.editParagraphTranslations('b', 'c', 'en-US', [
      {
        type: 'update',
        paragraphId: 'other',
        originalText: '别的原文',
        translationId: 'other-en',
        text: 'Concurrent change outside matches',
      },
    ]);
    await search!.replaceAll();
    expect(saveState).toHaveBeenCalledWith('Replace all');
    expect(
      useToastHistoryStore().historyItems.some((item) => item.summary === 'Replaced 1 match'),
    ).toBe(true);
    const saved = (await ChapterContentService.loadChapterContent('c'))![0]!;
    expect(saved.translations.find((value) => value.id === 'en')?.translation).toBe('Replaced');
    expect(saved.translations.find((value) => value.id === 'en2')?.translation).toBe('English two');
    expect(saved.translations.find((value) => value.id === 'cn')?.translation).toBe('中文');
    const outside = (await ChapterContentService.loadChapterContent('c'))!.find(
      (value) => value.id === 'other',
    )!;
    expect(outside.translations[0]?.translation).toBe('Concurrent change outside matches');
  });
  it('歧义语言版本或第二项失败时，整次编辑回滚', async () => {
    await BookService.saveBook(initial);
    await expect(
      BookService.editParagraphTranslations('b', 'c', 'en-US', [
        {
          type: 'update',
          paragraphId: 'p',
          originalText: '原文',
          translationId: 'en',
          text: 'Must roll back',
        },
        { type: 'select', paragraphId: 'p', originalText: '原文', translationId: 'cn' },
      ]),
    ).rejects.toThrow('TRANSLATION_LANGUAGE_MISMATCH');
    const saved = (await ChapterContentService.loadChapterContent('c'))![0]!;
    expect(saved.translations.find((value) => value.id === 'en')?.translation).toBe('English');
    expect(saved.selectedTranslations?.['en-US']?.value).toBe('en');
  });

  it('表单旧目标或旧原文不能覆盖最新数据', async () => {
    await BookService.saveBook(initial);
    await expect(
      BookService.editParagraphTranslations(
        'b',
        'c',
        'zh-CN',
        [{ type: 'select', paragraphId: 'p', originalText: '原文', translationId: 'cn' }],
        'zh-CN',
      ),
    ).rejects.toThrow('BOOK_TARGET_LANGUAGE_CHANGED');
    await expect(
      BookService.editParagraphTranslations('b', 'c', 'en-US', [
        {
          type: 'update',
          paragraphId: 'p',
          originalText: '已经过期的原文',
          translationId: 'en',
          text: 'Old draft',
        },
      ]),
    ).rejects.toThrow('PARAGRAPH_SOURCE_CHANGED');
    expect((await ChapterContentService.loadChapterContent('c'))![0]!.translations).toEqual(
      paragraph.translations,
    );
  });

  it('并发编辑各语言选用不会互相覆盖，无效段落和空输入不改变正文', async () => {
    await BookService.saveBook(initial);
    await Promise.all([
      BookService.editParagraphTranslations('b', 'c', 'zh-CN', [
        { type: 'select', paragraphId: 'p', originalText: '原文', translationId: null },
      ]),
      BookService.editParagraphTranslations('b', 'c', 'en-US', [
        { type: 'select', paragraphId: 'p', originalText: '原文', translationId: 'en2' },
      ]),
    ]);
    const saved = (await ChapterContentService.loadChapterContent('c'))![0]!;
    expect(saved.selectedTranslations?.['zh-CN']?.value).toBeNull();
    expect(saved.selectedTranslations?.['en-US']?.value).toBe('en2');
    expect(saved.selectedTranslationId).toBe('');
    await expect(
      BookService.editParagraphTranslations('b', 'c', 'en-US', [
        { type: 'select', paragraphId: 'missing', originalText: '', translationId: 'en' },
      ]),
    ).rejects.toThrow('PARAGRAPH_NOT_FOUND');
    await BookService.editParagraphTranslations('b', 'c', 'en-US', []);
    expect((await ChapterContentService.loadChapterContent('c'))![0]).toEqual(saved);
  });
  it('手动编辑入口修改英文选用版本，历史选择只改变英文槽', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const books = useBooksStore();
    await books.addBook(initial);
    const chapter = ref(initial.volumes![0]!.chapters![0]!);
    let editor: ReturnType<typeof useParagraphTranslation> | undefined;
    app = createApp({
      setup() {
        editor = useParagraphTranslation(
          computed(() => books.getBookById('b')),
          chapter,
        );
        return () => null;
      },
    });
    app.use(pinia).use(ToastService).mount(document.createElement('div'));
    await editor!.updateParagraphTranslation('p', 'Edited selected English');
    const edited = (await ChapterContentService.loadChapterContent('c'))![0]!;
    expect(edited.translations.find((value) => value.id === 'en')?.translation).toBe(
      'Edited selected English',
    );
    expect(edited.translations.find((value) => value.id === 'cn')?.translation).toBe('中文');
    await editor!.selectParagraphTranslation('p', 'en2');
    const selected = (await ChapterContentService.loadChapterContent('c'))![0]!;
    expect(selected.selectedTranslations?.['en-US']?.value).toBe('en2');
    expect(selected.selectedTranslationId).toBe('cn');
  });
  it('修改英文版本与英文选用后重载，简中版本及选用保留', async () => {
    await BookService.saveBook(initial);
    await BookService.editParagraphTranslations(
      'b',
      'c',
      'en-US',
      [
        {
          type: 'update',
          paragraphId: 'p',
          originalText: '原文',
          translationId: 'en2',
          text: 'Edited English',
        },
        { type: 'select', paragraphId: 'p', originalText: '原文', translationId: 'en2' },
      ],
      'en-US',
    );
    const saved = (await ChapterContentService.loadChapterContent('c'))![0]!;
    expect(saved.translations.find((value) => value.id === 'en2')?.translation).toBe(
      'Edited English',
    );
    expect(saved.translations.find((value) => value.id === 'cn')?.translation).toBe('中文');
    expect(saved.selectedTranslations?.['en-US']?.value).toBe('en2');
    expect(saved.selectedTranslationId).toBe('cn');
    expect((await BookService.getBookById('b'))?.targetLanguage).toBe('en-US');
  });
});
