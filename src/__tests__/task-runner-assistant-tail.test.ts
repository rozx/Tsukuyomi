import './setup';
import { captureExecutionLanguages } from 'src/services/ai/tasks/utils/execution-languages';
import { describe, test, expect, spyOn, mock, afterEach } from 'bun:test';
import type { ChatMessage, AIToolCall, AITool } from 'src/services/ai/types/ai-service';
import { executeToolCallLoop } from 'src/services/ai/tasks/utils';
import { ToolRegistry } from 'src/services/ai/tools';
import { TodoListService } from 'src/services/todo-list-service';
import type { AIProcessingStore } from 'src/services/ai/tasks/utils/task-types';

/**
 * 状态转换被拒绝后的历史结构回归测试
 *
 * 1. Claude 4.6+ 等模型把以 assistant 结尾的请求视为 prefill 并直接返回 400。
 * 2. OpenAI 兼容接口要求 tool 结果紧跟带 tool_calls 的 assistant 消息。
 * 工具路径里拒绝状态转换时，曾在 tool_calls 与 tool 结果之间插入一条纯文本 assistant，
 */

/** 每次请求时的历史必须结构合法：tool 结果紧跟 tool_calls，且不以 assistant 结尾 */
function expectWellFormed(history: ChatMessage[]) {
  history.forEach((message, index) => {
    if (message.role !== 'tool') return;
    const previous = history[index - 1];
    const followsCall =
      previous?.role === 'tool' ||
      (previous?.role === 'assistant' && !!previous.tool_calls?.length);
    expect(followsCall).toBe(true);
  });
  expect(history[history.length - 1]?.role).not.toBe('assistant');
}
describe('task-runner 无效状态转换后的历史末尾', () => {
  afterEach(() => {
    mock.restore();
    TodoListService.clearAllTodos();
  });

  const passThroughStatusTool = () =>
    spyOn(ToolRegistry, 'handleToolCall').mockImplementation((toolCall) => {
      const args = JSON.parse(toolCall.function.arguments || '{}') as { status?: string };
      return Promise.resolve({
        content: JSON.stringify({ success: true, new_status: args.status }),
      } as never);
    });

  const baseConfig = {
    tools: [] as AITool[],
    aiServiceConfig: { apiKey: '', baseUrl: '', model: 'test' },
    taskType: 'polish' as const,
    chunkText: '[1] [ID: p1] 原文: 测试\n翻译: \n\n',
    paragraphIds: ['p1'],
    bookId: 'book-1',
    handleAction: () => {},
    onToast: undefined,
    languages: captureExecutionLanguages('zh-CN'),
    logLabel: 'Test',
    maxTurns: 5,
    chunkIndex: 0,
    taskId: undefined as string | undefined,
    aiProcessingStore: undefined as AIProcessingStore | undefined,
  };

  const tools: AITool[] = [
    {
      type: 'function',
      function: {
        name: 'update_task_status',
        description: 'update status',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
  ];

  const statusCall = (id: string, status: string): AIToolCall => ({
    id,
    type: 'function',
    function: { name: 'update_task_status', arguments: JSON.stringify({ status }) },
  });

  test('工具路径无效转换：历史结构合法，并以 user 消息说明转换被拒绝', async () => {
    // 工具层直接放行，让运行器自己的状态机判定 planning → end 无效
    passThroughStatusTool();
    const history: ChatMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'start' },
    ];
    const tails: ChatMessage[] = [];
    const flow = ['end', 'working', 'end'];
    let turn = 0;
    const generateText = (): Promise<{ text: string; toolCalls?: AIToolCall[] }> => {
      expectWellFormed(history);
      tails.push({ ...history[history.length - 1]! });
      const status = flow[turn] ?? 'end';
      turn++;
      return Promise.resolve({ text: '准备切换状态', toolCalls: [statusCall(`c${turn}`, status)] });
    };

    await executeToolCallLoop({ ...baseConfig, history, tools, generateText }).catch(
      () => undefined,
    );

    expect(tails.length).toBeGreaterThanOrEqual(2);
    expect(tails[1]!.role).toBe('user');
    expect(String(tails[1]!.content)).toContain('planning → end');
  });

  test('工具路径 Gate 拒绝：不在 tool_calls 与 tool 结果之间插入 assistant 文本', async () => {
    passThroughStatusTool();
    const taskId = 'gate-task';
    const store: AIProcessingStore = {
      addTask: mock(() => Promise.resolve('mock-id')) as never,
      updateTask: mock(() => Promise.resolve()) as never,
      appendThinkingMessage: mock(() => Promise.resolve()) as never,
      appendOutputContent: mock(() => Promise.resolve()) as never,
      removeTask: mock(() => Promise.resolve()) as never,
      activeTasks: [{ id: taskId, type: 'polish', status: 'processing' } as never],
    };
    const history: ChatMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'start' },
    ];
    const seen: string[] = [];
    let turn = 0;
    const generateText = (): Promise<{ text: string; toolCalls?: AIToolCall[] }> => {
      expectWellFormed(history);
      seen.push(...history.map((m) => String(m.content)));
      turn++;
      // 规划阶段待办未完成就请求进入 working，触发 Gate 拒绝
      return Promise.resolve({
        text: '准备切换状态',
        toolCalls: [statusCall(`g${turn}`, 'working')],
      });
    };

    await executeToolCallLoop({
      ...baseConfig,
      history,
      tools,
      generateText,
      taskId,
      aiProcessingStore: store,
      maxTurns: 2,
    }).catch(() => undefined);

    expect(turn).toBe(2);
    expect(seen.some((content) => content.includes('无法进入 working'))).toBe(true);
  });
});
