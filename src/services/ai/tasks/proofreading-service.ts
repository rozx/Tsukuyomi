import type { AIModel } from 'src/services/ai/types/ai-model';
import type {
  AIServiceConfig,
  TextGenerationStreamCallback,
  ChatMessage,
} from 'src/services/ai/types/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { Paragraph } from 'src/models/novel';
import { AIServiceFactory } from '../index';

import {
  buildOriginalTranslationsMap,
  filterChangedParagraphs,
  reconstructChunkText,
} from 'src/utils';
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
  buildFormattedChunks,
} from './utils/ai-task-helper';
import {
  getSymbolFormatRules,
  getOutputFormatRules,
  getToolUsageInstructions,
  getMemoryWorkflowRules,
} from './prompts';

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
   * - 用于控制校对任务的分块处理
   */
  chunkSize?: number;
}

export interface ProofreadingResult {
  text: string;
  taskId?: string;
  paragraphTranslations?: { id: string; translation: string }[];
  actions?: ActionInfo[];
}

/**
 * 重建 chunk，只包含未处理的段落
 * @param paragraphsWithTranslation 所有包含翻译的段落
 * @param unprocessedParagraphIds 未处理的段落 ID 列表
 * @param CHUNK_SIZE chunk 大小限制
 * @returns 重建后的 chunk，如果没有未处理的段落则返回 null
 */
function rebuildChunk(
  paragraphsWithTranslation: Paragraph[],
  unprocessedParagraphIds: string[],
  CHUNK_SIZE: number,
): { text: string; paragraphIds: string[] } | null {
  const unprocessedParagraphs = paragraphsWithTranslation.filter((p) =>
    unprocessedParagraphIds.includes(p.id),
  );

  let rebuiltChunkText = '';
  const rebuiltChunkParagraphIds: string[] = [];

  for (const paragraph of unprocessedParagraphs) {
    const currentTranslation =
      paragraph.translations?.find((t) => t.id === paragraph.selectedTranslationId)?.translation ||
      paragraph.translations?.[0]?.translation ||
      '';
    const paragraphText = `[ID: ${paragraph.id}] 原文: ${paragraph.text}\n翻译: ${currentTranslation}\n\n`;

    if (
      rebuiltChunkText.length + paragraphText.length > CHUNK_SIZE &&
      rebuiltChunkText.length > 0
    ) {
      break;
    }

    rebuiltChunkText += paragraphText;
    rebuiltChunkParagraphIds.push(paragraph.id);
  }

  if (rebuiltChunkText.length > 0) {
    return {
      text: rebuiltChunkText,
      paragraphIds: rebuiltChunkParagraphIds,
    };
  }

  return null;
}

/**
 * 校对服务
 * 使用 AI 服务进行文本校对，检查并修正文字、内容和格式层面的错误
 */
export class ProofreadingService {
  static readonly CHUNK_SIZE = DEFAULT_TASK_CHUNK_SIZE;

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

    // 使用共享工具初始化任务
    const { taskId, abortController } = await initializeTask(
      aiProcessingStore as AIProcessingStore | undefined,
      'proofreading',
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
        temperature: model.isDefault.proofreading?.temperature ?? 0.3, // 校对使用较低温度以提高准确性
        signal: finalSignal,
      };

      // 使用共享工具获取特殊指令
      const specialInstructions = await getSpecialInstructions(bookId, chapterId, 'proofreading');

      // 1. 系统提示词（使用共享提示词模块）- 每个 chunk 都会使用这个系统提示
      const todosPrompt = taskId ? getTodosSystemPrompt(taskId) : '';
      const specialInstructionsSection = buildSpecialInstructionsSection(specialInstructions);

      // 构建书籍上下文信息（书名/简介/标签）
      const bookContextSection = await buildBookContextSection(bookId);

      // 构建章节上下文信息
      const chapterContextSection = buildChapterContextSection(chapterId, chapterTitle);

