import type { ToolDefinition, ToolContext } from './types';
import type { AIProcessingStore } from 'src/services/ai/tasks/utils/task-types';
import { BookService } from 'src/services/book-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { ChapterService } from 'src/services/chapter-service';
import type { Chapter, Novel, Paragraph } from 'src/models/novel';
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
const MAX_PARAGRAPH_ID_EDIT_DISTANCE = 2;

type PrefixLengthResult =
  | { valid: true }
  | {
      valid: false;
      errorCode: 'ORIGINAL_TEXT_PREFIX_TOO_SHORT' | 'ORIGINAL_TEXT_PREFIX_TOO_LONG';
      limit: number;
    };

type ParagraphIdMatchResult =
  | { type: 'no_match' }
  | { type: 'matched'; matchedId: string; distance: number }
  | { type: 'ambiguous'; distance: number; candidateIds: string[] };

interface ParagraphIdAmbiguousMatch {
  originalId: string;
  distance: number;
  candidateIds: string[];
}

interface ParagraphIdNormalizationResult {
  normalizedIds: string[];
  correctionWarnings: string[];
  ambiguousMatches: ParagraphIdAmbiguousMatch[];
}

interface ParagraphIdCorrectionCandidate {
  index: number;
  originalId: string;
  candidateId: string;
  distance: number;
}

/**
 * 校验前缀长度是否在合法范围内（不含 includes 匹配和纯符号跳过逻辑）。
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
  PARAGRAPH_ID_AUTO_CORRECTED: (originalId: string, correctedId: string, distance: number) =>
    `段落 ID 自动纠正：${originalId} -> ${correctedId}（编辑距离 ${distance}）`,
  PARAGRAPH_ID_AMBIGUOUS_CANDIDATES: (
    originalId: string,
    distance: number,
    candidateIds: string[],
  ) =>
    `段落 ID 无法唯一匹配：${originalId}（最小编辑距离 ${distance}），候选: ${candidateIds.join(', ')}`,
  // 翻译内容验证相关
  MISSING_QUOTE_SYMBOLS: (paragraphId: string, missingTypes: string[]) =>
    `段落 ${paragraphId} 的译文缺少原文引号符号: ${missingTypes.join(' ')}`,
  TRANSLATION_SAME_AS_SELECTED: (paragraphId: string) =>
    `段落 ${paragraphId} 的译文与当前选中版本相同，请不要提交相同内容。`,
  TRANSLATION_SAME_AS_ORIGINAL_COMPLETENESS: (paragraphId: string) =>
    `段落 ${paragraphId} 的译文与原文相同，请检查翻译完整性，确认不存在遗漏的未翻译内容。`,
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
    `只能在 'working' 或 'review' 状态下调用此工具，当前状态为: ${currentStatus || '未设置'}`,
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

interface BuildErrorResponseOptions {
  errorCode?: string | undefined;
  invalidItems?: InvalidBatchItem[] | undefined;
  invalidParagraphIds?: string[] | undefined;
  warning?: string | undefined;
  note?: string | undefined;
  errors?: string[] | undefined;
  warnings?: string[] | undefined;
  failedParagraphs?: FailedParagraphItem[] | undefined;
}

/** 将非空数组字段写入 payload（空数组/undefined 则跳过） */
function assignNonEmptyArray<T>(
  payload: Record<string, unknown>,
  key: string,
  value: T[] | undefined,
): void {
  if (value && value.length > 0) {
    payload[key] = value;
  }
}

/** 将非空字符串字段写入 payload（空字符串/undefined 则跳过） */
function assignTruthyString(
  payload: Record<string, unknown>,
  key: string,
  value: string | undefined,
): void {
  if (value) {
    payload[key] = value;
  }
}

