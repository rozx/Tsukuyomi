import type { ToolDefinition, ToolContext } from './types';
import type { AIProcessingStore } from 'src/services/ai/tasks/utils/task-types';
import { BookService } from 'src/services/book-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { generateShortId } from 'src/utils/id-generator';
import type { Paragraph, Translation } from 'src/models/novel';
import { MAX_TRANSLATION_BATCH_SIZE } from 'src/services/ai/constants';
import { useBooksStore } from 'src/stores/books';

// ============ Types ============

interface TranslationBatchItem {
  /** 段落索引（在当前 chunk 中的位置，从 0 开始） */
  index?: number;
  /** 段落 ID（可直接提交） */
  paragraph_id?: string;
  translated_text: string;
}

interface AddTranslationBatchArgs {
  paragraphs: TranslationBatchItem[];
}

// ============ Constants ============

const MAX_BATCH_SIZE = MAX_TRANSLATION_BATCH_SIZE;
const BATCH_SIZE_TOLERANCE_RATIO = 0.1;
const MAX_BATCH_SIZE_WITH_TOLERANCE = Math.ceil(MAX_BATCH_SIZE * (1 + BATCH_SIZE_TOLERANCE_RATIO));

// 错误消息常量
const ERROR_MESSAGES = {
  MISSING_IDENTIFIER: '必须提供 index 或 paragraph_id',
  MISSING_CHUNK_LIST: '提供了 index 但没有可用的 chunk 段落列表',
  INDEX_OUT_OF_RANGE: (index: number, max: number) =>
    `索引 ${index} 超出范围（有效范围: 0-${max}）`,
  EMPTY_PARAGRAPH_LIST: '段落列表不能为空',
  BATCH_SIZE_EXCEEDED: (current: number, max: number) =>
    `单次批次最多支持 ${max} 个段落，当前批次包含 ${current} 个段落`,
  BATCH_SIZE_TOLERANCE_WARNING: (current: number, max: number, allowedMax: number) =>
    `本次批次包含 ${current} 个段落，已超过限制 ${max} 个，但在容差范围内（最多 ${allowedMax} 个）。请尽量控制在限制内。`,
  EMPTY_PARAGRAPH_ITEM: (index: number) => `批次中第 ${index + 1} 个段落项为空`,
  INVALID_PARAGRAPH: (index: number, error: string) => `批次中第 ${index + 1} 个段落: ${error}`,
  MISSING_TRANSLATION: (index: number) =>
    `批次中第 ${index + 1} 个段落缺少翻译文本 (translated_text)`,
  DUPLICATE_PARAGRAPHS: (ids: string[]) => `批次中存在重复的段落 ID: ${ids.join(', ')}`,
  OUT_OF_RANGE_PARAGRAPHS: (ids: string[], count: number) =>
    `以下段落不在当前任务范围内: ${ids.slice(0, 5).join(', ')}${count > 5 ? ` 等 ${count} 个段落` : ''}`,
} as const;

/**
 * 解析段落标识符（优先 paragraph_id，其次 index）
 */
