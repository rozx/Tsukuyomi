import './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { getDB } from 'src/utils/indexed-db';
import { useAIProcessingStore, type AIProcessingTask } from 'src/stores/ai-processing';
import { TodoListService } from 'src/services/todo-list-service';
import { collectTaskStatusTransitions } from 'src/composables/main-layout/task-status-toasts';

function record(patch: Partial<AIProcessingTask>): AIProcessingTask {
  return {
    id: 't',
    type: 'translation',
    modelName: 'M',
    status: 'thinking',
    startTime: 1,
    ...patch,
  } as AIProcessingTask;
}

describe('aiProcessing 加载 · 队列任务记录', () => {
  beforeEach(() => {
    localStorage.clear();
    TodoListService.clearAllTodos();
    setActivePinia(createPinia());
  });

  it('不改写带 queueItemId 的运行中记录，也不删除其待办；普通记录照旧标为中断', async () => {
    const db = await getDB();
    await db.put('thinking-processes', record({ id: 'queued-run', queueItemId: 'q1' }));
    await db.put('thinking-processes', record({ id: 'plain-run', type: 'assistant' }));
    TodoListService.createTodo('队列任务待办', 'queued-run');
    TodoListService.createTodo('普通任务待办', 'plain-run');

    const store = useAIProcessingStore();
    await store.loadThinkingProcesses();

    const byId = new Map(store.activeTasks.map((task) => [task.id, task]));
    expect(byId.get('queued-run')?.status).toBe('thinking');
    expect(byId.get('plain-run')?.status).toBe('error');
    expect(TodoListService.getTodosByTaskId('queued-run')).toHaveLength(1);
    expect(TodoListService.getTodosByTaskId('plain-run')).toHaveLength(0);
    expect((await db.get('thinking-processes', 'queued-run'))?.status).toBe('thinking');
  });
});

describe('collectTaskStatusTransitions', () => {
  it('跳过带 queueItemId 的任务（由任务队列负责提示）', () => {
    const previous = new Map<string, AIProcessingTask>();
    collectTaskStatusTransitions(previous, [
      record({ id: 'a', status: 'thinking', queueItemId: 'q1' }),
      record({ id: 'b', status: 'thinking' }),
    ]);
    const { errorTasks, cancelledTasks } = collectTaskStatusTransitions(previous, [
      record({ id: 'a', status: 'cancelled', queueItemId: 'q1' }),
      record({ id: 'b', status: 'error' }),
    ]);
    expect(errorTasks.map((task) => task.id)).toEqual(['b']);
    expect(cancelledTasks).toEqual([]);
  });

  it('首次出现即为终态的任务不提示', () => {
    const previous = new Map<string, AIProcessingTask>();
    const { errorTasks } = collectTaskStatusTransitions(previous, [
      record({ id: 'c', status: 'error' }),
    ]);
    expect(errorTasks).toEqual([]);
  });
});
