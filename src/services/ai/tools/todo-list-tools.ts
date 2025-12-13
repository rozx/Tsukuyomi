import { TodoListService, type TodoItem } from 'src/services/todo-list-service';
import type { ToolDefinition } from './types';

export const todoListTools: ToolDefinition[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'create_todo',
        description: '创建新的待办事项。当用户要求添加任务或待办事项时使用此工具。⚠️ 重要：创建待办事项时，必须创建详细、可执行的待办事项，而不是总结性的待办事项。每个待办事项应该是具体且可操作的，而不是高层次的总结。',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: '待办事项的内容描述。⚠️ 重要：必须提供详细、具体、可执行的描述，而不是总结性的描述。例如："翻译第1-5段，检查术语一致性" 而不是 "翻译文本"。',
            },
          },
          required: ['text'],
        },
      },
    },
    handler: (args, { onAction, taskId, sessionId }) => {
      const { text } = args;
      if (!text || !text.trim()) {
        throw new Error('待办事项内容不能为空');
      }
      if (!taskId) {
        throw new Error(
          '任务 ID 未提供，待办事项必须关联到 AI 任务。这通常表示服务层未正确传递任务上下文。',
        );
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
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'update_todo',
        description: '更新待办事项的内容或状态。可以更新文本内容或标记完成状态。',
        parameters: {
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
      },
    },
    handler: (args, { onAction }) => {
      const { id, text, completed } = args;
      if (!id) {
        throw new Error('待办事项 ID 不能为空');
      }

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
