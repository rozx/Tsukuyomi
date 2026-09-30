import { toolErrorJson, caughtToolErrorJson, checkedToolBookContext } from './tool-feedback';
import { toolDefinition } from './tool-localization';
import type { AppLocale } from 'src/models/locale';
import { translateText } from 'src/i18n/translate';
import { LocalizedError } from 'src/utils/localized-error';
import { describeTool } from './tool-localization';
import { MemoryService } from 'src/services/memory-service';
import type { Memory } from 'src/models/memory';
import { parseToolArgs, type ToolDefinition, type ToolContext } from './types';

/**
 * 校验 memory_id 并获取对应 Memory；未提供 ID 或记录不存在时抛错
 *
 * 由 get_memory / update_memory / delete_memory 共用的前置校验，
 * 抛出的错误会被调用方的 try/catch 统一包装成 error JSON。
 */
async function requireMemoryById(bookId: string, memoryId: string | undefined): Promise<Memory> {
  if (!memoryId) {
    throw new LocalizedError('MEMORY_ID_REQUIRED', 'aiEntityFeedback.memoryIdRequired');
  }
  const memory = await MemoryService.getMemory(bookId, memoryId);
  if (!memory) {
    throw new LocalizedError('MEMORY_NOT_FOUND', 'aiEntityFeedback.memoryMissing', {
      id: memoryId,
    });
  }
  return memory;
}

/**
 * 从 args 中提取并校验 content / summary 字段
 *
 * 由 create_memory / update_memory 共用的前置校验，非空时返回 trim 后的值，
 * 否则返回统一的错误 JSON 字符串（由调用方直接返回给工具链）。
 */
function parseContentSummary(
  args: Record<string, unknown>,
  uiLocale: AppLocale,
): { content: string; summary: string } | { error: string } {
  const { content, summary } = args as { content?: string; summary?: string };
  if (!content?.trim()) {
    return {
      error: toolErrorJson(
        'MEMORY_CONTENT_REQUIRED',
        'aiEntityFeedback.memoryContentRequired',
        uiLocale,
      ),
    };
  }
  if (!summary?.trim()) {
    return {
      error: toolErrorJson(
        'MEMORY_SUMMARY_REQUIRED',
        'aiEntityFeedback.memorySummaryRequired',
        uiLocale,
      ),
    };
  }
  return { content: content.trim(), summary: summary.trim() };
}

/**
 * 工具共用：校验 bookId 并从 args 中提取 memory_id
 *
 * update_memory / delete_memory 等按 memory_id 操作的 handler 共用前置样板：
 * 若 bookId 为空则返回统一的错误 JSON 字符串，否则返回 bookId / memoryId。
 */

function createListMemoriesHandler(toolName: 'list_memories') {
  return async (args: Record<string, unknown>, context: ToolContext) => {
    const { bookId, onAction } = context;
    const uiLocale = context.languages?.uiLocale ?? 'zh-CN';
    const parsedArgs = parseToolArgs<{
      offset?: number;
      limit?: number;
      sort_by?: string;
      include_content?: boolean;
    }>(args);
    if (!bookId) {
      return toolErrorJson('BOOK_ID_REQUIRED', 'aiEntityFeedback.bookRequired', uiLocale);
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
      return caughtToolErrorJson(
        error,
        uiLocale,
        'MEMORY_LIST_FAILED',
        'aiEntityFeedback.memoryListFailed',
      );
    }
  };
}

function memoryIdHandler(
  handler: (
    args: Record<string, unknown>,
    context: ToolContext & { bookId: string; uiLocale: AppLocale; memory_id: string },
  ) => Promise<string>,
): ToolDefinition['handler'] {
  return (args, context) => {
    const checked = checkedToolBookContext(context);
    if ('error' in checked) return checked.error;
    return handler(args, { ...checked, memory_id: args.memory_id as string });
  };
}

