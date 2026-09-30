import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createPinia, setActivePinia } from 'pinia';
import { PolishService } from '../services/ai/tasks/polish-service';
import { AIServiceFactory } from '../services/ai/ai-service-factory';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import type { AIModel } from '../services/ai/types/ai-model';

afterEach(() => vi.restoreAllMocks());
describe('文本任务目标语言', () => {
  it('只有其他语言版本时，批次润色在调用模型前拒绝', async () => {
    setActivePinia(createPinia());
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
    const generate = vi.fn(() => Promise.reject(new Error('MODEL_CALLED')));
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({ generateText: generate } as never);
    await expect(
      PolishService.polish(
        [
          {
            id: '11111111',
            text: 'source',
            selectedTranslationId: 'cn',
            translations: [{ id: 'cn', translation: '简中', aiModelId: '' }],
          },
        ],
        model,
        { languages: captureExecutionLanguages('en-US') },
      ),
    ).rejects.toThrow('段落必须包含当前选中的翻译');
    expect(generate).not.toHaveBeenCalled();
  });
});
