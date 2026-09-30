import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { PolishService } from '../services/ai';
import { TermTranslationService } from '../services/ai/tasks/term-translation-service';
import { processSingleParagraph } from '../services/ai/tasks/utils/single-paragraph-processor';
import { formatSummaryMessages } from '../services/ai/context/summary-input';
import { AssistantService } from '../services/ai/tasks/assistant-service';
import { AIEmptyResponseError } from '../services/ai/core/errors';
import { AIServiceFactory } from '../services/ai/ai-service-factory';
import { TodoListService } from '../services/todo-list-service';
import { BookService } from '../services/book-service';
import { createAIProcessingStoreAdapter } from '../services/ai/tasks/utils/task-types';
import type { AIProcessingStore } from '../services/ai/tasks/utils/task-types';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { useAIModelsStore } from '../stores/ai-models';
import { useAIProcessingStore } from '../stores/ai-processing';
import { useSettingsStore } from '../stores/settings';
import type { AIServiceConfig, TextGenerationRequest } from '../services/ai/types/ai-service';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';

const CJK = /[぀-ヿ一-鿿]/;

afterEach(() => {
  vi.restoreAllMocks();
  TodoListService.clearAllTodos();
});

/** 记录任务面板收到的全部状态文案，其余行为委托真实 store。 */
function recordingStore(): { store: AIProcessingStore; messages: string[] } {
  const real = createAIProcessingStoreAdapter(useAIProcessingStore());
  const messages: string[] = [];
  const store: AIProcessingStore = {
    ...real,
    addTask: (task) => {
      if (task.message) messages.push(task.message);
      return real.addTask(task);
    },
    updateTask: (id, updates) => {
      if (updates.message) messages.push(updates.message);
      return real.updateTask(id, updates);
    },
    get activeTasks() {
      return real.activeTasks;
    },
  };
  return { store, messages };
}

const call = (name: string, args: unknown, turn: number) => ({
  text: '',
  toolCalls: [
    {
      id: `call-${turn}`,
      type: 'function' as const,
      function: { name, arguments: JSON.stringify(args) },
    },
  ],
});

