import '../setup';
import { afterEach, beforeEach, describe } from 'bun:test';
import { expect, it, vi } from 'vitest';
import { AiSdkAIService } from '../../services/ai/providers/ai-sdk/service';
import { AIEmptyResponseError } from '../../services/ai/core/errors';
import { TOOL_CALL_PLACEHOLDER } from '../../services/ai/tasks/utils/stream-handler';
import type { TextGenerationChunk } from '../../services/ai/types/ai-service';
import {
  config,
  configResponse,
  geminiStream,
  openAIStream,
  stubTransport,
  tools,
} from './fixtures';

describe.each([
  {
    provider: 'openai',
    service: new AiSdkAIService('openai'),
    stream: openAIStream,
  },
  {
    provider: 'gemini',
    service: new AiSdkAIService('gemini'),
    stream: geminiStream,
  },
])('$provider 契约', ({ provider, service, stream }) => {
  let transport: ReturnType<typeof stubTransport>;
  beforeEach(() => {
    transport = stubTransport();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('通过真实 SDK 消费 SSE，并恰好发出一次完成通知', async () => {
    transport.responses.push(
      stream(
        provider === 'openai'
          ? [{ content: '你' }, { content: '好' }]
          : [{ text: '你' }, { text: '好' }],
      ),
    );
    const chunks: TextGenerationChunk[] = [];
    const result = await service.generateText(config, { prompt: '问候' }, (chunk) => {
      chunks.push(chunk);
    });
    expect(result.text).toBe('你好');
    expect(chunks.filter((chunk) => !chunk.done).map((chunk) => chunk.text)).toEqual(['你', '好']);
    expect(chunks.filter((chunk) => chunk.done)).toHaveLength(1);
    expect(transport.requests).toHaveLength(1);
  });

  it('思考与正文分离，最终正文去除首尾空白', async () => {
    transport.responses.push(
      stream(
        provider === 'openai'
          ? [{ reasoning_content: '先思考' }, { content: '  回答  ' }]
          : [{ text: '先思考', thought: true }, { text: '  回答  ' }],
      ),
    );
    const chunks: TextGenerationChunk[] = [];
    const result = await service.generateText(config, { prompt: '问题' }, (chunk) => {
      chunks.push(chunk);
    });
    expect(result).toMatchObject({ text: '回答', reasoningContent: '先思考' });
    expect(chunks.filter((chunk) => !chunk.done && chunk.reasoningContent)).toEqual([
      expect.objectContaining({ text: '', reasoningContent: '先思考' }),
    ]);
  });

  it('助手和翻译任务的非空 system 消息通过独立指令入口传给厂商', async () => {
    transport.responses.push(
      stream(provider === 'openai' ? [{ content: '你好' }] : [{ text: '你好' }]),
    );
    const result = await service.generateText(config, {
      messages: [
        { role: 'system', content: '用简体中文回答。不要修改任何数据。' },
        { role: 'user', content: '问候' },
      ],
    });
    expect(result.text).toBe('你好');
    const body = transport.requests[0]!.body;
    if (provider === 'openai') {
      expect(body.messages).toEqual([
        { role: 'system', content: '用简体中文回答。不要修改任何数据。' },
        { role: 'user', content: '问候' },
      ]);
    } else {
      const instruction = body.systemInstruction as { parts: { text: string }[] };
      expect(instruction.parts.map((part) => part.text).join('\n')).toBe(
        '用简体中文回答。不要修改任何数据。',
      );
    }
  });

  it('提取指令时保留全部 system 消息的顺序', async () => {
    transport.responses.push(
      stream(provider === 'openai' ? [{ content: '你好' }] : [{ text: '你好' }]),
    );
    await service.generateText(config, {
      messages: [
        { role: 'system', content: '第一条规则' },
        { role: 'system', content: '第二条规则' },
        { role: 'user', content: '问候' },
      ],
    });
    const body = transport.requests[0]!.body;
    if (provider === 'openai') {
      expect(body.messages).toEqual([
        { role: 'system', content: '第一条规则' },
        { role: 'system', content: '第二条规则' },
        { role: 'user', content: '问候' },
      ]);
    } else {
      const instruction = body.systemInstruction as { parts: { text: string }[] };
      expect(instruction.parts.map((part) => part.text).join('\n')).toBe('第一条规则\n第二条规则');
    }
  });

  it('只有工具调用也成功，多个调用保持顺序并具有不同 ID', async () => {
    transport.responses.push(
      stream(
        provider === 'openai'
          ? [
              {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call-a',
                    type: 'function',
                    function: { name: 'read_book', arguments: '{"id":"a"}' },
                  },
                  {
                    index: 1,
                    id: 'call-b',
                    type: 'function',
                    function: { name: 'read_book', arguments: '{"id":"b"}' },
                  },
                ],
              },
            ]
          : [
              { functionCall: { name: 'read_book', args: { id: 'a' } } },
              { functionCall: { name: 'read_book', args: { id: 'b' } } },
            ],
      ),
    );
    const result = await service.generateText(config, { prompt: '读取两本书', tools });
    expect(result.text).toBe('');
    expect(result.toolCalls?.map((call) => call.function.arguments)).toEqual([
      '{"id":"a"}',
      '{"id":"b"}',
    ]);
    expect(new Set(result.toolCalls?.map((call) => call.id)).size).toBe(2);
    expect(result.toolCalls?.every((call) => call.id.length > 0)).toBe(true);
  });

  it('空响应抛出专用错误', async () => {
    transport.responses.push(stream([]));
    await expect(service.generateText(config, { prompt: '问题' })).rejects.toBeInstanceOf(
      AIEmptyResponseError,
    );
  });

  it.each([
    ['JSON', '{"maxInputTokens":128000,"maxOutputTokens":8192}'],
    ['旧字段', '{"contextWindow":128000,"maxTokens":8192}'],
    ['说明文本', '模型 maxInputTokens: 128000，maxOutputTokens: 8192。'],
  ])('配置探测解析%s回复', async (_label, content) => {
    transport.responses.push(configResponse(provider, content));
    expect(
      await service.getConfig({ ...config, customHeaders: { 'X-Fixture': 'config' } }),
    ).toMatchObject({
      success: true,
      maxInputTokens: 128000,
      maxOutputTokens: 8192,
    });
    expect(transport.requests[0]?.headers.get('x-fixture')).toBe('config');
  });

  it('配置探测保留厂商错误信息', async () => {
    transport.responses.push(
      Response.json({ error: { message: 'invalid fixture credentials' } }, { status: 401 }),
    );
    expect(await service.getConfig(config)).toMatchObject({
      success: false,
      message: expect.stringContaining('invalid fixture credentials'),
    });
  });

  it('模型列表保留名称与 owner，排除 Gemini 非生成模型', async () => {
    transport.responses.push(
      Response.json(
        provider === 'openai'
          ? { object: 'list', data: [{ id: 'test-model', owned_by: 'Fixture' }], has_more: false }
          : {
              models: [
                {
                  name: 'models/test-model',
                  displayName: 'Test Model',
                  supportedGenerationMethods: ['generateContent'],
                },
                { name: 'models/embed', supportedGenerationMethods: ['embedContent'] },
              ],
            },
      ),
    );
    const result = await service.getAvailableModels({
      ...config,
      customHeaders: { 'X-Fixture': 'models' },
    });
    expect(result).toMatchObject({
      success: true,
      models: [
        {
          id: 'test-model',
          name: 'test-model',
          ownedBy: provider === 'openai' ? 'Fixture' : 'Google',
        },
      ],
    });
    expect(transport.requests[0]?.headers.get('x-fixture')).toBe('models');
  });

  it('模型列表失败遵守各提供商的退化契约', async () => {
    transport.responses.push(
      Response.json({ error: { message: 'listing denied' } }, { status: 401 }),
    );
    const result = await service.getAvailableModels(config);
    expect(result.success).toBe(provider === 'gemini');
    if (provider === 'gemini') expect(result.models).toEqual([]);
    else expect(result.message).toContain('listing denied');
  });

  it.each([
    { apiKey: '', model: config.model },
    { apiKey: config.apiKey, model: '' },
  ])('缺少凭据时在网络请求前拒绝：%j', async (invalid) => {
    await expect(service.generateText(invalid, { prompt: '问题' })).rejects.toThrow();
    expect(transport.fetch).not.toHaveBeenCalled();
  });

  it('空输入在网络请求前拒绝', async () => {
    await expect(service.generateText(config, {})).rejects.toThrow('提示词或消息列表不能为空');
    expect(transport.fetch).not.toHaveBeenCalled();
  });

  if (provider === 'gemini') {
    it('模型前缀规范化且 Gemini 2 开启 thinking', async () => {
      transport.responses.push(geminiStream([{ text: '好' }]));
      await service.generateText(
        { ...config, model: 'models/gemini-2.5-flash' },
        { prompt: '问题' },
      );
      expect(transport.requests[0]?.url).toContain(
        '/models/gemini-2.5-flash:streamGenerateContent',
      );
      expect(transport.requests[0]?.body).toMatchObject({
        generationConfig: { thinkingConfig: { includeThoughts: true } },
      });
    });
  }

  if (provider === 'openai') {
    it('原样拼接截断参数，为缺失 ID 补 ID，丢弃空工具名', async () => {
      transport.responses.push(
        openAIStream([
          { tool_calls: [{ index: 0, function: { name: 'read_book', arguments: '{"id":' } }] },
          {
            tool_calls: [
              { index: 0, function: { arguments: '"半截' } },
              { index: 1, function: { name: '', arguments: '{}' } },
            ],
          },
        ]),
      );
      const result = await service.generateText(config, { prompt: '读取', tools });
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls?.[0]).toMatchObject({
        id: expect.any(String),
        function: { name: 'read_book', arguments: '{"id":"半截' },
      });
      expect(result.toolCalls?.[0]?.id).not.toBe('');
    });

    it.each([
      { reasoning_content: '思考' },
      { reasoning: '思考' },
      { reasoning_details: [{ text: '思考' }] },
    ])('支持兼容服务的 reasoning 字段 %j', async (reasoning) => {
      transport.responses.push(openAIStream([reasoning, { content: '回答' }]));
      expect(await service.generateText(config, { prompt: '问题' })).toMatchObject({
        text: '回答',
        reasoningContent: '思考',
      });
    });

    it('think 内容跨 delta 时分离正文', async () => {
      transport.responses.push(
        openAIStream([{ content: '<think>思' }, { content: '考</think>回答' }]),
      );
      expect(await service.generateText(config, { prompt: '问题' })).toMatchObject({
        text: '回答',
        reasoningContent: '思考',
      });
    });

    it('think 标签本身跨 delta 时分离正文', async () => {
      transport.responses.push(
        openAIStream([{ content: '<thi' }, { content: 'nk>思考</th' }, { content: 'ink>回答' }]),
      );
      expect(await service.generateText(config, { prompt: '问题' })).toMatchObject({
        text: '回答',
        reasoningContent: '思考',
      });
    });

    it.each([null, '之前的思考'])(
      '工具历史补占位并回传 reasoning_content=%s',
      async (reasoning) => {
        transport.responses.push(openAIStream([{ content: '回答' }]));
        await service.generateText(
          { ...config, customHeaders: { 'X-Fixture': 'generation' } },
          {
            tools,
            messages: [
              { role: 'system', content: '' },
              { role: 'user', content: '问题' },
              { role: 'assistant', content: ' ' },
              {
                role: 'assistant',
                content: '',
                ...(reasoning ? { reasoning_content: reasoning } : {}),
                tool_calls: [
                  {
                    id: 'call-a',
                    type: 'function',
                    function: { name: 'read_book', arguments: '{"id":"a"}' },
                  },
                ],
              },
              { role: 'tool', content: '', tool_call_id: 'call-a', name: 'read_book' },
            ],
          },
        );
        expect(transport.requests[0]?.headers.get('x-fixture')).toBe('generation');
        expect(transport.requests[0]?.body).toMatchObject({
          tool_choice: 'auto',
          messages: [
            { role: 'user', content: '问题' },
            { role: 'assistant', content: TOOL_CALL_PLACEHOLDER, reasoning_content: reasoning },
            {
              role: 'tool',
              content: '（工具返回为空）',
              name: 'read_book',
              tool_call_id: 'call-a',
            },
          ],
        });
      },
    );

    it.each([
      [undefined, undefined],
      [0, undefined],
      [0.5, 1],
      [100000, 65536],
      [1234, 1234],
    ])('max_tokens %s → %s', async (limit, expected) => {
      transport.responses.push(openAIStream([{ content: '回答' }]));
      await service.generateText({ ...config, maxOutputTokens: limit }, { prompt: '问题' });
      expect(transport.requests[0]?.body.max_tokens).toBe(expected);
    });

    it.each([
      [undefined, 'https://api.openai.com/v1/chat/completions'],
      ['https://fixture.test/', 'https://fixture.test/v1/chat/completions'],
      ['https://fixture.test/custom///', 'https://fixture.test/custom/chat/completions'],
      ['/api/ai/fixture', 'http://localhost/api/ai/fixture/chat/completions'],
    ])('baseUrl %s → %s', async (baseUrl, expected) => {
      transport.responses.push(openAIStream([{ content: '回答' }]));
      const result = await service.generateText({ ...config, baseUrl }, { prompt: '问题' });
      expect(transport.requests[0]?.url).toBe(expected);
      expect(transport.requests[0]?.body.messages).toEqual([{ role: 'user', content: '问题' }]);
      expect(transport.proxy).toHaveBeenCalledWith(expected, false);
      expect(result.model).toBe('served-model');
    });
  }
});
