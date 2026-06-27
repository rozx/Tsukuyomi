import type { AITool, AIToolCall, AIToolCallResult } from 'src/services/ai/types/ai-service';
import type { ActionInfo, ToolDefinition } from './types';
import type { ToastCallback } from './toast-helper';
import {
  buildErrorToolResult,
  buildUnknownToolResult,
  invokeToolHandler,
  type HandleToolCallOptions,
} from './tool-call-invoker';
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
import { createTranslationTools, type CreateTranslationToolsOptions } from './translation-tools';
import { helpDocsTools } from './help-docs-tools';
import { GlobalConfig } from 'src/services/global-config-cache';
import { useSettingsStore } from 'src/stores/settings';
import { isLocalEmbeddingEffectivelyEnabled } from 'src/utils/local-embedding';

/** 依赖本地嵌入的工具 —— 总开关 OFF / 手机端时从可用集合里整体剔除 */
const EMBEDDING_DEPENDENT_TOOL_NAMES = ['query_chapter'] as const;

/**
 * 根据当前设置判断本地嵌入是否有效启用(桌面 + 用户 toggle on)。
 * 读 Pinia 失败时按"未启用"处理,避免因未初始化就向模型暴露用不了的工具。
 */
function isLocalEmbeddingOn(): boolean {
  try {
    const store = useSettingsStore();
    return isLocalEmbeddingEffectivelyEnabled(store.settings.enableLocalEmbedding);
  } catch {
    return false;
  }
}

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

const TODO_MUTATION_TOOLS = ['create_todo', 'update_todos', 'delete_todo'] as const;

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
    const all = this.mapTools(bookTools);
    // 本地嵌入关闭(手机端 / 用户 toggle off)时,剔除依赖嵌入的工具,
    // 让模型的工具列表和 prompt 描述保持一致 —— 不描述用不了的工具。
    if (!isLocalEmbeddingOn()) {
      return this.filterTools(all, EMBEDDING_DEPENDENT_TOOL_NAMES);
    }
    return all;
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

  static getTranslationToolsForAI(options?: CreateTranslationToolsOptions): AITool[] {
    return this.mapTools(createTranslationTools(options));
  }

  static getAllTools(bookId?: string, toolOptions?: CreateTranslationToolsOptions): AITool[] {
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
        ...this.getTranslationToolsForAI(toolOptions),
      );
    }

    return tools;
  }

  /**
   * 获取工具列表，排除翻译管理工具（add_translation, update_translation, remove_translation, select_translation, batch_replace_translations）
   * 用于需要避免 AI 直接修改翻译历史的服务（例如：润色/校对等只返回 JSON 的服务）
   */
  static getToolsExcludingTranslationManagement(
    bookId?: string,
    toolOptions?: CreateTranslationToolsOptions,
  ): AITool[] {
    const allTools = this.getAllTools(bookId, toolOptions);
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
   * 获取单段落润色/校对模式的工具集
   * 包含只读上下文工具 + add_translation_batch
   * 排除数据修改工具、update_task_status、ask_user、待办事项和导航工具
   */
  static getSingleParagraphPolishTools(bookId?: string): AITool[] {
    if (!bookId) return [];

    const allowedToolNames = [
      // 段落工具（只读）
      'get_previous_paragraphs',
      'get_next_paragraphs',
      'get_paragraph_info',
      'get_paragraph_position',
      'find_paragraph_by_keywords',
      'search_paragraphs_by_regex',
      'get_translation_history',
      // 术语工具（只读）
      'get_term',
      'search_terms_by_keywords',
      'list_terms',
      // 角色工具（只读）
      'get_character',
      'search_characters_by_keywords',
      'list_characters',
      // 记忆工具（只读）
      'search_memories',
      'get_memory',
      'list_memories',
      // 书籍工具（只读）
      'get_book_info',
      'get_chapter_info',
      'query_chapter',
      // 网络搜索
      'search_web',
      'fetch_webpage',
      // 翻译提交
      'add_translation_batch',
    ];

    const allTools = [
      ...this.getParagraphTools(bookId),
      ...this.getTerminologyTools(bookId),
      ...this.getCharacterSettingTools(bookId),
      ...this.getMemoryTools(bookId),
      ...this.getBookTools(bookId),
      ...this.getWebSearchTools(),
      ...this.getTranslationToolsForAI(),
    ];

    return allTools.filter((tool) => allowedToolNames.includes(tool.function.name));
  }

  /**
   * 获取翻译服务允许的工具
   * 排除翻译管理工具和导航/列表工具，让AI专注于当前文本块
   */
  static getTranslationTools(
    bookId?: string,
    options?: { excludeAskUser?: boolean; enableOriginalTextValidation?: boolean },
  ): AITool[] {
    const toolOptions: CreateTranslationToolsOptions | undefined =
      options?.enableOriginalTextValidation !== undefined
        ? { enableOriginalTextValidation: options.enableOriginalTextValidation }
        : undefined;
    const allTools = this.getToolsExcludingTranslationManagement(bookId, toolOptions);
    let tools = this.filterTools(allTools, NAVIGATION_AND_LIST_TOOLS);
    tools = this.filterTools(tools, TODO_MUTATION_TOOLS);

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
      ...createTranslationTools(),
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
    paragraphIds?: string[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    aiProcessingStore?: any,
    aiModelId?: string,
    chunkIndex?: number,
    submittedParagraphIds?: Set<string>,
    accumulatedParagraphs?: Map<string, string>,
    enableOriginalTextValidation?: boolean,
  ): Promise<AIToolCallResult> {
    const functionName = toolCall.function.name;
    const tool = this.getAllToolDefinitions().find(
      (t) => t.definition.function.name === functionName,
    );

    if (!tool) {
      return buildUnknownToolResult(toolCall);
    }

    // truthy 的可选参数统一拷贝进 options（数据驱动，避免逐字段写三元）
    const options: HandleToolCallOptions = { bookId };
    const optionalTruthy: Record<string, unknown> = {
      onAction,
      onToast,
      taskId,
      sessionId,
      paragraphIds,
      aiProcessingStore,
      aiModelId,
      submittedParagraphIds,
      accumulatedParagraphs,
    };
    for (const key of Object.keys(optionalTruthy)) {
      const value = optionalTruthy[key];
      if (value) {
        (options as unknown as Record<string, unknown>)[key] = value;
      }
    }
    if (chunkIndex !== undefined) options.chunkIndex = chunkIndex;
    if (enableOriginalTextValidation !== undefined) {
      options.enableOriginalTextValidation = enableOriginalTextValidation;
    }

    try {
      return await invokeToolHandler(tool, toolCall, options);
    } catch (error) {
      return buildErrorToolResult(toolCall, error);
    }
  }
}
