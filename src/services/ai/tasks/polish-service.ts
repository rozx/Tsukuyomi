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
 * 润色服务选项
 */
export interface PolishServiceOptions {
  /**
   * 自定义提示词（可选）
   */
  prompt?: string;
  /**
   * 流式数据回调函数，用于接收润色过程中的数据块
   */
  onChunk?: TextGenerationStreamCallback;
  /**
   * 进度回调函数，用于接收润色进度更新
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
   * 段落润色回调函数，用于接收每个块完成后的段落润色结果
   * @param translations 段落润色数组，包含段落ID和润色文本
   */
  onParagraphPolish?: (translations: { id: string; translation: string }[]) => void;
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
   * 当前段落 ID（可选），用于单段落润色时提供上下文
   */
  currentParagraphId?: string;
}

export interface PolishResult {
  text: string;
  taskId?: string;
  paragraphTranslations?: { id: string; translation: string }[];
  actions?: ActionInfo[];
}

/**
 * 润色服务
 * 使用 AI 服务进行文本润色，支持术语 CRUD 工具和翻译历史参考
 */
export class PolishService {
  static readonly CHUNK_SIZE = 2500;

  /**
   * 润色文本
   * @param content 要润色的段落列表（必须包含翻译历史）
   * @param model AI 模型配置
   * @param options 润色选项（可选）
   * @returns 润色后的文本和任务 ID（如果使用了任务管理）
   */
  static async polish(
    content: Paragraph[],
    model: AIModel,
    options?: PolishServiceOptions,
  ): Promise<PolishResult> {
    console.log('[PolishService] 🎨 开始润色任务', {
      段落数量: content?.length || 0,
      有效段落数: content?.filter((p) => p.text?.trim() && p.translations?.length > 0).length || 0,
      AI模型: model.name,
      AI提供商: model.provider,
      书籍ID: options?.bookId || '无',
    });

    const { onChunk, onProgress, signal, bookId, aiProcessingStore, onParagraphPolish, onToast, currentParagraphId } =
      options || {};
    const actions: ActionInfo[] = [];

    // 内部 action 处理函数，收集 actions 并调用外部 callback
    const handleAction = (action: ActionInfo) => {
      actions.push(action);
      if (options?.onAction) {
        options.onAction(action);
      }
    };

    if (!content || content.length === 0) {
      throw new Error('要润色的内容不能为空');
    }

    // 检查段落是否有翻译
    const paragraphsWithTranslation = content.filter(
      (p) => p.text?.trim() && p.translations && p.translations.length > 0,
    );
    if (paragraphsWithTranslation.length === 0) {
      throw new Error('要润色的段落必须包含至少一个翻译版本');
    }

    if (!model.enabled) {
      throw new Error('所选模型未启用');
    }

    // 任务管理
    let taskId: string | undefined;
    let abortController: AbortController | undefined;

    if (aiProcessingStore) {
      taskId = await aiProcessingStore.addTask({
        type: 'polish',
        modelName: model.name,
        status: 'thinking',
        message: '正在初始化润色会话...',
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
        temperature: model.isDefault.proofreading?.temperature ?? 0.7,
        signal: finalSignal,
      };

      // 初始化消息历史
      const history: ChatMessage[] = [];

      // 1. 系统提示词
      const systemPrompt = `你是一个专业的日轻小说润色助手。

      【核心规则】
      1. **语气词优化**:
        - 适当地添加语气词，如"呀"、"呢"、"吧"、"啊"等，以增强翻译的语气。
        - 不要过度使用语气词，以免影响翻译的流畅性。
        - 准确地根据角色的说话风格进行润色，不要使用与角色不符的语气词。

      2. **摆脱"翻译腔"**:
        - 将生硬的直译转换为自然流畅的中文表达。
        - 避免日式语序和生硬的字面翻译。
        - 使用符合中文习惯的表达方式。

      3. **句子流畅和节奏**:
        - 调整句子长度和结构，确保阅读节奏自然。
        - 避免过长的句子，适当断句。
        - 保持句子的韵律感。

      4. **消除语病和不必要的重复**:
        - 修正语法错误和表达不当。
        - 删除冗余的词汇和重复表达。
        - 优化表达，使语言更精炼。

      5. **人物语言的区分**:
        - 检查不同角色的对白是否符合他们的身份、性格和所处的时代背景。
        - 例如，一位贵族和一位平民的对话用词应有所区别。
        - 参考角色设定中的口吻和说话风格。

      6. **专有名词的统一**:
        - 确保术语和角色名称在整个文本中保持一致。
        - 使用术语表和角色表中的标准翻译。

      7. **意境和情感的传达**:
        - 确保译文能准确传达原作所营造的意境和其中蕴含的情感。
        - 保持原文的情感色彩和氛围。
        - **参考前面段落的原文和翻译，确保翻译的一致性。**

      8. **翻译历史参考**:
        - 每个段落都提供了多个翻译历史版本。
        - 你可以参考这些历史翻译，混合匹配不同版本中的优秀表达。
        - 选择最合适的词汇和句式，创造最佳润色结果。

      9. **工具使用**:
        - 使用工具获取术语、角色和段落上下文。
        - 优先使用上下文中的术语/角色，如果上下文中没有，再调用工具查询。
        - 如遇到敬语翻译，必须使用 find_paragraph_by_keywords 检查历史翻译一致性。
        - 如遇到新术语和角色，必须使用 get_occurrences_by_keywords 检查词频，确认需要后创建。
        - 如遇到新角色，必须使用 list_characters 检查是否为已存在角色的别名，确认是新角色后创建（必须用全名）。
        - 如遇到数据问题，必须使用 update_term 或 update_character 修复。
        - 如遇到重复角色，必须使用 delete_character 删除重复，添加为别名。
        - 如遇到错误分类，必须使用 delete_term 或 delete_character 删除错误项，添加到正确表。
        - 如遇到空翻译，必须使用 update_term 或 update_character 修复。
        - 如遇到描述不匹配，必须使用 update_term 或 update_character 修复。
        - 需要查看前一个或下一个章节的上下文时，可使用 get_previous_chapter 或 get_next_chapter 工具（用于理解章节间的连贯性和保持润色一致性）。
        - 需要修正章节标题翻译时，可使用 update_chapter_title 工具更新章节标题。

      10. **记忆管理**:
        - **参考记忆**: 润色前可使用 search_memory_by_keywords 搜索相关的背景设定、角色信息等记忆内容，使用 get_memory 获取完整内容，确保润色风格和术语使用的一致性。
        - **保存记忆**: 完成章节润色后，可使用 create_memory 保存章节摘要（需要自己生成 summary）。重要背景设定也可保存供后续参考。
        - **搜索后保存**: 当你通过工具（如 find_paragraph_by_keywords、get_chapter_info、get_previous_chapter、get_next_chapter 等）搜索或检索了大量内容时，应该主动使用 create_memory 保存这些重要信息，以便后续快速参考。

      11. **输出格式**:
        ⚠️ **重要：只能返回JSON，禁止使用翻译管理工具**
        - ❌ **禁止使用** \`add_translation\`、\`update_translation\`、\`remove_translation\`、\`select_translation\` 等翻译管理工具
        - ✅ **必须直接返回** JSON 格式的润色结果
        - 系统会自动处理翻译的保存和管理，你只需要返回润色内容

        必须返回有效 JSON 格式:
        {
          "paragraphs": [{ "id": "段落ID", "translation": "润色后的内容" }],
        }
        确保 paragraphs 数组包含所有输入段落的 ID 和对应润色结果。
        **不要使用任何翻译管理工具，只返回JSON**`;

      history.push({ role: 'system', content: systemPrompt });

      // 2. 初始用户提示
      let initialUserPrompt = `开始润色。`;

      // 如果是单段落润色，添加段落 ID 信息以便 AI 获取上下文
      if (currentParagraphId && content.length === 1) {
        initialUserPrompt += `\n\n**当前段落 ID**: ${currentParagraphId}\n你可以使用工具（如 find_paragraph_by_keywords、get_chapter_info 等）获取该段落的前后上下文，以确保润色的一致性和连贯性。`;
      }

      initialUserPrompt += `

        【执行要点】
        - **语气词**: 适当添加，符合角色风格。
        - **自然流畅**: 摆脱翻译腔，使用地道中文。
        - **节奏优化**: 调整句子长度和结构。
        - **语病修正**: 消除语病和不必要重复。
        - **角色区分**: 根据角色身份、性格、时代背景调整语言。
        - **专有名词**: 保持术语和角色名称统一。
        - **情感传达**: 准确传达意境和情感。
        - **历史参考**: 参考翻译历史和之前段落的原文和翻译，混合匹配最佳表达。
        - **工具使用**: 优先使用上下文，必要时调用工具。
        - **记忆**: 润色前搜索相关记忆，完成后可保存章节摘要。
        - **保留原文格式**: 保留原文的格式，如标点符号、换行符等。

        请按 JSON 格式返回。`;

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.updateTask(taskId, { message: '正在建立连接...' });
      }

      // 切分文本
      const CHUNK_SIZE = PolishService.CHUNK_SIZE;
      const chunks: Array<{
        text: string;
        context?: string;
        paragraphIds?: string[];
        translationHistories?: Map<string, string[]>; // 段落ID -> 翻译历史数组
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
            `[PolishService] ⚠️ 获取书籍数据失败（书籍ID: ${bookId}），将跳过上下文提取（术语、角色参考）`,
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
      let currentChunkTranslationHistories = new Map<string, string[]>();

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
        // 获取段落的翻译历史（最多5个，最新的在前）
        const translations = paragraph.translations || [];
        const translationHistory = translations
          .slice()
          .reverse()
          .slice(0, 5)
          .map((t) => t.translation);

        // 格式化段落：[ID: {id}] {原文}\n当前翻译: {当前翻译}\n翻译历史:\n{历史版本}
        const currentTranslation =
          translations.find((t) => t.id === paragraph.selectedTranslationId)?.translation ||
          translations[0]?.translation ||
          '';
        const historyText =
          translationHistory.length > 0
            ? `\n翻译历史:\n${translationHistory.map((h, idx) => `  版本${idx + 1}: ${h}`).join('\n')}`
            : '';
        const paragraphText = `[ID: ${paragraph.id}] ${paragraph.text}\n当前翻译: ${currentTranslation}${historyText}\n\n`;

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
            translationHistories: new Map(currentChunkTranslationHistories),
          });
          currentChunkText = '';
          currentChunkParagraphs = [];
          currentChunkTranslationHistories = new Map();
        }
        currentChunkText += paragraphText;
        currentChunkParagraphs.push(paragraph);
        currentChunkTranslationHistories.set(paragraph.id, translationHistory);
      }
      // 添加最后一个块
      if (currentChunkText.length > 0) {
        chunks.push({
          text: currentChunkText,
          context: getContext(currentChunkParagraphs, book),
          paragraphIds: currentChunkParagraphs.map((p) => p.id),
          translationHistories: new Map(currentChunkTranslationHistories),
        });
      }

      let polishedText = '';
      const paragraphPolishes: { id: string; translation: string }[] = [];

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
            message: `正在润色第 ${i + 1}/${chunks.length} 部分...`,
            status: 'processing',
          });
          // 添加块分隔符
          void aiProcessingStore.appendThinkingMessage(
            taskId,
            `\n\n[=== 润色块 ${i + 1}/${chunks.length} ===]\n\n`,
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
- **语气词**: 适当添加，符合角色风格。
- **自然流畅**: 摆脱翻译腔，使用地道中文。
- **工具**: 优先使用上下文中的术语/角色，勿滥用列表工具。
- **历史参考**: 参考翻译历史，混合匹配最佳表达。`;
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
                detectRepeatingCharacters(accumulatedText, chunkText, { logLabel: 'PolishService' })
              ) {
                throw new Error('AI降级检测：检测到重复字符，停止润色');
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
            // 工具调用完成后，添加提示要求AI继续完成润色
            history.push({
              role: 'user',
              content:
                '工具调用已完成。请继续完成当前文本块的润色任务，返回包含润色结果的JSON格式响应。不要跳过润色，必须提供完整的润色结果。',
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
              detectRepeatingCharacters(finalResponseText, chunkText, { logLabel: 'PolishService' })
            ) {
              throw new Error('AI降级检测：最终响应中检测到重复字符');
            }

            history.push({ role: 'assistant', content: finalResponseText });
            break;
          }
        }

        // 检查是否在达到最大回合数后仍未获得润色结果
        if (!finalResponseText || finalResponseText.trim().length === 0) {
          throw new Error(
            `AI在工具调用后未返回润色结果（已达到最大回合数 ${MAX_TURNS}）。请重试。`,
          );
        }

        // 解析 JSON 响应
        try {
          // 尝试提取 JSON
          const jsonMatch = finalResponseText.match(/\{[\s\S]*\}/);
          let chunkPolish = '';
          const extractedPolishes: Map<string, string> = new Map();

          if (jsonMatch) {
            const jsonStr = jsonMatch[0];
            try {
              const data = JSON.parse(jsonStr);

              // 优先使用 paragraphs 数组（结构化数据）
              if (data.paragraphs && Array.isArray(data.paragraphs)) {
                for (const para of data.paragraphs) {
                  if (para.id && para.translation) {
                    extractedPolishes.set(para.id, para.translation);
                  }
                }

                // 使用 translation 字段作为完整文本，如果没有则从 paragraphs 构建
                if (data.translation) {
                  chunkPolish = data.translation;
                } else if (extractedPolishes.size > 0 && chunk.paragraphIds) {
                  // 从 paragraphs 数组构建完整文本
                  const orderedTexts: string[] = [];
                  for (const paraId of chunk.paragraphIds) {
                    const polish = extractedPolishes.get(paraId);
                    if (polish) {
                      orderedTexts.push(polish);
                    }
                  }
                  chunkPolish = orderedTexts.join('\n\n');
                }
              } else if (data.translation) {
                // 后备方案：只有 translation 字段，尝试从字符串中提取段落ID
                console.warn(
                  `[PolishService] ⚠️ JSON中未找到paragraphs数组（块 ${i + 1}/${chunks.length}），将尝试从translation字符串中提取段落ID`,
                );
                chunkPolish = data.translation;

                // 尝试从字符串中提取段落ID（兼容旧格式）
                const idPattern = /\[ID:\s*([^\]]+)\]\s*([^[]*?)(?=\[ID:|$)/gs;
                idPattern.lastIndex = 0;
                let match;
                while ((match = idPattern.exec(chunkPolish)) !== null) {
                  const paragraphId = match[1]?.trim();
                  const polish = match[2]?.trim();
                  if (paragraphId && polish) {
                    extractedPolishes.set(paragraphId, polish);
                  }
                }
              } else {
                console.warn(
                  `[PolishService] ⚠️ AI响应JSON中未找到translation或paragraphs字段（块 ${i + 1}/${chunks.length}），将使用完整原始响应作为润色结果`,
                );
                chunkPolish = finalResponseText;
              }
            } catch (e) {
              console.warn(
                `[PolishService] ⚠️ 解析AI响应JSON失败（块 ${i + 1}/${chunks.length}）`,
                e instanceof Error ? e.message : String(e),
              );
              // JSON 解析失败，回退到原始文本处理
              chunkPolish = finalResponseText;
            }
          } else {
            // 不是 JSON，直接使用原始文本
            console.warn(
              `[PolishService] ⚠️ AI响应不是JSON格式（块 ${i + 1}/${chunks.length}），将使用完整原始响应作为润色结果`,
            );
            chunkPolish = finalResponseText;
          }

          // 验证：检查当前块中的所有段落是否都有润色结果
          const missingIds: string[] = [];
          if (chunk.paragraphIds && chunk.paragraphIds.length > 0) {
            for (const paraId of chunk.paragraphIds) {
              if (!extractedPolishes.has(paraId)) {
                missingIds.push(paraId);
              }
            }
          }

          if (missingIds.length > 0) {
            console.warn(
              `[PolishService] ⚠️ 块 ${i + 1}/${chunks.length} 中缺失 ${missingIds.length}/${chunk.paragraphIds?.length || 0} 个段落的润色结果`,
              {
                缺失段落ID:
                  missingIds.slice(0, 5).join(', ') +
                  (missingIds.length > 5 ? ` 等 ${missingIds.length} 个` : ''),
                已提取润色数: extractedPolishes.size,
                预期段落数: chunk.paragraphIds?.length || 0,
              },
            );
            // 如果缺少段落ID，使用完整润色文本作为后备方案
            if (extractedPolishes.size === 0) {
              polishedText += chunkPolish;
              if (onChunk) {
                await onChunk({ text: chunkPolish, done: false });
              }
            } else {
              // 部分段落有ID，按顺序处理
              const orderedPolishes: string[] = [];
              const chunkParagraphPolishes: { id: string; translation: string }[] = [];
              if (chunk.paragraphIds) {
                for (const paraId of chunk.paragraphIds) {
                  const polish = extractedPolishes.get(paraId);
                  if (polish) {
                    orderedPolishes.push(polish);
                    const paraPolish = { id: paraId, translation: polish };
                    paragraphPolishes.push(paraPolish);
                    chunkParagraphPolishes.push(paraPolish);
                  }
                }
              }
              const orderedText = orderedPolishes.join('\n\n');
              polishedText += orderedText || chunkPolish;
              if (onChunk) {
                await onChunk({ text: orderedText || chunkPolish, done: false });
              }
              // 通知段落润色完成（即使只有部分段落）
              if (onParagraphPolish && chunkParagraphPolishes.length > 0) {
                onParagraphPolish(chunkParagraphPolishes);
              }
            }
          } else {
            // 所有段落都有润色结果，按顺序组织
            if (extractedPolishes.size > 0 && chunk.paragraphIds) {
              const orderedPolishes: string[] = [];
              const chunkParagraphPolishes: { id: string; translation: string }[] = [];
              for (const paraId of chunk.paragraphIds) {
                const polish = extractedPolishes.get(paraId);
                if (polish) {
                  orderedPolishes.push(polish);
                  const paraPolish = { id: paraId, translation: polish };
                  paragraphPolishes.push(paraPolish);
                  chunkParagraphPolishes.push(paraPolish);
                }
              }
              const orderedText = orderedPolishes.join('\n\n');
              polishedText += orderedText;
              if (onChunk) {
                await onChunk({ text: orderedText, done: false });
              }
              // 通知段落润色完成
              if (onParagraphPolish && chunkParagraphPolishes.length > 0) {
                onParagraphPolish(chunkParagraphPolishes);
              }
            } else {
              // 没有提取到段落润色，使用完整文本
              polishedText += chunkPolish;
              if (onChunk) {
                await onChunk({ text: chunkPolish, done: false });
              }
            }
          }
        } catch (e) {
          console.warn(
            `[PolishService] ⚠️ 解析AI响应失败（块 ${i + 1}/${chunks.length}）`,
            e instanceof Error ? e.message : String(e),
          );
          polishedText += finalResponseText;
          if (onChunk) await onChunk({ text: finalResponseText, done: false });
        }
      }

      if (onChunk) {
        await onChunk({ text: '', done: true });
      }

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.updateTask(taskId, {
          status: 'completed',
          message: '润色完成',
        });
        // 不再自动删除任务，保留思考过程供用户查看
      }

      return {
        text: polishedText,
        paragraphTranslations: paragraphPolishes,
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
            message: error instanceof Error ? error.message : '润色出错',
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
