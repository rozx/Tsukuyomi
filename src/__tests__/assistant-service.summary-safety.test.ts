import './setup';
import { afterEach, beforeEach, describe, it, mock, spyOn } from 'bun:test';
import { expect } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { AssistantService } from 'src/services/ai/tasks/assistant-service';
import { AIServiceFactory } from 'src/services/ai/ai-service-factory';
import { ToolRegistry } from 'src/services/ai/tools/tool-registry';
import { MemoryService } from 'src/services/memory-service';
import { estimateMessagesTokenCount } from 'src/utils/ai-token-utils';
import { SUMMARY_SYSTEM_PROMPT } from 'src/services/ai/tasks/prompts/assistant';
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
  request.messages?.[0]?.role === 'system' &&
  request.messages[0]?.content === SUMMARY_SYSTEM_PROMPT;

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

  it('summarizeSession 应截断超长输入，使摘要请求本身不超过模型上下文窗口', async () => {
    let capturedRequest: TextGenerationRequest | undefined;
    generateTextMock.mockImplementation(
      (_config: AIServiceConfig, request: TextGenerationRequest) => {
        capturedRequest = request;
        return { text: '这是一次有效的会话摘要内容，长度超过二十个字符以通过校验。' };
      },
    );

    const model = makeAssistantModel({ maxInputTokens: 2000, maxOutputTokens: 500 });
    const messages = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `消息${i}：` + 'あ'.repeat(1000),
    }));

    await AssistantService.summarizeSession(model, messages);

    expect(capturedRequest).toBeDefined();
    const promptTokens = estimateMessagesTokenCount(capturedRequest!.messages || []);
    expect(promptTokens).toBeLessThanOrEqual(Math.floor(2000 * 0.8));
    // 最近的消息应保留（截断从最早的开始丢弃）
    const promptText = capturedRequest!.messages?.map((m) => m.content).join('\n') || '';
    expect(promptText).toContain('消息29：');
  });

  it('摘要校验失败时降级摘要应保留 previousSummary，而不是丢弃既有上下文', async () => {
    generateTextMock.mockImplementation(() => ({ text: '抱歉，我无法总结这段对话。' }));

    const previousSummary = '之前累计的重要摘要内容：主角名字是月詠，正在翻译第三卷。';
    const summary = await AssistantService.summarizeSession(
      makeAssistantModel(),
      [
        { role: 'user', content: '继续翻译' },
        { role: 'assistant', content: '好的' },
      ],
      { previousSummary },
    );

    expect(summary).toContain('主角名字是月詠');
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

  it('getFallbackMessages 不应以孤儿 tool 消息开头', () => {
    const svc = AssistantService as unknown as {
      getFallbackMessages(messages: ChatMessage[], count?: number): ChatMessage[];
    };
    const history: ChatMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: '问题 1' },
      {
        role: 'assistant',
        content: '（占位）',
        tool_calls: [
          { id: 'call-1', type: 'function', function: { name: 'small_tool', arguments: '{}' } },
        ],
      },
      { role: 'tool', content: '{"success":true}', tool_call_id: 'call-1', name: 'small_tool' },
      { role: 'tool', content: '{"success":true}', tool_call_id: 'call-2', name: 'small_tool' },
      { role: 'assistant', content: '回答 1' },
      { role: 'user', content: '问题 2' },
      { role: 'assistant', content: '回答 2' },
    ];

    // slice(-5) 会以 tool 消息开头 → 修复后应剔除孤儿 tool 消息
    const fallback = svc.getFallbackMessages(history, 5);
    const nonSystem = fallback.filter((m) => m.role !== 'system');
    expect(nonSystem[0]?.role).not.toBe('tool');
  });

  it('reduceMessagesOnce 缩减后不应以孤儿 tool 消息开头', () => {
    const svc = AssistantService as unknown as {
      reduceMessagesOnce(messages: ChatMessage[]): ChatMessage[] | null;
    };
    const messages: ChatMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: '问题 1' },
      {
        role: 'assistant',
        content: '（占位）',
        tool_calls: [
          { id: 'call-1', type: 'function', function: { name: 'small_tool', arguments: '{}' } },
        ],
      },
      { role: 'tool', content: '{"r":1}', tool_call_id: 'call-1', name: 'small_tool' },
      { role: 'tool', content: '{"r":2}', tool_call_id: 'call-2', name: 'small_tool' },
      { role: 'assistant', content: '回答 1' },
      { role: 'user', content: '最后的问题' },
    ];

    const reduced = svc.reduceMessagesOnce(messages);
    expect(reduced).not.toBeNull();
    const middle = reduced!.slice(1, -1);
    expect(middle[0]?.role).not.toBe('tool');
  });
});
