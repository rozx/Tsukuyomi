import '../setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiSdkAIService } from '../../services/ai/providers/ai-sdk/service';
import { config, geminiStream, openAIStream, stubTransport } from './fixtures';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('思考等级的厂商请求参数', () => {
  it.each(['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const)(
    '兼容接口透传 %s，保留原始模型标识',
    async (thinkingLevel) => {
      const transport = stubTransport();
      transport.responses.push(openAIStream([{ content: 'OK' }]));
      await new AiSdkAIService('openai').generateText(
        { ...config, model: 'gpt-6-sol(high)', thinkingLevel },
        { prompt: 'OK' },
      );
      expect(transport.requests[0]?.body).toMatchObject({
        model: 'gpt-6-sol(high)',
        reasoning_effort: thinkingLevel,
      });
    },
  );
  it.each([undefined, 'provider-default'] as const)(
    '默认 %s 不发送覆盖参数',
    async (thinkingLevel) => {
      const transport = stubTransport();
      transport.responses.push(openAIStream([{ content: 'OK' }]));
      await new AiSdkAIService('openai').generateText(
        { ...config, thinkingLevel },
        { prompt: 'OK' },
      );
      expect(transport.requests[0]?.body).not.toHaveProperty('reasoning_effort');
    },
  );
  it.each(['low', 'medium', 'high'] as const)(
    'Gemini 3 通过 SDK 映射到 thinkingLevel=%s',
    async (thinkingLevel) => {
      const transport = stubTransport();
      transport.responses.push(geminiStream([{ text: 'OK' }]));
      await new AiSdkAIService('gemini').generateText(
        { ...config, model: 'gemini-3-flash-preview', thinkingLevel },
        { prompt: 'OK' },
      );
      expect(transport.requests[0]?.body).toMatchObject({
        generationConfig: { thinkingConfig: { includeThoughts: true, thinkingLevel } },
      });
    },
  );
  it('Gemini 2.5 通过 SDK 映射成 token 预算', async () => {
    const transport = stubTransport();
    transport.responses.push(geminiStream([{ text: 'OK' }]));
    await new AiSdkAIService('gemini').generateText(
      { ...config, model: 'gemini-2.5-flash', thinkingLevel: 'low' },
      { prompt: 'OK' },
    );
    expect(transport.requests[0]?.body).toMatchObject({
      generationConfig: { thinkingConfig: { includeThoughts: true, thinkingBudget: 6554 } },
    });
  });
});
