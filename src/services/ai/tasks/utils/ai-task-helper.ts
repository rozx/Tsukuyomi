/**
 * AI 任务服务的共享辅助函数
 * 用于消除重复代码，实现 DRY 原则
 */

import type {
  TextGenerationRequest,
  TextGenerationStreamCallback,
  AIToolCall,
  ChatMessage,
  AIServiceConfig,
  AITool,
} from 'src/services/ai/types/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { detectRepeatingCharacters } from 'src/services/ai/degradation-detector';
import { ToolRegistry } from 'src/services/ai/tools/index';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { ToastCallback } from 'src/services/ai/tools/toast-helper';
import { getPostToolCallReminder } from './todo-helper';
import { getChunkingInstructions, getCurrentStatusInfo } from '../prompts';
import { useBooksStore } from 'src/stores/books';
import { findUniqueTermsInText, findUniqueCharactersInText } from 'src/utils/text-matcher';
import { ChapterContentService } from 'src/services/chapter-content-service';
import type { AIModel } from 'src/services/ai/types/ai-model';
import { useAIModelsStore } from 'src/stores/ai-models';
import type { Paragraph } from 'src/models/novel';

/**
 * 任务类型
 */
export type TaskType = 'translation' | 'polish' | 'proofreading' | 'chapter_summary';

/**
 * 状态类型
 */

export type TaskStatus = 'planning' | 'working' | 'review' | 'end';

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  translation: '翻译',
  polish: '润色',
  proofreading: '校对',
  chapter_summary: '章节摘要',
};

export const MAX_DESC_LEN = 600;

export function getStatusLabel(status: TaskStatus, taskType: TaskType): string {
  if (status === 'working') {
    return `${TASK_TYPE_LABELS[taskType]}中 (working)`;
  }
  const labels: Record<Exclude<TaskStatus, 'working'>, string> = {
    planning: '规划阶段 (planning)',
    review: '复核阶段 (review)',
    end: '完成 (end)',
  };
  return labels[status];
}

function extractTranslation(translation: unknown): string {
  if (typeof translation === 'string') {
    return translation;
  }
  if (typeof translation === 'object' && translation !== null) {
    return (translation as { text?: string }).text || '';
  }
  return '';
}

function getValidTransitionsForTaskType(taskType: TaskType): Record<TaskStatus, TaskStatus[]> {
  // 翻译任务：严格四阶段
  if (taskType === 'translation') {
    return {
      planning: ['working'],
      working: ['review'],
      review: ['end', 'working'],
      end: [],
    };
  }

  // 润色/校对/章节摘要：跳过并禁用 review，固定为 planning → working → end
  return {
    planning: ['working'],
    working: ['end'],
    // 理论上不会进入 review（已禁用）。保底：若发生，允许直接结束，避免卡死。
    review: ['end'],
    end: [],
  };
}

function getTaskStateWorkflowText(taskType: TaskType): string {
  return taskType === 'translation'
    ? 'planning → working → review → end'
    : 'planning → working → end（润色/校对/摘要任务禁止使用 review）';
}

/**
 * 默认分块大小（与翻译任务保持一致）
 * [警告] 修改此值会影响 translation/polish/proofreading 三类任务的分块行为
 */
export const DEFAULT_TASK_CHUNK_SIZE = 8000;

/**
 * 获取章节第一个“非空”段落的 ID（用于判断任务是否从章节中间开始）
 * - “非空”定义：text.trim().length > 0
 * - 若无法获取（无 chapterId / 加载失败 / 无非空段落）则返回 undefined
 */
export async function getChapterFirstNonEmptyParagraphId(
  chapterId?: string,
  logLabel = 'AITaskHelper',
): Promise<string | undefined> {
  if (!chapterId) return undefined;
  try {
    const chapterContent = await ChapterContentService.loadChapterContent(chapterId);
    return chapterContent?.find((p) => !!p?.text?.trim())?.id;
  } catch (e) {
    console.warn(
      `[${logLabel}] ⚠️ 无法获取章节首段信息（chapterId: ${chapterId}）`,
      e instanceof Error ? e.message : e,
    );
    return undefined;
  }
}

/**
 * 判断当前 chunk 是否存在“前文段落”（即起始段落不是章节第一个非空段落）
 */
export function getHasPreviousParagraphs(
  chapterFirstNonEmptyParagraphId?: string,
  firstParagraphId?: string,
): boolean {
  return (
    !!chapterFirstNonEmptyParagraphId &&
    !!firstParagraphId &&
    firstParagraphId !== chapterFirstNonEmptyParagraphId
  );
}

/**
 * 为特定任务获取 AI 模型
 * 优先使用书籍特定任务模型，其次是书籍默认模型，最后是全局默认任务模型
 * @param bookId 书籍 ID
 * @param taskType 任务类型
 * @returns AI 模型
 */
export async function getAIModelForTask(
  bookId: string,
  taskType: 'translation' | 'polish' | 'proofreading' | 'termsTranslation',
): Promise<AIModel> {
  const booksStore = useBooksStore();
  const aiModelsStore = useAIModelsStore();

  const novel = booksStore.books.find((b) => b.id === bookId);
  if (!novel) {
    // 这种情况下通常应该已经加载了，但为了健壮性，这里不直接抛错，而是尝试获取全局默认
    console.warn(`[AITaskHelper] 找不到 ID 为 ${bookId} 的书籍，将使用全局默认模型`);
  }

  // 1. 映射任务类型到存储的任务类型
  // Novel 模型和 AIModel 默认任务配置中，润色(polish)和校对(proofreading)统一使用 proofreading 配置
  const storeTaskType = taskType === 'polish' ? 'proofreading' : taskType;

  // 2. 尝试从小说配置中获取
  let model: AIModel | undefined = novel?.defaultAIModel?.[storeTaskType];

  // 3. 如果没有特定任务模型，尝试获取全局默认
  if (!model) {
    if (!aiModelsStore.isLoaded) {
      await aiModelsStore.loadModels();
    }
    model = aiModelsStore.getDefaultModelForTask(storeTaskType);
  }

  if (!model || !model.enabled) {
    const label =
      taskType === 'termsTranslation' ? '术语/摘要' : TASK_TYPE_LABELS[taskType as TaskType];
    throw new Error(`未配置“${label}”模型，请在设置中配置。`);
  }

  return model;
}

/**
 * 构建格式化的块数据（用于校对或润色）
 * @param paragraphs 段落列表
 * @param chunkSize 块大小限制
 * @returns 格式化后的块列表
 */
export function buildFormattedChunks(
  paragraphs: Paragraph[],
  chunkSize: number,
): Array<{ text: string; paragraphIds: string[] }> {
  const chunks: Array<{ text: string; paragraphIds: string[] }> = [];
  let currentChunkText = '';
  let currentChunkParagraphIds: string[] = [];

  for (const paragraph of paragraphs) {
    // 获取段落的当前翻译
    const currentTranslation =
      paragraph.translations?.find((t) => t.id === paragraph.selectedTranslationId)?.translation ||
      paragraph.translations?.[0]?.translation ||
      '';

    // 格式化段落：[{index}] [ID: {id}] 原文: {原文}\n翻译: {当前翻译}
    let index = currentChunkParagraphIds.length;
    let paragraphText = `[${index}] [ID: ${paragraph.id}] 原文: ${paragraph.text}\n翻译: ${currentTranslation}\n\n`;

    // 如果当前块加上新段落超过限制，且当前块不为空，则先保存当前块
    if (currentChunkText.length + paragraphText.length > chunkSize && currentChunkText.length > 0) {
      chunks.push({
        text: currentChunkText,
        paragraphIds: currentChunkParagraphIds,
      });
      currentChunkText = '';
      currentChunkParagraphIds = [];
      // 这里的 index 重置为 0，并重新生成 paragraphText
      index = 0;
      paragraphText = `[${index}] [ID: ${paragraph.id}] 原文: ${paragraph.text}\n翻译: ${currentTranslation}\n\n`;
    }
    currentChunkText += paragraphText;
    currentChunkParagraphIds.push(paragraph.id);
  }

  // 添加最后一个块
  if (currentChunkText.length > 0) {
    chunks.push({
      text: currentChunkText,
      paragraphIds: currentChunkParagraphIds,
    });
  }

  return chunks;
}

/**
 * 解析后的 JSON 响应结果
 */
export interface ParsedResponse {
  status: TaskStatus;
  content?:
    | {
        paragraphs?: Array<{ id: string; translation: string }>;
        titleTranslation?: string;
      }
    | undefined;
  error?: string | undefined;
}

/**
 * 验证结果
 */
export interface VerificationResult {
  allComplete: boolean;
  missingIds: string[];
}

/**
 * 规划上下文更新信息
 */
export interface PlanningContextUpdate {
  newTerms?: Array<{ name: string; translation: string }>;
  newCharacters?: Array<{ name: string; translation: string }>;
  updatedMemories?: Array<{ id: string; summary: string }>;
}

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  totalTime: number;
  planningTime: number;
  workingTime: number;
  reviewTime: number;
  toolCallTime: number;
  toolCallCount: number;
  averageToolCallTime: number;
  chunkProcessingTime: number[];
}

/**
 * AI 处理 Store 接口
 */
export interface AIProcessingStore {
  addTask: (task: Omit<AIProcessingTask, 'id' | 'startTime'>) => Promise<string>;
  updateTask: (id: string, updates: Partial<AIProcessingTask>) => Promise<void>;
  appendThinkingMessage: (id: string, text: string) => Promise<void>;
  appendOutputContent: (id: string, text: string) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  activeTasks: AIProcessingTask[];
}

/**
 * 流式处理回调配置
 */
export interface StreamCallbackConfig {
  taskId: string | undefined;
  aiProcessingStore: AIProcessingStore | undefined;
  originalText: string;
  logLabel: string;
  /**
   * 当前状态（用于验证状态转换）
   */
  currentStatus?: TaskStatus;
  /**
   * 任务类型（用于生成警告消息）
   */
  taskType?: TaskType;
  /**
   * 用于停止流的 AbortController（当检测到无效状态时）
   */
  abortController?: AbortController;
}

