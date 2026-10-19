import '../setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIServiceFactory } from '../../services/ai/ai-service-factory';
import { AiSdkAIService } from '../../services/ai/providers/ai-sdk/service';
import type { AIThinkingLevel } from '../../services/ai/types/ai-model';
import { anthropicStream, config, stubTransport, tools } from './fixtures';

const service = new AiSdkAIService('anthropic');
const claude = { ...config, model: 'claude-opus-5-5' };
let transport: ReturnType<typeof stubTransport>;

beforeEach(() => {
  transport = stubTransport();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function send(
  patch: Partial<typeof claude> = {},
  request: Parameters<typeof service.generateText>[1] = { prompt: '问题' },
) {
  transport.responses.push(anthropicStream([{ text: '回答' }]));
  await service.generateText({ ...claude, ...patch }, request);
  return transport.requests.at(-1)!;
}

describe('Anthropic 原生提供商：连接', () => {
  it('工厂注册 anthropic 并复用 AI SDK 实现', () => {
    expect(AIServiceFactory.getService('anthropic')).toBeInstanceOf(AiSdkAIService);
  });

  it('默认直连官方 Messages API，携带 x-api-key 与 anthropic-version', async () => {
    const request = await send();
    expect(request.url).toBe('https://api.anthropic.com/v1/messages');
    expect(request.headers.get('x-api-key')).toBe('fixture-key');
    expect(request.headers.get('anthropic-version')).toBe('2023-06-01');
    expect(request.headers.get('authorization')).toBeNull();
    expect(request.body).toMatchObject({ model: 'claude-opus-5-5', stream: true });
  });

  it.each([
    ['https://claude.fixture/', 'https://claude.fixture/v1/messages'],
    ['https://claude.fixture/custom///', 'https://claude.fixture/custom/messages'],
  ])('baseUrl %s → %s', async (baseUrl, expected) => {
    expect((await send({ baseUrl })).url).toBe(expected);
  });

  it('直连时发送浏览器直连头，并保留自定义头', async () => {
    const request = await send({ customHeaders: { 'X-Fixture': 'claude' } });
    expect(request.headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    expect(request.headers.get('x-fixture')).toBe('claude');
    expect(transport.proxy).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', false);
  });

  it('请求经 CORS 代理转发时不发送浏览器直连头', async () => {
    transport.proxy.mockImplementation((url, useProxy) =>
      useProxy ? `https://proxy.fixture/?url=${encodeURIComponent(url)}` : url,
    );
    const request = await send({ useCorsProxy: true });
    expect(request.url.startsWith('https://proxy.fixture/')).toBe(true);
    expect(request.headers.get('anthropic-dangerous-direct-browser-access')).toBeNull();
  });
});

describe('Anthropic 原生提供商：思考等级', () => {
  it.each([
    // 模型, 思考等级, 期望 thinking, 期望 effort
    ['claude-opus-5-5', 'provider-default', { type: 'adaptive', display: 'summarized' }, undefined],
    ['claude-opus-5-5', undefined, { type: 'adaptive', display: 'summarized' }, undefined],
    ['claude-opus-4-7', 'provider-default', undefined, undefined],
    ['claude-opus-5-5', 'minimal', { type: 'adaptive', display: 'summarized' }, 'low'],
    ['claude-opus-5-5', 'low', { type: 'adaptive', display: 'summarized' }, 'low'],
    ['claude-opus-5-5', 'medium', { type: 'adaptive', display: 'summarized' }, 'medium'],
    ['claude-opus-5-5', 'high', { type: 'adaptive', display: 'summarized' }, 'high'],
    ['claude-opus-5-5', 'xhigh', { type: 'adaptive', display: 'summarized' }, 'xhigh'],
    ['claude-sonnet-4-6', 'xhigh', { type: 'adaptive', display: 'summarized' }, 'max'],
    ['claude-opus-4-7', 'high', { type: 'adaptive', display: 'summarized' }, 'high'],
    ['claude-opus-5-5', 'none', { type: 'adaptive', display: 'summarized' }, 'low'],
    ['claude-fable-5-1', 'none', { type: 'adaptive', display: 'summarized' }, 'low'],
    ['claude-sonnet-5-5', 'none', { type: 'between_tools' }, undefined],
    ['claude-opus-4-8', 'none', undefined, undefined],
    ['claude-opus-6', 'provider-default', { type: 'adaptive', display: 'summarized' }, undefined],
  ] as const)(
    '%s + %s → thinking %j, effort %s',
    async (model, thinkingLevel, thinking, effort) => {
      const { body } = await send({ model, thinkingLevel });
      expect(body.thinking).toEqual(thinking);
      expect((body.output_config as { effort?: string } | undefined)?.effort).toBe(effort);
    },
  );

  it('Claude 4.5 及更早模型仍用 budget_tokens', async () => {
    const { body } = await send({ model: 'claude-haiku-4-5', thinkingLevel: 'medium' });
    expect(body.thinking).toMatchObject({ type: 'enabled', budget_tokens: expect.any(Number) });
    expect(body).not.toHaveProperty('output_config');
  });

  it.each(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1', 'claude-opus-4-7'])(
    '%s 在任何等级下都不发送 budget_tokens 或 disabled',
    async (model) => {
      const levels: (AIThinkingLevel | undefined)[] = [
        undefined,
        'provider-default',
        'none',
        'minimal',
        'low',
        'medium',
        'high',
        'xhigh',
      ];
      for (const thinkingLevel of levels) {
        const { body } = await send({ model, thinkingLevel });
        const thinking = body.thinking as Record<string, unknown> | undefined;
        expect(thinking?.type).not.toBe('disabled');
        expect(thinking?.type).not.toBe('enabled');
        expect(thinking ?? {}).not.toHaveProperty('budget_tokens');
      }
    },
  );
});

describe('Anthropic 原生提供商：请求约束', () => {
  it('拒绝采样参数的模型不发送温度', async () => {
    const { body } = await send({ temperature: 0.7 }, { prompt: '问题', temperature: 0.3 });
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('top_p');
  });

  it('SDK 型号表未收录但按标识拒绝温度的模型也不发送温度', async () => {
    const { body } = await send(
      { model: 'claude-opus-4-9', temperature: 0.7 },
      { prompt: '问题', temperature: 0.3 },
    );
    expect(body).not.toHaveProperty('temperature');
  });

  it('未开启思考且允许采样的旧模型照常发送温度', async () => {
    const { body } = await send(
      { model: 'claude-sonnet-4-6', temperature: 0.7 },
      { prompt: '问题', temperature: 0.3 },
    );
    expect(body.temperature).toBe(0.3);
  });

  it('工具选择始终为 auto', async () => {
    const { body } = await send({}, { prompt: '读取', tools });
    expect(body.tool_choice).toEqual({ type: 'auto' });
  });

  it('稳定的 system 与工具定义带缓存断点，对话尾部使用自动缓存', async () => {
    const { body } = await send(
      {},
      {
        tools,
        messages: [
          { role: 'system', content: '第一条规则' },
          { role: 'system', content: '第二条规则' },
          { role: 'user', content: '问题' },
        ],
      },
    );
    const system = body.system as { text: string; cache_control?: unknown }[];
    expect(system[0]).not.toHaveProperty('cache_control');
    expect(system.at(-1)).toMatchObject({
      text: '第二条规则',
      cache_control: { type: 'ephemeral' },
    });
    expect((body.tools as { cache_control?: unknown }[]).at(-1)?.cache_control).toEqual({
      type: 'ephemeral',
    });
    expect(body.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('历史以助手消息结尾时追加用户消息，不发送 prefill', async () => {
    const { body } = await send(
      {},
      {
        messages: [
          { role: 'user', content: '问题' },
          { role: 'assistant', content: '半截回答' },
        ],
      },
    );
    const messages = body.messages as { role: string }[];
    expect(messages.at(-1)?.role).toBe('user');
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('带签名的思考片段在工具历史中回放为 thinking / redacted_thinking 块并排在最前', async () => {
    const { body } = await send(
      {},
      {
        tools,
        messages: [
          { role: 'user', content: '读取' },
          {
            role: 'assistant',
            content: '',
            reasoning_content: '先查书',
            reasoning_parts: [
              { text: '先查书', providerMetadata: { anthropic: { signature: 'sig-1' } } },
              { text: '', providerMetadata: { anthropic: { redactedData: 'opaque-data' } } },
            ],
            tool_calls: [
              {
                id: 'toolu_a',
                type: 'function',
                function: { name: 'read_book', arguments: '{"id":"a"}' },
              },
            ],
          },
          { role: 'tool', content: '内容', tool_call_id: 'toolu_a', name: 'read_book' },
        ],
      },
    );
    const messages = body.messages as { role: string; content: Record<string, unknown>[] }[];
    expect(messages[1]?.content[0]).toEqual({
      type: 'thinking',
      thinking: '先查书',
      signature: 'sig-1',
    });
    expect(messages[1]?.content[1]).toEqual({ type: 'redacted_thinking', data: 'opaque-data' });
    expect(messages[1]?.content.at(-1)).toMatchObject({ type: 'tool_use', id: 'toolu_a' });
  });

  it('非 Anthropic 签名的思考片段不回放', async () => {
    const { body } = await send(
      {},
      {
        tools,
        messages: [
          { role: 'user', content: '读取' },
          {
            role: 'assistant',
            content: '',
            reasoning_parts: [{ text: '别家的思考', providerMetadata: { google: { x: 1 } } }],
            tool_calls: [
              {
                id: 'toolu_a',
                type: 'function',
                function: { name: 'read_book', arguments: '{"id":"a"}' },
              },
            ],
          },
          { role: 'tool', content: '内容', tool_call_id: 'toolu_a', name: 'read_book' },
        ],
      },
    );
    const messages = body.messages as { role: string; content: { type: string }[] }[];
    expect(messages[1]?.content.map((block) => block.type)).toEqual(['text', 'tool_use']);
  });

  it('工具历史只回传文本与工具调用，不重放思考块', async () => {
    const { body } = await send(
      {},
      {
        tools,
        messages: [
          { role: 'user', content: '读取' },
          {
            role: 'assistant',
            content: '',
            reasoning_content: '之前的思考',
            tool_calls: [
              {
                id: 'toolu_a',
                type: 'function',
                function: { name: 'read_book', arguments: '{"id":"a"}' },
              },
            ],
          },
          { role: 'tool', content: '内容', tool_call_id: 'toolu_a', name: 'read_book' },
        ],
      },
    );
    const messages = body.messages as { role: string; content: { type: string }[] }[];
    expect(messages[1]?.content.map((block) => block.type)).toEqual(['text', 'tool_use']);
    expect(messages[2]?.content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_a' });
  });
});

describe('Anthropic 原生提供商：响应', () => {
  it('工具调用保留厂商 ID 与原始参数', async () => {
    transport.responses.push(
      anthropicStream([
        { thinking: '先查书' },
        { toolUse: { id: 'toolu_a', name: 'read_book', input: { id: 'a' } } },
      ]),
    );
    const result = await service.generateText(claude, { prompt: '读取', tools });
    expect(result.reasoningContent).toBe('先查书');
    expect(result.toolCalls).toEqual([
      expect.objectContaining({
        id: 'toolu_a',
        function: { name: 'read_book', arguments: '{"id":"a"}' },
      }),
    ]);
  });

  it('思考块连同签名保存为 reasoningParts，供后续工具轮次原样回传', async () => {
    transport.responses.push(
      anthropicStream([
        { thinking: '先查书', signature: 'sig-1' },
        { redacted: 'opaque-data' },
        { toolUse: { id: 'toolu_a', name: 'read_book', input: { id: 'a' } } },
      ]),
    );
    const result = await service.generateText(claude, { prompt: '读取', tools });
    expect(result.reasoningParts).toEqual([
      { text: '先查书', providerMetadata: { anthropic: { signature: 'sig-1' } } },
      { text: '', providerMetadata: { anthropic: { redactedData: 'opaque-data' } } },
    ]);
  });

  it('输入用量包含缓存读写，缓存命中单独报告', async () => {
    transport.responses.push(
      anthropicStream([{ text: '回答' }], {
        start: {
          input_tokens: 10,
          cache_read_input_tokens: 80,
          cache_creation_input_tokens: 5,
          output_tokens: 1,
        },
        end: { output_tokens: 12 },
      }),
    );
    const result = await service.generateText(claude, { prompt: '问题' });
    expect(result.usage).toEqual({ inputTokens: 95, outputTokens: 12, cachedInputTokens: 80 });
    expect(result.model).toBe('served-model');
  });

  it('报告思考 token 时单独透传', async () => {
    transport.responses.push(
      anthropicStream([{ thinking: '想' }, { text: '回答' }], {
        start: { input_tokens: 10, output_tokens: 1 },
        end: { output_tokens: 12, output_tokens_details: { thinking_tokens: 4 } },
      }),
    );
    expect((await service.generateText(claude, { prompt: '问题' })).usage).toEqual({
      inputTokens: 10,
      outputTokens: 12,
      reasoningTokens: 4,
    });
  });
});

describe('Anthropic 原生提供商：模型列表', () => {
  it('用官方头请求 /v1/models，跟随分页并带出上下文与输出上限', async () => {
    transport.responses.push(
      Response.json({
        data: [
          {
            type: 'model',
            id: 'claude-opus-5-5',
            display_name: 'Claude Opus 5.5',
            created_at: '2026-01-01T00:00:00Z',
            max_input_tokens: 1_000_000,
            max_tokens: 128_000,
          },
        ],
        has_more: true,
        first_id: 'claude-opus-5-5',
        last_id: 'claude-opus-5-5',
      }),
      Response.json({
        data: [
          {
            type: 'model',
            id: 'claude-haiku-5-5',
            display_name: 'Claude Haiku 5.5',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
        has_more: false,
        first_id: 'claude-haiku-5-5',
        last_id: 'claude-haiku-5-5',
      }),
    );
    const result = await service.getAvailableModels(config);
    expect(transport.requests.map((request) => request.url)).toEqual([
      'https://api.anthropic.com/v1/models?limit=1000',
      'https://api.anthropic.com/v1/models?limit=1000&after_id=claude-opus-5-5',
    ]);
    const headers = transport.requests[0]!.headers;
    expect(headers.get('x-api-key')).toBe('fixture-key');
    expect(headers.get('anthropic-version')).toBe('2023-06-01');
    expect(headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    expect(result.models).toEqual([
      {
        id: 'claude-opus-5-5',
        name: 'claude-opus-5-5',
        displayName: 'Claude Opus 5.5',
        ownedBy: 'Anthropic',
        maxInputTokens: 1_000_000,
        maxOutputTokens: 128_000,
      },
      {
        id: 'claude-haiku-5-5',
        name: 'claude-haiku-5-5',
        displayName: 'Claude Haiku 5.5',
        ownedBy: 'Anthropic',
      },
    ]);
  });
});
