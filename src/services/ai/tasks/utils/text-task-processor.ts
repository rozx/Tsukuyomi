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
import type { Paragraph } from 'src/models/novel';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import type { TaskType, AIProcessingStore } from './task-types';
import { TASK_TYPE_LABELS } from 'src/constants/ai';
import type { TextChunk } from './chunk-formatter';
import { AIServiceFactory } from '../../ai-service-factory';
import { ToolRegistry } from '../../tools/tool-registry';
import {
  buildOriginalTranslationsMap,
  getSelectedTranslation,
  filterChangedParagraphs,
  reconstructChunkText,
} from 'src/utils';
import { executeToolCallLoop } from './task-runner';
import {
  buildMaintenanceReminder,
  buildBookContextSection,
  getSpecialInstructions,
  buildIndependentChunkPrompt,
  buildChapterContextSection,
  buildSpecialInstructionsSection,
  getChapterFirstNonEmptyParagraphId,
  getHasPreviousParagraphs,
  isSkipAskUserEnabled,
  isOriginalTextValidationEnabled,
  buildPreviousChapterSection,
} from './context-builder';
import {
  DEFAULT_TASK_CHUNK_SIZE,
  filterProcessedParagraphs,
  markProcessedParagraphs,
  markProcessedParagraphsFromMap,
  buildFormattedChunks,
  buildChunks,
  resolveRuntimeTaskChunkSize,
} from './chunk-formatter';
import {
  createUnifiedAbortController,
  initializeTask,
  handleTaskError,
  completeTask,
} from './stream-handler';
import { getTodosSystemPrompt } from './todo-helper';
import { estimateMessagesTokenCount } from 'src/utils/ai-token-utils';
import { isSymbolOnly } from 'src/utils/text-utils';
import { useBooksStore } from 'src/stores/books';
import { ChapterService } from 'src/services/chapter-service';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';

/**
 * 检查是否为 AI 降级错误
 */
function isAIDegradationError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('AI降级检测') || error.message.includes('重复字符');
  }
  return false;
}

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
  aiProcessingStore?: AIProcessingStore | undefined;
}

/**
 * 从服务层 options（PolishServiceOptions / ProofreadingServiceOptions / TranslationServiceOptions）
 * 提取 processTextTask 需要的 TextTaskOptions 字段。
 *
 * 用集中的 TEXT_TASK_OPTION_KEYS + 编译期穷尽检查，避免 TextTaskOptions 新增字段时此处
 * 被遗忘导致静默丢字段。
 */
const TEXT_TASK_OPTION_KEYS = [
  'onChunk',
  'onProgress',
  'onAction',
  'onToast',
  'signal',
  'bookId',
  'chapterId',
  'chapterTitle',
  'chunkSize',
  'allChapterParagraphs',
  'aiProcessingStore',
] as const satisfies ReadonlyArray<keyof TextTaskOptions>;

// 编译期检查：若 TextTaskOptions 新增键但忘了加到上面的数组，这里就会报错
type _MissingTextTaskOptionKey = Exclude<
  keyof TextTaskOptions,
  (typeof TEXT_TASK_OPTION_KEYS)[number]
>;
const _textTaskOptionsExhaustive: [_MissingTextTaskOptionKey] extends [never] ? true : never = true;
void _textTaskOptionsExhaustive;

export function pickTextTaskOptions(options: TextTaskOptions | undefined): TextTaskOptions {
  if (!options) return {};
  const picked: TextTaskOptions = {};
  for (const key of TEXT_TASK_OPTION_KEYS) {
    if (key in options) {
      // 保留 exactOptionalPropertyTypes 下的"仅在存在时赋值"语义
      (picked as Record<string, unknown>)[key] = options[key];
    }
  }
  return picked;
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
    enableOriginalTextValidation: boolean;
  }) => string;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function getReferencedMemoryIdsFromAction(action: ActionInfo): string[] {
  if (action.entity !== 'memory') {
    return [];
  }

  const data = asRecord(action.data);
  if (!data) {
    return [];
  }

  const referencedIds = new Set<string>();

  const memoryId = data['memory_id'];
  if (typeof memoryId === 'string' && memoryId.length > 0) {
    referencedIds.add(memoryId);
  }

  const id = data['id'];
  if (typeof id === 'string' && id.length > 0) {
    referencedIds.add(id);
  }

  const foundMemoryIds = data['found_memory_ids'];
  if (Array.isArray(foundMemoryIds)) {
    for (const foundId of foundMemoryIds) {
      if (typeof foundId === 'string' && foundId.length > 0) {
        referencedIds.add(foundId);
      }
    }
  }

  return Array.from(referencedIds);
}

