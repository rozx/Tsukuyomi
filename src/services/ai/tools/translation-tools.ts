import type { ToolDefinition, ToolContext } from './types';
import type { AIProcessingStore } from 'src/services/ai/tasks/utils/task-types';
import { BookService } from 'src/services/book-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { ChapterService } from 'src/services/chapter-service';
import type { Paragraph } from 'src/models/novel';
import { MAX_TRANSLATION_BATCH_SIZE } from 'src/services/ai/constants';
import { isEmptyParagraph, isSymbolOnly } from 'src/utils/text-utils';
import { TodoListService } from 'src/services/todo-list-service';

// ============ Types ============

interface TranslationBatchItem {
  /** 段落 ID（唯一提交标识） */
  paragraph_id: string;
  /** 原文前缀锚点（用于防止 paragraph_id 错位） */
  original_text_prefix: string;
  translated_text: string;
}

interface AddTranslationBatchArgs {
  paragraphs: TranslationBatchItem[];
}

type BatchErrorCode =
  | 'EMPTY_PARAGRAPH_LIST'
  | 'BATCH_SIZE_EXCEEDED'
  | 'EMPTY_PARAGRAPH_ITEM'
  | 'MISSING_PARAGRAPH_ID'
  | 'INVALID_PARAGRAPH_ID'
  | 'LEGACY_INDEX_REJECTED'
  | 'MISSING_TRANSLATION'
  | 'DUPLICATE_PARAGRAPHS'
  | 'OUT_OF_RANGE_PARAGRAPHS'
  | 'MISSING_ORIGINAL_TEXT_PREFIX'
  | 'ORIGINAL_TEXT_PREFIX_TOO_SHORT'
  | 'ORIGINAL_TEXT_PREFIX_TOO_LONG'
  | 'ORIGINAL_TEXT_PREFIX_MISMATCH'
  | 'ALL_PARAGRAPHS_FAILED'
  | 'PARAM_VALIDATION_FAILED';

/** 批次整体结果码（非错误，用于表示处理结果状态） */
type BatchResultCode = 'PARTIAL_SUCCESS';

interface InvalidBatchItem {
  index: number;
  reason: BatchErrorCode;
  paragraph_id?: string;
}

interface FailedParagraphItem {
  paragraph_id: string;
  error_code: BatchErrorCode;
  error: string;
}

// ============ Constants ============

const MAX_BATCH_SIZE = MAX_TRANSLATION_BATCH_SIZE;
const BATCH_SIZE_TOLERANCE_RATIO = 0.1;
const MAX_BATCH_SIZE_WITH_TOLERANCE = Math.ceil(MAX_BATCH_SIZE * (1 + BATCH_SIZE_TOLERANCE_RATIO));
const MAX_BATCH_SIZE_DOUBLE = MAX_BATCH_SIZE * 2;
const MIN_ORIGINAL_TEXT_PREFIX_LENGTH = 3;
const MAX_ORIGINAL_TEXT_PREFIX_LENGTH = 20;

type PrefixLengthResult =
  | { valid: true }
  | {
      valid: false;
      errorCode: 'ORIGINAL_TEXT_PREFIX_TOO_SHORT' | 'ORIGINAL_TEXT_PREFIX_TOO_LONG';
      limit: number;
    };

/**
 * 校验前缀长度是否在合法范围内（不含 startsWith 匹配和纯符号跳过逻辑）。
 *
 * - 最小长度：min(MIN_ORIGINAL_TEXT_PREFIX_LENGTH, originalText.length)
 * - 最大长度：min(MAX_ORIGINAL_TEXT_PREFIX_LENGTH, originalText.length)
 *   即固定上限 20 与原文长度取较小值，与 tool description 一致。
 */
function validatePrefixLength(prefix: string, originalText: string): PrefixLengthResult {
  const effectiveMinLength = Math.min(MIN_ORIGINAL_TEXT_PREFIX_LENGTH, originalText.length);

  if (prefix.length < effectiveMinLength) {
    return { valid: false, errorCode: 'ORIGINAL_TEXT_PREFIX_TOO_SHORT', limit: effectiveMinLength };
  }

  const maxPrefixLength = Math.min(MAX_ORIGINAL_TEXT_PREFIX_LENGTH, originalText.length);

  if (prefix.length > maxPrefixLength) {
    return { valid: false, errorCode: 'ORIGINAL_TEXT_PREFIX_TOO_LONG', limit: maxPrefixLength };
  }

  return { valid: true };
}

/**
 * 引号对匹配规则：
 * - 「」 原文 → 译文可用 「」 或 \u201c\u201d（智能双引号）或 \u2018\u2019（智能单引号）
 * - 『』 原文 → 译文可用 『』 或 \u201c\u201d（智能双引号）或 \u2018\u2019（智能单引号）
 * 注意：不接受 ASCII 直引号 ' 和 "，因为它们在英文文本中过于常见，容易导致误判
 */
const QUOTE_PAIR_RULES: Array<{
  originalOpen: string;
  originalClose: string;
  acceptedOpens: string[];
  acceptedCloses: string[];
}> = [
  {
    originalOpen: '「',
    originalClose: '」',
    acceptedOpens: ['「', '\u201c', '\u2018'],
    acceptedCloses: ['」', '\u201d', '\u2019'],
  },
  {
    originalOpen: '『',
    originalClose: '』',
    acceptedOpens: ['『', '\u201c', '\u2018'],
    acceptedCloses: ['』', '\u201d', '\u2019'],
  },
  {
    originalOpen: '“',
    originalClose: '”',
    acceptedOpens: ['“', '"'],
    acceptedCloses: ['”', '"'],
  },
];

