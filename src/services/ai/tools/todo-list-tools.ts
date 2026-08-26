import { TodoListService, type TodoItem, type TodoStatus } from 'src/services/todo-list-service';
import type { ToolDefinition } from './types';

type CreateTodoAction = {
  type: 'create';
  entity: 'todo';
  data: TodoItem;
};

/**
 * 按 ID 操作单个待办事项工具（delete_todo）共用的 parameters schema：仅 id: string 必填。
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

/**
 * 状态翻转工具（mark_todo_done / mark_todo_working）的 parameters schema。
 * 支持 id 单条或 ids 批量 —— 批量可以把一个阶段的打卡压缩成一次工具调用。
 */
const TODO_STATUS_PARAMETERS = {
  type: 'object' as const,
  properties: {
    id: {
      type: 'string',
      description: '单个待办事项的 ID（与 ids 二选一）',
    },
    ids: {
      type: 'array' as const,
      items: { type: 'string' },
      description: '多个待办事项的 ID 列表（与 id 二选一）。一次性标记多项时优先使用。',
    },
  },
};

function dispatchTodoCreated(
  todo: TodoItem,
  onAction: ((action: CreateTodoAction) => void) | undefined,
): void {
  if (!onAction) return;
  onAction({ type: 'create', entity: 'todo', data: todo });
}

type UpdateTodoAction = {
  type: 'update';
  entity: 'todo';
  data: TodoItem;
  previousData?: TodoItem;
};

type TodoAction = CreateTodoAction | UpdateTodoAction;

/** 自动推进的作用域（任务/会话），未提供时不推进 */
interface AdvanceScope {
  taskId?: string | undefined;
  sessionId?: string | undefined;
}

/**
 * 生成响应体里的 autoAdvanced 字段（仅取首行文本，working 待办正文可能很长）。
 */
function autoAdvancedField(promoted: TodoItem | null): Record<string, unknown> {
  if (!promoted) return {};
  return {
    autoAdvanced: {
      id: promoted.id,
      text: promoted.text.split('\n')[0],
      status: promoted.status,
    },
  };
}

/**
 * 批量待办操作（创建 / 更新 / 状态翻转）共用的成功响应格式：
 * 逐项处理、部分失败不中断，最后统一回报成功项与错误列表。
 * 发生自动推进时附带 autoAdvanced 字段并在消息中说明。
 */
function buildBatchTodoResponse(
  message: string,
  todos: TodoItem[],
  errors: string[],
  autoAdvanced?: TodoItem | null,
): string {
  return JSON.stringify({
    success: true,
    message: autoAdvanced ? `${message}；已自动将下一项待办标记为进行中` : message,
    todos: todos.map((todo) => ({ id: todo.id, text: todo.text, status: todo.status })),
    count: todos.length,
    ...(errors.length > 0 ? { errors } : {}),
    ...autoAdvancedField(autoAdvanced ?? null),
  });
}


function createBatchTodos(
  items: string[],
  taskId: string,
  sessionId: string | undefined,
  onAction: ((action: TodoAction) => void) | undefined,
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

  const promoted = autoAdvanceNextTodo({ taskId, sessionId }, onAction);
  const reported = promoted
    ? createdTodos.map((todo) => (todo.id === promoted.id ? promoted : todo))
    : createdTodos;

  return buildBatchTodoResponse(
    `成功创建 ${createdTodos.length} 个待办事项${errors.length > 0 ? `，${errors.length} 个失败` : ''}`,
    reported,
    errors,
    promoted,
  );
}

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

/**
 * 自动推进：完成/删除/创建待办后，若作用域内没有进行中的待办，
 * 把下一个 pending 提升为 working，并派发 update action 让 UI / 操作流同步。
 */
function autoAdvanceNextTodo(
  scope: AdvanceScope | undefined,
  onAction: ((action: UpdateTodoAction) => void) | undefined,
): TodoItem | null {
  if (!scope || (!scope.taskId && !scope.sessionId)) return null;
  const promoted = TodoListService.ensureWorkingTodo(scope.taskId ?? '', scope.sessionId);
  if (promoted) {
    dispatchTodoUpdated({ ...promoted, status: 'pending' }, promoted, onAction);
  }
  return promoted;
}

/**
 * 单 todo 状态翻转工具（mark_todo_done / mark_todo_working / 等）共用的执行体：
 * 校验 id → 取前置快照 → 调 mutate → 派发 update action → 返回统一 JSON 响应。
 */
