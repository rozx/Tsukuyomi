import { MemoryService } from 'src/services/memory-service';
import { useBooksStore } from 'src/stores/books';
import { parseToolArgs, type ToolDefinition, type ToolContext } from './types';

/**
 * 验证 attached_to 实体是否存在
 * @param bookId 书籍 ID
 * @param attachedTo 附件列表
 * @returns 验证结果，包含是否有效和错误信息
 */
function validateAttachedToEntities(
  bookId: string,
  attachedTo?: Array<{ type: 'book' | 'character' | 'term' | 'chapter'; id: string }>,
): { valid: boolean; errors: string[] } {
  if (!attachedTo || attachedTo.length === 0) {
    return { valid: true, errors: [] };
  }

  const errors: string[] = [];
  const booksStore = useBooksStore();
  const book = booksStore.getBookById(bookId);

  if (!book) {
    return { valid: false, errors: ['书籍不存在'] };
  }

  for (const attachment of attachedTo) {
    const { type, id } = attachment;

    switch (type) {
      case 'book':
        // book 类型必须匹配当前书籍 ID
        if (id !== bookId) {
          errors.push(`书籍 ID "${id}" 不存在或不匹配当前书籍`);
        }
        break;

      case 'character': {
        const characterExists = book.characterSettings?.some((c) => c.id === id);
        if (!characterExists) {
          errors.push(`角色 ID "${id}" 不存在`);
        }
        break;
      }

      case 'term': {
        const termExists = book.terminologies?.some((t) => t.id === id);
        if (!termExists) {
          errors.push(`术语 ID "${id}" 不存在`);
        }
        break;
      }

      case 'chapter': {
        let chapterExists = false;
        if (book.volumes) {
          for (const volume of book.volumes) {
            if (volume.chapters?.some((c) => c.id === id)) {
              chapterExists = true;
              break;
            }
          }
        }
        if (!chapterExists) {
          errors.push(`章节 ID "${id}" 不存在`);
        }
        break;
      }

      default: {
        const unknownType = type as string;
        errors.push(`未知的附件类型: "${unknownType}"`);
        break;
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

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
          },
        });
      }

      return JSON.stringify({
        success: true,
        memories: page.map((m) => {
          const base = {
            id: m.id,
            summary: m.summary,
            attached_to: m.attachedTo,
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
              description: 'Memory ID（从 create_memory 或 search_memory_by_keywords 获取）',
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
            attached_to: memory.attachedTo,
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
              description:
                '搜索关键词数组（将在 Memory 的摘要中搜索，返回包含所有关键词的 Memory）',
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
      const { keywords } = args as {
        keywords: string[];
      };
      if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        return JSON.stringify({
          success: false,
          error: '关键词数组不能为空',
        });
      }

      // 过滤掉空字符串
      const validKeywords = keywords.filter(
        (k) => k && typeof k === 'string' && k.trim().length > 0,
      );
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
            attached_to: memory.attachedTo,
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
          '创建新的 Memory 记录（请谨慎使用）。优先用 search/list 找到相关记忆并用 update_memory 合并更新；仅当不存在任何可更新的相关记忆时才创建。记忆应短且可检索（summary 含关键词，content 用少量要点）。如记忆与角色/术语/章节相关，请使用 attached_to 进行关联；可同时关联多个实体。示例：attached_to=[{type:"character", id:"char_001"}]。',
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
            attached_to: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['book', 'character', 'term', 'chapter'],
                    description: '附件类型',
                  },
                  id: {
                    type: 'string',
                    description: '附件实体 ID',
                  },
                },
                required: ['type', 'id'],
              },
              description:
                '可选：将此记忆关联到特定的实体（角色、术语、章节等），以便更有针对性地组织和检索信息。默认情况下会关联到当前书籍。\n' +
                '- type: 实体类型，可选值："character" (角色), "term" (术语), "chapter" (章节), "book" (书籍).\n' +
                '- id: 实体的唯一标识符 (例如角色ID "char_xxx", 术语ID "term_xxx").\n' +
                '示例：[{"type": "character", "id": "char_001"}, {"type": "term", "id": "term_002"}]。\n' +
                '关联后，当处理相关实体时，更有可能检索到此记忆。',
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
      const { content, summary, attached_to } = args as {
        content: string;
        summary: string;
        attached_to?: Array<{ type: 'book' | 'character' | 'term' | 'chapter'; id: string }>;
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

      // 验证 attached_to 实体是否存在
      const validation = validateAttachedToEntities(bookId, attached_to);
      if (!validation.valid) {
        return JSON.stringify({
          success: false,
          error: `附件验证失败：${validation.errors.join('; ')}，请检查附件类型和 ID 是否正确。如果角色/术语未创建，请先创建。`,
        });
      }

      try {
        const memory = await MemoryService.createMemory(bookId, content, summary, attached_to);

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
            attached_to: memory.attachedTo,
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
          '更新指定的 Memory 记录（推荐）。当发现新信息或需要修正时，优先把新旧信息合并成更短、更清晰、可复用的规则/约定；避免重复创建多条相似记忆。summary 请保留可检索关键词，content 用少量要点表达。如发现记忆缺少/错误附件，可用 attached_to 替换修正。示例：attached_to=[{type:"term", id:"term_001"}]。',
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
            attached_to: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['book', 'character', 'term', 'chapter'],
                    description: '附件类型',
                  },
                  id: {
                    type: 'string',
                    description: '附件实体 ID',
                  },
                },
                required: ['type', 'id'],
              },
              description:
                '可选：**完全替换**当前记忆的附件列表。注意：如果提供了此参数，原有的附件将被覆盖；如果未提供，则保留原有附件。\n' +
                '用于修正错误的关联或更新关联实体。\n' +
                '- type: 实体类型，可选值："character", "term", "chapter", "book".\n' +
                '- id: 实体的唯一标识符.\n' +
                '示例：[{"type": "character", "id": "char_001"}] (这将移除所有旧关联，仅保留与 char_001 的关联)。',
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
      const { memory_id, content, summary, attached_to } = args as {
        memory_id: string;
        content: string;
        summary: string;
        attached_to?: Array<{ type: 'book' | 'character' | 'term' | 'chapter'; id: string }>;
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

      // 如果提供了 attached_to，验证实体是否存在
      if (attached_to !== undefined) {
        const validation = validateAttachedToEntities(bookId, attached_to);
        if (!validation.valid) {
          return JSON.stringify({
            success: false,
            error: `附件验证失败：${validation.errors.join('; ')}，请检查附件类型和 ID 是否正确。如果角色/术语未创建，请先创建。`,
          });
        }
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

        const memory = await MemoryService.updateMemory(
          bookId,
          memory_id,
          content,
          summary,
          attached_to,
        );

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
            attached_to: memory.attachedTo,
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
              description:
                '排序方式：createdAt 按创建时间（最新创建的在前），lastAccessedAt 按最后访问时间（默认）',
            },
          },
          required: [],
        },
      },
    },
    handler: async (args, context: ToolContext) => {
      const { bookId, onAction } = context;
      const parsedArgs = parseToolArgs<{
        limit?: number;
        sort_by?: string;
      }>(args);

      if (!bookId) {
        return JSON.stringify({
          success: false,
          error: '书籍 ID 不能为空',
        });
      }

      const { limit = 10, sort_by = 'lastAccessedAt' } = parsedArgs;
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
            attached_to: memory.attachedTo,
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