// 错误消息常量
const ERROR_MESSAGES = {
  //段落标识相关
  MISSING_PARAGRAPH_ID: '必须提供 paragraph_id（不支持 index）',
  INVALID_PARAGRAPH_ID: 'paragraph_id 必须是非空字符串',
  LEGACY_INDEX_REJECTED:
    '检测到使用已废弃的 index 字段提交。请使用 paragraph_id 标识段落（从 chunk 中 [ID: xxx] 获取）',
  // 批次验证相关
  EMPTY_PARAGRAPH_LIST: '段落列表不能为空',
  BATCH_SIZE_EXCEEDED: (current: number, max: number) =>
    `单次批次最多支持 ${max} 个段落，当前批次包含 ${current} 个段落`,
  BATCH_SIZE_TOLERANCE_WARNING: (current: number, max: number, allowedMax: number) =>
    `本次批次包含 ${current} 个段落，已超过限制 ${max} 个，但在容差范围内（最多 ${allowedMax} 个）。请尽量控制在限制内。`,
  BATCH_SIZE_DOUBLE_WARNING: (
    current: number,
    max: number,
    allowedMax: number,
    remainingCount: number,
  ) =>
    `本次批次包含 ${current} 个段落，已超过常规限制 ${max} 个。由于当前 chunk 剩余 ${remainingCount} 个未提交段落（≤ ${allowedMax}），允许最多提交 ${allowedMax} 个段落。`,
  EMPTY_PARAGRAPH_ITEM: (index: number) => `批次中第 ${index + 1} 个段落项为空`,
  INVALID_PARAGRAPH: (index: number, error: string) => `批次中第 ${index + 1} 个段落: ${error}`,
  MISSING_TRANSLATION: (index: number) =>
    `批次中第 ${index + 1} 个段落缺少翻译文本 (translated_text)`,
  MISSING_ORIGINAL_TEXT_PREFIX: (paragraphId: string) =>
    `段落 ${paragraphId} 缺少 original_text_prefix（用于防错位校验）`,
  ORIGINAL_TEXT_PREFIX_TOO_SHORT: (paragraphId: string, minLength: number) =>
    `段落 ${paragraphId} 的 original_text_prefix 长度不足（最少 ${minLength} 个字符）`,
  ORIGINAL_TEXT_PREFIX_TOO_LONG: (paragraphId: string, maxLength: number) =>
    `段落 ${paragraphId} 的 original_text_prefix 过长（最多 ${maxLength} 个字符）`,
  ORIGINAL_TEXT_PREFIX_MISMATCH: (paragraphId: string, prefix: string) =>
    `段落 ${paragraphId} 的原文前缀不匹配："${prefix}"`,
  DUPLICATE_PARAGRAPHS: (ids: string[]) => `批次中存在重复的段落 ID: ${ids.join(', ')}`,
  OUT_OF_RANGE_PARAGRAPHS: (ids: string[], count: number) =>
    `以下段落不在当前任务范围内: ${ids.slice(0, 5).join(', ')}${count > 5 ? ` 等 ${count} 个段落` : ''}`,
  // 翻译内容验证相关
  MISSING_QUOTE_SYMBOLS: (paragraphId: string, missingTypes: string[]) =>
    `段落 ${paragraphId} 的译文缺少原文引号符号: ${missingTypes.join(' ')}`,
  TRANSLATION_SAME_AS_SELECTED: (paragraphId: string) =>
    `段落 ${paragraphId} 的译文与当前选中版本相同，请不要提交相同内容。`,
  TRANSLATION_DUPLICATE: (count: number) =>
    `${count} 个段落译文与历史版本相同（已自动复用历史翻译）。`,
  TRANSLATION_LENGTH_SHORT: (paragraphId: string, percentage: number) =>
    `段落 ${paragraphId} 的译文长度仅为原文的 ${percentage}%，可能过短。`,
  TRANSLATION_LENGTH_LONG: (paragraphId: string, percentage: number) =>
    `段落 ${paragraphId} 的译文长度为原文的 ${percentage}%，可能过长。`,
  // 任务状态相关
  AI_STORE_NOT_INITIALIZED: 'AI 处理 Store 未初始化',
  TASK_ID_MISSING: '未提供任务 ID',
  TASK_NOT_FOUND: (taskId: string) => `任务不存在: ${taskId}`,
  TASK_STATUS_INVALID: (currentStatus: string | undefined) =>
    `只能在 'working' 状态下调用此工具，当前状态为: ${currentStatus || '未设置'}`,
  TASK_TYPE_MISSING: (taskId: string) => `无法确定任务类型，请检查任务信息。taskId=${taskId}`,
  TASK_TYPE_UNSUPPORTED: (taskType: string) => `任务类型不支持批量提交: ${taskType}`,
  // 书籍/章节数据相关
  BOOK_NOT_FOUND: (bookId: string) => `书籍不存在: ${bookId}`,
  BOOK_NO_VOLUMES: '书籍缺少章节数据',
  CHAPTER_NOT_FOUND: (chapterId: string) => `章节不存在: ${chapterId}`,
  PARAGRAPH_NOT_FOUND: (ids: string[]) => `未找到以下段落: ${ids.join(', ')}`,
  EMPTY_PARAGRAPH_CANNOT_TRANSLATE: (ids: string[]) => `无法翻译空段落: ${ids.join(', ')}`,
  //上下文相关
  BOOK_ID_MISSING: '未提供书籍 ID',
  AI_MODEL_ID_MISSING: '未提供 AI 模型 ID，无法写入翻译来源',
  CHAPTER_ID_MISSING: '任务缺少 chapterId，将触发惰性章节扫描，可能影响性能',
  PARAM_VALIDATION_FAILED: '参数验证失败',
  PARTIAL_SUCCESS_SUMMARY: (acceptedCount: number, failedCount: number) =>
    `部分成功：已处理 ${acceptedCount} 个段落，${failedCount} 个段落校验失败，请仅修复失败段落后重试。`,
  ALL_PARAGRAPHS_FAILED:
    '本次批次所有段落均验证失败，未保存任何结果。请根据 failed_paragraphs 逐条修复后重试。',
  // 处理错误
  BATCH_PROCESS_ERROR: (errorMsg: string) => `处理批次时出错: ${errorMsg}`,
} as const;

