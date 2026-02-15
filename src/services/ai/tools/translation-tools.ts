import type { ToolDefinition, ToolContext } from './types';
import type { AIProcessingStore } from 'src/services/ai/tasks/utils/task-types';
import { BookService } from 'src/services/book-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { ChapterService } from 'src/services/chapter-service';
import { generateShortId } from 'src/utils/id-generator';
import type { Paragraph, Translation } from 'src/models/novel';
import { MAX_TRANSLATION_BATCH_SIZE } from 'src/services/ai/constants';
import { useBooksStore } from 'src/stores/books';
import { isEmptyParagraph } from 'src/utils/text-utils';

// ============ Types ============

interface TranslationBatchItem {
  /** 段落 ID（唯一提交标识） */
  paragraph_id: string;
  translated_text: string;
}

interface AddTranslationBatchArgs {
  paragraphs: TranslationBatchItem[];
}

// ============ Constants ============

const MAX_BATCH_SIZE = MAX_TRANSLATION_BATCH_SIZE;
const BATCH_SIZE_TOLERANCE_RATIO = 0.1;
const MAX_BATCH_SIZE_WITH_TOLERANCE = Math.ceil(MAX_BATCH_SIZE * (1 + BATCH_SIZE_TOLERANCE_RATIO));
const MAX_BATCH_SIZE_DOUBLE = MAX_BATCH_SIZE * 2;
const OPENING_QUOTE_SYMBOLS = ['「', '『', '“', "'"] as const;
const CLOSING_QUOTE_SYMBOLS = ['」', '』', '”', "'"] as const;

