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
import { APP_LOCALES } from '../models/locale';
import { agentText } from '../i18n/translate';
import { aiLanguageName } from '../services/ai/tasks/prompts/language';
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
describe('正文任务提示词为简中单源，以参数指定目标与回复语言', () => {
  for (const [task, run] of taskMethods) {
    for (const uiLocale of APP_LOCALES) {
      for (const target of APP_LOCALES) {
        it(`${task} ${uiLocale} 界面产出 ${target}`, async () => {
          const requests = captureRequests();
          await expect(
            run([paragraph(target)], useAIModelsStore().models[0]!, {
              languages: captureExecutionLanguages(uiLocale, target),
            }),
          ).rejects.toThrow('MODEL_REACHED');
          const system = requests[0]!.messages!.find((message) => message.role === 'system')!
            .content as string;
          const user = requests[0]!.messages!.find((message) => message.role === 'user')!
            .content as string;
          const targetName = aiLanguageName(target);
          expect(system).toContain(
            agentText(`aiText.role.${task}`, { targetLanguage: targetName }),
          );
          expect(system).toContain(agentText('aiText.source', { targetLanguage: targetName }));
          expect(system).toContain('仅当实际原文包含日语敬语时');
          expect(system).toContain(`使用${aiLanguageName(uiLocale)}向用户简短报告当前任务与进度`);
          expect(system).toContain('paragraph_id');
          expect(system).not.toMatch(/日轻小说|未翻译的日语/);
          if (target === 'en-US') {
            expect(system).toContain(agentText('aiText.symbolEnglish'));
            expect(system).not.toContain('全角中文标点');
          } else {
            expect(system).toContain(agentText('aiText.symbolChinese'));
          }
          expect(user).toContain(source);
          // 工具说明与界面语言无关
          expect(
            requests[0]!.tools!.find((tool) => tool.function.name === 'update_task_status')!
              .function.description,
          ).toBe(agentText('aiTools.update_task_status'));
        });
      }
    }
  }
  for (const uiLocale of APP_LOCALES) {
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
    });
  }
  for (const [task, run] of [
    ['polish', PolishService.polishSingle.bind(PolishService)],
    ['proofreading', ProofreadingService.proofreadSingle.bind(ProofreadingService)],
  ] as const) {
    it(`${task} 单段指令为简中、目标为英文且原文不变`, async () => {
      const requests = captureRequests();
      await expect(
        run(paragraph('en-US'), useAIModelsStore().models[0]!, {
          languages: captureExecutionLanguages('en-US'),
        }),
      ).rejects.toThrow('MODEL_REACHED');
      const messages = requests[0]!.messages!;
      const system = messages.find((message) => message.role === 'system')!.content as string;
      const user = messages.find((message) => message.role === 'user')!.content as string;
      expect(system).toContain(agentText(`aiText.role.${task}`, { targetLanguage: '英文' }));
      expect(system).toContain(agentText('aiText.singleScope'));
      expect(system).toContain(agentText('aiText.symbolEnglish'));
      expect(user).toContain(`原文: ${source}`);
      expect(user).toContain('[ID: 11111111]');
      expect(user).toContain('当前翻译: Existing text');
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
