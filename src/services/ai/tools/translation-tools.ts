import type { ToolDefinition, ToolContext } from './types';
import type { AIProcessingStore } from 'src/services/ai/tasks/utils/task-types';
import { BookService } from 'src/services/book-service';
import { generateShortId } from 'src/utils/id-generator';
import type { Paragraph, Translation } from 'src/models/novel';

// ============ Types ============

interface UpdateChapterTitleArgs {
  chapter_id: string;
  original_title?: string;
  translated_title: string;
}

interface TranslationBatchItem {
  paragraph_id: string;
  original_text?: string;
  translated_text: string;
}

interface AddTranslationBatchArgs {
  paragraphs: TranslationBatchItem[];
}

// ============ Constants ============

const MAX_BATCH_SIZE = 100;

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

// ============ Chapter Title Functions ============

/**
 * 验证章节是否存在
 */
async function validateChapterExists(
  bookId: string,
  chapterId: string,
): Promise<{ exists: boolean; error?: string }> {
  try {
    const book = await BookService.getBookById(bookId);
    if (!book) {
      return { exists: false, error: `书籍不存在: ${bookId}` };
    }

    // 查找章节
    let foundChapter = false;
    for (const volume of book.volumes || []) {
      const chapter = volume.chapters?.find((c) => c.id === chapterId);
      if (chapter) {
        foundChapter = true;
        break;
      }
    }

    if (!foundChapter) {
      return {
        exists: false,
        error: `章节不存在: ${chapterId}，请检查章节 ID 是否正确`,
      };
    }

    return { exists: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '未知错误';
    return { exists: false, error: `验证章节时出错: ${errorMsg}` };
  }
}

/**
 * 保存章节标题翻译
 */
async function saveChapterTitleTranslation(
  bookId: string,
  chapterId: string,
  translatedTitle: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const book = await BookService.getBookById(bookId);
    if (!book) {
      return { success: false, error: `书籍不存在: ${bookId}` };
    }

    // 查找并更新章节标题
    let chapterUpdated = false;
    for (const volume of book.volumes || []) {
      const chapter = volume.chapters?.find((c) => c.id === chapterId);
      if (chapter) {
        // 更新章节标题翻译
        if (typeof chapter.title === 'string') {
          // 如果当前是纯字符串，转换为对象格式
          chapter.title = {
            original: chapter.title,
            translation: {
              id: `trans_${Date.now()}`,
              translation: translatedTitle,
              aiModelId: 'chapter_title_translation',
            },
          };
        } else {
          // 更新现有翻译
          chapter.title.translation = {
            id: chapter.title.translation?.id || `trans_${Date.now()}`,
            translation: translatedTitle,
            aiModelId: 'chapter_title_translation',
          };
        }
        chapterUpdated = true;
        break;
      }
    }

    if (!chapterUpdated) {
      return { success: false, error: `未找到章节: ${chapterId}` };
    }

    // 保存书籍
    await BookService.saveBook(book);

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '未知错误';
    return { success: false, error: `保存标题翻译失败: ${errorMsg}` };
  }
}

// ============ Translation Batch Functions ============

/**
 * 验证批次参数
 */
function validateBatchArgs(args: AddTranslationBatchArgs): {
  valid: boolean;
  error?: string;
} {
  const { paragraphs } = args;

  // 检查空批次
  if (!paragraphs || !Array.isArray(paragraphs) || paragraphs.length === 0) {
    return {
      valid: false,
      error: '段落列表不能为空',
    };
  }

  // 检查批次大小
  if (paragraphs.length > MAX_BATCH_SIZE) {
    return {
      valid: false,
      error: `单次批次最多支持 ${MAX_BATCH_SIZE} 个段落，当前批次包含 ${paragraphs.length} 个段落`,
    };
  }

  // 检查每个段落项
  for (let i = 0; i < paragraphs.length; i++) {
    const item = paragraphs[i];
    if (!item) {
      return {
        valid: false,
        error: `批次中第 ${i + 1} 个段落项为空`,
      };
    }

    if (!item.paragraph_id || typeof item.paragraph_id !== 'string') {
      return {
        valid: false,
        error: `批次中第 ${i + 1} 个段落缺少段落 ID (paragraph_id)`,
      };
    }

    if (!item.translated_text || typeof item.translated_text !== 'string') {
      return {
        valid: false,
        error: `批次中第 ${i + 1} 个段落缺少翻译文本 (translated_text)`,
      };
    }
  }

  return { valid: true };
}

