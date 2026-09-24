import './setup';
import { afterEach, beforeEach, describe, it, mock, spyOn } from 'bun:test';
import { expect } from 'vitest';
import { APICallError } from 'ai';
import { createPinia, setActivePinia } from 'pinia';
import { AssistantService } from 'src/services/ai/tasks/assistant-service';
import { AIServiceFactory } from 'src/services/ai/ai-service-factory';
import { ToolRegistry } from 'src/services/ai/tools/tool-registry';
import { MemoryService } from 'src/services/memory-service';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type {
  AIService,
  AITool,
  AIServiceConfig,
  ChatMessage,
  TextGenerationRequest,
} from 'src/services/ai/types/ai-service';

const generateTextMock = mock((_config: AIServiceConfig, _request: TextGenerationRequest) => ({
  text: '',
}));
const handleToolCallMock = mock((_toolCall: unknown = undefined) =>
  Promise.resolve({ tool_call_id: '', role: 'tool', name: '', content: '' }),
);
const createMemoryMock = mock(() => undefined);

const smallTool: AITool = {
  type: 'function',
  function: {
    name: 'small_tool',
    description: '测试工具',
    parameters: { type: 'object', properties: {}, required: [] },
  },
};

const makeAssistantModel = (overrides: Partial<AIModel> = {}): AIModel => ({
  id: 'assistant-model',
  name: 'Assistant Model',
  provider: 'openai',
  model: 'test-model',
  temperature: 0.7,
  maxInputTokens: 20_000,
  maxOutputTokens: 1000,
  apiKey: 'test-key',
  baseUrl: 'https://example.test',
  isDefault: {
    translation: { enabled: false, temperature: 0.7 },
    proofreading: { enabled: false, temperature: 0.7 },
    termsTranslation: { enabled: false, temperature: 0.7 },
    assistant: { enabled: true, temperature: 0.7 },
  },
  enabled: true,
  lastEdited: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const isSummaryRequest = (request: TextGenerationRequest): boolean =>
  request.messages?.[0]?.content?.includes('【新增对话内容】') ?? false;

describe('AssistantService - 摘要失败与安全性', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    generateTextMock.mockReset();
    handleToolCallMock.mockReset();
    createMemoryMock.mockReset();
    spyOn(AIServiceFactory, 'getService').mockImplementation(
      () => ({ generateText: generateTextMock }) as unknown as AIService,
    );
    spyOn(ToolRegistry, 'getAssistantToolsExcludingTranslationManagement').mockImplementation(
      () => [smallTool],
    );
    spyOn(ToolRegistry, 'handleToolCall').mockImplementation(handleToolCallMock as never);
    spyOn(MemoryService, 'createMemory').mockImplementation(createMemoryMock as never);
  });

  afterEach(() => {
    mock.restore();
  });

  it('真实 context window 错误即使不含 token，也应摘要后恢复一次请求', async () => {
    const summary = '本次对话使用合成历史验证上下文超限恢复，需要保留测试目标并继续正常回复。';
    const onSummarizingStart = mock(() => {});
    const onSummarizingEnd = mock(() => {});
    generateTextMock
      .mockImplementationOnce(() => {
        throw new APICallError({
          message:
            'Your input exceeds the context window of this model. Please adjust your input and try again.',
          url: 'https://fixture.test/v1/chat/completions',
          requestBodyValues: {},
          statusCode: 400,
          isRetryable: false,
        });
      })
      .mockReturnValueOnce({ text: summary })
      .mockReturnValueOnce({ text: '已恢复回复。' });

    const result = await AssistantService.chat(
      makeAssistantModel({ maxInputTokens: 100_000 }),
      '继续验证',
      {
        messageHistory: [
          { role: 'user', content: '我们在验证上下文管理。' },
          { role: 'assistant', content: '使用合成历史进行测试。'.repeat(3000) },
          { role: 'user', content: '发生超限时先摘要。' },
          { role: 'assistant', content: '摘要后继续回复。' },
        ],
        onSummarizingStart,
        onSummarizingEnd,
      },
    );
    expect(result).toMatchObject({ text: '已恢复回复。', summary });
    expect(generateTextMock).toHaveBeenCalledTimes(3);
    expect(onSummarizingStart).toHaveBeenCalledTimes(1);
    expect(onSummarizingEnd).toHaveBeenCalledTimes(1);
  });

  it('预请求摘要失败时应调用 onSummarizingEnd，且后续回复正常返回', async () => {
    const onSummarizingStart = mock(() => {});
    const onSummarizingEnd = mock(() => {});

    generateTextMock.mockImplementation(
      (_config: AIServiceConfig, request: TextGenerationRequest) => {
        if (isSummaryRequest(request)) {
          throw new Error('summary generation failed');
        }
        return { text: '降级后的正常回复' };
      },
    );

    const longHistory: ChatMessage[] = Array.from({ length: 6 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `历史消息 ${i} ` + 'テスト内容。'.repeat(200),
    }));

    const result = await AssistantService.chat(
      makeAssistantModel({ maxInputTokens: 1500, maxOutputTokens: 200 }),
      '继续',
      {
        messageHistory: longHistory,
        onSummarizingStart,
        onSummarizingEnd,
      },
    );

    expect(onSummarizingStart).toHaveBeenCalledTimes(1);
    expect(onSummarizingEnd).toHaveBeenCalledTimes(1);
    expect(result.text).toBe('降级后的正常回复');
  });

  it('工具循环内摘要失败时应调用 onSummarizingEnd，回退到 followUp 请求', async () => {
    const onSummarizingStart = mock(() => {});
    const onSummarizingEnd = mock(() => {});
    const oversizedToolResult = '大量工具结果内容 '.repeat(30_000);

    handleToolCallMock.mockResolvedValue({
      tool_call_id: 'call-1',
      role: 'tool',
      name: 'small_tool',
      content: oversizedToolResult,
    });

    generateTextMock.mockImplementation(
      (_config: AIServiceConfig, request: TextGenerationRequest) => {
        const callNumber = generateTextMock.mock.calls.length;
        if (callNumber === 1) {
          return {
            text: '',
            toolCalls: [
              { id: 'call-1', type: 'function', function: { name: 'small_tool', arguments: '{}' } },
            ],
          };
        }
        if (isSummaryRequest(request)) {
          throw new Error('summary generation failed');
        }
        return { text: '摘要失败后的回退回答' };
      },
    );

    const result = await AssistantService.chat(makeAssistantModel(), '请读取大量资料后回答', {
      onSummarizingStart,
      onSummarizingEnd,
    });

    expect(onSummarizingStart).toHaveBeenCalledTimes(1);
    expect(onSummarizingEnd).toHaveBeenCalledTimes(1);
    expect(result.text).toBe('摘要失败后的回退回答');
  });

  it('摘要期间用户取消时应向外抛出取消错误，而不是继续发起新请求', async () => {
    const controller = new AbortController();

    generateTextMock.mockImplementation(
      (_config: AIServiceConfig, request: TextGenerationRequest) => {
        if (isSummaryRequest(request)) {
          controller.abort();
          throw new Error('Request was aborted');
        }
        return { text: '不应到达的回复' };
      },
    );

    const longHistory: ChatMessage[] = Array.from({ length: 6 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `历史消息 ${i} ` + 'テスト内容。'.repeat(200),
    }));

    await expect(
      AssistantService.chat(
        makeAssistantModel({ maxInputTokens: 1500, maxOutputTokens: 200 }),
        '继续',
        {
          messageHistory: longHistory,
          signal: controller.signal,
        },
      ),
    ).rejects.toThrow();

    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it('工具循环达到轮次上限时，历史不应残留没有工具结果的 tool_calls 消息', async () => {
    handleToolCallMock.mockImplementation(() =>
      Promise.resolve({
        tool_call_id: `call-${handleToolCallMock.mock.calls.length}`,
        role: 'tool',
        name: 'small_tool',
        content: '{"success":true}',
      }),
    );

    generateTextMock.mockImplementation(() => {
      const n = generateTextMock.mock.calls.length;
      return {
        text: '',
        toolCalls: [
          {
            id: `call-${n}`,
            type: 'function',
            function: { name: 'small_tool', arguments: '{}' },
          },
        ],
      };
    });

    // 修正 handleToolCall 的 tool_call_id 与请求对应
    handleToolCallMock.mockImplementation((toolCall: unknown) =>
      Promise.resolve({
        tool_call_id: (toolCall as { id: string }).id,
        role: 'tool',
        name: 'small_tool',
        content: '{"success":true}',
      }),
    );

    const result = await AssistantService.chat(makeAssistantModel(), '不断调用工具');

    const history = result.messageHistory || [];
    // 每条带 tool_calls 的 assistant 消息后面必须跟齐全的 tool 结果
    history.forEach((msg, idx) => {
      if (msg.role === 'assistant' && msg.tool_calls?.length) {
        const followingToolIds = new Set<string>();
        for (let j = idx + 1; j < history.length && history[j]?.role === 'tool'; j++) {
          const id = history[j]?.tool_call_id;
          if (id) followingToolIds.add(id);
        }
        for (const call of msg.tool_calls) {
          expect(followingToolIds.has(call.id)).toBe(true);
        }
      }
    });
  });

  it('用户取消后，同一轮剩余的工具调用不应继续执行', async () => {
    const controller = new AbortController();

    handleToolCallMock.mockImplementation((toolCall: unknown) => {
      controller.abort();
      return Promise.resolve({
        tool_call_id: (toolCall as { id: string }).id,
        role: 'tool',
        name: 'small_tool',
        content: '{"success":true}',
      });
    });

    generateTextMock.mockImplementation(() => {
      if (generateTextMock.mock.calls.length === 1) {
        return {
          text: '',
          toolCalls: [
            { id: 'call-1', type: 'function', function: { name: 'small_tool', arguments: '{}' } },
            { id: 'call-2', type: 'function', function: { name: 'small_tool', arguments: '{}' } },
          ],
        };
      }
      return { text: '不应到达的回复' };
    });

    await expect(
      AssistantService.chat(makeAssistantModel(), '执行两个工具', { signal: controller.signal }),
    ).rejects.toThrow();

    expect(handleToolCallMock).toHaveBeenCalledTimes(1);
  });
});
