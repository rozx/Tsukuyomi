import type { AIModel } from 'src/services/ai/types/ai-model';
import type {
  AIServiceConfig,
  TextGenerationRequest,
  TextGenerationStreamCallback,
  ChatMessage,
  AIToolCall,
} from 'src/services/ai/types/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { AIServiceFactory } from '../index';
import { ToolRegistry, type ActionInfo } from '../tools';
import { useContextStore } from 'src/stores/context';

/**
 * Assistant 服务选项
 */
export interface AssistantServiceOptions {
  /**
   * 流式数据回调函数，用于接收对话过程中的数据块
   */
  onChunk?: TextGenerationStreamCallback;
  /**
   * AI 执行操作时的回调（如 CRUD 术语/角色）
   */
  onAction?: (action: ActionInfo) => void;
  /**
   * 取消信号（可选）
   */
  signal?: AbortSignal;
  /**
   * AI 处理 Store（可选），如果提供，将自动创建和管理任务
   */
  aiProcessingStore?: {
    addTask: (task: Omit<AIProcessingTask, 'id' | 'startTime'>) => Promise<string>;
    updateTask: (id: string, updates: Partial<AIProcessingTask>) => Promise<void>;
    appendThinkingMessage: (id: string, text: string) => Promise<void>;
    removeTask: (id: string) => Promise<void>;
    activeTasks: AIProcessingTask[]; // 用于获取任务的 abortController
  };
  /**
   * 会话总结（可选），如果提供，将添加到系统提示词中
   */
  sessionSummary?: string;
  /**
   * 对话历史（可选），如果提供，将作为初始对话历史，实现连续对话
   */
  messageHistory?: ChatMessage[];
}

/**
 * Assistant 对话结果
 */
export interface AssistantResult {
  text: string;
  taskId?: string;
  actions?: ActionInfo[];
  /**
   * 更新后的对话历史（包含本次对话的所有消息）
   */
  messageHistory?: ChatMessage[];
  /**
   * 是否需要重置会话（当达到 token 限制或发生错误时）
   */
  needsReset?: boolean;
  /**
   * 会话总结（当需要重置时提供）
   */
  summary?: string;
}

/**
 * Assistant 服务
 * 提供智能助手功能，可以使用所有可用的 AI 工具，并基于用户当前上下文提供帮助
 */
