import { toolDefinition } from './tool-localization';
import { translateText } from 'src/i18n/translate';
import type { MessageKey } from 'src/i18n/types';
import type { ExecutionLanguages } from 'src/models/locale';
import { LocalizedError, localizedErrorMessage } from 'src/utils/localized-error';
import { describeTool } from './tool-localization';
import type { AppLocale } from 'src/models/locale';
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
      description: describeTool('update_todos.parameters.properties.items.items.properties.id'),
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
      description: describeTool('mark_todo_done.parameters.properties.id'),
    },
    ids: {
      type: 'array' as const,
      items: { type: 'string' },
      description: describeTool('mark_todo_done.parameters.properties.ids'),
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
  autoAdvanced: TodoItem | null | undefined,
  uiLocale: AppLocale,
): string {
  return JSON.stringify({
    success: true,
    message: autoAdvanced
      ? translateText(uiLocale, 'aiTodoFeedback.advanced', { message })
      : message,
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
  uiLocale: AppLocale = 'zh-CN',
): string {
  const createdTodos: TodoItem[] = [];
  const errors: string[] = [];

  for (const itemText of items) {
    if (!itemText || !itemText.trim()) {
      errors.push(translateText(uiLocale, 'aiTodoFeedback.contentRequired'));
      continue;
    }
    try {
      const todo = TodoListService.createTodo(itemText.trim(), taskId, sessionId, { uiLocale });
      createdTodos.push(todo);
      dispatchTodoCreated(todo, onAction);
    } catch (error) {
      errors.push(
        translateText(uiLocale, 'aiTodoFeedback.createItemFailed', {
          text: itemText.slice(0, 20),
          detail: localizedErrorMessage(error, uiLocale, 'aiTodoFeedback.unknownError'),
        }),
      );
    }
  }

  if (createdTodos.length === 0) {
    throw new LocalizedError(
      'TODO_BATCH_CREATE_FAILED',
      'aiTodoFeedback.batchCreateFailed',
      { details: errors.join('; ') },
      uiLocale,
    );
  }

  const promoted = autoAdvanceNextTodo({ taskId, sessionId }, onAction);
  const reported = promoted
    ? createdTodos.map((todo) => (todo.id === promoted.id ? promoted : todo))
    : createdTodos;

  return buildBatchTodoResponse(
    translateText(uiLocale, 'aiTodoFeedback.batchCreated', {
      count: createdTodos.length,
      failed: errors.length
        ? translateText(uiLocale, 'aiTodoFeedback.failedCount', { count: errors.length })
        : '',
    }),
    reported,
    errors,
    promoted,
    uiLocale,
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
  advanceScope: AdvanceScope | undefined,
  uiLocale: AppLocale,
): string {
  const targetIds = args.ids?.length ? args.ids : args.id ? [args.id] : [];
  if (targetIds.length === 0) {
    throw new LocalizedError('TODO_ARGUMENTS_REQUIRED', 'aiTodoFeedback.idOrIds', {}, uiLocale);
  }

  const updatedTodos: TodoItem[] = [];
  const errors: string[] = [];

  for (const todoId of targetIds) {
    if (!todoId) {
      errors.push(translateText(uiLocale, 'aiTodoFeedback.idRequired'));
      continue;
    }
    try {
      const previousTodo = TodoListService.getTodoById(todoId);
      const updatedTodo = mutate(todoId);
      dispatchTodoUpdated(previousTodo, updatedTodo, onAction);
      updatedTodos.push(updatedTodo);
    } catch (error) {
      errors.push(
        `${todoId}: ${localizedErrorMessage(error, uiLocale, 'aiTodoFeedback.unknownError')}`,
      );
    }
  }

  if (updatedTodos.length === 0) {
    throw new LocalizedError(
      'TODO_TRANSITION_FAILED',
      'aiTodoFeedback.transitionFailed',
      { message: successMessage, details: errors.join('; ') },
      uiLocale,
    );
  }

  const promoted = autoAdvanceNextTodo(advanceScope, onAction);

  return buildBatchTodoResponse(
    translateText(uiLocale, 'aiTodoFeedback.statusCount', {
      message: successMessage,
      count: updatedTodos.length,
      failed: errors.length
        ? translateText(uiLocale, 'aiTodoFeedback.failedCount', { count: errors.length })
        : '',
    }),
    updatedTodos,
    errors,
    promoted,
    uiLocale,
  );
}

/**
 * 生成 mark_todo_done / mark_todo_working 的 handler：
 * 两者只差一个 mutate 与提示文案，其余参数解析逻辑完全一致。
 * autoAdvance 仅对 mark_todo_done 开启：完成后自动把下一项 pending 标记为 working。
 */
function createTodoStatusHandler(
  mutate: (id: string) => TodoItem,
  successMessage: MessageKey,
  autoAdvance = false,
) {
  return (
    args: Record<string, unknown>,
    ctx: {
      onAction?: (action: UpdateTodoAction) => void;
      taskId?: string;
      sessionId?: string;
      languages?: ExecutionLanguages;
    },
  ) => {
    const uiLocale = ctx.languages?.uiLocale ?? 'zh-CN';
    const { id, ids } = args as { id?: string; ids?: string[] };
    return runTodoStatusTransition(
      { ...(id ? { id } : {}), ...(ids ? { ids } : {}) },
      mutate,
      translateText(uiLocale, successMessage),
      ctx.onAction,
      autoAdvance ? { taskId: ctx.taskId, sessionId: ctx.sessionId } : undefined,
      uiLocale,
    );
  };
}

function updateSingleTodoItem(
  item: { id: string; text?: string; status?: TodoStatus },
  onAction: ((action: UpdateTodoAction) => void) | undefined,
  errors: string[],
  uiLocale: AppLocale,
): TodoItem | null {
  if (!item.id) {
    errors.push(translateText(uiLocale, 'aiTodoFeedback.idRequired'));
    return null;
  }
  if (item.status !== undefined && !VALID_TODO_STATUSES.includes(item.status)) {
    errors.push(
      translateText(uiLocale, 'aiTodoFeedback.itemInvalidStatus', {
        id: item.id,
        status: item.status,
        valid: VALID_TODO_STATUSES.join(', '),
      }),
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
      translateText(uiLocale, 'aiTodoFeedback.updateItemFailed', {
        id: item.id,
        detail: localizedErrorMessage(error, uiLocale, 'aiTodoFeedback.unknownError'),
      }),
    );
    return null;
  }
}

function updateBatchTodos(
  items: Array<{ id: string; text?: string; status?: TodoStatus }>,
  onAction: ((action: UpdateTodoAction) => void) | undefined,
  advanceScope: AdvanceScope | undefined,
  uiLocale: AppLocale,
): string {
  const updatedTodos: TodoItem[] = [];
  const errors: string[] = [];
  for (const item of items) {
    const updated = updateSingleTodoItem(item, onAction, errors, uiLocale);
    if (updated) updatedTodos.push(updated);
  }
  if (updatedTodos.length === 0) {
    throw new LocalizedError(
      'TODO_BATCH_UPDATE_FAILED',
      'aiTodoFeedback.batchUpdateFailed',
      { details: errors.join('; ') },
      uiLocale,
    );
  }
  const promoted = autoAdvanceNextTodo(advanceScope, onAction);
  const reported = promoted
    ? updatedTodos.map((todo) => (todo.id === promoted.id ? promoted : todo))
    : updatedTodos;
  return buildBatchTodoResponse(
    translateText(uiLocale, 'aiTodoFeedback.batchUpdated', {
      count: updatedTodos.length,
      failed: errors.length
        ? translateText(uiLocale, 'aiTodoFeedback.failedCount', { count: errors.length })
        : '',
    }),
    reported,
    errors,
    promoted,
    uiLocale,
  );
}

function updateOneTodo(
  id: string,
  text: string | undefined,
  status: TodoStatus | undefined,
  onAction: ((action: UpdateTodoAction) => void) | undefined,
  advanceScope: AdvanceScope | undefined,
  uiLocale: AppLocale,
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
    message: promoted
      ? translateText(uiLocale, 'aiTodoFeedback.advanced', {
          message: translateText(uiLocale, 'aiTodoFeedback.updated'),
        })
      : translateText(uiLocale, 'aiTodoFeedback.updated'),
    todo: { id: reported.id, text: reported.text, status: reported.status },
    ...autoAdvancedField(promoted),
  });
}

function createSingleTodo(
  text: string,
  taskId: string,
  sessionId: string | undefined,
  onAction: ((action: TodoAction) => void) | undefined,
  uiLocale: AppLocale = 'zh-CN',
): string {
  if (!text || !text.trim()) {
    throw new LocalizedError(
      'TODO_CONTENT_REQUIRED',
      'aiTodoFeedback.contentRequired',
      {},
      uiLocale,
    );
  }
  const todo = TodoListService.createTodo(text, taskId, sessionId, { uiLocale });
  dispatchTodoCreated(todo, onAction);
  const promoted = autoAdvanceNextTodo({ taskId, sessionId }, onAction);
  const reported = promoted && promoted.id === todo.id ? promoted : todo;
  return JSON.stringify({
    success: true,
    message: promoted
      ? translateText(uiLocale, 'aiTodoFeedback.advanced', {
          message: translateText(uiLocale, 'aiTodoFeedback.created'),
        })
      : translateText(uiLocale, 'aiTodoFeedback.created'),
    todo: { id: reported.id, text: reported.text, status: reported.status },
    ...autoAdvancedField(promoted),
  });
}

export const todoListTools: ToolDefinition[] = [
  {
    definition: toolDefinition('create_todo', {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: describeTool('create_todo.parameters.properties.text'),
        },
        items: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: describeTool('create_todo.parameters.properties.items'),
        },
      },
    }),
    handler: (args, { onAction, taskId, sessionId, languages }) => {
      const uiLocale = languages?.uiLocale ?? 'zh-CN';
      const { text, items } = args as {
        text?: string;
        items?: string[];
      };
      if (!taskId) {
        throw new LocalizedError(
          'TODO_CONTEXT_REQUIRED',
          'aiTodoFeedback.contextRequired',
          {},
          uiLocale,
        );
      }

      if (items && Array.isArray(items) && items.length > 0) {
        return createBatchTodos(items, taskId, sessionId, onAction as never, languages?.uiLocale);
      }
      if (text !== undefined && text !== null) {
        return createSingleTodo(text, taskId, sessionId, onAction as never, languages?.uiLocale);
      }
      throw new LocalizedError(
        'TODO_ARGUMENTS_REQUIRED',
        'aiTodoFeedback.textOrItems',
        {},
        uiLocale,
      );
    },
  },
  {
    definition: toolDefinition('update_todos', {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: describeTool('update_todos.parameters.properties.id'),
        },
        text: {
          type: 'string',
          description: describeTool('update_todos.parameters.properties.text'),
        },
        status: {
          type: 'string',
          enum: ['pending', 'working', 'done'],
          description: describeTool('update_todos.parameters.properties.status'),
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: describeTool(
                  'update_todos.parameters.properties.items.items.properties.id',
                ),
              },
              text: {
                type: 'string',
                description: describeTool(
                  'update_todos.parameters.properties.items.items.properties.text',
                ),
              },
              status: {
                type: 'string',
                enum: ['pending', 'working', 'done'],
                description: describeTool(
                  'update_todos.parameters.properties.items.items.properties.status',
                ),
              },
            },
            required: ['id'],
          },
          description: describeTool('update_todos.parameters.properties.items'),
        },
      },
    }),
    handler: (args, { onAction, taskId, sessionId, languages }) => {
      const uiLocale = languages?.uiLocale ?? 'zh-CN';
      const { id, text, status, items } = args as {
        id?: string;
        text?: string;
        status?: TodoStatus;
        items?: Array<{ id: string; text?: string; status?: TodoStatus }>;
      };
      const advanceScope: AdvanceScope = { taskId, sessionId };
      if (items && Array.isArray(items) && items.length > 0) {
        return updateBatchTodos(items, onAction as never, advanceScope, uiLocale);
      }
      if (id) {
        return updateOneTodo(id, text, status, onAction as never, advanceScope, uiLocale);
      }
      throw new LocalizedError('TODO_ARGUMENTS_REQUIRED', 'aiTodoFeedback.idOrItems', {}, uiLocale);
    },
  },
  {
    definition: toolDefinition('mark_todo_done', TODO_STATUS_PARAMETERS),
    handler: createTodoStatusHandler(
      (todoId) => TodoListService.markTodoAsDone(todoId),
      'aiTodoFeedback.done',
      true,
    ),
  },
  {
    definition: toolDefinition('mark_todo_working', TODO_STATUS_PARAMETERS),
    handler: createTodoStatusHandler(
      (todoId) => TodoListService.markTodoAsWorking(todoId),
      'aiTodoFeedback.working',
    ),
  },
  {
    definition: toolDefinition('delete_todo', TODO_BY_ID_PARAMETERS),
    handler: (args, { onAction, taskId, sessionId, languages }) => {
      const uiLocale = languages?.uiLocale ?? 'zh-CN';
      const { id } = args as {
        id: string;
      };
      if (!id) {
        throw new LocalizedError('TODO_ID_REQUIRED', 'aiTodoFeedback.idRequired', {}, uiLocale);
      }

      const todo = TodoListService.getTodoById(id);
      if (!todo) {
        throw new LocalizedError('TODO_NOT_FOUND', 'aiTodoFeedback.missing', { id }, uiLocale);
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
        message: promoted
          ? translateText(uiLocale, 'aiTodoFeedback.advanced', {
              message: translateText(uiLocale, 'aiTodoFeedback.deleted'),
            })
          : translateText(uiLocale, 'aiTodoFeedback.deleted'),
        todo: {
          id: todo.id,
          text: todo.text,
        },
        ...autoAdvancedField(promoted),
      });
    },
  },
  {
    definition: toolDefinition('list_todos', {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          enum: ['all', 'active', 'completed'],
          description: describeTool('list_todos.parameters.properties.filter'),
        },
      },
    }),
    handler: (args, { taskId, sessionId, languages }) => {
      const uiLocale = languages?.uiLocale ?? 'zh-CN';
      const { filter = 'all' } = args as {
        filter?: 'all' | 'active' | 'completed';
      };

      if (!taskId) {
        throw new LocalizedError(
          'TODO_CONTEXT_REQUIRED',
          'aiTodoFeedback.listContextRequired',
          {},
          uiLocale,
        );
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
