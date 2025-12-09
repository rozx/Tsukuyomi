import type { AIModel } from 'src/services/ai/types/ai-model';
import type {
  AIServiceConfig,
  TextGenerationRequest,
  TextGenerationStreamCallback,
  ChatMessage,
} from 'src/services/ai/types/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { Paragraph, Novel } from 'src/models/novel';
import { AIServiceFactory } from '../index';

import {
  findUniqueTermsInText,
  findUniqueCharactersInText,
  calculateCharacterScores,
} from 'src/utils/text-matcher';
import { detectRepeatingCharacters } from 'src/services/ai/degradation-detector';
import { ToolRegistry } from 'src/services/ai/tools/index';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import { TranslationService } from './translation-service';

/**
 * 校对服务选项
 */
export interface ProofreadingServiceOptions {
  /**
   * 自定义提示词（可选）
   */
  prompt?: string;
  /**
   * 流式数据回调函数，用于接收校对过程中的数据块
   */
  onChunk?: TextGenerationStreamCallback;
  /**
   * 进度回调函数，用于接收校对进度更新
   * @param progress 进度信息
   */
  onProgress?: (progress: { total: number; current: number; currentParagraphs?: string[] }) => void;
  /**
   * AI 执行操作时的回调（如 CRUD 术语/角色）
   */
  onAction?: (action: ActionInfo) => void;
  /**
   * Toast 回调函数，用于在工具中直接显示 toast 通知
   */
  onToast?: ToastCallback;
  /**
   * 段落校对回调函数，用于接收每个块完成后的段落校对结果
   * @param translations 段落校对数组，包含段落ID和校对后的文本
   */
  onParagraphProofreading?: (translations: { id: string; translation: string }[]) => void;
  /**
   * 取消信号（可选）
   */
  signal?: AbortSignal;
  /**
   * 书籍 ID（用于术语 CRUD 操作）
   */
  bookId?: string;
  /**
   * AI 处理 Store（可选），如果提供，将自动创建和管理任务
   */
  aiProcessingStore?: {
    addTask: (task: Omit<AIProcessingTask, 'id' | 'startTime'>) => Promise<string>;
    updateTask: (id: string, updates: Partial<AIProcessingTask>) => Promise<void>;
    appendThinkingMessage: (id: string, text: string) => Promise<void>;
    appendOutputContent: (id: string, text: string) => Promise<void>;
    removeTask: (id: string) => Promise<void>;
    activeTasks: AIProcessingTask[];
  };
  /**
   * 当前段落 ID（可选），用于单段落校对时提供上下文
   */
  currentParagraphId?: string;
}

export interface ProofreadingResult {
  text: string;
  taskId?: string;
  paragraphTranslations?: { id: string; translation: string }[];
  actions?: ActionInfo[];
}

/**
 * 校对服务
 * 使用 AI 服务进行文本校对，检查并修正文字、内容和格式层面的错误
 */
export class ProofreadingService {
  static readonly CHUNK_SIZE = 2500;

