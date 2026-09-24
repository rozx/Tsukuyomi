import '../setup';
import { describe, expect, it } from 'bun:test';
import { reactive } from 'vue';
import { toModelMessages, normalizeBaseUrl } from '../../services/ai/providers/ai-sdk/messages';
import { parseConfigJson } from '../../services/ai/providers/ai-sdk/config-parser';

describe('AI SDK 边界转换', () => {
  it('工具结果按调用 ID 匹配名称，保留 signature，旧调用只在首个补占位', () => {
    const messages = toModelMessages(
      {
        messages: [
          { role: 'system', content: ' ' },
          { role: 'user', content: '读取' },
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'a',
                type: 'function',
                function: { name: 'read_book', arguments: '{"id":"a"}' },
                providerMetadata: { google: { thoughtSignature: 'signed-a' } },
              },
              { id: 'b', type: 'function', function: { name: 'read_book', arguments: '{}' } },
            ],
          },
          { role: 'tool', tool_call_id: 'b', content: '' },
          { role: 'tool', tool_call_id: 'a', content: '结果' },
        ],
      },
      'gemini',
    );
    expect(messages).toHaveLength(4);
    expect(messages[1]).toMatchObject({
      role: 'assistant',
      content: [
        { type: 'text' },
        {
          type: 'tool-call',
          toolCallId: 'a',
          input: { id: 'a' },
          providerOptions: { google: { thoughtSignature: 'signed-a' } },
        },
        { type: 'tool-call', toolCallId: 'b' },
      ],
    });
    expect(messages[2]).toMatchObject({
      role: 'tool',
      content: [
        {
          toolCallId: 'b',
          toolName: 'read_book',
          output: { type: 'text', value: '（工具返回为空）' },
        },
      ],
    });
  });

  it('缺失 signature 的首个调用带兼容占位，不修改输入', () => {
    const request = {
      messages: [
        {
          role: 'assistant' as const,
          content: '',
          tool_calls: [
            {
              id: 'a',
              type: 'function' as const,
              function: { name: 'read_book', arguments: '{}' },
            },
          ],
        },
      ],
    };
    const before = JSON.stringify(request);
    expect(toModelMessages(request, 'gemini')[0]).toMatchObject({
      content: [
        { type: 'text' },
        { providerOptions: { google: { thoughtSignature: 'skip_thought_signature_validator' } } },
      ],
    });
    expect(JSON.stringify(request)).toBe(before);
  });

  it('仅 prompt 转用户消息，空消息不进入请求', () => {
    expect(toModelMessages({ prompt: '你好' }, 'openai')).toEqual([
      { role: 'user', content: '你好' },
    ]);
    expect(toModelMessages({ messages: [{ role: 'user', content: ' ' }] }, 'openai')).toEqual([]);
  });

  it('Pinia 会话的响应式元数据可回传，不要求 structuredClone 支持 Proxy', () => {
    const request = reactive({
      messages: [
        {
          role: 'assistant' as const,
          content: '',
          tool_calls: [
            {
              id: 'a',
              type: 'function' as const,
              function: { name: 'read_book', arguments: '{}' },
              providerMetadata: { google: { thoughtSignature: 'saved-signature' } },
            },
          ],
        },
      ],
    });
    expect(toModelMessages(request, 'gemini')[0]).toMatchObject({
      content: [
        { type: 'text' },
        { providerOptions: { google: { thoughtSignature: 'saved-signature' } } },
      ],
    });
  });

  it.each([
    [undefined, 'https://api.openai.com/v1'],
    [' https://fixture.test/ ', 'https://fixture.test/v1'],
    ['https://fixture.test/custom///', 'https://fixture.test/custom'],
    ['/api/ai/fixture/', 'http://localhost/api/ai/fixture'],
  ])('规范化地址 %s', (input, expected) => {
    expect(normalizeBaseUrl(input)).toBe(expected);
  });

  it.each([
    [
      '{"maxInputTokens":128000,"maxOutputTokens":8192}',
      { maxInputTokens: 128000, maxOutputTokens: 8192 },
    ],
    ['{"contextWindow":32000,"maxTokens":1024}', { maxInputTokens: 32000, maxOutputTokens: 1024 }],
    [
      'limits: maxInputTokens: 1000, maxOutputTokens: 200',
      { maxInputTokens: 1000, maxOutputTokens: 200 },
    ],
    [null, {}],
    ['未知', {}],
  ])('共享配置解析 %s', (content, expected) => {
    expect(parseConfigJson(content)).toEqual(expected);
  });
});
