import type { AIModel } from 'src/services/ai/types/ai-model';
import type {
  AIServiceConfig,
  TextGenerationStreamCallback,
  ChatMessage,
} from 'src/services/ai/types/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { Paragraph } from 'src/models/novel';
import { AIServiceFactory } from '../index';

import { buildOriginalTranslationsMap, filterChangedParagraphs } from 'src/utils';
import { ToolRegistry } from 'src/services/ai/tools/index';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import { getTodosSystemPrompt } from './utils/todo-helper';
import {
  executeToolCallLoop,
  type AIProcessingStore,
  buildMaintenanceReminder,
  DEFAULT_TASK_CHUNK_SIZE,
  createUnifiedAbortController,
  initializeTask,
  buildBookContextSection,
  getSpecialInstructions,
  handleTaskError,
  completeTask,
  buildIndependentChunkPrompt,
  buildChapterContextSection,
  buildSpecialInstructionsSection,
  filterProcessedParagraphs,
  markProcessedParagraphs,
  markProcessedParagraphsFromMap,
  getChapterFirstNonEmptyParagraphId,
  getHasPreviousParagraphs,
  isSkipAskUserEnabled,
} from './utils/ai-task-helper';
import {
  getSymbolFormatRules,
  getOutputFormatRules,
  getToolUsageInstructions,
  getMemoryWorkflowRules,
} from './prompts';

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
  /**
   * 章节 ID（可选），如果提供，将在上下文中提供给 AI
   */
  chapterId?: string;
  /**
   * 章节标题（可选），用于在上下文中提供给 AI
   */
  chapterTitle?: string;
  /**
   * 分块大小（token 数，可选）
   * - 如果未提供，使用默认值 DEFAULT_TASK_CHUNK_SIZE
   * - 用于控制润色任务的分块处理
   */
  chunkSize?: number;
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
  static readonly CHUNK_SIZE = DEFAULT_TASK_CHUNK_SIZE;

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

    const {
      onChunk,
      onProgress,
      signal,
      bookId,
      aiProcessingStore,
      onParagraphPolish,
      onToast,
      chapterId,
      chapterTitle,
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

    // 使用共享工具初始化任务
    const { taskId, abortController } = await initializeTask(
      aiProcessingStore as AIProcessingStore | undefined,
      'polish',
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
      // 与翻译服务保持一致：排除翻译管理工具 + 导航/列表工具（让模型专注于当前文本块）
      const skipAskUser = await isSkipAskUserEnabled(bookId);
      const tools = ToolRegistry.getTranslationTools(bookId, { excludeAskUser: skipAskUser });
      const config: AIServiceConfig = {
        apiKey: model.apiKey,
        baseUrl: model.baseUrl,
        model: model.model,
        // 润色和校对共用 proofreading 配置（参见 AIModelDefaultTasks 类型定义）
        temperature: model.isDefault.proofreading?.temperature ?? 0.7,
        signal: finalSignal,
      };

      // 使用共享工具获取特殊指令
      const specialInstructions = await getSpecialInstructions(bookId, chapterId, 'polish');

      // 1. 系统提示词（使用共享提示词模块）- 每个 chunk 都会使用这个系统提示
      const todosPrompt = taskId ? getTodosSystemPrompt(taskId) : '';
      const specialInstructionsSection = buildSpecialInstructionsSection(specialInstructions);

      // 构建书籍上下文信息（书名/简介/标签）
      const bookContextSection = await buildBookContextSection(bookId);

      // 构建章节上下文信息
      const chapterContextSection = buildChapterContextSection(chapterId, chapterTitle);

      const systemPrompt = `你是专业的日轻小说润色助手。${todosPrompt}${bookContextSection}${chapterContextSection}${specialInstructionsSection}

【核心规则】[警告] 只返回有变化的段落
1. **语言自然化**: 摆脱翻译腔，使用地道中文表达，适当添加语气词（按角色风格）
2. **节奏优化**: 调整句子长度/结构，删除冗余，修正语病
3. **准确性**: 保持原意，避免误译、漏译、增译。并根据上下文找出最准确的表达。
4. **角色区分**: 对白符合角色身份/性格，参考speaking_style
5. **一致性**: 术语/角色名保持全文统一，参考翻译历史混合最佳表达。并且确保前后段落风格一致，标点符号统一。
6. **完整翻译检查**: [警告] 检查并修正任何明显未翻译的日语原文（尤其是假名、助词、语尾等），确保所有内容都已翻译为中文
7. ${getSymbolFormatRules()}
${getToolUsageInstructions('polish', tools, skipAskUser)}

${getMemoryWorkflowRules()}

${getOutputFormatRules('polish')}
`;

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.updateTask(taskId, { message: '正在建立连接...' });
      }

      // 切分文本
      const CHUNK_SIZE = options?.chunkSize ?? PolishService.CHUNK_SIZE;
      const chunks: Array<{
        text: string;
        paragraphIds?: string[];
        translationHistories?: Map<string, string[]>; // 段落ID -> 翻译历史数组
      }> = [];

      let currentChunkText = '';
      let currentChunkParagraphs: Paragraph[] = [];
      let currentChunkTranslationHistories = new Map<string, string[]>();

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

        // 如果当前块加上新段落超过限制，且当前块不为空，则先保存当前块
        if (
          currentChunkText.length + paragraphText.length > CHUNK_SIZE &&
          currentChunkText.length > 0
        ) {
          chunks.push({
            text: currentChunkText,
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
          paragraphIds: currentChunkParagraphs.map((p) => p.id),
          translationHistories: new Map(currentChunkTranslationHistories),
        });
      }

      let polishedText = '';
      const paragraphPolishes: { id: string; translation: string }[] = [];

      // 存储每个段落的原始翻译，用于比较是否有变化
      const originalTranslations = buildOriginalTranslationsMap(paragraphsWithTranslation);

      // 跟踪已处理的段落 ID（用于排除已处理的段落，避免重复处理）
      const processedParagraphIds = new Set<string>();

      // 一次性计算：章节第一个“非空”段落（用于判断本次任务是否从章节中间开始）
      const chapterFirstNonEmptyParagraphId = await getChapterFirstNonEmptyParagraphId(
        chapterId,
        'PolishService',
      );

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
          'PolishService',
          chunkIndex,
          chunks.length,
        );
        if (!unprocessedParagraphIds) {
          chunkIndex++;
          continue;
        }

        // 如果当前 chunk 包含已处理的段落，需要重新构建 chunk
        let actualChunk = chunk;
        if (unprocessedParagraphIds.length < (chunk.paragraphIds?.length || 0)) {
          // 需要重新构建 chunk，只包含未处理的段落
          const unprocessedParagraphs = paragraphsWithTranslation.filter((p) =>
            unprocessedParagraphIds.includes(p.id),
          );

          // 重新构建 chunk（保持原有的 chunk 结构）
          let rebuiltChunkText = '';
          const rebuiltChunkParagraphIds: string[] = [];
          const rebuiltChunkTranslationHistories = new Map<string, string[]>();

          for (const paragraph of unprocessedParagraphs) {
            const translations = paragraph.translations || [];
            const translationHistory = translations
              .slice()
              .reverse()
              .slice(0, 5)
              .map((t) => t.translation);

            const currentTranslation =
              translations.find((t) => t.id === paragraph.selectedTranslationId)?.translation ||
              translations[0]?.translation ||
              '';
            const historyText =
              translationHistory.length > 0
                ? `\n翻译历史:\n${translationHistory.map((h, idx) => `  版本${idx + 1}: ${h}`).join('\n')}`
                : '';
            const paragraphText = `[ID: ${paragraph.id}] ${paragraph.text}\n当前翻译: ${currentTranslation}${historyText}\n\n`;

            if (
              rebuiltChunkText.length + paragraphText.length > CHUNK_SIZE &&
              rebuiltChunkText.length > 0
            ) {
              // 如果当前重建的 chunk 加上新段落超过限制，停止添加
              break;
            }

            rebuiltChunkText += paragraphText;
            rebuiltChunkParagraphIds.push(paragraph.id);
            rebuiltChunkTranslationHistories.set(paragraph.id, translationHistory);
          }

          if (rebuiltChunkText.length > 0) {
            actualChunk = {
              text: rebuiltChunkText,
              paragraphIds: rebuiltChunkParagraphIds,
              translationHistories: rebuiltChunkTranslationHistories,
            };
          } else {
            // 没有未处理的段落，跳过
            chunkIndex++;
            continue;
          }
        }

        const chunkText = actualChunk.text;

        if (aiProcessingStore && taskId) {
          void aiProcessingStore.updateTask(taskId, {
            message: `正在润色第 ${chunkIndex + 1}/${chunks.length} 部分...`,
            status: 'processing',
          });
          // 添加块分隔符
          void aiProcessingStore.appendThinkingMessage(
            taskId,
            `\n\n[=== 润色块 ${chunkIndex + 1}/${chunks.length} ===]\n\n`,
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
        const maintenanceReminder = buildMaintenanceReminder('polish');
        // 计算当前块的段落数量（用于提示AI）
        const currentChunkParagraphCount = actualChunk.paragraphIds?.length || 0;
        const paragraphCountNote = `\n[警告] 注意：本部分包含 ${currentChunkParagraphCount} 个段落（空段落已过滤）。`;

        const firstParagraphId = actualChunk.paragraphIds?.[0];
        const hasPreviousParagraphs = getHasPreviousParagraphs(
          chapterFirstNonEmptyParagraphId,
          firstParagraphId,
        );

        // 使用独立的 chunk 提示，每个 chunk 独立，提醒 AI 使用工具获取上下文
        const chunkContent = buildIndependentChunkPrompt(
          'polish',
          chunkIndex,
          chunks.length,
          chunkText,
          paragraphCountNote,
          maintenanceReminder,
          chapterId,
          undefined,
          undefined,
          hasPreviousParagraphs,
          firstParagraphId,
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
                `[PolishService] ⚠️ 检测到AI降级或错误，重试块 ${chunkIndex + 1}/${chunks.length}（第 ${retryCount}/${MAX_RETRIES} 次重试）`,
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
            const loopResult = await executeToolCallLoop({
              history: chunkHistory,
              tools,
              generateText: service.generateText.bind(service),
              aiServiceConfig: config,
              taskType: 'polish',
              chunkText,
              paragraphIds: actualChunk.paragraphIds,
              bookId: bookId || '',
              handleAction,
              onToast,
              taskId,
              aiProcessingStore: aiProcessingStore as AIProcessingStore | undefined,
              logLabel: 'PolishService',
              // 对于 polish，只验证有变化的段落
              verifyCompleteness: (_expectedIds, _receivedTranslations) => {
                // 只检查已收到的翻译（有变化的段落）
                // 对于 polish，不需要验证所有段落都有翻译，只需要验证返回的段落格式正确
                return {
                  allComplete: true, // polish 只返回有变化的段落，所以总是完整的
                  missingIds: [],
                };
              },
              // 立即回调：当段落润色提取时立即通知（不等待循环完成）
              onParagraphsExtracted:
                onParagraphPolish && actualChunk.paragraphIds
                  ? (paragraphs) => {
                      // 标记所有已处理的段落
                      markProcessedParagraphs(paragraphs, processedParagraphIds);

                      // 将数组转换为 Map 供 filterChangedParagraphs 使用
                      const extractedMap = new Map<string, string>();
                      for (const para of paragraphs) {
                        if (para.id && para.translation) {
                          extractedMap.set(para.id, para.translation);
                        }
                      }

                      // 过滤出有变化的段落
                      const changedParagraphs = filterChangedParagraphs(
                        actualChunk.paragraphIds!,
                        extractedMap,
                        originalTranslations,
                      );

                      // 立即调用外部回调
                      if (changedParagraphs.length > 0) {
                        try {
                          // 使用 void 来调用，因为类型定义是 void，但实际可能是 async 函数
                          void Promise.resolve(onParagraphPolish(changedParagraphs)).catch(
                            (error) => {
                              console.error(
                                `[PolishService] ⚠️ 段落回调失败（块 ${chunkIndex + 1}/${chunks.length}）`,
                                error,
                              );
                            },
                          );
                        } catch (error) {
                          console.error(
                            `[PolishService] ⚠️ 段落回调失败（块 ${chunkIndex + 1}/${chunks.length}）`,
                            error,
                          );
                        }
                      }
                    }
                  : undefined,
            });

            // 检查状态
            if (loopResult.status !== 'end') {
              throw new Error(`润色任务未完成（状态: ${loopResult.status}）。请重试。`);
            }

            // 注意：段落润色的回调已经在 onParagraphsExtracted 中立即调用
            // 这里只需要处理文本构建和累积用于最终返回

            // 使用从状态流程中提取的段落润色
            const extractedPolishes = loopResult.paragraphs;

            // 标记所有已处理的段落（包括 AI 可能处理了超出当前 chunk 范围的段落）
            markProcessedParagraphsFromMap(extractedPolishes, processedParagraphIds);

            // 处理润色结果：只返回有变化的段落
            if (extractedPolishes.size > 0 && actualChunk.paragraphIds) {
              // 过滤出有变化的段落
              const chunkParagraphPolishes = filterChangedParagraphs(
                actualChunk.paragraphIds,
                extractedPolishes,
                originalTranslations,
              );

              if (chunkParagraphPolishes.length > 0) {
                // 按顺序构建文本
                const orderedPolishes: string[] = [];
                for (const paraPolish of chunkParagraphPolishes) {
                  orderedPolishes.push(paraPolish.translation);
                  paragraphPolishes.push(paraPolish);
                }
                const orderedText = orderedPolishes.join('\n\n');
                polishedText += orderedText;
                if (onChunk) {
                  await onChunk({ text: orderedText, done: false });
                }
                // 注意：onParagraphPolish 回调已在 onParagraphsExtracted 中立即调用，这里不再重复调用
              }
              // 如果所有段落都没有变化，不添加任何内容（这是预期行为）
            } else {
              // 没有提取到段落润色，使用完整文本作为后备
              const fallbackText = loopResult.responseText || '';
              polishedText += fallbackText;
              if (onChunk) {
                await onChunk({ text: fallbackText, done: false });
              }
            }

            // 标记块已成功处理
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
                  `[PolishService] ❌ AI降级检测失败，块 ${chunkIndex + 1}/${chunks.length} 已重试 ${MAX_RETRIES} 次仍失败，停止润色`,
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

      // 使用共享工具完成任务
      void completeTask(taskId, aiProcessingStore as AIProcessingStore | undefined, 'polish');

      return {
        text: polishedText,
        paragraphTranslations: paragraphPolishes,
        actions,
        ...(taskId ? { taskId } : {}),
      };
    } catch (error) {
      // 使用共享工具处理错误
      void handleTaskError(
        error,
        taskId,
        aiProcessingStore as AIProcessingStore | undefined,
        'polish',
      );
      throw error;
    } finally {
      // 使用共享工具清理
      cleanupAbort();
    }
  }
}
