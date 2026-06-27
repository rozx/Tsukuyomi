import './setup';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
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
  TextGenerationRequest,
} from 'src/services/ai/types/ai-service';

const generateTextMock = mock((_config: AIServiceConfig, _request: TextGenerationRequest) => ({
  text: '',
}));
const handleToolCallMock = mock(() =>
  Promise.resolve({ tool_call_id: '', role: 'tool', name: '', content: '' }),
);
const createMemoryMock = mock(() => undefined);

const bigTool: AITool = {
  type: 'function',
  function: {
    name: 'big_context_tool',
    description: '返回大量上下文',
    parameters: { type: 'object', properties: {}, required: [] },
  },
};

const makeAssistantModel = (): AIModel => ({
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
});

describe('AssistantService - 工具循环内 summary', () => {
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
      () => [bigTool],
    );
    spyOn(ToolRegistry, 'handleToolCall').mockImplementation(handleToolCallMock as never);
    spyOn(MemoryService, 'createMemory').mockImplementation(createMemoryMock as never);
  });

  afterEach(() => {
    mock.restore();
  });

  it('工具结果把 context 推过阈值时，应在同一轮工具调用中触发 summary 并继续请求', async () => {
    const inLoopSummary = '这是一次足够长的工具循环摘要，用于在上下文过载后继续完成当前助手请求。';
    const oversizedToolResult = '大量工具结果内容 '.repeat(30_000);
    const onSummarizingStart = mock(() => {});
    const onSummarizingEnd = mock(() => {});

    handleToolCallMock.mockResolvedValue({
      tool_call_id: 'call-big-context',
      role: 'tool',
      name: 'big_context_tool',
      content: oversizedToolResult,
    });

    generateTextMock.mockImplementation(
      (
        _config: AIServiceConfig,
        request: TextGenerationRequest,
      ): {
        text: string;
        toolCalls?: Array<{
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }>;
      } => {
        const callNumber = generateTextMock.mock.calls.length;
        if (callNumber === 1) {
          return {
            text: '',
            toolCalls: [
              {
                id: 'call-big-context',
                type: 'function',
                function: { name: 'big_context_tool', arguments: '{}' },
              },
            ],
          };
        }

        if (callNumber === 2) {
          return { text: inLoopSummary };
        }

        expect(request.messages?.[0]?.content).toContain(inLoopSummary);
        return { text: '已根据压缩后的上下文完成回答。' };
      },
    );

    const result = await AssistantService.chat(makeAssistantModel(), '请读取大量资料后回答', {
      onSummarizingStart,
      onSummarizingEnd,
    });

    expect(handleToolCallMock).toHaveBeenCalledTimes(1);
    expect(onSummarizingStart).toHaveBeenCalledTimes(1);
    expect(onSummarizingEnd).toHaveBeenCalledTimes(1);
    expect(generateTextMock).toHaveBeenCalledTimes(3);
    expect(result.text).toBe('已根据压缩后的上下文完成回答。');
    expect(result.summary).toContain(inLoopSummary);
    expect(result.messageHistory?.[0]?.content).toContain(inLoopSummary);
  });

  it('有历史会话时，工具循环 summary 后应继续当前用户消息而不是第一条历史用户消息', async () => {
    const inLoopSummary = '这是一次足够长的历史会话工具循环摘要，用于继续当前用户请求。';
    const oversizedToolResult = '历史会话的大量工具结果内容 '.repeat(30_000);

    handleToolCallMock.mockResolvedValue({
      tool_call_id: 'call-big-context',
      role: 'tool',
      name: 'big_context_tool',
      content: oversizedToolResult,
    });

    generateTextMock.mockImplementation(
      (
        _config: AIServiceConfig,
        request: TextGenerationRequest,
      ): {
        text: string;
        toolCalls?: Array<{
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }>;
      } => {
        const callNumber = generateTextMock.mock.calls.length;
        if (callNumber === 1) {
          return {
            text: '',
            toolCalls: [
              {
                id: 'call-big-context',
                type: 'function',
                function: { name: 'big_context_tool', arguments: '{}' },
              },
            ],
          };
        }

        if (callNumber === 2) {
          return { text: inLoopSummary };
        }

        const restartUserMessage = request.messages?.findLast((msg) => msg.role === 'user');
        expect(restartUserMessage?.content).toBe('当前这次需要调用工具的问题');
        return { text: '已回答当前问题。' };
      },
    );

    const result = await AssistantService.chat(makeAssistantModel(), '当前这次需要调用工具的问题', {
      messageHistory: [
        { role: 'user', content: '第一条历史问题' },
        { role: 'assistant', content: '第一条历史回答' },
      ],
    });

    expect(generateTextMock).toHaveBeenCalledTimes(3);
    expect(result.text).toBe('已回答当前问题。');
  });
});
