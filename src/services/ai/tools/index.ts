import type { AITool, AIToolCall, AIToolCallResult } from 'src/services/ai/types/ai-service';
import type { ActionInfo, ToolDefinition, ChunkBoundaries } from './types';
import type { ToastCallback } from './toast-helper';
import { terminologyTools } from './terminology-tools';
import { characterTools } from './character-tools';
import { paragraphTools } from './paragraph-tools';
import { webSearchTools } from './web-search-tools';
import { bookTools } from './book-tools';
import { memoryTools } from './memory-tools';
import { navigationTools } from './navigation-tools';
import { todoListTools } from './todo-list-tools';
import { askUserTools } from './ask-user-tools';
import { taskStatusTools } from './task-status-tools';
import { translationTools } from './translation-tools';
import { helpDocsTools } from './help-docs-tools';
import { GlobalConfig } from 'src/services/global-config-cache';
import { jsonrepair } from 'jsonrepair';

export type { ActionInfo };

/**
 * 工具名称常量
 */
const TRANSLATION_MANAGEMENT_TOOLS = [
  'add_translation',
  'update_translation',
  'remove_translation',
  'select_translation',
  'batch_replace_translations',
] as const;

const NAVIGATION_AND_LIST_TOOLS = [
  'navigate_to_chapter',
  'navigate_to_paragraph',
  'get_book_info',
  'list_chapters',
  'get_chapter_info',
  'update_book_info',
  'list_characters',
  'list_terms',
  'list_memories',
];

export class ToolRegistry {
  /**
   * 通用的工具过滤方法
   */
  private static filterTools(tools: AITool[], excludedNames: readonly string[]): AITool[] {
    return tools.filter((tool) => !excludedNames.includes(tool.function.name));
  }

  /**
   * 通用的工具映射方法
   */
  private static mapTools(toolDefinitions: ToolDefinition[]): AITool[] {
    return toolDefinitions.map((t) => t.definition);
  }

  static getTerminologyTools(bookId?: string): AITool[] {
    if (!bookId) return [];
    return this.mapTools(terminologyTools);
  }

  static getCharacterSettingTools(bookId?: string): AITool[] {
    if (!bookId) return [];
    return this.mapTools(characterTools);
  }

  static getParagraphTools(bookId?: string): AITool[] {
    if (!bookId) return [];
    return this.mapTools(paragraphTools);
  }

  static getBookTools(bookId?: string): AITool[] {
    if (!bookId) return [];
    return this.mapTools(bookTools);
  }

  static getMemoryTools(bookId?: string): AITool[] {
    if (!bookId) return [];
    return this.mapTools(memoryTools);
  }

  static getNavigationTools(bookId?: string): AITool[] {
    if (!bookId) return [];
    return this.mapTools(navigationTools);
  }

  static getWebSearchTools(): AITool[] {
    // 检查是否已配置 Tavily API Key
    const apiKey = GlobalConfig.getTavilyApiKey();

    // 如果没有配置 API Key，不返回网络搜索工具
    if (!apiKey) {
      return [];
    }

    return this.mapTools(webSearchTools);
  }

  static getTodoListTools(): AITool[] {
    return this.mapTools(todoListTools);
  }

  static getAskUserTools(): AITool[] {
    return this.mapTools(askUserTools);
  }

  static getTaskStatusTools(): AITool[] {
    return this.mapTools(taskStatusTools);
  }

  static getHelpDocsTools(): AITool[] {
    return this.mapTools(helpDocsTools);
  }

  /**
   * 仅用于聊天助手的工具集合（包含帮助文档工具）
   */
  static getAssistantTools(bookId?: string): AITool[] {
    return [...this.getAllTools(bookId), ...this.getHelpDocsTools()];
  }

  static getTranslationToolsForAI(): AITool[] {
    return this.mapTools(translationTools);
  }

