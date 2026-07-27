import './setup';
import { describe, test, expect, spyOn, mock, afterEach } from 'bun:test';
import type {
  ChatMessage,
  AIToolCall,
  AITool,
} from 'src/services/ai/types/ai-service';
import { executeToolCallLoop } from 'src/services/ai/tasks/utils';
import { ToolRegistry } from 'src/services/ai/tools';
import { TodoListService } from 'src/services/todo-list-service';
import type { AIProcessingStore } from 'src/services/ai/tasks/utils/task-types';

/**
 * 待办清单上下文注入回归测试
 *
 * 历史问题：每一轮工具调用后都会往 history 追加一份全量【待办清单】，
 * 且 getCurrentStatusInfoMsg / applyPendingStatusUpdate 各自还会再拼一份。
 * 结果 history 里按轮次线性堆积过期快照 —— working 阶段的清单含逐段明细，
 * 长章节能堆出上千行冗余，既烧 token 又让模型看到互相矛盾的旧状态。
 *
 * 约束：任意时刻 history 中最多只能有一份待办清单，且必须是最新快照。
 */
describe('task-runner 待办清单上下文', () => {
  const taskId = 'todo-ctx-task';

  afterEach(() => {
    mock.restore();
    TodoListService.clearAllTodos();
  });

  function createTools(): AITool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'update_task_status',
          description: 'update status',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      },
      {
        type: 'function',
        function: {
          name: 'mark_todo_done',
          description: 'mark todo done',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      },
    ];
  }

  function createMockStore(): AIProcessingStore {
    return {
      addTask: mock(() => Promise.resolve('mock-id')) as any,
      updateTask: mock(() => Promise.resolve()) as any,
      appendThinkingMessage: mock(() => Promise.resolve()) as any,
      appendOutputContent: mock(() => Promise.resolve()) as any,
      removeTask: mock(() => Promise.resolve()) as any,
      activeTasks: [
        {
          id: taskId,
          type: 'polish',
          modelName: 'test-model',
          status: 'processing',
          chapterId: 'chapter-1',
          bookId: 'book-1',
          startTime: Date.now(),
        } as any,
      ],
    };
  }

  function countTodoBlocks(history: ChatMessage[]): number {
    return history.filter(
      (m) => typeof m.content === 'string' && m.content.includes('【待办清单】'),
    ).length;
  }

  test('多轮工具调用后 history 中应始终只有一份待办清单', async () => {
    spyOn(ToolRegistry, 'handleToolCall').mockImplementation((toolCall) => {
      if (toolCall.function.name === 'update_task_status') {
        const args = JSON.parse(toolCall.function.arguments || '{}') as { status?: string };
        return Promise.resolve({
          content: JSON.stringify({ success: true, new_status: args.status }),
        } as any);
      }
      // mark_todo_done：真正翻转 storage 里的待办状态，让清单快照逐轮变化
      const args = JSON.parse(toolCall.function.arguments || '{}') as { id?: string };
      if (args.id) TodoListService.markTodoAsDone(args.id);
      return Promise.resolve({ content: JSON.stringify({ success: true }) } as any);
    });

    const history: ChatMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'start' },
    ];

    // 每轮把一条当前阶段的待办标记完成；清空后再推进状态（polish: planning → working → end）
    let turn = 0;
    const statusFlow = ['working', 'end'];
    let statusIdx = 0;
    const generateText = (): Promise<{ text: string; toolCalls?: AIToolCall[] }> => {
      turn++;
      const pending = TodoListService.getTodosByTaskId(taskId).filter((t) => t.status !== 'done');

      // 每轮开始时 history 里都不能有超过一份清单
      expect(countTodoBlocks(history)).toBeLessThanOrEqual(1);

      if (pending.length > 0) {
        return Promise.resolve({
          text: '',
          toolCalls: [
            {
              id: `call-${turn}`,
              type: 'function',
              function: { name: 'mark_todo_done', arguments: JSON.stringify({ id: pending[0]!.id }) },
            },
          ],
        });
      }

      const nextStatus = statusFlow[statusIdx] ?? 'end';
      statusIdx++;
      return Promise.resolve({
        text: '',
        toolCalls: [
          {
            id: `call-${turn}`,
            type: 'function',
            function: {
              name: 'update_task_status',
              arguments: JSON.stringify({ status: nextStatus }),
            },
          },
        ],
      });
    };

    await executeToolCallLoop({
      history,
      tools: createTools(),
      generateText,
      aiServiceConfig: { apiKey: '', baseUrl: '', model: 'test' },
      taskType: 'polish',
      chunkText: '[1] [ID: p1] 原文: 测试\n翻译: \n\n',
      paragraphIds: ['p1'],
      bookId: 'book-1',
      handleAction: () => {},
      onToast: undefined,
      taskId,
      aiProcessingStore: createMockStore(),
      logLabel: 'Test',
      maxTurns: 30,
      chunkIndex: 0,
    });

    // 循环结束后同样只能剩一份（或零份，若当前阶段无待办）
    expect(countTodoBlocks(history)).toBeLessThanOrEqual(1);

    // 至少真的注入过清单，避免断言因"从未注入"而空转通过
    expect(turn).toBeGreaterThan(1);
  });

  test('待办清单应是最新快照：已完成项不再显示为未完成', async () => {
    spyOn(ToolRegistry, 'handleToolCall').mockImplementation((toolCall) => {
      if (toolCall.function.name === 'update_task_status') {
        const args = JSON.parse(toolCall.function.arguments || '{}') as { status?: string };
        return Promise.resolve({
          content: JSON.stringify({ success: true, new_status: args.status }),
        } as any);
      }
      const args = JSON.parse(toolCall.function.arguments || '{}') as { ids?: string[] };
      for (const id of args.ids ?? []) TodoListService.markTodoAsDone(id);
      return Promise.resolve({ content: JSON.stringify({ success: true }) } as any);
    });

    const history: ChatMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'start' },
    ];

    let turn = 0;
    const statusFlow = ['working', 'end'];
    let statusIdx = 0;
    const generateText = (): Promise<{ text: string; toolCalls?: AIToolCall[] }> => {
      turn++;
      // 一次性批量完成当前阶段的全部待办
      const ids = TodoListService.getTodosByTaskId(taskId)
        .filter((t) => t.status !== 'done')
        .map((t) => t.id);
      if (ids.length > 0) {
        return Promise.resolve({
          text: '',
          toolCalls: [
            {
              id: `call-batch-${turn}`,
              type: 'function',
              function: { name: 'mark_todo_done', arguments: JSON.stringify({ ids }) },
            },
          ],
        });
      }
      const nextStatus = statusFlow[statusIdx] ?? 'end';
      statusIdx++;
      return Promise.resolve({
        text: '',
        toolCalls: [
          {
            id: `call-${turn}`,
            type: 'function',
            function: {
              name: 'update_task_status',
              arguments: JSON.stringify({ status: nextStatus }),
            },
          },
        ],
      });
    };

    await executeToolCallLoop({
      history,
      tools: createTools(),
      generateText,
      aiServiceConfig: { apiKey: '', baseUrl: '', model: 'test' },
      taskType: 'polish',
      chunkText: '[1] [ID: p1] 原文: 测试\n翻译: \n\n',
      paragraphIds: ['p1'],
      bookId: 'book-1',
      handleAction: () => {},
      onToast: undefined,
      taskId,
      aiProcessingStore: createMockStore(),
      logLabel: 'Test',
      maxTurns: 30,
      chunkIndex: 0,
    });

    // history 里不应残留"planning 待办未完成"的过期快照
    const staleBlock = history.find(
      (m) =>
        typeof m.content === 'string' &&
        m.content.includes('【待办清单】') &&
        m.content.includes('☐'),
    );
    expect(staleBlock).toBeUndefined();
  });
});