/**
 * 解析和验证 JSON 响应（带状态字段）
 * 支持简化格式：s=status, p=paragraphs, i=index, t=translation, tt=titleTranslation
 * @param responseText AI 返回的文本
 * @param paragraphIds 可选的段落 ID 列表，用于将索引映射回实际 ID
 * @returns 解析后的结果，包含状态和内容
 */
export function parseStatusResponse(responseText: string, paragraphIds?: string[]): ParsedResponse {
  try {
    // 尝试提取 JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        status: 'working',
        error: '响应中未找到 JSON 格式',
      };
    }

    const jsonStr = jsonMatch[0];
    const data = JSON.parse(jsonStr);

    // 验证状态字段（支持 s 或 status）
    const statusValue = data.s ?? data.status;
    if (!statusValue || typeof statusValue !== 'string') {
      return {
        status: 'working',
        error: 'JSON 中缺少 status/s 字段',
      };
    }

    const status = statusValue;
    const validStatuses: TaskStatus[] = ['planning', 'working', 'review', 'end'];

    if (!validStatuses.includes(status as TaskStatus)) {
      return {
        status: 'working',
        error: `无效的状态值: ${status}，必须是 planning、working、review 或 end 之一`,
      };
    }

    // 提取内容（如果有）- 支持简化格式
    const content: ParsedResponse['content'] = {};

    // 解析段落（支持 p 或 paragraphs）
    const paragraphsData = data.p ?? data.paragraphs;
    if (paragraphsData && Array.isArray(paragraphsData)) {
      content.paragraphs = paragraphsData.map(
        (item: { i?: number; id?: string; t?: string; translation?: string }) => {
          // 支持简化格式 (i, t) 和完整格式 (id, translation)
          let id: string;
          if (typeof item.i === 'number' && paragraphIds && paragraphIds[item.i] !== undefined) {
            // 使用索引映射回实际 ID
            id = paragraphIds[item.i] as string;
          } else if (typeof item.id === 'string') {
            // 直接使用 ID
            id = item.id;
          } else if (typeof item.i === 'number') {
            // 没有映射表时，将索引转为字符串作为临时 ID
            id = String(item.i);
          } else {
            id = '';
          }
          const translation = item.t ?? item.translation ?? '';
          return { id, translation };
        },
      );
    }

    // 解析标题翻译（支持 tt 或 titleTranslation）
    const titleValue = data.tt ?? data.titleTranslation;
    if (titleValue && typeof titleValue === 'string') {
      content.titleTranslation = titleValue;
    }

    return {
      status: status as TaskStatus,
      content: Object.keys(content).length > 0 ? content : undefined,
    };
  } catch (e) {
    return {
      status: 'working',
      error: `JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * 验证段落翻译完整性
 * @param expectedParagraphIds 期望的段落 ID 列表
 * @param receivedTranslations 已收到的翻译（段落 ID 到翻译文本的映射）
 * @returns 验证结果
 */
export function verifyParagraphCompleteness(
  expectedParagraphIds: string[],
  receivedTranslations: Map<string, string>,
): VerificationResult {
  const missingIds: string[] = [];

  for (const paraId of expectedParagraphIds) {
    if (!receivedTranslations.has(paraId)) {
      missingIds.push(paraId);
    }
  }

  return {
    allComplete: missingIds.length === 0,
    missingIds,
  };
}

/**
 * 生产性工具列表（用于状态循环检测）
 * 这些工具调用表示 AI 正在积极获取上下文信息
 */
const PRODUCTIVE_TOOLS = [
  'list_terms',
  'list_characters',
  'list_memories',
  'search_memory_by_keywords',
  'get_chapter_info',
  'get_book_info',
  'get_term',
  'get_character',
  'get_memory',
  'get_recent_memories',
];

/**
 * 工具调用限制配置（基于工具类型）
 */
const TOOL_CALL_LIMITS: Record<string, number> = {
  list_terms: 3, // 术语表最多调用 3 次
  list_characters: 3, // 角色表最多调用 3 次（允许在 planning、working、review 阶段各调用一次）
  list_memories: 3, // Memory 列表通常只需要调用一次
  get_chapter_info: 2, // 章节信息最多调用 2 次
  get_book_info: 2, // 书籍信息最多调用 2 次
  list_chapters: 1, // 章节列表最多调用 1 次
  search_memory_by_keywords: 5, // 记忆搜索可以多调用几次
  default: Infinity, // 其他工具无限制
};

/**
 * 检测规划上下文是否需要更新
 * @param actions 收集的 actions
 * @returns 规划上下文更新信息（如果需要更新）
 */
export function detectPlanningContextUpdate(
  actions: ActionInfo[],
): PlanningContextUpdate | undefined {
  const newTerms: Array<{ name: string; translation: string }> = [];
  const newCharacters: Array<{ name: string; translation: string }> = [];
  const updatedMemories: Array<{ id: string; summary: string }> = [];

  for (const action of actions) {
    // 检测新创建的术语
    if (
      (action.type === 'create' || action.type === 'update') &&
      action.entity === 'term' &&
      'name' in action.data
    ) {
      const termData = action.data as { name: string; translation?: string };
      const translation = extractTranslation(termData.translation);
      newTerms.push({
        name: termData.name,
        translation,
      });
    }

    // 检测新创建的角色
    if (
      (action.type === 'create' || action.type === 'update') &&
      action.entity === 'character' &&
      'name' in action.data
    ) {
      const charData = action.data as { name: string; translation?: string };
      const translation = extractTranslation(charData.translation);
      newCharacters.push({
        name: charData.name,
        translation,
      });
    }

    // 检测新创建的记忆
    if (
      action.type === 'create' &&
      action.entity === 'memory' &&
      'summary' in action.data &&
      'id' in action.data
    ) {
      const memoryData = action.data as { id: string; summary?: string };
      updatedMemories.push({
        id: memoryData.id,
        summary: memoryData.summary || '',
      });
    }
  }

  // 如果有任何更新，返回更新信息
  if (newTerms.length > 0 || newCharacters.length > 0 || updatedMemories.length > 0) {
    return {
      ...(newTerms.length > 0 ? { newTerms } : {}),
      ...(newCharacters.length > 0 ? { newCharacters } : {}),
      ...(updatedMemories.length > 0 ? { updatedMemories } : {}),
    };
  }

  return undefined;
}

/**
 * 创建流式处理回调函数
 */
export function createStreamCallback(config: StreamCallbackConfig): TextGenerationStreamCallback {
  const {
    taskId,
    aiProcessingStore,
    originalText,
    logLabel,
    currentStatus,
    taskType,
    abortController,
  } = config;
  let accumulatedText = '';
  let lastCheckLength = 0; // 上次检查时的文本长度，避免频繁解析

  return (c) => {
    // 处理思考内容（独立于文本内容，可能在无文本时单独返回）
    if (aiProcessingStore && taskId && c.reasoningContent) {
      void aiProcessingStore.appendThinkingMessage(taskId, c.reasoningContent);
    }

    // 处理流式输出
    if (c.text) {
      // 累积文本用于检测重复字符
      accumulatedText += c.text;

      // 追加输出内容到任务
      if (aiProcessingStore && taskId) {
        void aiProcessingStore.appendOutputContent(taskId, c.text);
      }

      // 检测重复字符（AI降级检测），传入原文进行比较
      if (detectRepeatingCharacters(accumulatedText, originalText, { logLabel })) {
        throw new Error(`AI降级检测：检测到重复字符，停止${logLabel.replace('Service', '')}`);
      }

      // 实时检测无效状态（每增加一定长度后检查一次，避免频繁解析）
      if (
        currentStatus &&
        taskType &&
        accumulatedText.length - lastCheckLength > 50 && // 每增加50个字符检查一次
        accumulatedText.length > 20 // 至少要有一定长度才尝试解析
      ) {
        lastCheckLength = accumulatedText.length;

        // 只检测 status/s 字段（不用 JSON.parse），避免"JSON 尚未闭合/包含嵌套 {}"导致延迟或误判
        // 支持简化格式 "s" 和完整格式 "status"
        const statusMatch = accumulatedText.match(/"(?:s|status)"\s*:\s*"([^"]+)"/);
        if (statusMatch && statusMatch[1]) {
          const status = statusMatch[1];
          const validStatuses: TaskStatus[] = ['planning', 'working', 'review', 'end'];

          // 检查状态值是否有效
          if (!validStatuses.includes(status as TaskStatus)) {
            console.warn(`[${logLabel}] ⚠️ 检测到无效状态值: ${status}，立即停止输出`);
            abortController?.abort();
            throw new Error(
              `[警告] 检测到无效状态值: ${status}，必须是 planning、working、review 或 end 之一`,
            );
          }

          // 翻译/润色/校对任务：内容必须只在 working 阶段输出
          // 若模型在 planning/review/end 阶段输出 p/paragraphs/tt/titleTranslation，视为错误状态并中止本轮输出
          if (taskType === 'translation' || taskType === 'polish' || taskType === 'proofreading') {
            // 使用正则检测 JSON 键（key 后面紧跟冒号），避免误判字符串内部的 "p"
            // 支持简化格式 (p, tt) 和完整格式 (paragraphs, titleTranslation)
            const contentKeyRegex = /"(?:p|paragraphs|tt|titleTranslation)"\s*:/;
            const hasContentKey = contentKeyRegex.test(accumulatedText);

            const newStatus = status as TaskStatus;
            const invalidStateForContent =
              newStatus === 'planning' || newStatus === 'review' || newStatus === 'end';
            if (hasContentKey && invalidStateForContent) {
              console.warn(
                `[${logLabel}] ⚠️ 检测到内容与状态不匹配（status=${newStatus} 且包含内容字段），立即停止输出`,
              );
              abortController?.abort();
              throw new Error(
                `状态与内容不匹配：任务只能在 working 阶段输出 p/tt（当前 status=${newStatus}）`,
              );
            }
          }

          // 检查状态转换是否有效
          const validTransitions = getValidTransitionsForTaskType(taskType);

          const newStatus = status as TaskStatus;
          if (currentStatus !== newStatus) {
            const allowedNextStatuses: TaskStatus[] | undefined = validTransitions[currentStatus];
            if (!allowedNextStatuses || !allowedNextStatuses.includes(newStatus)) {
              console.warn(
                `[${logLabel}] ⚠️ 检测到无效的状态转换：${getStatusLabel(currentStatus, taskType)} → ${getStatusLabel(newStatus, taskType)}，立即停止输出`,
              );
              abortController?.abort();
              throw new Error(
                `[警告] **状态转换错误**：你试图从 "${getStatusLabel(currentStatus, taskType)}" 直接转换到 "${getStatusLabel(newStatus, taskType)}"，这是**禁止的**。正确的状态转换顺序：${getTaskStateWorkflowText(taskType)}`,
              );
            }
          }
        }
      }
    }
    return Promise.resolve();
  };
}

/**
 * 执行工具调用
 */
export async function executeToolCall(
  toolCall: AIToolCall,
  bookId: string,
  handleAction: (action: ActionInfo) => void,
  onToast: ToastCallback | undefined,
  taskId: string | undefined,
  aiProcessingStore: AIProcessingStore | undefined,
): Promise<void> {
  if (aiProcessingStore && taskId) {
    void aiProcessingStore.appendThinkingMessage(
      taskId,
      `\n[调用工具: ${toolCall.function.name}]\n`,
    );
  }

  // 执行工具
  const toolResult = await ToolRegistry.handleToolCall(
    toolCall,
    bookId,
    handleAction,
    onToast,
    taskId,
  );

  if (aiProcessingStore && taskId) {
    void aiProcessingStore.appendThinkingMessage(
      taskId,
      `[工具结果: ${toolResult.content.slice(0, 100)}...]\n`,
    );
  }
}

/**
 * 构建维护提醒（用于每个文本块）- 精简版
 */
export function buildMaintenanceReminder(taskType: TaskType): string {
  const reminders = {
    translation: `\n[提示] 空段落已过滤（无需输出/无需补回）。`,
    proofreading: `\n[提示] 空段落已过滤；只需返回有变化的段落（无变化可直接结束）。`,
    polish: `\n[提示] 空段落已过滤；只需返回有变化的段落（无变化可直接结束）。`,
    chapter_summary: '',
  };
  return reminders[taskType];
}

/**
 * 构建初始用户提示的基础部分 - 精简版
 */
export function buildInitialUserPromptBase(taskType: TaskType): string {
  const taskLabel = TASK_TYPE_LABELS[taskType];
  const chunkingInstructions = getChunkingInstructions(taskType);
  return `开始${taskLabel}。

${chunkingInstructions}`;
}

/**
 * 构建章节上下文信息（用于系统提示词）
 * @param chapterId 章节 ID（可选）
 * @param chapterTitle 章节标题（可选）
 * @returns 格式化的章节上下文字符串，如果都没有则返回空字符串
 */
export function buildChapterContextSection(chapterId?: string, chapterTitle?: string): string {
  const parts: string[] = [];
  if (chapterId) {
    parts.push(`**当前章节 ID**: \`${chapterId}\``);
  }
  if (chapterTitle) {
    parts.push(`**当前章节标题**: ${chapterTitle}`);
  }
  return parts.length > 0 ? `\n\n【当前章节信息】\n${parts.join('\n')}\n` : '';
}