  /**
   * 校对文本
   * @param content 要校对的段落列表（必须包含翻译）
   * @param model AI 模型配置
   * @param options 校对选项（可选）
   * @returns 校对后的文本和任务 ID（如果使用了任务管理）
   */
  static async proofread(
    content: Paragraph[],
    model: AIModel,
    options?: ProofreadingServiceOptions,
  ): Promise<ProofreadingResult> {
    console.log('[ProofreadingService] 🔍 开始校对任务', {
      段落数量: content?.length || 0,
      有效段落数: content?.filter((p) => p.text?.trim() && p.translations?.length > 0).length || 0,
      AI模型: model.name,
      AI提供商: model.provider,
      书籍ID: options?.bookId || '无',
    });

    const {
      onChunk,
      onProgress,
      signal,
      bookId,
      aiProcessingStore,
      onParagraphProofreading,
      onToast,
      currentParagraphId,
    } = options || {};
    const actions: ActionInfo[] = [];

    // 内部 action 处理函数，收集 actions 并调用外部 callback
    const handleAction = (action: ActionInfo) => {
      actions.push(action);
      if (options?.onAction) {
        options.onAction(action);
      }
    };

    if (!content || content.length === 0) {
      throw new Error('要校对的内容不能为空');
    }

    // 检查段落是否有翻译
    const paragraphsWithTranslation = content.filter(
      (p) => p.text?.trim() && p.translations && p.translations.length > 0,
    );
    if (paragraphsWithTranslation.length === 0) {
      throw new Error('要校对的段落必须包含至少一个翻译版本');
    }

    if (!model.enabled) {
      throw new Error('所选模型未启用');
    }

    // 任务管理
    let taskId: string | undefined;
    let abortController: AbortController | undefined;

    if (aiProcessingStore) {
      taskId = await aiProcessingStore.addTask({
        type: 'proofreading',
        modelName: model.name,
        status: 'thinking',
        message: '正在初始化校对会话...',
        thinkingMessage: '',
      });

      // 获取任务的 abortController
      const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
      abortController = task?.abortController;
    }

    // 创建一个合并的 AbortSignal，同时监听 signal 和 task.abortController
    const internalController = new AbortController();
    const finalSignal = internalController.signal;

    // 监听信号并触发内部 controller
    const abortHandler = () => {
      internalController.abort();
    };

    if (signal) {
      if (signal.aborted) {
        internalController.abort();
      } else {
        signal.addEventListener('abort', abortHandler);
      }
    }

    if (abortController) {
      if (abortController.signal.aborted) {
        internalController.abort();
      } else {
        abortController.signal.addEventListener('abort', abortHandler);
      }
    }

    try {
      const service = AIServiceFactory.getService(model.provider);
      // 排除翻译管理工具，只返回JSON
      const tools = ToolRegistry.getToolsExcludingTranslationManagement(bookId);
      const config: AIServiceConfig = {
        apiKey: model.apiKey,
        baseUrl: model.baseUrl,
        model: model.model,
        temperature: model.isDefault.proofreading?.temperature ?? 0.3, // 校对使用较低温度以提高准确性
        signal: finalSignal,
      };

      // 初始化消息历史
      const history: ChatMessage[] = [];

      // 1. 系统提示词
      const systemPrompt = `你是一个专业的小说校对助手，负责检查并修正翻译文本中的各种错误。

      ========================================
      【校对工作范围】
      ========================================
      你需要从三个层面全面检查文本：

      **1. 🔍 文字层面：基础准确性**
      - **错别字、漏字、多字**：检查形近字、音近字误用（如"的/地/得"不分、"在/再"混淆），以及排版或输入错误导致的字词缺失或多余
      - **标点符号**：检查标点使用是否规范和统一。例如，对话的引号是否正确（全角/半角、中文/西文引号），句号、逗号、顿号等的使用是否符合中文规范
      - **语法和修辞**：修正明显的语病，确保句子结构清晰，表达准确
      - **词语和成语用法**：确认词语和成语的使用是否恰当，是否符合其固有含义。例如，避免"美轮美奂"（形容建筑）用于形容不相干的事物

      **2. ✨ 内容层面：情节逻辑与细节统一**
      - **人名、地名、称谓**：确保小说中所有角色名字、地点名称、以及人物间的称谓（如"大伯"还是"伯父"）在全文中保持完全一致，不能前后不一
      - **时间线与逻辑**：检查事件发生的时间顺序是否连贯，故事情节是否存在明显的逻辑漏洞或前后矛盾（例如，一个角色在前面说自己有蓝色眼睛，后面又变成了棕色）
      - **专业知识/设定**：如果小说涉及特定的历史、科学、医学、法律或其他专业领域知识或世界观设定，要核对这些知识或设定在小说中的引用是否准确、统一和合理

      **3. 📄 格式层面：版式与体例**
      - **格式和体例**：检查段落缩进、分段、章节标题格式、字体、字号等是否统一
      - **数字用法**：确保数字使用规范，例如日期、计量单位、物理量等是使用阿拉伯数字还是汉字，并保持全文一致
      - **引文和注释**：检查引用的文字、资料或注释是否准确，格式是否统一

      ========================================
      【校对原则】
      ========================================
      1. **保持原意**：校对时只修正错误，不要改变原文的意思和风格
      2. **最小改动**：只修正确实存在的错误，不要过度修改
      3. **一致性优先**：确保术语、角色名称、称谓等在全文中保持一致
      4. **参考原文**：校对时参考原文段落，确保翻译准确无误
      5. **参考上下文**：使用工具获取前后段落和章节的上下文，确保校对结果与整体保持一致

      ========================================
      【工具使用说明】
      ========================================
      **自动提供的参考**:
      - 【相关术语参考】: 当前段落中出现的术语（可直接使用，无需调用工具）
      - 【相关角色参考】: 当前段落中出现的角色（可直接使用，无需调用工具）

      **工具使用优先级**:
      1. **高频必用**:
         - \`find_paragraph_by_keywords\`: 检查人名、地名、称谓的一致性（支持多个关键词。如果提供 chapter_id 参数，则仅在指定章节内搜索；否则搜索所有章节）
         - \`get_previous_paragraphs\` / \`get_next_paragraphs\`: 需要更多上下文时
         - \`get_previous_chapter\` / \`get_next_chapter\`: 需要查看前一个或下一个章节的上下文时（用于理解章节间的连贯性和保持一致性）
         - \`get_chapter_info\`: 获取章节信息，了解整体上下文
         - \`search_memory_by_keywords\`: 搜索相关的背景设定、角色信息等记忆内容
         - \`get_memory\`: 获取完整记忆内容，确保校对时参考正确的设定
      2. **按需使用**:
         - \`update_character\`: 发现角色名称不一致时更新
         - \`update_term\`: 发现术语翻译不一致时更新
         - \`create_memory\`: 保存重要的背景设定、角色信息等记忆内容，以便后续快速参考

      ========================================
      【输出格式要求（必须严格遵守）】
      ========================================
      **⚠️ 重要：只能返回JSON，禁止使用翻译管理工具**
      - ❌ **禁止使用** \`add_translation\`、\`update_translation\`、\`remove_translation\`、\`select_translation\` 等翻译管理工具
      - ✅ **必须直接返回** JSON 格式的校对结果
      - 系统会自动处理翻译的保存和管理，你只需要返回校对内容

      **必须返回有效的 JSON 格式**:
      \`\`\`json
      {
        "paragraphs": [
          { "id": "段落ID1", "translation": "校对后的段落1" },
          { "id": "段落ID2", "translation": "校对后的段落2" }
        ]
      }
      \`\`\`

      **格式要求清单**:
      - \`paragraphs\` 数组中每个对象必须包含 \`id\` 和 \`translation\`
      - 段落 ID 必须与原文**完全一致**
      - 段落数量必须**1:1 对应**（不能合并或拆分段落）
      - 必须是有效的 JSON（注意转义特殊字符）
      - 确保 \`paragraphs\` 数组包含所有输入段落的 ID 和对应校对结果
      - 如果段落没有错误，保持原样返回；如果有错误，返回修正后的版本
      - **不要使用任何翻译管理工具，只返回JSON**

      ========================================
      【执行工作流】
      ========================================
      校对每个文本块时，按以下步骤执行：

      1. **准备阶段**:
         - 仔细阅读【相关术语参考】和【相关角色参考】
         - 检查当前段落的翻译和原文

      2. **检查阶段**:
         - **文字层面**：逐字检查错别字、标点、语法、词语用法
         - **内容层面**：检查人名、地名、称谓是否一致；检查时间线和逻辑是否合理；检查专业知识/设定是否准确
         - **格式层面**：检查格式、数字用法、引文注释是否规范
         - 如发现不一致，使用工具（如 find_paragraph_by_keywords）查找其他段落中的用法，确保一致性

      3. **修正阶段**:
         - 只修正确实存在的错误
         - 保持原意和风格
         - 确保与全文保持一致

      4. **验证阶段**:
         - 确保所有段落都有校对结果
         - 确保段落 ID 完全对应
         - 确保 JSON 格式有效

      5. **输出阶段**:
         - 返回符合格式要求的 JSON
         - 确保所有输入段落都在 \`paragraphs\` 数组中`;

      history.push({ role: 'system', content: systemPrompt });

      // 2. 初始用户提示
      let initialUserPrompt = `开始校对。`;

      // 如果是单段落校对，添加段落 ID 信息以便 AI 获取上下文
      if (currentParagraphId && content.length === 1) {
        initialUserPrompt += `\n\n**当前段落 ID**: ${currentParagraphId}\n你可以使用工具（如 find_paragraph_by_keywords、get_chapter_info、get_previous_paragraphs、get_next_paragraphs 等）获取该段落的前后上下文，以确保校对的一致性和连贯性。`;
      }

      initialUserPrompt += `

        【执行要点】
        - **文字层面**：检查错别字、标点、语法、词语用法
        - **内容层面**：检查人名、地名、称谓一致性；检查时间线和逻辑；检查专业知识/设定
        - **格式层面**：检查格式、数字用法、引文注释
        - **一致性**：使用工具查找其他段落中的用法，确保全文一致
        - **最小改动**：只修正确实存在的错误，保持原意和风格
        - **参考原文**：校对时参考原文段落，确保翻译准确无误

        请按 JSON 格式返回。`;

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.updateTask(taskId, { message: '正在建立连接...' });
      }

      // 切分文本
      const CHUNK_SIZE = ProofreadingService.CHUNK_SIZE;
      const chunks: Array<{
        text: string;
        context?: string;
        paragraphIds?: string[];
      }> = [];

      // 获取书籍数据以提取上下文（仅当提供了 bookId 时）
      let book: Novel | undefined;
      if (bookId) {
        try {
          // 动态导入 store 以避免循环依赖
          const booksStore = (await import('src/stores/books')).useBooksStore();
          book = booksStore.getBookById(bookId);
        } catch (e) {
          console.warn(
            `[ProofreadingService] ⚠️ 获取书籍数据失败（书籍ID: ${bookId}），将跳过上下文提取（术语、角色参考）`,
            e instanceof Error ? e.message : e,
          );
        }
      }

      // 计算全文的角色出现得分，用于消歧义
      let characterScores: Map<string, number> | undefined;
      if (book && book.characterSettings) {
        const fullText = paragraphsWithTranslation.map((p) => p.text).join('\n');
        characterScores = calculateCharacterScores(fullText, book.characterSettings);
      }

      let currentChunkText = '';
      let currentChunkParagraphs: Paragraph[] = [];

      // 辅助函数：提取上下文
      const getContext = (paragraphs: Paragraph[], bookData?: Novel): string => {
        if (!bookData || paragraphs.length === 0) return '';

        const textContent = paragraphs.map((p) => p.text).join('\n');
        const contextParts: string[] = [];

        // 查找相关术语
        const relevantTerms = findUniqueTermsInText(textContent, bookData.terminologies || []);
        if (relevantTerms.length > 0) {
          contextParts.push('【相关术语参考】');
          contextParts.push(
            relevantTerms
              .map(
                (t) =>
                  `- [ID: ${t.id}] ${t.name}: ${t.translation.translation}${t.description ? ` (${t.description})` : ''}`,
              )
              .join('\n'),
          );
        }

        // 查找相关角色
        const relevantCharacters = findUniqueCharactersInText(
          textContent,
          bookData.characterSettings || [],
          characterScores,
        );
        if (relevantCharacters.length > 0) {
          contextParts.push('【相关角色参考】');
          contextParts.push(
            relevantCharacters
              .map((c) => {
                let charInfo = `- [ID: ${c.id}] ${c.name}: ${c.translation.translation}`;
                if (c.aliases && c.aliases.length > 0) {
                  const aliasList = c.aliases
                    .map((a) => `${a.name}(${a.translation.translation})`)
                    .join(', ');
                  charInfo += ` [别名: ${aliasList}]`;
                }
                if (c.description) {
                  charInfo += ` (${c.description})`;
                }
                if (c.speakingStyle) {
                  charInfo += ` [口吻: ${c.speakingStyle}]`;
                }
                return charInfo;
              })
              .join('\n'),
          );
        }

        return contextParts.length > 0 ? contextParts.join('\n') + '\n\n' : '';
      };

      for (const paragraph of paragraphsWithTranslation) {
        // 获取段落的当前翻译
        const currentTranslation =
          paragraph.translations?.find((t) => t.id === paragraph.selectedTranslationId)?.translation ||
          paragraph.translations?.[0]?.translation ||
          '';

        // 格式化段落：[ID: {id}] 原文: {原文}\n翻译: {当前翻译}
        const paragraphText = `[ID: ${paragraph.id}] 原文: ${paragraph.text}\n翻译: ${currentTranslation}\n\n`;

        // 预测加入新段落后的上下文
        const nextParagraphs = [...currentChunkParagraphs, paragraph];
        const nextContext = getContext(nextParagraphs, book);

        // 如果当前块加上新段落和上下文超过限制，且当前块不为空，则先保存当前块
        if (
          currentChunkText.length + paragraphText.length + nextContext.length > CHUNK_SIZE &&
          currentChunkText.length > 0
        ) {
          chunks.push({
            text: currentChunkText,
            context: getContext(currentChunkParagraphs, book),
            paragraphIds: currentChunkParagraphs.map((p) => p.id),
          });
          currentChunkText = '';
          currentChunkParagraphs = [];
        }
        currentChunkText += paragraphText;
        currentChunkParagraphs.push(paragraph);
      }
      // 添加最后一个块
      if (currentChunkText.length > 0) {
        chunks.push({
          text: currentChunkText,
          context: getContext(currentChunkParagraphs, book),
          paragraphIds: currentChunkParagraphs.map((p) => p.id),
        });
      }

      let proofreadText = '';
      const paragraphProofreadings: { id: string; translation: string }[] = [];

      // 3. 循环处理每个块
      for (let i = 0; i < chunks.length; i++) {
        // 检查是否已取消
        if (finalSignal.aborted) {
          throw new Error('请求已取消');
        }

        const chunk = chunks[i];
        if (!chunk) continue;

        const chunkText = chunk.text;
        const chunkContext = chunk.context || '';

        if (aiProcessingStore && taskId) {
          void aiProcessingStore.updateTask(taskId, {
            message: `正在校对第 ${i + 1}/${chunks.length} 部分...`,
            status: 'processing',
          });
          // 添加块分隔符
          void aiProcessingStore.appendThinkingMessage(
            taskId,
            `\n\n[=== 校对块 ${i + 1}/${chunks.length} ===]\n\n`,
          );
        }

        if (onProgress) {
          const progress: {
            total: number;
            current: number;
            currentParagraphs?: string[];
          } = {
            total: chunks.length,
            current: i + 1,
          };
          if (chunk.paragraphIds) {
            progress.currentParagraphs = chunk.paragraphIds;
          }
          onProgress(progress);
        }

        // 构建当前消息
        const maintenanceReminder = `
⚠️ **提醒**:
- **文字层面**：检查错别字、标点、语法、词语用法
- **内容层面**：检查人名、地名、称谓一致性；检查时间线和逻辑；检查专业知识/设定
- **格式层面**：检查格式、数字用法、引文注释
- **一致性**：使用工具查找其他段落中的用法，确保全文一致
- **最小改动**：只修正确实存在的错误，保持原意和风格`;
        let content = '';
        if (i === 0) {
          content = `${initialUserPrompt}\n\n以下是第一部分内容：\n\n${chunkContext}${chunkText}${maintenanceReminder}`;
        } else {
          content = `接下来的内容：\n\n${chunkContext}${chunkText}${maintenanceReminder}`;
        }

        history.push({ role: 'user', content });

        let currentTurnCount = 0;
        const MAX_TURNS = 10; // 防止工具调用死循环
        let finalResponseText = '';

        // 工具调用循环
        while (currentTurnCount < MAX_TURNS) {
          currentTurnCount++;

          const request: TextGenerationRequest = {
            messages: history,
          };

          if (tools.length > 0) {
            request.tools = tools;
          }

          // 调用 AI
          let chunkReceived = false;
          let accumulatedText = '';

          // 确保 AI 请求完全完成后再继续
          const result = await service.generateText(config, request, (c) => {
            // 处理思考内容（独立于文本内容，可能在无文本时单独返回）
            if (aiProcessingStore && taskId && c.reasoningContent) {
              void aiProcessingStore.appendThinkingMessage(taskId, c.reasoningContent);
            }

            // 处理流式输出
            if (c.text) {
              if (!chunkReceived && aiProcessingStore && taskId) {
                chunkReceived = true;
              }

              // 累积文本用于检测重复字符
              accumulatedText += c.text;

              // 追加输出内容到任务
              if (aiProcessingStore && taskId) {
                void aiProcessingStore.appendOutputContent(taskId, c.text);
              }

              // 检测重复字符（AI降级检测），传入原文进行比较
              if (
                detectRepeatingCharacters(accumulatedText, chunkText, { logLabel: 'ProofreadingService' })
              ) {
                throw new Error('AI降级检测：检测到重复字符，停止校对');
              }
            }
            return Promise.resolve();
          });

          // 检查是否有工具调用
          if (result.toolCalls && result.toolCalls.length > 0) {
            // 将助手的回复（包含工具调用）添加到历史
            history.push({
              role: 'assistant',
              content: result.text || null,
              tool_calls: result.toolCalls,
            });

            // 执行工具
            for (const toolCall of result.toolCalls) {
              if (aiProcessingStore && taskId) {
                void aiProcessingStore.appendThinkingMessage(
                  taskId,
                  `\n[调用工具: ${toolCall.function.name}]\n`,
                );
              }

              // 执行工具
              const toolResult = await TranslationService.handleToolCall(
                toolCall,
                bookId || '',
                handleAction,
                onToast,
              );

              // 添加工具结果到历史
              history.push({
                role: 'tool',
                content: toolResult.content,
                tool_call_id: toolCall.id,
                name: toolCall.function.name,
              });

              if (aiProcessingStore && taskId) {
                void aiProcessingStore.appendThinkingMessage(
                  taskId,
                  `[工具结果: ${toolResult.content.slice(0, 100)}...]\n`,
                );
              }
            }
            // 工具调用完成后，添加提示要求AI继续完成校对
            history.push({
              role: 'user',
              content:
                '工具调用已完成。请继续完成当前文本块的校对任务，返回包含校对结果的JSON格式响应。不要跳过校对，必须提供完整的校对结果。',
            });
            // 继续循环，将工具结果和提示发送给 AI
          } else {
            // 没有工具调用，这是最终回复
            finalResponseText = result.text;

            // 保存思考内容到思考过程（从最终结果）
            if (aiProcessingStore && taskId && result.reasoningContent) {
              void aiProcessingStore.appendThinkingMessage(taskId, result.reasoningContent);
            }

            // 再次检测最终响应中的重复字符，传入原文进行比较
            if (
              detectRepeatingCharacters(finalResponseText, chunkText, { logLabel: 'ProofreadingService' })
            ) {
              throw new Error('AI降级检测：最终响应中检测到重复字符');
            }

            history.push({ role: 'assistant', content: finalResponseText });
            break;
          }
        }

        // 检查是否在达到最大回合数后仍未获得校对结果
        if (!finalResponseText || finalResponseText.trim().length === 0) {
          throw new Error(
            `AI在工具调用后未返回校对结果（已达到最大回合数 ${MAX_TURNS}）。请重试。`,
          );
        }

        // 解析 JSON 响应
        try {
          // 尝试提取 JSON
          const jsonMatch = finalResponseText.match(/\{[\s\S]*\}/);
          let chunkProofreading = '';
          const extractedProofreadings: Map<string, string> = new Map();

          if (jsonMatch) {
            const jsonStr = jsonMatch[0];
            try {
              const data = JSON.parse(jsonStr);

              // 优先使用 paragraphs 数组（结构化数据）
              if (data.paragraphs && Array.isArray(data.paragraphs)) {
                for (const para of data.paragraphs) {
                  if (para.id && para.translation) {
                    extractedProofreadings.set(para.id, para.translation);
                  }
                }

                // 使用 translation 字段作为完整文本，如果没有则从 paragraphs 构建
                if (data.translation) {
                  chunkProofreading = data.translation;
                } else if (extractedProofreadings.size > 0 && chunk.paragraphIds) {
                  // 从 paragraphs 数组构建完整文本
                  const orderedTexts: string[] = [];
                  for (const paraId of chunk.paragraphIds) {
                    const proofreading = extractedProofreadings.get(paraId);
                    if (proofreading) {
                      orderedTexts.push(proofreading);
                    }
                  }
                  chunkProofreading = orderedTexts.join('\n\n');
                }
              } else if (data.translation) {
                // 后备方案：只有 translation 字段，尝试从字符串中提取段落ID
                console.warn(
                  `[ProofreadingService] ⚠️ JSON中未找到paragraphs数组（块 ${i + 1}/${chunks.length}），将尝试从translation字符串中提取段落ID`,
                );
                chunkProofreading = data.translation;

                // 尝试从字符串中提取段落ID（兼容旧格式）
                const idPattern = /\[ID:\s*([^\]]+)\]\s*([^[]*?)(?=\[ID:|$)/gs;
                idPattern.lastIndex = 0;
                let match;
                while ((match = idPattern.exec(chunkProofreading)) !== null) {
                  const paragraphId = match[1]?.trim();
                  const proofreading = match[2]?.trim();
                  if (paragraphId && proofreading) {
                    extractedProofreadings.set(paragraphId, proofreading);
                  }
                }
              } else {
                console.warn(
                  `[ProofreadingService] ⚠️ AI响应JSON中未找到translation或paragraphs字段（块 ${i + 1}/${chunks.length}），将使用完整原始响应作为校对结果`,
                );
                chunkProofreading = finalResponseText;
              }
            } catch (e) {
              console.warn(
                `[ProofreadingService] ⚠️ 解析AI响应JSON失败（块 ${i + 1}/${chunks.length}）`,
                e instanceof Error ? e.message : String(e),
              );
              // JSON 解析失败，回退到原始文本处理
              chunkProofreading = finalResponseText;
            }
          } else {
            // 不是 JSON，直接使用原始文本
            console.warn(
              `[ProofreadingService] ⚠️ AI响应不是JSON格式（块 ${i + 1}/${chunks.length}），将使用完整原始响应作为校对结果`,
            );
            chunkProofreading = finalResponseText;
          }

          // 验证：检查当前块中的所有段落是否都有校对结果
          const missingIds: string[] = [];
          if (chunk.paragraphIds && chunk.paragraphIds.length > 0) {
            for (const paraId of chunk.paragraphIds) {
              if (!extractedProofreadings.has(paraId)) {
                missingIds.push(paraId);
              }
            }
          }

          if (missingIds.length > 0) {
            console.warn(
              `[ProofreadingService] ⚠️ 块 ${i + 1}/${chunks.length} 中缺失 ${missingIds.length}/${chunk.paragraphIds?.length || 0} 个段落的校对结果`,
              {
                缺失段落ID:
                  missingIds.slice(0, 5).join(', ') +
                  (missingIds.length > 5 ? ` 等 ${missingIds.length} 个` : ''),
                已提取校对数: extractedProofreadings.size,
                预期段落数: chunk.paragraphIds?.length || 0,
              },
            );
            // 如果缺少段落ID，使用完整校对文本作为后备方案
            if (extractedProofreadings.size === 0) {
              proofreadText += chunkProofreading;
              if (onChunk) {
                await onChunk({ text: chunkProofreading, done: false });
              }
            } else {
              // 部分段落有ID，按顺序处理
              const orderedProofreadings: string[] = [];
              const chunkParagraphProofreadings: { id: string; translation: string }[] = [];
              if (chunk.paragraphIds) {
                for (const paraId of chunk.paragraphIds) {
                  const proofreading = extractedProofreadings.get(paraId);
                  if (proofreading) {
                    orderedProofreadings.push(proofreading);
                    const paraProofreading = { id: paraId, translation: proofreading };
                    paragraphProofreadings.push(paraProofreading);
                    chunkParagraphProofreadings.push(paraProofreading);
                  }
                }
              }
              const orderedText = orderedProofreadings.join('\n\n');
              proofreadText += orderedText || chunkProofreading;
              if (onChunk) {
                await onChunk({ text: orderedText || chunkProofreading, done: false });
              }
              // 通知段落校对完成（即使只有部分段落）
              if (onParagraphProofreading && chunkParagraphProofreadings.length > 0) {
                onParagraphProofreading(chunkParagraphProofreadings);
              }
            }
          } else {
            // 所有段落都有校对结果，按顺序组织
            if (extractedProofreadings.size > 0 && chunk.paragraphIds) {
              const orderedProofreadings: string[] = [];
              const chunkParagraphProofreadings: { id: string; translation: string }[] = [];
              for (const paraId of chunk.paragraphIds) {
                const proofreading = extractedProofreadings.get(paraId);
                if (proofreading) {
                  orderedProofreadings.push(proofreading);
                  const paraProofreading = { id: paraId, translation: proofreading };
                  paragraphProofreadings.push(paraProofreading);
                  chunkParagraphProofreadings.push(paraProofreading);
                }
              }
              const orderedText = orderedProofreadings.join('\n\n');
              proofreadText += orderedText;
              if (onChunk) {
                await onChunk({ text: orderedText, done: false });
              }
              // 通知段落校对完成
              if (onParagraphProofreading && chunkParagraphProofreadings.length > 0) {
                onParagraphProofreading(chunkParagraphProofreadings);
              }
            } else {
              // 没有提取到段落校对，使用完整文本
              proofreadText += chunkProofreading;
              if (onChunk) {
                await onChunk({ text: chunkProofreading, done: false });
              }
            }
          }
        } catch (e) {
          console.warn(
            `[ProofreadingService] ⚠️ 解析AI响应失败（块 ${i + 1}/${chunks.length}）`,
            e instanceof Error ? e.message : String(e),
          );
          proofreadText += finalResponseText;
          if (onChunk) await onChunk({ text: finalResponseText, done: false });
        }
      }

      if (onChunk) {
        await onChunk({ text: '', done: true });
      }

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.updateTask(taskId, {
          status: 'completed',
          message: '校对完成',
        });
        // 不再自动删除任务，保留思考过程供用户查看
      }

      return {
        text: proofreadText,
        paragraphTranslations: paragraphProofreadings,
        actions,
        ...(taskId ? { taskId } : {}),
      };
    } catch (error) {
      if (aiProcessingStore && taskId) {
        // 检查是否是取消错误
        const isCancelled =
          error instanceof Error &&
          (error.message === '请求已取消' || error.message.includes('aborted'));

        if (isCancelled) {
          void aiProcessingStore.updateTask(taskId, {
            status: 'cancelled',
            message: '已取消',
          });
        } else {
          void aiProcessingStore.updateTask(taskId, {
            status: 'error',
            message: error instanceof Error ? error.message : '校对出错',
          });
        }
      }
      throw error;
    } finally {
      // 清理事件监听器
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
      if (abortController) {
        abortController.signal.removeEventListener('abort', abortHandler);
      }
    }
  }
}