// 错误消息常量
const ERROR_MESSAGES = {
  MISSING_PARAGRAPH_ID: '必须提供 paragraph_id（不支持 index）',
  INVALID_PARAGRAPH_ID: 'paragraph_id 必须是非空字符串',
  LEGACY_INDEX_REJECTED:
    '检测到使用已废弃的 index 字段提交。请使用 paragraph_id 标识段落（从 chunk 中 [ID: xxx] 获取）',
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
  DUPLICATE_PARAGRAPHS: (ids: string[]) => `批次中存在重复的段落 ID: ${ids.join(', ')}`,
  OUT_OF_RANGE_PARAGRAPHS: (ids: string[], count: number) =>
    `以下段落不在当前任务范围内: ${ids.slice(0, 5).join(', ')}${count > 5 ? ` 等 ${count} 个段落` : ''}`,
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

// ============ Status Validation ============

/**
 * 验证任务当前状态是否为 'working'
 */
function validateTaskStatus(
  aiProcessingStore: AIProcessingStore | undefined,
  taskId: string | undefined,
): { valid: boolean; error?: string; currentStatus?: string | undefined } {
  if (!aiProcessingStore) {
    return { valid: false, error: 'AI 处理 Store 未初始化' };
  }

  if (!taskId) {
    return { valid: false, error: '未提供任务 ID' };
  }

  const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
  if (!task) {
    return { valid: false, error: `任务不存在: ${taskId}` };
  }

  const currentStatus = task.workflowStatus;
  if (currentStatus !== 'working') {
    return {
      valid: false,
      error: `只能在 'working' 状态下调用此工具，当前状态为: ${currentStatus || '未设置'}`,
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
  resolvedIds?: string[];
  warning?: string;
} {
  const { paragraphs } = args;

  // 检查空批次
  if (!paragraphs || !Array.isArray(paragraphs) || paragraphs.length === 0) {
    return {
      valid: false,
      error: ERROR_MESSAGES.EMPTY_PARAGRAPH_LIST,
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
      };
    }

    // 解析段落标识符（仅支持 paragraph_id）
    const { id, error } = resolveParagraphId(item);
    if (error || !id) {
      return {
        valid: false,
        error: ERROR_MESSAGES.INVALID_PARAGRAPH(i, error || '无效的段落标识'),
      };
    }

    resolvedIds.push(id);

    if (!item.translated_text || typeof item.translated_text !== 'string') {
      return {
        valid: false,
        error: ERROR_MESSAGES.MISSING_TRANSLATION(i),
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
): { valid: boolean; error?: string } {
  if (!allowedParagraphIds || allowedParagraphIds.size === 0) {
    // 如果没有提供边界限制，允许所有段落
    return { valid: true };
  }

  const invalidIds = paragraphIds.filter((id) => !allowedParagraphIds.has(id));
  if (invalidIds.length > 0) {
    return {
      valid: false,
      error: ERROR_MESSAGES.OUT_OF_RANGE_PARAGRAPHS(invalidIds, invalidIds.length),
    };
  }

  return { valid: true };
}

/**
 * 统计文本中指定符号列表出现次数
 */
function countSymbols(text: string, symbols: readonly string[]): number {
  let count = 0;
  for (const symbol of symbols) {
    count += text.split(symbol).length - 1;
  }
  return count;
}

/**
 * 检查译文是否遗漏原文中的引号（允许「」/『』与“”互相转换）
 */
function detectMissingQuoteSymbols(originalText: string, translatedText: string): string[] {
  const missingTypes: string[] = [];

  const originalOpeningCount = countSymbols(originalText, OPENING_QUOTE_SYMBOLS);
  const translatedOpeningCount = countSymbols(translatedText, OPENING_QUOTE_SYMBOLS);
  if (translatedOpeningCount < originalOpeningCount) {
    missingTypes.push('开引号（「『“）');
  }

  const originalClosingCount = countSymbols(originalText, CLOSING_QUOTE_SYMBOLS);
  const translatedClosingCount = countSymbols(translatedText, CLOSING_QUOTE_SYMBOLS);
  if (translatedClosingCount < originalClosingCount) {
    missingTypes.push('闭引号（」』”）');
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
  items: Array<{ paragraphId: string; translatedText: string }>,
  aiModelId: string,
  taskType: 'translation' | 'polish' | 'proofreading',
  chapterId?: string,
): Promise<{ success: boolean; error?: string; processedCount: number }> {
  try {
    const book = await BookService.getBookById(bookId);
    if (!book) {
      return { success: false, error: `书籍不存在: ${bookId}`, processedCount: 0 };
    }

    if (!book.volumes) {
      return { success: false, error: '书籍缺少章节数据', processedCount: 0 };
    }

    // 收集目标段落：优先使用 chapterId 限定范围（避免加载所有章节）
    const targetParagraphs: Paragraph[] = [];

    if (chapterId) {
      // 优化路径：仅加载和搜索指定章节
      const found = ChapterService.findChapterById(book, chapterId);
      if (!found) {
        return {
          success: false,
          error: `章节不存在: ${chapterId}`,
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
      // 回退路径：加载所有未加载的章节，遍历全部段落
      const totalChapterCount = book.volumes.reduce(
        (count, volume) => count + (volume.chapters?.length || 0),
        0,
      );
      console.warn('[translation-tools] ⚠️ 未提供 chapterId，触发全书回退扫描，可能影响性能', {
        bookId,
        taskType,
        batchSize: items.length,
        totalChapterCount,
      });

      const chaptersToLoad: string[] = [];
      for (const volume of book.volumes) {
        for (const chapter of volume.chapters || []) {
          if (chapter && chapter.content === undefined) {
            chaptersToLoad.push(chapter.id);
          }
        }
      }

      if (chaptersToLoad.length > 0) {
        const contentsMap = await ChapterContentService.loadChapterContentsBatch(chaptersToLoad);
        for (const volume of book.volumes) {
          for (const chapter of volume.chapters || []) {
            if (!chapter || chapter.content !== undefined) continue;
            const content = contentsMap.get(chapter.id);
            chapter.content = content || [];
            chapter.contentLoaded = true;
          }
        }
      }

      // 收集所有目标段落（合并为单次遍历）
      const itemIdSet = new Set(items.map((item) => item.paragraphId));
      for (const volume of book.volumes) {
        for (const chapter of volume.chapters || []) {
          if (!chapter.content) continue;
          for (const p of chapter.content) {
            if (itemIdSet.has(p.id)) {
              targetParagraphs.push(p);
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
      const blankParagraphIds = targetParagraphs
        .filter((p) => missingParagraphIds.includes(p.id) && isEmptyParagraph(p.text))
        .map((p) => p.id);

      if (blankParagraphIds.length > 0) {
        return {
          success: false,
          error: `无法翻译空段落: ${blankParagraphIds.join(', ')}`,
          processedCount: 0,
        };
      }

      return {
        success: false,
        error: `未找到以下段落: ${missingParagraphIds.join(', ')}`,
        processedCount: 0,
      };
    }

    // 处理每个段落
    // 无论任务类型如何，都创建新的翻译版本以保留历史记录
    // 这样可以防止 AI 产生糟糕结果时丢失用户之前的手动翻译
    let processedCount = 0;

    for (const item of items) {
      const paragraph = targetParagraphsMap.get(item.paragraphId);
      if (!paragraph) {
        continue;
      }

      const missingQuoteSymbols = detectMissingQuoteSymbols(paragraph.text, item.translatedText);
      if (missingQuoteSymbols.length > 0) {
        return {
          success: false,
          error: `段落 ${item.paragraphId} 的译文缺少原文引号符号: ${missingQuoteSymbols.join(' ')}`,
          processedCount: 0,
        };
      }

      // 所有任务类型都创建新的翻译版本
      const newTranslation: Translation = {
        id: generateShortId(),
        translation: item.translatedText,
        aiModelId,
      };

      if (!paragraph.translations) {
        paragraph.translations = [];
      }
      paragraph.translations.push(newTranslation);
      paragraph.selectedTranslationId = newTranslation.id;

      processedCount++;
    }

    // 保存书籍并同步 store（优先更新 store，确保 UI 立即可见）
    const booksStore = useBooksStore();
    const existingBook = booksStore.getBookById(bookId);
    if (existingBook) {
      await booksStore.updateBook(bookId, { volumes: book.volumes }, { persist: false });
    }
    await BookService.saveBook(book);

    return { success: true, processedCount };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '未知错误';
    return { success: false, error: `处理批次时出错: ${errorMsg}`, processedCount: 0 };
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
                  translated_text: {
                    type: 'string',
                    description: '翻译/润色/校对后的文本',
                  },
                },
                required: ['paragraph_id', 'translated_text'],
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
        return JSON.stringify({
          success: false,
          error: statusValidation.error,
        });
      }

      // 验证参数（传入 submittedParagraphIds 用于计算剩余大小）
      const paramValidation = validateBatchArgs(
        { paragraphs },
        chunkBoundaries?.paragraphIds,
        submittedParagraphIds,
      );
      if (!paramValidation.valid || !paramValidation.resolvedIds) {
        return JSON.stringify({
          success: false,
          error: paramValidation.error || '参数验证失败',
          note: '请确保每个段落都包含有效的 paragraph_id（从 chunk 中 [ID: xxx] 获取）。',
        });
      }

      const resolvedIds = paramValidation.resolvedIds;
      const warning = paramValidation.warning;

      // 检测重复段落 ID
      const duplicateCheck = detectDuplicateParagraphIds(resolvedIds);
      if (duplicateCheck.hasDuplicates) {
        return JSON.stringify({
          success: false,
          error: ERROR_MESSAGES.DUPLICATE_PARAGRAPHS(duplicateCheck.duplicates),
          ...(warning ? { warning } : {}),
        });
      }

      // 验证段落范围
      const rangeValidation = validateParagraphsInRange(
        resolvedIds,
        chunkBoundaries?.allowedParagraphIds,
      );
      if (!rangeValidation.valid) {
        return JSON.stringify({
          success: false,
          error: rangeValidation.error,
          ...(warning ? { warning } : {}),
        });
      }

      if (!bookId) {
        return JSON.stringify({
          success: false,
          error: '未提供书籍 ID',
          ...(warning ? { warning } : {}),
        });
      }

      // 获取任务类型以确定处理方式
      const task = aiProcessingStore?.activeTasks.find((t) => t.id === taskId);
      const taskType = task?.type;
      if (!taskType) {
        return JSON.stringify({
          success: false,
          error: `无法确定任务类型，请检查任务信息。taskId=${taskId || 'unknown'}`,
          ...(warning ? { warning } : {}),
        });
      }
      if (!['translation', 'polish', 'proofreading'].includes(taskType)) {
        return JSON.stringify({
          success: false,
          error: `任务类型不支持批量提交: ${taskType}`,
          ...(warning ? { warning } : {}),
        });
      }
      // const isPolishOrProofreading = taskType === 'polish' || taskType === 'proofreading';

      // 构建处理项（将 resolvedIds 与 translated_text 配对）
      const processItems = paragraphs.map((p, i) => ({
        paragraphId: resolvedIds[i]!,
        translatedText: p.translated_text,
      }));

      // 处理批次
      const aiModelId = context.aiModelId;
      if (!aiModelId) {
        return JSON.stringify({
          success: false,
          error: '未提供 AI 模型 ID，无法写入翻译来源',
          ...(warning ? { warning } : {}),
        });
      }
      // 从任务中获取 chapterId，用于限定加载范围（性能优化）
      const chapterId = task.chapterId;
      const result = await processTranslationBatch(
        bookId,
        processItems,
        aiModelId,
        taskType as 'translation' | 'polish' | 'proofreading',
        chapterId,
      );

      if (!result.success) {
        return JSON.stringify({
          success: false,
          error: result.error,
          ...(warning ? { warning } : {}),
        });
      }

      // 将已处理的段落 ID 添加到 submittedParagraphIds 集合中（用于下次批次计算剩余大小）
      if (submittedParagraphIds) {
        for (const id of resolvedIds) {
          submittedParagraphIds.add(id);
        }
      }

      // 报告操作
      if (onAction) {
        onAction({
          type: 'update',
          entity: 'translation',
          data: {
            paragraph_id: resolvedIds[0] || '',
            translation_id: `batch_${Date.now()}`,
            old_translation: '',
            new_translation: `批量处理 ${result.processedCount} 个段落`,
          },
        });
      }

      // 构建已处理段落列表（帮助 AI 确认哪些段落已完成）
      const processedParagraphIds = resolvedIds;

      // 只有翻译任务才需要返回剩余段落信息（润色/校对任务不需要）
      const isTranslationTask = taskType === 'translation';
      let remainingParagraphIds: string[] | undefined;
      if (isTranslationTask) {
        const chunkParagraphIds = chunkBoundaries?.paragraphIds;
        if (chunkParagraphIds && chunkParagraphIds.length > 0) {
          // 使用 submittedParagraphIds（包含所有历史批次 + 当前批次）计算剩余段落
          // 而非仅用当前批次的 resolvedIds，避免 remaining_count 不随批次递减
          remainingParagraphIds = submittedParagraphIds
            ? chunkParagraphIds.filter((id) => !submittedParagraphIds.has(id))
            : chunkParagraphIds.filter((id) => !resolvedIds.includes(id));
        }
      }

      return JSON.stringify({
        success: true,
        message: `成功处理 ${result.processedCount} 个段落`,
        processed_count: result.processedCount,
        processed_paragraph_ids: processedParagraphIds,
        task_type: taskType,
        ...(isTranslationTask
          ? remainingParagraphIds && remainingParagraphIds.length > 0
            ? {
                remaining_count: remainingParagraphIds.length,
                remaining_paragraph_ids: remainingParagraphIds,
                note: '请在下次批次中使用上述 paragraph_id 继续提交。',
              }
            : { remaining_count: 0 }
          : {}),
        ...(warning ? { warning } : {}),
      });
    },
  },
];