/**
 * 构建书籍上下文信息（用于系统提示词）
 * - 翻译相关任务：提供书名、简介、标签，帮助模型统一风格与用词
 */
export function buildBookContextSectionFromBook(book: {
  title?: string | undefined;
  description?: string | undefined;
  tags?: string[] | undefined;
  skipAskUser?: boolean | undefined;
}): string {
  const title = typeof book.title === 'string' ? book.title.trim() : '';
  const description = typeof book.description === 'string' ? book.description.trim() : '';
  const tags = Array.isArray(book.tags)
    ? book.tags.filter((t) => typeof t === 'string' && t.trim())
    : [];
  const skipAskUser = !!book.skipAskUser;

  // 如果都没有，返回空字符串
  if (!title && !description && tags.length === 0 && !skipAskUser) {
    return '';
  }

  // 简介可能很长，做一个保守截断（避免提示词过长）
  const normalizedDesc =
    description.length > MAX_DESC_LEN
      ? `${description.slice(0, MAX_DESC_LEN)}...(已截断)`
      : description;

  const parts: string[] = [];
  if (title) {
    parts.push(`**书名**: ${title}`);
  }
  if (normalizedDesc) {
    parts.push(`**简介**: ${normalizedDesc}`);
  }
  if (tags.length > 0) {
    parts.push(`**标签**: ${tags.join('、')}`);
  }
  if (skipAskUser) {
    parts.push('**已开启跳过 AI 追问**: 是（禁止调用 `ask_user`）');
  }

  return `\n\n【书籍信息】\n${parts.join('\n')}\n`;
}

/**
 * 获取书籍上下文信息（从 store 获取；必要时回退到 BookService）
 * @param bookId 书籍 ID
 */
export async function buildBookContextSection(bookId?: string): Promise<string> {
  if (!bookId) return '';

  try {
    const { GlobalConfig } = await import('src/services/global-config-cache');
    const source = await GlobalConfig.getBookContextSource(bookId);
    if (source) {
      return buildBookContextSectionFromBook(source);
    }
  } catch (e) {
    console.warn(
      `[buildBookContextSection] ⚠️ 获取书籍上下文失败（书籍ID: ${bookId}）`,
      e instanceof Error ? e.message : e,
    );
  }

  return '';
}

/**
 * 获取书籍级配置：是否跳过 ask_user（优先 store，必要时回退 BookService）
 */
export async function isSkipAskUserEnabled(bookId?: string): Promise<boolean> {
  if (!bookId) return false;

  try {
    const { GlobalConfig } = await import('src/services/global-config-cache');
    return await GlobalConfig.isSkipAskUserEnabledForBook(bookId);
  } catch (e) {
    console.warn(
      `[isSkipAskUserEnabled] ⚠️ 获取书籍设置失败（书籍ID: ${bookId}）`,
      e instanceof Error ? e.message : e,
    );
    return false;
  }
}

/**
 * 添加章节上下文到初始提示
 * 注意：工具使用说明已在系统提示词中提供，这里只保留章节ID和简要提醒
 */
export function addChapterContext(
  prompt: string,
  chapterId: string,
  _taskType: TaskType,
  chapterTitle?: string,
): string {
  const titleLine = chapterTitle ? `**当前章节标题**: ${chapterTitle}\n` : '';
  return (
    `${prompt}\n\n**当前章节 ID**: \`${chapterId}\`\n${titleLine}` +
    `[警告] **重要提醒**: 工具**仅用于获取上下文信息**，你只需要处理**当前任务中直接提供给你的段落**。`
  );
}

/**
 * 添加段落上下文到初始提示
 */
export function addParagraphContext(
  prompt: string,
  paragraphId: string,
  taskType: TaskType,
): string {
  const taskLabel = TASK_TYPE_LABELS[taskType];

  const tools =
    taskType === 'proofreading'
      ? 'find_paragraph_by_keywords、get_chapter_info、get_previous_paragraphs、get_next_paragraphs'
      : 'find_paragraph_by_keywords、get_chapter_info';

  return (
    `${prompt}\n\n**当前段落 ID**: ${paragraphId}\n` +
    `你可以使用工具（如 ${tools} 等）获取该段落的前后上下文，` +
    `以确保${taskLabel}的一致性和连贯性。\n\n` +
    `[警告] **重要提醒**: 这些工具**仅用于获取上下文信息**，` +
    `不要用来获取待${taskLabel}的段落！你只需要处理**当前任务中直接提供给你的段落**，` +
    `不要尝试翻译工具返回的段落内容。`
  );
}

/**
 * 添加任务规划建议到初始提示 - 精简版
 */
export function addTaskPlanningSuggestions(prompt: string, _taskType: TaskType): string {
  return `${prompt}\n\n可用 \`create_todo\` 规划复杂任务`;
}

/**
 * 构建执行要点/清单（任务特定）- 精简版
 */
export function buildExecutionSection(taskType: TaskType, chapterId?: string): string {
  const chapterNote = chapterId ? `（传chapter_id: ${chapterId}）` : '';

  if (taskType === 'translation') {
    return `\n【执行】planning→获取上下文${chapterNote} | working→1:1翻译 | review→复核 | end`;
  }

  if (taskType === 'proofreading') {
    return `\n【执行】只返回有变化段落，忽略空段落`;
  }

  if (taskType === 'polish') {
    return `\n【执行】只返回有变化段落${chapterNote}，参考历史翻译`;
  }

  return '';
}

/**
 * 构建输出内容后的后续操作提示 - 精简版
 */
export function buildPostOutputPrompt(taskType: TaskType, taskId?: string): string {
  const todosReminder = taskId ? getPostToolCallReminder(undefined, taskId) : '';

  // 翻译相关任务：在 review 阶段额外提醒可回到 working 更新既有译文
  const canGoBackToWorkingReminder =
    taskType === 'translation' || taskType === 'polish' || taskType === 'proofreading'
      ? '如果你想更新任何已输出的译文/润色/校对结果，请将状态改回 `{"status":"working"}` 并只返回需要更新的段落；'
      : '';

  return `完成。${todosReminder}${canGoBackToWorkingReminder}如需后续操作请调用工具，否则返回 \`{"status": "end"}\``;
}

/**
 * 构建独立的 chunk 提示（避免 max token 问题）
 * 每个 chunk 独立，提醒 AI 使用工具获取上下文
 * @param taskType 任务类型
 * @param chunkIndex 当前 chunk 索引（从 0 开始）
 * @param totalChunks 总 chunk 数
 * @param chunkText chunk 文本内容
 * @param paragraphCountNote 段落数量提示
 * @param maintenanceReminder 维护提醒
 * @param chapterId 章节 ID（可选）
 * @param chapterTitle 章节标题（可选，仅第一个 chunk）
 * @param bookId 书籍 ID（可选，用于提取当前 chunk 中的术语和角色）
 * @param hasPreviousParagraphs 当前 chunk 的起始段落之前是否还有本章节的段落（可选）
 * @param firstParagraphId 当前 chunk 的第一个段落 ID（可选）
 * @returns 独立的 chunk 提示
 */