export class AssistantService {
  /**
   * 构建系统提示词
   * 包含用户当前上下文信息
   */
  private static buildSystemPrompt(context: {
    currentBookId: string | null;
    currentChapterId: string | null;
    hoveredParagraphId: string | null;
  }): string {
    let prompt = `你是 Luna AI Assistant，专业的日语小说翻译助手。帮助用户进行翻译工作，管理术语、角色设定，并回答一般性问题。

## 能力范围
- 翻译相关：术语管理、角色设定、翻译建议
- 知识问答：使用内置知识库回答历史、科学、技术、文学、语言、文化等问题
- 实时信息：使用 search_web 获取最新信息（当前事件、实时数据等）

## 工具使用规则

### 术语管理（7个工具）
- **create_term**: 创建术语（创建前用 list_terms/search_terms_by_keyword 检查是否已存在）
- **get_term**: 获取术语（需完整名称，否则用 search_terms_by_keyword）
- **update_term**: 更新术语
- **delete_term**: 删除术语
- **list_terms**: 列出所有术语
- **search_terms_by_keyword**: 关键词搜索（支持 translationOnly 参数）
- **get_occurrences_by_keywords**: 统计关键词出现次数

### 角色管理（6个工具）
- **create_character**: 创建角色（创建前检查是否已存在或应为别名，如是别名则用 update_character 添加）
- **get_character**: 获取角色（需完整名称，否则用 search_characters_by_keyword）
- **update_character**: 更新角色（发现问题必须修复；更新别名时只包含该角色的别名）
- **delete_character**: 删除角色
- **search_characters_by_keyword**: 关键词搜索（支持 translationOnly 参数）
- **list_characters**: 列出所有角色

### 内容管理（10个工具）
- **get_book_info**: 获取书籍信息
- **list_chapters**: 列出章节（查看所有章节时先调用此工具）
- **get_chapter_info**: 获取章节详情
- **get_paragraph_info**: 获取段落信息（包括所有翻译版本）
- **get_previous_paragraphs**: 获取前文段落
- **get_next_paragraphs**: 获取后文段落
- **find_paragraph_by_keyword**: 关键词查找段落（支持 only_with_translation 参数）
- **get_translation_history**: 获取段落的完整翻译历史（包括所有翻译版本及其AI模型信息）
- **update_translation**: 更新段落中指定翻译版本的内容（用于编辑和修正翻译历史）
- **select_translation**: 选择段落中的某个翻译版本作为当前选中的翻译（用于在翻译历史中切换不同的翻译版本）

### 网络搜索（2个工具）
- **search_web**: 搜索最新信息
  - ⚠️ **禁止**用于修复本地数据（角色/术语格式问题）
  - 仅用于需要外部知识的问题（历史事实、最新技术、实时数据等）
  - **必须使用搜索结果**：返回 results 时必须从 title/snippet 提取信息回答，不要忽略
- **fetch_webpage**: 直接访问指定网页
  - 当用户提供了具体的网页 URL 或需要查看特定网页的详细内容时使用
  - 提取网页的标题和主要内容文本供分析
  - **必须使用返回内容**：仔细阅读返回的 text 内容，从中提取关键信息回答用户问题

## 关键原则
1. **发现问题必须修复**：识别到数据问题（格式错误、翻译错误等）时，必须使用 update_* 工具修复，不要只告知问题
2. **修复工作流程**：
   - 角色问题：get_character/search_characters_by_keyword → update_character（不要用 search_web）
   - 术语问题：get_term/search_terms_by_keyword → update_term（不要用 search_web）
   - 翻译问题：get_paragraph_info/get_translation_history → update_translation（用于编辑翻译历史中的翻译版本）
3. **搜索优先**：部分名称/翻译时优先用 search_*_by_keyword，完整名称时用 get_*
4. **创建前检查**：创建术语/角色前必须检查是否已存在
5. **翻译历史管理**：
   - 使用 get_translation_history 查看段落的完整翻译历史
   - 使用 update_translation 编辑和修正翻译历史中的某个翻译版本
   - 使用 select_translation 选择段落中的某个翻译版本作为当前选中的翻译
   - 翻译历史最多保留5个版本，最新的在最后

`;

    // 添加上下文信息
    if (context.currentBookId || context.currentChapterId || context.hoveredParagraphId) {
      prompt += `## 当前工作上下文\n\n`;
      if (context.currentBookId) {
        prompt += `- 书籍 ID: \`${context.currentBookId}\` → 使用 get_book_info 获取详情\n`;
      }
      if (context.currentChapterId) {
        prompt += `- 章节 ID: \`${context.currentChapterId}\` → 使用 get_chapter_info 获取详情\n`;
        prompt += `- 使用 list_chapters 查看所有章节\n`;
      } else if (context.currentBookId) {
        prompt += `- 使用 list_chapters 查看所有章节\n`;
      }
      if (context.hoveredParagraphId) {
        prompt += `- 段落 ID: \`${context.hoveredParagraphId}\` → 使用 get_paragraph_info 获取详情\n`;
      }
      prompt += `\n询问上下文相关问题时，先使用工具获取信息再回答。\n\n`;
    }

    prompt += `## 使用指南
- 回答用户关于书籍、章节、段落、术语、角色的任何问题
- 提供翻译建议、术语建议、角色名称建议
- 使用简体中文，友好专业地交流
- 目标是帮助用户更高效、准确地完成翻译工作`;

    return prompt;
  }

  /**
   * 估算消息历史的 token 数
   * 使用保守估算：每个字符 2 tokens（对于日文和中文）
   */
  private static estimateTokenCount(messages: ChatMessage[]): number {
    if (!messages || messages.length === 0) return 0;
    const totalContent = messages
      .map((msg) => {
        if (msg.content) {
          return msg.content;
        }
        // 如果有 tool_calls，估算其 token 数
        if ('tool_calls' in msg && msg.tool_calls) {
          return JSON.stringify(msg.tool_calls);
        }
        return '';
      })
      .join('\n');
    // 保守估算：每个字符 2 tokens（对于日文和中文）
    return Math.ceil(totalContent.length * 2);
  }

