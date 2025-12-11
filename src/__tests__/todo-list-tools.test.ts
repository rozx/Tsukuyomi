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
