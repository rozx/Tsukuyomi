import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { isSymbolOnly } from '../utils/text-utils';
import { TranslationService } from '../services/ai/tasks/translation-service';
import { AIServiceFactory } from '../services/ai/ai-service-factory';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { useAIModelsStore } from '../stores/ai-models';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
afterEach(() => vi.restoreAllMocks());
describe('任意 Unicode 原文', () => {
  for (const text of ['مرحبا', 'สวัสดี', 'Привет', 'é', 'e\u0301', '١٢٣', '𠀀']) {
    it(`${text} 是可处理文本`, () => expect(isSymbolOnly(text)).toBe(false));
  }
  for (const text of ['★ ☆ ♥ ○ ●', '……！？', '—', '\u0301', '\u064E']) {
    it(`${text} 仅为装饰或孤立组合符`, () => expect(isSymbolOnly(text)).toBe(true));
  }
  it('各脚本段落实际进入翻译请求，不被任务过滤器跳过', async () => {
    await chapterTranslationFixture([translationChapter('c', '11111111')]);
    const reached = vi.fn(() => Promise.reject(new Error('MODEL_REACHED')));
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({ generateText: reached } as never);
    await expect(
      TranslationService.translate(
        ['مرحبا', 'สวัสดี', 'Привет', 'café', 'cafe\u0301', '𠀀𠀁'].map((text, index) => ({
          id: index.toString(16).padStart(8, '0'),
          text,
          translations: [],
          selectedTranslationId: '',
        })),
        useAIModelsStore().models[0]!,
        { languages: captureExecutionLanguages('en-US') },
      ),
    ).rejects.toThrow('MODEL_REACHED');
    expect(reached).toHaveBeenCalledTimes(1);
    const request = JSON.stringify(reached.mock.calls);
    for (const text of ['مرحبا', 'สวัสดี', 'Привет', 'café', 'cafe\u0301', '𠀀𠀁'])
      expect(request).toContain(text);
  });
});