/**
 * 验证段落标识符（仅支持 paragraph_id）
 */
function resolveParagraphId(item: TranslationBatchItem): { id: string | null; error?: string } {
  if (!item.paragraph_id || typeof item.paragraph_id !== 'string') {
    // 检查是否存在旧的 index 字段（BREAKING：明确拒绝）
    if ('index' in item && typeof (item as Record<string, unknown>).index === 'number') {
      return { id: null, error: ERROR_MESSAGES.LEGACY_INDEX_REJECTED };
    }
    return { id: null, error: ERROR_MESSAGES.MISSING_PARAGRAPH_ID };
  }
  if (item.paragraph_id.trim().length === 0) {
    return { id: null, error: ERROR_MESSAGES.INVALID_PARAGRAPH_ID };
  }
  return { id: item.paragraph_id };
}

function mapParagraphIdErrorToCode(error: string): BatchErrorCode {
  if (error === ERROR_MESSAGES.LEGACY_INDEX_REJECTED) {
    return 'LEGACY_INDEX_REJECTED';
  }
  if (error === ERROR_MESSAGES.INVALID_PARAGRAPH_ID) {
    return 'INVALID_PARAGRAPH_ID';
  }
  return 'MISSING_PARAGRAPH_ID';
}

function buildErrorResponse(
  error: string,
  options?: {
    errorCode?: string | undefined;
    invalidItems?: InvalidBatchItem[] | undefined;
    invalidParagraphIds?: string[] | undefined;
    warning?: string | undefined;
    note?: string | undefined;
    errors?: string[] | undefined;
    warnings?: string[] | undefined;
    failedParagraphs?: FailedParagraphItem[] | undefined;
  },
): string {
  const payload: Record<string, unknown> = {
    success: false,
    error,
  };

  if (options?.errorCode) {
    payload.error_code = options.errorCode;
  }
  if (options?.invalidItems && options.invalidItems.length > 0) {
    payload.invalid_items = options.invalidItems;
  }
  if (options?.invalidParagraphIds && options.invalidParagraphIds.length > 0) {
    payload.invalid_paragraph_ids = options.invalidParagraphIds;
  }
  if (options?.warning) {
    payload.warning = options.warning;
  }
  if (options?.note) {
    payload.note = options.note;
  }
  if (options?.errors && options.errors.length > 0) {
    payload.errors = options.errors;
  }
  if (options?.warnings && options.warnings.length > 0) {
    payload.warnings = options.warnings;
  }
  if (options?.failedParagraphs && options.failedParagraphs.length > 0) {
    payload.failed_paragraphs = options.failedParagraphs;
  }

  return JSON.stringify(payload);
}

// ============ Status Validation ============

/**
 * 验证任务当前状态是否为 'working'
 */
function validateTaskStatus(
  aiProcessingStore: AIProcessingStore | undefined,
  taskId: string | undefined,
): { valid: boolean; error?: string; currentStatus?: string | undefined } {
  if (!aiProcessingStore) {
    return { valid: false, error: ERROR_MESSAGES.AI_STORE_NOT_INITIALIZED };
  }

  if (!taskId) {
    return { valid: false, error: ERROR_MESSAGES.TASK_ID_MISSING };
  }

  const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
  if (!task) {
    return { valid: false, error: ERROR_MESSAGES.TASK_NOT_FOUND(taskId) };
  }

  const currentStatus = task.workflowStatus;
  if (currentStatus !== 'working') {
    return {
      valid: false,
      error: ERROR_MESSAGES.TASK_STATUS_INVALID(currentStatus),
      currentStatus,
    };
  }

  return { valid: true, currentStatus };
}

// ============ Translation Batch Functions ============

/**
 * 计算允许的批次大小上限
 *
 * 规则：
 * - 默认上限：MAX_BATCH_SIZE，允许 10% 容差（MAX_BATCH_SIZE_WITH_TOLERANCE）
 * - 特例：当 chunk 剩余未提交段落数 <= 2x MAX_BATCH_SIZE 时，上限提升至 2x MAX_BATCH_SIZE
 *
 * @returns hardMax - 绝对上限，超过则拒绝
 * @returns allowDoubleBatchSize - 是否处于"双倍批次大小"模式
 * @returns remainingCount - 当前 chunk 剩余未提交段落数
 */
export function calculateAllowedBatchSize(
  chunkTotal?: number,
  submittedCount?: number,
): {
  hardMax: number;
  allowDoubleBatchSize: boolean;
  remainingCount: number;
} {
  const submitted = submittedCount ?? 0;
  const remainingCount =
    typeof chunkTotal === 'number' && chunkTotal > 0 ? chunkTotal - submitted : 0;

  const allowDoubleBatchSize = remainingCount > 0 && remainingCount <= MAX_BATCH_SIZE_DOUBLE;

  const hardMax = allowDoubleBatchSize ? MAX_BATCH_SIZE_DOUBLE : MAX_BATCH_SIZE_WITH_TOLERANCE;

  return { hardMax, allowDoubleBatchSize, remainingCount };
}

