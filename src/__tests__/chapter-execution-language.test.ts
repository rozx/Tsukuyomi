import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { computed, createApp, ref } from 'vue';
import type { App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ToastService from 'primevue/toastservice';
import { useBooksStore } from '../stores/books';
import { useAIModelsStore } from '../stores/ai-models';
import { useChapterTranslation } from '../composables/book-details/useChapterTranslation';
import { AIServiceFactory } from '../services/ai/ai-service-factory';
import { BookService } from '../services/book-service';
import { ChapterContentService } from '../services/chapter-content-service';
import type { AIModel } from '../services/ai/types/ai-model';
import type { AIServiceConfig, TextGenerationRequest } from '../services/ai/types/ai-service';
import type { Chapter, Novel, Paragraph } from '../models/novel';

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
});
describe('章节操作执行语言', () => {
  it('批次润色工具循环冻结目标，运行中改目标后不会把结果写入简中', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const enabled = { enabled: true, temperature: 0.7 };
    const model: AIModel = {
      id: 'm',
      name: 'Fixture',
      provider: 'openai',
      model: 'fixture',
      enabled: true,
      apiKey: '',
      baseUrl: '',
      temperature: 0.7,
      maxInputTokens: 10000,
      maxOutputTokens: 1000,
      limitsSource: 'manual',
      lastEdited: new Date(0),
      isDefault: {
        translation: enabled,
        proofreading: enabled,
        termsTranslation: enabled,
        assistant: enabled,
      },
    };
    useAIModelsStore().models = [model];
    const paragraph: Paragraph = {
      id: '11111111',
      text: 'source',
      selectedTranslationId: 'cn',
      translations: [
        { id: 'cn', translation: 'CN_ONLY', aiModelId: '' },
        { id: 'en', translation: 'EN_ONLY', language: 'en-US', aiModelId: '' },
      ],
      selectedTranslations: {
        'en-US': { value: 'en', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
      },
    };
    const chapter: Chapter = {
      id: 'c',
      title: '',
      createdAt: new Date(0),
      lastEdited: new Date(0),
      content: [paragraph],
    };
    const books = useBooksStore();
    await books.addBook({
      id: 'b',
      title: '书',
      targetLanguage: 'en-US',
      createdAt: new Date(0),
      lastEdited: new Date(0),
      volumes: [{ id: 'v', title: '卷', chapters: [chapter] }],
    });
    const loaded = ref<Chapter | null>(chapter);
    let translation: ReturnType<typeof useChapterTranslation> | undefined;
    app = createApp({
      setup() {
        translation = useChapterTranslation(
          computed(() => books.getBookById('b')),
          loaded,
          loaded,
          computed(() => loaded.value?.content ?? []),
          () => {},
          () => {},
          () => ({ terms: 0, characters: 0 }),
          () => {},
        );
        return () => null;
      },
    });
    app.use(pinia).use(ToastService).mount(document.createElement('div'));
    let turn = 0;
    const submitted: string[] = [];
    const call = (name: string, args: unknown) => ({
      id: `call-${turn}`,
      type: 'function',
      function: { name, arguments: JSON.stringify(args) },
    });
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: async (_config: AIServiceConfig, request: TextGenerationRequest) => {
        turn++;
        if (turn === 1 || turn === 5) return { text: '', toolCalls: [call('list_todos', {})] };
        if (turn === 2 || turn === 6) {
          const message = [...request.messages!].reverse().find((value) => value.role === 'tool')!;
          const data = JSON.parse(message.content as string);
          const ids = data.todos
            .filter((todo: { status: string }) => todo.status !== 'done')
            .map((todo: { id: string }) => todo.id);
          return { text: '', toolCalls: [call('mark_todo_done', { ids })] };
        }
        if (turn === 3)
          return { text: '', toolCalls: [call('update_task_status', { status: 'working' })] };
        if (turn === 4) {
          submitted.push(
            request
              .messages!.filter((value) => value.role === 'user')
              .map((value) => String(value.content))
              .join('\n'),
          );
          await books.updateBook('b', { targetLanguage: 'zh-TW' });
          return {
            text: '',
            toolCalls: [
              call('add_translation_batch', {
                paragraphs: [
                  {
                    paragraph_id: '11111111',
                    original_text_prefix: 'source',
                    translated_text: 'Bulk English',
                  },
                ],
              }),
            ],
          };
        }
        if (turn === 7)
          return { text: '', toolCalls: [call('update_task_status', { status: 'end' })] };
        if (turn > 12) throw new Error('UNEXPECTED_LOOP');
        return { text: 'DONE' };
      },
    } as never);
    await translation!.polishAllParagraphs();
    const saved = (await ChapterContentService.loadChapterContent('c'))![0]!;
    expect(
      saved.translations.some(
        (value) => value.translation === 'Bulk English' && value.language === 'en-US',
      ),
    ).toBe(true);
    expect(saved.translations.find((value) => value.id === 'cn')?.translation).toBe('CN_ONLY');
    expect(submitted.join('\n')).toContain('EN_ONLY');
    expect((await BookService.getBookById('b'))?.targetLanguage).toBe('zh-TW');
  });
  it('全章翻译每批保存冻结语言，收尾不回存旧章节快照', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const enabled = { enabled: true, temperature: 0.7 };
    const model: AIModel = {
      id: 'm',
      name: 'Fixture',
      provider: 'openai',
      model: 'fixture',
      enabled: true,
      apiKey: '',
      baseUrl: '',
      temperature: 0.7,
      maxInputTokens: 10000,
      maxOutputTokens: 1000,
      limitsSource: 'manual',
      lastEdited: new Date(0),
      isDefault: {
        translation: enabled,
        proofreading: enabled,
        termsTranslation: enabled,
        assistant: enabled,
      },
    };
    useAIModelsStore().models = [model];
    const paragraph: Paragraph = {
      id: '11111111',
      text: 'source',
      selectedTranslationId: 'cn',
      translations: [
        { id: 'cn', translation: 'CN_ONLY', aiModelId: '' },
        { id: 'en', translation: 'EN_ONLY', language: 'en-US', aiModelId: '' },
      ],
      selectedTranslations: {
        'en-US': { value: 'en', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
      },
    };
    const chapter: Chapter = {
      id: 'c',
      title: '',
      createdAt: new Date(0),
      lastEdited: new Date(0),
      content: [paragraph],
    };
    const books = useBooksStore();
    await books.addBook({
      id: 'b',
      title: '书',
      targetLanguage: 'en-US',
      createdAt: new Date(0),
      lastEdited: new Date(0),
      volumes: [{ id: 'v', title: '卷', chapters: [chapter] }],
    });
    const loaded = ref<Chapter | null>(chapter);
    let translation: ReturnType<typeof useChapterTranslation> | undefined;
    app = createApp({
      setup() {
        translation = useChapterTranslation(
          computed(() => books.getBookById('b')),
          loaded,
          loaded,
          computed(() => loaded.value?.content ?? []),
          () => {},
          () => {},
          () => ({ terms: 0, characters: 0 }),
          () => {},
        );
        return () => null;
      },
    });
    app.use(pinia).use(ToastService).mount(document.createElement('div'));
    let turn = 0;
    const submitted: string[] = [];
    const call = (name: string, args: unknown) => ({
      id: `call-${turn}`,
      type: 'function',
      function: { name, arguments: JSON.stringify(args) },
    });
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: async (_config: AIServiceConfig, request: TextGenerationRequest) => {
        turn++;
        if (turn === 1 || turn === 5 || turn === 8)
          return { text: '', toolCalls: [call('list_todos', {})] };
        if (turn === 2 || turn === 6 || turn === 9) {
          const message = [...request.messages!].reverse().find((value) => value.role === 'tool')!;
          const data = JSON.parse(message.content as string);
          const ids = data.todos
            .filter((todo: { status: string }) => todo.status !== 'done')
            .map((todo: { id: string }) => todo.id);
          return { text: '', toolCalls: [call('mark_todo_done', { ids })] };
        }
        if (turn === 3)
          return { text: '', toolCalls: [call('update_task_status', { status: 'working' })] };
        if (turn === 4) {
          submitted.push(
            request
              .messages!.filter((value) => value.role === 'user')
              .map((value) => String(value.content))
              .join('\n'),
          );
          await books.updateBook('b', { targetLanguage: 'zh-TW' });
          return {
            text: '',
            toolCalls: [
              call('add_translation_batch', {
                paragraphs: [
                  {
                    paragraph_id: '11111111',
                    original_text_prefix: 'source',
                    translated_text: 'Bulk English',
                  },
                ],
              }),
            ],
          };
        }
        if (turn === 7)
          return { text: '', toolCalls: [call('update_task_status', { status: 'review' })] };
        if (turn === 10)
          return { text: '', toolCalls: [call('update_task_status', { status: 'end' })] };
        if (turn > 12) throw new Error('UNEXPECTED_LOOP');
        return { text: 'DONE' };
      },
    } as never);
    await translation!.translateAllParagraphs();
    const saved = (await ChapterContentService.loadChapterContent('c'))![0]!;
    expect(
      saved.translations.some(
        (value) => value.translation === 'Bulk English' && value.language === 'en-US',
      ),
    ).toBe(true);
    expect(saved.translations.find((value) => value.id === 'cn')?.translation).toBe('CN_ONLY');
    expect(submitted.join('\n')).toContain('source');
    expect((await BookService.getBookById('b'))?.targetLanguage).toBe('zh-TW');
  });
  it('单段 UI 执行冻结英文目标，切目标后工具回调仍保存英文', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const enabled = { enabled: true, temperature: 0.7 };
    const model: AIModel = {
      id: 'm',
      name: 'Fixture',
      provider: 'openai',
      model: 'fixture',
      enabled: true,
      apiKey: '',
      baseUrl: '',
      temperature: 0.7,
      maxInputTokens: 10000,
      maxOutputTokens: 1000,
      limitsSource: 'manual',
      lastEdited: new Date(0),
      isDefault: {
        translation: enabled,
        proofreading: enabled,
        termsTranslation: enabled,
        assistant: enabled,
      },
    };
    useAIModelsStore().models = [model];
    const paragraph: Paragraph = {
      id: '11111111',
      text: 'source',
      selectedTranslationId: 'cn',
      translations: [
        { id: 'cn', translation: 'CN_ONLY', aiModelId: '' },
        { id: 'en', translation: 'EN_ONLY', language: 'en-US', aiModelId: '' },
      ],
      selectedTranslations: {
        'en-US': { value: 'en', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
      },
    };
    const chapter: Chapter = {
      id: 'c',
      title: '章',
      createdAt: new Date(0),
      lastEdited: new Date(0),
      content: [paragraph],
    };
    const book: Novel = {
      id: 'b',
      title: '书',
      targetLanguage: 'en-US',
      createdAt: new Date(0),
      lastEdited: new Date(0),
      volumes: [{ id: 'v', title: '卷', chapters: [chapter] }],
    };
    const books = useBooksStore();
    await books.addBook(book);
    const loaded = ref<Chapter | null>(chapter);
    let translation: ReturnType<typeof useChapterTranslation> | undefined;
    app = createApp({
      setup() {
        translation = useChapterTranslation(
          computed(() => books.getBookById('b')),
          loaded,
          loaded,
          computed(() => loaded.value?.content ?? []),
          () => {},
          () => {},
          () => ({ terms: 0, characters: 0 }),
          () => {},
        );
        return () => null;
      },
    });
    app.use(pinia).use(ToastService).mount(document.createElement('div'));
    let turn = 0;
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: async () => {
        if (turn++ > 0) return { text: 'DONE' };
        await books.updateBook('b', { targetLanguage: 'zh-TW' });
        return {
          text: '',
          toolCalls: [
            {
              id: 'call',
              type: 'function',
              function: {
                name: 'add_translation_batch',
                arguments: JSON.stringify({
                  paragraphs: [
                    {
                      paragraph_id: '11111111',
                      original_text_prefix: 'source',
                      translated_text: 'CN_ONLY',
                    },
                  ],
                }),
              },
            },
          ],
        };
      },
    } as never);
    await translation!.polishParagraph('11111111');
    const saved = (await ChapterContentService.loadChapterContent('c'))![0]!;
    expect(
      saved.translations.some(
        (value) => value.translation === 'CN_ONLY' && value.language === 'en-US',
      ),
    ).toBe(true);
    expect(saved.translations.find((value) => value.id === 'cn')?.translation).toBe('CN_ONLY');
    expect((await BookService.getBookById('b'))?.targetLanguage).toBe('zh-TW');
  });
});
