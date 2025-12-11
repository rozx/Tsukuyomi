/**
 * 待办事项服务
 * 负责管理待办事项（使用 localStorage 存储）
 */

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
  taskId: string; // 关联的 AI 任务 ID（必需）
}

const STORAGE_KEY = 'luna-ai-todo-list';

/**
 * 从 localStorage 加载所有待办事项
 */
function loadTodosFromStorage(): TodoItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('[TodoListService] 加载待办事项失败:', error);
  }
  return [];
}

/**
 * 保存所有待办事项到 localStorage
 */
function saveTodosToStorage(todos: TodoItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch (error) {
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
    return this.getAllTodos().filter((todo) => !todo.completed);
  }

  /**
   * 获取已完成的待办事项
   */
  static getCompletedTodos(): TodoItem[] {
    return this.getAllTodos().filter((todo) => todo.completed);
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
   */
  static createTodo(text: string, taskId: string): TodoItem {
    if (!text || !text.trim()) {
      throw new Error('待办事项内容不能为空');
    }
    if (!taskId || !taskId.trim()) {
      throw new Error('任务 ID 不能为空');
    }

    const todos = this.getAllTodos();
    const now = Date.now();
    const newTodo: TodoItem = {
      id: `todo-${now}-${Math.random().toString(36).substr(2, 9)}`,
      text: text.trim(),
      completed: false,
      createdAt: now,
      updatedAt: now,
      taskId: taskId.trim(),
    };

    todos.push(newTodo);
    saveTodosToStorage(todos);

    console.log(`[TodoListService] 创建待办事项: ${newTodo.id} (任务: ${taskId})`);
    return newTodo;
  }

  /**
   * 更新待办事项
   */
  static updateTodo(id: string, updates: { text?: string; completed?: boolean }): TodoItem {
    const todos = this.getAllTodos();
    const todoIndex = todos.findIndex((todo) => todo.id === id);

    if (todoIndex === -1) {
      throw new Error(`待办事项不存在: ${id}`);
    }

    const todo = todos[todoIndex];
    if (!todo) {
      throw new Error(`待办事项不存在: ${id}`);
    }

    const updatedTodo: TodoItem = {
      id: todo.id,
      text: updates.text !== undefined ? updates.text.trim() : todo.text,
      completed: updates.completed !== undefined ? updates.completed : todo.completed,
      createdAt: todo.createdAt,
      updatedAt: Date.now(),
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
    return this.updateTodo(id, { completed: true });
  }

  /**
   * 标记待办事项为未完成
   */
  static markTodoAsUndone(id: string): TodoItem {
    return this.updateTodo(id, { completed: false });
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
   * 删除所有已完成的待办事项
   */
  static deleteCompletedTodos(): number {
    const todos = this.getAllTodos();
    const completedCount = todos.filter((todo) => todo.completed).length;
    const activeTodos = todos.filter((todo) => !todo.completed);

    saveTodosToStorage(activeTodos);

    console.log(`[TodoListService] 删除 ${completedCount} 个已完成的待办事项`);
    return completedCount;
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