export function buildIndependentChunkPrompt(
  taskType: TaskType,
  chunkIndex: number,
  totalChunks: number,
  chunkText: string,
  paragraphCountNote: string,
  maintenanceReminder: string,
  chapterId?: string,
  chapterTitle?: string,
  bookId?: string,
  hasPreviousParagraphs?: boolean,
  firstParagraphId?: string,
): string {
  const taskLabel = TASK_TYPE_LABELS[taskType];

  // 工具提示：避免与 system prompt 重复，只保留最小必要提醒
  const contextToolsReminder = `\n\n[警告] **上下文获取**：如需上下文信息可调用工具获取；工具返回内容**不要**当作${taskLabel}结果直接输出。`;

  // 提取当前 chunk 中出现的术语和角色
  // 注意：每次调用时都从 store 重新获取书籍数据，确保包含在前一个 chunk 中创建/更新的术语和角色
  let currentChunkContext = '';
  if (bookId && chunkText) {
    const booksStore = useBooksStore();
    // 从 store 获取最新的书籍数据（包含所有已创建/更新的术语和角色）
    const book = booksStore.getBookById(bookId);
    if (book) {
      // 从当前 chunk 文本中提取出现的术语和角色
      // 这会自动包含在前一个 chunk 中创建的新术语和角色（因为它们已经在 store 中更新了）
      const terms = findUniqueTermsInText(chunkText, book.terminologies || []);
      const characters = findUniqueCharactersInText(chunkText, book.characterSettings || []);

      const contextParts: string[] = [];

      if (terms.length > 0) {
        const termList = terms.map((t) => `${t.name} → ${t.translation.translation}`).join('、');
        contextParts.push(`**术语**：${termList}`);
      }

      if (characters.length > 0) {
        const characterDetails = characters.map((c) => {
          const parts: string[] = [];
          parts.push(`${c.name} → ${c.translation.translation}`);

          if (c.sex) {
            const sexLabels: Record<string, string> = {
              male: '男',
              female: '女',
              other: '其他',
            };
            parts.push(`性别：${sexLabels[c.sex] || c.sex}`);
          }

          if (c.description) {
            parts.push(`描述：${c.description}`);
          }

          if (c.speakingStyle) {
            parts.push(`说话风格：${c.speakingStyle}`);
          }

          if (c.aliases && c.aliases.length > 0) {
            const aliasList = c.aliases
              .map((a) => `${a.name} → ${a.translation.translation}`)
              .join('、');
            parts.push(`别名：${aliasList}`);
          }

          return parts.join(' | ');
        });

        contextParts.push(`**角色**：\n${characterDetails.map((d) => `  - ${d}`).join('\n')}`);
      }

      if (contextParts.length > 0) {
        currentChunkContext = `\n\n【当前部分出现的术语和角色】\n${contextParts.join('\n')}\n`;
        currentChunkContext += `提供的角色以及术语信息已为最新，不必使用工具再次获取检查。\n`;
      }
    }
  }

  // 起始段落提示：当本次任务从章节中间开始（即起始段落不是章节第一个非空段落）时，提醒 AI 可用工具取前文
  const startContextHint =
    hasPreviousParagraphs === true && firstParagraphId
      ? `\n\n【起始段落位置】\n**起始段落ID**: \`${firstParagraphId}\`\n[提示] 在此之前还有段落。如需前文上下文，可调用 \`get_previous_paragraphs\`（参数 \`paragraph_id\` 传入起始段落ID）。仅用于上下文，不要把工具返回内容当作${taskLabel}结果输出。\n`
      : '';

  // 第一个 chunk：完整规划阶段
  // 注意：章节 ID 已在系统提示词中提供
  if (chunkIndex === 0) {
    // 如果有章节标题，添加明确的翻译指令
    const titleInstruction =
      chapterTitle && taskType === 'translation'
        ? `\n\n**章节标题翻译**：请翻译以下章节标题，并在输出 JSON 中包含 \`titleTranslation\` 字段：
【章节标题】${chapterTitle}`
        : '';

    return `开始${taskLabel}任务。如需上下文可先调用工具；准备好后返回 \`{"status":"working", ...}\` 并开始${taskLabel}。${titleInstruction}${currentChunkContext}${startContextHint}

以下是第一部分内容（第 ${chunkIndex + 1}/${totalChunks} 部分）：${paragraphCountNote}\n\n${chunkText}${maintenanceReminder}${contextToolsReminder}`;
  } else {
    // 后续 chunk：简短规划阶段，包含当前 chunk 中出现的术语和角色
    const briefPlanningNote = currentChunkContext
      ? '以上是当前部分中出现的术语和角色，请确保翻译时使用这些术语和角色的正确翻译。'
      : '';

    return `继续${taskLabel}任务（第 ${chunkIndex + 1}/${totalChunks} 部分）。${currentChunkContext}${startContextHint}

**[警告] 重要：简短规划阶段（已继承上文规划）**
${briefPlanningNote}请直接将状态设置为 "working" 并开始${taskLabel}。

以下是待${taskLabel}内容：${paragraphCountNote}\n\n${chunkText}${maintenanceReminder}`;
  }
}

/**
 * 处理工具调用循环
 */
export interface ToolCallLoopConfig {
  history: ChatMessage[];
  tools: AITool[];
  generateText: (
    config: AIServiceConfig,
    request: TextGenerationRequest,
    callback: TextGenerationStreamCallback,
  ) => Promise<{
    text: string;
    toolCalls?: AIToolCall[];
    reasoningContent?: string;
  }>;
  aiServiceConfig: AIServiceConfig;
  taskType: TaskType;
  chunkText: string;
  paragraphIds: string[] | undefined;
  bookId: string;
  handleAction: (action: ActionInfo) => void;
  onToast: ToastCallback | undefined;
  taskId: string | undefined;
  aiProcessingStore: AIProcessingStore | undefined;
  logLabel: string;
  maxTurns?: number;
  /**
   * 验证回调：用于服务特定的验证逻辑
   * @param expectedIds 期望的段落 ID 列表
   * @param receivedTranslations 已收到的翻译
   * @returns 验证结果
   */
  verifyCompleteness?: (
    expectedIds: string[],
    receivedTranslations: Map<string, string>,
  ) => VerificationResult;
  /**
   * 段落翻译提取回调：每当从 AI 响应中提取到段落翻译时立即调用
   * 用于实时更新 UI，不等待整个循环完成
   */
  onParagraphsExtracted?:
    | ((paragraphs: { id: string; translation: string }[]) => void | Promise<void>)
    | undefined;
  /**
   * 标题翻译提取回调：每当从 AI 响应中提取到标题翻译时立即调用
   */
  onTitleExtracted?: ((title: string) => void | Promise<void>) | undefined;
  /**
   * 是否为简短规划模式（用于后续 chunk，已继承前一个 chunk 的规划上下文）
   * 当为 true 时，AI 会收到简化的规划指令，无需重复获取术语/角色信息
   */
  isBriefPlanning?: boolean;
  /**
   * 收集的 actions（用于检测规划上下文更新）
   */
  collectedActions?: ActionInfo[];
  /**
   * 当前 chunk 索引（用于错误日志）
   */
  chunkIndex?: number;
}

/**
 * 执行工具调用循环（基于状态的流程）
 * 返回最终响应文本和状态信息
 */
export interface ToolCallLoopResult {
  responseText: string | null;
  status: TaskStatus;
  paragraphs: Map<string, string>;
  titleTranslation?: string | undefined;
  /**
   * 规划阶段的摘要信息（用于在多个 chunk 之间共享上下文）
   * 包含 AI 在规划阶段的决策、获取的术语/角色信息等
   */
  planningSummary?: string | undefined;
  /**
   * 规划上下文更新信息（用于后续 chunk 更新共享上下文）
   */
  planningContextUpdate?: PlanningContextUpdate | undefined;
  /**
   * 性能指标
   */
  metrics?: PerformanceMetrics | undefined;
}