  static getAllTools(bookId?: string): AITool[] {
    const tools: AITool[] = [
      // 网络搜索工具始终可用（不需要 bookId）
      ...this.getWebSearchTools(),
      // 待办事项工具始终可用（不需要 bookId）
      ...this.getTodoListTools(),
      // ask_user 始终可用（不需要 bookId；会阻塞等待用户回答）
      ...this.getAskUserTools(),
      // AI 任务状态工具始终可用
      ...this.getTaskStatusTools(),
    ];

    // 其他工具需要 bookId
    if (bookId) {
      tools.push(
        ...this.getTerminologyTools(bookId),
        ...this.getCharacterSettingTools(bookId),
        ...this.getParagraphTools(bookId),
        ...this.getBookTools(bookId),
        ...this.getMemoryTools(bookId),
        ...this.getNavigationTools(bookId),
        // 翻译相关工具（add_translation_batch）- 用于 translation/polish/proofreading
        ...this.getTranslationToolsForAI(),
      );
    }

    return tools;
  }

  /**
   * 获取工具列表，排除翻译管理工具（add_translation, update_translation, remove_translation, select_translation, batch_replace_translations）
   * 用于需要避免 AI 直接修改翻译历史的服务（例如：润色/校对等只返回 JSON 的服务）
   */
  static getToolsExcludingTranslationManagement(bookId?: string): AITool[] {
    const allTools = this.getAllTools(bookId);
    return this.filterTools(allTools, TRANSLATION_MANAGEMENT_TOOLS);
  }

  /**
   * 聊天助手专用工具（排除翻译管理工具和任务状态工具）
   * 排除的工具：
   * - add_translation_batch: 翻译/润色/校对专用，不在助手聊天中可用
   * - update_task_status: 任务状态管理专用，不在助手聊天中可用
   */
  static getAssistantToolsExcludingTranslationManagement(bookId?: string): AITool[] {
    const allTools = this.getAssistantTools(bookId);
    return this.filterTools(allTools, ['add_translation_batch', 'update_task_status']);
  }

  /**
   * 获取术语翻译服务允许的工具
   * 只包含只读工具：get_book_info, get/list/search terms, get/list/search characters, get/list/search memory, search paragraphs
   *
   * ⚠️ 重要：此方法明确排除所有变更工具（create_term, update_term, delete_term 等），
   * 因为术语翻译服务只用于查询上下文信息，不应该进行任何数据变更操作。
   * 术语的创建、更新、删除应该在其他服务（如翻译服务、校对服务）中完成。
   */
  static getTermTranslationTools(bookId?: string): AITool[] {
    if (!bookId) return [];

    // [重要] 术语翻译服务：只允许 keyword 搜索类工具（search_*_by_keywords）
    // 目的：避免模型使用其它只读工具（get/list/find 等）导致提示与工具集不一致。
    const allowedToolNames = [
      'search_terms_by_keywords',
      'search_characters_by_keywords',
      'find_paragraph_by_keywords',
    ];

    // 获取所有工具（包括变更工具）
    const allTools = [
      ...this.getBookTools(bookId),
      ...this.getTerminologyTools(bookId), // 包含 create_term, update_term, delete_term 等
      ...this.getCharacterSettingTools(bookId),
      ...this.getMemoryTools(bookId),
      ...this.getParagraphTools(bookId),
    ];

    // 通过过滤器只返回允许的只读工具，明确排除所有变更工具
    return allTools.filter((tool) => allowedToolNames.includes(tool.function.name));
  }

  /**
   * 获取翻译服务允许的工具
   * 排除翻译管理工具和导航/列表工具，让AI专注于当前文本块
   */
  static getTranslationTools(bookId?: string, options?: { excludeAskUser?: boolean }): AITool[] {
    const allTools = this.getToolsExcludingTranslationManagement(bookId);
    let tools = this.filterTools(allTools, NAVIGATION_AND_LIST_TOOLS);

    // 书籍级配置：在翻译相关任务中跳过 ask_user（不向模型提供该工具）
    if (options?.excludeAskUser) {
      tools = this.filterTools(tools, ['ask_user', 'ask_user_batch']);
    }

    return tools;
  }

  /**
   * 获取所有工具定义（用于工具调用处理）
   */
  private static getAllToolDefinitions(): ToolDefinition[] {
    return [
      ...terminologyTools,
      ...characterTools,
      ...paragraphTools,
      ...webSearchTools,
      ...bookTools,
      ...memoryTools,
      ...navigationTools,
      ...todoListTools,
      ...askUserTools,
      ...taskStatusTools,
      ...translationTools,
      ...helpDocsTools,
    ];
  }