describe('AI 执行反馈语言', () => {
  it('文本任务降级重试与状态反馈沿用启动语言，运行中改界面和目标不影响', async () => {
    const chapter = translationChapter('c', '11111111');
    chapter.content![0]!.translations = [
      { id: 'en', translation: 'Existing English', language: 'en-US', aiModelId: '' },
    ];
    chapter.content![0]!.selectedTranslations = {
      'en-US': { value: 'en', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
    };
    const { books } = await chapterTranslationFixture([chapter]);
    const { store, messages } = recordingStore();
    const requests: TextGenerationRequest[] = [];
    let turn = 0;
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: async (_config: AIServiceConfig, request: TextGenerationRequest) => {
        turn++;
        requests.push(request);
        const task = useAIProcessingStore().activeTasks.at(-1)!;
        for (const todo of TodoListService.getTodosByTaskId(task.id))
          if (todo.status !== 'done') TodoListService.markTodoAsDone(todo.id);
        if (turn === 1) {
          await useSettingsStore().setUiLocale('zh-CN');
          await books.updateBook('fixture-book', { targetLanguage: 'zh-TW' });
          return { text: 'あ'.repeat(600) };
        }
        if (turn === 2) return call('update_task_status', { status: 'working' }, turn);
        if (turn === 3)
          return call(
            'add_translation_batch',
            {
              paragraphs: [
                {
                  paragraph_id: '11111111',
                  original_text_prefix: 'source',
                  translated_text: 'Polished English',
                },
              ],
            },
            turn,
          );
        if (turn > 8) throw new Error('UNEXPECTED_LOOP');
        return call('update_task_status', { status: 'end' }, turn);
      },
    } as never);
    const saved: string[] = [];
    await PolishService.polish(chapter.content!, useAIModelsStore().models[0]!, {
      bookId: 'fixture-book',
      chapterId: 'c',
      languages: captureExecutionLanguages('en-US'),
      aiProcessingStore: store,
      onParagraphPolish: (results) => {
        saved.push(...results.map((value) => value.translation));
      },
    });
    expect(saved).toEqual(['Polished English']);
    expect(messages.some((message) => /retry/i.test(message))).toBe(true);
    expect(messages.filter((message) => CJK.test(message))).toEqual([]);
    const injected = requests
      .at(-1)!
      .messages!.filter((message) => message.role === 'user')
      .map((message) => String(message.content));
    expect(injected.filter((content) => CJK.test(content))).toEqual([]);
    expect((await BookService.getBookById('fixture-book'))?.targetLanguage).toBe('zh-TW');
  });

  it('本地化的输入校验不再依赖中文文案', async () => {
    await chapterTranslationFixture([translationChapter('c', '11111111')]);
    await expect(
      PolishService.polish([], useAIModelsStore().models[0]!, {
        languages: captureExecutionLanguages('en-US'),
      }),
    ).rejects.toThrow(/^(?!.*[一-鿿]).+$/);
  });

  it('单段任务的处理和完成反馈使用执行语言', async () => {
    const chapter = translationChapter('c', '11111111');
    chapter.content![0]!.translations = [
      { id: 'en', translation: 'Existing English', language: 'en-US', aiModelId: '' },
    ];
    chapter.content![0]!.selectedTranslations = {
      'en-US': { value: 'en', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
    };
    await chapterTranslationFixture([chapter]);
    const { store, messages } = recordingStore();
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: () => Promise.resolve({ text: 'DONE' }),
    } as never);
    await processSingleParagraph(
      chapter.content![0]!,
      useAIModelsStore().models[0]!,
      { languages: captureExecutionLanguages('en-US'), aiProcessingStore: store },
      {
        taskType: 'polish',
        logLabel: 'test',
        temperature: 0.7,
        buildSystemPrompt: () => 'SYSTEM',
        buildUserPrompt: () => 'USER',
      },
    );
    expect(messages.length).toBeGreaterThan(1);
    expect(messages.filter((message) => CJK.test(message))).toEqual([]);
  });

  it('术语翻译以英文取消时标记为已取消，JSON 重试反馈也用英文', async () => {
    await chapterTranslationFixture([]);
    const { store, messages } = recordingStore();
    const controller = new AbortController();
    let turn = 0;
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: () => {
        turn++;
        if (turn === 1) return Promise.resolve({ text: 'not json' });
        controller.abort();
        return Promise.resolve({ text: 'still not json' });
      },
    } as never);
    await expect(
      TermTranslationService.translate('用户原文', useAIModelsStore().models[0]!, {
        languages: captureExecutionLanguages('en-US'),
        aiProcessingStore: store,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    const task = useAIProcessingStore().activeTasks.at(-1)!;
    expect(task.status).toBe('cancelled');
    expect(messages.filter((message) => CJK.test(message))).toEqual([]);
  });

  for (const entry of ['term', 'assistant'] as const) {
    it(`${entry} 收到空响应时以执行语言记录错误`, async () => {
      await chapterTranslationFixture([]);
      const { store, messages } = recordingStore();
      vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
        generateText: () => Promise.reject(new AIEmptyResponseError()),
      } as never);
      const languages = captureExecutionLanguages('en-US');
      const model = useAIModelsStore().models[0]!;
      const running =
        entry === 'term'
          ? TermTranslationService.translate('用户原文', model, {
              languages,
              aiProcessingStore: store,
            })
          : AssistantService.chat(model, 'Hello', { languages, aiProcessingStore: store });
      await running.catch(() => undefined);
      expect(useAIProcessingStore().activeTasks.at(-1)?.status).toBe('error');
      expect(messages.filter((message) => CJK.test(message))).toEqual([]);
    });
  }

  it('压缩摘要输入的工具标签使用执行语言', () => {
    const lines = formatSummaryMessages(
      [
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'x', type: 'function', function: { name: 'list_chapters', arguments: '{}' } },
          ],
        },
        { role: 'tool', tool_call_id: 'x', name: 'list_chapters', content: '[]' },
      ],
      'en-US',
    );
    expect(lines.map((line) => line.content)).toEqual([
      'Tool call list_chapters (x): {}',
      'Tool result list_chapters (x): []',
    ]);
  });
});