function buildErrorResponse(error: string, options?: BuildErrorResponseOptions): string {
  const payload: Record<string, unknown> = { success: false, error };
  if (!options) {
    return JSON.stringify(payload);
  }

  assignTruthyString(payload, 'error_code', options.errorCode);
  assignNonEmptyArray(payload, 'invalid_items', options.invalidItems);
  assignNonEmptyArray(payload, 'invalid_paragraph_ids', options.invalidParagraphIds);
  assignTruthyString(payload, 'warning', options.warning);
  assignTruthyString(payload, 'note', options.note);
  assignNonEmptyArray(payload, 'errors', options.errors);
  assignNonEmptyArray(payload, 'warnings', options.warnings);
  assignNonEmptyArray(payload, 'failed_paragraphs', options.failedParagraphs);

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
  if (currentStatus !== 'working' && currentStatus !== 'review') {
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
 * 计算两个字符串的 Levenshtein 编辑距离（带阈值剪枝）
 */
function calculateLevenshteinDistance(source: string, target: string, maxDistance: number): number {
  if (source === target) {
    return 0;
  }

  const sourceLength = source.length;
  const targetLength = target.length;

  if (Math.abs(sourceLength - targetLength) > maxDistance) {
    return maxDistance + 1;
  }

  const previousRow = new Array<number>(targetLength + 1);
  for (let j = 0; j <= targetLength; j++) {
    previousRow[j] = j;
  }

  for (let i = 1; i <= sourceLength; i++) {
    const currentRow = new Array<number>(targetLength + 1);
    currentRow[0] = i;
    let rowMin = currentRow[0];

    for (let j = 1; j <= targetLength; j++) {
      const substitutionCost = source[i - 1] === target[j - 1] ? 0 : 1;
      const deletion = previousRow[j]! + 1;
      const insertion = currentRow[j - 1]! + 1;
      const substitution = previousRow[j - 1]! + substitutionCost;

      const value = Math.min(deletion, insertion, substitution);
      currentRow[j] = value;

      if (value < rowMin) {
        rowMin = value;
      }
    }

    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }

    for (let j = 0; j <= targetLength; j++) {
      previousRow[j] = currentRow[j]!;
    }
  }

  return previousRow[targetLength] ?? maxDistance + 1;
}

/**
 * 在允许范围中为 paragraph_id 查找最接近的候选。
 */
function findBestParagraphIdMatch(
  paragraphId: string,
  allowedParagraphIds: Set<string>,
  maxDistance: number,
): ParagraphIdMatchResult {
  let bestDistance = maxDistance + 1;
  let bestCandidates: string[] = [];

  for (const candidateId of allowedParagraphIds) {
    const distance = calculateLevenshteinDistance(paragraphId, candidateId, maxDistance);
    if (distance > maxDistance) {
      continue;
    }

    if (distance < bestDistance) {
      bestDistance = distance;
      bestCandidates = [candidateId];
      continue;
    }

    if (distance === bestDistance) {
      bestCandidates.push(candidateId);
    }
  }

  if (bestCandidates.length === 0) {
    return { type: 'no_match' };
  }

  if (bestCandidates.length === 1) {
    return {
      type: 'matched',
      matchedId: bestCandidates[0]!,
      distance: bestDistance,
    };
  }

  return {
    type: 'ambiguous',
    distance: bestDistance,
    candidateIds: bestCandidates,
  };
}

/**
 * 确保章节的 content 字段已加载（按需从 ChapterContentService 懒加载并回填）。
 * 被 `loadParagraphTextMapByIds` 在单章节 / 全书扫描两条分支共用，避免重复粘贴加载样板。
 */
async function ensureChapterContentLoaded(chapter: Chapter): Promise<void> {
  if (chapter.content === undefined) {
    const content = await ChapterContentService.loadChapterContent(chapter.id);
    chapter.content = content || [];
    chapter.contentLoaded = true;
  }
}

/**
 * 把命中目标 ID 集合的段落写入输出映射。
 * 返回值代表是否已填满整个 ID 集合（调用方据此提前短路扫描）。
 */
function collectMatchingParagraphs(
  chapterContent: Paragraph[] | undefined,
  paragraphIds: Set<string>,
  out: Map<string, string>,
): boolean {
  for (const paragraph of chapterContent || []) {
    if (paragraphIds.has(paragraph.id)) {
      out.set(paragraph.id, paragraph.text);
      if (out.size === paragraphIds.size) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 从指定章节中收集所有目标段落的原文文本。
 * 单章节场景下，不需要短路检查（只扫这一个章节）。
 */
async function collectParagraphTextsFromChapter(
  book: Novel,
  chapterId: string,
  paragraphIds: Set<string>,
  out: Map<string, string>,
): Promise<void> {
  const found = ChapterService.findChapterById(book, chapterId);
  if (!found) {
    return;
  }
  await ensureChapterContentLoaded(found.chapter);
  collectMatchingParagraphs(found.chapter.content, paragraphIds, out);
}

/**
 * 遍历整本书查找所有目标段落的原文文本；命中预期数量后提前返回。
 */
async function collectParagraphTextsFromBook(
  book: Novel,
  paragraphIds: Set<string>,
  out: Map<string, string>,
): Promise<void> {
  if (!book.volumes) {
    return;
  }
  for (const volume of book.volumes) {
    for (const chapter of volume.chapters || []) {
      if (!chapter) continue;
      await ensureChapterContentLoaded(chapter);
      if (collectMatchingParagraphs(chapter.content, paragraphIds, out)) {
        return;
      }
    }
  }
}

/**
 * 加载指定段落 ID 对应的原文文本（用于纠错时做 original_text_prefix 二次确认）。
 */
async function loadParagraphTextMapByIds(
  book: Novel,
  paragraphIds: Set<string>,
  chapterId?: string,
): Promise<Map<string, string>> {
  const paragraphTextMap = new Map<string, string>();
  if (paragraphIds.size === 0 || !book.volumes) {
    return paragraphTextMap;
  }

  if (chapterId) {
    await collectParagraphTextsFromChapter(book, chapterId, paragraphIds, paragraphTextMap);
  } else {
    await collectParagraphTextsFromBook(book, paragraphIds, paragraphTextMap);
  }

  return paragraphTextMap;
}

/**
 * 基于当前任务范围对段落 ID 进行轻微拼写纠错（编辑距离 <= 2）。
 *
 * 仅在可唯一判定候选且 original_text_prefix 与候选段落原文匹配时自动纠正；
 * 歧义候选或原文前缀不匹配时保持原值，交由后续范围校验拒绝。
 */
async function normalizeParagraphIds(
  paragraphs: TranslationBatchItem[],
  paragraphIds: string[],
  allowedParagraphIds: Set<string> | undefined,
  book?: Novel,
  chapterId?: string,
): Promise<ParagraphIdNormalizationResult> {
  if (!allowedParagraphIds || allowedParagraphIds.size === 0) {
    return {
      normalizedIds: paragraphIds,
      correctionWarnings: [],
      ambiguousMatches: [],
    };
  }

  const normalizedIds: string[] = [];
  const correctionWarnings: string[] = [];
  const ambiguousMatches: ParagraphIdAmbiguousMatch[] = [];
  const correctionCandidates: ParagraphIdCorrectionCandidate[] = [];

  for (let i = 0; i < paragraphIds.length; i++) {
    const paragraphId = paragraphIds[i]!;

    if (allowedParagraphIds.has(paragraphId)) {
      normalizedIds.push(paragraphId);
      continue;
    }

    const matchResult = findBestParagraphIdMatch(
      paragraphId,
      allowedParagraphIds,
      MAX_PARAGRAPH_ID_EDIT_DISTANCE,
    );

    if (matchResult.type === 'matched') {
      normalizedIds.push(paragraphId);
      correctionCandidates.push({
        index: i,
        originalId: paragraphId,
        candidateId: matchResult.matchedId,
        distance: matchResult.distance,
      });
      continue;
    }

    if (matchResult.type === 'ambiguous') {
      normalizedIds.push(paragraphId);
      ambiguousMatches.push({
        originalId: paragraphId,
        distance: matchResult.distance,
        candidateIds: matchResult.candidateIds,
      });
      continue;
    }

    normalizedIds.push(paragraphId);
  }

  if (correctionCandidates.length === 0 || !book) {
    return {
      normalizedIds,
      correctionWarnings,
      ambiguousMatches,
    };
  }

  const candidateIdSet = new Set(correctionCandidates.map((item) => item.candidateId));
  const candidateParagraphTextMap = await loadParagraphTextMapByIds(
    book,
    candidateIdSet,
    chapterId,
  );

  for (const correction of correctionCandidates) {
    const paragraph = paragraphs[correction.index];
    if (!paragraph) {
      continue;
    }

    const prefix =
      typeof paragraph.original_text_prefix === 'string'
        ? paragraph.original_text_prefix.trim()
        : '';
    if (!prefix) {
      correctionWarnings.push(
        `段落 ${correction.originalId} 存在拼写纠错候选 ${correction.candidateId}（编辑距离 ${correction.distance}），但 original_text_prefix 为空，无法验证纠错。请提供 original_text_prefix 以启用自动纠正。`,
      );
      continue;
    }

    const candidateText = candidateParagraphTextMap.get(correction.candidateId)?.trim();
    if (!candidateText || !candidateText.includes(prefix)) {
      continue;
    }

    normalizedIds[correction.index] = correction.candidateId;
    correctionWarnings.push(
      ERROR_MESSAGES.PARAGRAPH_ID_AUTO_CORRECTED(
        correction.originalId,
        correction.candidateId,
        correction.distance,
      ),
    );
  }

  return {
    normalizedIds,
    correctionWarnings,
    ambiguousMatches,
  };
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

interface BatchItem {
  paragraphId: string;
  originalTextPrefix: string;
  translatedText: string;
}

interface CollectTargetParagraphsResult {
  paragraphs: Paragraph[];
  error?: { error: string };
}

/**
 * 从指定章节收集目标段落（优化路径）
 */
async function collectTargetParagraphsFromChapter(
  book: Novel,
  chapterId: string,
  items: BatchItem[],
): Promise<CollectTargetParagraphsResult> {
  const found = ChapterService.findChapterById(book, chapterId);
  if (!found) {
    return { paragraphs: [], error: { error: ERROR_MESSAGES.CHAPTER_NOT_FOUND(chapterId) } };
  }
  const chapter = found.chapter;
  if (chapter.content === undefined) {
    const content = await ChapterContentService.loadChapterContent(chapterId);
    chapter.content = content || [];
    chapter.contentLoaded = true;
  }
  const paragraphs: Paragraph[] = [];
  if (chapter.content) {
    const itemIdSet = new Set(items.map((item) => item.paragraphId));
    for (const p of chapter.content) {
      if (itemIdSet.has(p.id)) paragraphs.push(p);
    }
  }
  return { paragraphs };
}

/**
 * 在未提供 chapterId 的情况下遍历全书，惰性加载章节直到收集齐目标段落
 */
async function collectTargetParagraphsLazy(
  book: Novel,
  items: BatchItem[],
  bookId: string,
  taskType: 'translation' | 'polish' | 'proofreading',
): Promise<Paragraph[]> {
  const volumes = book.volumes ?? [];
  const totalChapterCount = volumes.reduce(
    (count, volume) => count + (volume.chapters?.length || 0),
    0,
  );
  console.warn(
    '[translation-tools] ⚠️ 未提供 chapterId，触发惰性章节扫描。建议确保任务对象包含 chapterId 以提升性能',
    { bookId, taskType, batchSize: items.length, totalChapterCount },
  );

  const itemIdSet = new Set(items.map((item) => item.paragraphId));
  const foundIds = new Set<string>();
  const paragraphs: Paragraph[] = [];

  for (const volume of volumes) {
    if (foundIds.size === itemIdSet.size) break;
    for (const chapter of volume.chapters || []) {
      if (!chapter || foundIds.size === itemIdSet.size) continue;
      if (chapter.content === undefined) {
        const content = await ChapterContentService.loadChapterContent(chapter.id);
        chapter.content = content || [];
        chapter.contentLoaded = true;
      }
      if (!chapter.content) continue;
      for (const p of chapter.content) {
        if (itemIdSet.has(p.id)) {
          paragraphs.push(p);
          foundIds.add(p.id);
        }
      }
    }
  }
  return paragraphs;
}

/**
 * 校验某个段落的翻译文本与现有版本之间是否存在重复
 * 返回 `{ status: 'selected' }` 表示与当前选中版本重复需要失败，
 * `{ status: 'history' }` 表示与历史版本重复（视为已处理不创建新版本）
 */
function checkTranslationDuplicate(
  paragraph: Paragraph,
  translatedText: string,
): { status: 'none' } | { status: 'selected' } | { status: 'history' } {
  if (!paragraph.translations || paragraph.translations.length === 0) {
    return { status: 'none' };
  }
  const selected = paragraph.translations.find((t) => t.id === paragraph.selectedTranslationId);
  if (selected && selected.translation === translatedText) {
    return { status: 'selected' };
  }
  // 倒序遍历：重复更可能出现在最近的翻译中，倒序可以更快命中
  for (let i = paragraph.translations.length - 1; i >= 0; i--) {
    const candidate = paragraph.translations[i];
    if (candidate && candidate.translation === translatedText) {
      return { status: 'history' };
    }
  }
  return { status: 'none' };
}

type ItemValidationOutcome =
  | { kind: 'failed'; errorCode: BatchErrorCode; error: string; warnings: string[] }
  | { kind: 'accepted'; warnings: string[]; duplicate: boolean };

/**
 * 校验原文前缀（长度 + includes 匹配），返回失败项或 undefined 及警告
 */
function validateOriginalTextPrefix(
  item: BatchItem,
  trimmedPrefix: string,
  trimmedOriginalText: string,
): { failure?: { errorCode: BatchErrorCode; error: string }; warnings: string[] } {
  const warnings: string[] = [];
  if (!trimmedPrefix) {
    return {
      failure: {
        errorCode: 'MISSING_ORIGINAL_TEXT_PREFIX',
        error: ERROR_MESSAGES.MISSING_ORIGINAL_TEXT_PREFIX(item.paragraphId),
      },
      warnings,
    };
  }

  // 纯符号/装饰性段落（如 ◇◇◇、全角括号+空格、破折号线、星号等）跳过前缀长度校验，
  // 仅保留 includes 匹配校验。这类段落的前缀长度难以满足常规限制。
  const symbolOnly = isSymbolOnly(trimmedOriginalText);
  if (!symbolOnly) {
    const prefixCheck = validatePrefixLength(trimmedPrefix, trimmedOriginalText);
    if (!prefixCheck.valid) {
      if (prefixCheck.errorCode === 'ORIGINAL_TEXT_PREFIX_TOO_SHORT') {
        return {
          failure: {
            errorCode: 'ORIGINAL_TEXT_PREFIX_TOO_SHORT',
            error: ERROR_MESSAGES.ORIGINAL_TEXT_PREFIX_TOO_SHORT(
              item.paragraphId,
              prefixCheck.limit,
            ),
          },
          warnings,
        };
      }
      if (prefixCheck.errorCode === 'ORIGINAL_TEXT_PREFIX_TOO_LONG') {
        // TOO_LONG 改为仅警告，不阻止提交。
        warnings.push(
          ERROR_MESSAGES.ORIGINAL_TEXT_PREFIX_TOO_LONG(item.paragraphId, prefixCheck.limit),
        );
      }
    }
  }

  if (!trimmedOriginalText.includes(trimmedPrefix)) {
    return {
      failure: {
        errorCode: 'ORIGINAL_TEXT_PREFIX_MISMATCH',
        error: ERROR_MESSAGES.ORIGINAL_TEXT_PREFIX_MISMATCH(item.paragraphId, trimmedPrefix),
      },
      warnings,
    };
  }
  return { warnings };
}

/**
 * 对单个段落执行完整校验，返回是否通过 / 失败原因 / 产生的警告
 */
function validateSingleItem(
  item: BatchItem,
  paragraph: Paragraph,
  enableOriginalTextValidation: boolean | undefined,
): ItemValidationOutcome {
  const warnings: string[] = [];
  const trimmedPrefix = item.originalTextPrefix.trim();
  const trimmedOriginalText = paragraph.text.trim();

  if (enableOriginalTextValidation === true) {
    const prefixResult = validateOriginalTextPrefix(item, trimmedPrefix, trimmedOriginalText);
    warnings.push(...prefixResult.warnings);
    if (prefixResult.failure) {
      return { kind: 'failed', ...prefixResult.failure, warnings };
    }
  }

  // 允许译文与原文相同：不再在工具层阻止该提交。
  // 若命中“当前选中版本重复”规则，仍会在后续校验中被拒绝。
  const trimmedTranslatedText = item.translatedText.trim();
  if (!isSymbolOnly(trimmedOriginalText) && trimmedTranslatedText === trimmedOriginalText) {
    warnings.push(ERROR_MESSAGES.TRANSLATION_SAME_AS_ORIGINAL_COMPLETENESS(item.paragraphId));
  }

  const dupe = checkTranslationDuplicate(paragraph, item.translatedText);
  if (dupe.status === 'selected') {
    return {
      kind: 'failed',
      errorCode: 'PARAM_VALIDATION_FAILED',
      error: ERROR_MESSAGES.TRANSLATION_SAME_AS_SELECTED(item.paragraphId),
      warnings,
    };
  }
  if (dupe.status === 'history') {
    return { kind: 'accepted', warnings, duplicate: true };
  }

  // 检查翻译长度异常（仅警告，不阻止提交）
  if (paragraph.text.length > 0) {
    const lengthRatio = item.translatedText.length / paragraph.text.length;
    if (lengthRatio < 0.3) {
      warnings.push(
        ERROR_MESSAGES.TRANSLATION_LENGTH_SHORT(item.paragraphId, Math.round(lengthRatio * 100)),
      );
    } else if (lengthRatio > 3) {
      warnings.push(
        ERROR_MESSAGES.TRANSLATION_LENGTH_LONG(item.paragraphId, Math.round(lengthRatio * 100)),
      );
    }
  }

  const missingQuoteSymbols = detectMissingQuoteSymbols(paragraph.text, item.translatedText);
  if (missingQuoteSymbols.length > 0) {
    return {
      kind: 'failed',
      errorCode: 'PARAM_VALIDATION_FAILED',
      error: ERROR_MESSAGES.MISSING_QUOTE_SYMBOLS(item.paragraphId, missingQuoteSymbols),
      warnings,
    };
  }

  return { kind: 'accepted', warnings, duplicate: false };
}

interface ProcessTranslationBatchResult {
  success: boolean;
  error?: string;
  errors?: string[];
  warnings?: string[];
  processedCount: number;
  /** 实际通过验证的段落列表（包含历史重复段落，它们也被视为已处理以推进进度） */
  acceptedItems?: Array<{ paragraphId: string; translatedText: string }>;
  failedItems?: FailedParagraphItem[];
}

/** 解析并校验书籍对象，返回错误结果或有效书籍 */
function resolveBook(
  bookId: string,
  preloadedBook: Novel | undefined,
): { book: Novel } | { error: ProcessTranslationBatchResult } {
  const resolved = preloadedBook;
  if (!resolved) {
    return { error: { success: false, error: ERROR_MESSAGES.BOOK_NOT_FOUND(bookId), processedCount: 0 } };
  }
  if (!resolved.volumes) {
    return { error: { success: false, error: ERROR_MESSAGES.BOOK_NO_VOLUMES, processedCount: 0 } };
  }
  return { book: resolved };
}

/** 根据是否提供 chapterId 选择收集目标段落的路径 */
async function collectTargetParagraphs(
  book: Novel,
  items: BatchItem[],
  bookId: string,
  taskType: 'translation' | 'polish' | 'proofreading',
  chapterId: string | undefined,
): Promise<{ paragraphs: Paragraph[] } | { error: ProcessTranslationBatchResult }> {
  if (chapterId) {
    const chapterResult = await collectTargetParagraphsFromChapter(book, chapterId, items);
    if (chapterResult.error) {
      return { error: { success: false, error: chapterResult.error.error, processedCount: 0 } };
    }
    return { paragraphs: chapterResult.paragraphs };
  }
  const paragraphs = await collectTargetParagraphsLazy(book, items, bookId, taskType);
  return { paragraphs };
}

/** 构造缺失段落相关的错误响应（区分「空段落」与「完全找不到」） */
function buildMissingParagraphsError(
  items: BatchItem[],
  targetParagraphs: Paragraph[],
  targetParagraphsMap: Map<string, Paragraph>,
): ProcessTranslationBatchResult | null {
  const missingParagraphIds = items
    .filter((item) => !targetParagraphsMap.has(item.paragraphId))
    .map((item) => item.paragraphId);
  if (missingParagraphIds.length === 0) {
    return null;
  }
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

interface ValidationSummary {
  warnings: string[];
  acceptedItems: Array<{ paragraphId: string; translatedText: string }>;
  failedItems: FailedParagraphItem[];
}

/** 遍历所有批次项执行逐条校验，聚合接受/失败/警告结果 */
function validateAllItems(
  items: BatchItem[],
  targetParagraphsMap: Map<string, Paragraph>,
  enableOriginalTextValidation: boolean | undefined,
): ValidationSummary {
  const warnings: string[] = [];
  let duplicateCount = 0;
  const acceptedItems: Array<{ paragraphId: string; translatedText: string }> = [];
  const failedItems: FailedParagraphItem[] = [];

  for (const item of items) {
    const paragraph = targetParagraphsMap.get(item.paragraphId);
    if (!paragraph) continue;
    const outcome = validateSingleItem(item, paragraph, enableOriginalTextValidation);
    warnings.push(...outcome.warnings);
    if (outcome.kind === 'failed') {
      failedItems.push({
        paragraph_id: item.paragraphId,
        error_code: outcome.errorCode,
        error: outcome.error,
      });
      continue;
    }
    if (outcome.duplicate) duplicateCount++;
    // 历史重复段落仍视为已处理以推进进度，但不会创建新翻译版本
    acceptedItems.push({ paragraphId: item.paragraphId, translatedText: item.translatedText });
  }

  if (duplicateCount > 0) {
    warnings.push(ERROR_MESSAGES.TRANSLATION_DUPLICATE(duplicateCount));
  }

  return { warnings, acceptedItems, failedItems };
}

/** 根据校验结果装配最终返回值（成功 / 部分成功 / 全部失败） */
function buildBatchValidationResult(summary: ValidationSummary): ProcessTranslationBatchResult {
  const { warnings, acceptedItems, failedItems } = summary;
  const warningsField = warnings.length > 0 ? { warnings } : {};

  if (failedItems.length > 0 && acceptedItems.length === 0) {
    return {
      success: false,
      error: ERROR_MESSAGES.ALL_PARAGRAPHS_FAILED,
      errors: failedItems.map((it) => it.error),
      failedItems,
      ...warningsField,
      processedCount: 0,
    };
  }

  if (failedItems.length > 0) {
    return {
      success: true,
      processedCount: acceptedItems.length,
      acceptedItems,
      failedItems,
      ...warningsField,
    };
  }

  return {
    success: true,
    processedCount: acceptedItems.length,
    acceptedItems,
    ...warningsField,
  };
}

/**
 * 处理批次（保存翻译）
 *
 * @param chapterId - 可选的章节 ID。提供时仅加载和搜索该章节（性能优化），
 *                    未提供时回退到遍历所有章节的行为。
 * @param preloadedBook - 可选的预加载书籍对象。提供时跳过 BookService.getBookById 查询。
 */
async function processTranslationBatch(
  bookId: string,
  items: BatchItem[],
  aiModelId: string,
  taskType: 'translation' | 'polish' | 'proofreading',
  chapterId?: string,
  preloadedBook?: Novel,
  enableOriginalTextValidation?: boolean,
): Promise<ProcessTranslationBatchResult> {
  // aiModelId 保留在签名中以维持调用方兼容；实际翻译写入由 onParagraphsExtracted 回调完成
  void aiModelId;
  try {
    const bookResolved = resolveBook(
      bookId,
      preloadedBook ?? (await BookService.getBookById(bookId)) ?? undefined,
    );
    if ('error' in bookResolved) return bookResolved.error;
    const book = bookResolved.book;

    // 收集目标段落：优先使用 chapterId 限定范围（避免加载所有章节）
    const collectResult = await collectTargetParagraphs(book, items, bookId, taskType, chapterId);
    if ('error' in collectResult) return collectResult.error;
    const targetParagraphs = collectResult.paragraphs;

    // 过滤掉空白段落
    const validTargetParagraphs = targetParagraphs.filter((p) => !isEmptyParagraph(p.text));
    const targetParagraphsMap = new Map(validTargetParagraphs.map((p) => [p.id, p]));

    const missingError = buildMissingParagraphsError(items, targetParagraphs, targetParagraphsMap);
    if (missingError) return missingError;

    // 处理每个段落
    // 无论任务类型如何，都创建新的翻译版本以保留历史记录
    // 这样可以防止 AI 产生糟糕结果时丢失用户之前的手动翻译
    //
    // 验证所有段落并收集接受的段落 ID（合并为单次遍历，确保验证逻辑与接受逻辑一致）
    // 不修改任何数据，防止部分段落验证失败时已提交的段落被污染
    // 收集所有验证错误和警告，一次性返回，方便 AI 批量修复
    // 注意：实际的翻译写入由调用方的 onParagraphsExtracted 回调统一完成，
    // 工具层只负责验证，不直接修改段落数据，避免双重写入
    const summary = validateAllItems(items, targetParagraphsMap, enableOriginalTextValidation);
    return buildBatchValidationResult(summary);
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

/**
 * add_translation_batch 的前置条件校验，返回错误字符串或 null
 */
function validateAddBatchPreconditions(params: {
  bookId: string | undefined;
  taskType: string | undefined;
  aiModelId: string | undefined;
  chapterId: string | undefined;
  taskId: string | undefined;
}): string | null {
  const { bookId, taskType, aiModelId, chapterId, taskId } = params;
  if (!bookId) return ERROR_MESSAGES.BOOK_ID_MISSING;
  if (!taskType) return ERROR_MESSAGES.TASK_TYPE_MISSING(taskId || 'unknown');
  if (!['translation', 'polish', 'proofreading'].includes(taskType)) {
    return ERROR_MESSAGES.TASK_TYPE_UNSUPPORTED(taskType);
  }
  if (!aiModelId) return ERROR_MESSAGES.AI_MODEL_ID_MISSING;
  if (!chapterId) {
    console.warn('[translation-tools] 任务缺少 chapterId，将触发惰性章节扫描', {
      taskId,
      taskType,
      bookId,
    });
  }
  return null;
}

type PrepareBatchParamsResult =
  | { kind: 'failure'; failure: string }
  | {
      kind: 'ok';
      normalizedIds: string[];
      correctionWarnings: string[];
      warning: string | undefined;
      preloadedBook: Novel | undefined;
    };

/** 构造 validateBatchArgs 失败时的响应字符串 */
function buildParamValidationFailure(
  paramValidation: ReturnType<typeof validateBatchArgs>,
): string {
  return buildErrorResponse(paramValidation.error || ERROR_MESSAGES.PARAM_VALIDATION_FAILED, {
    errorCode: paramValidation.errorCode || 'PARAM_VALIDATION_FAILED',
    ...(paramValidation.invalidItems ? { invalidItems: paramValidation.invalidItems } : {}),
    note: '请确保每个段落都包含有效的 paragraph_id（从 chunk 中 [ID: xxx] 获取）。',
  });
}

/** 当 chunkBoundaries 需要纠错时按需预加载书籍对象 */
async function preloadBookIfNeeded(
  bookId: string,
  chunkBoundaries: ToolContext['chunkBoundaries'],
): Promise<{ book: Novel | undefined } | { failure: string }> {
  if (!chunkBoundaries?.allowedParagraphIds || chunkBoundaries.allowedParagraphIds.size === 0) {
    return { book: undefined };
  }
  const preloaded = (await BookService.getBookById(bookId)) ?? undefined;
  if (!preloaded) {
    return { failure: buildErrorResponse(ERROR_MESSAGES.BOOK_NOT_FOUND(bookId)) };
  }
  return { book: preloaded };
}

/** 构造重复段落 ID 的错误响应 */
function buildDuplicateIdsFailure(
  duplicates: string[],
  warning: string | undefined,
  correctionWarnings: string[],
): string {
  return buildErrorResponse(ERROR_MESSAGES.DUPLICATE_PARAGRAPHS(duplicates), {
    errorCode: 'DUPLICATE_PARAGRAPHS',
    invalidParagraphIds: duplicates,
    warning,
    ...(correctionWarnings.length > 0 ? { warnings: correctionWarnings } : {}),
  });
}

/** 基于歧义匹配信息与无效 ID 生成提示 note 文本（空数组时返回 undefined） */
function buildAmbiguousNote(
  ambiguousMatches: ParagraphIdAmbiguousMatch[],
  invalidIds: string[] | undefined,
): string | undefined {
  if (!invalidIds || invalidIds.length === 0) return undefined;
  const messages = ambiguousMatches
    .filter((item) => invalidIds.includes(item.originalId))
    .map((item) =>
      ERROR_MESSAGES.PARAGRAPH_ID_AMBIGUOUS_CANDIDATES(
        item.originalId,
        item.distance,
        item.candidateIds,
      ),
    );
  if (messages.length === 0) return undefined;
  return `${messages.slice(0, 3).join('；')}${messages.length > 3 ? '；…' : ''}`;
}

/** 构造范围校验失败的响应 */
function buildRangeValidationFailure(
  rangeValidation: ReturnType<typeof validateParagraphsInRange>,
  ambiguousMatches: ParagraphIdAmbiguousMatch[],
  warning: string | undefined,
  correctionWarnings: string[],
): string {
  const note = buildAmbiguousNote(ambiguousMatches, rangeValidation.invalidIds);
  return buildErrorResponse(rangeValidation.error || ERROR_MESSAGES.PARAM_VALIDATION_FAILED, {
    errorCode: rangeValidation.errorCode || 'OUT_OF_RANGE_PARAGRAPHS',
    ...(rangeValidation.invalidIds ? { invalidParagraphIds: rangeValidation.invalidIds } : {}),
    warning,
    ...(correctionWarnings.length > 0 ? { warnings: correctionWarnings } : {}),
    ...(note ? { note } : {}),
  });
}

/**
 * 执行参数级校验、段落 ID 规范化及范围校验，返回错误响应（若失败）或规范化后的结构
 */
async function prepareBatchParams(
  args: AddTranslationBatchArgs,
  context: ToolContext,
): Promise<PrepareBatchParamsResult> {
  const { bookId, chunkBoundaries, submittedParagraphIds } = context;
  if (!bookId) {
    return { kind: 'failure', failure: buildErrorResponse(ERROR_MESSAGES.BOOK_ID_MISSING) };
  }

  const { paragraphs } = args;
  const paramValidation = validateBatchArgs(
    { paragraphs },
    chunkBoundaries?.paragraphIds,
    submittedParagraphIds,
  );
  if (!paramValidation.valid || !paramValidation.resolvedIds) {
    return { kind: 'failure', failure: buildParamValidationFailure(paramValidation) };
  }

  const resolvedIds = paramValidation.resolvedIds;
  const warning = paramValidation.warning;

  // 预加载书籍对象（仅在纠错逻辑需要时提前加载）
  const preloadResult = await preloadBookIfNeeded(bookId, chunkBoundaries);
  if ('failure' in preloadResult) {
    return { kind: 'failure', failure: preloadResult.failure };
  }
  const preloadedBook = preloadResult.book;

  const chapterId = context.aiProcessingStore!.activeTasks.find((t) => t.id === context.taskId)
    ?.chapterId;
  const normalizedIdsResult = await normalizeParagraphIds(
    paragraphs,
    resolvedIds,
    chunkBoundaries?.allowedParagraphIds,
    preloadedBook,
    chapterId,
  );
  const { normalizedIds, correctionWarnings } = normalizedIdsResult;

  const duplicateCheck = detectDuplicateParagraphIds(normalizedIds);
  if (duplicateCheck.hasDuplicates) {
    return {
      kind: 'failure',
      failure: buildDuplicateIdsFailure(duplicateCheck.duplicates, warning, correctionWarnings),
    };
  }

  const rangeValidation = validateParagraphsInRange(
    normalizedIds,
    chunkBoundaries?.allowedParagraphIds,
  );
  if (!rangeValidation.valid) {
    return {
      kind: 'failure',
      failure: buildRangeValidationFailure(
        rangeValidation,
        normalizedIdsResult.ambiguousMatches,
        warning,
        correctionWarnings,
      ),
    };
  }

  return { kind: 'ok', normalizedIds, correctionWarnings, warning, preloadedBook };
}

/**
 * 收集当前任务的未完成待办提醒（供 working 状态下批量提交后返回）
 */
function collectIncompleteTodos(
  taskId: string | undefined,
): { incomplete_count: number; todos: Array<{ id: string; text: string }> } | undefined {
  if (!taskId) return undefined;
  const incompleteTodos = TodoListService.getTodosByTaskId(taskId).filter((t) => t.status !== 'done');
  if (incompleteTodos.length === 0) return undefined;
  return {
    incomplete_count: incompleteTodos.length,
    todos: incompleteTodos.map((t) => ({ id: t.id, text: t.text })),
  };
}

/**
 * add_translation_batch 工具的主处理入口
 */
interface AcceptedParagraph {
  paragraph_id: string;
  translated_text: string;
}

/** 将 AddTranslationBatchArgs.paragraphs 与归一化 ID 配对为内部 BatchItem 数组 */
function buildProcessItems(
  paragraphs: TranslationBatchItem[],
  normalizedIds: string[],
): BatchItem[] {
  return paragraphs.map((p, i) => ({
    paragraphId: normalizedIds[i]!,
    originalTextPrefix: typeof p.original_text_prefix === 'string' ? p.original_text_prefix : '',
    translatedText: p.translated_text,
  }));
}

/** processTranslationBatch 失败时的响应字符串 */
function buildProcessFailureResponse(
  result: ProcessTranslationBatchResult,
  combinedWarnings: string[],
  warning: string | undefined,
): string {
  return buildErrorResponse(result.error || ERROR_MESSAGES.PARAM_VALIDATION_FAILED, {
    errorCode: result.failedItems?.length ? 'ALL_PARAGRAPHS_FAILED' : undefined,
    errors: result.errors,
    warnings: combinedWarnings.length > 0 ? combinedWarnings : undefined,
    failedParagraphs: result.failedItems,
    warning,
  });
}

/** 将已接受段落 ID 合入 submittedParagraphIds 集合（防止下次批次重复提交） */
function trackSubmittedParagraphIds(
  submittedParagraphIds: Set<string> | undefined,
  acceptedParagraphs: AcceptedParagraph[],
): void {
  if (!submittedParagraphIds) return;
  for (const item of acceptedParagraphs) {
    submittedParagraphIds.add(item.paragraph_id);
  }
}

/** 通过 onAction 回调向调用方报告本次批量操作（若回调存在） */
function emitBatchActionReport(
  onAction: ToolContext['onAction'],
  processedCount: number,
  firstParagraphId: string,
  acceptedParagraphs: AcceptedParagraph[],
): void {
  if (!onAction) return;
  const preview = acceptedParagraphs
    .map((item) => item.paragraph_id)
    .slice(0, 3)
    .join(', ');
  const suffix = acceptedParagraphs.length > 3 ? '...' : '';
  onAction({
    type: 'update',
    entity: 'translation',
    data: {
      paragraph_id: firstParagraphId,
      translation_id: `batch_${processedCount}_${Date.now()}`,
      old_translation: '',
      new_translation: `批量处理 ${processedCount} 个段落 (${preview}${suffix})`,
    },
  });
}

interface BuildSuccessResponseParams {
  processedCount: number;
  acceptedParagraphs: AcceptedParagraph[];
  failedParagraphs: FailedParagraphItem[];
  taskType: string;
  combinedWarnings: string[];
  warning: string | undefined;
  taskId: string | undefined;
}

/** 组装 add_translation_batch 工具成功时返回的 JSON 结构 */
function buildSuccessResponse(params: BuildSuccessResponseParams): string {
  const {
    processedCount,
    acceptedParagraphs,
    failedParagraphs,
    taskType,
    combinedWarnings,
    warning,
    taskId,
  } = params;
  const todoReminder = collectIncompleteTodos(taskId);
  const responseResult: Record<string, unknown> = {
    success: true,
    message:
      failedParagraphs.length > 0
        ? ERROR_MESSAGES.PARTIAL_SUCCESS_SUMMARY(processedCount, failedParagraphs.length)
        : `成功处理 ${processedCount} 个段落`,
    processed_count: processedCount,
    accepted_paragraphs: acceptedParagraphs,
    ...(failedParagraphs.length > 0
      ? {
          failed_paragraphs: failedParagraphs,
          result_code: 'PARTIAL_SUCCESS' as BatchResultCode,
        }
      : {}),
    task_type: taskType,
    ...(combinedWarnings.length > 0 ? { quality_warnings: combinedWarnings } : {}),
    ...(warning ? { warning } : {}),
    ...(todoReminder ? { todo_reminder: todoReminder } : {}),
  };

  return JSON.stringify(responseResult);
}

/**
 * add_translation_batch 工具的主处理入口
 */
async function handleAddTranslationBatch(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<string> {
  const { bookId, onAction, taskId, aiProcessingStore, submittedParagraphIds } = context;
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

  const precondError = validateAddBatchPreconditions({
    bookId,
    taskType,
    aiModelId,
    chapterId,
    taskId,
  });
  if (precondError) return buildErrorResponse(precondError);

  const prepared = await prepareBatchParams({ paragraphs }, context);
  if (prepared.kind === 'failure') return prepared.failure;
  const { normalizedIds, correctionWarnings, warning, preloadedBook } = prepared;

  const processItems = buildProcessItems(paragraphs, normalizedIds);

  // 处理批次
  const result = await processTranslationBatch(
    bookId!,
    processItems,
    aiModelId!,
    taskType as 'translation' | 'polish' | 'proofreading',
    chapterId,
    preloadedBook,
    context.enableOriginalTextValidation,
  );

  const combinedWarnings = [...(result.warnings ?? []), ...correctionWarnings];

  if (!result.success) {
    return buildProcessFailureResponse(result, combinedWarnings, warning);
  }

  // 从规范化的 acceptedItems 构建 accepted_paragraphs（仅包含实际通过验证的段落）
  const acceptedParagraphs: AcceptedParagraph[] = (result.acceptedItems ?? processItems).map(
    (item) => ({
      paragraph_id: item.paragraphId,
      translated_text: item.translatedText,
    }),
  );
  const failedParagraphs = result.failedItems ?? [];

  trackSubmittedParagraphIds(submittedParagraphIds, acceptedParagraphs);
  emitBatchActionReport(
    onAction,
    result.processedCount,
    acceptedParagraphs[0]?.paragraph_id || '',
    acceptedParagraphs,
  );

  return buildSuccessResponse({
    processedCount: result.processedCount,
    acceptedParagraphs,
    failedParagraphs,
    taskType,
    combinedWarnings,
    warning,
    taskId,
  });
}

export interface CreateTranslationToolsOptions {
  enableOriginalTextValidation?: boolean;
}

export function createTranslationTools(
  options?: CreateTranslationToolsOptions,
): ToolDefinition[] {
  const validate = options?.enableOriginalTextValidation === true;
  const prefixDescription = validate
    ? '原文前缀锚点（建议取原文前 5-10 个字符，trim 后最少 3 个字符、最多 20 个字符），用于校验 paragraph_id 与原文是否对齐'
    : '原文前缀锚点（可选，当前已禁用校验）';
  const itemRequired = validate
    ? ['paragraph_id', 'original_text_prefix', 'translated_text']
    : ['paragraph_id', 'translated_text'];

  return [
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
                    description: prefixDescription,
                  },
                  translated_text: {
                    type: 'string',
                    description: '翻译/润色/校对后的文本',
                  },
                },
                required: itemRequired,
              },
            },
          },
          required: ['paragraphs'],
        },
      },
    },
    handler: async (args, context: ToolContext) => handleAddTranslationBatch(args, context),
  },
];
}
