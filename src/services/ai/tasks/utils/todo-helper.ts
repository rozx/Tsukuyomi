/**
 * Todo 辅助函数
 * 用于在 AI 任务服务中管理待办事项
 */

import { TodoListService, type TodoItem } from 'src/services/todo-list-service';

/**
 * 获取待办事项的系统提示词片段
 * @param hasContext 是否存在任务/会话上下文（无上下文时不注入待办说明）
 */
export function getTodosSystemPrompt(hasContext: boolean): string {
  if (!hasContext) {
    return '';
  }

  return (
    '\n**待办系统**：\n' +
    '- 系统自动生成预定义待办，【待办清单】始终显示在上下文中，无需调用 list_todos\n' +
    '- 完成一项就调用 `mark_todo_done` 标记；一次完成多项时用 `ids` 批量标记\n' +
    '- `mark_todo_working` 为可选，仅用于向用户展示当前进度\n' +
    '- 所有预定义待办标记 done 后才能切换到下一阶段\n'
  );
}

/**
 * 在工具调用后，生成提醒 AI 下一步的提示
 * @param currentTodos 当前的待办事项列表（可选）
 * @param taskId 任务 ID（必需）
 * @param sessionId 会话 ID（可选，用于助手聊天会话）
 */
export function getPostToolCallReminder(
  currentTodos: TodoItem[] | undefined,
  taskId: string,
  sessionId?: string,
): string {
  if (!taskId) {
    return '';
  }
  // 对于助手聊天，优先使用 sessionId 获取待办事项；否则使用 taskId
  const todos =
    currentTodos ||
    (sessionId
      ? TodoListService.getTodosBySessionId(sessionId).filter((todo) => todo.status !== 'done')
      : TodoListService.getTodosByTaskId(taskId).filter((todo) => todo.status !== 'done'));

  if (todos.length === 0) {
    return '';
  }

  const workingTodo = todos.find((t) => t.status === 'working');
  const pendingTodos = todos.filter((t) => t.status === 'pending');

  let reminder = '\n**[待办提醒]**\n';
  if (workingTodo) {
    const firstLine = workingTodo.text.split('\n')[0]!;
    reminder += `→ 当前进行中：${firstLine}\n`;
    reminder += '  完成后请调用 mark_todo_done 标记\n';
  } else if (pendingTodos.length > 0) {
    reminder += `还有 ${pendingTodos.length} 个待办事项待处理\n`;
    reminder += '完成后调用 mark_todo_done 标记（多项可用 ids 批量标记）\n';
  }

  return reminder;
}
