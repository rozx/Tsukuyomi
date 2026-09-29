import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createPinia, setActivePinia } from 'pinia';
import { processSingleParagraph } from '../services/ai/tasks/utils/single-paragraph-processor';
import { AIServiceFactory } from '../services/ai/ai-service-factory';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import type { AIModel } from '../services/ai/types/ai-model';
import type { AIServiceConfig, TextGenerationRequest } from '../services/ai/types/ai-service';
import type { Paragraph } from '../models/novel';

afterEach(() => vi.restoreAllMocks());
const task = { enabled: true, temperature: 0.7 };
const model: AIModel = {
  id: 'm',
  name: 'Fake provider',
  provider: 'openai',
  model: 'fake',
  enabled: true,
  apiKey: '',
  baseUrl: '',
  temperature: 0.7,
  maxInputTokens: 10000,
  maxOutputTokens: 1000,
  lastEdited: new Date(0),
  isDefault: { translation: task, proofreading: task, termsTranslation: task, assistant: task },
};
const paragraph: Paragraph = {
  id: 'p',
  text: 'source',
  selectedTranslationId: 'cn',
  translations: [
    { id: 'cn', translation: 'CN_ONLY', language: 'zh-CN', aiModelId: '' },
    { id: 'en', translation: 'EN_ONLY', language: 'en-US', aiModelId: '' },
  ],
  selectedTranslations: {
    'en-US': { value: 'en', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
  },
};
const config = {
  taskType: 'polish' as const,
  logLabel: 'test',
  temperature: 0.7,
  buildSystemPrompt: () => 'SYSTEM',
  buildUserPrompt: (params: { currentTranslation: string }) => params.currentTranslation,
};

describe('单段执行语言', () => {
  it('启动时捕获目标语言，异步准备期间更改 options 不改变发给模型的选用', async () => {
    setActivePinia(createPinia());
    const sent: string[] = [];
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: (_config: AIServiceConfig, request: TextGenerationRequest) => {
        sent.push(request.messages!.find((value) => value.role === 'user')!.content as string);
        return Promise.resolve({ text: 'DONE' });
      },
    } as never);
    const options = { languages: captureExecutionLanguages('en-US', 'en-US') };
    const pending = processSingleParagraph(paragraph, model, options, config);
    options.languages = captureExecutionLanguages('zh-CN', 'zh-CN');
    await pending;
    expect(sent).toEqual(['EN_ONLY']);
  });
  it('缺少目标选用时拒绝润色，不使用另一语言版本', async () => {
    setActivePinia(createPinia());
    const generate = vi.fn(() => Promise.resolve({ text: 'SHOULD_NOT_RUN' }));
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({ generateText: generate } as never);
    await expect(
      processSingleParagraph(
        { ...paragraph, selectedTranslations: {} },
        model,
        { languages: captureExecutionLanguages('en-US') },
        config,
      ),
    ).rejects.toThrow('NO_TARGET_TRANSLATION');
    expect(generate).not.toHaveBeenCalled();
  });
});
