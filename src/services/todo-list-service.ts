/**
 * 待办事项服务
 * 负责管理待办事项（使用 localStorage 存储）
 */

import { v4 as uuidv4 } from 'uuid';
import type { TaskStatus } from 'src/services/ai/tasks/utils/task-types';

export type TodoStatus = 'pending' | 'working' | 'done';

export interface TodoItem {
  id: string;
  text: string;
  status: TodoStatus;
  createdAt: number;
  updatedAt: number;
  taskId: string; // 关联的 AI 任务 ID（必需，用于翻译、润色、校对等任务）
  sessionId?: string; // 关联的聊天会话 ID（可选，用于助手聊天会话）
  predefined?: boolean; // 是否为系统预定义的待办事项（用于 gate 检查）
  taskState?: TaskStatus; // 该待办所属的任务阶段
  chunkIndex?: number; // 该待办所属的 chunk 索引
}

const STORAGE_KEY = 'tsukuyomi-todo-list';

/** 内存缓存，避免每次操作都解析 localStorage */
let cachedTodos: TodoItem[] | null = null;

/**
 * 从 localStorage 加载所有待办事项（带内存缓存）
 */
function loadTodosFromStorage(): TodoItem[] {
  if (cachedTodos) return cachedTodos;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const todos = JSON.parse(stored) as Array<Record<string, unknown>>;
      cachedTodos = todos.map((todo) => {
        if ('completed' in todo && !('status' in todo)) {
          const { completed, ...rest } = todo;
          return {
            ...rest,
            status: completed ? 'done' : 'pending',
          } as TodoItem;
        }
        return todo as unknown as TodoItem;
      });
      return cachedTodos;
    }
  } catch (error) {
    console.error('[TodoListService] 加载待办事项失败:', error);
  }
  cachedTodos = [];
  return cachedTodos;
}

/**
 * 保存所有待办事项到 localStorage（同时更新内存缓存）
 */
function saveTodosToStorage(todos: TodoItem[]): void {
  try {
    cachedTodos = todos;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('tsukuyomi-todos-updated'));
    }
  } catch (error) {
    cachedTodos = null;
    console.error('[TodoListService] 保存待办事项失败:', error);
    throw new Error('保存待办事项失败');
  }
}

/**
 * 待办事项服务
 */
export class TodoListService {
  /**
   * 获取所有待办事项
   */
  static getAllTodos(): TodoItem[] {
    return loadTodosFromStorage();
  }

  /**
   * 获取未完成的待办事项
   */
  static getActiveTodos(): TodoItem[] {
    return this.getAllTodos().filter((todo) => todo.status !== 'done');
  }

  /**
   * 获取已完成的待办事项
   */
  static getCompletedTodos(): TodoItem[] {
    return this.getAllTodos().filter((todo) => todo.status === 'done');
  }

  /**
   * 根据 ID 获取待办事项
   */
  static getTodoById(id: string): TodoItem | undefined {
    return this.getAllTodos().find((todo) => todo.id === id);
  }

  /**
   * 创建待办事项
   * @param text 待办事项内容
   * @param taskId 关联的 AI 任务 ID（必需）
   * @param sessionId 关联的聊天会话 ID（可选，用于助手聊天会话）
   */
  static createTodo(
    text: string,
    taskId: string,
    sessionId?: string,
    options?: { predefined?: boolean; taskState?: TaskStatus; chunkIndex?: number },
  ): TodoItem {
    const trimmedText = text.trim();
    const trimmedTaskId = taskId.trim();
    const trimmedSessionId = sessionId?.trim();

    if (!trimmedText) {
      throw new Error('待办事项内容不能为空');
    }
    if (!trimmedTaskId) {
      throw new Error('任务 ID 不能为空');
    }

    const todos = this.getAllTodos();
    const now = Date.now();
    const newTodo: TodoItem = {
      id: uuidv4(),
      text: trimmedText,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      taskId: trimmedTaskId,
      ...(trimmedSessionId ? { sessionId: trimmedSessionId } : {}),
      ...(options?.predefined ? { predefined: true } : {}),
      ...(options?.taskState ? { taskState: options.taskState } : {}),
      ...(options?.chunkIndex !== undefined ? { chunkIndex: options.chunkIndex } : {}),
    };

    todos.push(newTodo);
    saveTodosToStorage(todos);

    console.log(
      `[TodoListService] 创建待办事项: ${newTodo.id} (任务: ${trimmedTaskId}${trimmedSessionId ? `, 会话: ${trimmedSessionId}` : ''})`,
    );
    return newTodo;
  }