/**
 * 构建段落 ID → 章节原始位置索引映射
 * 优先使用 allChapterParagraphs，否则退化为 content 的数组索引
 */
function buildOriginalIndices(
  content: Paragraph[],
  allChapterParagraphs: Paragraph[] | undefined,
): Map<string, number> {
  const originalIndices = new Map<string, number>();
  const source =
    allChapterParagraphs && allChapterParagraphs.length > 0 ? allChapterParagraphs : content;
  for (let i = 0; i < source.length; i++) {
    const paragraph = source[i];
    if (paragraph) {
      originalIndices.set(paragraph.id, i);
    }
  }
  return originalIndices;
}

/**
 * 过滤出有效段落（有文本 + 可选翻译要求）
 */
function filterValidParagraphs(content: Paragraph[], requiresTranslation: boolean): Paragraph[] {
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
  return validParagraphs;
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
    enablePreviousChapter = false,
    enableBriefPlanning = false,
    collectedActions = [],
  } = taskConfig;

  const { onChunk, onProgress, signal, bookId, aiProcessingStore, chapterId, chapterTitle } =
    options;

  const actions: ActionInfo[] = [...collectedActions];
  const taskLabel = TASK_TYPE_LABELS[taskType];
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

  // 构建原始索引映射 + 过滤有效段落
  const allParagraphs = options.allChapterParagraphs;
  const originalIndices = buildOriginalIndices(content, allParagraphs);
  const validParagraphs = filterValidParagraphs(content, requiresTranslation);

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

  // console.log(`[${logLabel}] 🚀 开始${taskLabel}任务`, {
  //   段落数量: content?.length || 0,
  //   有效段落数: validParagraphs.length,
  //   AI模型: model.name,
  //   AI提供商: model.provider,
  //   书籍ID: bookId || '无',
  // });

  // 初始化任务
  const { taskId, abortController } = await initializeTask(
    aiProcessingStore,
    taskType,
    model.name,
    {
      ...(typeof bookId === 'string' ? { bookId } : {}),
      ...(typeof chapterId === 'string' ? { chapterId } : {}),
      ...(typeof chapterTitle === 'string' ? { chapterTitle } : {}),
      ...(model.maxInputTokens ? { maxInputTokens: model.maxInputTokens } : {}),
    },
  );

  // 创建统一的 AbortController
  const { controller: internalController, cleanup: cleanupAbort } = createUnifiedAbortController(
    signal,
    abortController,
  );
  const finalSignal = internalController.signal;

  try {
    const service = AIServiceFactory.getService(model.provider);
    const skipAskUser = await isSkipAskUserEnabled(bookId);
    const enableOriginalTextValidation = isOriginalTextValidationEnabled(bookId);
    const tools = ToolRegistry.getTranslationTools(bookId, {
      excludeAskUser: skipAskUser,
      enableOriginalTextValidation,
    });
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
      useCorsProxy: model.useCorsProxy,
      ...(model.customHeaders ? { customHeaders: model.customHeaders } : {}),
    };

    // 获取特殊指令
    const specialInstructions = getSpecialInstructions(bookId, chapterId, taskType);

    // 构建系统提示词
    const todosPrompt = taskId ? getTodosSystemPrompt(taskId) : '';
    const specialInstructionsSection = buildSpecialInstructionsSection(specialInstructions);
    const bookContextSection = await buildBookContextSection(bookId);
    const chapterContextSection = buildChapterContextSection(chapterId, chapterTitle);

    // 获取前一章节标题（仅翻译服务;摘要字段已移除,仅注入标题保持时序感知）
    const previousChapterSection = resolvePreviousChapterSection({
      enablePreviousChapter,
      bookId,
      chapterId,
      logLabel,
    });

    // 构建系统提示词（第一个 chunk）
    const systemPromptFirst = buildSystemPrompt({
      todosPrompt,
      bookContextSection,
      chapterContextSection: chapterContextSection + previousChapterSection,
      specialInstructionsSection,
      tools,
      skipAskUser,
      isFirstChunk: true,
      enableOriginalTextValidation,
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
      enableOriginalTextValidation,
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
    // 构建有效段落 ID 集合，用于在 buildChunks 中过滤
    // 当 continueTranslation 只传入未翻译段落时，validParagraphIds 仅包含这些段落的 ID
    // 这样 buildChunks 在遍历 allChapterParagraphs 时，只会包含目标段落，而非所有段落
    const validParagraphIds = new Set(validParagraphs.map((p) => p.id));
    const buildChunksForIds = makeBuildChunksForIds({
      requiresTranslation,
      validParagraphs,
      translationSourceParagraphs,
      chunkSize: CHUNK_SIZE,
      originalIndices,
    });
    const chunks: TextChunk[] = buildChunksForIds(validParagraphIds);

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
    const appendedText = await runChunkProcessingLoop({
      chunks,
      buildChunksForIds,
      finalSignal,
      processedParagraphIds,
      requiresTranslation,
      onlyChangedParagraphs,
      aiProcessingStore,
      taskId,
      taskLabel,
      logLabel,
      taskType,
      onProgress,
      systemPromptFirst,
      systemPromptSubsequent,
      chapterFirstNonEmptyParagraphId,
      chapterId,
      chapterTitle,
      bookId,
      toolSchemaContent,
      maxInputTokens: model.maxInputTokens,
      maxRetries: MAX_RETRIES,
      tools,
      service,
      config,
      handleAction,
      onToast: options.onToast,
      modelId: model.id,
      enableBriefPlanning,
      verifyCompleteness,
      enableOriginalTextValidation,
      actions,
      onParagraphsExtracted,
      onTitleExtracted,
      originalTranslations,
      paragraphResults,
      onChunk,
      setTitleTranslation: (title) => {
        titleTranslation = title;
      },
    });
    resultText += appendedText;

    // 完成流
    if (onChunk) {
      await onChunk({ text: '', done: true });
    }

    // 验证翻译完整性（仅翻译模式）
    if (taskType === 'translation') {
      verifyTranslationCompleteness(content, paragraphResults, logLabel, taskLabel);
    }

    // 完成任务
    void completeTask(taskId, aiProcessingStore, taskType);

    // 收集引用的记忆 ID
    const referencedMemoryIds = new Set<string>();
    for (const action of actions) {
      for (const memoryId of getReferencedMemoryIdsFromAction(action)) {
        referencedMemoryIds.add(memoryId);
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
    void handleTaskError(error, taskId, aiProcessingStore, taskType);
    throw error;
  } finally {
    cleanupAbort();
  }
}

/**
 * 获取前一章节标题注入的 section（仅启用 enablePreviousChapter 时）
 */
function resolvePreviousChapterSection(params: {
  enablePreviousChapter: boolean;
  bookId: string | undefined;
  chapterId: string | undefined;
  logLabel: string;
}): string {
  const { enablePreviousChapter, bookId, chapterId, logLabel } = params;
  if (!enablePreviousChapter || !bookId || !chapterId) {
    return '';
  }
  try {
    const booksStore = useBooksStore();
    const book = booksStore.getBookById(bookId);
    if (!book) {
      return '';
    }
    const prev = ChapterService.getPreviousChapter(book, chapterId);
    if (!prev) {
      return '';
    }
    const prevTitle = getChapterDisplayTitle(prev.chapter);
    return buildPreviousChapterSection(prevTitle);
  } catch (error) {
    console.warn(`[${logLabel}] 获取前一章节信息失败:`, error);
    return '';
  }
}

/**
 * 统一的分块构造：翻译走 buildFormattedChunks（带 originalIndices），
 * 其余任务走 buildChunks + ID 谓词。初次分块与后续重建都复用此闭包。
 */
function makeBuildChunksForIds(params: {
  requiresTranslation: boolean;
  validParagraphs: Paragraph[];
  translationSourceParagraphs: Paragraph[];
  chunkSize: number;
  originalIndices: Map<string, number>;
}): (targetIds: Set<string> | string[]) => TextChunk[] {
  const {
    requiresTranslation,
    validParagraphs,
    translationSourceParagraphs,
    chunkSize,
    originalIndices,
  } = params;
  return (targetIds: Set<string> | string[]): TextChunk[] => {
    const idSet = targetIds instanceof Set ? targetIds : new Set(targetIds);
    if (requiresTranslation) {
      const filteredParagraphs = validParagraphs.filter((p) => idSet.has(p.id));
      return buildFormattedChunks(filteredParagraphs, chunkSize, originalIndices);
    }
    return buildChunks(
      translationSourceParagraphs,
      chunkSize,
      (p, idx) => `[${idx + 1}] [ID: ${p.id}] ${p.text}\n\n`,
      (p) => !!p.text?.trim() && idSet.has(p.id),
    );
  };
}

/**
 * 若 chunk 中还有未处理段落少于原始数量，重新切块
 * 返回 'skip' 表示本次循环应直接跳过，否则返回实际应当处理的 chunk
 */
function maybeRebuildChunk(params: {
  chunk: TextChunk;
  unprocessedParagraphIds: string[];
  chunks: TextChunk[];
  chunkIndex: number;
  buildChunksForIds: (targetIds: Set<string> | string[]) => TextChunk[];
}): TextChunk | 'skip' {
  const { chunk, unprocessedParagraphIds, chunks, chunkIndex, buildChunksForIds } = params;
  if (unprocessedParagraphIds.length >= (chunk.paragraphIds?.length || 0)) {
    return chunk;
  }

  // 重建时使用全量段落数组，保持章节原始索引一致性
  const rebuiltChunks = buildChunksForIds(unprocessedParagraphIds);

  if (rebuiltChunks.length === 0) {
    // 如果重建后没有块（理论上不应发生），跳过
    return 'skip';
  }

  // 将重建的多个块插入到当前位置，替换原有的块
  chunks.splice(chunkIndex, 1, ...rebuiltChunks);
  return rebuiltChunks[0]!;
}

/**
 * Chunk 开始时更新任务状态并追加思考日志
 */
function updateChunkStartStatus(params: {
  aiProcessingStore: AIProcessingStore | undefined;
  taskId: string | undefined;
  taskLabel: string;
  chunkIndex: number;
  totalChunks: number;
  logLabel: string;
}): void {
  const { aiProcessingStore, taskId, taskLabel, chunkIndex, totalChunks, logLabel } = params;
  if (!aiProcessingStore || !taskId) return;

  aiProcessingStore
    .updateTask(taskId, {
      message: `正在${taskLabel}第 ${chunkIndex + 1}/${totalChunks} 部分...`,
      status: 'processing',
      workflowStatus: 'planning',
    })
    .catch((error) => console.error(`[${logLabel}] Failed to update task:`, error));

  aiProcessingStore
    .appendThinkingMessage(
      taskId,
      `\n\n[=== ${taskLabel}块 ${chunkIndex + 1}/${totalChunks} ===]\n\n`,
    )
    .catch((error) => console.error(`[${logLabel}] Failed to append thinking message:`, error));
}

/**
 * 调用外部进度回调
 */
function reportProgress(
  onProgress: ((progress: ProgressInfo) => void) | undefined,
  totalChunks: number,
  chunkIndex: number,
  currentParagraphs: string[] | undefined,
): void {
  if (!onProgress) return;
  const progress: ProgressInfo = {
    total: totalChunks,
    current: chunkIndex + 1,
  };
  if (currentParagraphs) {
    progress.currentParagraphs = currentParagraphs;
  }
  onProgress(progress);
}

/**
 * 估算 chunk 所对应的 tokens，并写回任务状态
 */
function updateChunkTokenEstimate(params: {
  aiProcessingStore: AIProcessingStore | undefined;
  taskId: string | undefined;
  chunkHistory: ChatMessage[];
  chunkContent: string;
  toolSchemaContent: string;
  maxInputTokens: number | undefined;
  logLabel: string;
}): void {
  const {
    aiProcessingStore,
    taskId,
    chunkHistory,
    chunkContent,
    toolSchemaContent,
    maxInputTokens,
    logLabel,
  } = params;
  if (!aiProcessingStore || !taskId) return;

  const messagesForEstimate: ChatMessage[] = [
    ...chunkHistory,
    { role: 'user', content: chunkContent },
  ];
  if (toolSchemaContent) {
    messagesForEstimate.splice(1, 0, { role: 'system', content: toolSchemaContent });
  }
  const estimatedTokens = estimateMessagesTokenCount(messagesForEstimate);
  const contextWindow = maxInputTokens || 0;
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

/**
 * 重试前清理 chunkHistory 中末尾的 user / assistant 轮
 * 并更新任务状态 / 日志
 */
function prepareChunkRetry(params: {
  chunkHistory: ChatMessage[];
  chunkIndex: number;
  totalChunks: number;
  retryCount: number;
  maxRetries: number;
  aiProcessingStore: AIProcessingStore | undefined;
  taskId: string | undefined;
  logLabel: string;
}): void {
  const {
    chunkHistory,
    chunkIndex,
    totalChunks,
    retryCount,
    maxRetries,
    aiProcessingStore,
    taskId,
    logLabel,
  } = params;
  while (chunkHistory.length > 1 && chunkHistory[chunkHistory.length - 1]?.role === 'user') {
    chunkHistory.pop();
  }
  while (chunkHistory.length > 1 && chunkHistory[chunkHistory.length - 1]?.role === 'assistant') {
    chunkHistory.pop();
  }

  console.warn(
    `[${logLabel}] ⚠️ 检测到AI降级或错误，重试块 ${chunkIndex + 1}/${totalChunks}（第 ${retryCount}/${maxRetries} 次重试）`,
  );

  if (aiProcessingStore && taskId) {
    aiProcessingStore
      .updateTask(taskId, {
        message: `检测到AI降级，正在重试第 ${retryCount}/${maxRetries} 次...`,
        status: 'processing',
      })
      .catch((error) => console.error(`[${logLabel}] Failed to update task:`, error));
  }
}

/**
 * 将 chunk 的解析结果写回 paragraphResults，并返回追加到 resultText 的文本片段
 */
async function writeChunkResult(params: {
  loopResult: { paragraphs: Map<string, string>; responseText?: string | null | undefined };
  actualChunk: TextChunk;
  onlyChangedParagraphs: boolean;
  originalTranslations: Map<string, string>;
  paragraphResults: { id: string; translation: string }[];
  onChunk: TextGenerationStreamCallback | undefined;
}): Promise<string> {
  const {
    loopResult,
    actualChunk,
    onlyChangedParagraphs,
    originalTranslations,
    paragraphResults,
    onChunk,
  } = params;

  const extractedResults = loopResult.paragraphs;

  if (extractedResults.size > 0 && actualChunk.paragraphIds) {
    if (onlyChangedParagraphs) {
      return writeChangedParagraphsResult({
        paragraphIds: actualChunk.paragraphIds,
        extractedResults,
        originalTranslations,
        paragraphResults,
        onChunk,
      });
    }
    // 翻译模式：所有段落都需要返回
    return writeTranslationResult({
      paragraphIds: actualChunk.paragraphIds,
      extractedResults,
      paragraphResults,
      onChunk,
    });
  }

  if (onlyChangedParagraphs && actualChunk.paragraphIds) {
    // 没有变化，使用原始翻译
    const fallbackText = actualChunk.paragraphIds
      .map((paraId) => originalTranslations.get(paraId) || '')
      .join('\n\n');
    if (onChunk) {
      await onChunk({ text: fallbackText, done: false });
    }
    return fallbackText;
  }

  // 后备：使用响应文本
  const fallbackText = loopResult.responseText || '';
  if (onChunk) {
    await onChunk({ text: fallbackText, done: false });
  }
  return fallbackText;
}

/**
 * 润色/校对模式：只写回发生变化的段落
 */
async function writeChangedParagraphsResult(params: {
  paragraphIds: string[];
  extractedResults: Map<string, string>;
  originalTranslations: Map<string, string>;
  paragraphResults: { id: string; translation: string }[];
  onChunk: TextGenerationStreamCallback | undefined;
}): Promise<string> {
  const { paragraphIds, extractedResults, originalTranslations, paragraphResults, onChunk } =
    params;
  const changedParagraphs = filterChangedParagraphs(
    paragraphIds,
    extractedResults,
    originalTranslations,
  );
  if (changedParagraphs.length === 0) {
    return '';
  }
  const orderedText = reconstructChunkText(paragraphIds, extractedResults, originalTranslations);
  for (const para of changedParagraphs) {
    paragraphResults.push(para);
  }
  if (onChunk) {
    await onChunk({ text: orderedText, done: false });
  }
  return orderedText;
}

/**
 * 翻译模式：全量段落都要写回
 */
async function writeTranslationResult(params: {
  paragraphIds: string[];
  extractedResults: Map<string, string>;
  paragraphResults: { id: string; translation: string }[];
  onChunk: TextGenerationStreamCallback | undefined;
}): Promise<string> {
  const { paragraphIds, extractedResults, paragraphResults, onChunk } = params;
  const orderedTranslations: string[] = [];
  for (const paraId of paragraphIds) {
    const translation = extractedResults.get(paraId);
    if (translation) {
      orderedTranslations.push(translation);
      paragraphResults.push({ id: paraId, translation });
    }
  }
  const orderedText = orderedTranslations.join('\n\n');
  if (onChunk) {
    await onChunk({ text: orderedText, done: false });
  }
  return orderedText;
}

/**
 * 处理 chunk 错误：降级错误允许重试，其他错误直接抛出
 * 返回新的 retryCount
 */
function handleChunkError(params: {
  error: unknown;
  chunkIndex: number;
  totalChunks: number;
  retryCount: number;
  maxRetries: number;
  logLabel: string;
}): number {
  const { error, chunkIndex, totalChunks, retryCount, maxRetries, logLabel } = params;
  if (!isAIDegradationError(error)) {
    throw error;
  }
  const next = retryCount + 1;
  if (next > maxRetries) {
    console.error(
      `[${logLabel}] ❌ AI降级检测失败，块 ${chunkIndex + 1}/${totalChunks} 已重试 ${maxRetries} 次仍失败`,
      {
        块索引: chunkIndex + 1,
        总块数: totalChunks,
        重试次数: maxRetries,
      },
    );
    throw new Error(
      `AI降级：检测到重复字符，已重试 ${maxRetries} 次仍失败。请检查AI服务状态或稍后重试。`,
    );
  }
  return next;
}

/**
 * 验证翻译完整性（仅翻译模式）
 */
function verifyTranslationCompleteness(
  content: Paragraph[],
  paragraphResults: { id: string; translation: string }[],
  logLabel: string,
  taskLabel: string,
): void {
  const paragraphsWithText = content.filter((p) => {
    if (!p.text || p.text.trim().length === 0) return false;
    return !isSymbolOnly(p.text);
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

/**
 * 单个 chunk 处理所需的上下文
 */
interface ChunkProcessingContext {
  chunks: TextChunk[];
  buildChunksForIds: (targetIds: Set<string> | string[]) => TextChunk[];
  finalSignal: AbortSignal;
  processedParagraphIds: Set<string>;
  requiresTranslation: boolean;
  onlyChangedParagraphs: boolean;
  aiProcessingStore: AIProcessingStore | undefined;
  taskId: string | undefined;
  taskLabel: string;
  logLabel: string;
  taskType: TaskType;
  onProgress: ((progress: ProgressInfo) => void) | undefined;
  systemPromptFirst: string;
  systemPromptSubsequent: string;
  chapterFirstNonEmptyParagraphId: string | undefined;
  chapterId: string | undefined;
  chapterTitle: string | undefined;
  bookId: string | undefined;
  toolSchemaContent: string;
  maxInputTokens: number | undefined;
  maxRetries: number;
  tools: AITool[];
  service: ReturnType<typeof AIServiceFactory.getService>;
  config: AIServiceConfig;
  handleAction: (action: ActionInfo) => void;
  onToast: ToastCallback | undefined;
  modelId: string;
  enableBriefPlanning: boolean;
  verifyCompleteness: TaskSpecificConfig['verifyCompleteness'];
  enableOriginalTextValidation: boolean;
  actions: ActionInfo[];
  onParagraphsExtracted: TaskSpecificConfig['onParagraphsExtracted'];
  onTitleExtracted: TaskSpecificConfig['onTitleExtracted'];
  originalTranslations: Map<string, string>;
  paragraphResults: { id: string; translation: string }[];
  onChunk: TextGenerationStreamCallback | undefined;
  setTitleTranslation: (title: string) => void;
}

/**
 * 顶层 chunk 处理循环：遍历全部 chunks、根据需要重建、调用 processSingleChunk
 */
async function runChunkProcessingLoop(ctx: ChunkProcessingContext): Promise<string> {
  let resultText = '';
  let chunkIndex = 0;

  while (chunkIndex < ctx.chunks.length) {
    if (ctx.finalSignal.aborted) {
      throw new Error('请求已取消');
    }

    const chunk = ctx.chunks[chunkIndex];
    if (!chunk) {
      chunkIndex++;
      continue;
    }

    const unprocessedParagraphIds = filterProcessedParagraphs(
      chunk,
      ctx.processedParagraphIds,
      ctx.logLabel,
      chunkIndex,
      ctx.chunks.length,
    );
    if (!unprocessedParagraphIds) {
      chunkIndex++;
      continue;
    }

    const rebuild = maybeRebuildChunk({
      chunk,
      unprocessedParagraphIds,
      chunks: ctx.chunks,
      chunkIndex,
      buildChunksForIds: ctx.buildChunksForIds,
    });
    if (rebuild === 'skip') {
      chunkIndex++;
      continue;
    }

    resultText += await processSingleChunk(ctx, rebuild, chunkIndex);
    chunkIndex++;
  }

  return resultText;
}

/**
 * 处理单个 chunk（含重试循环）：返回本次 chunk 追加到 resultText 的文本
 */
async function processSingleChunk(
  ctx: ChunkProcessingContext,
  actualChunk: TextChunk,
  chunkIndex: number,
): Promise<string> {
  const chunkText = actualChunk.text;

  updateChunkStartStatus({
    aiProcessingStore: ctx.aiProcessingStore,
    taskId: ctx.taskId,
    taskLabel: ctx.taskLabel,
    chunkIndex,
    totalChunks: ctx.chunks.length,
    logLabel: ctx.logLabel,
  });
  reportProgress(ctx.onProgress, ctx.chunks.length, chunkIndex, actualChunk.paragraphIds);

  const isFirstChunk = chunkIndex === 0;
  const systemPrompt = isFirstChunk ? ctx.systemPromptFirst : ctx.systemPromptSubsequent;
  const chunkHistory: ChatMessage[] = [{ role: 'system', content: systemPrompt }];

  const chunkContent = await buildChunkUserContent({
    ctx,
    actualChunk,
    chunkIndex,
    chunkText,
    isFirstChunk,
  });

  updateChunkTokenEstimate({
    aiProcessingStore: ctx.aiProcessingStore,
    taskId: ctx.taskId,
    chunkHistory,
    chunkContent,
    toolSchemaContent: ctx.toolSchemaContent,
    maxInputTokens: ctx.maxInputTokens,
    logLabel: ctx.logLabel,
  });

  // 最多允许 maxRetries 次降级重试。handleChunkError 会在非降级错误或重试用完时抛出，
  // 所以正常情况下不会走到循环末尾——保留 while 的显式上界让退出条件一目了然。
  let retryCount = 0;
  while (retryCount <= ctx.maxRetries) {
    try {
      if (retryCount > 0) {
        prepareChunkRetry({
          chunkHistory,
          chunkIndex,
          totalChunks: ctx.chunks.length,
          retryCount,
          maxRetries: ctx.maxRetries,
          aiProcessingStore: ctx.aiProcessingStore,
          taskId: ctx.taskId,
          logLabel: ctx.logLabel,
        });
      }

      chunkHistory.push({ role: 'user', content: chunkContent });
      const actionStartIndex = ctx.actions.length;

      const loopResult = await runToolLoopForChunk({
        ctx,
        chunkHistory,
        chunkText,
        actualChunk,
        chunkIndex,
        isFirstChunk,
        actionStartIndex,
      });

      if (loopResult.status !== 'end') {
        throw new Error(
          `${ctx.taskLabel}任务未完成（状态: ${loopResult.status}）。请重试。`,
        );
      }

      markProcessedParagraphsFromMap(loopResult.paragraphs, ctx.processedParagraphIds);
      return await writeChunkResult({
        loopResult,
        actualChunk,
        onlyChangedParagraphs: ctx.onlyChangedParagraphs,
        originalTranslations: ctx.originalTranslations,
        paragraphResults: ctx.paragraphResults,
        onChunk: ctx.onChunk,
      });
    } catch (error) {
      retryCount = handleChunkError({
        error,
        chunkIndex,
        totalChunks: ctx.chunks.length,
        retryCount,
        maxRetries: ctx.maxRetries,
        logLabel: ctx.logLabel,
      });
    }
  }
  // 防御性兜底：handleChunkError 应当已经抛出，这里仅为 TS 控制流
  throw new Error(`${ctx.taskLabel}任务重试 ${ctx.maxRetries} 次后仍未完成`);
}

/**
 * 构建 chunk 的用户消息内容
 */
async function buildChunkUserContent(params: {
  ctx: ChunkProcessingContext;
  actualChunk: TextChunk;
  chunkIndex: number;
  chunkText: string;
  isFirstChunk: boolean;
}): Promise<string> {
  const { ctx, actualChunk, chunkIndex, chunkText, isFirstChunk } = params;
  const maintenanceReminder = buildMaintenanceReminder(ctx.taskType);
  const currentChunkParagraphCount = actualChunk.paragraphIds?.length || 0;
  const paragraphCountNote = `\n[警告] 注意：本部分包含 ${currentChunkParagraphCount} 个段落（空段落已过滤）。段落标签 [index] 为章节原始位置（从 1 开始，可能跳号），仅用于阅读定位。提交翻译必须使用 paragraph_id（即 [ID: ...] 中的值）。`;

  const firstParagraphId = actualChunk.paragraphIds?.[0];
  const hasPreviousParagraphs = getHasPreviousParagraphs(
    ctx.chapterFirstNonEmptyParagraphId,
    firstParagraphId,
  );

  return buildIndependentChunkPrompt(
    ctx.taskType,
    chunkIndex,
    ctx.chunks.length,
    chunkText,
    paragraphCountNote,
    maintenanceReminder,
    ctx.chapterId,
    isFirstChunk ? ctx.chapterTitle : undefined,
    ctx.bookId,
    hasPreviousParagraphs,
    firstParagraphId,
  );
}

/**
 * 执行 chunk 的工具调用循环
 */
async function runToolLoopForChunk(params: {
  ctx: ChunkProcessingContext;
  chunkHistory: ChatMessage[];
  chunkText: string;
  actualChunk: TextChunk;
  chunkIndex: number;
  isFirstChunk: boolean;
  actionStartIndex: number;
}) {
  const { ctx, chunkHistory, chunkText, actualChunk, chunkIndex, isFirstChunk, actionStartIndex } =
    params;

  return executeToolCallLoop({
    history: chunkHistory,
    tools: ctx.tools,
    generateText: ctx.service.generateText.bind(ctx.service),
    aiServiceConfig: ctx.config,
    taskType: ctx.taskType,
    chunkText,
    paragraphIds: actualChunk.paragraphIds,
    bookId: ctx.bookId || '',
    handleAction: ctx.handleAction,
    onToast: ctx.onToast,
    taskId: ctx.taskId,
    aiProcessingStore: ctx.aiProcessingStore,
    aiModelId: ctx.modelId,
    logLabel: ctx.logLabel,
    chunkIndex,
    isBriefPlanning: ctx.enableBriefPlanning && chunkIndex > 0,
    collectedActions: ctx.actions,
    verifyCompleteness:
      ctx.verifyCompleteness ??
      ((_expectedIds, _receivedTranslations) => ({
        allComplete: ctx.onlyChangedParagraphs ? true : false,
        missingIds: [],
      })),
    onParagraphsExtracted: wrapOnParagraphsExtracted({ ctx, actualChunk, chunkIndex, actionStartIndex }),
    onTitleExtracted: wrapOnTitleExtracted({ ctx, isFirstChunk }),
    hasNextChunk: chunkIndex < ctx.chunks.length - 1,
    enableOriginalTextValidation: ctx.enableOriginalTextValidation,
    chapterTitle: isFirstChunk ? ctx.chapterTitle : undefined,
  });
}

/**
 * 包装 onParagraphsExtracted 回调，处理 processedParagraphIds 标记 + 错误日志
 */
function wrapOnParagraphsExtracted(params: {
  ctx: ChunkProcessingContext;
  actualChunk: TextChunk;
  chunkIndex: number;
  actionStartIndex: number;
}) {
  const { ctx, actualChunk, chunkIndex, actionStartIndex } = params;
  if (!ctx.onParagraphsExtracted || !actualChunk.paragraphIds) {
    return undefined;
  }
  const onParagraphsExtracted = ctx.onParagraphsExtracted;
  const paragraphIds = actualChunk.paragraphIds;

  return (paragraphs: { id: string; translation: string }[]) => {
    markProcessedParagraphs(paragraphs, ctx.processedParagraphIds);
    // 必须返回 Promise，以便 task-runner 中的 await 能正确等待回调完成。
    // 之前使用 void 导致 fire-and-forget，翻译数据写入内存/存储的操作可能
    // 在 batchSaveChapter 之后才完成，造成切换页面时丢失最后批次翻译的 bug。
    return Promise.resolve(
      onParagraphsExtracted({
        paragraphs,
        paragraphIds,
        originalTranslations: ctx.originalTranslations,
        processedParagraphIds: ctx.processedParagraphIds,
        chunkIndex,
        totalChunks: ctx.chunks.length,
        actions: ctx.actions,
        actionStartIndex,
      }),
    ).catch((error) => {
      console.error(
        `[${ctx.logLabel}] ⚠️ 段落回调失败（块 ${chunkIndex + 1}/${ctx.chunks.length}）`,
        error,
      );
    });
  };
}

/**
 * 包装 onTitleExtracted 回调，处理 titleTranslation 回填
 */
function wrapOnTitleExtracted(params: {
  ctx: ChunkProcessingContext;
  isFirstChunk: boolean;
}) {
  const { ctx, isFirstChunk } = params;
  if (!(isFirstChunk && ctx.chapterTitle && ctx.onTitleExtracted)) {
    return undefined;
  }
  const onTitleExtracted = ctx.onTitleExtracted;

  return (title: string) => {
    ctx.setTitleTranslation(title);
    return Promise.resolve(onTitleExtracted({ title })).catch((error) => {
      console.error(`[${ctx.logLabel}] ⚠️ 标题回调失败`, error);
    });
  };
}
