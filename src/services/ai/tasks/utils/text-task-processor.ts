/**
 * 通用文本任务处理器
 * 用于翻译、润色、校对服务的共同逻辑抽象
 */

import type { AIModel } from 'src/services/ai/types/ai-model';
import type {
  AIServiceConfig,
  TextGenerationStreamCallback,
  ChatMessage,
  AITool,
} from 'src/services/ai/types/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { Paragraph } from 'src/models/novel';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import type { TaskType, AIProcessingStore } from './task-types';
import type { TextChunk } from './chunk-formatter';
import { AIServiceFactory } from '../../index';
import { ToolRegistry } from '../../tools/index';
import {
  buildOriginalTranslationsMap,
  getSelectedTranslation,
  filterChangedParagraphs,
  reconstructChunkText,
} from 'src/utils';
import {
  executeToolCallLoop,
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
  buildChunks,
  isOnlySymbols,
  buildPreviousChapterSection,
  resolveRuntimeTaskChunkSize,
} from './index';
import { estimateMessagesTokenCount } from 'src/utils/ai-token-utils';
import { ChapterSummaryService } from '../chapter-summary-service';
import { useBooksStore } from 'src/stores/books';
import { ChapterService } from 'src/services/chapter-service';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';

/**
 * 任务类型标签（用于日志）
 */
const TASK_LABELS: Record<TaskType, string> = {
  translation: '翻译',
  polish: '润色',
  proofreading: '校对',
  chapter_summary: '章节摘要',
};

/**
 * 进度回调类型
 */
export interface ProgressInfo {
  total: number;
  current: number;
  currentParagraphs?: string[];
}

/**
 * 通用文本任务选项
 */
export interface TextTaskOptions {
  // 回调函数
  onChunk?: TextGenerationStreamCallback | undefined;
  onProgress?: ((progress: ProgressInfo) => void) | undefined;
  onAction?: ((action: ActionInfo) => void) | undefined;
  onToast?: ToastCallback | undefined;
  signal?: AbortSignal | undefined;

  // 上下文信息
  bookId?: string | undefined;
  chapterId?: string | undefined;
  chapterTitle?: string | undefined;
  chunkSize?: number | undefined;

  // 章节全量段落（包含空段落），用于构建正确的原始索引映射
  // 如果不提供，则使用 content 参数的数组索引（可能不正确，因为 content 可能是预过滤后的数组）
  allChapterParagraphs?: Paragraph[] | undefined;

  // AI 处理 Store
  aiProcessingStore?:
    | {
        addTask: (task: Omit<AIProcessingTask, 'id' | 'startTime'>) => Promise<string>;
        updateTask: (id: string, updates: Partial<AIProcessingTask>) => Promise<void>;
        appendThinkingMessage: (id: string, text: string) => Promise<void>;
        appendOutputContent: (id: string, text: string) => Promise<void>;
        removeTask: (id: string) => Promise<void>;
        activeTasks: AIProcessingTask[];
      }
    | undefined;
}

/**
 * 段落提取回调参数
 */
export interface ParagraphExtractCallbackParams {
  paragraphs: { id: string; translation: string }[];
  paragraphIds: string[];
  originalTranslations: Map<string, string>;
  processedParagraphIds: Set<string>;
  chunkIndex: number;
  totalChunks: number;
  actions: ActionInfo[];
  actionStartIndex: number;
}

/**
 * 标题提取回调参数
 */
export interface TitleExtractCallbackParams {
  title: string;
}

/**
 * 任务特定配置
 */
