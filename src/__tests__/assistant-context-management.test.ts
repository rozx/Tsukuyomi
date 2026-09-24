import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantService } from '../services/ai/tasks/assistant-service';
import { AIServiceFactory } from '../services/ai/ai-service-factory';
import { ToolRegistry } from '../services/ai/tools/tool-registry';
import type { AIModel } from '../services/ai/types/ai-model';
import type {
  ChatMessage,
  TextGenerationRequest,
  TextGenerationResult,
  AITool,
} from '../services/ai/types/ai-service';
import { createContextAnchor, modelContextKey } from '../services/ai/context/measure';

const off = { enabled: false, temperature: 0.7 };
const model: AIModel = {
  id: 'context-model',
  provider: 'openai',
  model: 'context-test',
  name: '测试',
  apiKey: 'fixture',
  baseUrl: 'https://fixture.test',
  enabled: true,
  lastEdited: new Date(0),
  temperature: 0.7,
  maxInputTokens: 128000,
  maxOutputTokens: 2048,
  limitsSource: 'manual',
  isDefault: { translation: off, proofreading: off, termsTranslation: off, assistant: off },
};
const summary =
  '目标：继续翻译。约束与偏好：保留角色名字。进展：前两章已完成。下一步：第三章。关键标识：book-123。';
const history: ChatMessage[] = [
  { role: 'user', content: '旧请求' },
  { role: 'assistant', content: '旧回复 '.repeat(18000) },
];
const isSummary = (request: TextGenerationRequest) =>
  request.messages?.some((m) => m.content?.includes('【新增对话内容】'));
const tool: AITool = {
  type: 'function',
  function: {
    name: 'read_book',
    description: '读取',
    parameters: { type: 'object', properties: {} },
  },
};
let requests: ChatMessage[][];
let summaries: number;
let main: (request: TextGenerationRequest) => TextGenerationResult | Promise<TextGenerationResult>;
beforeEach(() => {
  requests = [];
  summaries = 0;
  main = () => ({ text: '本轮完成。', usage: { inputTokens: 42000 } });
  vi.spyOn(ToolRegistry, 'getAssistantToolsExcludingTranslationManagement').mockReturnValue([]);
  vi.spyOn(AIServiceFactory.getService('openai'), 'generateText').mockImplementation(
    async (_config, request) => {
      if (isSummary(request)) {
        summaries++;
        return { text: summary };
      }
      requests.push(structuredClone(request.messages!));
      return await main(request);
    },
  );
});
afterEach(() => vi.restoreAllMocks());

