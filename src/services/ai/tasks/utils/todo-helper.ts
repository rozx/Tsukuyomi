import type { AppLocale } from 'src/models/locale';
import { agentText, translateText } from 'src/i18n/translate';
/**
 * Todo 辅助函数
 * 用于在 AI 任务服务中管理待办事项
 */

import { TodoListService, type TodoItem } from 'src/services/todo-list-service';

/**
 * 获取待办事项的系统提示词片段
 * @param hasContext 是否存在任务/会话上下文（无上下文时不注入待办说明）
 */
export function getTodosSystemPrompt(hasContext: boolean, uiLocale: AppLocale = 'zh-CN'): string {
  return hasContext ? agentText('aiTodo.system') : '';
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
  uiLocale: AppLocale = 'zh-CN',
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

  let reminder = translateText(uiLocale, 'aiWorkflow.reminder');
  if (workingTodo) {
    const firstLine = workingTodo.text.split('\n')[0]!;
    reminder += translateText(uiLocale, 'aiWorkflow.workingReminder', { text: firstLine });
  } else if (pendingTodos.length > 0) {
    reminder += translateText(uiLocale, 'aiWorkflow.pendingReminder', {
      count: pendingTodos.length,
    });
  }

  return reminder;
}