function resolveParagraphId(
  item: TranslationBatchItem,
  chunkParagraphIds?: string[],
): { id: string | null; error?: string } {
  if (item.paragraph_id && typeof item.paragraph_id === 'string') {
    return { id: item.paragraph_id };
  }
  if (typeof item.index !== 'number') {
    return { id: null, error: ERROR_MESSAGES.MISSING_IDENTIFIER };
  }
  if (!chunkParagraphIds || chunkParagraphIds.length === 0) {
    return { id: null, error: ERROR_MESSAGES.MISSING_CHUNK_LIST };
  }
  if (item.index < 0 || item.index >= chunkParagraphIds.length) {
    return {
      id: null,
      error: ERROR_MESSAGES.INDEX_OUT_OF_RANGE(item.index, chunkParagraphIds.length - 1),
    };
  }
  return { id: chunkParagraphIds[item.index]! };
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
 * 验证批次参数
 */
function validateBatchArgs(
  args: AddTranslationBatchArgs,
  chunkParagraphIds?: string[],
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

  // 检查批次大小（允许 10% 容差并给出警告）
  let warning: string | undefined;
  if (paragraphs.length > MAX_BATCH_SIZE) {
    if (paragraphs.length > MAX_BATCH_SIZE_WITH_TOLERANCE) {
      return {
        valid: false,
        error: ERROR_MESSAGES.BATCH_SIZE_EXCEEDED(paragraphs.length, MAX_BATCH_SIZE_WITH_TOLERANCE),
      };
    }
    warning = ERROR_MESSAGES.BATCH_SIZE_TOLERANCE_WARNING(
      paragraphs.length,
      MAX_BATCH_SIZE,
      MAX_BATCH_SIZE_WITH_TOLERANCE,
    );
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

    // 解析段落标识符（优先 paragraph_id，其次 index）
    const { id, error } = resolveParagraphId(item, chunkParagraphIds);
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
 * 处理批次（保存翻译）
 */
async function processTranslationBatch(
  bookId: string,
  items: Array<{ paragraphId: string; translatedText: string }>,
  aiModelId: string,
  taskType: 'translation' | 'polish' | 'proofreading',
): Promise<{ success: boolean; error?: string; processedCount: number }> {
  try {
    const book = await BookService.getBookById(bookId);
    if (!book) {
      return { success: false, error: `书籍不存在: ${bookId}`, processedCount: 0 };
    }

    if (!book.volumes) {
      return { success: false, error: '书籍缺少章节数据', processedCount: 0 };
    }

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

    // 收集所有目标段落
    const targetParagraphs: Paragraph[] = [];
    for (const volume of book.volumes) {
      for (const chapter of volume.chapters || []) {
        const foundParagraphs = chapter.content?.filter((p: Paragraph) =>
          items.some((item) => item.paragraphId === p.id),
        );
        if (foundParagraphs && foundParagraphs.length > 0) {
          targetParagraphs.push(...foundParagraphs);
        }
      }
    }

    const targetParagraphsMap = new Map(targetParagraphs.map((p) => [p.id, p]));
    const missingParagraphIds = items
      .filter((item) => !targetParagraphsMap.has(item.paragraphId))
      .map((item) => item.paragraphId);
    if (missingParagraphIds.length > 0) {
      return {
        success: false,
        error: `未找到以下段落: ${missingParagraphIds.join(', ')}`,
        processedCount: 0,
      };
    }

    // 处理每个段落
    let processedCount = 0;

    for (const item of items) {
      const paragraph = targetParagraphsMap.get(item.paragraphId);
      if (!paragraph) {
        continue;
      }

      if (taskType === 'translation') {
        // 翻译任务：总是创建新的翻译版本并设为选中
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
      } else {
        // 润色/校对任务：更新当前选中的翻译，不新增版本
        if (!paragraph.translations) {
          paragraph.translations = [];
        }

        let targetTranslation = paragraph.translations.find(
          (t) => t.id === paragraph.selectedTranslationId,
        );

        if (!targetTranslation && paragraph.translations.length > 0) {
          targetTranslation = paragraph.translations[0];
          paragraph.selectedTranslationId =
            targetTranslation?.id || paragraph.selectedTranslationId;
        }

        if (!targetTranslation) {
          targetTranslation = {
            id: generateShortId(),
            translation: item.translatedText,
            aiModelId,
          };
          paragraph.translations.push(targetTranslation);
          paragraph.selectedTranslationId = targetTranslation.id;
        } else {
          targetTranslation.translation = item.translatedText;
          targetTranslation.aiModelId = aiModelId;
        }
      }

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
        description: `批量提交段落翻译/润色/校对结果。只能在 working 状态下调用此工具！支持 index 或 paragraph_id。最多 ${MAX_BATCH_SIZE} 个段落。`,
        parameters: {
          type: 'object',
          properties: {
            paragraphs: {
              type: 'array',
              description: `段落处理结果数组，最多 ${MAX_BATCH_SIZE} 个段落。支持 index 或 paragraph_id`,
              items: {
                type: 'object',
                properties: {
                  index: {
                    type: 'number',
                    description: '段落索引（在当前 chunk 中的位置，从 0 开始）',
                  },
                  paragraph_id: {
                    type: 'string',
                    description: '段落 ID（可直接提交）',
                  },
                  translated_text: {
                    type: 'string',
                    description: '翻译/润色/校对后的文本',
                  },
                },
                required: ['translated_text'],
              },
            },
          },
          required: ['paragraphs'],
        },
      },
    },
    handler: async (args, context: ToolContext) => {
      const { bookId, onAction, chunkBoundaries, taskId, aiProcessingStore } = context;
      const { paragraphs } = args as unknown as AddTranslationBatchArgs;

      // 验证任务状态 - 只能在 working 状态下调用
      const statusValidation = validateTaskStatus(aiProcessingStore, taskId);
      if (!statusValidation.valid) {
        return JSON.stringify({
          success: false,
          error: statusValidation.error,
        });
      }

      // 验证参数（传入 chunk paragraphIds 用于解析索引）
      const paramValidation = validateBatchArgs({ paragraphs }, chunkBoundaries?.paragraphIds);
      if (!paramValidation.valid || !paramValidation.resolvedIds) {
        return JSON.stringify({
          success: false,
          error: paramValidation.error || '参数验证失败',
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
      const result = await processTranslationBatch(
        bookId,
        processItems,
        aiModelId,
        taskType as 'translation' | 'polish' | 'proofreading',
      );

      if (!result.success) {
        return JSON.stringify({
          success: false,
          error: result.error,
          ...(warning ? { warning } : {}),
        });
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

      return JSON.stringify({
        success: true,
        message: `成功处理 ${result.processedCount} 个段落`,
        processed_count: result.processedCount,
        task_type: taskType,
        ...(warning ? { warning } : {}),
      });
    },
  },
];
