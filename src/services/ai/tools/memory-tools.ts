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
              description: 'Memory ID（从 create_memory 或 search_memory_by_keywords 获取）',
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
        name: 'search_memory_by_keywords',
        description:
          '根据多个关键词搜索 Memory 的摘要。当需要查找包含特定关键词的记忆内容（如背景设定、章节摘要等）时使用此工具。支持多个关键词，返回包含所有关键词的 Memory（AND 逻辑）。[警告] **重要**：当查询角色或术语信息时，必须**先**使用 get_character/search_characters_by_keywords 或 get_term/search_terms_by_keywords 查询数据库，**只有在数据库中没有找到时**才可以使用此工具搜索记忆。此工具主要用于查找背景设定、世界观、剧情要点等非结构化信息，不应用于替代角色或术语数据库查询。[警告] **敬语翻译**：翻译敬语时，必须**首先**使用此工具搜索记忆中关于该角色敬语翻译的相关信息（如角色关系、敬语使用习惯等），然后再使用 find_paragraph_by_keywords 搜索段落。',
        parameters: {
          type: 'object',
          properties: {
            keywords: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: '搜索关键词数组（将在 Memory 的摘要中搜索，返回包含所有关键词的 Memory）',
            },
          },
          required: ['keywords'],
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
      const { keywords } = args;
      if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        return JSON.stringify({
          success: false,
          error: '关键词数组不能为空',
        });
      }

      // 过滤掉空字符串
      const validKeywords = keywords.filter((k) => k && typeof k === 'string' && k.trim().length > 0);
      if (validKeywords.length === 0) {
        return JSON.stringify({
          success: false,
          error: '关键词数组不能为空',
        });
      }

      try {
        const memories = await MemoryService.searchMemoriesByKeywords(bookId, validKeywords);

        // 报告读取操作
        if (onAction) {
          onAction({
            type: 'read',
            entity: 'memory',
            data: {
              keywords: validKeywords,
              tool_name: 'search_memory_by_keywords',
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
        name: 'update_memory',
        description:
          '更新指定的 Memory 记录。当发现记忆中的信息需要更新（如角色关系变化、敬语翻译方式改变等）时，应使用此工具更新记忆，确保记忆反映最新信息。记忆应该经常更新以反映最新的信息。',
        parameters: {
          type: 'object',
          properties: {
            memory_id: {
              type: 'string',
              description: 'Memory ID（从 get_memory 或 search_memory_by_keywords 获取）',
            },
            content: {
              type: 'string',
              description: '更新后的实际内容',
            },
            summary: {
              type: 'string',
              description: '更新后的摘要（由 AI 生成，用于后续搜索）',
            },
          },
          required: ['memory_id', 'content', 'summary'],
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
      const { memory_id, content, summary } = args;
      if (!memory_id) {
        return JSON.stringify({
          success: false,
          error: 'Memory ID 不能为空',
        });
      }
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
        // 在更新前获取 Memory 信息，以便在 action 中显示
        const oldMemory = await MemoryService.getMemory(bookId, memory_id);
        if (!oldMemory) {
          return JSON.stringify({
            success: false,
            error: `Memory 不存在: ${memory_id}`,
          });
        }

        const memory = await MemoryService.updateMemory(bookId, memory_id, content, summary);

        // 报告更新操作
        if (onAction) {
          onAction({
            type: 'update',
            entity: 'memory',
            data: {
              id: memory_id,
              summary: memory.summary,
            },
            previousData: oldMemory,
          });
        }

        return JSON.stringify({
          success: true,
          message: 'Memory 更新成功',
          memory: {
            id: memory.id,
            summary: memory.summary,
            createdAt: memory.createdAt,
            lastAccessedAt: memory.lastAccessedAt,
          },
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : '更新 Memory 失败',
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
              description: 'Memory ID（从 get_memory 或 search_memory_by_keywords 获取）',
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
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_recent_memories',
        description:
          '获取最近的 Memory 记录列表，按最后访问时间或创建时间排序。当需要快速浏览最近的记忆内容、了解最近的背景设定或章节摘要时使用此工具。适合在对话开始时获取上下文，或在需要查看最近保存的重要信息时使用。',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: '返回的记忆数量限制（默认 10，最大建议 20）',
              minimum: 1,
              maximum: 50,
            },
            sort_by: {
              type: 'string',
              enum: ['createdAt', 'lastAccessedAt'],
              description: '排序方式：createdAt 按创建时间（最新创建的在前），lastAccessedAt 按最后访问时间（默认）',
            },
          },
          required: [],
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

      const { limit = 10, sort_by = 'lastAccessedAt' } = args;
      const validLimit = Math.min(Math.max(1, Math.floor(limit || 10)), 50); // 限制在 1-50 之间
      const validSortBy = sort_by === 'createdAt' ? 'createdAt' : 'lastAccessedAt';

      try {
        const memories = await MemoryService.getRecentMemories(
          bookId,
          validLimit,
          validSortBy,
          true, // 更新访问时间
        );

        // 报告读取操作
        if (onAction) {
          onAction({
            type: 'read',
            entity: 'memory',
            data: {
              limit: validLimit,
              sort_by: validSortBy,
              tool_name: 'get_recent_memories',
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
          sort_by: validSortBy,
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : '获取最近 Memory 失败',
        });
      }
    },
  },
];

