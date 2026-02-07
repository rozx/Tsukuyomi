import './setup'; // 导入测试环境设置（IndexedDB polyfill等）
import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import { taskStatusTools } from '../services/ai/tools/task-status-tools';
import type {
  AIProcessingStore,
  TaskType,
  TaskStatus,
} from '../services/ai/tasks/utils/task-types';

// 辅助函数：创建 AI Processing Store
const createMockAIProcessingStore = (
  tasks: Array<{
    id: string;
    workflowStatus: TaskStatus | undefined;
    type: TaskType;
  }>,
): AIProcessingStore => ({
  activeTasks: tasks.map((t) => ({
    id: t.id,
    workflowStatus: t.workflowStatus,
    type: t.type,
    bookId: 'novel-1',
    targetId: 'chapter-1',
    targetType: 'chapter',
    status: t.workflowStatus || 'planning',
  })) as any,
  addTask: mock(() => Promise.resolve('task-id')),
  updateTask: mock(() => Promise.resolve()),
  appendThinkingMessage: mock(() => Promise.resolve()),
  appendOutputContent: mock(() => Promise.resolve()),
  removeTask: mock(() => Promise.resolve()),
});

describe('update_task_status', () => {
  beforeEach(() => {
    mock.restore();
  });

  afterEach(() => {
    mock.restore();
  });

  // 辅助函数：获取工具
  const getTool = () => {
    const tool = taskStatusTools.find((t) => t.definition.function?.name === 'update_task_status');
    if (!tool?.handler) throw new Error('工具未找到');
    return tool;
  };

  describe('基本参数验证', () => {
    test('当未提供任务 ID 时应返回错误', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'working', type: 'translation' },
      ]);

      const result = await tool.handler(
        { status: 'working' },
        {
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('未提供任务 ID');
    });

    test('当 AI Processing Store 未初始化时应返回错误', async () => {
      const tool = getTool();

      const result = await tool.handler(
        { status: 'working' },
        {
          taskId: 'task-1',
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('AI 处理 Store 未初始化');
    });

    test('当任务不存在时应返回错误', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'working', type: 'translation' },
      ]);

      const result = await tool.handler(
        { status: 'working' },
        {
          taskId: 'non-existent-task',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('任务不存在');
    });

    test('当状态值为空时应返回错误', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'planning', type: 'translation' },
      ]);

      const result = await tool.handler(
        { status: '' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('无效的状态值');
    });

    test('当状态值为无效值时应返回错误', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'planning', type: 'translation' },
      ]);

      const result = await tool.handler(
        { status: 'invalid_status' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('无效的状态值');
      expect(resultObj.error).toContain('planning');
      expect(resultObj.error).toContain('working');
      expect(resultObj.error).toContain('review');
      expect(resultObj.error).toContain('end');
    });
  });

  describe('翻译任务状态转换', () => {
    test('初始状态转换: undefined -> planning 应成功', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: undefined, type: 'translation' },
      ]);

      const result = await tool.handler(
        { status: 'planning' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);
      expect(resultObj.message).toContain('初始 → planning');
    });

    test('初始状态转换: undefined -> working 应失败', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: undefined, type: 'translation' },
      ]);

      const result = await tool.handler(
        { status: 'working' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('初始状态必须是 planning');
    });

    test('planning -> working 应成功', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'planning', type: 'translation' },
      ]);

      const result = await tool.handler(
        { status: 'working' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);
      expect(resultObj.message).toContain('planning → working');
    });

    test('planning -> review 应失败', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'planning', type: 'translation' },
      ]);

      const result = await tool.handler(
        { status: 'review' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('无效的状态转换: planning → review');
    });

    test('planning -> end 应失败', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'planning', type: 'translation' },
      ]);

      const result = await tool.handler(
        { status: 'end' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('无效的状态转换: planning → end');
    });

    test('working -> review 应成功', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'working', type: 'translation' },
      ]);

      const result = await tool.handler(
        { status: 'review' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);
      expect(resultObj.message).toContain('working → review');
    });

    test('working -> planning 应失败', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'working', type: 'translation' },
      ]);

      const result = await tool.handler(
        { status: 'planning' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('无效的状态转换: working → planning');
    });

    test('working -> end 应失败', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'working', type: 'translation' },
      ]);

      const result = await tool.handler(
        { status: 'end' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('无效的状态转换: working → end');
    });

    test('review -> end 应成功', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'review', type: 'translation' },
      ]);

      const result = await tool.handler(
        { status: 'end' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);
      expect(resultObj.message).toContain('review → end');
    });

    test('review -> working 应成功', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'review', type: 'translation' },
      ]);

      const result = await tool.handler(
        { status: 'working' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);
      expect(resultObj.message).toContain('review → working');
    });

    test('review -> planning 应失败', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'review', type: 'translation' },
      ]);

      const result = await tool.handler(
        { status: 'planning' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('无效的状态转换: review → planning');
    });

    test('end -> 任何状态 应失败', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'end', type: 'translation' },
      ]);

      for (const status of ['planning', 'working', 'review']) {
        const result = await tool.handler(
          { status },
          {
            taskId: 'task-1',
            aiProcessingStore: mockStore,
          },
        );

        const resultObj = JSON.parse(result as string);
        expect(resultObj.success).toBe(false);
        expect(resultObj.error).toContain(`无效的状态转换: end → ${status}`);
      }
    });
  });

  describe('润色任务状态转换', () => {
    test('planning -> working 应成功', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'planning', type: 'polish' },
      ]);

      const result = await tool.handler(
        { status: 'working' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);
    });

    test('working -> end 应成功', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'working', type: 'polish' },
      ]);

      const result = await tool.handler(
        { status: 'end' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);
    });

    test('working -> review 应失败（润色任务不支持 review）', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'working', type: 'polish' },
      ]);

      const result = await tool.handler(
        { status: 'review' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('无效的状态转换: working → review');
    });

    test('planning -> review 应失败', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'planning', type: 'polish' },
      ]);

      const result = await tool.handler(
        { status: 'review' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('无效的状态转换: planning → review');
    });

    test('planning -> end 应失败', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'planning', type: 'polish' },
      ]);

      const result = await tool.handler(
        { status: 'end' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('无效的状态转换: planning → end');
    });

    test('end -> 任何状态 应失败', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'end', type: 'polish' },
      ]);

      for (const status of ['planning', 'working', 'review']) {
        const result = await tool.handler(
          { status },
          {
            taskId: 'task-1',
            aiProcessingStore: mockStore,
          },
        );

        const resultObj = JSON.parse(result as string);
        expect(resultObj.success).toBe(false);
        expect(resultObj.error).toContain(`无效的状态转换: end → ${status}`);
      }
    });
  });

  describe('校对任务状态转换', () => {
    test('planning -> working 应成功', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'planning', type: 'proofreading' },
      ]);

      const result = await tool.handler(
        { status: 'working' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);
    });

    test('working -> end 应成功', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'working', type: 'proofreading' },
      ]);

      const result = await tool.handler(
        { status: 'end' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);
    });

    test('working -> review 应失败（校对任务不支持 review）', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'working', type: 'proofreading' },
      ]);

      const result = await tool.handler(
        { status: 'review' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('无效的状态转换: working → review');
    });
  });

  describe('章节摘要任务状态转换', () => {
    test('planning -> working 应成功', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'planning', type: 'chapter_summary' },
      ]);

      const result = await tool.handler(
        { status: 'working' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);
    });

    test('working -> end 应成功', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'working', type: 'chapter_summary' },
      ]);

      const result = await tool.handler(
        { status: 'end' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);
    });

    test('working -> review 应失败（章节摘要任务不支持 review）', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'working', type: 'chapter_summary' },
      ]);

      const result = await tool.handler(
        { status: 'review' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('无效的状态转换: working → review');
    });
  });

  describe('状态更新执行', () => {
    test('应调用 updateTask 更新状态', async () => {
      const tool = getTool();
      const mockUpdateTask = mock(() => Promise.resolve());
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'planning', type: 'translation' },
      ]);
      mockStore.updateTask = mockUpdateTask;

      await tool.handler(
        { status: 'working' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      expect(mockUpdateTask).toHaveBeenCalled();
      const calls = (mockUpdateTask as any).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const updateArg = calls[0][1] as any;
      expect(updateArg.workflowStatus).toBe('working');
    });

    test('当状态更新为 end 时也应更新 status 字段', async () => {
      const tool = getTool();
      const mockUpdateTask = mock(() => Promise.resolve());
      // 对于 translation 类型，必须从 review 转换到 end（不能从 working 直接到 end）
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'review', type: 'translation' },
      ]);
      mockStore.updateTask = mockUpdateTask;

      await tool.handler(
        { status: 'end' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      expect(mockUpdateTask).toHaveBeenCalled();
      const calls = (mockUpdateTask as any).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const updateArg = calls[0][1] as any;
      expect(updateArg.workflowStatus).toBe('end');
      expect(updateArg.status).toBe('end');
    });

    test('当状态更新不为 end 时不应更新 status 字段', async () => {
      const tool = getTool();
      const mockUpdateTask = mock(() => Promise.resolve());
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'planning', type: 'translation' },
      ]);
      mockStore.updateTask = mockUpdateTask;

      await tool.handler(
        { status: 'working' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      expect(mockUpdateTask).toHaveBeenCalled();
      const calls = (mockUpdateTask as any).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const updateArg = calls[0][1] as any;
      expect(updateArg.workflowStatus).toBe('working');
      expect(updateArg.status).toBeUndefined();
    });

    test('当 updateTask 抛出异常时应返回错误', async () => {
      const tool = getTool();
      const mockUpdateTask = mock(() => Promise.reject(new Error('更新失败')));
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'planning', type: 'translation' },
      ]);
      mockStore.updateTask = mockUpdateTask;

      const result = await tool.handler(
        { status: 'working' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('状态更新失败');
      expect(resultObj.error).toContain('更新失败');
    });
  });

  describe('onAction 回调', () => {
    test('状态更新成功后应调用 onAction 回调', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'planning', type: 'translation' },
      ]);
      const onAction = mock(() => {});

      await tool.handler(
        { status: 'working' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          onAction,
        },
      );

      expect(onAction).toHaveBeenCalled();
      const actionArg = (onAction as any).mock.calls[0][0];
      expect(actionArg.type).toBe('update');
      expect(actionArg.entity).toBe('todo');
    });

    test('onAction 应包含正确的状态变更信息', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'working', type: 'translation' },
      ]);
      const onAction = mock(() => {});

      await tool.handler(
        { status: 'review' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
          onAction,
        },
      );

      const actionArg = (onAction as any).mock.calls[0][0];
      expect(actionArg.data.id).toBe('task-1');
      expect(actionArg.data.name).toContain('working → review');
    });
  });

  describe('reason 参数（可选）', () => {
    test('应支持可选的 reason 参数', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'planning', type: 'translation' },
      ]);

      const result = await tool.handler(
        { status: 'working', reason: '开始执行任务' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);
    });
  });

  describe('无效任务类型', () => {
    test('当任务类型未知时应返回错误', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'planning', type: 'unknown_type' as TaskType },
      ]);

      const result = await tool.handler(
        { status: 'working' },
        {
          taskId: 'task-1',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(false);
      expect(resultObj.error).toContain('未知的任务类型');
    });
  });

  describe('边界情况', () => {
    test('多个任务时应该正确找到目标任务', async () => {
      const tool = getTool();
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: 'planning', type: 'translation' },
        { id: 'task-2', workflowStatus: 'working', type: 'polish' },
        { id: 'task-3', workflowStatus: 'end', type: 'proofreading' },
      ]);

      // polish 类型从 working 只能转换到 end
      const result = await tool.handler(
        { status: 'end' },
        {
          taskId: 'task-2',
          aiProcessingStore: mockStore,
        },
      );

      const resultObj = JSON.parse(result as string);
      expect(resultObj.success).toBe(true);
      expect(resultObj.task_id).toBe('task-2');
    });

    test('连续状态转换应正常工作', async () => {
      const tool = getTool();
      const mockUpdateTask = mock(() => Promise.resolve());
      const mockStore = createMockAIProcessingStore([
        { id: 'task-1', workflowStatus: undefined, type: 'translation' },
      ]);
      mockStore.updateTask = mockUpdateTask;

      // undefined -> planning
      let result = await tool.handler(
        { status: 'planning' },
        { taskId: 'task-1', aiProcessingStore: mockStore },
      );
      expect(JSON.parse(result as string).success).toBe(true);

      // 更新 mock 状态
      mockStore.activeTasks[0]!.workflowStatus = 'planning';

      // planning -> working
      result = await tool.handler(
        { status: 'working' },
        { taskId: 'task-1', aiProcessingStore: mockStore },
      );
      expect(JSON.parse(result as string).success).toBe(true);

      // 更新 mock 状态
      mockStore.activeTasks[0]!.workflowStatus = 'working';

      // working -> review
      result = await tool.handler(
        { status: 'review' },
        { taskId: 'task-1', aiProcessingStore: mockStore },
      );
      expect(JSON.parse(result as string).success).toBe(true);

      // 更新 mock 状态
      mockStore.activeTasks[0]!.workflowStatus = 'review';

      // review -> end
      result = await tool.handler(
        { status: 'end' },
        { taskId: 'task-1', aiProcessingStore: mockStore },
      );
      expect(JSON.parse(result as string).success).toBe(true);
    });
  });
});
