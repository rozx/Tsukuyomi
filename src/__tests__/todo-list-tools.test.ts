import './setup';
import { todoListTools } from 'src/services/ai/tools/todo-list-tools';
import { TodoListService } from 'src/services/todo-list-service';
import { describe, test, expect, beforeEach } from 'bun:test';
import type { ToolContext } from 'src/services/ai/tools/types';

describe('TodoListTools', () => {
  const taskId = 'test-task-123';
  const context: ToolContext = {
    taskId,
  };

  beforeEach(() => {
    TodoListService.clearAllTodos();
  });

  describe('create_todo', () => {
    test('应该能够从上下文中获取 taskId 并创建待办事项', async () => {
      const tool = todoListTools.find((t) => t.definition.function.name === 'create_todo');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ text: 'Test todo item' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.todo).toBeDefined();
      expect(parsed.todo.text).toBe('Test todo item');
      expect(parsed.todo.status).toBe('pending');

      const todos = TodoListService.getTodosByTaskId(taskId);
      expect(todos).toHaveLength(1);
      expect(todos[0]?.text).toBe('Test todo item');
      expect(todos[0]?.taskId).toBe(taskId);
    });

    test('当文本为空时应该抛出错误', async () => {
      const tool = todoListTools.find((t) => t.definition.function.name === 'create_todo');
      expect(tool).toBeDefined();

      try {
        await tool!.handler({ text: '' }, context);
        expect(true).toBe(false);
      } catch (error) {
        expect(error instanceof Error && error.message).toContain('待办事项内容不能为空');
      }
    });

    test('create_todo: 当上下文中缺少 taskId 时应该抛出错误', async () => {
      const tool = todoListTools.find((t) => t.definition.function.name === 'create_todo');
      expect(tool).toBeDefined();

      const contextWithoutTaskId: ToolContext = {};

      try {
        await tool!.handler({ text: 'Test todo' }, contextWithoutTaskId);
        expect(true).toBe(false);
      } catch (error) {
        expect(error instanceof Error && error.message).toContain('任务 ID 未提供');
      }
    });

    test('当提供 onAction 回调时应该调用它', async () => {
      let actionCalled = false;
      let actionData: unknown = null;

      const contextWithAction: ToolContext = {
        ...context,
        onAction: (action) => {
          actionCalled = true;
          actionData = action;
        },
      };

      const tool = todoListTools.find((t) => t.definition.function.name === 'create_todo');
      await tool!.handler({ text: 'Test todo' }, contextWithAction);

      expect(actionCalled).toBe(true);
      expect(actionData).toBeDefined();
      expect((actionData as { type: string; entity: string }).type).toBe('create');
      expect((actionData as { type: string; entity: string }).entity).toBe('todo');
    });

    test('应该能够批量创建多个待办事项（使用 items 参数）', async () => {
      const tool = todoListTools.find((t) => t.definition.function.name === 'create_todo');
      expect(tool).toBeDefined();

      const items = [
        '翻译第1-5段，检查术语一致性',
        '翻译第6-10段，确保角色名称翻译一致',
        '翻译第11-15段，检查上下文连贯性',
      ];

      const result = await tool!.handler({ items }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.todos).toBeDefined();
      expect(parsed.todos).toHaveLength(3);
      expect(parsed.count).toBe(3);
      expect(parsed.message).toContain('成功创建 3 个待办事项');

      const todos = TodoListService.getTodosByTaskId(taskId);
      expect(todos).toHaveLength(3);
      expect(todos.map((t) => t.text)).toEqual(expect.arrayContaining(items));
      todos.forEach((todo) => {
        expect(todo.taskId).toBe(taskId);
        expect(todo.status).toBe('pending');
      });
    });

    test('批量创建时应该跳过空字符串并继续创建其他项', async () => {
      const tool = todoListTools.find((t) => t.definition.function.name === 'create_todo');
      expect(tool).toBeDefined();

      const items = ['翻译第1-5段', '', '   ', '翻译第6-10段'];

      const result = await tool!.handler({ items }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.todos).toHaveLength(2);
      expect(parsed.count).toBe(2);
      expect(parsed.errors).toBeDefined();
      expect(parsed.errors.length).toBeGreaterThan(0);

      const todos = TodoListService.getTodosByTaskId(taskId);
      expect(todos).toHaveLength(2);
      expect(todos.map((t) => t.text)).toEqual(
        expect.arrayContaining(['翻译第1-5段', '翻译第6-10段']),
      );
    });

    test('批量创建时如果所有项都无效应该抛出错误', async () => {
      const tool = todoListTools.find((t) => t.definition.function.name === 'create_todo');
      expect(tool).toBeDefined();

      const items = ['', '   ', ''];

      try {
        await tool!.handler({ items }, context);
        expect(true).toBe(false);
      } catch (error) {
        expect(error instanceof Error && error.message).toContain('批量创建待办事项失败');
      }

      const todos = TodoListService.getTodosByTaskId(taskId);
      expect(todos).toHaveLength(0);
    });

    test('当既没有提供 text 也没有提供 items 时应该抛出错误', async () => {
      const tool = todoListTools.find((t) => t.definition.function.name === 'create_todo');
      expect(tool).toBeDefined();

      try {
        await tool!.handler({}, context);
        expect(true).toBe(false);
      } catch (error) {
        expect(error instanceof Error && error.message).toContain('必须提供 text 或 items 参数之一');
      }
    });

    test('批量创建时应该为每个待办事项调用 onAction 回调', async () => {
      const actions: unknown[] = [];

      const contextWithAction: ToolContext = {
        ...context,
        onAction: (action) => {
          actions.push(action);
        },
      };

      const tool = todoListTools.find((t) => t.definition.function.name === 'create_todo');
      const items = ['待办事项1', '待办事项2', '待办事项3'];
      await tool!.handler({ items }, contextWithAction);

      expect(actions).toHaveLength(3);
      actions.forEach((action) => {
        expect((action as { type: string; entity: string }).type).toBe('create');
        expect((action as { type: string; entity: string }).entity).toBe('todo');
      });
    });
  });

  describe('list_todos', () => {
    test('应该能够列出上下文中任务的所有待办事项', async () => {
      TodoListService.createTodo('Todo 1', taskId);
      TodoListService.createTodo('Todo 2', taskId);
      TodoListService.createTodo('Todo 3', 'other-task');

      const tool = todoListTools.find((t) => t.definition.function.name === 'list_todos');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ filter: 'all' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.todos).toHaveLength(2);
      expect(parsed.count).toBe(2);
      expect(
        parsed.todos.every((t: { text: string }) => ['Todo 1', 'Todo 2'].includes(t.text)),
      ).toBe(true);
    });

    test('应该能够过滤出未完成的待办事项', async () => {
      const todo1 = TodoListService.createTodo('Todo 1', taskId);
      TodoListService.createTodo('Todo 2', taskId);
      TodoListService.markTodoAsWorking(todo1.id);
      TodoListService.markTodoAsDone(todo1.id);

      const tool = todoListTools.find((t) => t.definition.function.name === 'list_todos');
      const result = await tool!.handler({ filter: 'active' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.todos).toHaveLength(1);
      expect(parsed.todos[0]?.text).toBe('Todo 2');
      expect(parsed.todos[0]?.status).toBe('pending');
    });

    test('应该能够过滤出已完成的待办事项', async () => {
      const todo1 = TodoListService.createTodo('Todo 1', taskId);
      TodoListService.createTodo('Todo 2', taskId);
      TodoListService.markTodoAsWorking(todo1.id);
      TodoListService.markTodoAsDone(todo1.id);

      const tool = todoListTools.find((t) => t.definition.function.name === 'list_todos');
      const result = await tool!.handler({ filter: 'completed' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.todos).toHaveLength(1);
      expect(parsed.todos[0]?.text).toBe('Todo 1');
      expect(parsed.todos[0]?.status).toBe('done');
    });

    test('list_todos: 当上下文中缺少 taskId 时应该抛出错误', async () => {
      const tool = todoListTools.find((t) => t.definition.function.name === 'list_todos');
      const contextWithoutTaskId: ToolContext = {};

      try {
        await tool!.handler({ filter: 'all' }, contextWithoutTaskId);
        expect(true).toBe(false);
      } catch (error) {
        expect(error instanceof Error && error.message).toContain('任务 ID 未提供');
      }
    });
  });

  describe('update_todos', () => {
    test('应该能够更新待办事项的文本（单个更新）', async () => {
      const todo = TodoListService.createTodo('Original text', taskId);

      const tool = todoListTools.find((t) => t.definition.function.name === 'update_todos');
      const result = await tool!.handler({ id: todo.id, text: 'Updated text' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.todo.text).toBe('Updated text');

      const updated = TodoListService.getTodoById(todo.id);
      expect(updated?.text).toBe('Updated text');
    });

    test('应该能够更新待办事项的状态（单个更新）', async () => {
      const todo = TodoListService.createTodo('Test todo', taskId);

      const tool = todoListTools.find((t) => t.definition.function.name === 'update_todos');
      const result = await tool!.handler({ id: todo.id, status: 'done' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.todo.status).toBe('done');

      const updated = TodoListService.getTodoById(todo.id);
      expect(updated?.status).toBe('done');
    });

    test('应该能够批量更新多个待办事项', async () => {
      const todo1 = TodoListService.createTodo('Todo 1', taskId);
      const todo2 = TodoListService.createTodo('Todo 2', taskId);
      const todo3 = TodoListService.createTodo('Todo 3', taskId);

      const tool = todoListTools.find((t) => t.definition.function.name === 'update_todos');
      const result = await tool!.handler(
        {
          items: [
            { id: todo1.id, text: 'Updated Todo 1' },
            { id: todo2.id, status: 'done' },
            { id: todo3.id, text: 'Updated Todo 3', status: 'done' },
          ],
        },
        context,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.todos).toBeDefined();
      expect(parsed.todos).toHaveLength(3);
      expect(parsed.count).toBe(3);
      expect(parsed.message).toContain('成功更新 3 个待办事项');

      const updated1 = TodoListService.getTodoById(todo1.id);
      expect(updated1?.text).toBe('Updated Todo 1');
      expect(updated1?.status).toBe('pending');

      const updated2 = TodoListService.getTodoById(todo2.id);
      expect(updated2?.text).toBe('Todo 2');
      expect(updated2?.status).toBe('done');

      const updated3 = TodoListService.getTodoById(todo3.id);
      expect(updated3?.text).toBe('Updated Todo 3');
      expect(updated3?.status).toBe('done');
    });

    test('批量更新时应该为每个待办事项调用 onAction 回调', async () => {
      const todo1 = TodoListService.createTodo('Todo 1', taskId);
      const todo2 = TodoListService.createTodo('Todo 2', taskId);

      const actions: unknown[] = [];

      const contextWithAction: ToolContext = {
        ...context,
        onAction: (action) => {
          actions.push(action);
        },
      };

      const tool = todoListTools.find((t) => t.definition.function.name === 'update_todos');
      await tool!.handler(
        {
          items: [
            { id: todo1.id, text: 'Updated Todo 1' },
            { id: todo2.id, status: 'done' },
          ],
        },
        contextWithAction,
      );

      expect(actions).toHaveLength(2);
      actions.forEach((action) => {
        expect((action as { type: string; entity: string }).type).toBe('update');
        expect((action as { type: string; entity: string }).entity).toBe('todo');
      });
    });

    test('批量更新时应该跳过无效项并继续更新其他项', async () => {
      const todo1 = TodoListService.createTodo('Todo 1', taskId);
      const todo2 = TodoListService.createTodo('Todo 2', taskId);

      const tool = todoListTools.find((t) => t.definition.function.name === 'update_todos');
      const result = await tool!.handler(
        {
          items: [
            { id: todo1.id, text: 'Updated Todo 1' },
            { id: 'non-existent-id', text: 'Should fail' },
            { id: todo2.id, status: 'done' },
          ],
        },
        context,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.todos).toHaveLength(2);
      expect(parsed.count).toBe(2);
      expect(parsed.errors).toBeDefined();
      expect(parsed.errors.length).toBeGreaterThan(0);
    });

    test('批量更新时如果所有项都无效应该抛出错误', async () => {
      const tool = todoListTools.find((t) => t.definition.function.name === 'update_todos');

      try {
        await tool!.handler(
          {
            items: [
              { id: 'non-existent-id-1', text: 'Should fail' },
              { id: 'non-existent-id-2', status: 'done' },
            ],
          },
          context,
        );
        expect(true).toBe(false);
      } catch (error) {
        expect(error instanceof Error && error.message).toContain('批量更新待办事项失败');
      }
    });

    test('当既没有提供 id 也没有提供 items 时应该抛出错误', async () => {
      const tool = todoListTools.find((t) => t.definition.function.name === 'update_todos');

      try {
        await tool!.handler({}, context);
        expect(true).toBe(false);
      } catch (error) {
        expect(error instanceof Error && error.message).toContain('必须提供 id 或 items 参数之一');
      }
    });
  });

  describe('mark_todo_done', () => {
    test('应该能够将待办事项标记为完成', async () => {
      const todo = TodoListService.createTodo('Test todo', taskId);
      TodoListService.markTodoAsWorking(todo.id);

      const tool = todoListTools.find((t) => t.definition.function.name === 'mark_todo_done');
      const result = await tool!.handler({ id: todo.id }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.todo.status).toBe('done');

      const updated = TodoListService.getTodoById(todo.id);
      expect(updated?.status).toBe('done');
    });

    test('pending 状态直接标记为 done 应该抛出错误', async () => {
      const todo = TodoListService.createTodo('Test todo', taskId);

      const tool = todoListTools.find((t) => t.definition.function.name === 'mark_todo_done');

      try {
        await tool!.handler({ id: todo.id }, context);
        expect(true).toBe(false);
      } catch (error) {
        expect(error instanceof Error && error.message).toContain(
          '该待办事项未标记为进行中，请先调用 mark_todo_working',
        );
      }

      const unchanged = TodoListService.getTodoById(todo.id);
      expect(unchanged?.status).toBe('pending');
    });
  });

  describe('delete_todo', () => {
    test('应该能够删除待办事项', async () => {
      const todo = TodoListService.createTodo('Test todo', taskId);

      const tool = todoListTools.find((t) => t.definition.function.name === 'delete_todo');
      const result = await tool!.handler({ id: todo.id }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);

      const deleted = TodoListService.getTodoById(todo.id);
      expect(deleted).toBeUndefined();
    });

    test('当待办事项不存在时应该抛出错误', async () => {
      const tool = todoListTools.find((t) => t.definition.function.name === 'delete_todo');

      try {
        await tool!.handler({ id: 'non-existent-id' }, context);
        expect(true).toBe(false);
      } catch (error) {
        expect(error instanceof Error && error.message).toContain('待办事项不存在');
      }
    });
  });
});
