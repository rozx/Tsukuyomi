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
      // 创建后无进行中项，自动推进会把它标记为 working
      expect(parsed.todo.status).toBe('working');

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
      const actions: unknown[] = [];

      const contextWithAction: ToolContext = {
        ...context,
        onAction: (action) => {
          actions.push(action);
        },
      };

      const tool = todoListTools.find((t) => t.definition.function.name === 'create_todo');
      await tool!.handler({ text: 'Test todo' }, contextWithAction);

      // 第一条为 create；自动推进会追加一条 update
      expect(actions.length).toBeGreaterThanOrEqual(1);
      expect((actions[0] as { type: string; entity: string }).type).toBe('create');
      expect((actions[0] as { type: string; entity: string }).entity).toBe('todo');
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
      });
      // 自动推进：第一项被标记为 working，其余保持 pending
      expect(todos[0]?.status).toBe('working');
      expect(todos[1]?.status).toBe('pending');
      expect(todos[2]?.status).toBe('pending');
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

      // 3 条 create + 1 条自动推进的 update
      expect(actions).toHaveLength(4);
      actions.slice(0, 3).forEach((action) => {
        expect((action as { type: string; entity: string }).type).toBe('create');
        expect((action as { type: string; entity: string }).entity).toBe('todo');
      });
      expect((actions[3] as { type: string }).type).toBe('update');
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
      // todo2/todo3 已 done 且无进行中项，自动推进把 todo1 提升为 working
      expect(updated1?.status).toBe('working');

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

      // 2 条批量更新 + 1 条自动推进（todo1 被提升为 working）
      expect(actions).toHaveLength(3);
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
    test('应该能够将 working 中的待办事项标记为完成', async () => {
      const todo = TodoListService.createTodo('Test todo', taskId);
      TodoListService.markTodoAsWorking(todo.id);

      const tool = todoListTools.find((t) => t.definition.function.name === 'mark_todo_done');
      const result = await tool!.handler({ id: todo.id }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(1);
      expect(parsed.todos[0].status).toBe('done');

      const updated = TodoListService.getTodoById(todo.id);
      expect(updated?.status).toBe('done');
    });

    test('pending 状态应可直接标记为 done（无需先 mark_todo_working）', async () => {
      const todo = TodoListService.createTodo('Test todo', taskId);

      const tool = todoListTools.find((t) => t.definition.function.name === 'mark_todo_done');
      const result = await tool!.handler({ id: todo.id }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(TodoListService.getTodoById(todo.id)?.status).toBe('done');
    });

    test('应支持 ids 批量标记完成', async () => {
      const a = TodoListService.createTodo('todo A', taskId);
      const b = TodoListService.createTodo('todo B', taskId);
      const c = TodoListService.createTodo('todo C', taskId);

      const tool = todoListTools.find((t) => t.definition.function.name === 'mark_todo_done');
      const result = await tool!.handler({ ids: [a.id, b.id, c.id] }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(3);
      [a, b, c].forEach((t) => {
        expect(TodoListService.getTodoById(t.id)?.status).toBe('done');
      });
    });

    test('批量标记时部分 ID 无效应完成其余项并回报错误', async () => {
      const valid = TodoListService.createTodo('valid todo', taskId);

      const tool = todoListTools.find((t) => t.definition.function.name === 'mark_todo_done');
      const result = await tool!.handler({ ids: [valid.id, 'non-existent-id'] }, context);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(1);
      expect(parsed.errors).toHaveLength(1);
      expect(parsed.errors[0]).toContain('non-existent-id');
      expect(TodoListService.getTodoById(valid.id)?.status).toBe('done');
    });

    test('既未提供 id 也未提供 ids 时应抛出错误', async () => {
      const tool = todoListTools.find((t) => t.definition.function.name === 'mark_todo_done');

      try {
        await tool!.handler({}, context);
        expect(true).toBe(false);
      } catch (error) {
        expect(error instanceof Error && error.message).toContain('必须提供 id 或 ids 参数之一');
      }
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

  describe('自动推进（完成/删除/创建后自动标记下一项为进行中）', () => {
    const getTool = (name: string) =>
      todoListTools.find((t) => t.definition.function.name === name)!;

    test('mark_todo_done 完成当前项后应自动把下一个 pending 标记为 working', async () => {
      const a = TodoListService.createTodo('Todo A', taskId);
      const b = TodoListService.createTodo('Todo B', taskId);
      TodoListService.markTodoAsWorking(a.id);

      const result = await getTool('mark_todo_done').handler({ id: a.id }, context);
      const parsed = JSON.parse(result);

      expect(TodoListService.getTodoById(b.id)?.status).toBe('working');
      expect(parsed.autoAdvanced).toBeDefined();
      expect(parsed.autoAdvanced.id).toBe(b.id);
      expect(parsed.autoAdvanced.status).toBe('working');
    });

    test('完成后若仍有其他 working 项则不推进', async () => {
      const a = TodoListService.createTodo('Todo A', taskId);
      const b = TodoListService.createTodo('Todo B', taskId);
      const c = TodoListService.createTodo('Todo C', taskId);
      TodoListService.markTodoAsWorking(b.id);

      const result = await getTool('mark_todo_done').handler({ id: a.id }, context);
      const parsed = JSON.parse(result);

      expect(parsed.autoAdvanced).toBeUndefined();
      expect(TodoListService.getTodoById(b.id)?.status).toBe('working');
      expect(TodoListService.getTodoById(c.id)?.status).toBe('pending');
    });

    test('mark_todo_done 批量 ids 完成后应推进剩余第一个 pending', async () => {
      const a = TodoListService.createTodo('Todo A', taskId);
      const b = TodoListService.createTodo('Todo B', taskId);
      const c = TodoListService.createTodo('Todo C', taskId);

      await getTool('mark_todo_done').handler({ ids: [a.id, b.id] }, context);

      expect(TodoListService.getTodoById(c.id)?.status).toBe('working');
    });

    test('delete_todo 删除 working 项后应自动推进下一项', async () => {
      const a = TodoListService.createTodo('Todo A', taskId);
      const b = TodoListService.createTodo('Todo B', taskId);
      TodoListService.markTodoAsWorking(a.id);

      const result = await getTool('delete_todo').handler({ id: a.id }, context);
      const parsed = JSON.parse(result);

      expect(TodoListService.getTodoById(b.id)?.status).toBe('working');
      expect(parsed.autoAdvanced?.id).toBe(b.id);
    });

    test('update_todos 把唯一 working 项标记为 done 后应自动推进', async () => {
      const a = TodoListService.createTodo('Todo A', taskId);
      const b = TodoListService.createTodo('Todo B', taskId);
      TodoListService.markTodoAsWorking(a.id);

      await getTool('update_todos').handler({ id: a.id, status: 'done' }, context);

      expect(TodoListService.getTodoById(b.id)?.status).toBe('working');
    });

    test('create_todo 批量创建后第一项应自动标记为 working', async () => {
      const result = await getTool('create_todo').handler(
        { items: ['Todo A', 'Todo B', 'Todo C'] },
        context,
      );
      const parsed = JSON.parse(result);

      const todos = TodoListService.getTodosByTaskId(taskId);
      expect(todos[0]?.status).toBe('working');
      expect(todos[1]?.status).toBe('pending');
      expect(todos[2]?.status).toBe('pending');
      expect(parsed.todos[0].status).toBe('working');
    });

    test('自动推进时应触发 onAction update 回调', async () => {
      const a = TodoListService.createTodo('Todo A', taskId);
      const b = TodoListService.createTodo('Todo B', taskId);
      TodoListService.markTodoAsWorking(a.id);

      const actions: Array<{ type: string; data: { id: string; status?: string } }> = [];
      const contextWithAction: ToolContext = {
        ...context,
        onAction: (action) => {
          actions.push(action as never);
        },
      };

      await getTool('mark_todo_done').handler({ id: a.id }, contextWithAction);

      const advanceAction = actions.find(
        (act) => act.type === 'update' && act.data.id === b.id && act.data.status === 'working',
      );
      expect(advanceAction).toBeDefined();
    });
  });
});