/**
 * 验证批次参数
 */
function validateBatchArgs(
  args: AddTranslationBatchArgs,
  chunkParagraphIds?: string[],
  submittedParagraphIds?: Set<string>,
): {
  valid: boolean;
  error?: string;
  errorCode?: BatchErrorCode;
  invalidItems?: InvalidBatchItem[];
  resolvedIds?: string[];
  warning?: string;
} {
  const { paragraphs } = args;

  // 检查空批次
  if (!paragraphs || !Array.isArray(paragraphs) || paragraphs.length === 0) {
    return {
      valid: false,
      error: ERROR_MESSAGES.EMPTY_PARAGRAPH_LIST,
      errorCode: 'EMPTY_PARAGRAPH_LIST',
    };
  }

  // 计算批次大小限制
  const { hardMax, allowDoubleBatchSize, remainingCount } = calculateAllowedBatchSize(
    chunkParagraphIds?.length,
    submittedParagraphIds?.size,
  );

  let warning: string | undefined;

  if (paragraphs.length > MAX_BATCH_SIZE) {
    if (paragraphs.length > hardMax) {
      return {
        valid: false,
        error: ERROR_MESSAGES.BATCH_SIZE_EXCEEDED(paragraphs.length, hardMax),
        errorCode: 'BATCH_SIZE_EXCEEDED',
      };
    }

    if (allowDoubleBatchSize) {
      warning = ERROR_MESSAGES.BATCH_SIZE_DOUBLE_WARNING(
        paragraphs.length,
        MAX_BATCH_SIZE,
        MAX_BATCH_SIZE_DOUBLE,
        remainingCount,
      );
    } else {
      warning = ERROR_MESSAGES.BATCH_SIZE_TOLERANCE_WARNING(
        paragraphs.length,
        MAX_BATCH_SIZE,
        MAX_BATCH_SIZE_WITH_TOLERANCE,
      );
    }
  }

  const resolvedIds: string[] = [];

  // 检查每个段落项
  for (let i = 0; i < paragraphs.length; i++) {
    const item = paragraphs[i];
    if (!item) {
      return {
        valid: false,
        error: ERROR_MESSAGES.EMPTY_PARAGRAPH_ITEM(i),
        errorCode: 'EMPTY_PARAGRAPH_ITEM',
        invalidItems: [{ index: i, reason: 'EMPTY_PARAGRAPH_ITEM' }],
      };
    }

    // 解析段落标识符（仅支持 paragraph_id）
    const { id, error } = resolveParagraphId(item);
    if (error || !id) {
      const reason = mapParagraphIdErrorToCode(error || ERROR_MESSAGES.MISSING_PARAGRAPH_ID);
      return {
        valid: false,
        error: ERROR_MESSAGES.INVALID_PARAGRAPH(i, error || '无效的段落标识'),
        errorCode: reason,
        invalidItems: [
          {
            index: i,
            reason,
            ...(typeof item.paragraph_id === 'string' ? { paragraph_id: item.paragraph_id } : {}),
          },
        ],
      };
    }

    resolvedIds.push(id);

    if (!item.translated_text || typeof item.translated_text !== 'string') {
      return {
        valid: false,
        error: ERROR_MESSAGES.MISSING_TRANSLATION(i),
        errorCode: 'MISSING_TRANSLATION',
        invalidItems: [{ index: i, reason: 'MISSING_TRANSLATION', paragraph_id: id }],
      };
    }
  }

  return { valid: true, resolvedIds, ...(warning ? { warning } : {}) };
}

/**
 * 检测重复的段落 ID
 */
function detectDuplicateParagraphIds(paragraphIds: string[]): {
  hasDuplicates: boolean;
  duplicates: string[];
} {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const id of paragraphIds) {
    if (seen.has(id)) {
      if (!duplicates.includes(id)) {
        duplicates.push(id);
      }
    } else {
      seen.add(id);
    }
  }

  return {
    hasDuplicates: duplicates.length > 0,
    duplicates,
  };
}

/**
 * 验证段落是否在允许的范围内
 */
function validateParagraphsInRange(
  paragraphIds: string[],
  allowedParagraphIds: Set<string> | undefined,
): { valid: boolean; error?: string; errorCode?: BatchErrorCode; invalidIds?: string[] } {
  if (!allowedParagraphIds || allowedParagraphIds.size === 0) {
    // 如果没有提供边界限制，允许所有段落
    return { valid: true };
  }

  const invalidIds = paragraphIds.filter((id) => !allowedParagraphIds.has(id));
  if (invalidIds.length > 0) {
    return {
      valid: false,
      error: ERROR_MESSAGES.OUT_OF_RANGE_PARAGRAPHS(invalidIds, invalidIds.length),
      errorCode: 'OUT_OF_RANGE_PARAGRAPHS',
      invalidIds,
    };
  }

  return { valid: true };
}

/**
 * 统计文本中指定符号出现次数
 */
function countSymbol(text: string, symbol: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(symbol, pos)) !== -1) {
    count++;
    pos += symbol.length;
  }
  return count;
}

/**
 * 统计文本中多个符号出现次数之和
 */
function countSymbols(text: string, symbols: string[]): number {
  let count = 0;
  for (const symbol of symbols) {
    count += countSymbol(text, symbol);
  }
  return count;
}

/**
 * 检查译文是否遗漏原文中的引号。
 *
 * 按引号对规则逐一检测：
 * - 原文引号平衡时：按成对数量严格校验
 * - 原文引号不平衡时：降级为最小可用校验，避免因原文脏数据导致无法提交
 */
