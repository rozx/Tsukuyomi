import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createPinia, setActivePinia } from 'pinia';
import { AssistantService } from '../services/ai/tasks/assistant-service';
import { AIServiceFactory } from '../services/ai/ai-service-factory';
import { ToolRegistry } from '../services/ai/tools/tool-registry';
import { useSettingsStore } from '../stores/settings';
import { useContextStore } from '../stores/context';
import { useBooksStore } from '../stores/books';
import { useAIModelsStore } from '../stores/ai-models';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { deferred } from './web-locks-fixture';
import type {
  AITool,
  AIToolCall,
  AIServiceConfig,
  TextGenerationRequest,
} from '../services/ai/types/ai-service';

const tool: AITool = {
  type: 'function',
  function: {
    name: 'get_book_info',
    description: 'Fixture',
    parameters: { type: 'object', properties: {} },
  },
};
const call: AIToolCall = {
  id: 'call',
  type: 'function',
  function: { name: 'get_book_info', arguments: '{}' },
};
afterEach(() => {
  vi.restoreAllMocks();
});

async function fixture() {
  setActivePinia(createPinia());
  await chapterTranslationFixture([translationChapter('c', '11111111')]);
  vi.spyOn(ToolRegistry, 'getAssistantToolsExcludingTranslationManagement').mockReturnValue([tool]);
  const invoke = vi.spyOn(ToolRegistry, 'handleToolCall').mockResolvedValue({
    role: 'tool',
    name: call.function.name,
    tool_call_id: call.id,
    content: '{"success":true}',
  });
  return {
    model: useAIModelsStore().models[0]!,
    invoke,
    settings: useSettingsStore(),
    books: useBooksStore(),
  };
}
describe('助手执行语言隔离', () => {
  it('两个并发执行各自冻结 UI 与书籍目标，工具循环不读取后来的设置', async () => {
    const { model, invoke, settings, books } = await fixture();
    useContextStore().setCurrentBook('fixture-book');
    await settings.setUiLocale('zh-CN');
    const started = deferred();
    const finish = deferred();
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: async (_config: AIServiceConfig, request: TextGenerationRequest) => {
        if (request.messages!.some((message) => message.role === 'tool')) return { text: 'Done' };
        if (request.messages!.some((message) => message.content === 'Request A')) {
          started.resolve();
          await finish.promise;
        }
        return { text: '', toolCalls: [call] };
      },
    } as never);
    const a = AssistantService.chat(model, 'Request A');
    await started.promise;
    await settings.setUiLocale('en-US');
    await books.updateBook('fixture-book', { targetLanguage: 'zh-TW' });
    await AssistantService.chat(model, 'Request B');
    finish.resolve();
    await a;
    expect(invoke.mock.calls.map((args) => args[13])).toEqual([
      { uiLocale: 'en-US', targetLanguage: 'zh-TW' },
      { uiLocale: 'zh-CN', targetLanguage: 'en-US' },
    ]);
    expect(invoke.mock.calls.every((args) => Object.isFrozen(args[13]))).toBe(true);
  });
  it('无书籍执行以启动 UI 语言为目标', async () => {
    const { model, invoke, settings } = await fixture();
    useContextStore().setCurrentBook(null);
    await settings.setUiLocale('en-US');
    // 帮助工具不需要书籍上下文。
    const help = { ...tool, function: { ...tool.function, name: 'list_help_docs' } };
    vi.spyOn(ToolRegistry, 'getAssistantToolsExcludingTranslationManagement').mockReturnValue([
      help,
    ]);
    let turn = 0;
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: async () => {
        if (turn++) return { text: 'Done' };
        await settings.setUiLocale('zh-TW');
        return {
          text: '',
          toolCalls: [{ ...call, function: { ...call.function, name: help.function.name } }],
        };
      },
    } as never);
    await AssistantService.chat(model, 'Help');
    expect(invoke.mock.calls[0]?.[13]).toEqual({ uiLocale: 'en-US', targetLanguage: 'en-US' });
  });
});
