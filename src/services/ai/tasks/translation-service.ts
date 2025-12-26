import type { AIModel } from 'src/services/ai/types/ai-model';
import type {
  AIServiceConfig,
  TextGenerationStreamCallback,
  AIToolCall,
  AIToolCallResult,
  ChatMessage,
} from 'src/services/ai/types/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { Paragraph } from 'src/models/novel';
import { AIServiceFactory } from '../index';

import { ToolRegistry } from 'src/services/ai/tools/index';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import { getTodosSystemPrompt } from './utils/todo-helper';
import {
  executeToolCallLoop,
  type AIProcessingStore,
  buildMaintenanceReminder,
  createUnifiedAbortController,
  initializeTask,
  getSpecialInstructions,
  buildChunks,
  isOnlySymbols,
  handleTaskError,
  completeTask,
  buildIndependentChunkPrompt,
  buildChapterContextSection,
  buildBookContextSection,
  buildSpecialInstructionsSection,
  type TextChunk,
  filterProcessedParagraphs,
  markProcessedParagraphs,
  markProcessedParagraphsFromMap,
} from './utils/ai-task-helper';
import {
  getSymbolFormatRules,
  getDataManagementRules,
  getMemoryWorkflowRules,
  getToolUsageInstructions,
  getOutputFormatRules,
} from './prompts';

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
  onParagraphTranslation?: (
    translations: { id: string; translation: string }[],
  ) => void | Promise<void>;
  /**
   * 标题翻译回调函数，用于接收标题翻译结果（在收到后立即调用，不等待翻译完成）
   * @param translation 标题翻译文本
   */
  onTitleTranslation?: (translation: string) => void | Promise<void>;
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
   * 章节 ID（可选），如果提供，将在上下文中提供给 AI
   */
  chapterId?: string;
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
  static readonly CHUNK_SIZE = 2500;

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
    taskId?: string,
  ): Promise<AIToolCallResult> {
    return ToolRegistry.handleToolCall(toolCall, bookId, onAction, onToast, taskId);
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
      chapterId,
      aiProcessingStore,
      onParagraphTranslation,
      onTitleTranslation,
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

    // 使用共享工具初始化任务
    const { taskId, abortController } = await initializeTask(
      aiProcessingStore as AIProcessingStore | undefined,
      'translation',
      model.name,
      {
        ...(typeof bookId === 'string' ? { bookId } : {}),
        ...(typeof chapterId === 'string' ? { chapterId } : {}),
        ...(typeof chapterTitle === 'string' ? { chapterTitle } : {}),
      },
    );

    // 使用共享工具创建统一的 AbortController
    const { controller: internalController, cleanup: cleanupAbort } = createUnifiedAbortController(
      signal,
      abortController,
    );
    const finalSignal = internalController.signal;

    try {
      const service = AIServiceFactory.getService(model.provider);
      // 使用翻译专用工具集，排除导航和列表工具，让AI专注于当前文本块
      const tools = ToolRegistry.getTranslationTools(bookId);
      const config: AIServiceConfig = {
        apiKey: model.apiKey,
        baseUrl: model.baseUrl,
        model: model.model,
        temperature: model.isDefault.translation?.temperature ?? 0.7,
        signal: finalSignal,
      };

      // 使用共享工具获取特殊指令
      const specialInstructions = await getSpecialInstructions(bookId, chapterId, 'translation');

      // 1. 系统提示词（使用共享提示词模块）- 每个 chunk 都会使用这个系统提示
      const todosPrompt = taskId ? getTodosSystemPrompt(taskId) : '';
      const specialInstructionsSection = buildSpecialInstructionsSection(specialInstructions);

      // 构建书籍上下文信息（书名/简介/标签）
      const bookContextSection = await buildBookContextSection(bookId);

      // 构建章节上下文信息
      const chapterContextSection = buildChapterContextSection(chapterId, chapterTitle);

      const systemPrompt = `你是专业的日轻小说翻译助手，将日语翻译为自然流畅的简体中文。${todosPrompt}${bookContextSection}${chapterContextSection}${specialInstructionsSection}

【核心规则】
1. **1:1对应**: 一个原文段落=一个翻译段落，禁止合并/拆分
2. **术语一致**: 使用术语表和角色表确保全文一致
3. **自然流畅**: 符合轻小说风格，适当添加语气词（按角色speaking_style）
4. **前后一致**: 参考前文翻译，保持人名/术语/风格一致
5. ${getSymbolFormatRules()}

${getDataManagementRules()}

${getToolUsageInstructions('translation', tools)}

${getMemoryWorkflowRules()}

${getOutputFormatRules('translation')}
`;

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.updateTask(taskId, { message: '正在建立连接...' });
      }

      // 使用共享工具切分文本
      // 注意：chunks 会在循环中动态更新，以排除已处理的段落
      let chunks = buildChunks(
        content,
        TranslationService.CHUNK_SIZE,
        (p) => `[ID: ${p.id}] ${p.text}\n\n`,
        (p) => !!p.text?.trim(),
      );

      let translatedText = '';
      const paragraphTranslations: { id: string; translation: string }[] = [];
      // 跟踪已处理的段落 ID（用于排除已处理的段落，避免重复处理）
      const processedParagraphIds = new Set<string>();

      // 3. 循环处理每个块（带重试机制）
      const MAX_RETRIES = 2; // 最大重试次数
      let chunkIndex = 0;
      while (chunkIndex < chunks.length) {
        // 检查是否已取消
        if (finalSignal.aborted) {
          throw new Error('请求已取消');
        }

        const chunk = chunks[chunkIndex];
        if (!chunk) {
          chunkIndex++;
          continue;
        }

        // 过滤掉已处理的段落（如果 AI 在之前的 chunk 中处理了更多段落）
        const unprocessedParagraphIds = filterProcessedParagraphs(
          chunk,
          processedParagraphIds,
          'TranslationService',
          chunkIndex,
          chunks.length,
        );
        if (!unprocessedParagraphIds) {
          chunkIndex++;
          continue;
        }

        // 如果当前 chunk 包含已处理的段落，需要重新构建 chunk
        let actualChunk: TextChunk = chunk;
        if (unprocessedParagraphIds.length < chunk.paragraphIds.length) {
          // 需要重新构建 chunk，只包含未处理的段落
          const unprocessedContent = content.filter((p) => unprocessedParagraphIds.includes(p.id));
          const rebuiltChunks = buildChunks(
            unprocessedContent,
            TranslationService.CHUNK_SIZE,
            (p) => `[ID: ${p.id}] ${p.text}\n\n`,
            (p) => !!p.text?.trim(),
          );
          const firstRebuiltChunk = rebuiltChunks[0];
          if (firstRebuiltChunk) {
            actualChunk = firstRebuiltChunk;
            // 如果还有更多未处理的段落，更新 chunks 列表
            if (rebuiltChunks.length > 1) {
              chunks = [
                ...chunks.slice(0, chunkIndex + 1),
                ...rebuiltChunks.slice(1),
                ...chunks.slice(chunkIndex + 1),
              ];
            }
          } else {
            // 没有未处理的段落，跳过
            chunkIndex++;
            continue;
          }
        }

        const chunkText = actualChunk.text;

        if (aiProcessingStore && taskId) {
          void aiProcessingStore.updateTask(taskId, {
            message: `正在翻译第 ${chunkIndex + 1}/${chunks.length} 部分...`,
            status: 'processing',
          });
          // 添加块分隔符
          void aiProcessingStore.appendThinkingMessage(
            taskId,
            `\n\n[=== 翻译块 ${chunkIndex + 1}/${chunks.length} ===]\n\n`,
          );
        }

        if (onProgress) {
          const progress: {
            total: number;
            current: number;
            currentParagraphs?: string[];
          } = {
            total: chunks.length,
            current: chunkIndex + 1,
          };
          if (actualChunk.paragraphIds) {
            progress.currentParagraphs = actualChunk.paragraphIds;
          }
          onProgress(progress);
        }

        // 为每个 chunk 创建独立的 history，避免上下文共享
        // 每个 chunk 只包含 system prompt 和当前 chunk 的内容
        const chunkHistory: ChatMessage[] = [{ role: 'system', content: systemPrompt }];

        // 构建当前消息 - 使用独立的 chunk 提示（避免 max token 问题）
        const maintenanceReminder = buildMaintenanceReminder('translation');
        // 计算当前块的段落数量（用于提示AI）
        const currentChunkParagraphCount = actualChunk.paragraphIds?.length || 0;
        const paragraphCountNote = `\n[警告] 注意：本部分包含 ${currentChunkParagraphCount} 个段落（空段落已过滤）。`;

        // 使用独立的 chunk 提示，每个 chunk 独立
        // 每个 chunk 会包含当前 chunk 中出现的术语和角色
        const chunkContent = buildIndependentChunkPrompt(
          'translation',
          chunkIndex,
          chunks.length,
          chunkText,
          paragraphCountNote,
          maintenanceReminder,
          chapterId,
          chunkIndex === 0 ? chapterTitle : undefined, // 只在第一个 chunk 包含标题
          bookId, // 传递 bookId 用于提取当前 chunk 中的术语和角色
        );

        // 重试循环
        let retryCount = 0;
        let chunkProcessed = false;

        while (retryCount <= MAX_RETRIES && !chunkProcessed) {
          try {
            // 如果是重试，移除上次失败的消息
            if (retryCount > 0) {
              // 移除上次的用户消息和助手回复（如果有）
              if (
                chunkHistory.length > 1 &&
                chunkHistory[chunkHistory.length - 1]?.role === 'user'
              ) {
                chunkHistory.pop();
              }
              if (
                chunkHistory.length > 1 &&
                chunkHistory[chunkHistory.length - 1]?.role === 'assistant'
              ) {
                chunkHistory.pop();
              }

              console.warn(
                `[TranslationService] ⚠️ 检测到AI降级或错误，重试块 ${chunkIndex + 1}/${chunks.length}（第 ${retryCount}/${MAX_RETRIES} 次重试）`,
              );

              if (aiProcessingStore && taskId) {
                void aiProcessingStore.updateTask(taskId, {
                  message: `检测到AI降级，正在重试第 ${retryCount}/${MAX_RETRIES} 次...`,
                  status: 'processing',
                });
              }
            }

            chunkHistory.push({ role: 'user', content: chunkContent });

            // 使用共享的工具调用循环（基于状态的流程）
            // 后续 chunk 使用简短规划模式（已有规划上下文）
            const loopResult = await executeToolCallLoop({
              history: chunkHistory,
              tools,
              generateText: service.generateText.bind(service),
              aiServiceConfig: config,
              taskType: 'translation',
              chunkText,
              paragraphIds: actualChunk.paragraphIds,
              bookId: bookId || '',
              handleAction,
              onToast,
              taskId,
              aiProcessingStore: aiProcessingStore as AIProcessingStore | undefined,
              logLabel: 'TranslationService',
              // 后续 chunk 使用简短规划模式（当前 chunk 的术语和角色已在提示中提供）
              isBriefPlanning: chunkIndex > 0,
              // 收集 actions 用于检测规划上下文更新
              collectedActions: actions,
              // 立即回调：当段落翻译提取时立即通知（不等待循环完成）
              onParagraphsExtracted: onParagraphTranslation
                ? async (paragraphs) => {
                    // 记录到累积列表
                    for (const para of paragraphs) {
                      paragraphTranslations.push(para);
                    }
                    // 标记为已处理
                    markProcessedParagraphs(paragraphs, processedParagraphIds);
                    // 立即调用外部回调
                    try {
                      await onParagraphTranslation(paragraphs);
                    } catch (error) {
                      console.error(
                        `[TranslationService] ⚠️ 段落回调失败（块 ${chunkIndex + 1}/${chunks.length}）`,
                        error,
                      );
                    }
                  }
                : undefined,
              // 立即回调：当标题翻译提取时立即通知（仅第一个块）
              onTitleExtracted:
                chunkIndex === 0 && chapterTitle && onTitleTranslation
                  ? async (title) => {
                      titleTranslation = title;
                      try {
                        await onTitleTranslation(title);
                      } catch (error) {
                        console.error(`[TranslationService] ⚠️ 标题回调失败`, error);
                      }
                    }
                  : undefined,
            });

            // 检查状态
            if (loopResult.status !== 'end') {
              throw new Error(`翻译任务未完成（状态: ${loopResult.status}）。请重试。`);
            }

            // 注意：标题翻译和段落翻译的回调已经在 executeToolCallLoop 中立即调用
            // 这里只需要处理 translatedText 用于最终返回

            // 使用从状态流程中提取的段落翻译构建文本
            const extractedTranslations = loopResult.paragraphs;

            // 标记所有已处理的段落（包括 AI 可能处理了超出当前 chunk 范围的段落）
            markProcessedParagraphsFromMap(extractedTranslations, processedParagraphIds);

            // 按顺序组织翻译文本（用于最终返回）
            if (extractedTranslations.size > 0 && actualChunk.paragraphIds) {
              const orderedTranslations: string[] = [];
              for (const paraId of actualChunk.paragraphIds) {
                const translation = extractedTranslations.get(paraId);
                if (translation) {
                  orderedTranslations.push(translation);
                }
              }
              const orderedText = orderedTranslations.join('\n\n');
              translatedText += orderedText;
              if (onChunk) {
                await onChunk({ text: orderedText, done: false });
              }
            } else {
              // 没有提取到段落翻译，使用完整文本作为后备
              const fallbackText = loopResult.responseText || '';
              translatedText += fallbackText;
              if (onChunk) {
                await onChunk({ text: fallbackText, done: false });
              }
            }

            // 标记块已成功处理（在所有处理完成后）
            chunkProcessed = true;
            chunkIndex++; // 移动到下一个 chunk
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
                  `[TranslationService] ❌ AI降级检测失败，块 ${chunkIndex + 1}/${chunks.length} 已重试 ${MAX_RETRIES} 次仍失败，停止翻译`,
                  {
                    块索引: chunkIndex + 1,
                    总块数: chunks.length,
                    重试次数: MAX_RETRIES,
                    段落ID: actualChunk.paragraphIds?.slice(0, 3).join(', ') + '...',
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

      // 验证：确保所有段落都有翻译（排除原始文本为空的段落或只包含符号的段落）
      const paragraphsWithText = content.filter((p) => {
        if (!p.text || p.text.trim().length === 0) {
          return false;
        }
        // 使用共享工具排除只包含符号的段落
        return !isOnlySymbols(p.text);
      });
      const allParagraphIds = new Set(paragraphsWithText.map((p) => p.id));
      const translatedParagraphIds = new Set(paragraphTranslations.map((pt) => pt.id));
      const missingParagraphIds = Array.from(allParagraphIds).filter(
        (id) => !translatedParagraphIds.has(id),
      );

      if (missingParagraphIds.length > 0) {
        console.warn(
          `[TranslationService] ⚠️ 发现 ${missingParagraphIds.length}/${paragraphsWithText.length} 个段落缺少翻译`,
          {
            缺失段落ID:
              missingParagraphIds.slice(0, 5).join(', ') +
              (missingParagraphIds.length > 5 ? ` 等 ${missingParagraphIds.length} 个` : ''),
            总有效段落数: paragraphsWithText.length,
            已翻译段落数: paragraphTranslations.length,
          },
        );
        // 注意：新的状态流程会在 executeToolCallLoop 中自动处理缺失段落
      } else {
        console.log(
          `[TranslationService] ✅ 翻译完成：所有 ${paragraphsWithText.length} 个有效段落都有翻译`,
        );
      }

      // 使用共享工具完成任务
      void completeTask(taskId, aiProcessingStore as AIProcessingStore | undefined, 'translation');

      return {
        text: translatedText,
        paragraphTranslations,
        ...(titleTranslation ? { titleTranslation } : {}),
        actions,
        ...(taskId ? { taskId } : {}),
      };
    } catch (error) {
      // 使用共享工具处理错误
      void handleTaskError(
        error,
        taskId,
        aiProcessingStore as AIProcessingStore | undefined,
        'translation',
      );
      throw error;
    } finally {
      // 使用共享工具清理
      cleanupAbort();
    }
  }
}