export async function executeToolCallLoop(config: ToolCallLoopConfig): Promise<ToolCallLoopResult> {
  const {
    history,
    tools,
    generateText,
    aiServiceConfig,
    taskType,
    chunkText,
    paragraphIds,
    bookId,
    handleAction,
    onToast,
    taskId,
    aiProcessingStore,
    logLabel,
    maxTurns = Infinity,
    verifyCompleteness,
    onParagraphsExtracted,
    onTitleExtracted,
    isBriefPlanning = false,
    collectedActions = [],
  } = config;

  let currentTurnCount = 0;
  let currentStatus: TaskStatus = 'planning';
  const accumulatedParagraphs = new Map<string, string>();
  let titleTranslation: string | undefined;
  let finalResponseText: string | null = null;

  // 用于检测状态循环：记录每个状态连续出现的次数
  let consecutivePlanningCount = 0;
  let consecutiveWorkingCount = 0;
  let consecutiveReviewCount = 0;
  const MAX_CONSECUTIVE_STATUS = 2; // 同一状态最多连续出现 2 次（加速流程）

  // 用于检测“状态与内容不匹配”的连续次数（避免模型反复输出错误状态导致无限重试）
  let consecutiveContentStateMismatchCount = 0;
  const MAX_CONSECUTIVE_CONTENT_STATE_MISMATCH = 2;

  // 用于收集规划阶段的信息（在 planning → working 转换时提取摘要）
  let planningSummary: string | undefined;
  const planningResponses: string[] = []; // 收集 AI 在规划阶段的响应
  const planningToolResults: { tool: string; result: string }[] = []; // 收集规划阶段的工具结果

  // 性能监控
  const metrics: PerformanceMetrics = {
    totalTime: 0,
    planningTime: 0,
    workingTime: 0,
    reviewTime: 0,
    toolCallTime: 0,
    toolCallCount: 0,
    averageToolCallTime: 0,
    chunkProcessingTime: [],
  };
  const startTime = Date.now();
  let statusStartTime = Date.now();

  // 工具调用计数（用于限制）
  const toolCallCounts = new Map<string, number>();
  // 允许的工具名称集合（严格限制：只能调用本次请求提供的 tools）
  const allowedToolNames = new Set(tools.map((t) => t.function.name));

  const taskLabel = TASK_TYPE_LABELS[taskType];

  while (maxTurns === Infinity || currentTurnCount < maxTurns) {
    currentTurnCount++;

    const request: TextGenerationRequest = {
      messages: history,
      ...(tools.length > 0 ? { tools } : {}),
    };

    // 用于存储流式输出中累积的文本（用于无效状态检测时的错误处理）
    let streamedText = '';

    // 为本次请求创建“可主动中止”的 signal（用于检测到无效状态时立即停止流）
    // 注意：每个 turn 都必须使用新的 AbortController，否则一旦中止就无法重试
    const { controller: streamAbortController, cleanup: cleanupAbort } =
      createUnifiedAbortController(aiServiceConfig.signal);
    const aiServiceConfigForThisTurn: AIServiceConfig = {
      ...aiServiceConfig,
      signal: streamAbortController.signal,
    };

    // 创建流式处理回调（传入当前状态以便实时检测无效状态）
    const streamCallbackConfig: StreamCallbackConfig = {
      taskId,
      aiProcessingStore,
      originalText: chunkText,
      logLabel,
      currentStatus,
      taskType,
      abortController: streamAbortController,
    };
    const streamCallback = createStreamCallback(streamCallbackConfig);

    // 包装流式回调以捕获累积文本
    const wrappedStreamCallback: TextGenerationStreamCallback = async (chunk) => {
      // 累积文本用于错误处理
      if (chunk.text) {
        streamedText += chunk.text;
      }
      // 调用原始回调
      return streamCallback(chunk);
    };

    // 调用 AI（捕获流式回调中抛出的无效状态错误）
    let result;
    try {
      result = await generateText(aiServiceConfigForThisTurn, request, wrappedStreamCallback);
    } catch (streamError) {
      // 检查是否是无效状态错误
      if (
        streamError instanceof Error &&
        (streamError.message.includes('无效状态') ||
          streamError.message.includes('状态转换错误') ||
          streamError.message.includes('状态与内容不匹配'))
      ) {
        console.warn(`[${logLabel}] ⚠️ 流式输出中检测到无效状态，已停止输出`);

        // 使用累积的流式文本或结果文本
        const partialResponse = result?.text !== undefined ? result.text : streamedText || '';

        // 立即警告 AI

        // 解析错误消息以获取详细信息
        const errorMessage = streamError.message;
        let warningMessage = errorMessage;

        // 如果错误消息包含状态转换信息，提取并格式化
        if (errorMessage.includes('状态转换错误')) {
          const validTransitions = getValidTransitionsForTaskType(taskType);
          const expectedNextStatus: TaskStatus = validTransitions[currentStatus]?.[0] || 'working';
          warningMessage =
            `[警告] **状态转换错误**：你返回了无效的状态转换。\n\n` +
            `**正确的状态转换顺序**：${getTaskStateWorkflowText(taskType)}\n\n` +
            `你当前处于 "${getStatusLabel(currentStatus, taskType)}"，应该先转换到 "${getStatusLabel(expectedNextStatus, taskType)}"。\n\n` +
            `请重新返回正确的状态：{"status": "${expectedNextStatus}"}`;
        } else if (errorMessage.includes('无效状态值')) {
          // 无效状态值的警告
          warningMessage =
            `[警告] **无效状态值**：你返回了无效的状态值。\n\n` +
            `**有效的状态值**：planning、working、review、end\n\n` +
            `你当前处于 "${getStatusLabel(currentStatus, taskType)}"，请返回正确的状态值。`;
        } else if (errorMessage.includes('状态与内容不匹配')) {
          consecutiveContentStateMismatchCount++;
          if (consecutiveContentStateMismatchCount > MAX_CONSECUTIVE_CONTENT_STATE_MISMATCH) {
            throw new Error(
              `AI 多次返回状态与内容不匹配，已超过最大重试次数（${MAX_CONSECUTIVE_CONTENT_STATE_MISMATCH}）。请更换模型或稍后重试。`,
            );
          }

          warningMessage =
            `[警告] **状态与内容不匹配**：你在非 working 状态下输出了 paragraphs/titleTranslation。\n\n` +
            `本任务中，**只有**当 \`status="working"\` 时才允许输出内容字段。\n\n` +
            `请你立刻重试：用 \`{"status":"working", ...}\` 重新返回（内容保持一致即可）。`;
        }

        // 将部分响应添加到历史（如果有）
        if (partialResponse.trim()) {
          history.push({
            role: 'assistant',
            content: partialResponse,
          });
        }

        // 立即添加警告消息
        history.push({
          role: 'user',
          content: `${getCurrentStatusInfo(taskType, currentStatus, isBriefPlanning)}\n\n${warningMessage}`,
        });

        // 继续循环，让 AI 重新响应
        continue;
      }

      // 其他错误，重新抛出
      throw streamError;
    } finally {
      cleanupAbort();
    }

    // 保存思考内容
    if (aiProcessingStore && taskId && result.reasoningContent) {
      void aiProcessingStore.appendThinkingMessage(taskId, result.reasoningContent);
    }

    // 检查是否有工具调用
    if (result.toolCalls && result.toolCalls.length > 0) {
      // 工具调用在所有状态阶段都允许
      // DeepSeek 要求：如果有 tool_calls，必须包含 reasoning_content 字段（即使为 null）
      history.push({
        role: 'assistant',
        // [兼容] Moonshot/Kimi 等 OpenAI 兼容服务可能不允许 assistant content 为空（即使有 tool_calls）
        content: result.text && result.text.trim() ? result.text : '（调用工具）',
        tool_calls: result.toolCalls,
        reasoning_content: result.reasoningContent || null, // DeepSeek 要求此字段必须存在
      });

      // 执行工具
      let hasProductiveTool = false;
      for (const toolCall of result.toolCalls) {
        const toolName = toolCall.function.name;

        // [警告] 严格限制：只能调用本次会话提供的 tools
        if (!allowedToolNames.has(toolName)) {
          console.warn(
            `[${logLabel}] ⚠️ 工具 ${toolName} 未在本次会话提供的 tools 列表中，已拒绝执行`,
          );
          history.push({
            role: 'tool',
            content:
              `[警告] 工具 ${toolName} 未在本次会话提供的 tools 列表中，禁止调用。` +
              `请改用可用工具或基于已有上下文继续${taskLabel}。`,
            tool_call_id: toolCall.id,
            name: toolName,
          });
          continue;
        }

        // 检查工具调用限制
        // 检查工具调用限制
        const currentCount = toolCallCounts.get(toolName) || 0;
        const limit = TOOL_CALL_LIMITS[toolName] ?? TOOL_CALL_LIMITS.default;
        const safeLimit = limit as number;

        if (safeLimit !== Infinity && currentCount >= safeLimit) {
          console.warn(
            `[${logLabel}] ⚠️ 工具 ${toolName} 调用次数已达上限（${safeLimit}），跳过此次调用`,
          );
          // 添加工具结果，告知 AI 已达到限制
          history.push({
            role: 'tool',
            content: `[警告] 工具 ${toolName} 调用次数已达上限（${safeLimit} 次），请使用已获取的信息继续工作。`,
            tool_call_id: toolCall.id,
            name: toolName,
          });
          continue;
        }

        // 更新工具调用计数
        toolCallCounts.set(toolName, currentCount + 1);

        // 检查是否为生产性工具
        if (PRODUCTIVE_TOOLS.includes(toolName)) {
          hasProductiveTool = true;
        }

        if (aiProcessingStore && taskId) {
          void aiProcessingStore.appendThinkingMessage(taskId, `\n[调用工具: ${toolName}]\n`);
        }

        // 记录工具调用开始时间
        const toolCallStartTime = Date.now();

        const toolResult = await ToolRegistry.handleToolCall(
          toolCall,
          bookId,
          handleAction,
          onToast,
          taskId,
        );

        // 记录工具调用耗时
        const toolCallDuration = Date.now() - toolCallStartTime;
        metrics.toolCallTime += toolCallDuration;
        metrics.toolCallCount++;

        // 直接使用工具结果，不进行截断
        const toolResultContent = toolResult.content;

        if (aiProcessingStore && taskId) {
          void aiProcessingStore.appendThinkingMessage(
            taskId,
            `[工具结果: ${toolResultContent.slice(0, 100)}...]\n`,
          );
        }

        // 在规划阶段收集工具结果（用于后续 chunk 的上下文共享）
        if (currentStatus === 'planning') {
          // 只收集关键工具的结果（术语、角色、记忆等）
          const keyTools = [
            'list_terms',
            'list_characters',
            'search_memory_by_keywords',
            'get_chapter_info',
            'get_book_info',
            'list_chapters',
          ];
          if (keyTools.includes(toolName)) {
            // 如果是简短规划模式且调用了已获取的工具，给出警告
            if (isBriefPlanning) {
              console.warn(
                `[${logLabel}] ⚠️ 简短规划模式下检测到重复工具调用: ${toolName}，该工具的结果已在规划上下文中提供`,
              );
              // 在工具结果后添加警告信息，提醒 AI 这些信息已经在上下文中
              const warningMessage = `\n\n[警告] **注意**：此工具的结果已在规划上下文中提供，后续 chunk 无需重复调用此工具。`;
              history.push({
                role: 'tool',
                content: toolResultContent + warningMessage,
                tool_call_id: toolCall.id,
                name: toolName,
              });
              // 跳过正常的工具结果推送，因为已经推送了带警告的版本
              // [DEBUG] 这里 continue 会跳过后续的 history.push，这是预期的行为
              continue;
            }
            planningToolResults.push({
              tool: toolName,
              result: toolResultContent, // 使用完整结果
            });
          }
        }

        // 注意：如果已经在上面推送了带警告的工具结果，这里会跳过（通过 continue）
        // 否则正常推送工具结果（使用完整结果）
        history.push({
          role: 'tool',
          content: toolResultContent,
          tool_call_id: toolCall.id,
          name: toolName,
        });
      }

      // 只有生产性工具调用才重置循环检测计数器
      // 这样可以避免在 AI 合法地使用工具获取信息时触发误报
      if (hasProductiveTool) {
        consecutivePlanningCount = 0;
        consecutiveWorkingCount = 0;
        consecutiveReviewCount = 0;
      }

      // 工具调用完成后，直接继续循环，让 AI 基于工具结果自然继续
      continue;
    }

    // 没有工具调用，解析响应
    const responseText = result.text || '';
    finalResponseText = responseText;

    // 检测重复字符
    if (detectRepeatingCharacters(responseText, chunkText, { logLabel })) {
      throw new Error(
        `AI降级检测：最终响应中检测到重复字符（chunkIndex: ${config.chunkIndex ?? 'unknown'}, paragraphCount: ${paragraphIds?.length ?? 0}）`,
      );
    }

    // 解析状态响应
    // 传入 paragraphIds 以支持索引映射（Simplified Schema: i -> id）
    const parsed = parseStatusResponse(responseText, paragraphIds);

    if (parsed.error) {
      // JSON 解析失败，要求重试
      console.warn(`[${logLabel}] ⚠️ ${parsed.error}`);
      history.push({
        role: 'assistant',
        content: responseText,
      });
      history.push({
        role: 'user',
        content:
          `${getCurrentStatusInfo(taskType, currentStatus, isBriefPlanning)}\n\n` +
          `响应格式错误：${parsed.error}。[警告] 只返回JSON。` +
          `你可以直接返回 \`{"status":"working","paragraphs":[...]}\`（或仅返回 \`{"status":"working"}\`）。` +
          `系统会自动检查缺失段落。`,
      });
      continue;
    }

    // 容错：部分模型可能在输出内容时误标为 planning
    // 规则：当返回包含段落/标题等实际内容时，视作 working（避免多一轮来回）
    const paragraphs = parsed.content?.paragraphs;
    const hasContent =
      !!parsed.content?.titleTranslation || (Array.isArray(paragraphs) && paragraphs.length > 0);

    // 翻译/润色/校对任务：只要输出 paragraphs/titleTranslation，就必须处于 working
    // 若状态为 planning/review/end 且包含内容，视为错误状态：纠正并让模型重试
    if (
      (taskType === 'translation' || taskType === 'polish' || taskType === 'proofreading') &&
      hasContent &&
      parsed.status !== 'working'
    ) {
      consecutiveContentStateMismatchCount++;
      if (consecutiveContentStateMismatchCount > MAX_CONSECUTIVE_CONTENT_STATE_MISMATCH) {
        throw new Error(
          `AI 多次返回状态与内容不匹配，已超过最大重试次数（${MAX_CONSECUTIVE_CONTENT_STATE_MISMATCH}）。请更换模型或稍后重试。`,
        );
      }

      history.push({
        role: 'assistant',
        content: responseText,
      });
      history.push({
        role: 'user',
        content:
          `${getCurrentStatusInfo(taskType, currentStatus, isBriefPlanning)}\n\n` +
          `[警告] **状态与内容不匹配**：本任务中，只有当 \`status="working"\` 时才允许输出 ` +
          `\`paragraphs/titleTranslation\`。\n\n` +
          `你当前返回的 status="${parsed.status}" 却包含了内容字段。` +
          `请立刻重试：用 \`{"status":"working", ...}\` 重新返回（内容保持一致即可）。`,
      });
      continue;
    }

    // 已进入正常处理流程，重置 mismatch 计数器
    consecutiveContentStateMismatchCount = 0;

    const newStatus: TaskStatus =
      taskType !== 'translation' && parsed.status === 'planning' && hasContent
        ? 'working'
        : parsed.status;
    const previousStatus: TaskStatus = currentStatus;

    // 记录状态转换时间
    if (previousStatus !== newStatus) {
      const statusDuration = Date.now() - statusStartTime;
      switch (previousStatus) {
        case 'planning':
          metrics.planningTime += statusDuration;
          break;
        case 'working':
          metrics.workingTime += statusDuration;
          break;
        case 'review':
          metrics.reviewTime += statusDuration;
          break;
      }
      statusStartTime = Date.now();
    }

    // 定义允许的状态转换（按任务类型区分）
    const validTransitions = getValidTransitionsForTaskType(taskType);

    // 检查状态转换是否有效
    if (previousStatus !== newStatus) {
      const allowedNextStatuses: TaskStatus[] | undefined = validTransitions[previousStatus];
      if (!allowedNextStatuses || !allowedNextStatuses.includes(newStatus)) {
        // 无效的状态转换，提醒AI
        console.warn(
          `[${logLabel}] ⚠️ 检测到无效的状态转换：${getStatusLabel(previousStatus, taskType)} → ${getStatusLabel(newStatus, taskType)}`,
        );

        const expectedNextStatus: TaskStatus =
          (allowedNextStatuses?.[0] as TaskStatus) || 'working';

        history.push({
          role: 'assistant',
          content: responseText,
        });

        history.push({
          role: 'user',
          content:
            `[警告] **状态转换错误**：你试图从 "${getStatusLabel(previousStatus, taskType)}" 直接转换到 "${getStatusLabel(newStatus, taskType)}"，这是**禁止的**。\n\n` +
            `**正确的状态转换顺序**：${getTaskStateWorkflowText(taskType)}\n\n` +
            `你当前处于 "${getStatusLabel(previousStatus, taskType)}"，应该先转换到 "${getStatusLabel(expectedNextStatus, taskType)}"。\n\n` +
            `请重新返回正确的状态：{"status": "${expectedNextStatus}"}${newStatus === 'working' && previousStatus === 'planning' ? ' 或包含内容时 {"status": "working", "paragraphs": [...]}' : ''}`,
        });

        // 不更新状态，继续循环让AI重新响应
        continue;
      }
    }

    // 检测 planning → working 状态转换，提取规划摘要
    if (previousStatus === 'planning' && newStatus === 'working' && !planningSummary) {
      // 构建规划摘要
      const summaryParts: string[] = [];

      // 添加 AI 的规划响应摘要（包括之前的规划响应）
      if (planningResponses.length > 0) {
        summaryParts.push('【AI规划决策】');
        summaryParts.push(planningResponses.join('\n'));
      }

      // 添加当前转换响应（从 planning 到 working 的响应，这是最终的规划决策）
      if (responseText && responseText.trim().length > 0) {
        if (summaryParts.length === 0) {
          summaryParts.push('【AI规划决策】');
        }
        summaryParts.push(responseText);
      }

      // 添加关键工具结果摘要
      if (planningToolResults.length > 0) {
        summaryParts.push('\n【已获取的上下文信息】');
        for (const { tool, result } of planningToolResults) {
          // 使用完整的工具结果
          summaryParts.push(`- ${tool}: ${result}`);
        }
      }

      if (summaryParts.length > 0) {
        planningSummary = summaryParts.join('\n');
        console.log(`[${logLabel}] ✅ 已提取规划摘要（${planningSummary.length} 字符）`);
      }
    }

    // 更新状态
    currentStatus = newStatus;

    // 提取内容
    // 注意：必须先处理标题翻译，确保标题更新后再处理段落
    // 这样段落处理时可以读取到最新的标题
    if (parsed.content) {
      // 1. 先处理标题翻译（必须等待完成）
      if (parsed.content.titleTranslation) {
        // 允许标题翻译在同一任务中被更新（以最新为准）
        if (titleTranslation !== parsed.content.titleTranslation) {
          titleTranslation = parsed.content.titleTranslation;
          // 立即调用标题回调，并等待完成
          if (onTitleExtracted) {
            try {
              await onTitleExtracted(titleTranslation);
            } catch (error) {
              console.error(`[${logLabel}] ⚠️ onTitleExtracted 回调失败:`, error);
            }
          }
        }
      }

      // 2. 再处理段落翻译（此时标题已更新）
      if (parsed.content.paragraphs) {
        const newParagraphs: { id: string; translation: string }[] = [];
        for (const para of parsed.content.paragraphs) {
          // 只处理有效的段落翻译（有ID且翻译内容不为空）
          if (para.id && para.translation && para.translation.trim().length > 0) {
            // 允许同一段落在同一任务中被"纠错/改写"
            // 策略：当翻译内容发生变化时，以最新输出为准（last-write-wins）
            const prev = accumulatedParagraphs.get(para.id);
            if (prev !== para.translation) {
              accumulatedParagraphs.set(para.id, para.translation);
              newParagraphs.push({ id: para.id, translation: para.translation });
            }
          }
        }
        if (newParagraphs.length > 0) {
          // 立即调用回调，不等待循环完成（但标题已更新）
          if (onParagraphsExtracted) {
            try {
              await onParagraphsExtracted(newParagraphs);
            } catch (error) {
              console.error(`[${logLabel}] ⚠️ onParagraphsExtracted 回调失败:`, error);
              // 根据需要决定是否抛出错误
            }
          }
        }
      }
    }

    // 将响应添加到历史
    history.push({
      role: 'assistant',
      content: responseText,
    });

    // 根据状态处理
    if (currentStatus === 'planning') {
      // 更新连续状态计数
      consecutivePlanningCount++;
      consecutiveWorkingCount = 0; // 重置其他状态计数
      consecutiveReviewCount = 0; // 重置其他状态计数

      // 收集规划阶段的 AI 响应（用于后续 chunk 的上下文共享）
      if (responseText && responseText.trim().length > 0) {
        planningResponses.push(responseText);
      }

      // 检测循环：如果连续处于 planning 状态超过阈值，强制要求开始工作
      if (consecutivePlanningCount >= MAX_CONSECUTIVE_STATUS) {
        console.warn(
          `[${logLabel}] ⚠️ 检测到 planning 状态循环（连续 ${consecutivePlanningCount} 次），强制要求开始工作`,
        );
        history.push({
          role: 'user',
          content:
            `${getCurrentStatusInfo(taskType, currentStatus, isBriefPlanning)}\n\n` +
            `[警告] **立即开始${taskLabel}**！你已经在规划阶段停留过久。` +
            `**现在必须**将状态设置为 "working" 并**立即输出${taskLabel}结果**。` +
            `不要再返回 planning 状态，直接开始${taskLabel}工作。` +
            `返回格式：\`{"status": "working", "paragraphs": [...]}\``,
        });
      } else {
        // 正常的 planning 响应 - 使用更明确的指令
        // 如果是简短规划模式，强烈提醒 AI 已有上下文信息，无需重复获取
        const planningInstruction = isBriefPlanning
          ? `收到。你已继承前一部分的规划上下文（包括术语、角色、记忆等信息），**请直接使用这些信息**。` +
            `如需补充信息，优先使用**本次会话提供的工具**，并遵循“最小必要”原则（拿到信息就立刻回到任务输出）。` +
            `只有在需要获取当前段落的前后文上下文时，才建议使用 \`get_previous_paragraphs\`、\`get_next_paragraphs\` 等段落上下文工具。` +
            `仍然注意敬语翻译流程，确保翻译结果准确。`
          : `收到。如果你已获取必要信息，` +
            `**现在**将状态设置为 "working" 并开始输出${taskLabel}结果。` +
            `如果还需要使用工具获取信息，请调用工具后再更新状态。`;
        history.push({
          role: 'user',
          content: `${getCurrentStatusInfo(taskType, currentStatus, isBriefPlanning)}\n\n${planningInstruction}`,
        });
      }
      continue;
    } else if (currentStatus === 'working') {
      // 更新连续状态计数
      consecutiveWorkingCount++;
      consecutivePlanningCount = 0; // 重置其他状态计数
      consecutiveReviewCount = 0; // 重置其他状态计数

      // 检测循环：如果连续处于 working 状态超过阈值且没有输出段落，强制要求完成
      if (consecutiveWorkingCount >= MAX_CONSECUTIVE_STATUS && accumulatedParagraphs.size === 0) {
        console.warn(
          `[${logLabel}] ⚠️ 检测到 working 状态循环（连续 ${consecutiveWorkingCount} 次且无输出），强制要求输出内容`,
        );

        const finishStatus = taskType === 'translation' ? 'review' : 'end';
        const noChangeHint =
          taskType === 'polish' || taskType === 'proofreading'
            ? `如果你确认**没有任何需要修改的段落**，请将状态设置为 "${finishStatus}"（无需输出 paragraphs）；否则请只返回有变化的段落。`
            : '';

        history.push({
          role: 'user',
          content:
            `${getCurrentStatusInfo(taskType, currentStatus)}\n\n` +
            `[警告] **立即输出${taskLabel}结果**！你已经在工作阶段停留过久但没有输出任何内容。` +
            `**现在必须**输出${taskLabel}结果。${noChangeHint}` +
            `返回格式：\`{"status": "working", "paragraphs": [{"id": "段落ID", "translation": "${taskLabel}结果"}]}\``,
        });
      } else {
        // 检查是否所有段落都已返回
        let allParagraphsReturned = false;
        if (paragraphIds && paragraphIds.length > 0) {
          const verification = verifyCompleteness
            ? verifyCompleteness(paragraphIds, accumulatedParagraphs)
            : verifyParagraphCompleteness(paragraphIds, accumulatedParagraphs);
          allParagraphsReturned = verification.allComplete;
        }

        if (allParagraphsReturned) {
          const finishStatus = taskType === 'translation' ? 'review' : 'end';
          // 所有段落都已返回，提醒 AI 可以结束当前块
          history.push({
            role: 'user',
            content:
              `${getCurrentStatusInfo(taskType, currentStatus)}\n\n` +
              `所有段落${taskLabel}已完成。如果不需要继续${taskLabel}，可以将状态设置为 "${finishStatus}"。` +
              (taskType === 'polish' || taskType === 'proofreading'
                ? '（润色/校对任务禁止使用 review）'
                : ''),
          });
        } else {
          // 正常的 working 响应 - 使用更明确的指令
          const finishStatus = taskType === 'translation' ? 'review' : 'end';
          history.push({
            role: 'user',
            content:
              `${getCurrentStatusInfo(taskType, currentStatus)}\n\n` +
              `收到。继续${taskLabel}，完成后设为 "${finishStatus}"。` +
              (taskType === 'translation' ? '无需检查缺失段落，系统会自动验证。' : ''),
          });
        }
      }
      continue;
    } else if (currentStatus === 'review') {
      // 更新连续状态计数
      consecutiveReviewCount++;
      consecutivePlanningCount = 0;
      consecutiveWorkingCount = 0;

      // 复核阶段：验证完整性
      if (paragraphIds && paragraphIds.length > 0) {
        const verification = verifyCompleteness
          ? verifyCompleteness(paragraphIds, accumulatedParagraphs)
          : verifyParagraphCompleteness(paragraphIds, accumulatedParagraphs);

        if (!verification.allComplete && verification.missingIds.length > 0) {
          // 缺少段落，要求继续工作
          const missingIdsList = verification.missingIds.slice(0, 10).join(', ');
          const hasMore = verification.missingIds.length > 10;
          history.push({
            role: 'user',
            content:
              `${getCurrentStatusInfo(taskType, currentStatus)}\n\n` +
              `检测到以下段落缺少${taskLabel}：${missingIdsList}` +
              `${hasMore ? ` 等 ${verification.missingIds.length} 个` : ''}。` +
              `请将状态设置为 "working" 并继续完成这些段落的${taskLabel}。`,
          });
          currentStatus = 'working';
          consecutiveReviewCount = 0; // 重置计数，因为状态回到 working
          continue;
        }
      }

      // 检测循环：如果连续处于 review 状态超过阈值，强制要求结束
      if (consecutiveReviewCount >= MAX_CONSECUTIVE_STATUS) {
        console.warn(
          `[${logLabel}] ⚠️ 检测到 review 状态循环（连续 ${consecutiveReviewCount} 次），强制要求结束`,
        );
        history.push({
          role: 'user',
          content:
            `${getCurrentStatusInfo(taskType, currentStatus)}\n\n` +
            `[警告] 你已经在复核阶段停留过久。` +
            `如果你还想更新任何已输出的${taskLabel}结果，请将状态改回 \`{"status":"working"}\` 并提交需要更新的段落；` +
            `如果不需要后续操作，请**立即**返回 \`{"status": "end"}\`。`,
        });
      } else {
        // 所有段落都完整，询问后续操作
        const postOutputPrompt = buildPostOutputPrompt(taskType, taskId);
        history.push({
          role: 'user',
          content: `${getCurrentStatusInfo(taskType, currentStatus)}\n\n${postOutputPrompt}`,
        });
      }
      continue;
    } else if (currentStatus === 'end') {
      // 完成：退出循环
      break;
    }
  }

  // 检查是否达到最大回合数（仅在设置了有限值时才检查）
  if (currentStatus !== 'end' && maxTurns !== Infinity && currentTurnCount >= maxTurns) {
    throw new Error(
      `AI在${maxTurns}回合内未完成${taskLabel}任务（当前状态: ${currentStatus}）。请重试。`,
    );
  }

  // 计算总耗时和平均工具调用时间
  metrics.totalTime = Date.now() - startTime;
  metrics.averageToolCallTime =
    metrics.toolCallCount > 0 ? metrics.toolCallTime / metrics.toolCallCount : 0;

  // 检测规划上下文更新
  const planningContextUpdate = detectPlanningContextUpdate(collectedActions);

  // 输出性能日志
  if (aiProcessingStore && taskId) {
    console.log(`[${logLabel}] 📊 性能指标:`, {
      总耗时: `${metrics.totalTime}ms`,
      规划阶段: `${metrics.planningTime}ms`,
      工作阶段: `${metrics.workingTime}ms`,
      复核阶段: `${metrics.reviewTime}ms`,
      工具调用: `${metrics.toolCallCount} 次，平均 ${metrics.averageToolCallTime.toFixed(2)}ms`,
    });
  }

  return {
    responseText: finalResponseText,
    status: currentStatus,
    paragraphs: accumulatedParagraphs,
    titleTranslation,
    planningSummary,
    planningContextUpdate,
    metrics,
  };
}