export interface TaskSpecificConfig {
  // 任务类型
  taskType: TaskType;
  // 日志标签
  logLabel: string;
  // 温度（可选，默认从模型配置获取）
  temperature?: number | undefined;
  // 是否需要翻译（用于过滤段落）
  requiresTranslation?: boolean | undefined;
  // 是否只返回有变化的段落
  onlyChangedParagraphs?: boolean | undefined;
  // 验证完整性函数（可选）
  verifyCompleteness?:
    | ((
        expectedIds: string[],
        receivedTranslations: Map<string, string>,
      ) => { allComplete: boolean; missingIds: string[] })
    | undefined;
  // 段落提取回调（可选）
  onParagraphsExtracted?:
    | ((params: ParagraphExtractCallbackParams) => void | Promise<void>)
    | undefined;
  // 标题提取回调（可选，仅翻译服务使用）
  onTitleExtracted?: ((params: TitleExtractCallbackParams) => void | Promise<void>) | undefined;
  // 构建系统提示词函数
  buildSystemPrompt: (params: {
    todosPrompt: string;
    bookContextSection: string;
    chapterContextSection: string;
    specialInstructionsSection: string;
    tools: AITool[];
    skipAskUser: boolean;
    isFirstChunk: boolean;
  }) => string;
  // 是否启用章节摘要生成（可选，仅翻译服务使用）
  enableChapterSummary?: boolean | undefined;
  // 是否获取前一章节信息（可选，仅翻译服务使用）
  enablePreviousChapter?: boolean | undefined;
  // 是否使用简短规划模式（可选，仅翻译服务使用）
  enableBriefPlanning?: boolean | undefined;
  // 收集的 actions（可选，用于检测规划上下文更新）
  collectedActions?: ActionInfo[] | undefined;
}

/**
 * 通用文本任务结果
 */
export interface TextTaskResult {
  text: string;
  taskId?: string;
  paragraphTranslations?: { id: string; translation: string }[];
  actions?: ActionInfo[];
  titleTranslation?: string;
  referencedMemories?: string[];
}

/**
 * 通用文本任务处理器
 */