describe('助手共享上下文管理', () => {
  it('发送前压缩保留当前请求，摘要更新而非重复追加，响应带实测锚点', async () => {
    const start = vi.fn(),
      end = vi.fn();
    const result = await AssistantService.chat({ ...model, maxInputTokens: 30000 }, '继续第三章', {
      messageHistory: history,
      sessionSummary: '早期摘要',
      onSummarizingStart: start,
      onSummarizingEnd: end,
    });
    expect(summaries).toBeGreaterThan(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.at(-1)?.content).toBe('继续第三章');
    expect(requests[0]?.[0]?.content).toContain(summary);
    expect(requests[0]?.[0]?.content).not.toContain('早期摘要');
    expect(result.summary).toBe(summary);
    expect(result.contextAnchor?.inputTokens).toBe(42000);
    expect(start).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
  });
  it('工具循环使用上一请求 usage 触发压缩，保留调用与结果身份', async () => {
    vi.spyOn(ToolRegistry, 'getAssistantToolsExcludingTranslationManagement').mockReturnValue([
      tool,
    ]);
    vi.spyOn(ToolRegistry, 'handleToolCall').mockResolvedValue({
      role: 'tool',
      name: 'read_book',
      tool_call_id: 'call1',
      content: '详细结果 '.repeat(15000),
    });
    main = () =>
      requests.length === 1
        ? {
            text: '',
            toolCalls: [
              { id: 'call1', type: 'function', function: { name: 'read_book', arguments: '{}' } },
            ],
            usage: { inputTokens: 125000 },
          }
        : { text: '继续成功', usage: { inputTokens: 18000 } };
    const result = await AssistantService.chat(model, '读取并继续');
    expect(summaries).toBeGreaterThan(0);
    expect(requests).toHaveLength(2);
    expect(result.summary).toBe(summary);
    expect(result.contextAnchor?.inputTokens).toBe(18000);
    expect(requests[1]?.filter((m) => m.role === 'user').map((m) => m.content)).toEqual([
      '读取并继续',
    ]);
  });
  it.each([0, 128000])('窗口 %s 下消息条数不触发摘要', async (window) => {
    const many: ChatMessage[] = Array.from({ length: 182 }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content: '短消息',
    }));
    await AssistantService.chat({ ...model, maxInputTokens: window }, '继续', {
      messageHistory: many,
    });
    expect(summaries).toBe(0);
    expect(requests[0]).toHaveLength(184);
  });
  it('窗口未知时仍可对真实超限恢复一次', async () => {
    main = () => {
      if (requests.length === 1) throw new Error('context_too_large');
      return { text: '恢复成功' };
    };
    const result = await AssistantService.chat({ ...model, maxInputTokens: 0 }, '继续', {
      messageHistory: history,
    });
    expect(requests).toHaveLength(2);
    expect(summaries).toBeGreaterThan(0);
    expect(result.text).toBe('恢复成功');
  });
  it('重试仍超限时不会第三次重试，也不改变调用者历史', async () => {
    main = () => {
      throw new Error('context window exceeded');
    };
    const before = JSON.stringify(history);
    await expect(
      AssistantService.chat({ ...model, maxInputTokens: 0 }, '继续', { messageHistory: history }),
    ).rejects.toThrow('新建会话');
    expect(requests).toHaveLength(2);
    expect(JSON.stringify(history)).toBe(before);
  });
  it('压缩不适用时不重发无效的相同请求', async () => {
    main = () => {
      throw new Error('context window exceeded');
    };
    const start = vi.fn();
    await expect(
      AssistantService.chat({ ...model, maxInputTokens: 0 }, '单条太长的请求', {
        onSummarizingStart: start,
      }),
    ).rejects.toThrow('新建会话');
    expect(start).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
    expect(summaries).toBe(0);
  });
  it('预判摘要失败仍发送完整历史并通知用户', async () => {
    const spy = vi.spyOn(AIServiceFactory.getService('openai'), 'generateText');
    const original = spy.getMockImplementation()!;
    spy.mockImplementation(async (c, r, callback) => {
      if (isSummary(r)) throw new Error('摘要服务不可用');
      return original(c, r, callback);
    });
    const onToast = vi.fn();
    const result = await AssistantService.chat({ ...model, maxInputTokens: 30000 }, '继续', {
      messageHistory: history,
      onToast,
    });
    expect(requests[0]?.[2]?.content).toBe(history[1]?.content);
    expect(result.summary).toBeUndefined();
    expect(onToast).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warn' }));
  });
  it('没有 usage 时清除上次锚点，不用旧实测伪装本轮结果', async () => {
    main = () => ({ text: '没有 usage' });
    const anchor = createContextAnchor(
      { systemPrompt: '旧提示', tools: [], history, modelKey: modelContextKey(model) },
      1000,
    )!;
    const result = await AssistantService.chat(model, '继续', {
      messageHistory: history,
      contextAnchor: anchor,
    });
    expect(result.contextAnchor).toBeUndefined();
  });
  it('没有局部通知回调的宿主也通过全局通知告知压缩失败', async () => {
    const globalToast = vi.fn();
    const previous = (window as unknown as { __lunaToast?: unknown }).__lunaToast;
    (window as unknown as { __lunaToast?: unknown }).__lunaToast = globalToast;
    const spy = vi.spyOn(AIServiceFactory.getService('openai'), 'generateText');
    const original = spy.getMockImplementation()!;
    spy.mockImplementation(async (c, r, cb) => {
      if (isSummary(r)) throw new Error('摘要不可用');
      return original(c, r, cb);
    });
    try {
      await AssistantService.chat({ ...model, maxInputTokens: 30000 }, '继续', {
        messageHistory: history,
      });
      expect(globalToast).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warn' }));
    } finally {
      (window as unknown as { __lunaToast?: unknown }).__lunaToast = previous;
    }
  });
});
