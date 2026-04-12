import { MemoryService } from 'src/services/memory-service';
import { parseToolArgs, type ToolDefinition, type ToolContext } from './types';

function createListMemoriesHandler(toolName: 'list_memories') {
  return async (args: Record<string, unknown>, context: ToolContext) => {
    const { bookId, onAction } = context;
    const parsedArgs = parseToolArgs<{
      offset?: number;
      limit?: number;
      sort_by?: string;
      include_content?: boolean;
    }>(args);
    if (!bookId) {
      return JSON.stringify({
        success: false,
        error: '书籍 ID 不能为空',
      });
    }

    const {
      offset = 0,
      limit = 20,
      sort_by = 'lastAccessedAt',
      include_content = false,
    } = parsedArgs;

    const validOffset = Math.max(0, Math.floor(Number(offset) || 0));
    const validLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 20)), 100);
    const validSortBy = sort_by === 'createdAt' ? 'createdAt' : 'lastAccessedAt';
    const includeContent = Boolean(include_content);

    try {
      const allMemories = await MemoryService.getAllMemories(bookId);

      const sorted = [...allMemories].sort((a, b) =>
        validSortBy === 'createdAt'
          ? b.createdAt - a.createdAt
          : b.lastAccessedAt - a.lastAccessedAt,
      );

      const total = sorted.length;
      const page = sorted.slice(validOffset, validOffset + validLimit);

      if (onAction) {
        onAction({
          type: 'read',
          entity: 'memory',
          data: {
            offset: validOffset,
            limit: validLimit,
            sort_by: validSortBy,
            include_content: includeContent,
            tool_name: toolName,
            found_memory_ids: page.map((m) => m.id),
          },
        });
      }

      return JSON.stringify({
        success: true,
        memories: page.map((m) => {
          const base = {
            id: m.id,
            summary: m.summary,
            createdAt: m.createdAt,
            lastAccessedAt: m.lastAccessedAt,
          };

          return includeContent ? { ...base, content: m.content } : base;
        }),
        count: page.length,
        total,
        offset: validOffset,
        limit: validLimit,
        sort_by: validSortBy,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : '列出 Memory 失败',
      });
    }
  };
}

export const memoryTools: ToolDefinition[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'list_memories',
        description:
          '列出指定书籍的 Memory 列表（用于管理/调试）。支持分页与排序，默认仅返回轻量字段（id/summary/createdAt/lastAccessedAt）。如需完整内容，请设置 include_content=true。',
        parameters: {
          type: 'object',
          properties: {
            offset: {
              type: 'number',
              description: '分页偏移量（从 0 开始）',
              minimum: 0,
            },
            limit: {
              type: 'number',
              description: '返回数量（默认 20，建议不超过 50）',
              minimum: 1,
              maximum: 100,
            },
            sort_by: {
              type: 'string',
              enum: ['createdAt', 'lastAccessedAt'],
              description:
                '排序方式：createdAt 按创建时间（最新在前），lastAccessedAt 按最后访问时间（默认）',
            },
            include_content: {
              type: 'boolean',
              description: '是否返回完整内容 content（默认 false）',
            },
          },
          required: [],
        },
      },
    },
    handler: createListMemoriesHandler('list_memories'),
  },
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
              description: 'Memory ID（从 create_memory 或 search_memories 获取）',
            },
          },
          required: ['memory_id'],
        },
      },
    },
    handler: async (args, context: ToolContext) => {
      const { bookId, onAction } = context;
      const parsedArgs = parseToolArgs<{ memory_id: string }>(args);
      if (!bookId) {
        return JSON.stringify({
          success: false,
          error: '书籍 ID 不能为空',
        });
      }
      const { memory_id } = parsedArgs;
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
        name: 'search_memories',
        description:
          '搜索 Memory（混合检索：关键词匹配 + 语义相似度）。当需要查找相关记忆内容（如背景设定、章节摘要等）时使用此工具。传入自然语言查询，自动结合关键词匹配和语义向量进行排序。[警告] **重要**：当查询角色或术语信息时，必须**先**使用 get_character/search_characters_by_keywords 或 get_term/search_terms_by_keywords 查询数据库，**只有在数据库中没有找到时**才可以使用此工具搜索记忆。此工具主要用于查找背景设定、世界观、剧情要点等非结构化信息，不应用于替代角色或术语数据库查询。[警告] **敬语翻译**：翻译敬语时，必须**首先**使用此工具搜索记忆中关于该角色敬语翻译的相关信息（如角色关系、敬语使用习惯等），然后再使用 find_paragraph_by_keywords 搜索段落。',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索查询（自然语言描述或关键词，用于关键词匹配和语义检索）',
            },
          },
          required: ['query'],
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
      const { query } = args as { query: string };
      if (!query || typeof query !== 'string' || !query.trim()) {
        return JSON.stringify({
          success: false,
          error: '搜索查询不能为空',
        });
      }

      try {
        const memories = await MemoryService.searchMemories(bookId, query.trim());

        if (onAction) {
          onAction({
            type: 'read',
            entity: 'memory',
            data: {
              query: query.trim(),
              tool_name: 'search_memories',
              found_memory_ids: memories.map((m) => m.id),
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
          '创建新的 Memory 记录（请谨慎使用）。优先用 search/list 找到相关记忆并用 update_memory 合并更新；仅当不存在任何可更新的相关记忆时才创建。记忆应短且可检索（summary 含关键词，content 用少量要点），系统会基于内容自动进行打分召回。',
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
      const { content, summary } = args as {
        content: string;
        summary: string;
      };
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
          '更新指定的 Memory 记录（推荐）。当发现新信息或需要修正时，优先把新旧信息合并成更短、更清晰、可复用的规则/约定；避免重复创建多条相似记忆。summary 请保留可检索关键词，content 用少量要点表达。',
        parameters: {
          type: 'object',
          properties: {
            memory_id: {
              type: 'string',
              description: 'Memory ID（从 get_memory 或 search_memories 获取）',
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
      const { memory_id, content, summary } = args as {
        memory_id: string;
        content: string;
        summary: string;
      };
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
        description: '删除指定的 Memory 记录。当确定某个 Memory 不再需要时，可以使用此工具删除。',
        parameters: {
          type: 'object',
          properties: {
            memory_id: {
              type: 'string',
              description: 'Memory ID（从 get_memory 或 search_memories 获取）',
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
      const { memory_id } = args as {
        memory_id: string;
      };
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
