import { TodoListService, type TodoItem, type TodoStatus } from 'src/services/todo-list-service';
import type { ToolDefinition } from './types';

type CreateTodoAction = {
  type: 'create';
  entity: 'todo';
  data: TodoItem;
};

/**
 * 按 ID 操作单个待办事项工具（mark_todo_done / mark_todo_working / delete_todo）
 * 共用的 parameters schema：仅 id: string 必填。
 */
const TODO_BY_ID_PARAMETERS = {
  type: 'object' as const,
  properties: {
    id: {
      type: 'string',
      description: '待办事项的 ID',
    },
  },
  required: ['id'],
};

function dispatchTodoCreated(
  todo: TodoItem,
  onAction: ((action: CreateTodoAction) => void) | undefined,
): void {
  if (!onAction) return;
  onAction({ type: 'create', entity: 'todo', data: todo });
}

function createBatchTodos(
  items: string[],
  taskId: string,
  sessionId: string | undefined,
  onAction: ((action: CreateTodoAction) => void) | undefined,
): string {
  const createdTodos: TodoItem[] = [];
  const errors: string[] = [];

  for (const itemText of items) {
    if (!itemText || !itemText.trim()) {
      errors.push('待办事项内容不能为空');
      continue;
    }
    try {
      const todo = TodoListService.createTodo(itemText.trim(), taskId, sessionId);
      createdTodos.push(todo);
      dispatchTodoCreated(todo, onAction);
    } catch (error) {
      errors.push(
        `创建待办事项 "${itemText.slice(0, 20)}..." 失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (createdTodos.length === 0) {
    throw new Error(`批量创建待办事项失败：${errors.join('; ')}`);
  }

  return JSON.stringify({
    success: true,
    message: `成功创建 ${createdTodos.length} 个待办事项${errors.length > 0 ? `，${errors.length} 个失败` : ''}`,
    todos: createdTodos.map((todo) => ({
      id: todo.id,
      text: todo.text,
      status: todo.status,
    })),
    count: createdTodos.length,
    ...(errors.length > 0 ? { errors } : {}),
  });
}

type UpdateTodoAction = {
  type: 'update';
  entity: 'todo';
  data: TodoItem;
  previousData?: TodoItem;
};

const VALID_TODO_STATUSES: readonly TodoStatus[] = ['pending', 'working', 'done'];

function dispatchTodoUpdated(
  previous: TodoItem | undefined,
  updated: TodoItem,
  onAction: ((action: UpdateTodoAction) => void) | undefined,
): void {
  if (!onAction) return;
  onAction({
    type: 'update',
    entity: 'todo',
    data: updated,
    ...(previous ? { previousData: previous } : {}),
  });
}

function updateSingleTodoItem(
  item: { id: string; text?: string; status?: TodoStatus },
  onAction: ((action: UpdateTodoAction) => void) | undefined,
  errors: string[],
): TodoItem | null {
  if (!item.id) {
    errors.push('待办事项 ID 不能为空');
    return null;
  }
  if (item.status !== undefined && !VALID_TODO_STATUSES.includes(item.status)) {
    errors.push(
      `待办事项 "${item.id}" 状态无效: "${item.status}"，有效值为: ${VALID_TODO_STATUSES.join(', ')}`,
    );
    return null;
  }
  try {
    const updates: { text?: string; status?: TodoStatus } = {};
    if (item.text !== undefined) updates.text = item.text;
    if (item.status !== undefined) updates.status = item.status;
    const previousTodo = TodoListService.getTodoById(item.id);
    const updatedTodo = TodoListService.updateTodo(item.id, updates);
    dispatchTodoUpdated(previousTodo, updatedTodo, onAction);
    return updatedTodo;
  } catch (error) {
    errors.push(
      `更新待办事项 "${item.id}" 失败: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

function updateBatchTodos(
  items: Array<{ id: string; text?: string; status?: TodoStatus }>,
  onAction: ((action: UpdateTodoAction) => void) | undefined,
): string {
  const updatedTodos: TodoItem[] = [];
  const errors: string[] = [];
  for (const item of items) {
    const updated = updateSingleTodoItem(item, onAction, errors);
    if (updated) updatedTodos.push(updated);
  }
  if (updatedTodos.length === 0) {
    throw new Error(`批量更新待办事项失败：${errors.join('; ')}`);
  }
  return JSON.stringify({
    success: true,
    message: `成功更新 ${updatedTodos.length} 个待办事项${errors.length > 0 ? `，${errors.length} 个失败` : ''}`,
    todos: updatedTodos.map((todo) => ({ id: todo.id, text: todo.text, status: todo.status })),
    count: updatedTodos.length,
    ...(errors.length > 0 ? { errors } : {}),
  });
}

function updateOneTodo(
  id: string,
  text: string | undefined,
  status: TodoStatus | undefined,
  onAction: ((action: UpdateTodoAction) => void) | undefined,
): string {
  const updates: { text?: string; status?: TodoStatus } = {};
  if (text !== undefined) updates.text = text;
  if (status !== undefined) updates.status = status;
  const previousTodo = TodoListService.getTodoById(id);
  const updatedTodo = TodoListService.updateTodo(id, updates);
  dispatchTodoUpdated(previousTodo, updatedTodo, onAction);
  return JSON.stringify({
    success: true,
    message: '待办事项更新成功',
    todo: { id: updatedTodo.id, text: updatedTodo.text, status: updatedTodo.status },
  });
}

function createSingleTodo(
  text: string,
  taskId: string,
  sessionId: string | undefined,
  onAction: ((action: CreateTodoAction) => void) | undefined,
): string {
  if (!text || !text.trim()) {
    throw new Error('待办事项内容不能为空');
  }
  const todo = TodoListService.createTodo(text, taskId, sessionId);
  dispatchTodoCreated(todo, onAction);
  return JSON.stringify({
    success: true,
    message: '待办事项创建成功',
    todo: { id: todo.id, text: todo.text, status: todo.status },
  });
}

export const todoListTools: ToolDefinition[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'create_todo',
        description:
          '创建新的待办事项。可以创建单个待办事项（使用 text 参数）或多个待办事项（使用 items 参数）。当用户要求添加任务或待办事项时使用此工具。[警告] 重要：创建待办事项时，必须创建详细、可执行的待办事项，而不是总结性的待办事项。每个待办事项应该是具体且可操作的，而不是高层次的总结。如果你规划了一个包含多个步骤的任务，必须为每个步骤创建一个独立的待办事项。',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description:
                '单个待办事项的内容描述（与 items 参数二选一）。[警告] 重要：必须提供详细、具体、可执行的描述，而不是总结性的描述。例如："翻译第1-5段，检查术语一致性" 而不是 "翻译文本"。',
            },
            items: {
              type: 'array',
              items: {
                type: 'string',
              },
              description:
                '多个待办事项的内容列表（与 text 参数二选一）。用于批量创建多个待办事项。[警告] 重要：每个待办事项必须提供详细、具体、可执行的描述，而不是总结性的描述。例如：["翻译第1-5段，检查术语一致性", "翻译第6-10段，确保角色名称翻译一致"] 而不是 ["翻译文本", "检查一致性"]。',
            },
          },
        },
      },
    },
    handler: (args, { onAction, taskId, sessionId }) => {
      const { text, items } = args as {
        text?: string;
        items?: string[];
      };
      if (!taskId) {
        throw new Error(
          '任务 ID 未提供，待办事项必须关联到 AI 任务。这通常表示服务层未正确传递任务上下文。',
        );
      }

      if (items && Array.isArray(items) && items.length > 0) {
        return createBatchTodos(items, taskId, sessionId, onAction as never);
      }
      if (text !== undefined && text !== null) {
        return createSingleTodo(text, taskId, sessionId, onAction as never);
      }
      throw new Error('必须提供 text 或 items 参数之一');
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'update_todos',
        description:
          '更新待办事项的内容或状态。可以更新单个待办事项（使用 id 参数）或多个待办事项（使用 items 参数）。可以更新文本内容或状态。',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: '单个待办事项的 ID（与 items 参数二选一）',
            },
            text: {
              type: 'string',
              description: '新的待办事项内容（可选，仅当使用 id 参数时有效）',
            },
            status: {
              type: 'string',
              enum: ['pending', 'working', 'done'],
              description: '新的待办事项状态（可选，仅当使用 id 参数时有效）',
            },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: '待办事项的 ID',
                  },
                  text: {
                    type: 'string',
                    description: '新的待办事项内容（可选）',
                  },
                  status: {
                    type: 'string',
                    enum: ['pending', 'working', 'done'],
                    description: '新的待办事项状态（可选）',
                  },
                },
                required: ['id'],
              },
              description: '多个待办事项的更新列表（与 id 参数二选一）。用于批量更新多个待办事项。',
            },
          },
        },
      },
    },
    handler: (args, { onAction }) => {
      const { id, text, status, items } = args as {
        id?: string;
        text?: string;
        status?: TodoStatus;
        items?: Array<{ id: string; text?: string; status?: TodoStatus }>;
      };
      if (items && Array.isArray(items) && items.length > 0) {
        return updateBatchTodos(items, onAction as never);
      }
      if (id) {
        return updateOneTodo(id, text, status, onAction as never);
      }
      throw new Error('必须提供 id 或 items 参数之一');
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'mark_todo_done',
        description: '将待办事项标记为完成。',
        parameters: TODO_BY_ID_PARAMETERS,
      },
    },
    handler: (args, { onAction }) => {
      const { id } = args as {
        id: string;
      };
      if (!id) {
        throw new Error('待办事项 ID 不能为空');
      }

      const previousTodo = TodoListService.getTodoById(id);
      const updatedTodo = TodoListService.markTodoAsDone(id);

      // 通过 onAction 回调传递操作信息（不需要 toast）
      if (onAction) {
        onAction({
          type: 'update',
          entity: 'todo',
          data: updatedTodo,
          ...(previousTodo ? { previousData: previousTodo } : {}),
        });
      }

      return JSON.stringify({
        success: true,
        message: '待办事项已标记为完成',
        todo: {
          id: updatedTodo.id,
          text: updatedTodo.text,
          status: updatedTodo.status,
        },
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'mark_todo_working',
        description: '将待办事项标记为进行中。在开始处理某个待办事项之前调用此工具。',
        parameters: TODO_BY_ID_PARAMETERS,
      },
    },
    handler: (args, { onAction }) => {
      const { id } = args as {
        id: string;
      };
      if (!id) {
        throw new Error('待办事项 ID 不能为空');
      }

      const previousTodo = TodoListService.getTodoById(id);
      const updatedTodo = TodoListService.markTodoAsWorking(id);

      if (onAction) {
        onAction({
          type: 'update',
          entity: 'todo',
          data: updatedTodo,
          ...(previousTodo ? { previousData: previousTodo } : {}),
        });
      }

      return JSON.stringify({
        success: true,
        message: '待办事项已标记为进行中',
        todo: {
          id: updatedTodo.id,
          text: updatedTodo.text,
          status: updatedTodo.status,
        },
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'delete_todo',
        description: '删除待办事项。',
        parameters: TODO_BY_ID_PARAMETERS,
      },
    },
    handler: (args, { onAction }) => {
      const { id } = args as {
        id: string;
      };
      if (!id) {
        throw new Error('待办事项 ID 不能为空');
      }

      const todo = TodoListService.getTodoById(id);
      if (!todo) {
        throw new Error(`待办事项不存在: ${id}`);
      }

      TodoListService.deleteTodo(id);

      // 通过 onAction 回调传递操作信息（不需要 toast）
      if (onAction) {
        onAction({
          type: 'delete',
          entity: 'todo',
          data: todo,
        });
      }

      return JSON.stringify({
        success: true,
        message: '待办事项删除成功',
        todo: {
          id: todo.id,
          text: todo.text,
        },
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'list_todos',
        description:
          '列出当前任务的待办事项列表。返回当前任务关联的所有待办事项，每个待办事项包含 id、text、completed 等字段。可以过滤获取所有、仅未完成或仅已完成的待办事项。注意：此工具仅返回当前任务（taskId）的待办事项，不会返回其他任务的待办事项。',
        parameters: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              enum: ['all', 'active', 'completed'],
              description:
                '过滤类型：all-返回所有待办事项列表，active-仅返回未完成的待办事项列表，completed-仅返回已完成的待办事项列表',
            },
          },
        },
      },
    },
    handler: (args, { taskId, sessionId }) => {
      const { filter = 'all' } = args as {
        filter?: 'all' | 'active' | 'completed';
      };

      if (!taskId) {
        throw new Error('任务 ID 未提供，无法列出待办事项。这通常表示服务层未正确传递任务上下文。');
      }

      // taskId 和 sessionId 由服务层自动提供
      // 对于助手聊天，优先使用 sessionId 过滤待办事项；否则使用 taskId
      let todos: TodoItem[];
      const taskTodos = sessionId
        ? TodoListService.getTodosBySessionId(sessionId)
        : TodoListService.getTodosByTaskId(taskId);
      switch (filter) {
        case 'active':
          todos = taskTodos.filter((todo) => todo.status !== 'done');
          break;
        case 'completed':
          todos = taskTodos.filter((todo) => todo.status === 'done');
          break;
        default:
          todos = taskTodos;
      }

      return JSON.stringify({
        success: true,
        todos: todos.map((todo) => ({
          id: todo.id,
          text: todo.text,
          status: todo.status,
          createdAt: todo.createdAt,
          updatedAt: todo.updatedAt,
        })),
        count: todos.length,
      });
    },
  },
];
