import '../setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiSdkAIService } from '../../services/ai/providers/ai-sdk/service';
import { buildModelServiceConfig } from '../../services/ai/core/model-config';
import type { AIModel } from '../../services/ai/types/ai-model';
import { config, geminiStream, openAIStream, stubTransport } from './fixtures';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const model = (patch: Partial<AIModel> = {}): AIModel => ({
  id: 'm1',
  name: '测试模型',
  provider: 'openai',
  model: 'gpt-test',
  temperature: 0.7,
  maxInputTokens: 0,
  maxOutputTokens: 0,
  apiKey: 'fixture-key',
  baseUrl: 'https://example.test/v1',
  enabled: true,
  isDefault: {
    translation: { enabled: false, temperature: 0.7 },
    proofreading: { enabled: false, temperature: 0.7 },
    termsTranslation: { enabled: false, temperature: 0.7 },
    assistant: { enabled: false, temperature: 0.7 },
  },
  lastEdited: new Date(0),
  ...patch,
});

describe('温度开关', () => {
  it('旧模型没有开关字段时照常发送温度', () => {
    const result = buildModelServiceConfig(model(), { temperature: 0.3 });
    expect(result.temperature).toBe(0.3);
    expect(result.temperatureEnabled).not.toBe(false);
  });

  it('关闭后任务覆盖的温度也不进入配置', () => {
    const result = buildModelServiceConfig(model({ temperatureEnabled: false }), {
      temperature: 0.3,
    });
    expect(result.temperature).toBeUndefined();
    expect(result.temperatureEnabled).toBe(false);
  });

  it('兼容接口默认发送温度', async () => {
    const transport = stubTransport();
    transport.responses.push(openAIStream([{ content: 'OK' }]));
    await new AiSdkAIService('openai').generateText(
      { ...config, temperature: 0.7 },
      { prompt: 'OK', temperature: 0.3 },
    );
    expect(transport.requests[0]?.body).toMatchObject({ temperature: 0.3 });
  });

  it('兼容接口关闭后忽略请求级温度', async () => {
    const transport = stubTransport();
    transport.responses.push(openAIStream([{ content: 'OK' }]));
    await new AiSdkAIService('openai').generateText(
      { ...config, temperature: 0.7, temperatureEnabled: false },
      { prompt: 'OK', temperature: 0.3 },
    );
    expect(transport.requests[0]?.body).not.toHaveProperty('temperature');
  });

  it('Gemini 关闭后不发送 generationConfig.temperature', async () => {
    const transport = stubTransport();
    transport.responses.push(geminiStream([{ text: 'OK' }]));
    await new AiSdkAIService('gemini').generateText(
      { ...config, temperature: 0.7, temperatureEnabled: false },
      { prompt: 'OK', temperature: 0.3 },
    );
    const body = transport.requests[0]?.body as { generationConfig?: Record<string, unknown> };
    expect(body.generationConfig ?? {}).not.toHaveProperty('temperature');
  });
});
