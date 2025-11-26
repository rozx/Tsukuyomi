import { MemoryService } from 'src/services/memory-service';
import type { ToolDefinition } from './types';

export const memoryTools: ToolDefinition[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_memory',
        description:
          '根据 Memory ID 获取指定的 Memory 内容。当需要查看之前存储的背景设定、章节摘要等记忆内容时使用此工具。',
        parameters: {
          type: 'object',
          properties: {
            memory_id: {
              type: 'string',
              description: 'Memory ID（从 create_memory 或 search_memory_by_keyword 获取）',
            },
          },
          required: ['memory_id'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        return JSON.stringify({
          success: false,
          error: '书籍 ID 不能为空',
        });
      }
      const { memory_id } = args;
      if (!memory_id) {
        return JSON.stringify({
          success: false,
          error: 'Memory ID 不能为空',
        });
      }

      try {
        const memory = await MemoryService.getMemory(bookId, memory_id);

        if (!memory) {
          return JSON.stringify({
            success: false,
            error: `Memory 不存在: ${memory_id}`,
          });
        }

        // 报告读取操作
        if (onAction) {
          onAction({
            type: 'read',
            entity: 'memory',
            data: {
              memory_id,
              tool_name: 'get_memory',
            },
          });
        }

        return JSON.stringify({
          success: true,
          memory: {
            id: memory.id,
            content: memory.content,
            summary: memory.summary,
            createdAt: memory.createdAt,
            lastAccessedAt: memory.lastAccessedAt,
          },
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : '获取 Memory 失败',
        });
      }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'search_memory_by_keyword',
        description:
          '根据关键词搜索 Memory 的摘要。当需要查找包含特定关键词的记忆内容（如背景设定、章节摘要等）时使用此工具。',
        parameters: {
          type: 'object',
          properties: {
            keyword: {
              type: 'string',
              description: '搜索关键词（将在 Memory 的摘要中搜索）',
            },
          },
          required: ['keyword'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        return JSON.stringify({
          success: false,
          error: '书籍 ID 不能为空',
        });
      }
      const { keyword } = args;
      if (!keyword) {
        return JSON.stringify({
          success: false,
          error: '关键词不能为空',
        });
      }

      try {
        const memories = await MemoryService.searchMemoriesByKeyword(bookId, keyword);

        // 报告读取操作
        if (onAction) {
          onAction({
            type: 'read',
            entity: 'memory',
            data: {
              keyword,
              tool_name: 'search_memory_by_keyword',
            },
          });
        }

        return JSON.stringify({
          success: true,
          memories: memories.map((memory) => ({
            id: memory.id,
            summary: memory.summary,
            content: memory.content,
            createdAt: memory.createdAt,
            lastAccessedAt: memory.lastAccessedAt,
          })),
          count: memories.length,
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : '搜索 Memory 失败',
        });
      }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'create_memory',
        description:
          '创建新的 Memory 记录，用于存储大块内容（如背景设定、章节摘要等）。AI 会自动生成摘要。当需要保存重要信息供后续参考时使用此工具。',
        parameters: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: '要存储的实际内容',
            },
            summary: {
              type: 'string',
              description: '内容的摘要（由 AI 生成，用于后续搜索）',
            },
          },
          required: ['content', 'summary'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        return JSON.stringify({
          success: false,
          error: '书籍 ID 不能为空',
        });
      }
      const { content, summary } = args;
      if (!content) {
        return JSON.stringify({
          success: false,
          error: '内容不能为空',
        });
      }
      if (!summary) {
        return JSON.stringify({
          success: false,
          error: '摘要不能为空',
        });
      }

      try {
        const memory = await MemoryService.createMemory(bookId, content, summary);

        // 报告创建操作
        if (onAction) {
          onAction({
            type: 'create',
            entity: 'memory',
            data: {
              id: memory.id,
              summary: memory.summary,
            },
          });
        }

        return JSON.stringify({
          success: true,
          message: 'Memory 创建成功',
          memory: {
            id: memory.id,
            summary: memory.summary,
            createdAt: memory.createdAt,
          },
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : '创建 Memory 失败',
        });
      }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'delete_memory',
        description:
          '删除指定的 Memory 记录。当确定某个 Memory 不再需要时，可以使用此工具删除。',
        parameters: {
          type: 'object',
          properties: {
            memory_id: {
              type: 'string',
              description: 'Memory ID（从 get_memory 或 search_memory_by_keyword 获取）',
            },
          },
          required: ['memory_id'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        return JSON.stringify({
          success: false,
          error: '书籍 ID 不能为空',
        });
      }
      const { memory_id } = args;
      if (!memory_id) {
        return JSON.stringify({
          success: false,
          error: 'Memory ID 不能为空',
        });
      }

      try {
        // 在删除前获取 Memory 信息，以便在 action 中显示
        const memory = await MemoryService.getMemory(bookId, memory_id);
        if (!memory) {
          return JSON.stringify({
            success: false,
            error: `Memory 不存在: ${memory_id}`,
          });
        }

        await MemoryService.deleteMemory(bookId, memory_id);

        // 报告删除操作
        if (onAction) {
          onAction({
            type: 'delete',
            entity: 'memory',
            data: {
              id: memory_id,
              summary: memory.summary,
            },
          });
        }

        return JSON.stringify({
          success: true,
          message: 'Memory 删除成功',
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : '删除 Memory 失败',
        });
      }
    },
  },
];

