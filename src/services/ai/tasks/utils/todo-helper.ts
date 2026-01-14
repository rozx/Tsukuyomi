/**
 * Todo 辅助函数
 * 用于在 AI 任务服务中管理待办事项
 */

import { TodoListService, type TodoItem } from 'src/services/todo-list-service';

/**
 * 获取待办事项的系统提示词片段
 * @param taskId 任务 ID（必需）
 * @param sessionId 会话 ID（可选，用于助手聊天会话）
 */
export function getTodosSystemPrompt(taskId: string, sessionId?: string): string {
  if (!taskId) {
    return '';
  }
  // 对于助手聊天，优先使用 sessionId 获取待办事项；否则使用 taskId
  const activeTodos = sessionId
    ? TodoListService.getTodosBySessionId(sessionId).filter((todo) => !todo.completed)
    : TodoListService.getTodosByTaskId(taskId).filter((todo) => !todo.completed);

  if (activeTodos.length === 0) {
    return '';
  }

  let prompt =
    '\n========================================\n【待办事项管理】\n========================================\n';
  prompt += '你可以使用待办事项来规划和管理任务。以下是当前待办事项列表。\n\n';

  activeTodos.forEach((todo, index) => {
    prompt += `${index + 1}. [${todo.id}] ${todo.text}\n`;
  });

  prompt += '\n**待办事项工具使用说明**：\n';
  prompt += '- **创建待办**：使用 `create_todo` 工具创建新的待办事项来规划任务\n';
  prompt +=
    '- **查看待办**：使用 `list_todos` 工具查看所有待办事项（支持过滤：all/active/completed）\n';
  prompt +=
    '- **更新待办**：使用 `update_todos` 工具更新待办事项的内容或状态（支持单个或批量更新）\n';
  prompt += '- **标记完成**：当你完成了一个待办事项时，使用 `mark_todo_done` 工具将其标记为完成\n';
  prompt += '- **删除待办**：使用 `delete_todo` 工具删除不需要的待办事项\n';
  prompt += '\n**重要提示**：\n';
  prompt += '- **优先处理现有待办**：如果当前任务与某个待办事项相关，请优先完成它\n';
  prompt +=
    '- **仅在需要时创建新待办**：只有当任务确实较复杂、需要分步跟踪进度时，才建议使用 `create_todo` 创建待办事项\n';
  prompt +=
    '- **创建要具体可执行**：待办事项应包含明确范围与动作。例如："翻译第1-5段，检查术语一致性"，而不是 "翻译文本"\n';
  prompt +=
    '- **多步骤任务可拆分**：如需跟踪多步骤进度，可为每个步骤创建独立待办；也可用 `items` 参数批量创建\n';
  prompt += '- **完成就标记**：只有真正完成时才使用 `mark_todo_done` 标记完成\n';

  return prompt;
}

/**
 * 创建任务相关的待办事项
 * @param taskType 任务类型
 * @param taskDescription 任务描述
 * @param taskId 任务 ID（必需）
 */
export function createTaskTodo(
  taskType: 'translation' | 'polish' | 'proofreading' | 'assistant',
  taskDescription: string,
  taskId: string,
): TodoItem | null {
  try {
    if (!taskId) {
      throw new Error('任务 ID 不能为空');
    }
    const taskTypeLabels = {
      translation: '翻译',
      polish: '润色',
      proofreading: '校对',
      assistant: '助手',
    };

    const todoText = `[${taskTypeLabels[taskType]}] ${taskDescription}`;
    return TodoListService.createTodo(todoText, taskId);
  } catch (error) {
    console.error('[TodoHelper] 创建待办事项失败:', error);
    return null;
  }
}

/**
 * 查找并标记相关的待办事项为完成
 */
export function markRelatedTodosDone(
  taskType: 'translation' | 'polish' | 'proofreading' | 'assistant',
  taskDescription?: string,
): void {
  try {
    const taskTypeLabels = {
      translation: '翻译',
      polish: '润色',
      proofreading: '校对',
      assistant: '助手',
    };

    const label = taskTypeLabels[taskType];
    const activeTodos = TodoListService.getActiveTodos();

    // 查找包含任务类型的待办事项
    const relatedTodos = activeTodos.filter((todo) => {
      if (todo.text.includes(`[${label}]`)) {
        // 如果提供了任务描述，尝试匹配更精确的待办
        if (taskDescription) {
          return todo.text.includes(taskDescription) || todo.text.includes(label);
        }
        return true;
      }
      return false;
    });

    // 标记找到的待办为完成
    for (const todo of relatedTodos) {
      TodoListService.markTodoAsDone(todo.id);
      console.log(`[TodoHelper] 标记待办事项为完成: ${todo.text}`);
    }
  } catch (error) {
    console.error('[TodoHelper] 标记待办事项失败:', error);
  }
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
      ? TodoListService.getTodosBySessionId(sessionId).filter((todo) => !todo.completed)
      : TodoListService.getTodosByTaskId(taskId).filter((todo) => !todo.completed));

  if (todos.length === 0) {
    return '';
  }

  let reminder = '\n**[待办] 待办事项提醒**：\n';
  reminder += '工具调用已完成。请继续完成任务，并注意以下待办事项：\n\n';

  todos.slice(0, 5).forEach((todo, index) => {
    reminder += `${index + 1}. ${todo.text}\n`;
  });

  if (todos.length > 5) {
    reminder += `... 还有 ${todos.length - 5} 个待办事项\n`;
  }

  reminder += '\n**下一步操作**：\n';
  reminder += '1. 继续完成当前任务\n';
  reminder +=
    '2. **评估你的进度**：如果你已经完成了某个待办事项，请使用 `mark_todo_done` 工具将其标记为完成\n';
  reminder += '3. 使用 `list_todos` 工具查看完整待办列表（如有需要）\n';
  reminder += '4. **重要**：只有当你真正完成了待办事项的任务时才标记为完成，不要过早标记\n';

  return reminder;
}

/**
 * 获取待办事项的简要列表（用于添加到提示词）
 * @param taskId 任务 ID（必需）
 */
export function getTodosSummary(taskId: string): string {
  if (!taskId) {
    return '当前无待办事项。';
  }
  const activeTodos = TodoListService.getTodosByTaskId(taskId).filter((todo) => !todo.completed);

  if (activeTodos.length === 0) {
    return '当前无待办事项。';
  }

  return `当前有 ${activeTodos.length} 个待办事项：${activeTodos
    .slice(0, 3)
    .map((t) => t.text)
    .join('；')}${activeTodos.length > 3 ? '...' : ''}`;
}
