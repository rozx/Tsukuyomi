import './setup';
import { describe, test, expect, spyOn } from 'bun:test';
import type {
  ChatMessage,
  TextGenerationRequest,
  AIServiceConfig,
  AIToolCall,
  AITool,
} from 'src/services/ai/types/ai-service';
import { executeToolCallLoop } from 'src/services/ai/tasks/utils/ai-task-helper';
import { ToolRegistry } from 'src/services/ai/tools';

describe('executeToolCallLoop', () => {
  const runMismatchRetryTest = async (taskType: 'translation' | 'polish' | 'proofreading') => {
    const calls: Array<{ paragraphs: Array<{ id: string; translation: string }> }> = [];

    const responses = [
      // 模型误标：planning 但带 paragraphs
      { text: `{"status":"planning","paragraphs":[{"id":"p1","translation":"A"}]}` },
      // 被纠正后：用 working 重发同一份内容
      { text: `{"status":"working","paragraphs":[{"id":"p1","translation":"A"}]}` },
      { text: `{"status":"completed"}` },
      { text: `{"status":"end"}` },
    ];

    let idx = 0;
    const generateText = (
      _config: AIServiceConfig,
      _request: TextGenerationRequest,
      _callback: unknown,
    ): Promise<{ text: string; toolCalls?: AIToolCall[]; reasoningContent?: string }> => {
      const r = responses[idx] ?? responses[responses.length - 1]!;
      idx++;
      return Promise.resolve({ text: r.text, reasoningContent: null as unknown as string });
    };

    const history: ChatMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'start' },
    ];

    const result = await executeToolCallLoop({
      history,
      tools: [],
      generateText,
      aiServiceConfig: { apiKey: '', baseUrl: '', model: 'test' },
      taskType,
      chunkText: 'original chunk text',
      paragraphIds: ['p1'],
      bookId: 'book1',
      handleAction: () => {},
      onToast: undefined,
      taskId: undefined,
      aiProcessingStore: undefined,
      logLabel: 'Test',
      maxTurns: 10,
      onParagraphsExtracted: (paragraphs) => {
        calls.push({ paragraphs });
      },
    });

    expect(result.status).toBe('end');
    expect(result.paragraphs.get('p1')).toBe('A');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.paragraphs).toEqual([{ id: 'p1', translation: 'A' }]);

    // 历史中应出现纠正提示
    const corrected = history.some((m) => {
      const mm = m as unknown as { role: string; content?: string | null };
      return mm.role === 'user' && typeof mm.content === 'string' && mm.content.includes('状态与内容不匹配');
    });
    expect(corrected).toBe(true);
  };

  test('翻译任务：planning/completed/end 状态下输出内容应纠正并让模型重试', async () => {
    await runMismatchRetryTest('translation');
  });

  test('润色任务：planning/completed/end 状态下输出内容应纠正并让模型重试', async () => {
    await runMismatchRetryTest('polish');
  });

  test('校对任务：planning/completed/end 状态下输出内容应纠正并让模型重试', async () => {
    await runMismatchRetryTest('proofreading');
  });

  test('首条响应可直接 working（无需先 planning）', async () => {
    const responses = [{ text: `{"status":"working"}` }, { text: `{"status":"completed"}` }, { text: `{"status":"end"}` }];

    let idx = 0;
    const generateText = (
      _config: AIServiceConfig,
      _request: TextGenerationRequest,
      _callback: unknown,
    ): Promise<{ text: string; toolCalls?: AIToolCall[]; reasoningContent?: string }> => {
      const r = responses[idx] ?? responses[responses.length - 1]!;
      idx++;
      return Promise.resolve({ text: r.text, reasoningContent: null as unknown as string });
    };

    const history: ChatMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'start' },
    ];

    const result = await executeToolCallLoop({
      history,
      tools: [],
      generateText,
      aiServiceConfig: { apiKey: '', baseUrl: '', model: 'test' },
      taskType: 'translation',
      chunkText: 'original chunk text',
      paragraphIds: [],
      bookId: 'book1',
      handleAction: () => {},
      onToast: undefined,
      taskId: undefined,
      aiProcessingStore: undefined,
      logLabel: 'Test',
      maxTurns: 10,
    });

    expect(result.status).toBe('end');
  });

  test('同一任务内重复输出同一段落/标题时，应允许更新（last-write-wins）', async () => {
    const calls: Array<{ paragraphs: Array<{ id: string; translation: string }> }> = [];
    const titleCalls: string[] = [];

    const responses = [
      { text: `{"status":"planning"}` },
      {
        text: `{"status":"working","paragraphs":[{"id":"p1","translation":"A"}],"titleTranslation":"T1"}`,
      },
      {
        text: `{"status":"working","paragraphs":[{"id":"p1","translation":"B"}],"titleTranslation":"T2"}`,
      },
      { text: `{"status":"completed"}` },
      { text: `{"status":"end"}` },
    ];

    let idx = 0;
    const generateText = (
      _config: AIServiceConfig,
      _request: TextGenerationRequest,
      _callback: unknown,
    ): Promise<{ text: string; toolCalls?: AIToolCall[]; reasoningContent?: string }> => {
      const r = responses[idx] ?? responses[responses.length - 1]!;
      idx++;
      return Promise.resolve({ text: r.text, reasoningContent: null as unknown as string });
    };

    const history: ChatMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'start' },
    ];

    const result = await executeToolCallLoop({
      history,
      tools: [],
      generateText,
      aiServiceConfig: { apiKey: '', baseUrl: '', model: 'test' },
      taskType: 'translation',
      chunkText: 'original chunk text',
      paragraphIds: ['p1'],
      bookId: 'book1',
      handleAction: () => {},
      onToast: undefined,
      taskId: undefined,
      aiProcessingStore: undefined,
      logLabel: 'Test',
      maxTurns: 10,
      onParagraphsExtracted: (paragraphs) => {
        calls.push({ paragraphs });
      },
      onTitleExtracted: (title) => {
        titleCalls.push(title);
      },
    });

    expect(result.status).toBe('end');
    expect(result.paragraphs.get('p1')).toBe('B');
    expect(result.titleTranslation).toBe('T2');

    // 段落回调：第一次 A，第二次 B（同一ID的更新不应被忽略）
    expect(calls).toHaveLength(2);
    expect(calls[0]?.paragraphs).toEqual([{ id: 'p1', translation: 'A' }]);
    expect(calls[1]?.paragraphs).toEqual([{ id: 'p1', translation: 'B' }]);

    // 标题回调：同理应允许更新
    expect(titleCalls).toEqual(['T1', 'T2']);
  });

  test('只能执行本次会话提供的 tools：未提供的工具调用应被拒绝执行', async () => {
    const handleToolCallSpy = spyOn(ToolRegistry, 'handleToolCall');

    try {
      const toolCallsResponse: AIToolCall[] = [
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'list_terms', arguments: '{}' },
        },
      ];

      const responses = [
        // 第一次：模型试图调用未提供工具
        { toolCalls: toolCallsResponse, text: '' },
        // 后续：按合法状态流转结束（planning → working → completed → end）
        { text: `{"status":"working"}` },
        { text: `{"status":"completed"}` },
        { text: `{"status":"end"}` },
      ];

      let idx = 0;
      const generateText = (
        _config: AIServiceConfig,
        _request: TextGenerationRequest,
        _callback: unknown,
      ): Promise<{ text: string; toolCalls?: AIToolCall[]; reasoningContent?: string }> => {
        const r = responses[idx] ?? responses[responses.length - 1]!;
        idx++;
        if (r.toolCalls) {
          return Promise.resolve({ text: r.text ?? '', toolCalls: r.toolCalls });
        }
        return Promise.resolve({ text: r.text ?? '' });
      };

      const history: ChatMessage[] = [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'start' },
      ];

      // 只提供一个无关工具，模拟 list_terms 不在 tools 列表里
      const tools: AITool[] = [
        {
          type: 'function',
          function: {
            name: 'search_web',
            description: 'search web',
            parameters: { type: 'object', properties: {}, required: [] },
          },
        },
      ];

      const result = await executeToolCallLoop({
        history,
        tools,
        generateText,
        aiServiceConfig: { apiKey: '', baseUrl: '', model: 'test' },
        taskType: 'translation',
        chunkText: 'original chunk text',
        paragraphIds: [],
        bookId: 'book1',
        handleAction: () => {},
        onToast: undefined,
        taskId: undefined,
        aiProcessingStore: undefined,
        logLabel: 'Test',
        maxTurns: 10,
      });

      expect(result.status).toBe('end');
      // 未提供的工具调用不应真正执行
      expect(handleToolCallSpy).not.toHaveBeenCalled();

      // 历史中应出现对该工具的拒绝提示（作为 tool 消息）
      const refused = history.some((m) => {
        const mm = m as unknown as { role: string; name?: string; content?: string };
        return (
          mm.role === 'tool' &&
          mm.name === 'list_terms' &&
          typeof mm.content === 'string' &&
          mm.content.includes('未在本次会话提供')
        );
      });
      expect(refused).toBe(true);
    } finally {
      handleToolCallSpy.mockRestore();
    }
  });
});