  static async handleToolCall(
    toolCall: AIToolCall,
    bookId: string,
    onAction?: (action: ActionInfo) => void,
    onToast?: ToastCallback,
    taskId?: string,
    sessionId?: string,
    paragraphIds?: string[], // 当前块的段落 ID 列表，用于边界限制
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    aiProcessingStore?: any, // AI 处理 Store，用于任务状态工具
    aiModelId?: string,
    chunkIndex?: number, // 当前块索引，用于 review 检查跳过非首块的标题验证
    submittedParagraphIds?: Set<string>, // 已提交的段落 ID 集合，用于计算剩余 chunk 大小
    accumulatedParagraphs?: Map<string, string>, // 当前 session 已积累的翻译内存，用于 review 完整性检查
  ): Promise<AIToolCallResult> {
    const functionName = toolCall.function.name;
    const allTools = this.getAllToolDefinitions();
    const tool = allTools.find((t) => t.definition.function.name === functionName);

    if (!tool) {
      console.warn(`[ToolRegistry] ⚠️ 未知的工具: ${functionName}`);
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name: functionName,
        content: JSON.stringify({
          success: false,
          error: `未知的工具: ${functionName}`,
        }),
      };
    }

    try {
      let args;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        // 尝试使用 jsonrepair 修复格式错误的 JSON
        // 某些 AI 模型（如 Yi/Minimax）可能生成格式不正确的 JSON
        try {
          const repairedJson = jsonrepair(toolCall.function.arguments);
          args = JSON.parse(repairedJson);
          console.log(`[ToolRegistry] 🔧 使用 jsonrepair 修复了格式错误的 JSON [${functionName}]`);
        } catch (repairError) {
          const errorMsg = `无法解析工具参数: ${e instanceof Error ? e.message : String(e)}`;
          console.error(
            `[ToolRegistry] ❌ 工具调用失败 [${functionName}]:`,
            errorMsg,
            '\n原始参数:',
            toolCall.function.arguments,
          );
          throw new Error(errorMsg);
        }
      }

      // 记录工具调用开始
      const argsPreview = JSON.stringify(args);
      const argsDisplay =
        argsPreview.length > 200 ? argsPreview.substring(0, 200) + '...' : argsPreview;
      console.log(
        `[ToolRegistry] 🔧 AI 调用工具: ${functionName}${bookId ? ` (bookId: ${bookId})` : ''}`,
        argsDisplay,
      );

      // 构建块边界信息（如果提供了 paragraphIds）
      let chunkBoundaries: ChunkBoundaries | undefined;
      if (paragraphIds && paragraphIds.length > 0) {
        chunkBoundaries = {
          allowedParagraphIds: new Set(paragraphIds),
          paragraphIds: paragraphIds, // 保留顺序数组用于计算剩余段落
          firstParagraphId: paragraphIds[0]!,
          lastParagraphId: paragraphIds[paragraphIds.length - 1]!,
        };
      }

      // 将 taskId 和 sessionId 传递给工具上下文（由服务层自动提供）
      const result = await tool.handler(args, {
        ...(bookId ? { bookId } : {}),
        ...(taskId ? { taskId } : {}),
        ...(sessionId ? { sessionId } : {}),
        ...(aiModelId ? { aiModelId } : {}),
        ...(onAction ? { onAction } : {}),
        ...(onToast ? { onToast } : {}),
        ...(chunkBoundaries ? { chunkBoundaries } : {}),
        ...(aiProcessingStore ? { aiProcessingStore } : {}),
        ...(chunkIndex !== undefined ? { chunkIndex } : {}),
        ...(submittedParagraphIds ? { submittedParagraphIds } : {}),
        ...(accumulatedParagraphs ? { accumulatedParagraphs } : {}),
      });

      // 记录工具调用成功
      const resultPreview =
        typeof result === 'string'
          ? result.length > 200
            ? result.substring(0, 200) + '...'
            : result
          : JSON.stringify(result).length > 200
            ? JSON.stringify(result).substring(0, 200) + '...'
            : JSON.stringify(result);
      console.log(`[ToolRegistry] ✅ 工具调用成功 [${functionName}]:`, resultPreview);

      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name: functionName,
        content: result,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      console.error(`[ToolRegistry] ❌ 工具调用失败 [${functionName}]:`, errorMsg);
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name: functionName,
        content: JSON.stringify({
          success: false,
          error: errorMsg,
        }),
      };
    }
  }
}