function runTodoStatusTransition(
  args: { id?: string; ids?: string[] },
  mutate: (id: string) => TodoItem,
  successMessage: string,
  onAction: ((action: UpdateTodoAction) => void) | undefined,
  advanceScope?: AdvanceScope,
): string {
  const targetIds = args.ids?.length ? args.ids : args.id ? [args.id] : [];
  if (targetIds.length === 0) {
    throw new Error('必须提供 id 或 ids 参数之一');
  }

  const updatedTodos: TodoItem[] = [];
  const errors: string[] = [];

  for (const todoId of targetIds) {
    if (!todoId) {
      errors.push('待办事项 ID 不能为空');
      continue;
    }
    try {
      const previousTodo = TodoListService.getTodoById(todoId);
      const updatedTodo = mutate(todoId);
      dispatchTodoUpdated(previousTodo, updatedTodo, onAction);
      updatedTodos.push(updatedTodo);
    } catch (error) {
      errors.push(`${todoId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (updatedTodos.length === 0) {
    throw new Error(`${successMessage}失败：${errors.join('; ')}`);
  }

  const promoted = autoAdvanceNextTodo(advanceScope, onAction);

  return buildBatchTodoResponse(
    `${successMessage}（${updatedTodos.length} 项）${errors.length > 0 ? `，${errors.length} 项失败` : ''}`,
    updatedTodos,
    errors,
    promoted,
  );
}

/**
 * 生成 mark_todo_done / mark_todo_working 的 handler：
 * 两者只差一个 mutate 与提示文案，其余参数解析逻辑完全一致。
 * autoAdvance 仅对 mark_todo_done 开启：完成后自动把下一项 pending 标记为 working。
 */
function createTodoStatusHandler(
  mutate: (id: string) => TodoItem,
  successMessage: string,
  autoAdvance = false,
) {
  return (
    args: Record<string, unknown>,
    ctx: {
      onAction?: (action: UpdateTodoAction) => void;
      taskId?: string;
      sessionId?: string;
    },
  ) => {
    const { id, ids } = args as { id?: string; ids?: string[] };
    return runTodoStatusTransition(
      { ...(id ? { id } : {}), ...(ids ? { ids } : {}) },
      mutate,
      successMessage,
      ctx.onAction,
      autoAdvance ? { taskId: ctx.taskId, sessionId: ctx.sessionId } : undefined,
    );
  };
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
  advanceScope?: AdvanceScope,
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
  const promoted = autoAdvanceNextTodo(advanceScope, onAction);
  const reported = promoted
    ? updatedTodos.map((todo) => (todo.id === promoted.id ? promoted : todo))
    : updatedTodos;
  return buildBatchTodoResponse(
    `成功更新 ${updatedTodos.length} 个待办事项${errors.length > 0 ? `，${errors.length} 个失败` : ''}`,
    reported,
    errors,
    promoted,
  );
}

function updateOneTodo(
  id: string,
  text: string | undefined,
  status: TodoStatus | undefined,
  onAction: ((action: UpdateTodoAction) => void) | undefined,
  advanceScope?: AdvanceScope,
): string {
  const updates: { text?: string; status?: TodoStatus } = {};
  if (text !== undefined) updates.text = text;
  if (status !== undefined) updates.status = status;
  const previousTodo = TodoListService.getTodoById(id);
  const updatedTodo = TodoListService.updateTodo(id, updates);
  dispatchTodoUpdated(previousTodo, updatedTodo, onAction);
  const promoted = autoAdvanceNextTodo(advanceScope, onAction);
  const reported = promoted && promoted.id === updatedTodo.id ? promoted : updatedTodo;
  return JSON.stringify({
    success: true,
    message: promoted ? '待办事项更新成功；已自动将下一项待办标记为进行中' : '待办事项更新成功',
    todo: { id: reported.id, text: reported.text, status: reported.status },
    ...autoAdvancedField(promoted),
  });
}

function createSingleTodo(
  text: string,
  taskId: string,
  sessionId: string | undefined,
  onAction: ((action: TodoAction) => void) | undefined,
): string {
  if (!text || !text.trim()) {
    throw new Error('待办事项内容不能为空');
  }
  const todo = TodoListService.createTodo(text, taskId, sessionId);
  dispatchTodoCreated(todo, onAction);
  const promoted = autoAdvanceNextTodo({ taskId, sessionId }, onAction);
  const reported = promoted && promoted.id === todo.id ? promoted : todo;
  return JSON.stringify({
    success: true,
    message: promoted ? '待办事项创建成功；已自动将下一项待办标记为进行中' : '待办事项创建成功',
    todo: { id: reported.id, text: reported.text, status: reported.status },
    ...autoAdvancedField(promoted),
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
    handler: (args, { onAction, taskId, sessionId }) => {
      const { id, text, status, items } = args as {
        id?: string;
        text?: string;
        status?: TodoStatus;
        items?: Array<{ id: string; text?: string; status?: TodoStatus }>;
      };
      const advanceScope: AdvanceScope = { taskId, sessionId };
      if (items && Array.isArray(items) && items.length > 0) {
        return updateBatchTodos(items, onAction as never, advanceScope);
      }
      if (id) {
        return updateOneTodo(id, text, status, onAction as never, advanceScope);
      }
      throw new Error('必须提供 id 或 items 参数之一');
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'mark_todo_done',
        description:
          '将待办事项标记为完成。无需先标记进行中。完成多项时用 ids 一次性批量标记，避免逐条调用。标记完成后，系统会自动把下一项待办标记为进行中。',
        parameters: TODO_STATUS_PARAMETERS,
      },
    },
    handler: createTodoStatusHandler(
      (todoId) => TodoListService.markTodoAsDone(todoId),
      '待办事项已标记为完成',
      true,
    ),
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'mark_todo_working',
        description:
          '将待办事项标记为进行中。通常无需调用：完成/创建待办后系统会自动把下一项标记为进行中；仅在需要手动切换当前进行项时使用。',
        parameters: TODO_STATUS_PARAMETERS,
      },
    },
    handler: createTodoStatusHandler(
      (todoId) => TodoListService.markTodoAsWorking(todoId),
      '待办事项已标记为进行中',
    ),
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
    handler: (args, { onAction, taskId, sessionId }) => {
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

      const promoted = autoAdvanceNextTodo({ taskId, sessionId }, onAction as never);

      return JSON.stringify({
        success: true,
        message: promoted ? '待办事项删除成功；已自动将下一项待办标记为进行中' : '待办事项删除成功',
        todo: {
          id: todo.id,
          text: todo.text,
        },
        ...autoAdvancedField(promoted),
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
