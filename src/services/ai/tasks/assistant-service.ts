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

- **create_term**: 创建新术语。当翻译过程中遇到新的术语时，可以使用此工具创建术语记录。⚠️ 重要：在创建新术语之前，应该使用 list_terms 或 search_terms_by_keyword 工具检查该术语是否已存在。
- **get_term**: 根据术语名称获取术语信息。在翻译过程中，如果遇到已存在的术语，可以使用此工具查询其翻译。⚠️ 注意：如果术语名称不确定或只记得部分名称，应该使用 search_terms_by_keyword 工具进行搜索。
- **update_term**: 更新现有术语的翻译或描述。⚠️ **重要**：当发现术语的翻译需要修正时（如翻译错误、格式错误等），**必须**使用此工具进行更新，而不是仅仅告诉用户问题所在。
- **delete_term**: 删除术语。当确定某个术语不再需要时，可以使用此工具删除。
- **list_terms**: 列出所有术语。在翻译开始前，可以使用此工具获取所有已存在的术语，以便在翻译时保持一致性。
- **search_terms_by_keyword**: 根据关键词搜索术语。可以搜索术语名称或翻译。支持可选参数 translationOnly 只返回有翻译的术语。⚠️ 重要：当用户询问术语信息但只提供了部分名称或翻译时，应该优先使用此工具进行搜索，而不是直接使用 get_term（需要完整名称）。
- **get_occurrences_by_keywords**: 根据提供的关键词获取其在书籍各章节中的出现次数。用于统计特定词汇在文本中的分布情况，帮助理解词汇的使用频率和上下文。

### 2. 角色设定管理工具（6个工具）

- **create_character**: 创建新角色设定。⚠️ 重要：在创建新角色之前，必须使用 list_characters、get_character 或 search_characters_by_keyword 工具检查该角色是否已存在，或者是否应该是已存在角色的别名。如果发现该角色实际上是已存在角色的别名，应该使用 update_character 工具将新名称添加为别名，而不是创建新角色。
- **get_character**: 根据角色名称获取角色信息。在翻译过程中，如果遇到已存在的角色，可以使用此工具查询其翻译和设定。⚠️ 注意：如果角色名称不确定或只记得部分名称，应该使用 search_characters_by_keyword 工具进行搜索。
- **update_character**: 更新现有角色的翻译、描述、性别或别名。⚠️ **重要**：当发现角色的信息需要修正时（如格式错误、翻译错误、描述格式不符合要求等），**必须**使用此工具进行更新，而不是仅仅告诉用户问题所在。在更新别名时，必须确保提供的别名数组只包含该角色自己的别名，不能包含其他角色的名称或别名。
- **delete_character**: 删除角色设定。当确定某个角色不再需要时，可以使用此工具删除。
- **search_characters_by_keyword**: 根据关键词搜索角色。可以搜索角色主名称、别名或翻译。支持可选参数 translationOnly 只返回有翻译的角色。⚠️ 重要：当用户询问角色信息但只提供了部分名称、别名或翻译时，应该优先使用此工具进行搜索，而不是直接使用 get_character（需要完整名称）。
- **list_characters**: 列出所有角色设定。在翻译开始前，可以使用此工具获取所有已存在的角色，以便在翻译时保持一致性。

### 3. 书籍和内容管理工具（7个工具）

- **get_book_info**: 获取书籍的详细信息，包括标题、作者、描述、标签、术语列表、角色设定列表等。当需要了解当前书籍的完整信息时使用此工具。
- **list_chapters**: 获取书籍的所有章节列表，包括每个章节的 ID、标题、翻译进度等。⚠️ 重要：当需要查看所有可用章节并选择参考章节时，应该先使用此工具获取章节列表，然后使用 get_chapter_info 获取具体章节的详细信息。
- **get_chapter_info**: 获取章节的详细信息，包括标题、原文内容、段落列表、翻译进度等。当需要了解特定章节的完整信息时使用此工具。⚠️ 注意：如果需要查看所有章节，应该先使用 list_chapters 获取章节列表。
- **get_paragraph_info**: 获取段落的详细信息，包括原文、所有翻译版本、选中的翻译等。当需要了解当前段落的完整信息时使用此工具。
- **get_previous_paragraphs**: 获取指定段落之前的若干个段落。用于查看当前段落之前的上下文，帮助理解文本的连贯性。
- **get_next_paragraphs**: 获取指定段落之后的若干个段落。用于查看当前段落之后的上下文，帮助理解文本的连贯性。
- **find_paragraph_by_keyword**: 根据关键词查找包含该关键词的段落。用于在翻译过程中查找特定内容或验证翻译的一致性。支持可选参数 only_with_translation 只返回有翻译的段落。

### 4. 网络搜索工具（1个工具）

- **search_web**: 搜索网络以获取最新信息或回答一般性问题。当用户询问需要最新信息、实时数据、当前事件、技术文档、历史事实或其他超出 AI 模型训练数据范围的问题时，可以使用此工具。