/**
 * 检测重复的段落 ID
 */
function detectDuplicateParagraphIds(paragraphs: TranslationBatchItem[]): {
  hasDuplicates: boolean;
  duplicates: string[];
} {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const item of paragraphs) {
    if (seen.has(item.paragraph_id)) {
      if (!duplicates.includes(item.paragraph_id)) {
        duplicates.push(item.paragraph_id);
      }
    } else {
      seen.add(item.paragraph_id);
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
      error: `以下段落不在当前任务范围内: ${invalidIds.slice(0, 5).join(', ')}${invalidIds.length > 5 ? ` 等 ${invalidIds.length} 个段落` : ''}`,
    };
  }

  return { valid: true };
}

/**
 * 处理批次（保存翻译）
 */
async function processTranslationBatch(
  bookId: string,
  paragraphs: TranslationBatchItem[],
  aiModelId: string,
  isPolishOrProofreading: boolean,
): Promise<{ success: boolean; error?: string; processedCount: number }> {
  try {
    const book = await BookService.getBookById(bookId);
    if (!book) {
      return { success: false, error: `书籍不存在: ${bookId}`, processedCount: 0 };
    }

    // 收集所有目标段落
    const targetParagraphs: Paragraph[] = [];
    for (const volume of book.volumes || []) {
      for (const chapter of volume.chapters || []) {
        const foundParagraphs = chapter.content?.filter((p: Paragraph) =>
          paragraphs.some((item) => item.paragraph_id === p.id),
        );
        if (foundParagraphs && foundParagraphs.length > 0) {
          targetParagraphs.push(...foundParagraphs);
        }
      }
    }

    // 处理每个段落
    let processedCount = 0;

    for (const item of paragraphs) {
      const paragraph = targetParagraphs.find((p) => p.id === item.paragraph_id);
      if (!paragraph) {
        console.warn(`[translation-tools] 未找到段落: ${item.paragraph_id}`);
        continue;
      }

      if (isPolishOrProofreading) {
        // 润色/校对任务：更新当前选中的翻译
        if (paragraph.selectedTranslationId) {
          const selectedTranslation = paragraph.translations?.find(
            (t) => t.id === paragraph.selectedTranslationId,
          );
          if (selectedTranslation) {
            selectedTranslation.translation = item.translated_text;
            selectedTranslation.aiModelId = aiModelId;
          } else {
            // 如果没有找到选中的翻译，创建一个新的
            const newTranslation: Translation = {
              id: generateShortId(),
              translation: item.translated_text,
              aiModelId,
            };
            paragraph.translations = paragraph.translations || [];
            paragraph.translations.push(newTranslation);
            paragraph.selectedTranslationId = newTranslation.id;
          }
        } else {
          // 如果没有选中的翻译，创建一个新的
          const newTranslation: Translation = {
            id: generateShortId(),
            translation: item.translated_text,
            aiModelId,
          };
          paragraph.translations = paragraph.translations || [];
          paragraph.translations.push(newTranslation);
          paragraph.selectedTranslationId = newTranslation.id;
        }
      } else {
        // 翻译任务：创建新的翻译版本并设为选中
        const newTranslation: Translation = {
          id: generateShortId(),
          translation: item.translated_text,
          aiModelId,
        };

        if (!paragraph.translations) {
          paragraph.translations = [];
        }
        paragraph.translations.push(newTranslation);
        paragraph.selectedTranslationId = newTranslation.id;
      }

      processedCount++;
    }

    // 保存书籍
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
        name: 'update_chapter_title',
        description:
          '更新章节的标题翻译。使用此工具提交章节标题的翻译结果。只能在 working 状态下调用。',
        parameters: {
          type: 'object',
          properties: {
            chapter_id: {
              type: 'string',
              description: '章节的唯一标识符 ID',
            },
            original_title: {
              type: 'string',
              description: '原标题（可选，用于确认）',
            },
            translated_title: {
              type: 'string',
              description: '翻译后的标题',
            },
          },
          required: ['chapter_id', 'translated_title'],
        },
      },
    },
    handler: async (args, context: ToolContext) => {
      const { bookId, onAction, taskId, aiProcessingStore } = context;
      const { chapter_id, original_title, translated_title } = args as UpdateChapterTitleArgs;

      // 验证任务状态 - 只能在 working 状态下调用
      const statusValidation = validateTaskStatus(aiProcessingStore, taskId);
      if (!statusValidation.valid) {
        return JSON.stringify({
          success: false,
          error: statusValidation.error,
        });
      }

      // 验证参数
      if (!chapter_id || typeof chapter_id !== 'string') {
        return JSON.stringify({
          success: false,
          error: '缺少章节 ID (chapter_id)',
        });
      }

      if (!translated_title || typeof translated_title !== 'string') {
        return JSON.stringify({
          success: false,
          error: '缺少标题翻译 (translated_title)',
        });
      }

      if (!bookId) {
        return JSON.stringify({
          success: false,
          error: '未提供书籍 ID',
        });
      }

      // 验证章节存在性
      const validation = await validateChapterExists(bookId, chapter_id);
      if (!validation.exists) {
        return JSON.stringify({
          success: false,
          error: validation.error,
        });
      }

      // 保存标题翻译
      const saveResult = await saveChapterTitleTranslation(bookId, chapter_id, translated_title);

      if (!saveResult.success) {
        return JSON.stringify({
          success: false,
          error: saveResult.error,
        });
      }

      // 报告操作
      if (onAction) {
        onAction({
          type: 'update',
          entity: 'chapter',
          data: {
            chapter_id,
            old_title: original_title || '',
            new_title: translated_title,
          },
        });
      }

      return JSON.stringify({
        success: true,
        message: `章节标题已更新: ${translated_title}`,
        chapter_id,
        translated_title,
      });
    },
  },

  {
    definition: {
      type: 'function',
      function: {
        name: 'add_translation_batch',
        description:
          '批量提交段落翻译/润色/校对结果。使用此工具一次性提交多个段落的处理结果。只能在 working 状态下调用。批次操作是原子性的：要么全部成功，要么全部失败。',
        parameters: {
          type: 'object',
          properties: {
            paragraphs: {
              type: 'array',
              description: `段落处理结果数组，最多 ${MAX_BATCH_SIZE} 个段落`,
              items: {
                type: 'object',
                properties: {
                  paragraph_id: {
                    type: 'string',
                    description: '段落的唯一标识符 ID',
                  },
                  original_text: {
                    type: 'string',
                    description: '原文（可选，用于确认）',
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
      const { bookId, onAction, chunkBoundaries, taskId, aiProcessingStore } = context;
      const { paragraphs } = args as AddTranslationBatchArgs;

      // 验证任务状态 - 只能在 working 状态下调用
      const statusValidation = validateTaskStatus(aiProcessingStore, taskId);
      if (!statusValidation.valid) {
        return JSON.stringify({
          success: false,
          error: statusValidation.error,
        });
      }

      // 验证参数
      const paramValidation = validateBatchArgs({ paragraphs });
      if (!paramValidation.valid) {
        return JSON.stringify({
          success: false,
          error: paramValidation.error,
        });
      }

      // 检测重复段落 ID
      const duplicateCheck = detectDuplicateParagraphIds(paragraphs);
      if (duplicateCheck.hasDuplicates) {
        return JSON.stringify({
          success: false,
          error: `批次中存在重复的段落 ID: ${duplicateCheck.duplicates.join(', ')}`,
        });
      }

      // 验证段落范围
      const paragraphIds = paragraphs.map((p) => p.paragraph_id);
      const rangeValidation = validateParagraphsInRange(
        paragraphIds,
        chunkBoundaries?.allowedParagraphIds,
      );
      if (!rangeValidation.valid) {
        return JSON.stringify({
          success: false,
          error: rangeValidation.error,
        });
      }

      if (!bookId) {
        return JSON.stringify({
          success: false,
          error: '未提供书籍 ID',
        });
      }

      // 获取任务类型以确定处理方式
      const task = aiProcessingStore?.activeTasks.find(
        (t: { id: string; type?: string }) => t.id === taskId,
      );
      const taskType = task?.type;
      const isPolishOrProofreading = taskType === 'polish' || taskType === 'proofreading';

      // 处理批次
      const result = await processTranslationBatch(
        bookId,
        paragraphs,
        taskId || 'unknown',
        isPolishOrProofreading,
      );

      if (!result.success) {
        return JSON.stringify({
          success: false,
          error: result.error,
        });
      }

      // 报告操作
      if (onAction) {
        onAction({
          type: 'update',
          entity: 'translation',
          data: {
            paragraph_id: paragraphIds[0] || '',
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
      });
    },
  },
];
