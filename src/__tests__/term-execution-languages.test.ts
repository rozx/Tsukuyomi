import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp } from 'vue';
import type { App } from 'vue';
import ToastService from 'primevue/toastservice';
import { TermTranslationService } from '../services/ai/tasks/term-translation-service';
import { useTermTranslation } from '../composables/translation/useTermTranslation';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { AIServiceFactory } from '../services/ai/ai-service-factory';
import { TerminologyService } from '../services/terminology-service';
import { useSettingsStore } from '../stores/settings';
import { useContextStore } from '../stores/context';
import { useAIModelsStore } from '../stores/ai-models';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import type { AIServiceConfig, TextGenerationRequest } from '../services/ai/types/ai-service';
let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
});

describe('术语执行语言', () => {
  it('有书籍的术语请求使用英文宿主标签并保留用户原文', async () => {
    const { books } = await chapterTranslationFixture([translationChapter('c', '11111111')]);
    await books.updateBook('fixture-book', { translationInstructions: '用户保留的翻译要求' });
    let system = '';
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: (_config: AIServiceConfig, request: TextGenerationRequest) => {
        system = request.messages!.find((message) => message.role === 'system')!.content as string;
        return Promise.resolve({ text: '{"t":"Result"}' });
      },
    } as never);
    await TermTranslationService.translate('source', useAIModelsStore().models[0]!, {
      bookId: 'fixture-book',
      chapterId: 'c',
      chapterTitle: 'Source title',
      languages: captureExecutionLanguages('en-US', 'zh-TW'),
    });
    expect(system).toContain('[Book information]');
    expect(system).toContain('[Current chapter]');
    expect(system).toContain('[Special instructions (user content)]');
    expect(system).toContain('用户保留的翻译要求');
    expect(system).toContain('Traditional Chinese');
    expect(system).not.toMatch(/【书籍信息】|当前章节 ID|特殊指令（用户自定义）/);
  });
  it('重试仍使用启动英文提示与目标译名，运行中改目标不注入简中译名', async () => {
    const { books } = await chapterTranslationFixture([translationChapter('c', '11111111')]);
    const term = await TerminologyService.addTerminology(
      'fixture-book',
      { name: 'Guild', translation: 'CN_ONLY' },
      'zh-CN',
    );
    await TerminologyService.updateTerminology(
      'fixture-book',
      term.id,
      { translation: 'EN_ONLY' },
      'en-US',
    );
    const requests: TextGenerationRequest[] = [];
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: async (_config: AIServiceConfig, request: TextGenerationRequest) => {
        requests.push(structuredClone(request));
        await useSettingsStore().setUiLocale('zh-TW');
        await books.updateBook('fixture-book', { targetLanguage: 'zh-TW' });
        return { text: requests.length === 1 ? 'invalid JSON' : '{"t":"English result"}' };
      },
    } as never);
    const result = await TermTranslationService.translate('Guild', useAIModelsStore().models[0]!, {
      bookId: 'fixture-book',
      languages: captureExecutionLanguages('en-US'),
    });
    expect(result.text).toBe('English result');
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      const input = request.messages!.map((message) => message.content).join('\n');
      expect(input).toContain('EN_ONLY');
      expect(input).not.toContain('CN_ONLY');
      expect(input).toContain('English');
    }
    expect(requests[1]?.messages?.at(-1)?.content).toContain('JSON');
  });
  it('可翻译控件无书籍时将启动 UI 语言传给服务', async () => {
    const fixture = await chapterTranslationFixture([translationChapter('c', '11111111')]);
    await useSettingsStore().setUiLocale('en-US');
    useContextStore().setCurrentBook(null);
    let run!: ReturnType<typeof useTermTranslation>;
    app = createApp({
      setup() {
        run = useTermTranslation();
        return () => null;
      },
    });
    app.use(fixture.pinia).use(ToastService).mount(document.createElement('div'));
    const translate = vi
      .spyOn(TermTranslationService, 'translate')
      .mockResolvedValue({ text: 'English' });
    await run.runTermTranslation('source');
    expect(translate.mock.calls[0]?.[2]?.languages).toEqual({
      uiLocale: 'en-US',
      targetLanguage: 'en-US',
    });
    expect(Object.isFrozen(translate.mock.calls[0]?.[2]?.languages)).toBe(true);
  });
});
