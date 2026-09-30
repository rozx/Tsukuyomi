import { afterEach, describe, expect, it } from 'vitest';
import './setup';
import { computed, createApp } from 'vue';
import type { App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ToastService from 'primevue/toastservice';
import { useChapterManagement } from '../composables/book-details/useChapterManagement';
import { useBooksStore } from '../stores/books';
import { BookService } from '../services/book-service';
import { getNameTranslation } from '../services/localization/selection';
import { useToastHistoryStore } from '../stores/toast-history';
import type { Novel } from '../models/novel';

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
});
async function openEditor() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const books = useBooksStore();
  const title = {
    original: '原始标题',
    translation: { id: 'cn', translation: '简中标题', aiModelId: '' },
  };
  const book: Novel = {
    id: 'b',
    title: '书',
    targetLanguage: 'en-US',
    createdAt: new Date(0),
    lastEdited: new Date(0),
    volumes: [
      {
        id: 'v',
        title,
        chapters: [
          {
            id: 'c',
            title,
            createdAt: new Date(0),
            lastEdited: new Date(0),
            translationInstructions: '原指令',
          },
        ],
      },
    ],
  };
  await books.addBook(book);
  let editor: ReturnType<typeof useChapterManagement> | undefined;
  app = createApp({
    setup() {
      editor = useChapterManagement(computed(() => books.getBookById('b')));
      return () => null;
    },
  });
  app.use(pinia).use(ToastService).mount(document.createElement('div'));
  return { books, editor: editor! };
}

describe('卷章译名表单', () => {
  it('编辑期间目标改变拒绝旧表单，章节英文保存和设置更新可重载', async () => {
    const { books, editor } = await openEditor();
    const chapter = books.getBookById('b')!.volumes![0]!.chapters![0]!;
    editor.openEditChapterDialog(chapter);
    expect(editor.editingChapterTranslation.value).toBe('');
    editor.editingChapterTranslation.value = 'English chapter';
    await books.updateBook('b', { targetLanguage: 'zh-TW' });
    await editor.handleEditChapter();
    let saved = (await BookService.getBookById('b'))!;
    expect(
      getNameTranslation(
        saved.volumes![0]!.chapters![0]!.title as {
          translation: { id: string; translation: string; aiModelId: string };
        },
        'zh-TW',
      ),
    ).toBeUndefined();
    expect(editor.showEditChapterDialog.value).toBe(true);
    await books.updateBook('b', { targetLanguage: 'en-US' });
    editor.openEditChapterDialog(books.getBookById('b')!.volumes![0]!.chapters![0]!);
    editor.editingChapterTranslation.value = 'English chapter';
    editor.editingChapterTranslationInstructions.value = 'New instruction';
    await editor.handleEditChapter();
    saved = (await BookService.getBookById('b'))!;
    expect(
      getNameTranslation(
        saved.volumes![0]!.chapters![0]!.title as {
          translation: { id: string; translation: string; aiModelId: string };
        },
        'en-US',
      )?.translation,
    ).toBe('English chapter');
    expect(saved.volumes![0]!.chapters![0]!.translationInstructions).toBe('New instruction');
  });
  it('缺失英文时表单留空，英文保存及撤销保留简中与范围外修改', async () => {
    const { books, editor } = await openEditor();
    editor.openEditVolumeDialog(books.getBookById('b')!.volumes![0]!);
    expect(editor.editingVolumeTranslation.value).toBe('');
    editor.editingVolumeTranslation.value = 'English volume';
    await editor.handleEditVolume();
    let title = (await BookService.getBookById('b'))!.volumes![0]!.title as {
      original: string;
      translation: { id: string; translation: string; aiModelId: string };
    };
    expect(getNameTranslation(title, 'en-US')?.translation).toBe('English volume');
    expect(getNameTranslation(title, 'zh-CN')?.translation).toBe('简中标题');
    const id = useToastHistoryStore().historyItems[0]!.id;
    await BookService.editTitle('b', 'zh-CN', {
      kind: 'volume',
      id: 'v',
      expectedOriginal: '原始标题',
      translation: '新的简中标题',
    });
    await useToastHistoryStore().revert(id);
    title = (await BookService.getBookById('b'))!.volumes![0]!.title as typeof title;
    expect(getNameTranslation(title, 'en-US')).toBeUndefined();
    expect(getNameTranslation(title, 'zh-CN')?.translation).toBe('新的简中标题');
  });
});