  /**
   * 更新待办事项
   */
  static updateTodo(id: string, updates: { text?: string; status?: TodoStatus }): TodoItem {
    const todos = this.getAllTodos();
    const todoIndex = todos.findIndex((todo) => todo.id === id);

    if (todoIndex === -1) {
      throw new Error(`待办事项不存在: ${id}`);
    }

    const todo = todos[todoIndex];
    if (!todo) {
      throw new Error(`待办事项不存在: ${id}`);
    }

    const VALID_STATUSES: TodoStatus[] = ['pending', 'working', 'done'];
    if (updates.status !== undefined && !VALID_STATUSES.includes(updates.status)) {
      throw new Error(
        `无效的待办事项状态: "${updates.status}"，有效值为: ${VALID_STATUSES.join(', ')}`,
      );
    }

    const updatedTodo: TodoItem = {
      id: todo.id,
      text: updates.text !== undefined ? updates.text.trim() : todo.text,
      status: updates.status !== undefined ? updates.status : todo.status,
      createdAt: todo.createdAt,
      updatedAt: Date.now(),
      taskId: todo.taskId,
      ...(todo.sessionId ? { sessionId: todo.sessionId } : {}),
      ...(todo.predefined ? { predefined: true } : {}),
      ...(todo.taskState ? { taskState: todo.taskState } : {}),
      ...(todo.chunkIndex !== undefined ? { chunkIndex: todo.chunkIndex } : {}),
    };

    if (!updatedTodo.text || !updatedTodo.text.trim()) {
      throw new Error('待办事项内容不能为空');
    }

    todos[todoIndex] = updatedTodo;
    saveTodosToStorage(todos);

    console.log(`[TodoListService] 更新待办事项: ${id}`);
    return updatedTodo;
  }

  /**
   * 标记待办事项为完成
   */
  static markTodoAsDone(id: string): TodoItem {
    return this.updateTodo(id, { status: 'done' });
  }

  /**
   * 标记待办事项为进行中
   */
  static markTodoAsWorking(id: string): TodoItem {
    const todo = this.getTodoById(id);
    if (todo && todo.status === 'done') {
      throw new Error('该待办已完成，无法重新标记为进行中');
    }
    return this.updateTodo(id, { status: 'working' });
  }

  /**
   * 删除待办事项
   */
  static deleteTodo(id: string): void {
    const todos = this.getAllTodos();
    const todoIndex = todos.findIndex((todo) => todo.id === id);

    if (todoIndex === -1) {
      throw new Error(`待办事项不存在: ${id}`);
    }

    todos.splice(todoIndex, 1);
    saveTodosToStorage(todos);

    console.log(`[TodoListService] 删除待办事项: ${id}`);
  }

  /**
   * 清空所有待办事项
   */
  static clearAllTodos(): void {
    saveTodosToStorage([]);
    console.log('[TodoListService] 清空所有待办事项');
  }

  /**
   * 根据任务 ID 获取待办事项
   * @param taskId 任务 ID
   */
  static getTodosByTaskId(taskId: string): TodoItem[] {
    return this.getAllTodos().filter((todo) => todo.taskId === taskId);
  }

  /**
   * 根据会话 ID 获取待办事项
   * @param sessionId 会话 ID
   */
  static getTodosBySessionId(sessionId: string): TodoItem[] {
    return this.getAllTodos().filter((todo) => todo.sessionId === sessionId);
  }

  /**
   * 根据任务 ID 删除所有关联的待办事项
   * @param taskId 任务 ID
   * @returns 删除的待办事项数量
   */
  static deleteTodosByTaskId(taskId: string): number {
    const todos = this.getAllTodos();
    const initialCount = todos.length;
    const filteredTodos = todos.filter((todo) => todo.taskId !== taskId);
    const deletedCount = initialCount - filteredTodos.length;

    if (deletedCount > 0) {
      saveTodosToStorage(filteredTodos);
      console.log(`[TodoListService] 删除任务 ${taskId} 的 ${deletedCount} 个待办事项`);
    }

    return deletedCount;
  }
}
