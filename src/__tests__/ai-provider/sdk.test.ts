import '../setup';
import { afterEach, beforeEach, describe } from 'bun:test';
import { expect, it, vi } from 'vitest';
import { AIServiceFactory } from '../../services/ai/ai-service-factory';
import { AiSdkAIService } from '../../services/ai/providers/ai-sdk/service';
import { config, geminiStream, openAIStream, stubTransport, tools } from './fixtures';
import type { TextGenerationChunk } from '../../services/ai/types/ai-service';

describe('AI SDK 唯一实现与厂商行为', () => {
  let transport: ReturnType<typeof stubTransport>;
  beforeEach(() => {
    transport = stubTransport();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('默认使用 SDK，存储不可用也不影响提供商选择', () => {
    expect(AIServiceFactory.getService('openai')).toBeInstanceOf(AiSdkAIService);
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('存储不可用');
    });
    expect(AIServiceFactory.getService('gemini')).toBeInstanceOf(AiSdkAIService);
  });

  it('请求并透传 OpenAI 实测用量，包括零值、思考和缓存', async () => {
    transport.responses.push(
      openAIStream(
        [{ content: '回答' }],
        [
          {
            choices: [],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 12,
              total_tokens: 112,
              completion_tokens_details: { reasoning_tokens: 4 },
              prompt_tokens_details: { cached_tokens: 0 },
            },
          },
        ],
      ),
    );
    const result = await AIServiceFactory.getService('openai').generateText(config, {
      prompt: '问题',
    });
    expect(result.usage).toEqual({
      inputTokens: 100,
      outputTokens: 12,
      reasoningTokens: 4,
      cachedInputTokens: 0,
    });
    expect(transport.requests[0]?.body).toMatchObject({ stream_options: { include_usage: true } });
  });

  it.each(['openai', 'gemini'] as const)('%s 未报告用量时不伪造零值', async (provider) => {
    transport.responses.push(
      provider === 'openai'
        ? openAIStream([{ content: '回答' }])
        : geminiStream([{ text: '回答' }]),
    );
    expect(
      (await AIServiceFactory.getService(provider).generateText(config, { prompt: '问题' })).usage,
    ).toBeUndefined();
  });

  it('Gemini signature 随工具调用回传同一调用，usage 来自厂商', async () => {
    transport.responses.push(
      geminiStream(
        [{ functionCall: { name: 'read_book', args: { id: 'a' } }, thoughtSignature: 'signed-a' }],
        [
          {
            usageMetadata: {
              promptTokenCount: 100,
              candidatesTokenCount: 9,
              thoughtsTokenCount: 3,
              cachedContentTokenCount: 10,
            },
          },
        ],
      ),
    );
    const service = AIServiceFactory.getService('gemini');
    const result = await service.generateText(config, { prompt: '读取', tools });
    expect(result.toolCalls?.[0]?.providerMetadata).toMatchObject({
      google: { thoughtSignature: 'signed-a' },
    });
    expect(result.usage).toEqual({
      inputTokens: 100,
      outputTokens: 12,
      reasoningTokens: 3,
      cachedInputTokens: 10,
    });
    transport.responses.push(geminiStream([{ text: '完成' }]));
    await service.generateText(config, {
      tools,
      messages: [
        { role: 'user', content: '读取' },
        { role: 'assistant', content: result.text, tool_calls: result.toolCalls! },
        {
          role: 'tool',
          content: '内容',
          tool_call_id: result.toolCalls![0]!.id,
          name: 'read_book',
        },
      ],
    });
    expect(transport.requests[1]?.body.contents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'model',
          parts: expect.arrayContaining([
            expect.objectContaining({
              thoughtSignature: 'signed-a',
              functionCall: expect.objectContaining({ name: 'read_book', args: { id: 'a' } }),
            }),
          ]),
        }),
      ]),
    );
  });

  it.each([true, false])('Gemini 尊重 baseUrl、自定义头与代理开关 %s', async (useCorsProxy) => {
    transport.responses.push(geminiStream([{ text: '完成' }]));
    transport.proxy.mockImplementation((url, useProxy) =>
      useProxy ? `https://proxy.fixture/?url=${encodeURIComponent(url)}` : url,
    );
    await AIServiceFactory.getService('gemini').generateText(
      {
        ...config,
        baseUrl: 'https://google.fixture/',
        useCorsProxy,
        customHeaders: { 'X-Fixture': 'gemini' },
      },
      { prompt: '问题' },
    );
    expect(transport.proxy).toHaveBeenCalledWith(
      expect.stringContaining('https://google.fixture/v1beta/models/'),
      useCorsProxy,
    );
    expect(
      transport.requests[0]?.url.startsWith(
        useCorsProxy ? 'https://proxy.fixture/' : 'https://google.fixture/',
      ),
    ).toBe(true);
    expect(transport.requests[0]?.headers.get('x-fixture')).toBe('gemini');
  });

  it.each(['openai', 'gemini'] as const)('%s 取消后不再发送流块或完成通知', async (provider) => {
    transport.responses.push(
      provider === 'openai'
        ? openAIStream([{ content: '第一段' }, { content: '第二段' }])
        : geminiStream([{ text: '第一段' }, { text: '第二段' }]),
    );
    const controller = new AbortController();
    const chunks: TextGenerationChunk[] = [];
    await expect(
      AIServiceFactory.getService(provider).generateText(
        { ...config, signal: controller.signal },
        { prompt: '问题' },
        (chunk) => {
          chunks.push(chunk);
          controller.abort();
        },
      ),
    ).rejects.toSatisfy(
      (error: Error) => error.name === 'AbortError' || error.message.includes('取消'),
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.done).toBe(false);
  });

  it.each(['openai', 'gemini'] as const)('%s 非瞬时错误不重试且保留超限原文', async (provider) => {
    transport.responses.push(
      Response.json(
        {
          error: {
            message: 'maximum context length exceeded',
            code: 400,
            status: 'INVALID_ARGUMENT',
          },
        },
        { status: 400 },
      ),
    );
    await expect(
      AIServiceFactory.getService(provider).generateText(config, { prompt: '问题' }),
    ).rejects.toThrow('maximum context length exceeded');
    expect(transport.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['openai', 429],
    ['openai', 500],
    ['gemini', 429],
    ['gemini', 500],
  ] as const)('%s 瞬时错误 %s 最多重试两次', async (provider, status) => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    for (let attempt = 0; attempt < 3; attempt++)
      transport.responses.push(
        Response.json(
          { error: { message: 'fixture busy', code: status, status: 'UNAVAILABLE' } },
          { status },
        ),
      );
    const pending = expect(
      AIServiceFactory.getService(provider).generateText(config, { prompt: '问题' }),
    ).rejects.toThrow('fixture busy');
    await vi.runAllTimersAsync();
    await pending;
    expect(transport.fetch).toHaveBeenCalledTimes(3);
  });

  it('Gemini 无调用者 signal 时设置 100 秒超时', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    transport.responses.push(geminiStream([{ text: '完成' }]));
    await AIServiceFactory.getService('gemini').generateText(config, { prompt: '问题' });
    expect(timeout).toHaveBeenCalledWith(100_000);
  });

  it('只报告输入用量时，输出、缓存和思考用量保持缺省', async () => {
    transport.responses.push(
      openAIStream([{ content: '回答' }], [{ choices: [], usage: { prompt_tokens: 100 } }]),
    );
    expect(
      (await AIServiceFactory.getService('openai').generateText(config, { prompt: '问题' })).usage,
    ).toEqual({ inputTokens: 100 });
  });

  it('流块采用厂商报告的服务模型名', async () => {
    transport.responses.push(openAIStream([{ content: '回答' }]));
    const chunks: TextGenerationChunk[] = [];
    await AIServiceFactory.getService('openai').generateText(
      config,
      { prompt: '问题' },
      (chunk) => {
        chunks.push(chunk);
      },
    );
    expect(chunks.every((chunk) => chunk.model === 'served-model')).toBe(true);
  });

  it.each([408, 409])('遵守契约：4xx 中的 %s 不自动重试', async (status) => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    for (let attempt = 0; attempt < 3; attempt++) {
      transport.responses.push(
        Response.json({ error: { message: 'fixture rejected' } }, { status }),
      );
    }
    const pending = expect(
      AIServiceFactory.getService('openai').generateText(config, { prompt: '问题' }),
    ).rejects.toThrow('fixture rejected');
    await vi.runAllTimersAsync();
    await pending;
    expect(transport.fetch).toHaveBeenCalledTimes(1);
  });

  it('连接失败在输出前重试，成功后不额外发起请求', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    transport.fetch.mockRejectedValueOnce(new TypeError('fetch failed'));
    transport.responses.push(openAIStream([{ content: '恢复成功' }]));
    const pending = expect(
      AIServiceFactory.getService('openai').generateText(config, { prompt: '问题' }),
    ).resolves.toMatchObject({ text: '恢复成功' });
    await vi.runAllTimersAsync();
    await pending;
    expect(transport.fetch).toHaveBeenCalledTimes(2);
  });

  it('已经开始输出后遇到流错误，不重试或伪造完成通知', async () => {
    transport.responses.push(
      openAIStream(
        [{ content: '第一段' }],
        [{ error: { message: 'stream broken', type: 'server_error', code: 'server_error' } }],
      ),
    );
    const chunks: TextGenerationChunk[] = [];
    await expect(
      AIServiceFactory.getService('openai').generateText(config, { prompt: '问题' }, (chunk) => {
        chunks.push(chunk);
      }),
    ).rejects.toThrow('stream broken');
    expect(chunks.some((chunk) => chunk.done)).toBe(false);
    expect(transport.fetch).toHaveBeenCalledTimes(1);
  });

  it('原生 reasoning 与 think 标签同时存在时各段只交付一次', async () => {
    transport.responses.push(
      openAIStream([{ reasoning_content: '原生思考' }, { content: '<think>标签思考</think>回答' }]),
    );
    const chunks: TextGenerationChunk[] = [];
    const result = await AIServiceFactory.getService('openai').generateText(
      config,
      { prompt: '问题' },
      (chunk) => {
        chunks.push(chunk);
      },
    );
    expect(result).toMatchObject({ text: '回答', reasoningContent: '原生思考标签思考' });
    expect(chunks.map((chunk) => chunk.reasoningContent ?? '').join('')).toBe('原生思考标签思考');
  });

  it('名称晚到达的并行工具调用仍保持首次出现的顺序', async () => {
    transport.responses.push(
      openAIStream([
        {
          tool_calls: [
            { index: 0, id: 'a', function: { arguments: '{"id":' } },
            { index: 1, id: 'b', function: { name: 'read_book', arguments: '{"id":"b"}' } },
          ],
        },
        { tool_calls: [{ index: 0, function: { name: 'read_book', arguments: '"a"}' } }] },
      ]),
    );
    const result = await AIServiceFactory.getService('openai').generateText(config, {
      prompt: '读取',
      tools,
    });
    expect(result.toolCalls?.map((call) => [call.id, call.function.arguments])).toEqual([
      ['a', '{"id":"a"}'],
      ['b', '{"id":"b"}'],
    ]);
  });
});
