/**
 * Todo 辅助函数
 * 用于在 AI 任务服务中管理待办事项
 */

import { TodoListService, type TodoItem } from 'src/services/todo-list-service';

/**
 * 获取待办事项的系统提示词片段
 */
export function getTodosSystemPrompt(): string {
  const activeTodos = TodoListService.getActiveTodos();

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
  prompt += '- **更新待办**：使用 `update_todo` 工具更新待办事项的内容或状态\n';
  prompt += '- **标记完成**：当你完成了一个待办事项时，使用 `mark_todo_done` 工具将其标记为完成\n';
  prompt += '- **删除待办**：使用 `delete_todo` 工具删除不需要的待办事项\n';
  prompt += '\n**重要提示**：\n';
  prompt += '- **规划建议**：在开始复杂任务前，你可以使用 `create_todo` 创建待办事项来规划步骤\n';
  prompt +=
    '- **进度跟踪**：如果你已经完成了某个待办事项，立即使用 `mark_todo_done` 工具将其标记为完成\n';
  prompt += '- **任务关联**：如果当前任务与某个待办事项相关，请优先处理该待办事项\n';
  prompt +=
    '- **只有真正完成时才标记**：只有当待办事项的任务真正完成时才标记为完成，不要过早标记\n';

  return prompt;
}

/**
 * 创建任务相关的待办事项
 */
export function createTaskTodo(
  taskType: 'translation' | 'polish' | 'proofreading' | 'assistant',
  taskDescription: string,
): TodoItem | null {
  try {
    const taskTypeLabels = {
      translation: '翻译',
      polish: '润色',
      proofreading: '校对',
      assistant: '助手',
    };

    const todoText = `[${taskTypeLabels[taskType]}] ${taskDescription}`;
    return TodoListService.createTodo(todoText);
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
 */
export function getPostToolCallReminder(currentTodos?: TodoItem[]): string {
  const todos = currentTodos || TodoListService.getActiveTodos();

  if (todos.length === 0) {
    return '';
  }

  let reminder = '\n**📋 待办事项提醒**：\n';
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
 */
export function getTodosSummary(): string {
  const activeTodos = TodoListService.getActiveTodos();

  if (activeTodos.length === 0) {
    return '当前无待办事项。';
  }

  return `当前有 ${activeTodos.length} 个待办事项：${activeTodos
    .slice(0, 3)
    .map((t) => t.text)
    .join('；')}${activeTodos.length > 3 ? '...' : ''}`;
}