  /**
   * 检查错误是否是 token 限制相关的错误
   */
  private static isTokenLimitError(error: unknown): boolean {
    if (!error) return false;
    let errorMessage = '';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = String(error.message);
    } else {
      errorMessage = JSON.stringify(error);
    }
    const lowerMessage = errorMessage.toLowerCase();
    // 检查常见的 token 限制错误关键词
    return (
      lowerMessage.includes('token') &&
      (lowerMessage.includes('limit') ||
        lowerMessage.includes('exceed') ||
        lowerMessage.includes('maximum') ||
        lowerMessage.includes('too long') ||
        lowerMessage.includes('context length'))
    );
  }

  /**
   * 总结会话历史
   * @param model AI 模型
   * @param messages 要总结的消息列表
   * @param options 选项
   */
  static async summarizeSession(
    model: AIModel,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    options: {
      signal?: AbortSignal;
      onChunk?: TextGenerationStreamCallback;
    } = {},
  ): Promise<string> {
    const { signal, onChunk } = options;

    // 构建总结提示词
    const summaryPrompt = `请总结以下对话历史，提取关键信息和上下文。总结应该简洁明了，包含：
1. 对话的主要话题和讨论内容
2. 用户的主要需求和问题
3. 已解决或讨论的重要事项
4. 需要继续关注的内容

对话历史：
${messages
  .map((msg, idx) => {
    const role = msg.role === 'user' ? '用户' : '助手';
    return `[${idx + 1}] ${role}: ${msg.content}`;
  })
  .join('\n\n')}

请用简洁的中文总结以上对话：`;

    // 获取 AI 服务
    const aiService = AIServiceFactory.getService(model.provider);

    // 构建配置
    const config: AIServiceConfig = {
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      model: model.model,
      temperature: 0.3, // 使用较低温度以获得更准确的总结
      maxTokens: model.maxTokens,
      signal,
    };

    // 构建请求
    const request: TextGenerationRequest = {
      messages: [
        {
          role: 'system',
          content: '你是一个专业的对话总结助手，擅长提取对话中的关键信息和上下文。',
        },
        {
          role: 'user',
          content: summaryPrompt,
        },
      ],
      temperature: 0.3,
      maxTokens: model.maxTokens,
    };

    // 生成总结
    let fullText = '';
    const result = await aiService.generateText(config, request, async (chunk) => {
      if (chunk.text) {
        fullText += chunk.text;
      }
      if (onChunk) {
        await onChunk(chunk);
      }
    });

    return result.text || fullText;
  }

  /**
   * 处理工具调用
   */
  private static async handleToolCalls(
    toolCalls: AIToolCall[],
    bookId: string | null,
    onAction?: (action: ActionInfo) => void,
  ): Promise<Array<{ tool_call_id: string; role: 'tool'; name: string; content: string }>> {
    // 定义需要 bookId 的工具列表
    const toolsRequiringBookId = [
      'create_term',
      'get_term',
      'update_term',
      'delete_term',
      'list_terms',
      'search_terms_by_keyword',
      'get_occurrences_by_keywords',
      'create_character',
      'get_character',
      'update_character',
      'delete_character',
      'search_characters_by_keyword',
      'list_characters',
      'get_book_info',
      'list_chapters',
      'get_chapter_info',
      'get_paragraph_info',
      'get_previous_paragraphs',
      'get_next_paragraphs',
      'find_paragraph_by_keyword',
    ];

    const results = [];
    for (const toolCall of toolCalls) {
      // 检查工具是否需要 bookId
      if (toolsRequiringBookId.includes(toolCall.function.name) && !bookId) {
        results.push({
          tool_call_id: toolCall.id,
          role: 'tool' as const,
          name: toolCall.function.name,
          content: JSON.stringify({
            success: false,
            error: '没有当前书籍上下文，无法执行此工具操作',
          }),
        });
        continue;
      }

      // 调用工具处理函数（对于不需要 bookId 的工具，可以传递空字符串）
      const result = await ToolRegistry.handleToolCall(toolCall, bookId || '', onAction);
      results.push(result);
    }
    return results;
  }

  /**
   * 与助手对话
   * @param model AI 模型
   * @param userMessage 用户消息
   * @param options 选项
   */
  static async chat(
    model: AIModel,
    userMessage: string,
    options: AssistantServiceOptions = {},
  ): Promise<AssistantResult> {
    const { onChunk, onAction, signal, aiProcessingStore } = options;

    // 获取 stores
    const contextStore = useContextStore();

    // 获取上下文（只使用 ID）
    const context = contextStore.getContext;

    // 构建系统提示词（只传递 ID）
    let systemPrompt = this.buildSystemPrompt(context);

    // 如果当前会话有总结，添加到系统提示词中
    // 注意：这里需要在调用时传入会话信息，因为 store 不能在静态方法中直接使用
    // 我们通过 options 传递总结信息
    if (options.sessionSummary) {
      systemPrompt += `\n\n## 之前的对话总结\n\n${options.sessionSummary}\n\n**注意**：以上是之前对话的总结。当前对话从总结后的内容继续。`;
    }

    // 获取可用的工具（包括网络搜索工具，即使没有 bookId 也可以使用）
    const tools = ToolRegistry.getAllTools(context.currentBookId || undefined);

    // 创建任务（如果提供了 store）
    let taskId: string | undefined;
    let taskAbortSignal: AbortSignal | undefined;
    if (aiProcessingStore) {
      taskId = await aiProcessingStore.addTask({
        type: 'assistant',
        modelName: model.name || model.id,
        status: 'processing',
        message: '正在处理助手请求...',
      });

      // 获取任务的 abortController signal（用于停止按钮）
      // 注意：这里需要从 store 中获取任务，因为 addTask 返回的是 id
      // 但任务对象（包含 abortController）在 store 的 activeTasks 中
      // 由于 addTask 是异步的，我们需要等待一下或者直接从 store 中查找
      // 实际上，addTask 会立即将任务添加到 activeTasks，所以我们可以直接查找
      const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
      if (task?.abortController) {
        taskAbortSignal = task.abortController.signal;
      }
    }

    // 合并 signal：优先使用传入的 signal，如果没有则使用任务的 signal
    const finalSignal = signal || taskAbortSignal;

    try {
      // 构建消息列表
      // 如果提供了历史消息，使用它（但需要确保系统提示词在开头）
      // 如果没有提供，创建新的历史
      const messages: ChatMessage[] = options.messageHistory
        ? [...options.messageHistory]
        : [
            {
              role: 'system',
              content: systemPrompt,
            },
          ];

      // 如果使用了历史消息，需要检查系统提示词是否已存在
      // 如果不存在或已更改，更新系统提示词
      const hasSystemMessage = messages.some((msg) => msg.role === 'system');
      if (hasSystemMessage) {
        // 更新系统提示词（如果已存在）
        const systemIndex = messages.findIndex((msg) => msg.role === 'system');
        if (systemIndex >= 0) {
          messages[systemIndex] = {
            role: 'system',
            content: systemPrompt,
          };
        }
      } else {
        // 如果没有系统消息，在开头添加
        messages.unshift({
          role: 'system',
          content: systemPrompt,
        });
      }

      // 添加用户消息
      messages.push({
        role: 'user',
        content: userMessage,
      });

      // 检查 token 限制（在发送请求前）
      // 如果模型有 maxTokens 限制（不是 UNLIMITED_TOKENS），检查是否接近或超过限制
      const estimatedTokens = this.estimateTokenCount(messages);
      const TOKEN_THRESHOLD_RATIO = 0.85; // 当达到 85% 时触发总结
      const shouldSummarizeBeforeRequest =
        model.maxTokens > 0 && estimatedTokens >= model.maxTokens * TOKEN_THRESHOLD_RATIO;

      if (
        shouldSummarizeBeforeRequest &&
        options.messageHistory &&
        options.messageHistory.length > 2
      ) {
        // 需要总结并重置
        // 构建要总结的消息（排除系统消息和当前用户消息）
        const messagesToSummarize = options.messageHistory
          .filter((msg) => msg.role !== 'system')
          .slice(0, -1) // 排除最后一条（当前用户消息）
          .map((msg) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content || '',
          }));

        if (messagesToSummarize.length > 0) {
          // 调用总结功能
          const summaryOptions: {
            signal?: AbortSignal;
            onChunk?: TextGenerationStreamCallback;
          } = {};
          if (finalSignal) {
            summaryOptions.signal = finalSignal;
          }
          summaryOptions.onChunk = (chunk) => {
            // 更新任务状态显示总结进度
            if (aiProcessingStore && taskId && chunk.text) {
              void aiProcessingStore.updateTask(taskId, {
                message: `正在总结会话历史... ${chunk.text.slice(0, 50)}`,
              });
            }
            if (onChunk) {
              void onChunk(chunk);
            }
          };
          const summary = await this.summarizeSession(model, messagesToSummarize, summaryOptions);

          // 返回特殊结果，指示需要重置
          return {
            text: '',
            ...(taskId ? { taskId: taskId } : {}),
            actions: [],
            messageHistory: [
              {
                role: 'system',
                content: systemPrompt,
              },
              {
                role: 'user',
                content: userMessage,
              },
            ],
            needsReset: true,
            summary,
          } as AssistantResult & { needsReset: true; summary: string };
        }
      }

      // 获取 AI 服务
      const aiService = AIServiceFactory.getService(model.provider);

      // 构建配置
      const config: AIServiceConfig = {
        apiKey: model.apiKey,
        baseUrl: model.baseUrl,
        model: model.model, // 使用实际的模型名称，而不是内部 ID
        temperature: model.temperature ?? 0.7,
        maxTokens: model.maxTokens,
        signal: finalSignal,
      };

      // 构建请求
      const request: TextGenerationRequest = {
        messages,
        ...(tools.length > 0 ? { tools } : {}),
        temperature: model.temperature ?? 0.7,
        maxTokens: model.maxTokens,
      };

      // 流式生成响应
      let fullText = '';
      let toolCalls: AIToolCall[] = [];
      const allActions: ActionInfo[] = [];

      const result = await aiService.generateText(config, request, async (chunk) => {
        // 累积流式文本
        if (chunk.text) {
          fullText += chunk.text;
        }
        if (chunk.toolCalls) {
          toolCalls.push(...chunk.toolCalls);
        }

        // 更新任务状态（保存思考过程）
        if (aiProcessingStore && taskId && chunk.text) {
          await aiProcessingStore.appendThinkingMessage(taskId, chunk.text);
        }

        // 调用用户回调
        if (onChunk) {
          await onChunk(chunk);
        }
      });

      // 使用 result.text 如果存在且不为空，否则使用累积的 fullText
      // 注意：如果 result.text 和累积的 fullText 不一致，需要补充保存缺失的部分
      if (result.text && result.text.trim()) {
        // 如果 result.text 比累积的 fullText 更长，说明有缺失的部分，需要补充保存
        if (result.text.length > fullText.length) {
          const missingText = result.text.slice(fullText.length);
          if (aiProcessingStore && taskId && missingText) {
            await aiProcessingStore.appendThinkingMessage(taskId, missingText);
          }
        }
        fullText = result.text;
      }

      if (result.toolCalls) {
        toolCalls = result.toolCalls;
      }

      // 只有在没有工具调用且没有文本时才警告
      if (!fullText.trim() && toolCalls.length === 0) {
        console.warn('[AssistantService] 警告：响应文本和工具调用都为空', {
          resultTextLength: result.text?.length || 0,
          accumulatedLength: fullText.length,
        });
      }

      // 处理工具调用 - 使用循环处理，像 translation-service.ts 一样
      let currentTurnCount = 0;
      const MAX_TURNS = 50; // 最大工具调用轮数
      let finalResponseText = fullText;

      // 将第一次响应添加到历史
      // OpenAI API 要求：如果有 tool_calls，content 可以是 null；如果没有 tool_calls，content 必须有内容
      if (toolCalls.length > 0) {
        // 有工具调用，content 可以是 null
        messages.push({
          role: 'assistant',
          content: fullText || null,
          tool_calls: toolCalls,
        });
      } else if (fullText && fullText.trim()) {
        // 没有工具调用，但 content 有内容
        messages.push({
          role: 'assistant',
          content: fullText,
        });
      }

      // 工具调用循环
      while (toolCalls.length > 0 && currentTurnCount < MAX_TURNS) {
        currentTurnCount++;

        // 执行工具调用
        const toolResults = await this.handleToolCalls(
          toolCalls,
          context.currentBookId,
          (action) => {
            allActions.push(action);
            if (onAction) {
              onAction(action);
            }
          },
        );

        // 将工具结果添加到历史
        messages.push(...toolResults);

        // 检查 AI 的响应中是否提到了要修复/更新/修正等操作
        const needsFixKeywords = [
          '修复',
          '更新',
          '修正',
          '修改',
          '更改',
          '调整',
          '纠正',
          '将其',
          '将其更新',
          '将其修正',
          '将其修复',
        ];
        const mentionedFix = needsFixKeywords.some((keyword) =>
          (finalResponseText || fullText).includes(keyword),
        );

        // 检查工具调用中是否只包含了查询工具，而没有更新工具
        const queryOnlyTools = [
          'get_character',
          'get_term',
          'list_characters',
          'list_terms',
          'search_characters_by_keyword',
          'search_terms_by_keyword',
          'get_book_info',
          'get_chapter_info',
          'get_paragraph_info',
          'get_previous_paragraphs',
          'get_next_paragraphs',
          'find_paragraph_by_keyword',
          'get_occurrences_by_keywords',
        ];
        const hasUpdateTool = toolCalls.some((tc) => !queryOnlyTools.includes(tc.function.name));

        // 检查是否错误地使用了 search_web 来修复本地数据
        const hasWebSearch = toolCalls.some((tc) => tc.function.name === 'search_web');
        const shouldUseLocalTools =
          mentionedFix &&
          (fullText.includes('角色') || fullText.includes('术语') || fullText.includes('格式'));

        // 如果 AI 提到了要修复，但只调用了查询工具，添加提示
        if (mentionedFix && !hasUpdateTool) {
          let reminderContent = '';

          if (hasWebSearch && shouldUseLocalTools) {
            reminderContent =
              '⚠️ 重要错误：你刚才在响应中提到要修复/更新/修正角色或术语信息格式问题，但错误地使用了 search_web 工具来搜索网络。这是不对的！\n\n' +
              '对于修复本地数据（角色信息、术语信息）的格式问题，你应该：\n' +
              '1. 使用 get_character 或 search_characters_by_keyword 工具获取角色信息（如果是角色问题）\n' +
              '2. 使用 get_term 或 search_terms_by_keyword 工具获取术语信息（如果是术语问题）\n' +
              '3. 然后使用 update_character 或 update_term 工具直接修复格式问题\n\n' +
              'search_web 工具只应用于需要外部知识的问题，不应用于修复本地数据格式。请立即使用正确的工具（get_character + update_character 或 get_term + update_term）来完成修复。';
          } else {
            reminderContent =
              '⚠️ 重要：你刚才在响应中提到要修复/更新/修正问题（例如："让我将其更新"、"我来修正"等），但只调用了查询工具来查看信息。现在你必须使用相应的更新工具（如 update_character、update_term 等）来实际执行修复操作，而不是仅仅告诉用户问题所在。请立即调用更新工具来完成修复。';
          }

          if (reminderContent) {
            messages.push({
              role: 'user',
              content: reminderContent,
            });
          }
        }

        // 再次调用 AI 获取回复
        const followUpRequest: TextGenerationRequest = {
          messages,
          ...(tools.length > 0 ? { tools } : {}),
          temperature: model.temperature ?? 0.7,
          maxTokens: model.maxTokens,
        };

        let followUpText = '';
        toolCalls = []; // 重置工具调用列表

        const followUpResult = await aiService.generateText(
          config,
          followUpRequest,
          async (chunk) => {
            if (chunk.text) {
              followUpText += chunk.text;
            }
            if (chunk.toolCalls) {
              toolCalls.push(...chunk.toolCalls);
            }

            // 更新任务状态（保存思考过程）
            if (aiProcessingStore && taskId && chunk.text) {
              await aiProcessingStore.appendThinkingMessage(taskId, chunk.text);
            }

            // 调用用户回调
            if (onChunk) {
              await onChunk(chunk);
            }
          },
        );

        // 使用 result.text 如果存在，否则使用累积的文本
        // 注意：如果 followUpResult.text 和累积的 followUpText 不一致，需要补充保存缺失的部分
        if (followUpResult.text && followUpResult.text.trim()) {
          // 如果 followUpResult.text 比累积的 followUpText 更长，说明有缺失的部分，需要补充保存
          if (followUpResult.text.length > followUpText.length) {
            const missingText = followUpResult.text.slice(followUpText.length);
            if (aiProcessingStore && taskId && missingText) {
              await aiProcessingStore.appendThinkingMessage(taskId, missingText);
            }
          }
          followUpText = followUpResult.text;
        }

        if (followUpResult.toolCalls) {
          toolCalls = followUpResult.toolCalls;
        }

        // 更新最终响应文本（只有在有内容时才更新）
        if (followUpText && followUpText.trim()) {
          finalResponseText = followUpText;
        }

        // 将助手回复添加到历史
        // OpenAI API 要求：如果有 tool_calls，content 可以是 null；如果没有 tool_calls，content 必须有内容
        if (toolCalls.length > 0) {
          // 有工具调用，content 可以是 null
          messages.push({
            role: 'assistant',
            content: followUpText || null,
            tool_calls: toolCalls,
          });
        } else if (followUpText && followUpText.trim()) {
          // 没有工具调用，但 content 有内容
          messages.push({
            role: 'assistant',
            content: followUpText,
          });
        }

        // 如果没有工具调用，退出循环
        if (toolCalls.length === 0) {
          break;
        }
      }

      // 更新任务状态
      if (aiProcessingStore && taskId) {
        await aiProcessingStore.updateTask(taskId, {
          status: 'completed',
          message: '助手回复完成',
        });
      }

      // 如果没有工具调用，将助手回复添加到历史（如果还没有添加）
      // 确保 content 不为空
      if (toolCalls.length === 0 && finalResponseText && finalResponseText.trim()) {
        // 检查是否已经添加了相同的消息
        const lastAssistantMsg = messages.filter((msg) => msg.role === 'assistant').pop();
        if (!lastAssistantMsg || lastAssistantMsg.content !== finalResponseText) {
          messages.push({
            role: 'assistant',
            content: finalResponseText,
          });
        }
      }

      // 注意：任务状态已在循环退出后更新（第 766-772 行），此处不再重复更新

      // 确保返回的文本不为空
      const finalText = finalResponseText.trim() || '抱歉，我没有收到有效的回复。请重试。';

      if (!finalResponseText.trim()) {
        console.error('[AssistantService] ❌ 错误：最终回复文本为空', {
          currentTurnCount,
        });
      }

      return {
        text: finalText,
        ...(taskId ? { taskId: taskId } : {}),
        actions: allActions,
        messageHistory: messages,
      };
    } catch (error) {
      console.error('[AssistantService] ❌ 发生错误', {
        error: error instanceof Error ? error.message : String(error),
        ...(import.meta.env.DEV && {
          errorStack: error instanceof Error ? error.stack : undefined,
        }),
        model: model.model,
        provider: model.provider,
        taskId,
      });

      // 检查是否是 token 限制错误，如果是，尝试总结并重置
      if (
        this.isTokenLimitError(error) &&
        options.messageHistory &&
        options.messageHistory.length > 2
      ) {
        try {
          // 更新任务状态
          if (aiProcessingStore && taskId) {
            await aiProcessingStore.updateTask(taskId, {
              status: 'processing',
              message: '检测到 token 限制错误，正在总结会话历史...',
            });
          }

          // 构建要总结的消息（排除系统消息）
          const messagesToSummarize = options.messageHistory
            .filter((msg) => msg.role !== 'system')
            .map((msg) => ({
              role: msg.role as 'user' | 'assistant',
              content: msg.content || '',
            }));

          if (messagesToSummarize.length > 0) {
            // 调用总结功能
            const summaryOptions: {
              signal?: AbortSignal;
              onChunk?: TextGenerationStreamCallback;
            } = {};
            if (finalSignal) {
              summaryOptions.signal = finalSignal;
            }
            summaryOptions.onChunk = (chunk) => {
              // 更新任务状态显示总结进度
              if (aiProcessingStore && taskId && chunk.text) {
                void aiProcessingStore.updateTask(taskId, {
                  message: `正在总结会话历史... ${chunk.text.slice(0, 50)}`,
                });
              }
              if (onChunk) {
                void onChunk(chunk);
              }
            };
            const summary = await this.summarizeSession(model, messagesToSummarize, summaryOptions);

            // 更新任务状态
            if (aiProcessingStore && taskId) {
              await aiProcessingStore.updateTask(taskId, {
                status: 'completed',
                message: '会话已总结并重置',
              });
            }

            // 返回特殊结果，指示需要重置
            return {
              text: '',
              ...(taskId ? { taskId: taskId } : {}),
              actions: [],
              messageHistory: [
                {
                  role: 'system',
                  content: systemPrompt,
                },
                {
                  role: 'user',
                  content: userMessage,
                },
              ],
              needsReset: true,
              summary,
            } as AssistantResult & { needsReset: true; summary: string };
          }
        } catch (summaryError) {
          console.error('[AssistantService] ❌ 总结会话失败', summaryError);
          // 如果总结失败，继续抛出原始错误
        }
      }

      // 更新任务状态
      if (aiProcessingStore && taskId) {
        await aiProcessingStore.updateTask(taskId, {
          status: 'error',
          message: error instanceof Error ? error.message : '未知错误',
        });
      }

      throw error;
    }
  }
}
