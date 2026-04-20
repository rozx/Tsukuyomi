import { TodoListService } from 'src/services/todo-list-service';

/**
 * 任务未完成待办提醒载荷
 * 返回给 AI 工具调用方的未完成待办摘要
 */
export interface TodoReminder {
  incomplete_count: number;
  todos: Array<{ id: string; text: string }>;
}

/**
 * 构建指定任务的未完成待办提醒
 * 仅当存在未完成待办时返回结果，用于减少 token 消耗
 */
export function buildIncompleteTodoReminder(taskId: string): TodoReminder | undefined {
  const incompleteTodos = TodoListService.getTodosByTaskId(taskId).filter(
    (t) => t.status !== 'done',
  );
  if (incompleteTodos.length === 0) {
    return undefined;
  }
  return {
    incomplete_count: incompleteTodos.length,
    todos: incompleteTodos.map((t) => ({ id: t.id, text: t.text })),
  };
}
