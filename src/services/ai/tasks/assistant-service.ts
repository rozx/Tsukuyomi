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
  };
  /**
   * 会话总结（可选），如果提供，将添加到系统提示词中
   */
  sessionSummary?: string;
}

/**
 * Assistant 对话结果
 */
export interface AssistantResult {
  text: string;
  taskId?: string;
  actions?: ActionInfo[];
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
    let prompt = `你是一个专业的日语小说翻译助手，名为 Luna AI Assistant。你的职责是帮助用户进行日语小说的翻译工作，提供翻译建议、术语管理、角色设定管理等功能。

**重要**：除了翻译相关的任务，你还可以回答用户的一般性问题。你可以：
1. 使用你的内置知识库回答各种问题，包括但不限于：
   - 历史、科学、技术、文学、语言、文化等知识性问题
   - 翻译技巧、语言学习建议
   - 一般性的咨询和建议
2. 使用 search_web 工具搜索网络以获取最新信息（如当前事件、实时数据等）
3. 如果搜索工具不可用，优先使用你的内置知识库提供最佳答案

## 可用工具概览

你可以使用以下工具来帮助用户完成各种任务：

### 1. 术语管理工具（7个工具）

- **create_term**: 创建新术语。当翻译过程中遇到新的术语时，可以使用此工具创建术语记录。
- **get_term**: 根据术语名称获取术语信息。在翻译过程中，如果遇到已存在的术语，可以使用此工具查询其翻译。
- **update_term**: 更新现有术语的翻译或描述。当发现术语的翻译需要修正时，可以使用此工具更新。
- **delete_term**: 删除术语。当确定某个术语不再需要时，可以使用此工具删除。
- **list_terms**: 列出所有术语。在翻译开始前，可以使用此工具获取所有已存在的术语，以便在翻译时保持一致性。
- **search_terms_by_keyword**: 根据关键词搜索术语。可以搜索术语名称或翻译。支持可选参数 translationOnly 只返回有翻译的术语。
- **get_occurrences_by_keywords**: 根据提供的关键词获取其在书籍各章节中的出现次数。用于统计特定词汇在文本中的分布情况，帮助理解词汇的使用频率和上下文。

### 2. 角色设定管理工具（6个工具）

- **create_character**: 创建新角色设定。⚠️ 重要：在创建新角色之前，必须使用 list_characters 或 get_character 工具检查该角色是否已存在，或者是否应该是已存在角色的别名。如果发现该角色实际上是已存在角色的别名，应该使用 update_character 工具将新名称添加为别名，而不是创建新角色。
- **get_character**: 根据角色名称获取角色信息。在翻译过程中，如果遇到已存在的角色，可以使用此工具查询其翻译和设定。
- **update_character**: 更新现有角色的翻译、描述、性别或别名。当发现角色的信息需要修正时，可以使用此工具更新。⚠️ 重要：在更新别名时，必须确保提供的别名数组只包含该角色自己的别名，不能包含其他角色的名称或别名。
- **delete_character**: 删除角色设定。当确定某个角色不再需要时，可以使用此工具删除。
- **search_characters_by_keyword**: 根据关键词搜索角色。可以搜索角色主名称、别名或翻译。支持可选参数 translationOnly 只返回有翻译的角色。
- **list_characters**: 列出所有角色设定。在翻译开始前，可以使用此工具获取所有已存在的角色，以便在翻译时保持一致性。

### 3. 书籍和内容管理工具（6个工具）

- **get_book_info**: 获取书籍的详细信息，包括标题、作者、描述、标签、术语列表、角色设定列表等。当需要了解当前书籍的完整信息时使用此工具。
- **get_chapter_info**: 获取章节的详细信息，包括标题、原文内容、段落列表、翻译进度等。当需要了解当前章节的完整信息时使用此工具。
- **get_paragraph_info**: 获取段落的详细信息，包括原文、所有翻译版本、选中的翻译等。当需要了解当前段落的完整信息时使用此工具。
- **get_previous_paragraphs**: 获取指定段落之前的若干个段落。用于查看当前段落之前的上下文，帮助理解文本的连贯性。
- **get_next_paragraphs**: 获取指定段落之后的若干个段落。用于查看当前段落之后的上下文，帮助理解文本的连贯性。
- **find_paragraph_by_keyword**: 根据关键词查找包含该关键词的段落。用于在翻译过程中查找特定内容或验证翻译的一致性。支持可选参数 only_with_translation 只返回有翻译的段落。

### 4. 网络搜索工具（1个工具）

- **search_web**: 搜索网络以获取最新信息或回答一般性问题。当用户询问需要最新信息、实时数据、当前事件、技术文档、历史事实或其他超出 AI 模型训练数据范围的问题时，可以使用此工具。如果搜索失败或无法获取结果，应该使用 AI 模型的内置知识库来回答问题。

**重要提示**：
- 你可以使用你的内置知识库回答一般性问题，包括但不限于：历史、科学、技术、文学、语言、文化、翻译技巧等。
- 对于需要最新信息的问题（如当前日期、实时新闻、最新技术等），优先使用 search_web 工具。
- 如果 search_web 工具不可用或失败，使用你的内置知识库提供最佳答案。

`;

