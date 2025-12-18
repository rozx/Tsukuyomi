import { TodoListService, type TodoItem } from 'src/services/todo-list-service';
import type { ToolDefinition } from './types';

export const todoListTools: ToolDefinition[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'create_todo',
        description:
          '创建新的待办事项。可以创建单个待办事项（使用 text 参数）或多个待办事项（使用 items 参数）。当用户要求添加任务或待办事项时使用此工具。⚠️ 重要：创建待办事项时，必须创建详细、可执行的待办事项，而不是总结性的待办事项。每个待办事项应该是具体且可操作的，而不是高层次的总结。如果你规划了一个包含多个步骤的任务，必须为每个步骤创建一个独立的待办事项。',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description:
                '单个待办事项的内容描述（与 items 参数二选一）。⚠️ 重要：必须提供详细、具体、可执行的描述，而不是总结性的描述。例如："翻译第1-5段，检查术语一致性" 而不是 "翻译文本"。',
            },
            items: {
              type: 'array',
              items: {
                type: 'string',
              },
              description:
                '多个待办事项的内容列表（与 text 参数二选一）。用于批量创建多个待办事项。⚠️ 重要：每个待办事项必须提供详细、具体、可执行的描述，而不是总结性的描述。例如：["翻译第1-5段，检查术语一致性", "翻译第6-10段，确保角色名称翻译一致"] 而不是 ["翻译文本", "检查一致性"]。',
            },
          },
        },
      },
    },
    handler: (args, { onAction, taskId, sessionId }) => {
      const { text, items } = args;
      if (!taskId) {
        throw new Error(
          '任务 ID 未提供，待办事项必须关联到 AI 任务。这通常表示服务层未正确传递任务上下文。',
        );
      }

      // 支持两种模式：单个创建（text）或批量创建（items）
      // 优先检查 items 参数（如果提供了有效的数组）
      if (items && Array.isArray(items) && items.length > 0) {
        // 批量创建模式
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

            // 通过 onAction 回调传递操作信息（不需要 toast）
            if (onAction) {
              onAction({
                type: 'create',
                entity: 'todo',
                data: todo,
              });
            }
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
            completed: todo.completed,
          })),
          count: createdTodos.length,
          ...(errors.length > 0 ? { errors } : {}),
        });
      } else if (text !== undefined && text !== null) {
        // 单个创建模式（向后兼容）
        if (!text || !text.trim()) {
          throw new Error('待办事项内容不能为空');
        }

        // taskId 和 sessionId 由服务层自动提供，AI 不需要知道任务 ID 或会话 ID
        // 对于助手聊天，sessionId 会被传递并关联到待办事项
        const todo = TodoListService.createTodo(text, taskId, sessionId);

        // 通过 onAction 回调传递操作信息（不需要 toast）
        if (onAction) {
          onAction({
            type: 'create',
            entity: 'todo',
            data: todo,
          });
        }

        return JSON.stringify({
          success: true,
          message: '待办事项创建成功',
          todo: {
            id: todo.id,
            text: todo.text,
            completed: todo.completed,
          },
        });
      } else {
        throw new Error('必须提供 text 或 items 参数之一');
      }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'update_todos',
        description:
          '更新待办事项的内容或状态。可以更新单个待办事项（使用 id 参数）或多个待办事项（使用 items 参数）。可以更新文本内容或标记完成状态。',
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
            completed: {
              type: 'boolean',
              description: '是否标记为完成（可选，仅当使用 id 参数时有效）',
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
                  completed: {
                    type: 'boolean',
                    description: '是否标记为完成（可选）',
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
      const { id, text, completed, items } = args;

      // 支持两种模式：单个更新（id）或批量更新（items）
      // 优先检查 items 参数（如果提供了有效的数组）
      if (items && Array.isArray(items) && items.length > 0) {
        // 批量更新模式
        const updatedTodos: TodoItem[] = [];
        const errors: string[] = [];

        for (const item of items) {
          if (!item.id) {
            errors.push('待办事项 ID 不能为空');
            continue;
          }

          try {
            const updates: { text?: string; completed?: boolean } = {};
            if (item.text !== undefined) updates.text = item.text;
            if (item.completed !== undefined) updates.completed = item.completed;

            const previousTodo = TodoListService.getTodoById(item.id);
            const updatedTodo = TodoListService.updateTodo(item.id, updates);
            updatedTodos.push(updatedTodo);

            // 通过 onAction 回调传递操作信息（不需要 toast）
            if (onAction) {
              onAction({
                type: 'update',
                entity: 'todo',
                data: updatedTodo,
                ...(previousTodo ? { previousData: previousTodo } : {}),
              });
            }
          } catch (error) {
            errors.push(
              `更新待办事项 "${item.id}" 失败: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        if (updatedTodos.length === 0) {
          throw new Error(`批量更新待办事项失败：${errors.join('; ')}`);
        }

        return JSON.stringify({
          success: true,
          message: `成功更新 ${updatedTodos.length} 个待办事项${errors.length > 0 ? `，${errors.length} 个失败` : ''}`,
          todos: updatedTodos.map((todo) => ({
            id: todo.id,
            text: todo.text,
            completed: todo.completed,
          })),
          count: updatedTodos.length,
          ...(errors.length > 0 ? { errors } : {}),
        });
      } else if (id) {
        // 单个更新模式（向后兼容）

        const updates: { text?: string; completed?: boolean } = {};
        if (text !== undefined) updates.text = text;
        if (completed !== undefined) updates.completed = completed;

        const previousTodo = TodoListService.getTodoById(id);
        const updatedTodo = TodoListService.updateTodo(id, updates);

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
          message: '待办事项更新成功',
          todo: {
            id: updatedTodo.id,
            text: updatedTodo.text,
            completed: updatedTodo.completed,
          },
        });
      } else {
        throw new Error('必须提供 id 或 items 参数之一');
      }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'mark_todo_done',
        description: '将待办事项标记为完成。',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: '待办事项的 ID',
            },
          },
          required: ['id'],
        },
      },
    },
    handler: (args, { onAction }) => {
      const { id } = args;
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
          completed: updatedTodo.completed,
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
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: '待办事项的 ID',
            },
          },
          required: ['id'],
        },
      },
    },
    handler: (args, { onAction }) => {
      const { id } = args;
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
      const { filter = 'all' } = args;

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
          todos = taskTodos.filter((todo) => !todo.completed);
          break;
        case 'completed':
          todos = taskTodos.filter((todo) => todo.completed);
          break;
        default:
          todos = taskTodos;
      }

      // 返回待办事项列表
      return JSON.stringify({
        success: true,
        todos: todos.map((todo) => ({
          id: todo.id,
          text: todo.text,
          completed: todo.completed,
          createdAt: todo.createdAt,
          updatedAt: todo.updatedAt,
        })),
        count: todos.length,
      });
    },
  },
];
