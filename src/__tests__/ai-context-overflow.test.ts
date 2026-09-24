import './setup';
import { describe, expect, it } from 'bun:test';
import { APICallError } from 'ai';
import { isContextOverflowError } from '../services/ai/context/context-overflow';

describe('上下文超限错误识别', () => {
  it.each([
    'context_length_exceeded',
    'context_too_large',
    "This model's maximum context length is 128000 tokens.",
    'Your input exceeds the context window of this model. Please adjust your input and try again.',
    'Too many tokens in the request',
    'INPUT IS TOO LONG',
    'Prompt is too long',
    'Request exceeds the maximum number of tokens',
    'Token limit exceeded',
  ])('识别厂商错误：%s', (message) => {
    expect(isContextOverflowError(new Error(message))).toBe(true);
  });

  it('接受 AI SDK APICallError 的原始 message', () => {
    expect(
      isContextOverflowError(
        new APICallError({
          message:
            'Your input exceeds the context window of this model. Please adjust your input and try again.',
          url: 'https://fixture.test/v1/chat/completions',
          requestBodyValues: {},
          statusCode: 400,
          isRetryable: false,
        }),
      ),
    ).toBe(true);
  });

  it.each([
    null,
    undefined,
    '',
    'Invalid API key',
    'Token rate limit exceeded',
    'Daily token quota limit exceeded',
    'max_tokens must be between 1 and 65536',
    '{"model":"deepseek-v4.1-flash"}',
  ])('不把无明确信息、鉴权或用量配额错误当作上下文超限：%s', (error) => {
    expect(isContextOverflowError(error)).toBe(false);
  });
});
