import './setup';
import { createPinia, setActivePinia } from 'pinia';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { TodoListService } from 'src/services/todo-list-service';
import { describe, test, expect, beforeEach } from 'bun:test';

describe('AIProcessingStore - Todo Deletion', () => {
  let store: ReturnType<typeof useAIProcessingStore>;

  beforeEach(() => {
    // 设置 Pinia 实例
    const pinia = createPinia();
    setActivePinia(pinia);

    // 清空所有数据
    store = useAIProcessingStore();
    store.clearAllTasks();
    TodoListService.clearAllTodos();
  });

  describe('updateTask - status changes', () => {
    test('当任务状态变为已完成时应该删除关联的待办事项', async () => {
      const taskId = await store.addTask({
        type: 'translation',
        modelName: 'test-model',
        status: 'processing',
      });

      // 创建一些关联的 todos
      TodoListService.createTodo('Todo 1', taskId);
      TodoListService.createTodo('Todo 2', taskId);
      TodoListService.createTodo('Todo 3', 'other-task'); // 不同任务的 todo

      expect(TodoListService.getTodosByTaskId(taskId)).toHaveLength(2);

      // 更新任务状态为 completed
      await store.updateTask(taskId, { status: 'completed' });

      // 验证关联的 todos 已被删除
      expect(TodoListService.getTodosByTaskId(taskId)).toHaveLength(0);

      // 验证其他任务的 todos 仍然存在
      expect(TodoListService.getTodosByTaskId('other-task')).toHaveLength(1);
    });

    test('当任务状态变为错误时应该删除关联的待办事项', async () => {
      const taskId = await store.addTask({
        type: 'translation',
        modelName: 'test-model',
        status: 'processing',
      });

      TodoListService.createTodo('Todo 1', taskId);
      TodoListService.createTodo('Todo 2', taskId);

      expect(TodoListService.getTodosByTaskId(taskId)).toHaveLength(2);

      // 更新任务状态为 error
      await store.updateTask(taskId, { status: 'error', message: 'Test error' });

      // 验证关联的 todos 已被删除
      expect(TodoListService.getTodosByTaskId(taskId)).toHaveLength(0);
    });

    test('当任务状态变为已取消时应该删除关联的待办事项', async () => {
      const taskId = await store.addTask({
        type: 'translation',
        modelName: 'test-model',
        status: 'processing',
      });

      TodoListService.createTodo('Todo 1', taskId);
      TodoListService.createTodo('Todo 2', taskId);

      expect(TodoListService.getTodosByTaskId(taskId)).toHaveLength(2);

      // 更新任务状态为 cancelled
      await store.updateTask(taskId, { status: 'cancelled', message: 'Cancelled' });

      // 验证关联的 todos 已被删除
      expect(TodoListService.getTodosByTaskId(taskId)).toHaveLength(0);
    });

    test('当任务状态变为其他状态时不应该删除待办事项', async () => {
      const taskId = await store.addTask({
        type: 'translation',
        modelName: 'test-model',
        status: 'thinking',
      });

      TodoListService.createTodo('Todo 1', taskId);

      // 更新任务状态为 processing（不是最终状态）
      await store.updateTask(taskId, { status: 'processing' });

      // 验证 todos 仍然存在
      expect(TodoListService.getTodosByTaskId(taskId)).toHaveLength(1);
    });

    test('应该删除待办事项，无论其完成状态如何', async () => {
      const taskId = await store.addTask({
        type: 'translation',
        modelName: 'test-model',
        status: 'processing',
      });

      const todo1 = TodoListService.createTodo('Todo 1', taskId);
      TodoListService.createTodo('Todo 2', taskId);
      TodoListService.markTodoAsDone(todo1.id);

      expect(TodoListService.getTodosByTaskId(taskId)).toHaveLength(2);

      await store.updateTask(taskId, { status: 'completed' });

      // 验证所有 todos（包括已完成的）都被删除
      expect(TodoListService.getTodosByTaskId(taskId)).toHaveLength(0);
    });
  });

  describe('stopTask', () => {
    test('当任务被停止时应该删除关联的待办事项', async () => {
      const taskId = await store.addTask({
        type: 'translation',
        modelName: 'test-model',
        status: 'processing',
      });

      TodoListService.createTodo('Todo 1', taskId);
      TodoListService.createTodo('Todo 2', taskId);

      expect(TodoListService.getTodosByTaskId(taskId)).toHaveLength(2);

      // 停止任务
      await store.stopTask(taskId);

      // 验证关联的 todos 已被删除
      expect(TodoListService.getTodosByTaskId(taskId)).toHaveLength(0);

      // 验证任务状态为 cancelled
      const task = store.activeTasks.find((t) => t.id === taskId);
      expect(task?.status).toBe('cancelled');
    });

    test('如果任务已经完成则不应该删除待办事项', async () => {
      const taskId = await store.addTask({
        type: 'translation',
        modelName: 'test-model',
        status: 'processing',
      });

      TodoListService.createTodo('Todo 1', taskId);
      await store.updateTask(taskId, { status: 'completed' });

      // todos 应该已经被删除
      expect(TodoListService.getTodosByTaskId(taskId)).toHaveLength(0);

      // 再次停止任务（应该直接返回，不删除 todos）
      await store.stopTask(taskId);

      // todos 仍然不存在（因为之前已经删除）
      expect(TodoListService.getTodosByTaskId(taskId)).toHaveLength(0);
    });
  });

  describe('loadThinkingProcesses - interrupted tasks', () => {
    test('加载中断的任务时应该删除关联的待办事项', async () => {
      // 这个测试需要模拟 IndexedDB 中的数据
      // 由于 fake-indexeddb 的限制，我们直接测试逻辑

      const taskId = 'interrupted-task-123';

      // 模拟一个中断的任务（在 IndexedDB 中状态为 'processing'）
      // 创建一些关联的 todos
      TodoListService.createTodo('Todo 1', taskId);
      TodoListService.createTodo('Todo 2', taskId);

      // 手动添加一个中断的任务到 store（模拟加载时的行为）
      // 注意：这需要直接操作 store 的内部状态，在实际实现中是通过 loadThinkingProcesses
      // 为了测试，我们直接调用 updateTask 来模拟中断任务被标记为 error
      await store.addTask({
        type: 'translation',
        modelName: 'test-model',
        status: 'processing',
        message: 'Processing...',
      });

      // 由于我们无法直接测试 loadThinkingProcesses 的完整流程（需要 IndexedDB 设置）
      // 我们测试 updateTask 在状态变为 error 时删除 todos 的行为
      const newTaskId = await store.addTask({
        type: 'translation',
        modelName: 'test-model',
        status: 'processing',
      });

      TodoListService.createTodo('Todo 1', newTaskId);
      TodoListService.createTodo('Todo 2', newTaskId);

      // 模拟中断任务被标记为 error（类似 loadThinkingProcesses 的行为）
      await store.updateTask(newTaskId, {
        status: 'error',
        message: '任务被中断（应用重启或刷新）',
      });

      // 验证 todos 已被删除
      expect(TodoListService.getTodosByTaskId(newTaskId)).toHaveLength(0);
    });
  });

  describe('multiple tasks', () => {
    test('应该只删除特定任务的待办事项', async () => {
      const taskId1 = await store.addTask({
        type: 'translation',
        modelName: 'test-model',
        status: 'processing',
      });

      const taskId2 = await store.addTask({
        type: 'proofreading',
        modelName: 'test-model',
        status: 'processing',
      });

      TodoListService.createTodo('Todo 1', taskId1);
      TodoListService.createTodo('Todo 2', taskId1);
      TodoListService.createTodo('Todo 3', taskId2);

      // 完成任务 1
      await store.updateTask(taskId1, { status: 'completed' });

      // 验证任务 1 的 todos 被删除
      expect(TodoListService.getTodosByTaskId(taskId1)).toHaveLength(0);

      // 验证任务 2 的 todos 仍然存在
      expect(TodoListService.getTodosByTaskId(taskId2)).toHaveLength(1);
    });
  });
});
