import './setup';
import { TodoListService, type TodoItem } from 'src/services/todo-list-service';
import { describe, test, expect, beforeEach } from 'bun:test';

describe('TodoListService', () => {
  beforeEach(() => {
    // 清空所有待办事项，确保测试之间相互独立
    TodoListService.clearAllTodos();
  });

  describe('createTodo', () => {
    test('应该能够创建带有 taskId 的待办事项', () => {
      const taskId = 'task-123';
      const todo = TodoListService.createTodo('Test todo', taskId);

      expect(todo).toBeDefined();
      expect(todo.text).toBe('Test todo');
      expect(todo.completed).toBe(false);
      expect(todo.taskId).toBe(taskId);
      expect(todo.id).toBeDefined();
      expect(todo.createdAt).toBeGreaterThan(0);
      expect(todo.updatedAt).toBeGreaterThan(0);
    });

    test('当文本为空时应该抛出错误', () => {
      expect(() => {
        TodoListService.createTodo('', 'task-123');
      }).toThrow('待办事项内容不能为空');

      expect(() => {
        TodoListService.createTodo('   ', 'task-123');
      }).toThrow('待办事项内容不能为空');
    });

    test('当 taskId 为空时应该抛出错误', () => {
      expect(() => {
        TodoListService.createTodo('Test todo', '');
      }).toThrow('任务 ID 不能为空');

      expect(() => {
        TodoListService.createTodo('Test todo', '   ');
      }).toThrow('任务 ID 不能为空');
    });

    test('应该能够去除文本和 taskId 的前后空格', () => {
      const todo = TodoListService.createTodo('  Test todo  ', '  task-123  ');
      expect(todo.text).toBe('Test todo');
      expect(todo.taskId).toBe('task-123');
    });
  });

  describe('getTodosByTaskId', () => {
    test('应该能够返回特定任务的所有待办事项', () => {
      const taskId1 = 'task-1';
      const taskId2 = 'task-2';

      TodoListService.createTodo('Todo 1', taskId1);
      TodoListService.createTodo('Todo 2', taskId1);
      TodoListService.createTodo('Todo 3', taskId2);

      const todos1 = TodoListService.getTodosByTaskId(taskId1);
      expect(todos1).toHaveLength(2);
      expect(todos1.every((todo) => todo.taskId === taskId1)).toBe(true);

      const todos2 = TodoListService.getTodosByTaskId(taskId2);
      expect(todos2).toHaveLength(1);
      expect(todos2[0]?.taskId).toBe(taskId2);
    });

    test('当任务没有待办事项时应该返回空数组', () => {
      const todos = TodoListService.getTodosByTaskId('non-existent-task');
      expect(todos).toHaveLength(0);
    });
  });

  describe('deleteTodosByTaskId', () => {
    test('应该能够删除特定任务的所有待办事项', () => {
      const taskId1 = 'task-1';
      const taskId2 = 'task-2';

      const todo1 = TodoListService.createTodo('Todo 1', taskId1);
      const todo2 = TodoListService.createTodo('Todo 2', taskId1);
      const todo3 = TodoListService.createTodo('Todo 3', taskId2);

      const deletedCount = TodoListService.deleteTodosByTaskId(taskId1);
      expect(deletedCount).toBe(2);

      // 验证 taskId1 的 todos 已被删除
      expect(TodoListService.getTodosByTaskId(taskId1)).toHaveLength(0);

      // 验证 taskId2 的 todos 仍然存在
      const todos2 = TodoListService.getTodosByTaskId(taskId2);
      expect(todos2).toHaveLength(1);
      expect(todos2[0]?.id).toBe(todo3.id);

      // 验证 todo1 和 todo2 不再存在于所有 todos 中
      const allTodos = TodoListService.getAllTodos();
      expect(allTodos.find((t) => t.id === todo1.id)).toBeUndefined();
      expect(allTodos.find((t) => t.id === todo2.id)).toBeUndefined();
    });

    test('当任务没有待办事项时应该返回 0', () => {
      const deletedCount = TodoListService.deleteTodosByTaskId('non-existent-task');
      expect(deletedCount).toBe(0);
    });

    test('应该能够删除待办事项，无论其完成状态如何', () => {
      const taskId = 'task-1';
      const todo1 = TodoListService.createTodo('Todo 1', taskId);
      TodoListService.createTodo('Todo 2', taskId);
      TodoListService.markTodoAsDone(todo1.id);

      const deletedCount = TodoListService.deleteTodosByTaskId(taskId);
      expect(deletedCount).toBe(2);
      expect(TodoListService.getTodosByTaskId(taskId)).toHaveLength(0);
    });
  });

  describe('getAllTodos', () => {
    test('应该能够返回所有任务的所有待办事项', () => {
      TodoListService.createTodo('Todo 1', 'task-1');
      TodoListService.createTodo('Todo 2', 'task-1');
      TodoListService.createTodo('Todo 3', 'task-2');

      const allTodos = TodoListService.getAllTodos();
      expect(allTodos).toHaveLength(3);
    });
  });

  describe('getActiveTodos', () => {
    test('应该只返回所有任务中未完成的待办事项', () => {
      const taskId = 'task-1';
      const todo1 = TodoListService.createTodo('Todo 1', taskId);
      const todo2 = TodoListService.createTodo('Todo 2', taskId);
      TodoListService.markTodoAsDone(todo1.id);

      const activeTodos = TodoListService.getActiveTodos();
      expect(activeTodos).toHaveLength(1);
      expect(activeTodos[0]?.id).toBe(todo2.id);
    });
  });

  describe('getCompletedTodos', () => {
    test('应该只返回所有任务中已完成的待办事项', () => {
      const taskId = 'task-1';
      const todo1 = TodoListService.createTodo('Todo 1', taskId);
      TodoListService.createTodo('Todo 2', taskId);
      TodoListService.markTodoAsDone(todo1.id);

      const completedTodos = TodoListService.getCompletedTodos();
      expect(completedTodos).toHaveLength(1);
      expect(completedTodos[0]?.id).toBe(todo1.id);
    });
  });

  describe('updateTodo', () => {
    test('应该能够更新待办事项的文本', () => {
      const taskId = 'task-1';
      const todo = TodoListService.createTodo('Original text', taskId);
      const updated = TodoListService.updateTodo(todo.id, { text: 'Updated text' });

      expect(updated.text).toBe('Updated text');
      expect(updated.taskId).toBe(taskId); // taskId should remain unchanged
      expect(updated.completed).toBe(false);
      expect(updated.updatedAt).toBeGreaterThanOrEqual(todo.updatedAt);
    });

    test('应该能够更新待办事项的完成状态', () => {
      const taskId = 'task-1';
      const todo = TodoListService.createTodo('Test todo', taskId);
      const updated = TodoListService.updateTodo(todo.id, { completed: true });

      expect(updated.completed).toBe(true);
      expect(updated.text).toBe('Test todo');
      expect(updated.taskId).toBe(taskId);
    });

    test('更新时不应该改变 taskId', () => {
      const taskId = 'task-1';
      const todo = TodoListService.createTodo('Test todo', taskId);
      const updated = TodoListService.updateTodo(todo.id, { text: 'New text', completed: true });

      expect(updated.taskId).toBe(taskId);
    });
  });

  describe('markTodoAsDone and markTodoAsUndone', () => {
    test('应该能够将待办事项标记为完成', () => {
      const taskId = 'task-1';
      const todo = TodoListService.createTodo('Test todo', taskId);
      const done = TodoListService.markTodoAsDone(todo.id);

      expect(done.completed).toBe(true);
      expect(done.taskId).toBe(taskId);
    });

    test('应该能够将待办事项标记为未完成', () => {
      const taskId = 'task-1';
      const todo = TodoListService.createTodo('Test todo', taskId);
      TodoListService.markTodoAsDone(todo.id);
      const undone = TodoListService.markTodoAsUndone(todo.id);

      expect(undone.completed).toBe(false);
      expect(undone.taskId).toBe(taskId);
    });
  });

  describe('deleteTodo', () => {
    test('应该能够删除指定的待办事项', () => {
      const taskId = 'task-1';
      const todo1 = TodoListService.createTodo('Todo 1', taskId);
      const todo2 = TodoListService.createTodo('Todo 2', taskId);

      TodoListService.deleteTodo(todo1.id);

      const remaining = TodoListService.getAllTodos();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.id).toBe(todo2.id);
    });

    test('当待办事项不存在时应该抛出错误', () => {
      expect(() => {
        TodoListService.deleteTodo('non-existent-id');
      }).toThrow('待办事项不存在: non-existent-id');
    });
  });

  describe('clearAllTodos', () => {
    test('应该能够删除所有待办事项', () => {
      TodoListService.createTodo('Todo 1', 'task-1');
      TodoListService.createTodo('Todo 2', 'task-2');
      TodoListService.createTodo('Todo 3', 'task-3');

      TodoListService.clearAllTodos();

      expect(TodoListService.getAllTodos()).toHaveLength(0);
    });
  });

  describe('taskId requirement', () => {
    test('所有待办事项都必须有 taskId', () => {
      const taskId = 'task-1';
      const todo = TodoListService.createTodo('Test todo', taskId);

      expect(todo.taskId).toBeDefined();
      expect(todo.taskId).toBe(taskId);
    });

    test('getTodosByTaskId 应该能够正确过滤', () => {
      const taskId1 = 'task-1';
      const taskId2 = 'task-2';

      TodoListService.createTodo('Todo 1', taskId1);
      TodoListService.createTodo('Todo 2', taskId1);
      TodoListService.createTodo('Todo 3', taskId2);

      const todos1 = TodoListService.getTodosByTaskId(taskId1);
      expect(todos1).toHaveLength(2);
      expect(todos1.every((t) => t.taskId === taskId1)).toBe(true);

      const todos2 = TodoListService.getTodosByTaskId(taskId2);
      expect(todos2).toHaveLength(1);
      expect(todos2[0]?.taskId).toBe(taskId2);
    });
  });
});
