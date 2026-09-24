import '../setup';
import { describe, expect, it } from 'bun:test';
import { transformOpenAIRequest } from '../../services/ai/providers/ai-sdk/request';

describe('OpenAI 请求线格式兼容', () => {
  it('按调用 ID 回填思考、原始参数与工具名称，不按消息位置配对', () => {
    const transform = transformOpenAIRequest({
      messages: [
        {
          role: 'assistant',
          content: '',
          reasoning_content: '先查目录',
          tool_calls: [
            {
              id: 'a',
              type: 'function',
              function: { name: 'read_book', arguments: '{"id": "a"}' },
            },
          ],
        },
        { role: 'tool', content: '结果', tool_call_id: 'a', name: 'read_book' },
      ],
    });
    const body = {
      tools: [{}],
      max_tokens: 999999,
      messages: [
        { role: 'user', content: '问题' },
        {
          role: 'assistant',
          tool_calls: [{ id: 'a', function: { name: 'read_book', arguments: '{"id":"a"}' } }],
        },
        { role: 'tool', tool_call_id: 'a', content: '结果' },
        { role: 'assistant', tool_calls: [{ id: 'b' }] },
      ],
    };
    const before = JSON.stringify(body);
    expect(transform(body)).toMatchObject({
      tool_choice: 'auto',
      max_tokens: 65536,
      messages: [
        { role: 'user' },
        {
          role: 'assistant',
          reasoning_content: '先查目录',
          tool_calls: [{ function: { arguments: '{"id": "a"}' } }],
        },
        { role: 'tool', name: 'read_book' },
        { role: 'assistant', reasoning_content: null },
      ],
    });
    expect(JSON.stringify(body)).toBe(before);
  });

  it.each([0, undefined])('没有输出上限 %s 时不发送 max_tokens', (max_tokens) => {
    expect(transformOpenAIRequest({})({ max_tokens })).not.toHaveProperty('max_tokens');
  });
});
