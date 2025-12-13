import { ChapterService, type ParagraphSearchResult } from 'src/services/chapter-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { useBooksStore } from 'src/stores/books';
import { useAIModelsStore } from 'src/stores/ai-models';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';
import { isEmptyOrSymbolOnly } from 'src/utils/text-utils';
import { UniqueIdGenerator } from 'src/utils/id-generator';
import { normalizeTranslationQuotes } from 'src/utils/translation-normalizer';
import type { Translation } from 'src/models/novel';
import type { ToolDefinition } from './types';

export const paragraphTools: ToolDefinition[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_paragraph_info',
        description:
          '获取段落的详细信息，包括原文、所有翻译版本、选中的翻译等。当需要了解当前段落的完整信息时使用此工具。',
        parameters: {
          type: 'object',
          properties: {
            paragraph_id: {
              type: 'string',
              description: '段落 ID',
            },
          },
          required: ['paragraph_id'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { paragraph_id } = args;
      if (!paragraph_id) {
        throw new Error('段落 ID 不能为空');
      }

      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      // 使用优化的异步查找方法，按需加载章节内容（只加载包含目标段落的章节）
      const location = await ChapterService.findParagraphLocationAsync(book, paragraph_id);
      if (!location) {
        return JSON.stringify({
          success: false,
          error: `段落不存在: ${paragraph_id}`,
        });
      }

      const { paragraph, chapter, volume } = location;
      const chapterTitle = getChapterDisplayTitle(chapter);

      // 报告读取操作
      if (onAction) {
        onAction({
          type: 'read',
          entity: 'paragraph',
          data: {
            paragraph_id,
            chapter_id: chapter.id,
            chapter_title: chapterTitle,
            tool_name: 'get_paragraph_info',
          },
        });
      }

      // 构建翻译信息（包含 aiModelId）
      const aiModelsStore = useAIModelsStore();
      const translations =
        paragraph.translations?.map((t) => ({
          id: t.id,
          translation: t.translation,
          aiModelId: t.aiModelId,
          aiModelName: aiModelsStore.getModelById(t.aiModelId)?.name || '未知模型',
          isSelected: t.id === paragraph.selectedTranslationId,
        })) || [];

      return JSON.stringify({
        success: true,
        paragraph: {
          id: paragraph.id,
          text: paragraph.text,
          selectedTranslationId: paragraph.selectedTranslationId || '',
          translations,
          chapter: {
            id: chapter.id,
            title: chapterTitle,
            title_original:
              typeof chapter.title === 'string' ? chapter.title : chapter.title.original,
            title_translation:
              typeof chapter.title === 'string' ? '' : chapter.title.translation?.translation || '',
          },
          volume: volume
            ? {
                id: volume.id,
                title:
                  typeof volume.title === 'string' ? volume.title : volume.title.original || '',
                title_translation:
                  typeof volume.title === 'string'
                    ? ''
                    : volume.title.translation?.translation || '',
              }
            : null,
          paragraphIndex: location.paragraphIndex,
          chapterIndex: location.chapterIndex,
          volumeIndex: location.volumeIndex,
        },
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_previous_paragraphs',
        description:
          '获取指定段落之前的若干个段落。用于查看当前段落之前的上下文，帮助理解文本的连贯性。',
        parameters: {
          type: 'object',
          properties: {
            paragraph_id: {
              type: 'string',
              description: '段落 ID（当前段落的 ID）',
            },
            count: {
              type: 'number',
              description: '要获取的段落数量（默认 3）',
            },
          },
          required: ['paragraph_id'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { paragraph_id, count = 3 } = args;
      if (!paragraph_id) {
        throw new Error('段落 ID 不能为空');
      }

      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      // 报告读取操作
      if (onAction) {
        onAction({
          type: 'read',
          entity: 'paragraph',
          data: {
            paragraph_id,
            tool_name: 'get_previous_paragraphs',
          },
        });
      }

      // 使用优化的异步方法，按需加载章节内容
      const results = await ChapterService.getPreviousParagraphsAsync(book, paragraph_id, count);

      // 过滤掉空段落或仅包含符号的段落
      const validResults = results.filter((result) => !isEmptyOrSymbolOnly(result.paragraph.text));

      return JSON.stringify({
        success: true,
        paragraphs: validResults.map((result) => ({
          id: result.paragraph.id,
          text: result.paragraph.text,
          translation:
            result.paragraph.translations.find(
              (t) => t.id === result.paragraph.selectedTranslationId,
            )?.translation ||
            result.paragraph.translations[0]?.translation ||
            '',
          chapter: {
            id: result.chapter.id,
            title: result.chapter.title.original,
            title_translation: result.chapter.title.translation?.translation || '',
          },
          volume: {
            id: result.volume.id,
            title: result.volume.title.original,
            title_translation: result.volume.title.translation?.translation || '',
          },
          paragraph_index: result.paragraphIndex,
          chapter_index: result.chapterIndex,
          volume_index: result.volumeIndex,
        })),
        count: validResults.length,
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_next_paragraphs',
        description:
          '获取指定段落之后的若干个段落。用于查看当前段落之后的上下文，帮助理解文本的连贯性。',
        parameters: {
          type: 'object',
          properties: {
            paragraph_id: {
              type: 'string',
              description: '段落 ID（当前段落的 ID）',
            },
            count: {
              type: 'number',
              description: '要获取的段落数量（默认 3）',
            },
          },
          required: ['paragraph_id'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { paragraph_id, count = 3 } = args;
      if (!paragraph_id) {
        throw new Error('段落 ID 不能为空');
      }

      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      // 报告读取操作
      if (onAction) {
        onAction({
          type: 'read',
          entity: 'paragraph',
          data: {
            paragraph_id,
            tool_name: 'get_next_paragraphs',
          },
        });
      }

      // 使用优化的异步方法，按需加载章节内容
      const results = await ChapterService.getNextParagraphsAsync(book, paragraph_id, count);

      // 过滤掉空段落或仅包含符号的段落
      const validResults = results.filter((result) => !isEmptyOrSymbolOnly(result.paragraph.text));

      return JSON.stringify({
        success: true,
        paragraphs: validResults.map((result) => ({
          id: result.paragraph.id,
          text: result.paragraph.text,
          translation:
            result.paragraph.translations.find(
              (t) => t.id === result.paragraph.selectedTranslationId,
            )?.translation ||
            result.paragraph.translations[0]?.translation ||
            '',
          chapter: {
            id: result.chapter.id,
            title: result.chapter.title.original,
            title_translation: result.chapter.title.translation?.translation || '',
          },
          volume: {
            id: result.volume.id,
            title: result.volume.title.original,
            title_translation: result.volume.title.translation?.translation || '',
          },
          paragraph_index: result.paragraphIndex,
          chapter_index: result.chapterIndex,
          volume_index: result.volumeIndex,
        })),
        count: validResults.length,
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'find_paragraph_by_keywords',
        description:
          '根据多个关键词查找包含任一关键词的段落。用于在翻译过程中查找特定内容或验证翻译的一致性。支持多个关键词，返回包含任一关键词的段落（OR 逻辑）。',
        parameters: {
          type: 'object',
          properties: {
            keywords: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: '搜索关键词数组（返回包含任一关键词的段落）',
            },
            chapter_id: {
              type: 'string',
              description: '可选的章节 ID，如果提供则仅在该章节内搜索（不搜索其他章节）',
            },
            max_paragraphs: {
              type: 'number',
              description: '可选的最大返回段落数量（默认 1）',
            },
            only_with_translation: {
              type: 'boolean',
              description:
                '是否只返回有翻译的段落（默认 false）。当设置为 true 时，只返回已翻译的段落，用于查看之前如何翻译某个关键词，确保翻译一致性。',
            },
          },
          required: ['keywords'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { keywords, chapter_id, max_paragraphs = 1, only_with_translation = false } = args;
      if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        throw new Error('关键词数组不能为空');
      }

      // 过滤掉空字符串
      const validKeywords = keywords.filter(
        (k) => k && typeof k === 'string' && k.trim().length > 0,
      );
      if (validKeywords.length === 0) {
        throw new Error('关键词数组不能为空');
      }

      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      // 报告读取操作
      if (onAction) {
        onAction({
          type: 'read',
          entity: 'paragraph',
          data: {
            tool_name: 'find_paragraph_by_keywords',
          },
        });
      }

      // 对每个关键词进行搜索，然后合并结果并去重
      const allResults: Map<string, ParagraphSearchResult> = new Map();

      for (const keyword of validKeywords) {
        // 使用优化的异步方法，按需加载章节内容（只加载需要搜索的章节）
        const results = await ChapterService.searchParagraphsByKeywordAsync(
          book,
          keyword,
          chapter_id,
          max_paragraphs * validKeywords.length, // 增加搜索数量以应对去重
          only_with_translation,
        );

        // 将结果添加到 Map 中，使用段落 ID 作为 key 去重
        for (const result of results) {
          if (!allResults.has(result.paragraph.id)) {
            allResults.set(result.paragraph.id, result);
          }
        }

        // 如果已经收集到足够的段落，提前停止
        if (allResults.size >= max_paragraphs) {
          break;
        }
      }

      // 转换为数组并限制数量
      const results = Array.from(allResults.values()).slice(0, max_paragraphs);

      // 过滤掉空段落或仅包含符号的段落
      const validResults = results.filter((result) => !isEmptyOrSymbolOnly(result.paragraph.text));

      return JSON.stringify({
        success: true,
        paragraphs: validResults.map((result) => ({
          id: result.paragraph.id,
          text: result.paragraph.text,
          translation:
            result.paragraph.translations.find(
              (t) => t.id === result.paragraph.selectedTranslationId,
            )?.translation ||
            result.paragraph.translations[0]?.translation ||
            '',
          chapter: {
            id: result.chapter.id,
            title: result.chapter.title.original,
            title_translation: result.chapter.title.translation?.translation || '',
          },
          volume: {
            id: result.volume.id,
            title: result.volume.title.original,
            title_translation: result.volume.title.translation?.translation || '',
          },
          paragraph_index: result.paragraphIndex,
          chapter_index: result.chapterIndex,
          volume_index: result.volumeIndex,
        })),
        count: validResults.length,
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'search_paragraphs_by_regex',
        description:
          '使用正则表达式搜索段落。支持在原文或翻译文本中搜索，可以匹配复杂的文本模式。用于查找符合特定模式的段落，例如查找包含特定格式的文本、数字模式、特定字符组合等。',
        parameters: {
          type: 'object',
          properties: {
            regex_pattern: {
              type: 'string',
              description: '正则表达式模式（字符串格式）。例如："\\d+年" 匹配包含数字和"年"的文本，"[あ-ん]+" 匹配平假名等。',
            },
            chapter_id: {
              type: 'string',
              description: '可选的章节 ID，如果提供则仅在该章节内搜索（不搜索其他章节）',
            },
            max_paragraphs: {
              type: 'number',
              description: '可选的最大返回段落数量（默认 1）',
            },
            only_with_translation: {
              type: 'boolean',
              description:
                '是否只返回有翻译的段落（默认 false）。当设置为 true 时，只返回已翻译的段落。',
            },
            search_in_translation: {
              type: 'boolean',
              description:
                '是否在翻译文本中搜索（默认 false）。当设置为 true 时，在翻译文本中搜索；当设置为 false 时，在原文中搜索。',
            },
          },
          required: ['regex_pattern'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const {
        regex_pattern,
        chapter_id,
        max_paragraphs = 1,
        only_with_translation = false,
        search_in_translation = false,
      } = args;
      if (!regex_pattern || typeof regex_pattern !== 'string' || regex_pattern.trim().length === 0) {
        throw new Error('正则表达式模式不能为空');
      }

      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      // 验证正则表达式是否有效
      try {
        new RegExp(regex_pattern.trim());
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: `无效的正则表达式模式: ${error instanceof Error ? error.message : String(error)}`,
        });
      }

      // 报告读取操作
      if (onAction) {
        onAction({
          type: 'read',
          entity: 'paragraph',
          data: {
            tool_name: 'search_paragraphs_by_regex',
            regex_pattern: regex_pattern.trim(),
          },
        });
      }

      // 使用优化的异步方法，按需加载章节内容
      const results = await ChapterService.searchParagraphsByRegexAsync(
        book,
        regex_pattern.trim(),
        chapter_id,
        max_paragraphs,
        only_with_translation,
        search_in_translation,
      );

      // 过滤掉空段落或仅包含符号的段落
      const validResults = results.filter((result) => !isEmptyOrSymbolOnly(result.paragraph.text));

      return JSON.stringify({
        success: true,
        paragraphs: validResults.map((result) => ({
          id: result.paragraph.id,
          text: result.paragraph.text,
          translation:
            result.paragraph.translations.find(
              (t) => t.id === result.paragraph.selectedTranslationId,
            )?.translation ||
            result.paragraph.translations[0]?.translation ||
            '',
          chapter: {
            id: result.chapter.id,
            title: result.chapter.title.original,
            title_translation: result.chapter.title.translation?.translation || '',
          },
          volume: {
            id: result.volume.id,
            title: result.volume.title.original,
            title_translation: result.volume.title.translation?.translation || '',
          },
          paragraph_index: result.paragraphIndex,
          chapter_index: result.chapterIndex,
          volume_index: result.volumeIndex,
        })),
        count: validResults.length,
        regex_pattern: regex_pattern.trim(),
        search_in_translation,
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_translation_history',
        description:
          '获取段落的完整翻译历史。返回该段落的所有翻译版本，包括翻译ID、翻译内容、使用的AI模型等信息。用于查看段落的翻译历史记录。',
        parameters: {
          type: 'object',
          properties: {
            paragraph_id: {
              type: 'string',
              description: '段落 ID',
            },
          },
          required: ['paragraph_id'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { paragraph_id } = args;
      if (!paragraph_id) {
        throw new Error('段落 ID 不能为空');
      }

      const booksStore = useBooksStore();
      const aiModelsStore = useAIModelsStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      // 使用优化的异步查找方法，按需加载章节内容（只加载包含目标段落的章节）
      const location = await ChapterService.findParagraphLocationAsync(book, paragraph_id);
      if (!location) {
        return JSON.stringify({
          success: false,
          error: `段落不存在: ${paragraph_id}`,
        });
      }

      const { paragraph } = location;

      // 报告读取操作
      if (onAction) {
        onAction({
          type: 'read',
          entity: 'paragraph',
          data: {
            paragraph_id,
            tool_name: 'get_translation_history',
          },
        });
      }

      // 构建完整的翻译历史信息
      const translationHistory =
        paragraph.translations?.map((t, index) => ({
          id: t.id,
          translation: t.translation,
          aiModelId: t.aiModelId,
          aiModelName: aiModelsStore.getModelById(t.aiModelId)?.name || '未知模型',
          isSelected: t.id === paragraph.selectedTranslationId,
          index: index + 1, // 从1开始的索引
          isLatest: index === (paragraph.translations?.length || 0) - 1, // 是否是最新的翻译
        })) || [];

      return JSON.stringify({
        success: true,
        paragraph_id: paragraph.id,
        paragraph_text: paragraph.text,
        selected_translation_id: paragraph.selectedTranslationId || '',
        translation_history: translationHistory,
        total_count: translationHistory.length,
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'update_translation',
        description:
          '更新段落中指定翻译版本的内容。用于编辑和修正翻译历史中的某个翻译版本。更新后，该翻译版本的内容会被修改，但ID和AI模型信息保持不变。',
        parameters: {
          type: 'object',
          properties: {
            paragraph_id: {
              type: 'string',
              description: '段落 ID',
            },
            translation_id: {
              type: 'string',
              description: '要更新的翻译 ID（必须是该段落翻译历史中存在的翻译ID）',
            },
            new_translation: {
              type: 'string',
              description: '新的翻译内容',
            },
          },
          required: ['paragraph_id', 'translation_id', 'new_translation'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { paragraph_id, translation_id, new_translation } = args;
      if (!paragraph_id || !translation_id || !new_translation) {
        throw new Error('段落 ID、翻译 ID 和新翻译内容不能为空');
      }

      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      // 使用优化的异步查找方法，按需加载章节内容（只加载包含目标段落的章节）
      const location = await ChapterService.findParagraphLocationAsync(book, paragraph_id);
      if (!location) {
        return JSON.stringify({
          success: false,
          error: `段落不存在: ${paragraph_id}`,
        });
      }

      const { paragraph } = location;

      // 查找要更新的翻译
      if (!paragraph.translations || paragraph.translations.length === 0) {
        return JSON.stringify({
          success: false,
          error: `段落没有翻译历史`,
        });
      }

      const translationIndex = paragraph.translations.findIndex((t) => t.id === translation_id);
      if (translationIndex === -1) {
        return JSON.stringify({
          success: false,
          error: `翻译 ID 不存在: ${translation_id}`,
        });
      }

      // 保存原始翻译用于撤销
      const translationToUpdate = paragraph.translations[translationIndex];
      if (!translationToUpdate) {
        return JSON.stringify({
          success: false,
          error: `无法找到要更新的翻译`,
        });
      }
      const originalTranslation = { ...translationToUpdate };

      // 更新翻译内容
      translationToUpdate.translation = new_translation.trim();

      // 更新书籍（保存更改）
      await booksStore.updateBook(bookId, { volumes: book.volumes });

      // 报告操作
      if (onAction) {
        onAction({
          type: 'update',
          entity: 'translation',
          data: {
            paragraph_id,
            translation_id,
            old_translation: originalTranslation.translation,
            new_translation: new_translation.trim(),
          },
          previousData: originalTranslation,
        });
      }

      return JSON.stringify({
        success: true,
        message: '翻译已更新',
        paragraph_id,
        translation_id,
        old_translation: originalTranslation.translation,
        new_translation: new_translation.trim(),
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'select_translation',
        description:
          '选择段落中的某个翻译版本作为当前选中的翻译。用于在翻译历史中切换不同的翻译版本，将指定的翻译版本设置为段落当前使用的翻译。',
        parameters: {
          type: 'object',
          properties: {
            paragraph_id: {
              type: 'string',
              description: '段落 ID',
            },
            translation_id: {
              type: 'string',
              description: '要选择的翻译 ID（必须是该段落翻译历史中存在的翻译ID）',
            },
          },
          required: ['paragraph_id', 'translation_id'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { paragraph_id, translation_id } = args;
      if (!paragraph_id || !translation_id) {
        throw new Error('段落 ID 和翻译 ID 不能为空');
      }

      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      // 使用优化的异步查找方法，按需加载章节内容（只加载包含目标段落的章节）
      const location = await ChapterService.findParagraphLocationAsync(book, paragraph_id);
      if (!location) {
        return JSON.stringify({
          success: false,
          error: `段落不存在: ${paragraph_id}`,
        });
      }

      const { paragraph } = location;

      // 报告读取操作（选择翻译也是一种读取操作）
      if (onAction) {
        onAction({
          type: 'read',
          entity: 'translation',
          data: {
            paragraph_id,
            translation_id,
            tool_name: 'select_translation',
          },
        });
      }

      // 验证翻译ID是否存在
      if (!paragraph.translations || paragraph.translations.length === 0) {
        return JSON.stringify({
          success: false,
          error: `段落没有翻译历史`,
        });
      }

      const translation = paragraph.translations.find((t) => t.id === translation_id);
      if (!translation) {
        return JSON.stringify({
          success: false,
          error: `翻译 ID 不存在: ${translation_id}`,
        });
      }

      // 保存原始选中的翻译ID
      const originalSelectedId = paragraph.selectedTranslationId || '';

      // 更新选中的翻译ID
      paragraph.selectedTranslationId = translation_id;

      // 更新书籍（保存更改）
      await booksStore.updateBook(bookId, { volumes: book.volumes });

      return JSON.stringify({
        success: true,
        message: '翻译已选择',
        paragraph_id,
        translation_id,
        previous_selected_id: originalSelectedId || null,
        selected_translation: translation.translation,
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'add_translation',
        description:
          '为段落添加新的翻译版本。用于在段落中添加新的翻译内容，新翻译会被添加到翻译历史中。如果段落已有5个翻译版本，最旧的翻译会被自动删除。',
        parameters: {
          type: 'object',
          properties: {
            paragraph_id: {
              type: 'string',
              description: '段落 ID',
            },
            translation: {
              type: 'string',
              description: '新的翻译内容',
            },
            ai_model_id: {
              type: 'string',
              description: 'AI 模型 ID（可选，如果不提供则使用当前默认模型）',
            },
            set_as_selected: {
              type: 'boolean',
              description: '是否将新翻译设置为当前选中的翻译（默认 true）',
            },
          },
          required: ['paragraph_id', 'translation'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { paragraph_id, translation, ai_model_id, set_as_selected = true } = args;
      if (!paragraph_id || !translation) {
        throw new Error('段落 ID 和翻译内容不能为空');
      }

      const booksStore = useBooksStore();
      const aiModelsStore = useAIModelsStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      // 使用优化的异步查找方法，按需加载章节内容（只加载包含目标段落的章节）
      const location = await ChapterService.findParagraphLocationAsync(book, paragraph_id);
      if (!location) {
        return JSON.stringify({
          success: false,
          error: `段落不存在: ${paragraph_id}`,
        });
      }

      const { paragraph } = location;

      // 确定使用的 AI 模型 ID
      let modelId = ai_model_id;
      if (!modelId) {
        // 如果没有提供，尝试使用段落中已有的翻译的模型 ID，或使用默认模型
        const existingModelId = paragraph.translations?.[0]?.aiModelId;
        if (existingModelId) {
          modelId = existingModelId;
        } else {
          const defaultModel = aiModelsStore.getDefaultModelForTask('translation');
          if (!defaultModel) {
            return JSON.stringify({
              success: false,
              error: '未找到可用的 AI 模型，请提供 ai_model_id 参数',
            });
          }
          modelId = defaultModel.id;
        }
      }

      // 验证模型是否存在
      const model = aiModelsStore.getModelById(modelId);
      if (!model) {
        return JSON.stringify({
          success: false,
          error: `AI 模型不存在: ${modelId}`,
        });
      }

      // 创建新的翻译对象
      const existingTranslationIds = paragraph.translations?.map((t) => t.id) || [];
      const idGenerator = new UniqueIdGenerator(existingTranslationIds);
      const newTranslation: Translation = {
        id: idGenerator.generate(),
        translation: normalizeTranslationQuotes(translation.trim()),
        aiModelId: modelId,
      };

      // 添加翻译（使用 ChapterService 的辅助方法，自动限制最多5个）
      const existingTranslations = paragraph.translations || [];
      const updatedTranslations = ChapterService.addParagraphTranslation(
        existingTranslations,
        newTranslation,
      );

      // 更新段落的翻译数组
      paragraph.translations = updatedTranslations;

      // 如果设置为选中，更新选中的翻译 ID
      if (set_as_selected) {
        paragraph.selectedTranslationId = newTranslation.id;
      } else if (!paragraph.selectedTranslationId && updatedTranslations.length > 0) {
        // 如果没有选中的翻译，且新添加的翻译是第一个，则自动选中
        paragraph.selectedTranslationId = updatedTranslations[0]?.id || '';
      }

      // 更新书籍（保存更改）
      await booksStore.updateBook(bookId, { volumes: book.volumes });

      // 报告操作
      if (onAction) {
        onAction({
          type: 'create',
          entity: 'translation',
          data: {
            paragraph_id,
            translation_id: newTranslation.id,
            old_translation: '',
            new_translation: newTranslation.translation,
          },
        });
      }

      return JSON.stringify({
        success: true,
        message: '翻译已添加',
        paragraph_id,
        translation_id: newTranslation.id,
        translation: newTranslation.translation,
        ai_model_id: modelId,
        ai_model_name: model.name,
        is_selected: set_as_selected,
        total_translations: updatedTranslations.length,
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'remove_translation',
        description:
          '从段落中删除指定的翻译版本。用于清理不需要的翻译历史记录。如果删除的是当前选中的翻译，会自动选择其他翻译（优先选择最新的翻译）。',
        parameters: {
          type: 'object',
          properties: {
            paragraph_id: {
              type: 'string',
              description: '段落 ID',
            },
            translation_id: {
              type: 'string',
              description: '要删除的翻译 ID（必须是该段落翻译历史中存在的翻译ID）',
            },
          },
          required: ['paragraph_id', 'translation_id'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { paragraph_id, translation_id } = args;
      if (!paragraph_id || !translation_id) {
        throw new Error('段落 ID 和翻译 ID 不能为空');
      }

      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      // 使用优化的异步查找方法，按需加载章节内容（只加载包含目标段落的章节）
      const location = await ChapterService.findParagraphLocationAsync(book, paragraph_id);
      if (!location) {
        return JSON.stringify({
          success: false,
          error: `段落不存在: ${paragraph_id}`,
        });
      }

      const { paragraph } = location;

      // 验证翻译是否存在
      if (!paragraph.translations || paragraph.translations.length === 0) {
        return JSON.stringify({
          success: false,
          error: `段落没有翻译历史`,
        });
      }

      const translationIndex = paragraph.translations.findIndex((t) => t.id === translation_id);
      if (translationIndex === -1) {
        return JSON.stringify({
          success: false,
          error: `翻译 ID 不存在: ${translation_id}`,
        });
      }

      // 保存要删除的翻译信息用于报告
      const translationToDelete = paragraph.translations[translationIndex];
      if (!translationToDelete) {
        return JSON.stringify({
          success: false,
          error: `无法找到要删除的翻译`,
        });
      }

      const wasSelected = paragraph.selectedTranslationId === translation_id;

      // 删除翻译
      paragraph.translations.splice(translationIndex, 1);

      // 如果删除的是选中的翻译，需要重新选择
      if (wasSelected) {
        if (paragraph.translations.length > 0) {
          // 优先选择最新的翻译（数组最后一个）
          paragraph.selectedTranslationId =
            paragraph.translations[paragraph.translations.length - 1]?.id || '';
        } else {
          // 如果没有翻译了，清空选中的翻译 ID
          paragraph.selectedTranslationId = '';
        }
      }

      // 更新书籍（保存更改）
      await booksStore.updateBook(bookId, { volumes: book.volumes });

      // 报告操作
      if (onAction) {
        onAction({
          type: 'delete',
          entity: 'translation',
          data: {
            paragraph_id,
            translation_id,
            old_translation: translationToDelete.translation,
            new_translation: '',
          },
        });
      }

      return JSON.stringify({
        success: true,
        message: '翻译已删除',
        paragraph_id,
        translation_id,
        deleted_translation: translationToDelete.translation,
        was_selected: wasSelected,
        new_selected_id: paragraph.selectedTranslationId || null,
        remaining_translations: paragraph.translations.length,
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'batch_replace_translations',
        description:
          '批量替换段落翻译。根据关键词在翻译文本中查找段落，并将匹配段落的翻译替换为新的翻译文本。用于批量修正翻译中的错误或统一翻译风格。',
        parameters: {
          type: 'object',
          properties: {
            keywords: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: '关键词数组，用于在翻译文本中搜索包含任一关键词的段落（OR 逻辑）',
            },
            replacement_text: {
              type: 'string',
              description: '新的翻译文本，用于替换匹配段落的翻译',
            },
            chapter_id: {
              type: 'string',
              description: '可选的章节 ID，如果提供则仅在该章节内搜索和替换（不处理其他章节）',
            },
            replace_all_translations: {
              type: 'boolean',
              description:
                '是否替换所有翻译版本（默认 false）。如果为 true，则替换段落的所有翻译版本；如果为 false，则只替换当前选中的翻译版本。',
            },
            max_replacements: {
              type: 'number',
              description:
                '可选的最大替换数量（默认 100）。用于限制一次操作替换的段落数量，避免意外替换过多内容。',
            },
          },
          required: ['keywords', 'replacement_text'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const {
        keywords,
        replacement_text,
        chapter_id,
        replace_all_translations = false,
        max_replacements = 100,
      } = args;
      if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        throw new Error('关键词数组不能为空');
      }
      if (!replacement_text || typeof replacement_text !== 'string') {
        throw new Error('替换文本不能为空');
      }

      // 过滤掉空字符串
      const validKeywords = keywords.filter(
        (k) => k && typeof k === 'string' && k.trim().length > 0,
      );
      if (validKeywords.length === 0) {
        throw new Error('关键词数组不能为空');
      }

      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      // 报告操作开始
      if (onAction) {
        onAction({
          type: 'read',
          entity: 'paragraph',
          data: {
            tool_name: 'batch_replace_translations',
            keywords: validKeywords,
          },
        });
      }

      // 收集所有匹配的段落
      const allResults: Map<string, ParagraphSearchResult> = new Map();

      // 对每个关键词进行搜索，在翻译文本中查找
      for (const keyword of validKeywords) {
        // 使用优化的异步方法，按需加载章节内容
        // 注意：这里我们需要搜索翻译文本，而不是原文
        // 由于 searchParagraphsByKeywordAsync 搜索的是原文，我们需要自己实现搜索翻译的逻辑
        const results = await ChapterService.searchParagraphsByKeywordAsync(
          book,
          keyword,
          chapter_id,
          max_replacements * validKeywords.length, // 增加搜索数量以应对去重
          true, // only_with_translation = true，只搜索有翻译的段落
        );

        // 进一步过滤：检查翻译文本中是否包含关键词
        for (const result of results) {
          const paragraph = result.paragraph;
          if (!paragraph.translations || paragraph.translations.length === 0) {
            continue;
          }

          // 检查翻译文本中是否包含关键词
          const keywordLower = keyword.toLowerCase();
          const hasKeywordInTranslation = paragraph.translations.some((t) =>
            t.translation?.toLowerCase().includes(keywordLower),
          );

          if (hasKeywordInTranslation && !allResults.has(paragraph.id)) {
            allResults.set(paragraph.id, result);
          }
        }

        // 如果已经收集到足够的段落，提前停止
        if (allResults.size >= max_replacements) {
          break;
        }
      }

      // 转换为数组并限制数量
      const results = Array.from(allResults.values()).slice(0, max_replacements);

      if (results.length === 0) {
        return JSON.stringify({
          success: true,
          message: '未找到匹配的段落',
          replaced_count: 0,
          keywords: validKeywords,
        });
      }

      // 执行替换操作
      const replacedParagraphs: Array<{
        paragraph_id: string;
        chapter_id: string;
        old_translations: Array<{ translation_id: string; translation: string }>;
        new_translation: string;
      }> = [];

      for (const result of results) {
        const { paragraph } = result;

        if (!paragraph.translations || paragraph.translations.length === 0) {
          continue;
        }

        const oldTranslations: Array<{ translation_id: string; translation: string }> = [];

        if (replace_all_translations) {
          // 替换所有翻译版本
          for (const translation of paragraph.translations) {
            oldTranslations.push({
              translation_id: translation.id,
              translation: translation.translation,
            });
            translation.translation = normalizeTranslationQuotes(replacement_text.trim());
          }
        } else {
          // 只替换选中的翻译版本
          if (paragraph.selectedTranslationId) {
            const selectedTranslation = paragraph.translations.find(
              (t) => t.id === paragraph.selectedTranslationId,
            );
            if (selectedTranslation) {
              oldTranslations.push({
                translation_id: selectedTranslation.id,
                translation: selectedTranslation.translation,
              });
              selectedTranslation.translation = normalizeTranslationQuotes(replacement_text.trim());
            }
          } else {
            // 如果没有选中的翻译，替换第一个翻译
            const firstTranslation = paragraph.translations[0];
            if (firstTranslation) {
              oldTranslations.push({
                translation_id: firstTranslation.id,
                translation: firstTranslation.translation,
              });
              firstTranslation.translation = normalizeTranslationQuotes(replacement_text.trim());
              // 同时设置为选中
              paragraph.selectedTranslationId = firstTranslation.id;
            }
          }
        }

        if (oldTranslations.length > 0) {
          replacedParagraphs.push({
            paragraph_id: paragraph.id,
            chapter_id: result.chapter.id,
            old_translations: oldTranslations,
            new_translation: replacement_text.trim(),
          });

          // 报告更新操作
          if (onAction) {
            for (const oldTrans of oldTranslations) {
              onAction({
                type: 'update',
                entity: 'translation',
                data: {
                  paragraph_id: paragraph.id,
                  translation_id: oldTrans.translation_id,
                  old_translation: oldTrans.translation,
                  new_translation: replacement_text.trim(),
                },
                previousData: {
                  id: oldTrans.translation_id,
                  translation: oldTrans.translation,
                  aiModelId:
                    paragraph.translations.find((t) => t.id === oldTrans.translation_id)
                      ?.aiModelId || '',
                },
              });
            }
          }
        }
      }

      // 更新书籍（保存更改）
      await booksStore.updateBook(bookId, { volumes: book.volumes });

      return JSON.stringify({
        success: true,
        message: `成功替换 ${replacedParagraphs.length} 个段落的翻译`,
        replaced_count: replacedParagraphs.length,
        keywords: validKeywords,
        replacement_text: replacement_text.trim(),
        replace_all_translations,
        replaced_paragraphs: replacedParagraphs.map((p) => ({
          paragraph_id: p.paragraph_id,
          chapter_id: p.chapter_id,
          translation_count: p.old_translations.length,
        })),
      });
    },
  },
];
