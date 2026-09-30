import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { AssistantService } from '../services/ai/tasks/assistant-service';
import { AIServiceFactory } from '../services/ai/ai-service-factory';
import { useContextStore } from '../stores/context';
import { useAIModelsStore } from '../stores/ai-models';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import type { AIServiceConfig, TextGenerationRequest } from '../services/ai/types/ai-service';
afterEach(() => vi.restoreAllMocks());
describe('助手交互语言与译文目标', () => {
  it('英文执行的空回复使用英文兜底', async () => {
    await chapterTranslationFixture([translationChapter('c', '11111111')]);
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: () => Promise.resolve({ text: '' }),
    } as never);
    const result = await AssistantService.chat(useAIModelsStore().models[0]!, 'Hello', {
      languages: captureExecutionLanguages('en-US'),
    });
    expect(result.text).toBe('No valid response was received. Please try again.');
  });
  it('英文执行的越权工具错误保持固定错误码和英文说明', async () => {
    await chapterTranslationFixture([translationChapter('c', '11111111')]);
    let calls = 0;
    let toolResult: Record<string, unknown> = {};
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: (_config: AIServiceConfig, request: TextGenerationRequest) => {
        if (calls++ === 0)
          return Promise.resolve({
            text: '',
            toolCalls: [
              {
                id: 'forbidden',
                type: 'function',
                function: { name: 'unknown_tool', arguments: '{}' },
              },
            ],
          });
        toolResult = JSON.parse(
          request.messages!.find((message) => message.role === 'tool')!.content as string,
        );
        return Promise.resolve({ text: 'Done' });
      },
    } as never);
    await AssistantService.chat(useAIModelsStore().models[0]!, 'Hello', {
      languages: captureExecutionLanguages('en-US'),
    });
    expect(toolResult.error_code).toBe('TOOL_NOT_ALLOWED');
    expect(toolResult.error).toBe('Tool unknown_tool is not available for this execution.');
  });
  it('英文执行使用中性英文指令，繁中书籍目标独立于对话语言', async () => {
    const { books } = await chapterTranslationFixture([translationChapter('c', '11111111')]);
    await books.updateBook('fixture-book', { targetLanguage: 'zh-TW' });
    useContextStore().setCurrentBook('fixture-book');
    let system = '';
    let descriptions = '';
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: (_config: AIServiceConfig, request: TextGenerationRequest) => {
        system = request.messages!.find((message) => message.role === 'system')!.content as string;
        descriptions = JSON.stringify(request.tools);
        return Promise.resolve({ text: 'Done' });
      },
    } as never);
    await AssistantService.chat(useAIModelsStore().models[0]!, 'Explain the translation', {
      languages: captureExecutionLanguages('en-US', 'zh-TW'),
    });
    expect(system).toContain('Reply in English');
    expect(system).toContain('Traditional Chinese');
    expect(system).not.toMatch(/[\p{Script=Han}]/u);
    expect(system).toContain('Do not add persona');
    expect(descriptions).not.toMatch(/[\p{Script=Han}]/u);
  });
});