export async function processTextTask(
  content: Paragraph[],
  model: AIModel,
  options: TextTaskOptions,
  taskConfig: TaskSpecificConfig,
): Promise<TextTaskResult> {
  const {
    taskType,
    logLabel,
    temperature,
    requiresTranslation = false,
    onlyChangedParagraphs = false,
    verifyCompleteness,
    onParagraphsExtracted,
    onTitleExtracted,
    buildSystemPrompt,
    enableChapterSummary = false,
    enablePreviousChapter = false,
    enableBriefPlanning = false,
    collectedActions = [],
  } = taskConfig;

  const { onChunk, onProgress, signal, bookId, aiProcessingStore, chapterId, chapterTitle } =
    options;

  const actions: ActionInfo[] = [...collectedActions];
  const taskLabel = TASK_LABELS[taskType];
  let titleTranslation: string | undefined;

  // 内部 action 处理函数
  const handleAction = (action: ActionInfo) => {
    actions.push(action);
    if (options.onAction) {
      options.onAction(action);
    }
  };

  // 验证输入
  if (!content || content.length === 0) {
    throw new Error(`要${taskLabel}的内容不能为空`);
  }

  // 构建原始索引映射（章节位置，包含空段落计数）
  // 如果提供了 allChapterParagraphs，使用它来构建正确的章节原始位置映射
  // 否则退化为使用 content 的数组索引（调用方传入预过滤数组时索引会不正确）
  const originalIndices = new Map<string, number>();
  const allParagraphs = options.allChapterParagraphs;

  if (allParagraphs && allParagraphs.length > 0) {
    // 使用章节全量段落构建索引映射
    for (let i = 0; i < allParagraphs.length; i++) {
      const paragraph = allParagraphs[i];
      if (paragraph) {
        originalIndices.set(paragraph.id, i);
      }
    }
  } else {
    // 退化：使用 content 数组索引（调用方未传 allChapterParagraphs 时）
    for (let i = 0; i < content.length; i++) {
      const paragraph = content[i];
      if (paragraph) {
        originalIndices.set(paragraph.id, i);
      }
    }
  }

  // 过滤有效段落
  const validParagraphs: Paragraph[] = [];

  for (let i = 0; i < content.length; i++) {
    const paragraph = content[i];
    if (!paragraph) continue;

    const hasText = paragraph.text?.trim();
    const hasSelectedTranslation = getSelectedTranslation(paragraph).trim().length > 0;
    const isValid = requiresTranslation ? hasText && hasSelectedTranslation : hasText;

    if (isValid) {
      validParagraphs.push(paragraph);
    }
  }

  if (validParagraphs.length === 0) {
    throw new Error(
      requiresTranslation
        ? `要${taskLabel}的段落必须包含当前选中的翻译`
        : `要${taskLabel}的内容不能为空`,
    );
  }

  if (!model.enabled) {
    throw new Error('所选模型未启用');
  }

  console.log(`[${logLabel}] 🚀 开始${taskLabel}任务`, {
    段落数量: content?.length || 0,
    有效段落数: validParagraphs.length,
    AI模型: model.name,
    AI提供商: model.provider,
    书籍ID: bookId || '无',
  });

  // 初始化任务
  const { taskId, abortController } = await initializeTask(
    aiProcessingStore as AIProcessingStore | undefined,
    taskType,
    model.name,
    {
      ...(typeof bookId === 'string' ? { bookId } : {}),
      ...(typeof chapterId === 'string' ? { chapterId } : {}),
      ...(typeof chapterTitle === 'string' ? { chapterTitle } : {}),
      ...(model.maxInputTokens ? { maxInputTokens: model.maxInputTokens } : {}),
    },
  );

  // 触发章节摘要生成（后台运行，仅翻译服务）
  if (enableChapterSummary && chapterId && bookId && content.length > 0) {
    const fullSourceText = content
      .map((p) => p.text || '')
      .filter((t) => t.trim().length > 0)
      .join('\n\n');

    if (fullSourceText.trim()) {
      void ChapterSummaryService.generateSummary(chapterId, fullSourceText, {
        bookId,
        ...(chapterTitle ? { chapterTitle } : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        aiProcessingStore: aiProcessingStore as any,
        onSuccess: (summary: string) =>
          console.log(`[${logLabel}] 自动生成章节摘要成功: ${summary.slice(0, 30)}...`),
        onError: (error: unknown) => console.error(`[${logLabel}] 自动生成章节摘要失败:`, error),
      }).catch((error: unknown) => {
        console.error(`[${logLabel}] 触发章节摘要服务异常:`, error);
      });
    }
  }

  // 创建统一的 AbortController
  const { controller: internalController, cleanup: cleanupAbort } = createUnifiedAbortController(
    signal,
    abortController,
  );
  const finalSignal = internalController.signal;

  try {
    const service = AIServiceFactory.getService(model.provider);
    const skipAskUser = await isSkipAskUserEnabled(bookId);
    const tools = ToolRegistry.getTranslationTools(bookId, { excludeAskUser: skipAskUser });
    const toolSchemaContent = tools.length > 0 ? `【工具定义】\n${JSON.stringify(tools)}` : '';

    // 获取温度配置
    const modelTemperature =
      temperature ??
      model.isDefault[taskType === 'translation' ? 'translation' : 'proofreading']?.temperature ??
      0.7;

    const config: AIServiceConfig = {
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      model: model.model,
      temperature: modelTemperature,
      signal: finalSignal,
    };

    // 获取特殊指令
    const specialInstructions = await getSpecialInstructions(bookId, chapterId, taskType);

    // 构建系统提示词
    const { getTodosSystemPrompt } = await import('../utils/todo-helper');
    const todosPrompt = taskId ? getTodosSystemPrompt(taskId) : '';
    const specialInstructionsSection = buildSpecialInstructionsSection(specialInstructions);
    const bookContextSection = await buildBookContextSection(bookId);
    const chapterContextSection = buildChapterContextSection(chapterId, chapterTitle);

    // 获取前一章节信息（仅翻译服务）
    let previousChapterSection = '';
    if (enablePreviousChapter && bookId && chapterId) {
      try {
        const booksStore = useBooksStore();
        const book = booksStore.getBookById(bookId);
        if (book) {
          const prev = ChapterService.getPreviousChapter(book, chapterId);
          if (prev) {
            const prevTitle = getChapterDisplayTitle(prev.chapter);
            const prevSummary = prev.chapter.summary;
            previousChapterSection = buildPreviousChapterSection(prevTitle, prevSummary);
          }
        }
      } catch (error) {
        console.warn(`[${logLabel}] 获取前一章节信息失败:`, error);
      }
    }

    // 构建系统提示词（第一个 chunk）
    const systemPromptFirst = buildSystemPrompt({
      todosPrompt,
      bookContextSection,
      chapterContextSection: chapterContextSection + previousChapterSection,
      specialInstructionsSection,
      tools,
      skipAskUser,
      isFirstChunk: true,
    });

    // 构建系统提示词（后续 chunk）
    const systemPromptSubsequent = buildSystemPrompt({
      todosPrompt,
      bookContextSection,
      chapterContextSection: chapterContextSection + previousChapterSection,
      specialInstructionsSection,
      tools,
      skipAskUser,
      isFirstChunk: false,
    });

    if (aiProcessingStore && taskId) {
      aiProcessingStore
        .updateTask(taskId, { message: '正在建立连接...' })
        .catch((error) => console.error(`[${logLabel}] Failed to update task:`, error));
    }

    // 切分文本
    const CHUNK_SIZE = resolveRuntimeTaskChunkSize(options.chunkSize ?? DEFAULT_TASK_CHUNK_SIZE);
    // buildFormattedChunks 使用 originalIndices 映射获取章节原始位置
    // buildChunks 遍历全量段落数组，直接使用数组索引作为章节原始位置
    // 翻译路径使用 allChapterParagraphs（如果有），确保索引为章节原始位置
    const translationSourceParagraphs =
      allParagraphs && allParagraphs.length > 0 ? allParagraphs : content;
    const chunks = requiresTranslation
      ? buildFormattedChunks(validParagraphs, CHUNK_SIZE, originalIndices)
      : buildChunks(
          translationSourceParagraphs,
          CHUNK_SIZE,
          (p, idx) => `[${idx}] [ID: ${p.id}] ${p.text}\n\n`,
          (p) => !!p.text?.trim(),
        );

    let resultText = '';
    const paragraphResults: { id: string; translation: string }[] = [];

    // 存储原始翻译（用于比较变化）
    const originalTranslations = requiresTranslation
      ? buildOriginalTranslationsMap(validParagraphs)
      : new Map<string, string>();

    // 跟踪已处理的段落
    const processedParagraphIds = new Set<string>();

    // 获取章节第一个非空段落
    const chapterFirstNonEmptyParagraphId = await getChapterFirstNonEmptyParagraphId(
      chapterId,
      logLabel,
    );

    // 处理每个块
    const MAX_RETRIES = 2;
    let chunkIndex = 0;

    while (chunkIndex < chunks.length) {
      if (finalSignal.aborted) {
        throw new Error('请求已取消');
      }

      const chunk = chunks[chunkIndex];
      if (!chunk) {
        chunkIndex++;
        continue;
      }

      // 过滤已处理的段落
      const unprocessedParagraphIds = filterProcessedParagraphs(
        chunk,
        processedParagraphIds,
        logLabel,
        chunkIndex,
        chunks.length,
      );
      if (!unprocessedParagraphIds) {
        chunkIndex++;
        continue;
      }

      // 重建 chunk（如果需要）
      let actualChunk: TextChunk = chunk;
      if (unprocessedParagraphIds.length < (chunk.paragraphIds?.length || 0)) {
        // 重建时使用全量段落数组，保持章节原始索引一致性
        const rebuiltChunks = requiresTranslation
          ? buildFormattedChunks(
              validParagraphs.filter((p) => unprocessedParagraphIds.includes(p.id)),
              CHUNK_SIZE,
              originalIndices,
            )
          : buildChunks(
              translationSourceParagraphs,
              CHUNK_SIZE,
              (p, idx) => `[${idx}] [ID: ${p.id}] ${p.text}\n\n`,
              (p) => !!p.text?.trim() && unprocessedParagraphIds.includes(p.id),
            );
        const firstRebuiltChunk = rebuiltChunks[0];
        if (firstRebuiltChunk) {
          actualChunk = firstRebuiltChunk;
        } else {
          chunkIndex++;
          continue;
        }
      }

      const chunkText = actualChunk.text;

      // 更新任务状态
      if (aiProcessingStore && taskId) {
        aiProcessingStore
          .updateTask(taskId, {
            message: `正在${taskLabel}第 ${chunkIndex + 1}/${chunks.length} 部分...`,
            status: 'processing',
            workflowStatus: 'planning',
          })
          .catch((error) => console.error(`[${logLabel}] Failed to update task:`, error));
        aiProcessingStore
          .appendThinkingMessage(
            taskId,
            `\n\n[=== ${taskLabel}块 ${chunkIndex + 1}/${chunks.length} ===]\n\n`,
          )
          .catch((error) =>
            console.error(`[${logLabel}] Failed to append thinking message:`, error),
          );
      }

      // 进度回调
      if (onProgress) {
        const progress: ProgressInfo = {
          total: chunks.length,
          current: chunkIndex + 1,
        };
        if (actualChunk.paragraphIds) {
          progress.currentParagraphs = actualChunk.paragraphIds;
        }
        onProgress(progress);
      }

      // 创建 chunk 历史（第一个和后续 chunk 使用不同的系统提示词）
      const isFirstChunk = chunkIndex === 0;
      const systemPrompt = isFirstChunk ? systemPromptFirst : systemPromptSubsequent;
      const chunkHistory: ChatMessage[] = [{ role: 'system', content: systemPrompt }];

      // 构建 chunk 内容
      const maintenanceReminder = buildMaintenanceReminder(taskType);
      const currentChunkParagraphCount = actualChunk.paragraphIds?.length || 0;
      const paragraphCountNote = `\n[警告] 注意：本部分包含 ${currentChunkParagraphCount} 个段落（空段落已过滤）。段落标签 [index] 为章节原始位置（可能跳号），仅用于阅读定位。提交翻译必须使用 paragraph_id（即 [ID: ...] 中的值）。`;

      const firstParagraphId = actualChunk.paragraphIds?.[0];
      const hasPreviousParagraphs = getHasPreviousParagraphs(
        chapterFirstNonEmptyParagraphId,
        firstParagraphId,
      );

      const chunkContent = await buildIndependentChunkPrompt(
        taskType,
        chunkIndex,
        chunks.length,
        chunkText,
        paragraphCountNote,
        maintenanceReminder,
        chapterId,
        isFirstChunk ? chapterTitle : undefined,
        bookId,
        hasPreviousParagraphs,
        firstParagraphId,
      );

      // 估算 token 数
      if (aiProcessingStore && taskId) {
        const messagesForEstimate: ChatMessage[] = [
          ...chunkHistory,
          { role: 'user', content: chunkContent },
        ];
        if (toolSchemaContent) {
          messagesForEstimate.splice(1, 0, { role: 'system', content: toolSchemaContent });
        }
        const estimatedTokens = estimateMessagesTokenCount(messagesForEstimate);
        const contextWindow = model.maxInputTokens || 0;
        const contextPercentage =
          contextWindow > 0 ? Math.round((estimatedTokens / contextWindow) * 100) : undefined;
        aiProcessingStore
          .updateTask(taskId, {
            contextTokens: estimatedTokens,
            ...(contextWindow > 0 ? { contextWindow } : {}),
            ...(contextPercentage !== undefined ? { contextPercentage } : {}),
          })
          .catch((error) => console.error(`[${logLabel}] Failed to update task:`, error));
      }

      // 重试循环
      let retryCount = 0;
      let chunkProcessed = false;

      while (retryCount <= MAX_RETRIES && !chunkProcessed) {
        try {
          // 重试时清理历史
          if (retryCount > 0) {
            while (
              chunkHistory.length > 1 &&
              chunkHistory[chunkHistory.length - 1]?.role === 'user'
            ) {
              chunkHistory.pop();
            }
            while (
              chunkHistory.length > 1 &&
              chunkHistory[chunkHistory.length - 1]?.role === 'assistant'
            ) {
              chunkHistory.pop();
            }

            console.warn(
              `[${logLabel}] ⚠️ 检测到AI降级或错误，重试块 ${chunkIndex + 1}/${chunks.length}（第 ${retryCount}/${MAX_RETRIES} 次重试）`,
            );

            if (aiProcessingStore && taskId) {
              aiProcessingStore
                .updateTask(taskId, {
                  message: `检测到AI降级，正在重试第 ${retryCount}/${MAX_RETRIES} 次...`,
                  status: 'processing',
                })
                .catch((error) => console.error(`[${logLabel}] Failed to update task:`, error));
            }
          }

          chunkHistory.push({ role: 'user', content: chunkContent });

          // 记录当前 chunk 开始时的 action 数量
          const actionStartIndex = actions.length;

          // 执行工具调用循环
          const loopResult = await executeToolCallLoop({
            history: chunkHistory,
            tools,
            generateText: service.generateText.bind(service),
            aiServiceConfig: config,
            taskType,
            chunkText,
            paragraphIds: actualChunk.paragraphIds,
            bookId: bookId || '',
            handleAction,
            onToast: options.onToast,
            taskId,
            aiProcessingStore: aiProcessingStore as AIProcessingStore | undefined,
            aiModelId: model.id,
            logLabel,
            isBriefPlanning: enableBriefPlanning && chunkIndex > 0,
            collectedActions: actions,
            verifyCompleteness:
              verifyCompleteness ??
              ((_expectedIds, _receivedTranslations) => ({
                allComplete: onlyChangedParagraphs ? true : false,
                missingIds: [],
              })),
            onParagraphsExtracted:
              onParagraphsExtracted && actualChunk.paragraphIds
                ? (paragraphs) => {
                    markProcessedParagraphs(paragraphs, processedParagraphIds);
                    void Promise.resolve(
                      onParagraphsExtracted({
                        paragraphs,
                        paragraphIds: actualChunk.paragraphIds,
                        originalTranslations,
                        processedParagraphIds,
                        chunkIndex,
                        totalChunks: chunks.length,
                        actions,
                        actionStartIndex,
                      }),
                    ).catch((error) => {
                      console.error(
                        `[${logLabel}] ⚠️ 段落回调失败（块 ${chunkIndex + 1}/${chunks.length}）`,
                        error,
                      );
                    });
                  }
                : undefined,
            onTitleExtracted:
              isFirstChunk && chapterTitle && onTitleExtracted
                ? (title) => {
                    titleTranslation = title;
                    void Promise.resolve(onTitleExtracted({ title })).catch((error) => {
                      console.error(`[${logLabel}] ⚠️ 标题回调失败`, error);
                    });
                  }
                : undefined,
            hasNextChunk: chunkIndex < chunks.length - 1,
          });

          // 检查状态
          if (loopResult.status !== 'end') {
            throw new Error(`${taskLabel}任务未完成（状态: ${loopResult.status}）。请重试。`);
          }

          // 处理结果
          const extractedResults = loopResult.paragraphs;
          markProcessedParagraphsFromMap(extractedResults, processedParagraphIds);

          if (extractedResults.size > 0 && actualChunk.paragraphIds) {
            if (onlyChangedParagraphs) {
              const changedParagraphs = filterChangedParagraphs(
                actualChunk.paragraphIds,
                extractedResults,
                originalTranslations,
              );

              if (changedParagraphs.length > 0) {
                const orderedText = reconstructChunkText(
                  actualChunk.paragraphIds,
                  extractedResults,
                  originalTranslations,
                );
                resultText += orderedText;

                for (const para of changedParagraphs) {
                  paragraphResults.push(para);
                }

                if (onChunk) {
                  await onChunk({ text: orderedText, done: false });
                }
              }
            } else {
              // 翻译模式：所有段落都需要返回
              const orderedTranslations: string[] = [];
              for (const paraId of actualChunk.paragraphIds) {
                const translation = extractedResults.get(paraId);
                if (translation) {
                  orderedTranslations.push(translation);
                  paragraphResults.push({ id: paraId, translation });
                }
              }
              const orderedText = orderedTranslations.join('\n\n');
              resultText += orderedText;

              if (onChunk) {
                await onChunk({ text: orderedText, done: false });
              }
            }
          } else if (onlyChangedParagraphs && actualChunk.paragraphIds) {
            // 没有变化，使用原始翻译
            const fallbackTexts: string[] = [];
            for (const paraId of actualChunk.paragraphIds) {
              fallbackTexts.push(originalTranslations.get(paraId) || '');
            }
            const fallbackText = fallbackTexts.join('\n\n');
            resultText += fallbackText;

            if (onChunk) {
              await onChunk({ text: fallbackText, done: false });
            }
          } else {
            // 后备：使用响应文本
            const fallbackText = loopResult.responseText || '';
            resultText += fallbackText;

            if (onChunk) {
              await onChunk({ text: fallbackText, done: false });
            }
          }

          chunkProcessed = true;
          chunkIndex++;
        } catch (error) {
          const isDegradedError =
            error instanceof Error &&
            (error.message.includes('AI降级检测') || error.message.includes('重复字符'));

          if (isDegradedError) {
            retryCount++;
            if (retryCount > MAX_RETRIES) {
              console.error(
                `[${logLabel}] ❌ AI降级检测失败，块 ${chunkIndex + 1}/${chunks.length} 已重试 ${MAX_RETRIES} 次仍失败`,
                {
                  块索引: chunkIndex + 1,
                  总块数: chunks.length,
                  重试次数: MAX_RETRIES,
                },
              );
              throw new Error(
                `AI降级：检测到重复字符，已重试 ${MAX_RETRIES} 次仍失败。请检查AI服务状态或稍后重试。`,
              );
            }
            continue;
          } else {
            throw error;
          }
        }
      }
    }

    // 完成流
    if (onChunk) {
      await onChunk({ text: '', done: true });
    }

    // 验证翻译完整性（仅翻译模式）
    if (taskType === 'translation') {
      const paragraphsWithText = content.filter((p) => {
        if (!p.text || p.text.trim().length === 0) return false;
        return !isOnlySymbols(p.text);
      });
      const allParagraphIds = new Set(paragraphsWithText.map((p) => p.id));
      const processedIds = new Set(paragraphResults.map((pt) => pt.id));
      const missingParagraphIds = Array.from(allParagraphIds).filter((id) => !processedIds.has(id));

      if (missingParagraphIds.length > 0) {
        console.warn(
          `[${logLabel}] ⚠️ 发现 ${missingParagraphIds.length}/${paragraphsWithText.length} 个段落缺少${taskLabel}`,
        );
      } else {
        console.log(
          `[${logLabel}] ✅ ${taskLabel}完成：所有 ${paragraphsWithText.length} 个有效段落都有${taskLabel}`,
        );
      }
    }

    // 完成任务
    void completeTask(taskId, aiProcessingStore as AIProcessingStore | undefined, taskType);

    // 收集引用的记忆 ID
    const referencedMemoryIds = new Set<string>();
    for (const action of actions) {
      if (action.entity === 'memory') {
        const data = action.data as {
          memory_id?: string;
          id?: string;
          found_memory_ids?: string[];
        };
        if (data.memory_id) referencedMemoryIds.add(data.memory_id);
        if (data.id) referencedMemoryIds.add(data.id);
        if (data.found_memory_ids && Array.isArray(data.found_memory_ids)) {
          data.found_memory_ids.forEach((id) => referencedMemoryIds.add(id));
        }
      }
    }

    return {
      text: resultText,
      paragraphTranslations: paragraphResults,
      actions,
      ...(titleTranslation ? { titleTranslation } : {}),
      referencedMemories: Array.from(referencedMemoryIds),
      ...(taskId ? { taskId } : {}),
    };
  } catch (error) {
    void handleTaskError(
      error,
      taskId,
      aiProcessingStore as AIProcessingStore | undefined,
      taskType,
    );
    throw error;
  } finally {
    cleanupAbort();
  }
}
