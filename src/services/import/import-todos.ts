import type { ImportTask, ImportTodo } from 'src/models/import';

/**
 * 导入任务的待办：工具名与参数沿用普通助手（create_todo / update_todos / mark_todo_done /
 * mark_todo_working / delete_todo / list_todos），数据只保存在当前导入任务中。
 */
export const IMPORT_TODO_TOOLS = [
  'create_todo',
  'update_todos',
  'mark_todo_done',
  'mark_todo_working',
  'delete_todo',
  'list_todos',
] as const;

type TodoUpdate = { id: string; text?: string; status?: ImportTodo['status'] };

function view(todo: ImportTodo) {
  return { id: todo.id, text: todo.text, status: todo.status };
}

function find(task: ImportTask, id: string): ImportTodo {
  const todo = task.todos.find((entry) => entry.id === id);
  if (!todo) throw new Error(`TODO_NOT_FOUND: 待办事项不存在: ${id}`);
  return todo;
}

function text(value: unknown): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) throw new Error('INVALID_ARGUMENTS: 待办内容不能为空');
  return trimmed;
}

/** 与普通助手一致：没有进行中的项时，把第一项未完成待办标记为进行中。 */
function advance(task: ImportTask): ImportTodo | undefined {
  if (task.todos.some((todo) => todo.status === 'working')) return undefined;
  const next = task.todos.find((todo) => todo.status === 'pending');
  if (next) {
    next.status = 'working';
    next.updatedAt = Date.now();
  }
  return next;
}

function update(task: ImportTask, change: TodoUpdate): ImportTodo {
  const todo = find(task, change.id);
  if (change.text !== undefined) todo.text = text(change.text);
  if (change.status) todo.status = change.status;
  todo.updatedAt = Date.now();
  return todo;
}

function ids(args: Record<string, unknown>): string[] {
  const list = Array.isArray(args.ids) ? (args.ids as string[]) : [];
  if (typeof args.id === 'string') list.push(args.id);
  if (!list.length) throw new Error('INVALID_ARGUMENTS: 必须提供 id 或 ids');
  return list;
}

function create(task: ImportTask, args: Record<string, unknown>) {
  const texts = Array.isArray(args.items) && args.items.length ? args.items : [args.text];
  const now = Date.now();
  const created = texts.map((value) => ({
    id: crypto.randomUUID().slice(0, 8),
    text: text(value),
    status: 'pending' as const,
    createdAt: now,
    updatedAt: now,
  }));
  task.todos.push(...created);
  advance(task);
  return { success: true, todos: created.map(view) };
}

function setStatus(task: ImportTask, args: Record<string, unknown>, status: ImportTodo['status']) {
  const targets = ids(args).map((id) => find(task, id));
  for (const todo of targets) update(task, { id: todo.id, status });
  const promoted = status === 'done' ? advance(task) : undefined;
  return {
    success: true,
    todos: targets.map(view),
    ...(promoted ? { autoAdvanced: view(promoted) } : {}),
  };
}

function list(task: ImportTask, filter: unknown) {
  const todos = task.todos.filter((todo) =>
    filter === 'active'
      ? todo.status !== 'done'
      : filter === 'completed'
        ? todo.status === 'done'
        : true,
  );
  return { success: true, todos: todos.map(view), count: todos.length };
}

/** 在导入任务的写事务内执行一项待办工具，返回工具结果。 */
export function applyImportTodoTool(
  task: ImportTask,
  name: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  switch (name) {
    case 'create_todo':
      return create(task, args);
    case 'update_todos': {
      if (!Array.isArray(args.items) && typeof args.id !== 'string')
        throw new Error('INVALID_ARGUMENTS: 必须提供 id 或 items');
      const changes = Array.isArray(args.items)
        ? (args.items as TodoUpdate[])
        : [args as unknown as TodoUpdate];
      const todos = changes.map((change) => view(update(task, change)));
      advance(task);
      return { success: true, todos };
    }
    case 'mark_todo_done':
      return setStatus(task, args, 'done');
    case 'mark_todo_working':
      return setStatus(task, args, 'working');
    case 'delete_todo': {
      const todo = find(task, text(args.id));
      task.todos = task.todos.filter((entry) => entry !== todo);
      advance(task);
      return { success: true, todo: view(todo) };
    }
    default:
      return list(task, args.filter);
  }
}