function detectMissingQuoteSymbols(originalText: string, translatedText: string): string[] {
  const missingTypes: string[] = [];

  for (const rule of QUOTE_PAIR_RULES) {
    const originalOpenCount = countSymbol(originalText, rule.originalOpen);
    const originalCloseCount = countSymbol(originalText, rule.originalClose);

    if (originalOpenCount === 0 && originalCloseCount === 0) continue;

    let requiredOpenCount = 0;
    let requiredCloseCount = 0;

    // 原文引号计数可能不平衡（例如 OCR/抓取噪声或原文标点错误）
    // 平衡时保持严格；不平衡时仅要求最小可用数量，避免“无论怎么译都过不了”
    if (originalOpenCount > 0 && originalCloseCount > 0) {
      const requiredPairCount = Math.min(originalOpenCount, originalCloseCount);
      requiredOpenCount = requiredPairCount;
      requiredCloseCount = requiredPairCount;
    } else {
      requiredOpenCount = originalOpenCount > 0 ? 1 : 0;
      requiredCloseCount = originalCloseCount > 0 ? 1 : 0;
    }

    if (requiredOpenCount > 0) {
      const translatedOpenCount = countSymbols(translatedText, rule.acceptedOpens);
      if (translatedOpenCount < requiredOpenCount) {
        missingTypes.push(`开引号 ${rule.originalOpen}（可用: ${rule.acceptedOpens.join(' ')}）`);
      }
    }

    if (requiredCloseCount > 0) {
      const translatedCloseCount = countSymbols(translatedText, rule.acceptedCloses);
      if (translatedCloseCount < requiredCloseCount) {
        missingTypes.push(`闭引号 ${rule.originalClose}（可用: ${rule.acceptedCloses.join(' ')}）`);
      }
    }
  }

  return missingTypes;
}

/**
 * 处理批次（保存翻译）
 *
 * @param chapterId - 可选的章节 ID。提供时仅加载和搜索该章节（性能优化），
 *                    未提供时回退到遍历所有章节的行为。
 */
