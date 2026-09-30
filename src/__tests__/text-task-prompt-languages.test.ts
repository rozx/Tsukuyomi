import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { TranslationService } from '../services/ai/tasks/translation-service';
import { PolishService } from '../services/ai/tasks/polish-service';
import { ProofreadingService } from '../services/ai/tasks/proofreading-service';
import { AIServiceFactory } from '../services/ai/ai-service-factory';
import { useAIModelsStore } from '../stores/ai-models';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { getOutputFormatRules } from '../services/ai/tasks/prompts/common';
import type { Paragraph } from '../models/novel';
import type { AppLocale } from '../models/locale';
import type { AIServiceConfig, TextGenerationRequest } from '../services/ai/types/ai-service';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';

beforeEach(async () => {
  await chapterTranslationFixture([translationChapter('c', '11111111')]);
});
afterEach(() => vi.restoreAllMocks());
const taskMethods = [
  ['translation', TranslationService.translate.bind(TranslationService)],
  ['polish', PolishService.polish.bind(PolishService)],
  ['proofreading', ProofreadingService.proofread.bind(ProofreadingService)],
] as const;
const source = 'مرحبا بالعالم';
function paragraph(target: AppLocale): Paragraph {
  return {
    id: '11111111',
    text: source,
    selectedTranslationId: '',
    translations: [
      { id: 'existing', language: target, translation: 'Existing text', aiModelId: '' },
    ],
    selectedTranslations: {
      [target]: { value: 'existing', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
    },
  };
}
function captureRequests() {
  const requests: TextGenerationRequest[] = [];
  vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
    generateText: (_config: AIServiceConfig, request: TextGenerationRequest) => {
      requests.push(request);
      return Promise.reject(new Error('MODEL_REACHED'));
    },
  } as never);
  return requests;
}
describe('正文任务提示词使用执行语言', () => {
  for (const [task, run] of taskMethods) {
    for (const uiLocale of ['zh-CN', 'zh-TW'] as const) {
      it(`${task} ${uiLocale} 指令可独立产出英文`, async () => {
        const requests = captureRequests();
        await expect(
          run([paragraph('en-US')], useAIModelsStore().models[0]!, {
            languages: captureExecutionLanguages(uiLocale, 'en-US'),
          }),
        ).rejects.toThrow('MODEL_REACHED');
        const system = requests[0]!.messages!.find((message) => message.role === 'system')!
          .content as string;
        expect(system).toContain(uiLocale === 'zh-TW' ? '你是專業的小說' : '你是专业的小说');
        expect(system).toContain('ASCII');
        expect(system).not.toContain('中文译文使用全角中文标点');
        expect(system).not.toContain('中文譯文使用全形中文標點');
        expect(system).toContain('paragraph_id');
      });
    }
    for (const target of ['zh-CN', 'zh-TW', 'en-US'] as const) {
      it(`${task} 英文交互可独立产出 ${target}`, async () => {
        const requests = captureRequests();
        await expect(
          run([paragraph(target)], useAIModelsStore().models[0]!, {
            languages: captureExecutionLanguages('en-US', target),
          }),
        ).rejects.toThrow('MODEL_REACHED');
        const system = requests[0]!.messages!.find((message) => message.role === 'system')!
          .content as string;
        const user = requests[0]!.messages!.find((message) => message.role === 'user')!
          .content as string;
        expect(system).toContain(
          { 'zh-CN': 'Simplified Chinese', 'zh-TW': 'Traditional Chinese', 'en-US': 'English' }[
            target
          ],
        );
        expect(system).toContain('Detect the source language');
        expect(system).toContain('If the source contains Japanese honorifics');
        expect(system).toContain('paragraph_id');
        expect(system).not.toMatch(/日轻小说|必须|校对检查项|全角中文标点|未翻译的日语/);
        if (target === 'en-US') expect(system).toContain('ASCII');
        expect(user).toContain(source);
        expect(user).not.toMatch(/[\p{Script=Han}]/u);
        expect(requests[0]!.tools!.length).toBeGreaterThan(0);
        expect(JSON.stringify(requests[0]!.tools)).not.toMatch(/[\p{Script=Han}]/u);
      });
    }
  }
  for (const uiLocale of ['zh-CN', 'zh-TW', 'en-US'] as const) {
    it(`${uiLocale} 的 JSON 示例与前缀开关不改变协议字段`, () => {
      for (const enabled of [false, true]) {
        const prompt = getOutputFormatRules('translation', {
          languages: captureExecutionLanguages(uiLocale, 'en-US'),
          enableOriginalTextValidation: enabled,
        });
        const examples = [...prompt.matchAll(/\{[^{}]+\}/g)].map((match) => JSON.parse(match[0]));
        expect(examples).toContainEqual({ status: '...' });
        expect(examples).toContainEqual({
          paragraph_id: 'xxx',
          ...(enabled ? { original_text_prefix: 'source' } : {}),
          translated_text: '...',
        });
        expect(examples).toContainEqual({ chapter_id: 'chapter-id', title_translation: '...' });
      }
      if (uiLocale === 'en-US') {
        expect(
          getOutputFormatRules('polish', {
            languages: captureExecutionLanguages(uiLocale),
          }),
        ).not.toMatch(/[\p{Script=Han}]/u);
      }
    });
  }
  for (const [task, run] of [
    ['polish', PolishService.polishSingle.bind(PolishService)],
    ['proofreading', ProofreadingService.proofreadSingle.bind(ProofreadingService)],
  ] as const) {
    it(`${task} 单段系统和用户指令使用英文且原文不变`, async () => {
      const requests = captureRequests();
      await expect(
        run(paragraph('en-US'), useAIModelsStore().models[0]!, {
          languages: captureExecutionLanguages('en-US'),
        }),
      ).rejects.toThrow('MODEL_REACHED');
      const messages = requests[0]!.messages!;
      const system = messages.find((message) => message.role === 'system')!.content as string;
      const user = messages.find((message) => message.role === 'user')!.content as string;
      expect(system).toContain('English');
      expect(system).toContain('Only process the current paragraph');
      expect(system).not.toMatch(/日轻小说|必须|待润色|校对检查项/);
      expect(user).toContain(`Original: ${source}`);
      expect(user).toContain('[ID: 11111111]');
      expect(user).toContain('Current translation: Existing text');
      expect(user).not.toMatch(/原文:|当前翻译:|待校对|待润色/);
    });
    it(`${task} 单段上下文只自动提供目标语言选用`, async () => {
      const requests = captureRequests();
      const current = paragraph('en-US');
      const next: Paragraph = {
        ...paragraph('en-US'),
        id: '22222222',
        text: 'Next original.',
        translations: [
          { id: 'cn', language: 'zh-CN', translation: '不应注入的简中译文', aiModelId: '' },
          { id: 'en', language: 'en-US', translation: 'Next English.', aiModelId: '' },
        ],
        selectedTranslations: {
          'zh-CN': { value: 'cn', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
          'en-US': { value: 'en', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
        },
      };
      await expect(
        run(current, useAIModelsStore().models[0]!, {
          languages: captureExecutionLanguages('en-US'),
          allChapterParagraphs: [current, next],
        }),
      ).rejects.toThrow('MODEL_REACHED');
      const user = requests[0]!.messages!.find((message) => message.role === 'user')!
        .content as string;
      expect(user).toContain('Next original.');
      expect(user).toContain('Next English.');
      expect(user).not.toContain('不应注入的简中译文');
    });
  }
});
