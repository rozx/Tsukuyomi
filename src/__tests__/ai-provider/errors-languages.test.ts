import '../setup';
import { describe, expect, it } from 'vitest';
import { AiSdkAIService } from '../../services/ai/providers/ai-sdk/service';
import { describeAIError } from '../../services/ai/core/errors';
import { AIServiceFactory } from '../../services/ai/ai-service-factory';
import { config } from './fixtures';

describe('AI 服务自有错误按界面语言显示', () => {
  it('缺少 API Key 或模型名时带错误码，界面按语言渲染', async () => {
    const service = new AiSdkAIService('openai');
    const noKey = await service
      .generateText({ ...config, apiKey: ' ' }, { prompt: 'x' })
      .catch((error: unknown) => error);
    expect((noKey as { code?: string }).code).toBe('AI_API_KEY_REQUIRED');
    expect(describeAIError(noKey, 'en-US', 'fallback')).toBe('API key is required');
    const noModel = await service
      .generateText({ ...config, model: '' }, { prompt: 'x' })
      .catch((error: unknown) => error);
    expect(describeAIError(noModel, 'zh-TW', 'fallback')).toBe('模型名稱不能為空');
    expect(() => AIServiceFactory.getService('nope' as never)).toThrow('不支持的 AI 提供商: nope');
  });
});