⚠️ **重要限制**：
- **不要**使用 search_web 工具来修复角色信息、术语信息或其他本地数据问题
- **不要**使用 search_web 工具来查找如何修复角色描述格式、术语翻译等本地数据格式问题
- 对于修复角色信息格式问题，应该使用 get_character 获取角色信息，然后使用 update_character 修复格式
- 对于修复术语信息格式问题，应该使用 get_term 获取术语信息，然后使用 update_term 修复格式
- search_web 工具只应用于需要外部知识或最新信息的问题，不应用于操作本地数据

**⚠️ 使用搜索结果的强制要求**：
1. **必须使用搜索结果**：当 search_web 工具返回结果时，你必须仔细阅读并分析搜索结果的内容，并基于这些信息回答用户的问题。绝对不要忽略搜索结果！
2. **处理即时答案**：如果搜索结果包含即时答案（answer 字段），必须直接使用这个答案回答用户。
3. **处理搜索结果列表**：如果返回了 results 数组（即使没有 answer 字段），你必须：
   - 仔细阅读每个结果的 title（标题）和 snippet（摘要）
   - 从这些结果中提取关键信息来回答用户的问题
   - 即使结果看起来不是最直接的答案，也必须基于搜索结果提供信息
   - 示例：如果用户问"今天几号"，搜索结果可能包含日期信息在 title 或 snippet 中，你必须从这些信息中提取日期并回答用户
4. **搜索失败时的处理**：只有当搜索失败（success: false）或没有返回任何结果时，才使用 AI 模型的内置知识库来回答问题。