/**
 * 检查是否达到最大回合数限制（已废弃，状态检查在 executeToolCallLoop 中处理）
 * 保留此函数以保持向后兼容性
 */
export function checkMaxTurnsReached(
  finalResponseText: string | null,
  maxTurns: number,
  taskType: TaskType,
): asserts finalResponseText is string {
  if (!finalResponseText || finalResponseText.trim().length === 0) {
    throw new Error(
      `AI在工具调用后未返回${TASK_TYPE_LABELS[taskType]}结果（已达到最大回合数 ${maxTurns}）。请重试。`,
    );
  }
}

// ============================================================================
// 以下是新增的共享工具函数（用于减少三个服务的代码重复）
// ============================================================================

/**
 * 创建统一的 AbortController，同时监听多个 signal
 * @param signal 外部传入的取消信号
 * @param taskAbortController 任务的取消控制器
 * @returns 统一的控制器和清理函数
 */
export function createUnifiedAbortController(
  signal?: AbortSignal,
  taskAbortController?: AbortController,
): { controller: AbortController; cleanup: () => void } {
  const internalController = new AbortController();

  const abortHandler = () => {
    internalController.abort();
  };

  // 监听外部 signal
  if (signal) {
    if (signal.aborted) {
      internalController.abort();
    } else {
      signal.addEventListener('abort', abortHandler);
    }
  }

  // 监听任务的 abortController
  if (taskAbortController) {
    if (taskAbortController.signal.aborted) {
      internalController.abort();
    } else {
      taskAbortController.signal.addEventListener('abort', abortHandler);
    }
  }

  // 返回清理函数
  const cleanup = () => {
    if (signal) {
      signal.removeEventListener('abort', abortHandler);
    }
    if (taskAbortController) {
      taskAbortController.signal.removeEventListener('abort', abortHandler);
    }
  };

  return { controller: internalController, cleanup };
}