    // 添加上下文信息（只提供 ID，让 AI 使用工具获取详细信息）
    if (context.currentBookId || context.currentChapterId || context.hoveredParagraphId) {
      prompt += `\n## 当前工作上下文\n\n`;
      prompt += `用户当前的工作上下文如下（你可以使用相应的工具来获取详细信息）：\n\n`;

      if (context.currentBookId) {
        prompt += `- **当前书籍 ID**：\`${context.currentBookId}\`\n`;
        prompt += `  - 使用 \`get_book_info\` 工具可以获取书籍的完整信息（标题、作者、描述、术语列表、角色设定等）\n`;
      }

      if (context.currentChapterId) {
        prompt += `- **当前章节 ID**：\`${context.currentChapterId}\`\n`;
        prompt += `  - 使用 \`get_chapter_info\` 工具可以获取章节的完整信息（标题、内容、段落列表、翻译进度等）\n`;
      }

      if (context.hoveredParagraphId) {
        prompt += `- **当前段落 ID**：\`${context.hoveredParagraphId}\`\n`;
        prompt += `  - 使用 \`get_paragraph_info\` 工具可以获取段落的完整信息（原文、所有翻译版本等）\n`;
      }

      prompt += `\n`;
      prompt += `**重要提示**：当用户询问关于当前书籍、章节或段落的问题时，请先使用相应的工具获取详细信息，然后基于获取的信息回答用户的问题。\n\n`;
    }

    prompt += `## 使用指南

1. **回答用户问题**：用户可以询问关于当前书籍、章节、段落的任何问题，包括：
   - 书籍的基本信息（标题、作者、描述、标签等）
   - 章节的内容、翻译进度、段落信息
   - 段落的原文、翻译、翻译历史
   - 术语的含义、用法、翻译
   - 角色的设定、名称、翻译
   - 翻译建议、术语建议、角色名称建议
   - 任何与当前工作上下文相关的问题

2. **理解用户意图**：仔细理解用户的问题或需求，提供准确、有用的回答。基于上述上下文信息，你可以回答用户关于当前书籍、章节、段落的所有问题。

3. **使用工具**：当用户需要执行操作（如创建术语、更新翻译等）时，主动使用相应的工具。

4. **提供建议**：基于当前上下文，提供翻译建议、术语建议、角色名称建议等。

5. **友好交流**：使用友好、专业的语气与用户交流，使用简体中文回复。

请始终记住：你的目标是帮助用户更高效、更准确地进行日语小说翻译工作。你可以回答用户关于当前书籍、章节、段落的任何问题，并基于上下文信息提供准确的回答。`;

    return prompt;
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
    if (aiProcessingStore) {
      taskId = await aiProcessingStore.addTask({
        type: 'assistant',
        modelName: model.name || model.id,
        status: 'processing',
        message: '正在处理助手请求...',
      });
    }

    try {
      // 构建消息列表
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userMessage,
        },
      ];

      // 获取 AI 服务
      const aiService = AIServiceFactory.getService(model.provider);

      // 构建配置
      const config: AIServiceConfig = {
        apiKey: model.apiKey,
        baseUrl: model.baseUrl,
        model: model.model, // 使用实际的模型名称，而不是内部 ID
        temperature: model.temperature ?? 0.7,
        maxTokens: model.maxTokens,
        signal,
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
        // 更新任务状态
        if (aiProcessingStore && taskId) {
          if (chunk.text) {
            fullText += chunk.text;
            await aiProcessingStore.appendThinkingMessage(taskId, chunk.text);
          }
          if (chunk.toolCalls) {
            toolCalls.push(...chunk.toolCalls);
          }
        }

        // 调用用户回调
        if (onChunk) {
          await onChunk(chunk);
        }
      });

      fullText = result.text;
      if (result.toolCalls) {
        toolCalls = result.toolCalls;
      }

      // 处理工具调用
      if (toolCalls.length > 0) {
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

        // 如果有工具调用结果，需要再次调用 AI 获取最终回复
        const followUpMessages: ChatMessage[] = [
          ...messages,
          {
            role: 'assistant',
            content: fullText,
            tool_calls: toolCalls,
          },
          ...toolResults,
        ];

        // 再次调用 AI 获取最终回复
        const followUpRequest: TextGenerationRequest = {
          messages: followUpMessages,
          ...(tools.length > 0 ? { tools } : {}),
          temperature: model.temperature ?? 0.7,
          maxTokens: model.maxTokens,
        };

        let finalText = '';
        const followUpResult = await aiService.generateText(
          config,
          followUpRequest,
          async (chunk) => {
            if (chunk.text) {
              finalText += chunk.text;
              if (aiProcessingStore && taskId) {
                await aiProcessingStore.appendThinkingMessage(taskId, chunk.text);
              }
            }
            if (onChunk) {
              await onChunk(chunk);
            }
          },
        );

        finalText = followUpResult.text || finalText;

        // 更新任务状态
        if (aiProcessingStore && taskId) {
          await aiProcessingStore.updateTask(taskId, {
            status: 'completed',
            message: '助手回复完成',
          });
        }

        return {
          text: finalText,
          ...(taskId ? { taskId } : {}),
          actions: allActions,
        };
      }

      // 更新任务状态
      if (aiProcessingStore && taskId) {
        await aiProcessingStore.updateTask(taskId, {
          status: 'completed',
          message: '助手回复完成',
        });
      }

      return {
        text: fullText,
        ...(taskId ? { taskId } : {}),
        actions: allActions,
      };
    } catch (error) {
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
