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
      expect(parsed.todo.completed).toBe(false);

      // 验证 todo 已创建并关联到 taskId
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
        expect(true).toBe(false); // Should not reach here
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
        expect(true).toBe(false); // Should not reach here
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

      // 验证所有 todos 都已创建并关联到 taskId
      const todos = TodoListService.getTodosByTaskId(taskId);
      expect(todos).toHaveLength(3);
      expect(todos.map((t) => t.text)).toEqual(expect.arrayContaining(items));
      todos.forEach((todo) => {
        expect(todo.taskId).toBe(taskId);
        expect(todo.completed).toBe(false);
      });
    });

    test('批量创建时应该跳过空字符串并继续创建其他项', async () => {
      const tool = todoListTools.find((t) => t.definition.function.name === 'create_todo');
      expect(tool).toBeDefined();

      const items = [
        '翻译第1-5段',
        '', // 空字符串
        '   ', // 只有空白字符
        '翻译第6-10段',
      ];

      const result = await tool!.handler({ items }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.todos).toHaveLength(2); // 只创建了2个有效的待办事项
      expect(parsed.count).toBe(2);
      expect(parsed.errors).toBeDefined();
      expect(parsed.errors.length).toBeGreaterThan(0);

      // 验证只有有效的 todos 被创建
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
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error instanceof Error && error.message).toContain('批量创建待办事项失败');
      }

      // 验证没有创建任何待办事项
      const todos = TodoListService.getTodosByTaskId(taskId);
      expect(todos).toHaveLength(0);
    });

    test('当既没有提供 text 也没有提供 items 时应该抛出错误', async () => {
      const tool = todoListTools.find((t) => t.definition.function.name === 'create_todo');
      expect(tool).toBeDefined();

      try {
        await tool!.handler({}, context);
        expect(true).toBe(false); // Should not reach here
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
      // 创建一些 todos
      TodoListService.createTodo('Todo 1', taskId);
      TodoListService.createTodo('Todo 2', taskId);
      TodoListService.createTodo('Todo 3', 'other-task'); // 不同任务的 todo

      const tool = todoListTools.find((t) => t.definition.function.name === 'list_todos');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ filter: 'all' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.todos).toHaveLength(2); // 只返回当前任务的 todos
      expect(parsed.count).toBe(2);
      expect(
        parsed.todos.every((t: { text: string }) => ['Todo 1', 'Todo 2'].includes(t.text)),
      ).toBe(true);
    });

    test('应该能够过滤出未完成的待办事项', async () => {
      const todo1 = TodoListService.createTodo('Todo 1', taskId);
      TodoListService.createTodo('Todo 2', taskId);
      TodoListService.markTodoAsDone(todo1.id);

      const tool = todoListTools.find((t) => t.definition.function.name === 'list_todos');
      const result = await tool!.handler({ filter: 'active' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.todos).toHaveLength(1);
      expect(parsed.todos[0]?.text).toBe('Todo 2');
      expect(parsed.todos[0]?.completed).toBe(false);
    });

    test('应该能够过滤出已完成的待办事项', async () => {
      const todo1 = TodoListService.createTodo('Todo 1', taskId);
      TodoListService.createTodo('Todo 2', taskId);
      TodoListService.markTodoAsDone(todo1.id);

      const tool = todoListTools.find((t) => t.definition.function.name === 'list_todos');
      const result = await tool!.handler({ filter: 'completed' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.todos).toHaveLength(1);
      expect(parsed.todos[0]?.text).toBe('Todo 1');
      expect(parsed.todos[0]?.completed).toBe(true);
    });

    test('list_todos: 当上下文中缺少 taskId 时应该抛出错误', async () => {
      const tool = todoListTools.find((t) => t.definition.function.name === 'list_todos');
      const contextWithoutTaskId: ToolContext = {};

      try {
        await tool!.handler({ filter: 'all' }, contextWithoutTaskId);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error instanceof Error && error.message).toContain('任务 ID 未提供');
      }
    });
  });

  describe('update_todo', () => {
    test('应该能够更新待办事项的文本', async () => {
      const todo = TodoListService.createTodo('Original text', taskId);

      const tool = todoListTools.find((t) => t.definition.function.name === 'update_todo');
      const result = await tool!.handler({ id: todo.id, text: 'Updated text' }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.todo.text).toBe('Updated text');

      const updated = TodoListService.getTodoById(todo.id);
      expect(updated?.text).toBe('Updated text');
    });

    test('应该能够更新待办事项的完成状态', async () => {
      const todo = TodoListService.createTodo('Test todo', taskId);

      const tool = todoListTools.find((t) => t.definition.function.name === 'update_todo');
      const result = await tool!.handler({ id: todo.id, completed: true }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.todo.completed).toBe(true);

      const updated = TodoListService.getTodoById(todo.id);
      expect(updated?.completed).toBe(true);
    });
  });

  describe('mark_todo_done', () => {
    test('应该能够将待办事项标记为完成', async () => {
      const todo = TodoListService.createTodo('Test todo', taskId);

      const tool = todoListTools.find((t) => t.definition.function.name === 'mark_todo_done');
      const result = await tool!.handler({ id: todo.id }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.todo.completed).toBe(true);

      const updated = TodoListService.getTodoById(todo.id);
      expect(updated?.completed).toBe(true);
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
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error instanceof Error && error.message).toContain('待办事项不存在');
      }
    });
  });
});