/**
 * 初始化 AI 任务
 * @param aiProcessingStore AI 处理 Store
 * @param taskType 任务类型
 * @param modelName 模型名称
 * @returns 任务 ID 和取消控制器
 */
export async function initializeTask(
  aiProcessingStore: AIProcessingStore | undefined,
  taskType: TaskType,
  modelName: string,
  context?: {
    bookId?: string;
    chapterId?: string;
    chapterTitle?: string;
  },
): Promise<{ taskId?: string; abortController?: AbortController }> {
  if (!aiProcessingStore) {
    return {};
  }

  const taskId = await aiProcessingStore.addTask({
    type: taskType,
    modelName,
    status: 'thinking',
    message: `正在初始化${TASK_TYPE_LABELS[taskType]}会话...`,
    thinkingMessage: '',
    ...(context?.bookId ? { bookId: context.bookId } : {}),
    ...(context?.chapterId ? { chapterId: context.chapterId } : {}),
    ...(context?.chapterTitle ? { chapterTitle: context.chapterTitle } : {}),
  });

  // 获取任务的 abortController
  const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
  const abortController = task?.abortController;

  // 避免 exactOptionalPropertyTypes 问题：只有当 abortController 存在时才包含它
  if (abortController) {
    return { taskId, abortController };
  }
  return { taskId };
}