      const systemPrompt = `你是专业的小说校对助手，检查并修正翻译文本错误。${todosPrompt}${bookContextSection}${chapterContextSection}${specialInstructionsSection}

【校对检查项】[警告] 只返回有变化的段落
1. **文字**: 错别字、标点（全角）、语法、词语用法
2. **内容**: 人名/地名/称谓一致性、时间线/逻辑、设定准确性
3. **准确性**: 保持原意，避免误译、漏译、增译。并根据上下文找出最准确的表达。
4. **格式**: 段落格式、数字用法统一
5. **完整翻译**: [警告] 检查并修正任何明显未翻译的日语原文（尤其是假名、助词、语尾等），确保所有内容都已翻译为中文

【校对原则】
- **最小改动**: 只修正错误，保持原意和风格
- **一致性优先**: 术语/角色名全文统一，用工具检查历史翻译
- **参考原文**: 确保翻译准确，特别是标点符号。
- ${getSymbolFormatRules()}

${getToolUsageInstructions('proofreading', tools, skipAskUser)}

${getMemoryWorkflowRules()}

${getOutputFormatRules('proofreading')}
`;

      if (aiProcessingStore && taskId) {
        void aiProcessingStore.updateTask(taskId, { message: '正在建立连接...' });
      }

      // 切分文本
      const CHUNK_SIZE = options?.chunkSize ?? ProofreadingService.CHUNK_SIZE;
      const chunks = buildFormattedChunks(paragraphsWithTranslation, CHUNK_SIZE);

      let proofreadText = '';
      const paragraphProofreadings: { id: string; translation: string }[] = [];

      // 存储每个段落的原始翻译，用于比较是否有变化
      const originalTranslations = buildOriginalTranslationsMap(paragraphsWithTranslation);

      // 跟踪已处理的段落 ID（用于排除已处理的段落，避免重复处理）
      const processedParagraphIds = new Set<string>();

      // 一次性计算：章节第一个“非空”段落（用于判断本次任务是否从章节中间开始）
      const chapterFirstNonEmptyParagraphId = await getChapterFirstNonEmptyParagraphId(
        chapterId,
        'ProofreadingService',
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
          'ProofreadingService',
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
          const rebuiltChunk = rebuildChunk(
            paragraphsWithTranslation,
            unprocessedParagraphIds,
            CHUNK_SIZE,
          );
          if (!rebuiltChunk) {
            // 没有未处理的段落，跳过
            chunkIndex++;
            continue;
          }
          actualChunk = rebuiltChunk;
        }

        const chunkText = actualChunk.text;

