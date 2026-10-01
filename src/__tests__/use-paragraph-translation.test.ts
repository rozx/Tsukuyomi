import { afterEach, describe, expect, it } from 'bun:test';
import './setup';
import { computed, createApp, ref } from 'vue';
import type { App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ToastService from 'primevue/toastservice';
import { useParagraphTranslation } from '../composables/book-details/useParagraphTranslation';
import { useBooksStore } from '../stores/books';
import { useSettingsStore } from '../stores/settings';
import { useToastHistoryStore } from '../stores/toast-history';
import { ChapterContentService } from '../services/chapter-content-service';
import type { Chapter, Novel } from '../models/novel';

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
});

async function openEditor() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const books = useBooksStore();
  const chapter = ref<Chapter>({
    id: 'c',
    title: { original: '章', translation: { id: 'title', translation: '当前标题', aiModelId: '' } },
    createdAt: new Date(0),
    lastEdited: new Date(0),
    content: [
      {
        id: 'p',
        text: '原文',
        selectedTranslationId: 't1',
        translations: [
          { id: 't1', translation: '原译文', aiModelId: '' },
          { id: 't2', translation: '另一译文', aiModelId: '' },
        ],
      },
    ],
  });
  const book: Novel = {
    id: 'b',
    title: '书',
    createdAt: new Date(0),
    lastEdited: new Date(0),
    volumes: [{ id: 'v', title: '卷', chapters: [chapter.value] }],
  };
  await books.addBook(book);
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
  return { editor: editor!, chapter, books };
}

describe('useParagraphTranslation', () => {
  it('选择译文反馈使用当前界面语言，原有简中版本仍按书籍目标选用', async () => {
    const { books, chapter, editor } = await openEditor();
    await useSettingsStore().setUiLocale('en-US');
    await editor.selectParagraphTranslation('p', 't2');
    expect(chapter.value.content?.[0]?.selectedTranslationId).toBe('t2');
    expect(
      useToastHistoryStore().historyItems.find((item) => item.severity === 'success')?.summary,
    ).toBe('Translation selected');
    expect(books.getBookById('b')!.targetLanguage).toBe('zh-CN');
  });

  it('旧简中段落编辑及历史选择保存后可重载', async () => {
    const { editor } = await openEditor();
    expect(editor.currentlyEditingParagraphId.value).toBeNull();
    await editor.updateParagraphTranslation('p', '修改后的译文');
    await editor.selectParagraphTranslation('p', 't2');
    const saved = (await ChapterContentService.loadChapterContent('c'))![0]!;
    expect(saved.translations.find((value) => value.id === 't1')?.translation).toBe('修改后的译文');
    expect(saved.selectedTranslationId).toBe('t2');
    expect(saved.selectedTranslations?.['zh-CN']?.value).toBe('t2');
  });

  it('选择不存在的版本报错且正文保持不变', async () => {
    const { editor } = await openEditor();
    const before = await ChapterContentService.loadChapterContent('c');
    await editor.selectParagraphTranslation('p', 'missing');
    expect(await ChapterContentService.loadChapterContent('c')).toEqual(before);
    expect(useToastHistoryStore().historyItems.some((item) => item.severity === 'error')).toBe(
      true,
    );
  });

  it('内容回填保留当前标题和章节元信息，忽略其他章节', async () => {
    const { editor, chapter } = await openEditor();
    const originalTitle = chapter.value.title;
    editor.updateSelectedChapterWithContent([
      {
        id: 'v',
        title: '卷',
        chapters: [
          {
            ...chapter.value,
            title: '过期标题',
            content: [],
          },
        ],
      },
    ]);
    expect(chapter.value.title).toEqual(originalTitle);
    expect(chapter.value.content).toEqual([]);
    editor.updateSelectedChapterWithContent([
      { id: 'v', title: '卷', chapters: [{ ...chapter.value, id: 'other', content: [] }] },
    ]);
    expect(chapter.value.id).toBe('c');
  });
});