async function processTranslationBatch(
  bookId: string,
  items: Array<{ paragraphId: string; originalTextPrefix: string; translatedText: string }>,
  aiModelId: string,
  taskType: 'translation' | 'polish' | 'proofreading',
  chapterId?: string,
): Promise<{
  success: boolean;
  error?: string;
  errors?: string[];
  warnings?: string[];
  processedCount: number;
  /** 实际通过验证的段落列表（包含历史重复段落，它们也被视为已处理以推进进度） */
  acceptedItems?: Array<{ paragraphId: string; translatedText: string }>;
  failedItems?: FailedParagraphItem[];
}> {
  try {
    const book = await BookService.getBookById(bookId);
    if (!book) {
      return { success: false, error: ERROR_MESSAGES.BOOK_NOT_FOUND(bookId), processedCount: 0 };
    }

    if (!book.volumes) {
      return { success: false, error: ERROR_MESSAGES.BOOK_NO_VOLUMES, processedCount: 0 };
    }

    // 收集目标段落：优先使用 chapterId 限定范围（避免加载所有章节）
    const targetParagraphs: Paragraph[] = [];

    if (chapterId) {
      // 优化路径：仅加载和搜索指定章节
      const found = ChapterService.findChapterById(book, chapterId);
      if (!found) {
        return {
          success: false,
          error: ERROR_MESSAGES.CHAPTER_NOT_FOUND(chapterId),
          processedCount: 0,
        };
      }
      const chapter = found.chapter;

      // 按需加载章节内容
      if (chapter.content === undefined) {
        const content = await ChapterContentService.loadChapterContent(chapterId);
        chapter.content = content || [];
        chapter.contentLoaded = true;
      }

      // 从该章节收集目标段落
      if (chapter.content) {
        const itemIdSet = new Set(items.map((item) => item.paragraphId));
        for (const p of chapter.content) {
          if (itemIdSet.has(p.id)) {
            targetParagraphs.push(p);
          }
        }
      }
    } else {
      // 回退路径：逐个加载章节直到找到所有目标段落（惰性加载优化）
      const totalChapterCount = book.volumes.reduce(
        (count, volume) => count + (volume.chapters?.length || 0),
        0,
      );
      console.warn(
        '[translation-tools] ⚠️ 未提供 chapterId，触发惰性章节扫描。建议确保任务对象包含 chapterId 以提升性能',
        {
          bookId,
          taskType,
          batchSize: items.length,
          totalChapterCount,
        },
      );

      const itemIdSet = new Set(items.map((item) => item.paragraphId));
      const foundIds = new Set<string>();

      for (const volume of book.volumes) {
        if (foundIds.size === itemIdSet.size) break;

        for (const chapter of volume.chapters || []) {
          if (!chapter || foundIds.size === itemIdSet.size) continue;

          // 按需加载章节内容
          if (chapter.content === undefined) {
            const content = await ChapterContentService.loadChapterContent(chapter.id);
            chapter.content = content || [];
            chapter.contentLoaded = true;
          }

          // 从该章节收集目标段落
          if (chapter.content) {
            for (const p of chapter.content) {
              if (itemIdSet.has(p.id)) {
                targetParagraphs.push(p);
                foundIds.add(p.id);
              }
            }
          }
        }
      }
    }

    // 过滤掉空白段落
    const validTargetParagraphs = targetParagraphs.filter((p) => !isEmptyParagraph(p.text));

    const targetParagraphsMap = new Map(validTargetParagraphs.map((p) => [p.id, p]));
    const missingParagraphIds = items
      .filter((item) => !targetParagraphsMap.has(item.paragraphId))
      .map((item) => item.paragraphId);
    if (missingParagraphIds.length > 0) {
      // 检查缺失的段落是否是因为空白而被过滤
      const missingIdSet = new Set(missingParagraphIds);
      const blankParagraphIds = targetParagraphs
        .filter((p) => missingIdSet.has(p.id) && isEmptyParagraph(p.text))
        .map((p) => p.id);

      if (blankParagraphIds.length > 0) {
        return {
          success: false,
          error: ERROR_MESSAGES.EMPTY_PARAGRAPH_CANNOT_TRANSLATE(blankParagraphIds),
          processedCount: 0,
        };
      }

      return {
        success: false,
        error: ERROR_MESSAGES.PARAGRAPH_NOT_FOUND(missingParagraphIds),
        processedCount: 0,
      };
    }

    // 处理每个段落
    // 无论任务类型如何，都创建新的翻译版本以保留历史记录
    // 这样可以防止 AI 产生糟糕结果时丢失用户之前的手动翻译

    // 验证所有段落并收集接受的段落 ID（合并为单次遍历，确保验证逻辑与接受逻辑一致）
    // 不修改任何数据，防止部分段落验证失败时已提交的段落被污染
    // 收集所有验证错误和警告，一次性返回，方便 AI 批量修复
    // 注意：实际的翻译写入由调用方的 onParagraphsExtracted 回调统一完成，
    // 工具层只负责验证，不直接修改段落数据，避免双重写入
    const validationWarnings: string[] = [];
    let duplicateCount = 0;
    const acceptedItems: Array<{ paragraphId: string; translatedText: string }> = [];
    const failedItems: FailedParagraphItem[] = [];

    const pushFailedItem = (
      paragraphId: string,
      errorCode: BatchErrorCode,
      error: string,
    ): void => {
      failedItems.push({
        paragraph_id: paragraphId,
        error_code: errorCode,
        error,
      });
    };

    for (const item of items) {
      const paragraph = targetParagraphsMap.get(item.paragraphId);
      if (!paragraph) {
        continue;
      }

      const trimmedPrefix = item.originalTextPrefix.trim();
      const trimmedOriginalText = paragraph.text.trim();

      if (!trimmedPrefix) {
        pushFailedItem(
          item.paragraphId,
          'MISSING_ORIGINAL_TEXT_PREFIX',
          ERROR_MESSAGES.MISSING_ORIGINAL_TEXT_PREFIX(item.paragraphId),
        );
        continue;
      }

      // 纯符号/装饰性段落（如 ◇◇◇、全角括号+空格、破折号线、星号等）跳过前缀长度校验，
      // 仅保留 startsWith 匹配校验。这类段落的前缀长度难以满足常规限制。
      const symbolOnly = isSymbolOnly(trimmedOriginalText);

      if (!symbolOnly) {
        const prefixCheck = validatePrefixLength(trimmedPrefix, trimmedOriginalText);
        if (!prefixCheck.valid) {
          if (prefixCheck.errorCode === 'ORIGINAL_TEXT_PREFIX_TOO_SHORT') {
            pushFailedItem(
              item.paragraphId,
              'ORIGINAL_TEXT_PREFIX_TOO_SHORT',
              ERROR_MESSAGES.ORIGINAL_TEXT_PREFIX_TOO_SHORT(item.paragraphId, prefixCheck.limit),
            );
            continue;
          } else if (prefixCheck.errorCode === 'ORIGINAL_TEXT_PREFIX_TOO_LONG') {
            // TOO_LONG 改为仅警告，不阻止提交。
            validationWarnings.push(
              ERROR_MESSAGES.ORIGINAL_TEXT_PREFIX_TOO_LONG(item.paragraphId, prefixCheck.limit),
            );
          }
        }
      }

      if (!trimmedOriginalText.startsWith(trimmedPrefix)) {
        pushFailedItem(
          item.paragraphId,
          'ORIGINAL_TEXT_PREFIX_MISMATCH',
          ERROR_MESSAGES.ORIGINAL_TEXT_PREFIX_MISMATCH(item.paragraphId, trimmedPrefix),
        );
        continue;
      }

      // 允许译文与原文相同：不再在工具层阻止该提交。
      // 若命中“当前选中版本重复”规则，仍会在后续校验中被拒绝。

      // 检查提交的翻译是否与任何已有翻译版本完全相同
      if (paragraph.translations && paragraph.translations.length > 0) {
        const selectedTranslation = paragraph.translations.find(
          (t) => t.id === paragraph.selectedTranslationId,
        );

        // 如果与当前选中版本相同，阻止提交（不加入 acceptedIds）
        if (selectedTranslation && selectedTranslation.translation === item.translatedText) {
          pushFailedItem(
            item.paragraphId,
            'PARAM_VALIDATION_FAILED',
            ERROR_MESSAGES.TRANSLATION_SAME_AS_SELECTED(item.paragraphId),
          );
          continue;
        }

        // 检查是否与历史版本相同（非当前选中）
        // 倒序遍历：重复更可能出现在最近的翻译中，倒序可以更快命中
        let foundInHistory = false;
        for (let i = paragraph.translations.length - 1; i >= 0; i--) {
          const candidate = paragraph.translations[i];
          if (candidate && candidate.translation === item.translatedText) {
            duplicateCount++;
            foundInHistory = true;
            break;
          }
        }
        if (foundInHistory) {
          // 历史重复段落仍视为已处理以推进进度，但不会创建新翻译版本
          acceptedItems.push({
            paragraphId: item.paragraphId,
            translatedText: item.translatedText,
          });
          continue;
        }
      }

      // 检查翻译长度异常（仅警告，不阻止提交）
      if (paragraph.text.length > 0) {
        const lengthRatio = item.translatedText.length / paragraph.text.length;
        if (lengthRatio < 0.3) {
          validationWarnings.push(
            ERROR_MESSAGES.TRANSLATION_LENGTH_SHORT(
              item.paragraphId,
              Math.round(lengthRatio * 100),
            ),
          );
        } else if (lengthRatio > 3) {
          validationWarnings.push(
            ERROR_MESSAGES.TRANSLATION_LENGTH_LONG(item.paragraphId, Math.round(lengthRatio * 100)),
          );
        }
      }

      const missingQuoteSymbols = detectMissingQuoteSymbols(paragraph.text, item.translatedText);
      if (missingQuoteSymbols.length > 0) {
        pushFailedItem(
          item.paragraphId,
          'PARAM_VALIDATION_FAILED',
          ERROR_MESSAGES.MISSING_QUOTE_SYMBOLS(item.paragraphId, missingQuoteSymbols),
        );
        continue;
      }

      // 通过所有验证，加入接受列表
      acceptedItems.push({
        paragraphId: item.paragraphId,
        translatedText: item.translatedText,
      });
    }

    if (duplicateCount > 0) {
      validationWarnings.push(ERROR_MESSAGES.TRANSLATION_DUPLICATE(duplicateCount));
    }

    if (failedItems.length > 0 && acceptedItems.length === 0) {
      const failureErrors = failedItems.map((item) => item.error);
      return {
        success: false,
        error: ERROR_MESSAGES.ALL_PARAGRAPHS_FAILED,
        errors: failureErrors,
        failedItems,
        ...(validationWarnings.length > 0 ? { warnings: validationWarnings } : {}),
        processedCount: 0,
      };
    }

    if (failedItems.length > 0) {
      return {
        success: true,
        processedCount: acceptedItems.length,
        acceptedItems,
        failedItems,
        ...(validationWarnings.length > 0 ? { warnings: validationWarnings } : {}),
      };
    }

    return {
      success: true,
      processedCount: acceptedItems.length,
      acceptedItems,
      ...(validationWarnings.length > 0 ? { warnings: validationWarnings } : {}),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '未知错误';
    return {
      success: false,
      error: ERROR_MESSAGES.BATCH_PROCESS_ERROR(errorMsg),
      processedCount: 0,
    };
  }
}

// ============ Tool Definitions ============

export const translationTools: ToolDefinition[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'add_translation_batch',
        description: `批量提交段落翻译/润色/校对结果。只能在 working 状态下调用此工具！必须使用 paragraph_id 标识段落。常规最多 ${MAX_BATCH_SIZE} 个段落（允许 10% 容差，最多 ${MAX_BATCH_SIZE_WITH_TOLERANCE}）。当当前 chunk 剩余未提交段落数 ≤ ${MAX_BATCH_SIZE_DOUBLE} 时，允许单次最多 ${MAX_BATCH_SIZE_DOUBLE} 个段落。`,
        parameters: {
          type: 'object',
          properties: {
            paragraphs: {
              type: 'array',
              description: `段落处理结果数组。常规最多 ${MAX_BATCH_SIZE} 个段落（允许 10% 容差，最多 ${MAX_BATCH_SIZE_WITH_TOLERANCE}）；当当前 chunk 剩余未提交段落数 ≤ ${MAX_BATCH_SIZE_DOUBLE} 时，允许最多 ${MAX_BATCH_SIZE_DOUBLE} 个段落。必须使用 paragraph_id 标识段落（不支持 index）。`,
              items: {
                type: 'object',
                properties: {
                  paragraph_id: {
                    type: 'string',
                    description: '段落 ID（唯一提交标识，从 chunk 中 [ID: xxx] 获取）',
                  },
                  original_text_prefix: {
                    type: 'string',
                    description:
                      '原文前缀锚点（建议取原文前 5-10 个字符，trim 后最少 3 个字符、最多 20 个字符），用于校验 paragraph_id 与原文是否对齐',
                  },
                  translated_text: {
                    type: 'string',
                    description: '翻译/润色/校对后的文本',
                  },
                },
                required: ['paragraph_id', 'original_text_prefix', 'translated_text'],
              },
            },
          },
          required: ['paragraphs'],
        },
      },
    },
    handler: async (args, context: ToolContext) => {
      const {
        bookId,
        onAction,
        chunkBoundaries,
        taskId,
        aiProcessingStore,
        submittedParagraphIds,
      } = context;
      const { paragraphs } = args as unknown as AddTranslationBatchArgs;

      // 验证任务状态 - 只能在 working 状态下调用
      const statusValidation = validateTaskStatus(aiProcessingStore, taskId);
      if (!statusValidation.valid) {
        return buildErrorResponse(statusValidation.error || ERROR_MESSAGES.TASK_ID_MISSING);
      }

      // 复用验证过的任务对象
      const task = aiProcessingStore!.activeTasks.find((t) => t.id === taskId)!;
      const taskType = task.type;
      const chapterId = task.chapterId;
      const aiModelId = context.aiModelId;

      // 前置条件检查（在批次验证前完成，避免无效验证开销）
      if (!bookId) {
        return buildErrorResponse(ERROR_MESSAGES.BOOK_ID_MISSING);
      }
      if (!taskType) {
        return buildErrorResponse(ERROR_MESSAGES.TASK_TYPE_MISSING(taskId || 'unknown'));
      }
      if (!['translation', 'polish', 'proofreading'].includes(taskType)) {
        return buildErrorResponse(ERROR_MESSAGES.TASK_TYPE_UNSUPPORTED(taskType));
      }
      if (!aiModelId) {
        return buildErrorResponse(ERROR_MESSAGES.AI_MODEL_ID_MISSING);
      }
      if (!chapterId) {
        console.warn('[translation-tools] 任务缺少 chapterId，将触发惰性章节扫描', {
          taskId,
          taskType,
          bookId,
        });
      }

      // 验证参数（传入 submittedParagraphIds 用于计算剩余大小）
      const paramValidation = validateBatchArgs(
        { paragraphs },
        chunkBoundaries?.paragraphIds,
        submittedParagraphIds,
      );
      if (!paramValidation.valid || !paramValidation.resolvedIds) {
        return buildErrorResponse(paramValidation.error || ERROR_MESSAGES.PARAM_VALIDATION_FAILED, {
          errorCode: paramValidation.errorCode || 'PARAM_VALIDATION_FAILED',
          ...(paramValidation.invalidItems ? { invalidItems: paramValidation.invalidItems } : {}),
          note: '请确保每个段落都包含有效的 paragraph_id（从 chunk 中 [ID: xxx] 获取）。',
        });
      }

      const resolvedIds = paramValidation.resolvedIds;
      const warning = paramValidation.warning;

      // 检测重复段落 ID
      const duplicateCheck = detectDuplicateParagraphIds(resolvedIds);
      if (duplicateCheck.hasDuplicates) {
        return buildErrorResponse(ERROR_MESSAGES.DUPLICATE_PARAGRAPHS(duplicateCheck.duplicates), {
          errorCode: 'DUPLICATE_PARAGRAPHS',
          invalidParagraphIds: duplicateCheck.duplicates,
          warning,
        });
      }

      // 验证段落范围
      const rangeValidation = validateParagraphsInRange(
        resolvedIds,
        chunkBoundaries?.allowedParagraphIds,
      );
      if (!rangeValidation.valid) {
        return buildErrorResponse(rangeValidation.error || ERROR_MESSAGES.PARAM_VALIDATION_FAILED, {
          errorCode: rangeValidation.errorCode || 'OUT_OF_RANGE_PARAGRAPHS',
          ...(rangeValidation.invalidIds
            ? { invalidParagraphIds: rangeValidation.invalidIds }
            : {}),
          warning,
        });
      }

      // 构建处理项（将 resolvedIds 与 translated_text 配对）
      const processItems = paragraphs.map((p, i) => ({
        paragraphId: resolvedIds[i]!,
        originalTextPrefix:
          typeof p.original_text_prefix === 'string' ? p.original_text_prefix : '',
        translatedText: p.translated_text,
      }));

      // 处理批次
      const result = await processTranslationBatch(
        bookId,
        processItems,
        aiModelId,
        taskType as 'translation' | 'polish' | 'proofreading',
        chapterId,
      );

      if (!result.success) {
        return buildErrorResponse(result.error || ERROR_MESSAGES.PARAM_VALIDATION_FAILED, {
          errorCode: result.failedItems?.length ? 'ALL_PARAGRAPHS_FAILED' : undefined,
          errors: result.errors,
          warnings: result.warnings,
          failedParagraphs: result.failedItems,
          warning,
        });
      }

      // 从规范化的 acceptedItems 构建 accepted_paragraphs（仅包含实际通过验证的段落）
      const acceptedParagraphs = (result.acceptedItems ?? processItems).map((item) => {
        return {
          paragraph_id: item.paragraphId,
          translated_text: item.translatedText,
        };
      });
      const failedParagraphs = result.failedItems ?? [];

      // 将已处理的段落 ID 添加到 submittedParagraphIds 集合中（用于下次批次计算剩余大小）
      if (submittedParagraphIds) {
        for (const item of acceptedParagraphs) {
          submittedParagraphIds.add(item.paragraph_id);
        }
      }

      // 报告操作
      if (onAction) {
        onAction({
          type: 'update',
          entity: 'translation',
          data: {
            paragraph_id: resolvedIds[0] || '',
            translation_id: `batch_${result.processedCount}_${Date.now()}`,
            old_translation: '',
            new_translation: `批量处理 ${result.processedCount} 个段落 (${acceptedParagraphs
              .map((item) => item.paragraph_id)
              .slice(0, 3)
              .join(', ')}${acceptedParagraphs.length > 3 ? '...' : ''})`,
          },
        });
      }

      // 获取当前任务的未完成待办事项（仅当有待办时返回，减少 token 消耗）
      let todoReminder:
        | { incomplete_count: number; todos: Array<{ id: string; text: string }> }
        | undefined;
      if (taskId) {
        const incompleteTodos = TodoListService.getTodosByTaskId(taskId).filter(
          (t) => !t.completed,
        );
        if (incompleteTodos.length > 0) {
          todoReminder = {
            incomplete_count: incompleteTodos.length,
            todos: incompleteTodos.map((t) => ({ id: t.id, text: t.text })),
          };
        }
      }

      const responseResult: Record<string, unknown> = {
        success: true,
        message:
          failedParagraphs.length > 0
            ? ERROR_MESSAGES.PARTIAL_SUCCESS_SUMMARY(result.processedCount, failedParagraphs.length)
            : `成功处理 ${result.processedCount} 个段落`,
        processed_count: result.processedCount,
        accepted_paragraphs: acceptedParagraphs,
        ...(failedParagraphs.length > 0
          ? {
              failed_paragraphs: failedParagraphs,
              result_code: 'PARTIAL_SUCCESS' as BatchResultCode,
            }
          : {}),
        task_type: taskType,
        ...(result.warnings ? { quality_warnings: result.warnings } : {}),
        ...(warning ? { warning } : {}),
        ...(todoReminder ? { todo_reminder: todoReminder } : {}),
      };

      return JSON.stringify(responseResult);
    },
  },
];
