import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { ConfigService } from '../services/ai/tasks/config-service';
import type { AIModel } from '../services/ai/types/ai-model';
import type { AppLocale } from '../models/locale';
import * as Limits from '../services/ai/model-limits/resolve';
const off = { enabled: false, temperature: 0.7 };
const model: AIModel = {
  id: 'm',
  name: '用户模型',
  model: 'user-model',
  provider: 'openai',
  apiKey: '',
  baseUrl: 'https://example.test/v1',
  enabled: true,
  temperature: 0.7,
  maxInputTokens: 0,
  maxOutputTokens: 0,
  lastEdited: new Date(),
  isDefault: { translation: off, proofreading: off, termsTranslation: off, assistant: off },
};
afterEach(() => vi.restoreAllMocks());
describe('模型资料和可用性服务语言', () => {
  it('目录未命中用显式英文且模型ID不被翻译', async () => {
    vi.spyOn(Limits, 'lookupModelLimits').mockResolvedValue(undefined);
    const get = ConfigService.getConfig.bind(ConfigService) as (
      model: AIModel,
      locale?: AppLocale,
    ) => ReturnType<typeof ConfigService.getConfig>;
    const result = await get(model, 'en-US');
    expect(result.message).toBe(
      'models.dev has no entry for this model. Existing values were kept; enter limits manually.',
    );
    expect(model.model).toBe('user-model');
  });
  it('真实无密钥校验返回英文，不请求提供商', async () => {
    const test = ConfigService.testAvailability.bind(ConfigService) as (
      model: AIModel,
      options: { uiLocale: AppLocale },
    ) => ReturnType<typeof ConfigService.testAvailability>;
    const result = await test(model, { uiLocale: 'en-US' });
    expect(result.success).toBe(false);
    expect(result.message).toBe('API key is required');
  });
});
