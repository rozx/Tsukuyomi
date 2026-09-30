import { toolDefinition } from './tool-localization';
import { AGENT_LOCALE, translateText } from 'src/i18n/translate';
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
  feedbackLocale: AppLocale,
): string {
  return JSON.stringify({
    success: true,
    message: autoAdvanced
      ? translateText(feedbackLocale, 'aiTodoFeedback.advanced', { message })
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
  todoLocale: AppLocale,
): string {
  const feedbackLocale = AGENT_LOCALE;
  const createdTodos: TodoItem[] = [];
  const errors: string[] = [];

  for (const itemText of items) {
    if (!itemText || !itemText.trim()) {
      errors.push(translateText(feedbackLocale, 'aiTodoFeedback.contentRequired'));
      continue;
    }
    try {
      const todo = TodoListService.createTodo(itemText.trim(), taskId, sessionId, {
        uiLocale: todoLocale,
      });
      createdTodos.push(todo);
      dispatchTodoCreated(todo, onAction);
    } catch (error) {
      errors.push(
        translateText(feedbackLocale, 'aiTodoFeedback.createItemFailed', {
          text: itemText.slice(0, 20),
          detail: localizedErrorMessage(error, feedbackLocale, 'aiTodoFeedback.unknownError'),
        }),
      );
    }
  }

  if (createdTodos.length === 0) {
    throw new LocalizedError(
      'TODO_BATCH_CREATE_FAILED',
      'aiTodoFeedback.batchCreateFailed',
      { details: errors.join('; ') },
      feedbackLocale,
    );
  }

  const promoted = autoAdvanceNextTodo({ taskId, sessionId }, onAction);
  const reported = promoted
    ? createdTodos.map((todo) => (todo.id === promoted.id ? promoted : todo))
    : createdTodos;

  return buildBatchTodoResponse(
    translateText(feedbackLocale, 'aiTodoFeedback.batchCreated', {
      count: createdTodos.length,
      failed: errors.length
        ? translateText(feedbackLocale, 'aiTodoFeedback.failedCount', { count: errors.length })
        : '',
    }),
    reported,
    errors,
    promoted,
    feedbackLocale,
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
  feedbackLocale: AppLocale,
): string {
  const targetIds = args.ids?.length ? args.ids : args.id ? [args.id] : [];
  if (targetIds.length === 0) {
    throw new LocalizedError(
      'TODO_ARGUMENTS_REQUIRED',
      'aiTodoFeedback.idOrIds',
      {},
      feedbackLocale,
    );
  }

  const updatedTodos: TodoItem[] = [];
  const errors: string[] = [];

  for (const todoId of targetIds) {
    if (!todoId) {
      errors.push(translateText(feedbackLocale, 'aiTodoFeedback.idRequired'));
      continue;
    }
    try {
      const previousTodo = TodoListService.getTodoById(todoId);
      const updatedTodo = mutate(todoId);
      dispatchTodoUpdated(previousTodo, updatedTodo, onAction);
      updatedTodos.push(updatedTodo);
    } catch (error) {
      errors.push(
        `${todoId}: ${localizedErrorMessage(error, feedbackLocale, 'aiTodoFeedback.unknownError')}`,
      );
    }
  }

  if (updatedTodos.length === 0) {
    throw new LocalizedError(
      'TODO_TRANSITION_FAILED',
      'aiTodoFeedback.transitionFailed',
      { message: successMessage, details: errors.join('; ') },
      feedbackLocale,
    );
  }

  const promoted = autoAdvanceNextTodo(advanceScope, onAction);

  return buildBatchTodoResponse(
    translateText(feedbackLocale, 'aiTodoFeedback.statusCount', {
      message: successMessage,
      count: updatedTodos.length,
      failed: errors.length
        ? translateText(feedbackLocale, 'aiTodoFeedback.failedCount', { count: errors.length })
        : '',
    }),
    updatedTodos,
    errors,
    promoted,
    feedbackLocale,
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
    const feedbackLocale = AGENT_LOCALE;
    const { id, ids } = args as { id?: string; ids?: string[] };
    return runTodoStatusTransition(
      { ...(id ? { id } : {}), ...(ids ? { ids } : {}) },
      mutate,
      translateText(feedbackLocale, successMessage),
      ctx.onAction,
      autoAdvance ? { taskId: ctx.taskId, sessionId: ctx.sessionId } : undefined,
      feedbackLocale,
    );
  };
}

function updateSingleTodoItem(
  item: { id: string; text?: string; status?: TodoStatus },
  onAction: ((action: UpdateTodoAction) => void) | undefined,
  errors: string[],
  feedbackLocale: AppLocale,
): TodoItem | null {
  if (!item.id) {
    errors.push(translateText(feedbackLocale, 'aiTodoFeedback.idRequired'));
    return null;
  }
  if (item.status !== undefined && !VALID_TODO_STATUSES.includes(item.status)) {
    errors.push(
      translateText(feedbackLocale, 'aiTodoFeedback.itemInvalidStatus', {
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
      translateText(feedbackLocale, 'aiTodoFeedback.updateItemFailed', {
        id: item.id,
        detail: localizedErrorMessage(error, feedbackLocale, 'aiTodoFeedback.unknownError'),
      }),
    );
    return null;
  }
}

function updateBatchTodos(
  items: Array<{ id: string; text?: string; status?: TodoStatus }>,
  onAction: ((action: UpdateTodoAction) => void) | undefined,
  advanceScope: AdvanceScope | undefined,
  feedbackLocale: AppLocale,
): string {
  const updatedTodos: TodoItem[] = [];
  const errors: string[] = [];
  for (const item of items) {
    const updated = updateSingleTodoItem(item, onAction, errors, feedbackLocale);
    if (updated) updatedTodos.push(updated);
  }
  if (updatedTodos.length === 0) {
    throw new LocalizedError(
      'TODO_BATCH_UPDATE_FAILED',
      'aiTodoFeedback.batchUpdateFailed',
      { details: errors.join('; ') },
      feedbackLocale,
    );
  }
  const promoted = autoAdvanceNextTodo(advanceScope, onAction);
  const reported = promoted
    ? updatedTodos.map((todo) => (todo.id === promoted.id ? promoted : todo))
    : updatedTodos;
  return buildBatchTodoResponse(
    translateText(feedbackLocale, 'aiTodoFeedback.batchUpdated', {
      count: updatedTodos.length,
      failed: errors.length
        ? translateText(feedbackLocale, 'aiTodoFeedback.failedCount', { count: errors.length })
        : '',
    }),
    reported,
    errors,
    promoted,
    feedbackLocale,
  );
}

function updateOneTodo(
  id: string,
  text: string | undefined,
  status: TodoStatus | undefined,
  onAction: ((action: UpdateTodoAction) => void) | undefined,
  advanceScope: AdvanceScope | undefined,
  feedbackLocale: AppLocale,
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
      ? translateText(feedbackLocale, 'aiTodoFeedback.advanced', {
          message: translateText(feedbackLocale, 'aiTodoFeedback.updated'),
        })
      : translateText(feedbackLocale, 'aiTodoFeedback.updated'),
    todo: { id: reported.id, text: reported.text, status: reported.status },
    ...autoAdvancedField(promoted),
  });
}

function createSingleTodo(
  text: string,
  taskId: string,
  sessionId: string | undefined,
  onAction: ((action: TodoAction) => void) | undefined,
  todoLocale: AppLocale,
): string {
  const feedbackLocale = AGENT_LOCALE;
  if (!text || !text.trim()) {
    throw new LocalizedError(
      'TODO_CONTENT_REQUIRED',
      'aiTodoFeedback.contentRequired',
      {},
      feedbackLocale,
    );
  }
  const todo = TodoListService.createTodo(text, taskId, sessionId, { uiLocale: todoLocale });
  dispatchTodoCreated(todo, onAction);
  const promoted = autoAdvanceNextTodo({ taskId, sessionId }, onAction);
  const reported = promoted && promoted.id === todo.id ? promoted : todo;
  return JSON.stringify({
    success: true,
    message: promoted
      ? translateText(feedbackLocale, 'aiTodoFeedback.advanced', {
          message: translateText(feedbackLocale, 'aiTodoFeedback.created'),
        })
      : translateText(feedbackLocale, 'aiTodoFeedback.created'),
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
      const feedbackLocale = AGENT_LOCALE;
      const { text, items } = args as {
        text?: string;
        items?: string[];
      };
      if (!taskId) {
        throw new LocalizedError(
          'TODO_CONTEXT_REQUIRED',
          'aiTodoFeedback.contextRequired',
          {},
          feedbackLocale,
        );
      }

      // 待办记录界面语言；返回给模型的说明固定简中
      const todoLocale = languages?.uiLocale ?? 'zh-CN';
      if (items && Array.isArray(items) && items.length > 0) {
        return createBatchTodos(items, taskId, sessionId, onAction as never, todoLocale);
      }
      if (text !== undefined && text !== null) {
        return createSingleTodo(text, taskId, sessionId, onAction as never, todoLocale);
      }
      throw new LocalizedError(
        'TODO_ARGUMENTS_REQUIRED',
        'aiTodoFeedback.textOrItems',
        {},
        feedbackLocale,
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
      const feedbackLocale = AGENT_LOCALE;
      const { id, text, status, items } = args as {
        id?: string;
        text?: string;
        status?: TodoStatus;
        items?: Array<{ id: string; text?: string; status?: TodoStatus }>;
      };
      const advanceScope: AdvanceScope = { taskId, sessionId };
      if (items && Array.isArray(items) && items.length > 0) {
        return updateBatchTodos(items, onAction as never, advanceScope, feedbackLocale);
      }
      if (id) {
        return updateOneTodo(id, text, status, onAction as never, advanceScope, feedbackLocale);
      }
      throw new LocalizedError(
        'TODO_ARGUMENTS_REQUIRED',
        'aiTodoFeedback.idOrItems',
        {},
        feedbackLocale,
      );
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
      const feedbackLocale = AGENT_LOCALE;
      const { id } = args as {
        id: string;
      };
      if (!id) {
        throw new LocalizedError(
          'TODO_ID_REQUIRED',
          'aiTodoFeedback.idRequired',
          {},
          feedbackLocale,
        );
      }

      const todo = TodoListService.getTodoById(id);
      if (!todo) {
        throw new LocalizedError(
          'TODO_NOT_FOUND',
          'aiTodoFeedback.missing',
          { id },
          feedbackLocale,
        );
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
          ? translateText(feedbackLocale, 'aiTodoFeedback.advanced', {
              message: translateText(feedbackLocale, 'aiTodoFeedback.deleted'),
            })
          : translateText(feedbackLocale, 'aiTodoFeedback.deleted'),
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
      const feedbackLocale = AGENT_LOCALE;
      const { filter = 'all' } = args as {
        filter?: 'all' | 'active' | 'completed';
      };

      if (!taskId) {
        throw new LocalizedError(
          'TODO_CONTEXT_REQUIRED',
          'aiTodoFeedback.listContextRequired',
          {},
          feedbackLocale,
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
