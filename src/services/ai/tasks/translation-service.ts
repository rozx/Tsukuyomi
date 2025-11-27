import type { AIModel } from 'src/services/ai/types/ai-model';
import type {
  AIServiceConfig,
  TextGenerationRequest,
  TextGenerationStreamCallback,
  AIToolCall,
  AIToolCallResult,
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
import { detectRepeatingCharacters } from 'src/utils/ai-degradation-detector';
import { ToolRegistry } from 'src/services/ai/tools/index';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';

/**
 * 翻译服务选项
 */
export interface TranslationServiceOptions {
  /**
   * 自定义提示词（可选）
   */
  prompt?: string;
  /**
   * 流式数据回调函数，用于接收翻译过程中的数据块
   */
  onChunk?: TextGenerationStreamCallback;
  /**
   * 进度回调函数，用于接收翻译进度更新
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
   * 段落翻译回调函数，用于接收每个块完成后的段落翻译结果
   * @param translations 段落翻译数组，包含段落ID和翻译文本
   */
  onParagraphTranslation?: (translations: { id: string; translation: string }[]) => void;
  /**
   * 取消信号（可选）
   */
  signal?: AbortSignal;
  /**
   * 书籍 ID（用于术语 CRUD 操作）
   */
  bookId?: string;
  /**
   * 章节标题（可选），如果提供，将一起翻译
   */
  chapterTitle?: string;
  /**
   * AI 处理 Store（可选），如果提供，将自动创建和管理任务
   */
  aiProcessingStore?: {
    addTask: (task: Omit<AIProcessingTask, 'id' | 'startTime'>) => Promise<string>;
    updateTask: (id: string, updates: Partial<AIProcessingTask>) => Promise<void>;
    appendThinkingMessage: (id: string, text: string) => Promise<void>;
    removeTask: (id: string) => Promise<void>;
    activeTasks: AIProcessingTask[];
  };
}

export interface TranslationResult {
  text: string;
  taskId?: string;
  paragraphTranslations?: { id: string; translation: string }[];
  titleTranslation?: string;
  actions?: ActionInfo[];
}

/**
 * 翻译服务
 * 使用 AI 服务进行文本翻译，支持术语 CRUD 工具
 */
export class TranslationService {
  static readonly CHUNK_SIZE = 1500;

  /**
   * 检查文本是否只包含符号（不是真正的文本内容）
   * @param text 要检查的文本
   * @returns 如果只包含符号，返回true
   */
  private static isOnlySymbols(text: string): boolean {
    if (!text || text.trim().length === 0) {
      return true;
    }

    // 移除所有空白字符
    const trimmed = text.trim();

    // 检查是否只包含标点符号、数字、特殊符号等
    // 允许的字符：日文假名、汉字、英文字母
    const hasContent =
      /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF\u20000-\u2A6DFa-zA-Z]/.test(trimmed);

    return !hasContent;
  }

  /**
   * 处理工具调用
   * @param toolCall 工具调用对象
   * @param bookId 书籍 ID
   * @param onAction 操作回调
   * @returns 工具调用结果
   */
  static async handleToolCall(
    toolCall: AIToolCall,
    bookId: string,
    onAction?: (action: ActionInfo) => void,
    onToast?: ToastCallback,
  ): Promise<AIToolCallResult> {
    return ToolRegistry.handleToolCall(toolCall, bookId, onAction, onToast);
  }

  /**
   * 翻译文本
   * @param content 要翻译的段落列表
   * @param model AI 模型配置
   * @param options 翻译选项（可选）
   * @returns 翻译后的文本和任务 ID（如果使用了任务管理）
   */
  static async translate(
    content: Paragraph[],
    model: AIModel,
    options?: TranslationServiceOptions,
  ): Promise<TranslationResult> {
    console.log('[TranslationService] 🚀 开始翻译任务', {
      段落数量: content?.length || 0,
      有效段落数: content?.filter((p) => p.text?.trim()).length || 0,
      AI模型: model.name,
      AI提供商: model.provider,
      书籍ID: options?.bookId || '无',
      章节标题: options?.chapterTitle || '无',
      是否使用工具: !!options?.bookId,
    });

    const {
      onChunk,
      onProgress,
      signal,
      bookId,
      chapterTitle,
      aiProcessingStore,
      onParagraphTranslation,
      onToast,
    } = options || {};
    const actions: ActionInfo[] = [];
    let titleTranslation: string | undefined;

    // 内部 action 处理函数，收集 actions 并调用外部 callback
    const handleAction = (action: ActionInfo) => {
      actions.push(action);
      if (options?.onAction) {
        options.onAction(action);
      }
    };

    if (!content || content.length === 0) {
      throw new Error('要翻译的内容不能为空');
    }

    if (!model.enabled) {
      throw new Error('所选模型未启用');
    }

    // 任务管理
    let taskId: string | undefined;
    let abortController: AbortController | undefined;

    if (aiProcessingStore) {
      taskId = await aiProcessingStore.addTask({
        type: 'translation',
        modelName: model.name,
        status: 'thinking',
        message: '正在初始化翻译会话...',
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
      const tools = ToolRegistry.getAllTools(bookId);
      const config: AIServiceConfig = {
        apiKey: model.apiKey,
        baseUrl: model.baseUrl,
        model: model.model,
        temperature: model.isDefault.translation?.temperature ?? 0.7,
        signal: finalSignal,
      };

      // 初始化消息历史
      const history: ChatMessage[] = [];

      // 1. 系统提示词
      const systemPrompt = `你是一个专业的日轻小说翻译助手。

【核心规则】
1. **翻译**:
  - 准确、流畅、符合轻小说风格。
  - 适当地添加语气词，如“呀”、“呢”、“吧”、“啊”等，以增强翻译的语气。
  - 不要过度使用语气词，以免影响翻译的流畅性。
  - 准确地根据角色的说话风格进行翻译，不要使用与角色不符的语气词。
2. **敬语 (严格优先级)**:
   (1) **别名匹配**: 检查【相关角色参考】\`aliases\`。若匹配且有翻译，**必须**使用。
   (2) **角色关系**: 查看 \`description\`。
   (3) **历史搜索**: 用 \`find_paragraph_by_keyword\` 查历史。
   (4) **语境**: 根据上下文判断。
   *禁止自动创建敬语别名。*
3. **数据管理**:
   - **工具使用**: 相关术语和角色已包含在输入中，请先使用上下文中的术语/角色，如果上下文中没有，再调用 list_terms,get_term 或 list_characters,get_character。
   - **分离**: 术语表(物/事) vs 角色表(人)。
   - **创建**: 查重 -> 全名建角色/部分名=别名。
   - **维护**: 填补空缺(翻译/描述)，删除无用/重复。
4. **记忆管理**:
   - **参考记忆**: 翻译前可使用 search_memory_by_keyword 搜索相关的背景设定、角色信息等记忆内容，使用 get_memory 获取完整内容，确保翻译风格和术语使用的一致性。
   - **保存记忆**: 完成章节翻译后，可使用 create_memory 保存章节摘要（需要自己生成 summary）。重要背景设定也可保存供后续参考。
   - **搜索后保存**: 当你通过工具（如 search_paragraph_by_keyword、get_chapter_info 等）搜索或检索了大量内容时，应该主动使用 create_memory 保存这些重要信息，以便后续快速参考。
5. **输出**: 必须返回有效 JSON 格式:
   {
     "paragraphs": [{ "id": "段落ID", "translation": "翻译内容" }],
     "translation": "完整翻译文本",
     "titleTranslation": "章节标题翻译(仅当提供标题时)"
   }
   确保 paragraphs 数组包含所有输入段落的 ID 和对应翻译。`;

      history.push({ role: 'system', content: systemPrompt });

      // 2. 初始用户提示
      const initialUserPrompt = `开始翻译。

【执行要点】
- **敬语**: 别名匹配优先。
- **角色**: 创建前必查重。全名=角色，部分名=别名。
- **维护**: 自动修复空数据，清理无用数据。
- **一致性**: 善用搜索工具。
- **记忆**: 翻译前搜索相关记忆，完成后可保存章节摘要。

请按 JSON 格式返回。`;

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.updateTask(taskId, { message: '正在建立连接...' });
      }

      // 切分文本
      const CHUNK_SIZE = TranslationService.CHUNK_SIZE;
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
            `[TranslationService] ⚠️ 获取书籍数据失败（书籍ID: ${bookId}），将跳过上下文提取（术语、角色参考）`,
            e instanceof Error ? e.message : e,
          );
        }
      }

      // 计算全文的角色出现得分，用于消歧义
      let characterScores: Map<string, number> | undefined;
      if (book && book.characterSettings) {
        const fullText = content.map((p) => p.text).join('\n');
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

      for (const paragraph of content) {
        // 跳过空段落（原始文本为空或只有空白字符）
        if (!paragraph.text || paragraph.text.trim().length === 0) {
          continue;
        }

        // 格式化段落：[ID: {id}] {text}
        const paragraphText = `[ID: ${paragraph.id}] ${paragraph.text}\n\n`;

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

      let translatedText = '';
      const paragraphTranslations: { id: string; translation: string }[] = [];

      // 3. 循环处理每个块（带重试机制）
      const MAX_RETRIES = 2; // 最大重试次数
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
            message: `正在翻译第 ${i + 1}/${chunks.length} 部分...`,
            status: 'processing',
          });
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
        let content = '';
        const maintenanceReminder = `
⚠️ **提醒**:
- **敬语**: 优先匹配别名。勿自动创建别名。
- **角色**: 创建前查重。
- **维护**: 补全空数据，删无用数据。
- **工具**: 优先使用上下文中的术语/角色，勿滥用列表工具。
- **一致性**: 搜历史。`;
        if (i === 0) {
          // 如果有标题，在第一个块中包含标题翻译
          const titleSection = chapterTitle ? `【章节标题】\n${chapterTitle}\n\n` : '';
          content = `${initialUserPrompt}\n\n以下是第一部分内容：\n\n${titleSection}${chunkContext}${chunkText}${maintenanceReminder}`;
        } else {
          content = `接下来的内容：\n\n${chunkContext}${chunkText}${maintenanceReminder}`;
        }

        // 重试循环
        let retryCount = 0;
        let chunkProcessed = false;
        let finalResponseText = '';

        while (retryCount <= MAX_RETRIES && !chunkProcessed) {
          try {
            // 如果是重试，移除上次失败的消息
            if (retryCount > 0) {
              // 移除上次的用户消息和助手回复（如果有）
              if (history.length > 0 && history[history.length - 1]?.role === 'user') {
                history.pop();
              }
              if (history.length > 0 && history[history.length - 1]?.role === 'assistant') {
                history.pop();
              }

              console.warn(
                `[TranslationService] ⚠️ 检测到AI降级或错误，重试块 ${i + 1}/${chunks.length}（第 ${retryCount}/${MAX_RETRIES} 次重试）`,
              );

              if (aiProcessingStore && taskId) {
                void aiProcessingStore.updateTask(taskId, {
                  message: `检测到AI降级，正在重试第 ${retryCount}/${MAX_RETRIES} 次...`,
                  status: 'processing',
                });
              }
            }

            history.push({ role: 'user', content });

            let currentTurnCount = 0;
            const MAX_TURNS = 5; // 防止工具调用死循环

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
              let accumulatedText = ''; // 用于检测重复字符

              // 确保 AI 请求完全完成后再继续
              const result = await service.generateText(config, request, (c) => {
                // 处理流式输出
                if (c.text) {
                  if (!chunkReceived && aiProcessingStore && taskId) {
                    chunkReceived = true;
                  }

                  // 累积文本用于检测重复字符
                  accumulatedText += c.text;

                  // 检测重复字符（AI降级检测），传入原文进行比较
                  if (
                    detectRepeatingCharacters(accumulatedText, chunkText, {
                      logLabel: 'TranslationService',
                    })
                  ) {
                    throw new Error('AI降级检测：检测到重复字符，停止翻译');
                  }

                  // 累积思考消息（异步操作，但不阻塞）
                  if (aiProcessingStore && taskId) {
                    void aiProcessingStore.appendThinkingMessage(taskId, c.text);
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
                // 工具调用完成后，添加提示要求AI继续完成翻译
                history.push({
                  role: 'user',
                  content:
                    '工具调用已完成。请继续完成当前文本块的翻译任务，返回包含翻译结果的JSON格式响应。不要跳过翻译，必须提供完整的翻译结果。',
                });
                // 继续循环，将工具结果和提示发送给 AI
              } else {
                // 没有工具调用，这是最终回复
                finalResponseText = result.text;

                // 再次检测最终响应中的重复字符，传入原文进行比较
                if (
                  detectRepeatingCharacters(finalResponseText, chunkText, {
                    logLabel: 'TranslationService',
                  })
                ) {
                  throw new Error('AI降级检测：最终响应中检测到重复字符');
                }

                history.push({ role: 'assistant', content: finalResponseText });
                break;
              }
            }

            // 检查是否在达到最大回合数后仍未获得翻译结果
            if (!finalResponseText || finalResponseText.trim().length === 0) {
              throw new Error(
                `AI在工具调用后未返回翻译结果（已达到最大回合数 ${MAX_TURNS}）。请重试。`,
              );
            }

            // 解析 JSON 响应
            try {
              // 尝试提取 JSON
              const jsonMatch = finalResponseText.match(/\{[\s\S]*\}/);
              let chunkTranslation = '';
              const extractedTranslations: Map<string, string> = new Map();

              // 如果是第一个块且有标题，尝试提取标题翻译（在 JSON 解析之前和之后都尝试）
              if (i === 0 && chapterTitle) {
                // 首先尝试从 JSON 中提取
                if (jsonMatch) {
                  try {
                    const jsonStr = jsonMatch[0];
                    const data = JSON.parse(jsonStr);
                    if (data.titleTranslation) {
                      titleTranslation = data.titleTranslation;
                    }
                  } catch {
                    // JSON 解析失败，稍后在外部 try-catch 中处理
                  }
                }

                // 如果 JSON 提取失败，尝试从文本中直接提取标题翻译
                if (!titleTranslation) {
                  // 尝试匹配 "titleTranslation": "..." 模式
                  const titleMatch = finalResponseText.match(/"titleTranslation"\s*:\s*"([^"]+)"/);
                  if (titleMatch && titleMatch[1]) {
                    titleTranslation = titleMatch[1];
                  }
                }
              }

              if (jsonMatch) {
                const jsonStr = jsonMatch[0];
                try {
                  const data = JSON.parse(jsonStr);

                  // 如果是第一个块且有标题，再次尝试提取标题翻译（确保提取到最新值）
                  if (i === 0 && chapterTitle && data.titleTranslation) {
                    titleTranslation = data.titleTranslation;
                  }

                  // 优先使用 paragraphs 数组（结构化数据）
                  if (data.paragraphs && Array.isArray(data.paragraphs)) {
                    for (const para of data.paragraphs) {
                      if (para.id && para.translation) {
                        extractedTranslations.set(para.id, para.translation);
                      }
                    }

                    // 使用 translation 字段作为完整文本，如果没有则从 paragraphs 构建
                    if (data.translation) {
                      chunkTranslation = data.translation;
                    } else if (extractedTranslations.size > 0 && chunk.paragraphIds) {
                      // 从 paragraphs 数组构建完整文本
                      const orderedTexts: string[] = [];
                      for (const paraId of chunk.paragraphIds) {
                        const translation = extractedTranslations.get(paraId);
                        if (translation) {
                          orderedTexts.push(translation);
                        }
                      }
                      chunkTranslation = orderedTexts.join('\n\n');
                    }
                  } else if (data.translation) {
                    // 后备方案：只有 translation 字段，尝试从字符串中提取段落ID
                    console.warn(
                      `[TranslationService] ⚠️ JSON中未找到paragraphs数组（块 ${i + 1}/${chunks.length}），将尝试从translation字符串中提取段落ID`,
                    );
                    chunkTranslation = data.translation;

                    // 尝试从字符串中提取段落ID（兼容旧格式）
                    const idPattern = /\[ID:\s*([^\]]+)\]\s*([^[]*?)(?=\[ID:|$)/gs;
                    idPattern.lastIndex = 0;
                    let match;
                    while ((match = idPattern.exec(chunkTranslation)) !== null) {
                      const paragraphId = match[1]?.trim();
                      const translation = match[2]?.trim();
                      if (paragraphId && translation) {
                        extractedTranslations.set(paragraphId, translation);
                      }
                    }
                  } else {
                    console.warn(
                      `[TranslationService] ⚠️ AI响应JSON中未找到translation或paragraphs字段（块 ${i + 1}/${chunks.length}），将使用完整原始响应作为翻译`,
                    );
                    chunkTranslation = finalResponseText;
                  }
                } catch (e) {
                  console.warn(
                    `[TranslationService] ⚠️ 解析AI响应JSON失败（块 ${i + 1}/${chunks.length}）`,
                    e instanceof Error ? e.message : String(e),
                  );
                  // JSON 解析失败，回退到原始文本处理
                  chunkTranslation = finalResponseText;
                }
              } else {
                // 不是 JSON，直接使用原始文本
                console.warn(
                  `[TranslationService] ⚠️ AI响应不是JSON格式（块 ${i + 1}/${chunks.length}），将使用完整原始响应作为翻译`,
                );
                chunkTranslation = finalResponseText;
              }

              // 验证：检查当前块中的所有段落是否都有翻译
              const missingIds: string[] = [];
              if (chunk.paragraphIds && chunk.paragraphIds.length > 0) {
                for (const paraId of chunk.paragraphIds) {
                  if (!extractedTranslations.has(paraId)) {
                    missingIds.push(paraId);
                  }
                }
              }

              if (missingIds.length > 0) {
                console.warn(
                  `[TranslationService] ⚠️ 块 ${i + 1}/${chunks.length} 中缺失 ${missingIds.length}/${chunk.paragraphIds?.length || 0} 个段落的翻译`,
                  {
                    缺失段落ID:
                      missingIds.slice(0, 5).join(', ') +
                      (missingIds.length > 5 ? ` 等 ${missingIds.length} 个` : ''),
                    已提取翻译数: extractedTranslations.size,
                    预期段落数: chunk.paragraphIds?.length || 0,
                  },
                );
                // 如果缺少段落ID，使用完整翻译文本作为后备方案
                if (extractedTranslations.size === 0) {
                  console.warn(
                    `[TranslationService] ⚠️ 块 ${i + 1}/${chunks.length} 未找到任何段落ID，将整个翻译文本作为后备方案`,
                  );
                  translatedText += chunkTranslation;
                  if (onChunk) {
                    await onChunk({ text: chunkTranslation, done: false });
                  }
                } else {
                  // 部分段落有ID，按顺序处理
                  const orderedTranslations: string[] = [];
                  const chunkParagraphTranslations: { id: string; translation: string }[] = [];
                  if (chunk.paragraphIds) {
                    for (const paraId of chunk.paragraphIds) {
                      const translation = extractedTranslations.get(paraId);
                      if (translation) {
                        orderedTranslations.push(translation);
                        const paraTranslation = { id: paraId, translation };
                        paragraphTranslations.push(paraTranslation);
                        chunkParagraphTranslations.push(paraTranslation);
                      }
                    }
                  }
                  const orderedText = orderedTranslations.join('\n\n');
                  translatedText += orderedText || chunkTranslation;
                  if (onChunk) {
                    await onChunk({ text: orderedText || chunkTranslation, done: false });
                  }
                  // 通知段落翻译完成（即使只有部分段落）
                  if (onParagraphTranslation && chunkParagraphTranslations.length > 0) {
                    onParagraphTranslation(chunkParagraphTranslations);
                  }
                }
              } else {
                // 所有段落都有翻译，按顺序组织
                if (extractedTranslations.size > 0 && chunk.paragraphIds) {
                  const orderedTranslations: string[] = [];
                  const chunkParagraphTranslations: { id: string; translation: string }[] = [];
                  for (const paraId of chunk.paragraphIds) {
                    const translation = extractedTranslations.get(paraId);
                    if (translation) {
                      orderedTranslations.push(translation);
                      const paraTranslation = { id: paraId, translation };
                      paragraphTranslations.push(paraTranslation);
                      chunkParagraphTranslations.push(paraTranslation);
                    }
                  }
                  const orderedText = orderedTranslations.join('\n\n');
                  translatedText += orderedText;
                  if (onChunk) {
                    await onChunk({ text: orderedText, done: false });
                  }
                  // 通知段落翻译完成
                  if (onParagraphTranslation && chunkParagraphTranslations.length > 0) {
                    onParagraphTranslation(chunkParagraphTranslations);
                  }
                } else {
                  // 没有提取到段落翻译，使用完整文本
                  translatedText += chunkTranslation;
                  if (onChunk) {
                    await onChunk({ text: chunkTranslation, done: false });
                  }
                }
              }
            } catch (e) {
              console.warn(
                `[TranslationService] ⚠️ 解析AI响应失败（块 ${i + 1}/${chunks.length}）`,
                e instanceof Error ? e.message : String(e),
              );
              translatedText += finalResponseText;
              if (onChunk) await onChunk({ text: finalResponseText, done: false });
            }

            // 标记块已成功处理（在所有处理完成后）
            chunkProcessed = true;
          } catch (error) {
            // 检查是否是AI降级错误
            const isDegradedError =
              error instanceof Error &&
              (error.message.includes('AI降级检测') || error.message.includes('重复字符'));

            if (isDegradedError) {
              retryCount++;
              if (retryCount > MAX_RETRIES) {
                // 重试次数用尽，抛出错误
                console.error(
                  `[TranslationService] ❌ AI降级检测失败，块 ${i + 1}/${chunks.length} 已重试 ${MAX_RETRIES} 次仍失败，停止翻译`,
                  {
                    块索引: i + 1,
                    总块数: chunks.length,
                    重试次数: MAX_RETRIES,
                    段落ID: chunk.paragraphIds?.slice(0, 3).join(', ') + '...',
                  },
                );
                throw new Error(
                  `AI降级：检测到重复字符，已重试 ${MAX_RETRIES} 次仍失败。请检查AI服务状态或稍后重试。`,
                );
              }
              // 继续重试循环
              continue;
            } else {
              // 其他错误，直接抛出
              throw error;
            }
          }
        }
      }

      if (onChunk) {
        await onChunk({ text: '', done: true });
      }

      // 最终验证：确保所有段落都有翻译（排除原始文本为空的段落或只包含符号的段落）
      const paragraphsWithText = content.filter((p) => {
        if (!p.text || p.text.trim().length === 0) {
          return false;
        }
        // 排除只包含符号的段落
        return !this.isOnlySymbols(p.text);
      });
      const allParagraphIds = new Set(paragraphsWithText.map((p) => p.id));
      const translatedParagraphIds = new Set(paragraphTranslations.map((pt) => pt.id));
      const missingParagraphIds = Array.from(allParagraphIds).filter(
        (id) => !translatedParagraphIds.has(id),
      );

      // 如果有缺失翻译的段落，重新翻译它们
      if (missingParagraphIds.length > 0) {
        console.warn(
          `[TranslationService] ⚠️ 发现 ${missingParagraphIds.length}/${paragraphsWithText.length} 个段落缺少翻译，将重新翻译`,
          {
            缺失段落ID:
              missingParagraphIds.slice(0, 5).join(', ') +
              (missingParagraphIds.length > 5 ? ` 等 ${missingParagraphIds.length} 个` : ''),
            总有效段落数: paragraphsWithText.length,
            已翻译段落数: paragraphTranslations.length,
          },
        );

        if (aiProcessingStore && taskId) {
          void aiProcessingStore.updateTask(taskId, {
            message: `发现 ${missingParagraphIds.length} 个段落缺少翻译，正在重新翻译...`,
            status: 'processing',
          });
        }

        // 获取需要重新翻译的段落
        const missingParagraphs = paragraphsWithText.filter((p) =>
          missingParagraphIds.includes(p.id),
        );

        // 重新翻译缺失的段落
        try {
          const missingChunkText = missingParagraphs
            .map((p) => `[ID: ${p.id}] ${p.text}\n\n`)
            .join('');
          const missingChunkContext = getContext(missingParagraphs, book);

          // 构建翻译请求
          const retryContent = `以下段落缺少翻译，请为每个段落提供翻译：\n\n${missingChunkContext}${missingChunkText}`;
          history.push({ role: 'user', content: retryContent });

          let currentTurnCount = 0;
          const MAX_TURNS = 5;
          let finalResponseText = '';

          while (currentTurnCount < MAX_TURNS) {
            currentTurnCount++;

            const request: TextGenerationRequest = {
              messages: history,
            };

            if (tools.length > 0) {
              request.tools = tools;
            }

            let accumulatedText = '';
            const result = await service.generateText(config, request, (c) => {
              if (c.text) {
                accumulatedText += c.text;
                if (
                  detectRepeatingCharacters(accumulatedText, missingChunkText, {
                    logLabel: 'TranslationService',
                  })
                ) {
                  throw new Error('AI降级检测：检测到重复字符，停止翻译');
                }
                if (aiProcessingStore && taskId) {
                  void aiProcessingStore.appendThinkingMessage(taskId, c.text);
                }
              }
              return Promise.resolve();
            });

            if (result.toolCalls && result.toolCalls.length > 0) {
              history.push({
                role: 'assistant',
                content: result.text || null,
                tool_calls: result.toolCalls,
              });

              for (const toolCall of result.toolCalls) {
                if (aiProcessingStore && taskId) {
                  void aiProcessingStore.appendThinkingMessage(
                    taskId,
                    `\n[调用工具: ${toolCall.function.name}]\n`,
                  );
                }

                const toolResult = await TranslationService.handleToolCall(
                  toolCall,
                  bookId || '',
                  handleAction,
                  onToast,
                );

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
              // 工具调用完成后，添加提示要求AI继续完成翻译
              history.push({
                role: 'user',
                content:
                  '工具调用已完成。请继续完成当前文本块的翻译任务，返回包含翻译结果的JSON格式响应。不要跳过翻译，必须提供完整的翻译结果。',
              });
            } else {
              finalResponseText = result.text;
              if (
                detectRepeatingCharacters(finalResponseText, missingChunkText, {
                  logLabel: 'TranslationService',
                })
              ) {
                throw new Error('AI降级检测：最终响应中检测到重复字符');
              }
              history.push({ role: 'assistant', content: finalResponseText });
              break;
            }
          }

          // 检查是否在达到最大回合数后仍未获得翻译结果
          if (!finalResponseText || finalResponseText.trim().length === 0) {
            throw new Error(
              `AI在工具调用后未返回翻译结果（已达到最大回合数 ${MAX_TURNS}）。请重试。`,
            );
          }

          // 解析重新翻译的结果
          const jsonMatch = finalResponseText.match(/\{[\s\S]*\}/);
          const retranslatedParagraphs: { id: string; translation: string }[] = [];
          if (jsonMatch) {
            try {
              const data = JSON.parse(jsonMatch[0]);
              if (data.paragraphs && Array.isArray(data.paragraphs)) {
                for (const para of data.paragraphs) {
                  if (para.id && para.translation && missingParagraphIds.includes(para.id)) {
                    const paraTranslation = {
                      id: para.id,
                      translation: para.translation,
                    };
                    // 检查是否已存在，如果存在则更新，否则添加
                    const existingIndex = paragraphTranslations.findIndex(
                      (pt) => pt.id === para.id,
                    );
                    if (existingIndex >= 0) {
                      paragraphTranslations[existingIndex] = paraTranslation;
                    } else {
                      paragraphTranslations.push(paraTranslation);
                    }
                    retranslatedParagraphs.push(paraTranslation);
                  }
                }
              }
            } catch (e) {
              console.warn(
                `[TranslationService] ⚠️ 解析重新翻译结果失败，缺失 ${missingParagraphIds.length} 个段落`,
                e instanceof Error ? e.message : String(e),
              );
            }
          }
          // 通知重新翻译的段落完成
          if (onParagraphTranslation && retranslatedParagraphs.length > 0) {
            onParagraphTranslation(retranslatedParagraphs);
          }
        } catch (error) {
          console.error(
            `[TranslationService] ❌ 重新翻译缺失段落失败，${missingParagraphIds.length} 个段落未翻译`,
            {
              错误: error instanceof Error ? error.message : String(error),
              缺失段落数: missingParagraphIds.length,
              缺失段落ID: missingParagraphIds.slice(0, 5).join(', ') + '...',
            },
          );
          // 即使重新翻译失败，也继续执行，至少我们已经记录了警告
        }
      } else {
        console.log(
          `[TranslationService] ✅ 翻译完成：所有 ${paragraphsWithText.length} 个有效段落都有翻译`,
        );
      }

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.updateTask(taskId, {
          status: 'completed',
          message: '翻译完成',
        });
        // 不再自动删除任务，保留思考过程供用户查看
      }

      return {
        text: translatedText,
        paragraphTranslations,
        ...(titleTranslation ? { titleTranslation } : {}),
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
            message: error instanceof Error ? error.message : '翻译出错',
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
