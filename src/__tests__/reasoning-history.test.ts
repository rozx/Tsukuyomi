import './setup';
import { captureExecutionLanguages } from 'src/services/ai/tasks/utils/execution-languages';
import { describe, test, expect, spyOn, mock, afterEach } from 'bun:test';
import type {
  ChatMessage,
  AIToolCall,
  AITool,
  TextGenerationResult,
} from 'src/services/ai/types/ai-service';
import { executeToolCallLoop } from 'src/services/ai/tasks/utils';
import { assistantReasoningFields } from 'src/services/ai/tasks/utils/reasoning-history';
import { ToolRegistry } from 'src/services/ai/tools';

/**
 * 思考块签名回传
 *
 * Claude 开启思考并调用工具时，下一轮请求里带 tool_use 的 assistant 消息必须以原样的
 * thinking 块（含签名）开头，否则返回 400。历史只存思考文字会丢掉签名。
 */
const signed = [{ text: '先查书', providerMetadata: { anthropic: { signature: 'sig-1' } } }];

describe('assistantReasoningFields', () => {
  test('同时保留思考文字与带签名的片段', () => {
    expect(
      assistantReasoningFields({ reasoningContent: '先查书', reasoningParts: signed }),
    ).toEqual({ reasoning_content: '先查书', reasoning_parts: signed });
  });

  test('没有思考时只给出 null 的 reasoning_content，不附加空片段', () => {
    expect(assistantReasoningFields({})).toEqual({ reasoning_content: null });
    expect(assistantReasoningFields({ reasoningParts: [] })).toEqual({ reasoning_content: null });
  });
});

describe('task-runner 工具轮次保留思考签名', () => {
  afterEach(() => {
    mock.restore();
  });

  test('下一轮请求中的 assistant 工具消息带着上一轮的签名片段', async () => {
    spyOn(ToolRegistry, 'handleToolCall').mockResolvedValue({
      content: JSON.stringify({ success: true }),
    } as never);
    const tools: AITool[] = [
      {
        type: 'function',
        function: {
          name: 'read_book',
          description: 'read',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      },
    ];
    const history: ChatMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'start' },
    ];
    const snapshots: ChatMessage[][] = [];
    let turn = 0;
    const generateText = (): Promise<TextGenerationResult> => {
      snapshots.push(history.map((message) => ({ ...message })));
      turn++;
      if (turn > 1) return Promise.reject(new Error('stop'));
      return Promise.resolve({
        text: '',
        reasoningContent: '先查书',
        reasoningParts: signed,
        toolCalls: [
          { id: 't1', type: 'function', function: { name: 'read_book', arguments: '{}' } },
        ],
      });
    };

    await executeToolCallLoop({
      history,
      tools,
      generateText,
      aiServiceConfig: { apiKey: '', baseUrl: '', model: 'test' },
      taskType: 'polish',
      chunkText: '[1] [ID: p1] 原文: 测试\n翻译: \n\n',
      paragraphIds: ['p1'],
      bookId: 'book-1',
      handleAction: () => {},
      onToast: undefined,
      taskId: undefined,
      aiProcessingStore: undefined,
      languages: captureExecutionLanguages('zh-CN'),
      logLabel: 'Test',
      maxTurns: 3,
      chunkIndex: 0,
    }).catch(() => undefined);

    const assistant = snapshots[1]?.find(
      (message: ChatMessage) => message.role === 'assistant' && message.tool_calls?.length,
    );
    expect(assistant?.reasoning_parts).toEqual(signed);
    expect(assistant?.reasoning_content).toBe('先查书');
  });
});
