import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { ref } from 'vue';
import { useChatActionHandler } from '../composables/chat/useChatActionHandler';
import { useContextStore } from '../stores/context';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { BookService } from '../services/book-service';
import { ChapterContentService } from '../services/chapter-content-service';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { getLanguageTranslation } from '../services/localization/selection';
import type { ActionInfo } from '../services/ai/tools/types';
import type { ChatSessionMessage, MessageAction } from '../stores/chat-sessions';
afterEach(() => vi.restoreAllMocks());
async function setup() {
  const chapter = translationChapter('a', '11111111');
  chapter.content![0]!.translations = [
    { id: 'en', translation: 'English after', language: 'en-US', aiModelId: '' },
    { id: 'cn', translation: 'CN before', language: 'zh-CN', aiModelId: '' },
  ];
  chapter.content![0]!.selectedTranslationId = 'cn';
  chapter.content![0]!.selectedTranslations = {
    'en-US': { value: 'en', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
    'zh-CN': { value: 'cn', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
  };
  const fixture = await chapterTranslationFixture([chapter]);
  const other = translationChapter('b', '11111111');
  other.content![0]!.translations = [
    { id: 'en', translation: 'Other book', language: 'en-US', aiModelId: '' },
  ];
  other.content![0]!.selectedTranslations = {
    'en-US': { value: 'en', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
  };
  await fixture.books.addBook({
    id: 'other',
    title: 'Other',
    targetLanguage: 'en-US',
    volumes: [{ id: 'vb', title: '', chapters: [other] }],
    createdAt: new Date(0),
    lastEdited: new Date(0),
  });
  await fixture.books.refreshBookFromStorage('other', 'b');
  useContextStore().setCurrentBook('other');
  const add = vi.fn();
  const handler = useChatActionHandler(
    { push: vi.fn() } as never,
    { add },
    () => {},
    () => {},
    ref<ChatSessionMessage[]>([{ id: 'message', role: 'assistant', content: '', timestamp: 0 }]),
    ref<MessageAction[]>([]),
    () => {},
    () => 0,
  );
  return { handler, add, books: fixture.books };
}
const execution = { bookId: 'fixture-book', languages: captureExecutionLanguages('en-US') };
const previous = {
  id: 'en',
  translation: 'English before',
  language: 'en-US' as const,
  aiModelId: '',
};
async function checkSaved() {
  const content = (await ChapterContentService.loadChapterContent('a'))![0]!;
  expect(getLanguageTranslation(content, 'en-US')?.translation).toBe('English before');
  expect(getLanguageTranslation(content, 'zh-CN')?.translation).toBe('CN latest');
  expect(
    (await ChapterContentService.loadChapterContent('b'))![0]!.translations[0]?.translation,
  ).toBe('Other book');
  expect((await BookService.getBookById('fixture-book'))?.targetLanguage).toBe('zh-TW');
}
describe('聊天译文操作撤销', () => {
  for (const kind of ['single', 'batch'] as const) {
    it(`${kind} 在其他书籍中展示后仍撤销原书英文，并保留最新简中与目标`, async () => {
      const { handler, add, books } = await setup();
      const action: ActionInfo =
        kind === 'single'
          ? {
              type: 'update',
              entity: 'translation',
              execution,
              data: {
                paragraph_id: '11111111',
                chapter_id: 'a',
                original_text: 'source 11111111',
                translation_id: 'en',
                old_translation: 'English before',
                new_translation: 'English after',
              },
              previousData: previous,
            }
          : {
              type: 'update',
              entity: 'translation',
              execution,
              data: {
                tool_name: 'batch_replace_translations',
                replaced_paragraph_count: 1,
                replaced_translation_count: 1,
                replacement_text: 'after',
              },
              previousData: {
                replaced_paragraphs: [
                  {
                    paragraph_id: '11111111',
                    chapter_id: 'a',
                    original_text: 'source 11111111',
                    old_selected_translation_id: 'en',
                    old_translations: [previous],
                  },
                ],
              },
            };
      handler.handleAction(action, { value: 'message' });
      const revert = add.mock.calls
        .map(([value]) => value.onRevert)
        .find(Boolean) as () => Promise<void>;
      expect(revert).toBeTypeOf('function');
      await books.updateBook('fixture-book', { targetLanguage: 'zh-TW' });
      await BookService.editParagraphTranslations('fixture-book', 'a', 'zh-CN', [
        {
          type: 'update',
          paragraphId: '11111111',
          originalText: 'source 11111111',
          translationId: 'cn',
          text: 'CN latest',
        },
      ]);
      await revert();
      await checkSaved();
    });
  }
});