export const memoryTools: ToolDefinition[] = [
  {
    definition: toolDefinition('list_memories', {
      type: 'object',
      properties: {
        offset: {
          type: 'number',
          description: describeTool('list_memories.parameters.properties.offset'),
          minimum: 0,
        },
        limit: {
          type: 'number',
          description: describeTool('list_memories.parameters.properties.limit'),
          minimum: 1,
          maximum: 100,
        },
        sort_by: {
          type: 'string',
          enum: ['createdAt', 'lastAccessedAt'],
          description: describeTool('list_memories.parameters.properties.sort_by'),
        },
        include_content: {
          type: 'boolean',
          description: describeTool('list_memories.parameters.properties.include_content'),
        },
      },
      required: [],
    }),
    handler: createListMemoriesHandler('list_memories'),
  },
  {
    definition: toolDefinition('get_memory', {
      type: 'object',
      properties: {
        memory_id: {
          type: 'string',
          description: describeTool('get_memory.parameters.properties.memory_id'),
        },
      },
      required: ['memory_id'],
    }),
    handler: async (args, context: ToolContext) => {
      const { bookId, onAction } = context;
      const uiLocale = context.languages?.uiLocale ?? 'zh-CN';
      const parsedArgs = parseToolArgs<{ memory_id: string }>(args);
      if (!bookId) {
        return toolErrorJson('BOOK_ID_REQUIRED', 'aiEntityFeedback.bookRequired', uiLocale);
      }
      const { memory_id } = parsedArgs;

      try {
        const memory = await requireMemoryById(bookId, memory_id);

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
        return caughtToolErrorJson(
          error,
          uiLocale,
          'MEMORY_GET_FAILED',
          'aiEntityFeedback.memoryGetFailed',
        );
      }
    },
  },
  {
    definition: toolDefinition('search_memories', {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: describeTool('search_memories.parameters.properties.query'),
        },
      },
      required: ['query'],
    }),
    handler: async (args, context) => {
      const checked = checkedToolBookContext(context);
      if ('error' in checked) return checked.error;
      const { bookId, onAction, uiLocale, language } = checked;
      const { query } = args as { query: string };
      if (!query || typeof query !== 'string' || !query.trim()) {
        return toolErrorJson(
          'MEMORY_QUERY_REQUIRED',
          'aiEntityFeedback.memoryQueryRequired',
          uiLocale,
        );
      }

      try {
        const memories = await MemoryService.searchMemories(bookId, query.trim(), language);

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
        return caughtToolErrorJson(
          error,
          uiLocale,
          'MEMORY_SEARCH_FAILED',
          'aiEntityFeedback.memorySearchFailed',
        );
      }
    },
  },
  {
    definition: toolDefinition('create_memory', {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: describeTool('create_memory.parameters.properties.content'),
        },
        summary: {
          type: 'string',
          description: describeTool('create_memory.parameters.properties.summary'),
        },
      },
      required: ['content', 'summary'],
    }),
    handler: async (args, context) => {
      const checked = checkedToolBookContext(context);
      if ('error' in checked) return checked.error;
      const { bookId, onAction, uiLocale, language } = checked;
      const parsed = parseContentSummary(args, uiLocale);
      if ('error' in parsed) {
        return parsed.error;
      }
      const { content, summary } = parsed;

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
          message: translateText(uiLocale, 'aiEntityFeedback.memoryCreated'),
          memory: {
            id: memory.id,
            summary: memory.summary,
            createdAt: memory.createdAt,
          },
        });
      } catch (error) {
        return caughtToolErrorJson(
          error,
          uiLocale,
          'MEMORY_CREATE_FAILED',
          'aiEntityFeedback.memoryCreateFailed',
        );
      }
    },
  },
  {
    definition: toolDefinition('update_memory', {
      type: 'object',
      properties: {
        memory_id: {
          type: 'string',
          description: describeTool('update_memory.parameters.properties.memory_id'),
        },
        content: {
          type: 'string',
          description: describeTool('update_memory.parameters.properties.content'),
        },
        summary: {
          type: 'string',
          description: describeTool('update_memory.parameters.properties.summary'),
        },
      },
      required: ['memory_id', 'content', 'summary'],
    }),
    handler: memoryIdHandler(async (args, { bookId, onAction, uiLocale, memory_id }) => {
      const parsed = parseContentSummary(args, uiLocale);
      if ('error' in parsed) return parsed.error;
      const { content, summary } = parsed;

      try {
        // 在更新前获取 Memory 信息，以便在 action 中显示
        const oldMemory = await requireMemoryById(bookId, memory_id);

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
          message: translateText(uiLocale, 'aiEntityFeedback.memoryUpdated'),
          memory: {
            id: memory.id,
            summary: memory.summary,
            createdAt: memory.createdAt,
            lastAccessedAt: memory.lastAccessedAt,
          },
        });
      } catch (error) {
        return caughtToolErrorJson(
          error,
          uiLocale,
          'MEMORY_UPDATE_FAILED',
          'aiEntityFeedback.memoryUpdateFailed',
        );
      }
    }),
  },
  {
    definition: toolDefinition('delete_memory', {
      type: 'object',
      properties: {
        memory_id: {
          type: 'string',
          description: describeTool('delete_memory.parameters.properties.memory_id'),
        },
      },
      required: ['memory_id'],
    }),
    handler: memoryIdHandler(async (args, { bookId, onAction, uiLocale, memory_id }) => {
      try {
        // 在删除前获取 Memory 信息，以便在 action 中显示
        const memory = await requireMemoryById(bookId, memory_id);

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
          message: translateText(uiLocale, 'aiEntityFeedback.memoryDeleted'),
        });
      } catch (error) {
        return caughtToolErrorJson(
          error,
          uiLocale,
          'MEMORY_DELETE_FAILED',
          'aiEntityFeedback.memoryDeleteFailed',
        );
      }
    }),
  },
];