**重要提示**：
- 你可以使用你的内置知识库回答一般性问题，包括但不限于：历史、科学、技术、文学、语言、文化、翻译技巧等。
- 对于需要最新信息的问题（如当前日期、实时新闻、最新技术等），优先使用 search_web 工具。
- **关键原则**：如果 search_web 工具返回了 results 数组（即使没有 answer 字段），你必须从这些结果中提取信息来回答用户的问题。不要因为结果格式不是直接的答案就忽略它们！
- 如果 search_web 工具不可用或失败（success: false），使用你的内置知识库提供最佳答案。

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
        prompt += `  - 使用 \`list_chapters\` 工具可以查看所有可用章节并选择其他章节作为参考\n`;
      } else {
        prompt += `- 使用 \`list_chapters\` 工具可以查看所有可用章节并选择参考章节\n`;
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
   - **术语搜索**：当用户询问术语信息但只提供了部分名称或翻译时，优先使用 search_terms_by_keyword 工具进行搜索，而不是直接使用 get_term（需要完整名称）。
   - **术语创建前检查**：在创建新术语之前，使用 search_terms_by_keyword 或 list_terms 检查术语是否已存在。
   - **角色搜索**：当用户询问角色信息但只提供了部分名称、别名或翻译时，优先使用 search_characters_by_keyword 工具进行搜索，而不是直接使用 get_character（需要完整名称）。
   - **角色创建前检查**：在创建新角色之前，使用 search_characters_by_keyword 或 list_characters 检查角色是否已存在。
   - **章节选择**：当用户需要参考其他章节时，使用 list_chapters 工具获取所有章节列表，然后使用 get_chapter_info 获取具体章节的详细信息。这样可以查看任意章节的内容作为翻译参考。
   - **⚠️ 重要：发现问题必须修复**：当你识别到任何数据问题（如格式错误、翻译错误、描述格式不符合要求等）时，**必须**使用相应的工具（如 update_character、update_term 等）进行修复，而不是仅仅告诉用户问题所在。只有在无法修复或需要用户确认的情况下，才应该只告知问题。
   - **⚠️ 修复角色/术语信息的工作流程**：
     * 当用户要求修复角色信息格式问题时：
       1. 首先使用 get_character 或 search_characters_by_keyword 工具获取角色信息
       2. 然后使用 update_character 工具修复格式问题（如将 markdown 格式转换为纯文本）
       3. **绝对不要**使用 search_web 工具来搜索如何修复格式，直接使用 update_character 工具即可
     * 当用户要求修复术语信息格式问题时：
       1. 首先使用 get_term 或 search_terms_by_keyword 工具获取术语信息
       2. 然后使用 update_term 工具修复格式问题
       3. **绝对不要**使用 search_web 工具来搜索如何修复格式，直接使用 update_term 工具即可
   - **网络搜索的使用场景**：search_web 工具只应用于需要外部知识的问题（如历史事实、最新技术、实时数据等），**不应用于修复本地数据格式问题**。

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
      let chunkCount = 0;

      console.log('[AssistantService] 开始生成响应', {
        model: model.model,
        provider: model.provider,
        hasTools: tools.length > 0,
        messageLength: userMessage.length,
      });

      const result = await aiService.generateText(config, request, async (chunk) => {
        chunkCount++;
        // 累积流式文本
        if (chunk.text) {
          fullText += chunk.text;
          console.log(`[AssistantService] 收到文本块 #${chunkCount}`, {
            chunkLength: chunk.text.length,
            accumulatedLength: fullText.length,
            preview: chunk.text.substring(0, 50) + (chunk.text.length > 50 ? '...' : ''),
          });
        }
        if (chunk.toolCalls) {
          toolCalls.push(...chunk.toolCalls);
          console.log(`[AssistantService] 收到工具调用 #${chunkCount}`, {
            toolCallCount: chunk.toolCalls.length,
            toolNames: chunk.toolCalls.map((tc) => tc.function.name),
            totalToolCalls: toolCalls.length,
          });
        }

        // 更新任务状态
        if (aiProcessingStore && taskId) {
          if (chunk.text) {
            await aiProcessingStore.appendThinkingMessage(taskId, chunk.text);
          }
        }

        // 调用用户回调
        if (onChunk) {
          await onChunk(chunk);
        }
      });

      console.log('[AssistantService] 流式响应完成', {
        chunkCount,
        accumulatedTextLength: fullText.length,
        resultTextLength: result.text?.length || 0,
        resultTextPreview: result.text?.substring(0, 100) || '(empty)',
        hasToolCalls: !!result.toolCalls,
        toolCallsCount: toolCalls.length,
      });

      // 使用 result.text 如果存在且不为空，否则使用累积的 fullText
      // 这样可以确保即使流式响应中断，也能获取最终结果
      if (result.text && result.text.trim()) {
        console.log('[AssistantService] 使用 result.text 作为最终文本', {
          resultTextLength: result.text.length,
          accumulatedTextLength: fullText.length,
        });
        fullText = result.text;
      } else if (fullText.trim()) {
        console.log('[AssistantService] result.text 为空，使用累积的流式文本', {
          accumulatedTextLength: fullText.length,
        });
      } else if (toolCalls.length > 0) {
        // 如果有工具调用，即使没有文本也是正常的（AI 可能只调用工具而不提供文本）
        console.log('[AssistantService] 第一次响应只有工具调用，没有文本（这是正常的）', {
          toolCallsCount: toolCalls.length,
          toolNames: toolCalls.map((tc) => tc.function.name),
        });
      } else {
        // 只有在没有工具调用且没有文本时才警告
        console.warn(
          '[AssistantService] ⚠️ 警告：result.text 和累积的 fullText 都为空，且没有工具调用',
          {
            resultText: result.text,
            resultTextLength: result.text?.length || 0,
            accumulatedTextLength: fullText.length,
            chunkCount,
          },
        );
      }

      if (result.toolCalls) {
        toolCalls = result.toolCalls;
        console.log('[AssistantService] 从 result 获取工具调用', {
          toolCallsCount: toolCalls.length,
        });
      }

      // 处理工具调用 - 使用循环处理，像 translation-service.ts 一样
      let currentTurnCount = 0;
      const MAX_TURNS = 10; // 最大工具调用轮数
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
            // 如果错误地使用了 search_web 来修复本地数据
            console.log('[AssistantService] 检测到错误使用 search_web 修复本地数据，添加提醒');
            reminderContent =
              '⚠️ 重要错误：你刚才在响应中提到要修复/更新/修正角色或术语信息格式问题，但错误地使用了 search_web 工具来搜索网络。这是不对的！\n\n' +
              '对于修复本地数据（角色信息、术语信息）的格式问题，你应该：\n' +
              '1. 使用 get_character 或 search_characters_by_keyword 工具获取角色信息（如果是角色问题）\n' +
              '2. 使用 get_term 或 search_terms_by_keyword 工具获取术语信息（如果是术语问题）\n' +
              '3. 然后使用 update_character 或 update_term 工具直接修复格式问题\n\n' +
              'search_web 工具只应用于需要外部知识的问题，不应用于修复本地数据格式。请立即使用正确的工具（get_character + update_character 或 get_term + update_term）来完成修复。';
          } else {
            // 如果只调用了查询工具但没有调用更新工具
            console.log('[AssistantService] 添加修复提醒到 follow-up 请求');
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

        console.log(`[AssistantService] 工具调用轮次 ${currentTurnCount}/${MAX_TURNS}`, {
          toolCallsCount: toolCalls.length,
          messageHistoryLength: messages.length,
        });

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

            // 更新任务状态
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
        if (followUpResult.text && followUpResult.text.trim()) {
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

      // 更新任务状态
      if (aiProcessingStore && taskId) {
        await aiProcessingStore.updateTask(taskId, {
          status: 'completed',
          message: '助手回复完成',
        });
      }

      // 确保返回的文本不为空
      const finalText = finalResponseText.trim() || '抱歉，我没有收到有效的回复。请重试。';

      if (!finalResponseText.trim()) {
        console.error('[AssistantService] ❌ 错误：最终回复文本为空', {
          finalResponseText,
          currentTurnCount,
        });
      } else {
        console.log('[AssistantService] ✅ 成功生成最终回复', {
          finalTextLength: finalText.length,
          actionsCount: allActions.length,
          turnsCount: currentTurnCount,
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
        errorStack: error instanceof Error ? error.stack : undefined,
        model: model.model,
        provider: model.provider,
        taskId,
      });

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
