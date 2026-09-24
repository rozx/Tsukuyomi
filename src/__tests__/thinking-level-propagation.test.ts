import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIServiceFactory } from '../services/ai/ai-service-factory';
import { AssistantService } from '../services/ai/tasks/assistant-service';
import { TermTranslationService } from '../services/ai/tasks/term-translation-service';
import { processSingleParagraph } from '../services/ai/tasks/utils/single-paragraph-processor';
import { summarizeInto } from '../services/ai/context/summarize';
import { modelContextKey } from '../services/ai/context/measure';
import type { AIModel } from '../services/ai/types/ai-model';
import type { AIService } from '../services/ai/types/ai-service';

const on = { enabled: true, temperature: 0.7 };
const model: AIModel = {
  id: 'thinking-test',
  provider: 'openai',
  model: 'custom-model',
  name: '测试',
  apiKey: 'fixture',
  baseUrl: 'https://fixture.test',
  enabled: true,
  lastEdited: new Date(0),
  temperature: 0.7,
  maxInputTokens: 128000,
  maxOutputTokens: 8192,
  limitsSource: 'manual',
  thinkingLevel: 'high',
  isDefault: { translation: on, proofreading: on, termsTranslation: on, assistant: on },
};
afterEach(() => vi.restoreAllMocks());
describe('思考等级接入实际服务入口', () => {
  it.each(['assistant', 'term', 'paragraph', 'summary'] as const)(
    '%s 保留选择的等级',
    async (task) => {
      const generate = vi
        .fn<AIService['generateText']>()
        .mockResolvedValue({ text: '已经完成本次处理，接下来继续保留原有的约束和角色姓名。' });
      vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({ generateText: generate } as never);
      if (task === 'assistant') await AssistantService.chat(model, '简短回答');
      if (task === 'term') generate.mockResolvedValue({ text: '{"t":"你好"}' });
      if (task === 'term') await TermTranslationService.translate('こんにちは', model);
      if (task === 'paragraph')
        await processSingleParagraph(
          { id: 'p1', text: '原文', translations: [], selectedTranslationId: '' },
          model,
          {},
          {
            taskType: 'polish',
            logLabel: 'test',
            temperature: 0.7,
            buildSystemPrompt: () => '提示',
            buildUserPrompt: () => '处理原文',
          },
        );
      if (task === 'summary')
        await summarizeInto({ model, messages: [{ role: 'user', content: '测试内容' }] });
      expect(generate).toHaveBeenCalled();
      expect(generate.mock.calls.every(([config]) => config.thinkingLevel === 'high')).toBe(true);
    },
  );
  it('切换思考等级使旧用量锚点的模型键失效，默认与旧配置等价', () => {
    expect(modelContextKey(model)).not.toBe(modelContextKey({ ...model, thinkingLevel: 'low' }));
    const { thinkingLevel: _level, ...legacy } = model;
    expect(modelContextKey(legacy)).toBe(
      modelContextKey({ ...legacy, thinkingLevel: 'provider-default' }),
    );
    expect(modelContextKey(legacy)).toBe(
      JSON.stringify([legacy.id, legacy.provider, legacy.model, legacy.baseUrl]),
    );
  });
});