/**
 * 构建特殊指令部分（用于系统提示词）
 * @param specialInstructions 特殊指令字符串（如果存在）
 * @returns 格式化的特殊指令部分，如果没有则返回空字符串
 */
export function buildSpecialInstructionsSection(specialInstructions?: string): string {
  return specialInstructions
    ? `\n\n========================================\n【特殊指令（用户自定义）】\n========================================\n${specialInstructions}\n`
    : '';
}

/**
 * 获取特殊指令（书籍级别或章节级别）
 * @param bookId 书籍 ID
 * @param chapterId 章节 ID
 * @param taskType 任务类型
 * @returns 特殊指令字符串（如果存在）
 */
export async function getSpecialInstructions(
  bookId: string | undefined,
  chapterId: string | undefined,
  taskType: TaskType,
): Promise<string | undefined> {
  if (!bookId) {
    return undefined;
  }

  try {
    // 动态导入 store 以避免循环依赖
    await Promise.resolve(); // 保持 async 签名兼容性
    const booksStore = useBooksStore();
    const book = booksStore.getBookById(bookId);

    if (!book) {
      return undefined;
    }

    // 如果提供了章节ID，获取章节数据以获取章节级别的特殊指令
    let chapter;
    if (chapterId) {
      for (const volume of book.volumes || []) {
        const foundChapter = volume.chapters?.find((c) => c.id === chapterId);
        if (foundChapter) {
          chapter = foundChapter;
          break;
        }
      }
    }

    // 根据任务类型获取相应的特殊指令（章节级别覆盖书籍级别）
    // 根据任务类型获取相应的特殊指令（章节级别覆盖书籍级别）
    switch (taskType) {
      case 'translation':
        return chapter?.translationInstructions || book.translationInstructions;
      case 'polish':
        return chapter?.polishInstructions || book.polishInstructions;
      case 'proofreading':
        return chapter?.proofreadingInstructions || book.proofreadingInstructions;
      default:
        return undefined;
    }
  } catch (e) {
    console.warn(
      `[getSpecialInstructions] ⚠️ 获取书籍数据失败（书籍ID: ${bookId}）`,
      e instanceof Error ? e.message : e,
    );
    return undefined;
  }
}

/**
 * 段落格式化函数类型（带 chunk 内索引）
 * @param item 段落对象
 * @param indexInChunk 段落在当前 chunk 内的 0-based 索引
 */
export type ParagraphFormatter<T> = (item: T, indexInChunk: number) => string;

/**
 * 文本块结构
 */
export interface TextChunk {
  text: string;
  paragraphIds: string[];
}

/**
 * 构建文本块
 * 将段落列表按大小分割成多个文本块
 * @param content 段落列表
 * @param chunkSize 每个块的最大字符数
 * @param formatParagraph 段落格式化函数（第二个参数为 chunk 内的 0-based 索引）
 * @param filterParagraph 段落过滤函数（可选，默认过滤空段落）
 * @returns 文本块数组
 */
export function buildChunks<T extends { id: string; text?: string }>(
  content: T[],
  chunkSize: number,
  formatParagraph: ParagraphFormatter<T>,
  filterParagraph?: (item: T) => boolean,
): TextChunk[] {
  const chunks: TextChunk[] = [];

  // 默认过滤空段落
  const shouldInclude = filterParagraph || ((item: T) => !!item.text?.trim());

  let currentChunkText = '';
  let currentChunkParagraphIds: string[] = [];

  for (const paragraph of content) {
    // 应用过滤条件
    if (!shouldInclude(paragraph)) {
      continue;
    }

    // 格式化段落（传入 chunk 内索引）
    const indexInChunk = currentChunkParagraphIds.length;
    const paragraphText = formatParagraph(paragraph, indexInChunk);

    // 如果当前块加上新段落超过限制，且当前块不为空，则先保存当前块
    if (currentChunkText.length + paragraphText.length > chunkSize && currentChunkText.length > 0) {
      chunks.push({
        text: currentChunkText,
        paragraphIds: [...currentChunkParagraphIds],
      });
      currentChunkText = '';
      currentChunkParagraphIds = [];
      // 重新格式化（新 chunk 的索引为 0）
      const newIndexInChunk = 0;
      const newParagraphText = formatParagraph(paragraph, newIndexInChunk);
      currentChunkText += newParagraphText;
    } else {
      currentChunkText += paragraphText;
    }
    currentChunkParagraphIds.push(paragraph.id);
  }

  // 添加最后一个块
  if (currentChunkText.length > 0) {
    chunks.push({
      text: currentChunkText,
      paragraphIds: currentChunkParagraphIds,
    });
  }

  return chunks;
}

/**
 * 检查文本是否只包含符号（不是真正的文本内容）
 * @param text 要检查的文本
 * @returns 如果只包含符号，返回 true
 */
export function isOnlySymbols(text: string): boolean {
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
 * 通用的 chunk 接口（所有 chunk 类型都必须有 text 和 paragraphIds）
 */
export interface BaseChunk {
  text: string;
  paragraphIds?: string[];
}

/**
 * 过滤并处理 chunk，排除已处理的段落
 * @param chunk 当前 chunk
 * @param processedParagraphIds 已处理的段落 ID 集合
 * @param logLabel 日志标签（用于输出日志）
 * @param chunkIndex 当前 chunk 索引
 * @param totalChunks 总 chunk 数
 * @returns 如果所有段落都已处理，返回 null；否则返回过滤后的未处理段落 ID 列表
 */
export function filterProcessedParagraphs(
  chunk: BaseChunk,
  processedParagraphIds: Set<string>,
  logLabel: string,
  chunkIndex: number,
  totalChunks: number,
): string[] | null {
  const unprocessedParagraphIds = (chunk.paragraphIds || []).filter(
    (id) => !processedParagraphIds.has(id),
  );

  if (unprocessedParagraphIds.length === 0) {
    console.log(`[${logLabel}] ⚠️ 块 ${chunkIndex + 1}/${totalChunks} 的所有段落都已被处理，跳过`);
    return null;
  }

  return unprocessedParagraphIds;
}

/**
 * 标记已处理的段落
 * @param paragraphs 段落翻译数组
 * @param processedParagraphIds 已处理的段落 ID 集合
 */
export function markProcessedParagraphs(
  paragraphs: { id: string; translation: string }[],
  processedParagraphIds: Set<string>,
): void {
  for (const para of paragraphs) {
    if (para.id) {
      processedParagraphIds.add(para.id);
    }
  }
}

/**
 * 从段落翻译 Map 中标记已处理的段落
 * @param paragraphMap 段落翻译 Map
 * @param processedParagraphIds 已处理的段落 ID 集合
 */
export function markProcessedParagraphsFromMap(
  paragraphMap: Map<string, string>,
  processedParagraphIds: Set<string>,
): void {
  for (const [paraId] of paragraphMap) {
    processedParagraphIds.add(paraId);
  }
}

/**
 * 处理任务错误
 * @param error 错误对象
 * @param taskId 任务 ID
 * @param aiProcessingStore AI 处理 Store
 * @param taskType 任务类型
 */
export async function handleTaskError(
  error: unknown,
  taskId: string | undefined,
  aiProcessingStore: AIProcessingStore | undefined,
  taskType: TaskType,
): Promise<void> {
  if (!aiProcessingStore || !taskId) {
    return;
  }

  // 检查是否是取消错误
  const isCancelled =
    error instanceof Error && (error.message === '请求已取消' || error.message.includes('aborted'));

  if (isCancelled) {
    await aiProcessingStore.updateTask(taskId, {
      status: 'cancelled',
      message: '已取消',
    });
  } else {
    await aiProcessingStore.updateTask(taskId, {
      status: 'error',
      message: error instanceof Error ? error.message : `${TASK_TYPE_LABELS[taskType]}出错`,
    });
  }
}

/**
 * 完成任务
 * @param taskId 任务 ID
 * @param aiProcessingStore AI 处理 Store
 * @param taskType 任务类型
 */
export async function completeTask(
  taskId: string | undefined,
  aiProcessingStore: AIProcessingStore | undefined,
  taskType: TaskType,
): Promise<void> {
  if (!aiProcessingStore || !taskId) {
    return;
  }

  await aiProcessingStore.updateTask(taskId, {
    status: 'end',
    message: `${TASK_TYPE_LABELS[taskType]}完成`,
  });
}
