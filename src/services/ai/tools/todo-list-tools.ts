import { TodoListService, type TodoItem } from 'src/services/todo-list-service';
import type { ToolDefinition } from './types';

export const todoListTools: ToolDefinition[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'create_todo',
        description: '创建新的待办事项。当用户要求添加任务或待办事项时使用此工具。',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: '待办事项的内容描述',
            },
          },
          required: ['text'],
        },
      },
    },
    handler: (args, { onAction }) => {
      const { text } = args;
      if (!text || !text.trim()) {
        throw new Error('待办事项内容不能为空');
      }

      const todo = TodoListService.createTodo(text);

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
        description: '列出所有待办事项。可以获取所有、仅未完成或仅已完成的待办事项。',
        parameters: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              enum: ['all', 'active', 'completed'],
              description: '过滤类型：all-所有，active-仅未完成，completed-仅已完成',
            },
          },
        },
      },
    },
    handler: (args) => {
      const { filter = 'all' } = args;

      let todos: TodoItem[];
      switch (filter) {
        case 'active':
          todos = TodoListService.getActiveTodos();
          break;
        case 'completed':
          todos = TodoListService.getCompletedTodos();
          break;
        default:
          todos = TodoListService.getAllTodos();
      }

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
