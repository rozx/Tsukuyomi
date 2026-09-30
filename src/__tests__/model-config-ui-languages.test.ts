import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, ref } from 'vue';
import type { App } from 'vue';
import { createI18n } from 'vue-i18n';
import messages from '../i18n';
import { useModelConfiguration } from '../composables/ai-page/useModelConfiguration';
import { ConfigService } from '../services/ai/tasks/config-service';
import { LocalizedError } from '../utils/localized-error';
import type { AIModel } from '../services/ai/types/ai-model';
const feedback = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('src/composables/useToastHistory', () => ({ useToastWithHistory: () => feedback }));
let app: App | undefined;
afterEach(() => {
  app?.unmount();
  vi.restoreAllMocks();
  feedback.add.mockClear();
});
describe('模型资料界面说明', () => {
  it('等待期间切UI，目录失败toast摘要详情保留同一启动语言', async () => {
    let reject!: (error: Error) => void;
    vi.spyOn(ConfigService, 'getConfig').mockImplementation(
      () =>
        new Promise((_resolve, rejectPromise) => {
          reject = rejectPromise;
        }),
    );
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
    let config!: ReturnType<typeof useModelConfiguration>;
    app = createApp({
      setup() {
        config = useModelConfiguration({
          source: () => 'original-id',
          visible: () => true,
          model: () => ({ model: 'original-id' }) as AIModel,
          applyCatalog: vi.fn(),
        });
        return () => null;
      },
    });
    app.use(i18n).mount(document.createElement('div'));
    const pending = config.fetchModelInfo();
    i18n.global.locale.value = 'zh-TW';
    reject(new LocalizedError('MODEL_ID_REQUIRED', 'aiUi.identifierRequired'));
    await pending;
    expect(feedback.add).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: 'Could not fetch model information',
        detail: 'Model ID is required',
      }),
    );
  });

  it('真实自有测试结果切语言即时更新，不清状态也不重跑', async () => {
    const off = { enabled: false, temperature: 0.7 };
    const model: AIModel = {
      id: 'm',
      name: '用户模型',
      provider: 'openai',
      model: 'original-id',
      apiKey: '',
      baseUrl: 'https://example.test/v1',
      enabled: true,
      temperature: 0.7,
      maxInputTokens: 0,
      maxOutputTokens: 0,
      lastEdited: new Date(),
      isDefault: { translation: off, proofreading: off, termsTranslation: off, assistant: off },
    };
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
    const probe = vi.spyOn(ConfigService, 'testAvailability');
    let config!: ReturnType<typeof useModelConfiguration>;
    app = createApp({
      setup() {
        config = useModelConfiguration({
          source: () => model,
          visible: () => true,
          model: () => model,
          applyCatalog: vi.fn(),
        });
        return () => null;
      },
    });
    app.use(i18n).mount(document.createElement('div'));
    await config.testAvailability();
    expect(config.availabilityResult.value?.message).toBe('API key is required');
    i18n.global.locale.value = 'zh-TW';
    expect(config.availabilityResult.value?.message).toBe('API Key 不能為空');
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('显式英文传给服务，反馈不改变表单快照', async () => {
    const service = vi
      .spyOn(ConfigService, 'getConfig')
      .mockResolvedValue({ success: false, message: 'Original catalog detail' });
    const source = ref('用户模型草稿');
    let config!: ReturnType<typeof useModelConfiguration>;
    app = createApp({
      setup() {
        config = useModelConfiguration({
          source: () => source.value,
          visible: () => true,
          model: () => ({ model: 'original-id' }) as AIModel,
          applyCatalog: vi.fn(),
        });
        return () => null;
      },
    });
    app
      .use(createI18n({ legacy: false, locale: 'en-US', messages }))
      .mount(document.createElement('div'));
    await config.fetchModelInfo();
    expect(service).toHaveBeenCalledWith({ model: 'original-id' }, 'en-US');
    expect(feedback.add).toHaveBeenCalledWith(
      expect.objectContaining({ summary: 'No catalog entry', detail: 'Original catalog detail' }),
    );
    expect(source.value).toBe('用户模型草稿');
  });
});