        if (aiProcessingStore && taskId) {
          void aiProcessingStore.updateTask(taskId, {
            message: `正在校对第 ${chunkIndex + 1}/${chunks.length} 部分...`,
            status: 'processing',
          });
          // 添加块分隔符
          void aiProcessingStore.appendThinkingMessage(
            taskId,
            `\n\n[=== 校对块 ${chunkIndex + 1}/${chunks.length} ===]\n\n`,
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
        const maintenanceReminder = buildMaintenanceReminder('proofreading');
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
          'proofreading',
          chunkIndex,
          chunks.length,
          chunkText,
          paragraphCountNote,
          maintenanceReminder,
          chapterId,
          undefined,
          bookId,
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
                `[ProofreadingService] ⚠️ 检测到AI降级或错误，重试块 ${chunkIndex + 1}/${chunks.length}（第 ${retryCount}/${MAX_RETRIES} 次重试）`,
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
              taskType: 'proofreading',
              chunkText,
              paragraphIds: actualChunk.paragraphIds,
              bookId: bookId || '',
              handleAction,
              onToast,
              taskId,
              aiProcessingStore: aiProcessingStore as AIProcessingStore | undefined,
              logLabel: 'ProofreadingService',
              // 对于 proofreading，只验证有变化的段落
              verifyCompleteness: (_expectedIds, _receivedTranslations) => {
                // 只检查已收到的翻译（有变化的段落）
                // 对于 proofreading，不需要验证所有段落都有翻译，只需要验证返回的段落格式正确
                return {
                  allComplete: true, // proofreading 只返回有变化的段落，所以总是完整的
                  missingIds: [],
                };
              },
              // 立即回调：当段落校对提取时立即通知（不等待循环完成）
              onParagraphsExtracted:
                onParagraphProofreading && actualChunk.paragraphIds
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
                        actualChunk.paragraphIds,
                        extractedMap,
                        originalTranslations,
                      );

                      // 立即调用外部回调
                      if (changedParagraphs.length > 0) {
                        // 使用 void 来调用，因为类型定义是 void，但实际可能是 async 函数
                        void Promise.resolve(onParagraphProofreading(changedParagraphs)).catch(
                          (error) => {
                            console.error(
                              `[ProofreadingService] ⚠️ 段落回调失败（块 ${chunkIndex + 1}/${chunks.length}）`,
                              error,
                            );
                          },
                        );
                      }
                    }
                  : undefined,
            });

            // 检查状态
            if (loopResult.status !== 'end') {
              throw new Error(`校对任务未完成（状态: ${loopResult.status}）。请重试。`);
            }

            // 注意：段落校对的回调已经在 onParagraphsExtracted 中立即调用
            // 这里只需要处理文本构建和累积用于最终返回

            // 使用从状态流程中提取的段落校对
            const extractedProofreadings = loopResult.paragraphs;

            // 标记所有已处理的段落（包括 AI 可能处理了超出当前 chunk 范围的段落）
            markProcessedParagraphsFromMap(extractedProofreadings, processedParagraphIds);

            // 处理校对结果：只返回有变化的段落
            if (extractedProofreadings.size > 0 && actualChunk.paragraphIds) {
              // 过滤出有变化的段落
              const chunkParagraphProofreadings = filterChangedParagraphs(
                actualChunk.paragraphIds,
                extractedProofreadings,
                originalTranslations,
              );

              if (chunkParagraphProofreadings.length > 0) {
                // 按顺序构建完整文本（合并变化和未变化的段落）
                const orderedText = reconstructChunkText(
                  actualChunk.paragraphIds,
                  extractedProofreadings,
                  originalTranslations,
                );
                proofreadText += orderedText;

                // 记录变更列表（只记录有变化的）
                for (const paraProofreading of chunkParagraphProofreadings) {
                  paragraphProofreadings.push(paraProofreading);
                }

                if (onChunk) {
                  await onChunk({ text: orderedText, done: false });
                }
              }
              // 如果所有段落都没有变化，不添加任何内容（这是预期行为）
            } else {
              // 没有提取到段落变化，说明AI认为无需修改，直接使用原始翻译构建文本
              const chunkOriginalTranslations: string[] = [];
              if (actualChunk.paragraphIds) {
                for (const paraId of actualChunk.paragraphIds) {
                  chunkOriginalTranslations.push(originalTranslations.get(paraId) || '');
                }
              }
              const fallbackText = chunkOriginalTranslations.join('\n\n');
              proofreadText += fallbackText;

              if (onChunk) {
                // 如果需要，也可以流回原始文本
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
                  `[ProofreadingService] ❌ AI降级检测失败，块 ${chunkIndex + 1}/${chunks.length} 已重试 ${MAX_RETRIES} 次仍失败，停止校对`,
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
      try {
        await completeTask(
          taskId,
          aiProcessingStore as AIProcessingStore | undefined,
          'proofreading',
        );
      } catch (error) {
        console.error('[ProofreadingService] 完成任务时出错:', error);
      }

      return {
        text: proofreadText,
        paragraphTranslations: paragraphProofreadings,
        actions,
        ...(taskId ? { taskId } : {}),
      };
    } catch (error) {
      // 使用共享工具处理错误
      void handleTaskError(
        error,
        taskId,
        aiProcessingStore as AIProcessingStore | undefined,
        'proofreading',
      );
      throw error;
    } finally {
      // 使用共享工具清理
      cleanupAbort();
    }
  }
}
