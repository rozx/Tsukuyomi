import { ChapterService, type ParagraphSearchResult } from 'src/services/chapter-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { useBooksStore } from 'src/stores/books';
import { useAIModelsStore } from 'src/stores/ai-models';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';
import { isEmptyOrSymbolOnly } from 'src/utils/text-utils';
import { UniqueIdGenerator } from 'src/utils/id-generator';
import type { Translation, Chapter } from 'src/models/novel';
import type { ToolDefinition, ActionInfo } from './types';
import { searchRelatedMemories } from './memory-helper';

/**
 * 从段落文本中提取关键词（用于记忆搜索）
 * 提取前几个有意义的词，跳过标点和助词
 * @param text 段落文本
 * @param maxLength 最大长度（默认 20 个字符）
 * @returns 关键词数组
 */
function extractKeywordsFromParagraph(text: string, maxLength: number = 20): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // 截取前 maxLength 个字符
  const truncated = text.trim().substring(0, maxLength);
  
  // 移除常见的标点符号和空白字符
  const cleaned = truncated.replace(/[、。，．！？\s]+/g, '').trim();
  
  if (cleaned.length === 0) {
    return [];
  }

  // 如果文本很短，直接返回
  if (cleaned.length <= maxLength) {
    return [cleaned];
  }

  // 尝试按常见分隔符分割（如空格、标点等）
  const parts = cleaned.split(/[\s、。，．！？]+/).filter((p) => p.length > 0);
  
  if (parts.length > 0) {
    // 返回前几个部分（最多3个）
    return parts.slice(0, 3);
  }

  return [cleaned];
}

/**
 * 在文本中替换完整的关键词（作为独立词，不是其他词的一部分）
 * @param text 要替换的文本
 * @param keyword 要替换的关键词
 * @param replacement 替换文本
 * @returns 替换后的文本
 */
export function replaceWholeKeyword(text: string, keyword: string, replacement: string): string {
  if (!text || !keyword) {
    return text;
  }

  // 转义正则表达式特殊字符
  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 检查关键词是否包含 CJK 字符（中文、日文、韩文）
  const hasCJK = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/.test(keyword);
  // 检查文本是否包含 CJK 字符
  const textHasCJK = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/.test(text);
  // 检查关键词是否只包含ASCII字母（英文单词）
  const isEnglishWord = /^[a-zA-Z]+$/.test(keyword);

  const cjkCharClass = '\\u4E00-\\u9FFF\\u3040-\\u309F\\u30A0-\\u30FF\\uAC00-\\uD7AF';

  let pattern: RegExp;

  if (isEnglishWord && !hasCJK) {
    // 对于英文单词，使用单词边界
    pattern = new RegExp(
      `(^|[^a-zA-Z0-9]|[${cjkCharClass}])${escapedKeyword}([^a-zA-Z0-9]|[${cjkCharClass}]|$)`,
      'giu',
    );
    return text.replace(pattern, (match, before, after) => {
      // 保留前后的边界字符
      return (before || '') + replacement + (after || '');
    });
  } else if (hasCJK || textHasCJK) {
    // 对于 CJK 字符，使用更复杂的匹配
    // 方案1：关键词前后是文本边界或非CJK字符
    pattern = new RegExp(`(^|[^${cjkCharClass}])${escapedKeyword}([^${cjkCharClass}]|$)`, 'giu');
    let result = text.replace(pattern, (match, before, after) => {
      return (before || '') + replacement + (after || '');
    });

    // 如果方案1没有匹配，尝试方案2：关键词在CJK字符中间
    if (result === text) {
      // 手动检查并替换
      const isCJK = (char: string) =>
        /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/.test(char);
      let searchIndex = 0;
      const parts: string[] = [];
      let lastIndex = 0;

      while (true) {
        const index = text.indexOf(keyword, searchIndex);
        if (index === -1) {
          break;
        }

        const beforeChar: string = index > 0 ? (text[index - 1] ?? '') : '';
        const afterChar: string =
          index + keyword.length < text.length ? (text[index + keyword.length] ?? '') : '';

        const beforeIsBoundary = index === 0 || !isCJK(beforeChar);
        const afterIsBoundary = index + keyword.length === text.length || !isCJK(afterChar);
        const beforeIsCJK = index > 0 && isCJK(beforeChar);
        const afterIsCJK = index + keyword.length < text.length && isCJK(afterChar);

        // 匹配条件：前后都是边界，或前后都是CJK，或混合
        if (
          (beforeIsBoundary && afterIsBoundary) ||
          (beforeIsCJK && afterIsCJK) ||
          (beforeIsBoundary && afterIsCJK) ||
          (beforeIsCJK && afterIsBoundary)
        ) {
          // 添加之前的部分
          if (index > lastIndex) {
            parts.push(text.substring(lastIndex, index));
          }
          // 添加替换文本
          parts.push(replacement);
          lastIndex = index + keyword.length;
        }

        searchIndex = index + 1;
      }

      // 添加剩余部分
      if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
      }

      if (parts.length > 0) {
        result = parts.join('');
      }
    }

    return result;
  } else {
    // 对于纯非 CJK 字符（主要是英文），使用单词边界
    pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapedKeyword}([^\\p{L}\\p{N}]|$)`, 'giu');
    return text.replace(pattern, (match, before, after) => {
      return (before || '') + replacement + (after || '');
    });
  }
}

/**
 * 检查文本中是否包含完整的关键词（作为独立词，不是其他词的一部分）
 * @param text 要搜索的文本
 * @param keyword 关键词
 * @returns 如果文本中包含完整的关键词，返回 true
 */
export function containsWholeKeyword(text: string, keyword: string): boolean {
  if (!text || !keyword) {
    return false;
  }

  // 转义正则表达式特殊字符
  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 检查关键词是否包含 CJK 字符（中文、日文、韩文）
  const hasCJK = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/.test(keyword);
  // 检查文本是否包含 CJK 字符
  const textHasCJK = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/.test(text);
  // 检查关键词是否只包含ASCII字母（英文单词）
  const isEnglishWord = /^[a-zA-Z]+$/.test(keyword);

  // 如果关键词是英文单词，即使文本包含CJK字符，也使用英文单词边界匹配
  if (isEnglishWord && !hasCJK) {
    // 对于英文单词，使用单词边界
    // 但需要考虑混合语言情况：如果前后是CJK字符，也应该匹配
    const cjkCharClass = '\\u4E00-\\u9FFF\\u3040-\\u309F\\u30A0-\\u30FF\\uAC00-\\uD7AF';
    // 匹配：前后是文本边界、非字母数字字符、或CJK字符
    const pattern = new RegExp(
      `(^|[^a-zA-Z0-9]|[${cjkCharClass}])${escapedKeyword}([^a-zA-Z0-9]|[${cjkCharClass}]|$)`,
      'iu',
    );
    return pattern.test(text);
  } else if (hasCJK || textHasCJK) {
    // 对于包含 CJK 字符的情况，需要特殊处理
    // CJK 文本没有明确的单词边界，所以匹配精确的子字符串
    // 匹配规则：
    // 1. 关键词前必须是文本开头或非CJK字符（标点、空格、英文等）
    // 2. 关键词后必须是文本结尾或非CJK字符
    // 3. 如果关键词前后都是CJK字符，也匹配（因为CJK没有单词边界，精确匹配子字符串是可以接受的）

    // 定义CJK字符范围（用于字符类）
    const cjkCharClass = '\\u4E00-\\u9FFF\\u3040-\\u309F\\u30A0-\\u30FF\\uAC00-\\uD7AF';

    // 方案1：关键词前后是文本边界或非CJK字符
    const pattern1 = new RegExp(
      `(^|[^${cjkCharClass}])${escapedKeyword}([^${cjkCharClass}]|$)`,
      'iu',
    );

    // 方案2：关键词前后都是CJK字符或文本边界（使用负向前瞻和后顾）
    // 如果关键词在CJK字符中间，也匹配（因为CJK没有单词边界）
    // 注意：后顾 (?<=...) 需要检查浏览器支持，如果不支持则回退
    let pattern2: RegExp | null = null;
    try {
      pattern2 = new RegExp(
        `(?<=[${cjkCharClass}]|^)${escapedKeyword}(?=[${cjkCharClass}]|$)`,
        'iu',
      );
      // 测试后顾是否支持
      pattern2.test('test');
    } catch (e) {
      pattern2 = null;
    }

    // 先尝试方案1（关键词前后是文本边界或非CJK字符）
    if (pattern1.test(text)) {
      return true;
    }

    // 如果方案2支持，也尝试方案2
    if (pattern2 && pattern2.test(text)) {
      return true;
    }

    // 如果都不匹配，使用手动检查（fallback）
    {
      // 如果不支持后顾，使用方案1，并且对于CJK字符，也允许在CJK字符中间匹配
      // 通过检查关键词前后的字符来实现
      if (pattern1.test(text)) {
        return true;
      }

      // 检查关键词是否在文本中，并且前后都是CJK字符或边界
      // 需要检查所有出现的位置，因为可能有多个匹配
      const isCJK = (char: string) =>
        /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/.test(char);

      // 检查所有出现的位置
      let searchIndex = 0;
      while (true) {
        const index = text.indexOf(keyword, searchIndex);
        if (index === -1) {
          break;
        }

        const beforeChar: string = index > 0 ? (text[index - 1] ?? '') : '';
        const afterChar: string =
          index + keyword.length < text.length ? (text[index + keyword.length] ?? '') : '';

        // 检查前后字符
        const beforeIsBoundary = index === 0 || !isCJK(beforeChar);
        const afterIsBoundary = index + keyword.length === text.length || !isCJK(afterChar);
        const beforeIsCJK = index > 0 && isCJK(beforeChar);
        const afterIsCJK = index + keyword.length < text.length && isCJK(afterChar);

        // 匹配条件：
        // 1. 前后都是边界（文本开头/结尾或非CJK字符）
        // 2. 或者前后都是CJK字符（因为CJK没有单词边界，精确匹配子字符串是可以接受的）
        // 3. 或者前是边界后是CJK，或前是CJK后是边界（CJK字符边界也是有效的）
        if (
          (beforeIsBoundary && afterIsBoundary) ||
          (beforeIsCJK && afterIsCJK) ||
          (beforeIsBoundary && afterIsCJK) ||
          (beforeIsCJK && afterIsBoundary)
        ) {
          return true;
        }

        searchIndex = index + 1;
      }

      return false;
    }
  } else {
    // 对于非 CJK 字符（主要是英文），使用单词边界
    // 匹配规则：
    // 1. 关键词前必须是文本开头或非字母数字字符
    // 2. 关键词后必须是文本结尾或非字母数字字符
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapedKeyword}([^\\p{L}\\p{N}]|$)`, 'iu');
    return pattern.test(text);
  }
}

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
      const { paragraph_id, include_memory = true } = args;
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

      // 搜索相关记忆（从段落文本中提取关键词）
      let relatedMemories: Array<{ id: string; summary: string }> = [];
      if (include_memory && bookId && paragraph.text) {
        const keywords = extractKeywordsFromParagraph(paragraph.text, 20);
        if (keywords.length > 0) {
          relatedMemories = await searchRelatedMemories(bookId, keywords, 5);
        }
      }

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
        ...(include_memory && relatedMemories.length > 0 ? { related_memories: relatedMemories } : {}),
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
            include_memory: {
              type: 'boolean',
              description: '是否在响应中包含相关的记忆信息（默认 true）',
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
      const { paragraph_id, count = 3, include_memory = true } = args;
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

      // 搜索相关记忆（从段落文本中提取关键词）
      let relatedMemories: Array<{ id: string; summary: string }> = [];
      if (include_memory && bookId && validResults.length > 0) {
        // 从第一个段落中提取关键词
        const firstParagraph = validResults[0].paragraph;
        if (firstParagraph.text) {
          const keywords = extractKeywordsFromParagraph(firstParagraph.text, 20);
          if (keywords.length > 0) {
            relatedMemories = await searchRelatedMemories(bookId, keywords, 5);
          }
        }
      }

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
        ...(include_memory && relatedMemories.length > 0 ? { related_memories: relatedMemories } : {}),
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
            include_memory: {
              type: 'boolean',
              description: '是否在响应中包含相关的记忆信息（默认 true）',
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
      const { paragraph_id, count = 3, include_memory = true } = args;
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

      // 搜索相关记忆（从段落文本中提取关键词）
      let relatedMemories: Array<{ id: string; summary: string }> = [];
      if (include_memory && bookId && validResults.length > 0) {
        // 从第一个段落中提取关键词
        const firstParagraph = validResults[0].paragraph;
        if (firstParagraph.text) {
          const keywords = extractKeywordsFromParagraph(firstParagraph.text, 20);
          if (keywords.length > 0) {
            relatedMemories = await searchRelatedMemories(bookId, keywords, 5);
          }
        }
      }

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
        ...(include_memory && relatedMemories.length > 0 ? { related_memories: relatedMemories } : {}),
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'find_paragraph_by_keywords',
        description:
          '根据多个关键词查找包含任一关键词的段落。用于在翻译过程中查找特定内容或验证翻译的一致性。支持在原文或翻译文本中搜索，如果同时提供两者，则只返回同时满足两个条件的段落。支持多个关键词，返回包含任一关键词的段落（OR 逻辑）。⚠️ **敬语翻译**：翻译敬语时，必须**首先**使用 search_memory_by_keywords 搜索记忆中关于该角色敬语翻译的相关信息，**然后**再使用此工具搜索该角色在之前段落中的翻译，以确保翻译一致性。如果提供 chapter_id 参数，则仅在指定章节内搜索；如果不提供，则搜索所有章节。',
        parameters: {
          type: 'object',
          properties: {
            keywords: {
              type: 'array',
              items: {
                type: 'string',
              },
              description:
                '原文关键词数组（可选），用于在原文中搜索包含任一关键词的段落（OR 逻辑）。如果与 translation_keywords 同时提供，则段落必须同时满足两个条件。',
            },
            translation_keywords: {
              type: 'array',
              items: {
                type: 'string',
              },
              description:
                '翻译文本关键词数组（可选），用于在翻译文本中搜索包含任一关键词的段落（OR 逻辑）。如果与 keywords 同时提供，则段落必须同时满足两个条件。',
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
            include_memory: {
              type: 'boolean',
              description: '是否在响应中包含相关的记忆信息（默认 true）',
            },
          },
          required: [],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const {
        keywords,
        translation_keywords,
        chapter_id,
        max_paragraphs = 1,
        only_with_translation = false,
        include_memory = true,
      } = args;

      // 验证至少提供一个关键词数组
      if (
        (!keywords || !Array.isArray(keywords) || keywords.length === 0) &&
        (!translation_keywords ||
          !Array.isArray(translation_keywords) ||
          translation_keywords.length === 0)
      ) {
        throw new Error('必须提供 keywords 或 translation_keywords 至少一个关键词数组');
      }

      // 过滤掉空字符串
      const validKeywords =
        keywords && Array.isArray(keywords)
          ? keywords.filter((k) => k && typeof k === 'string' && k.trim().length > 0)
          : [];
      const validTranslationKeywords =
        translation_keywords && Array.isArray(translation_keywords)
          ? translation_keywords.filter((k) => k && typeof k === 'string' && k.trim().length > 0)
          : [];

      // 验证至少有一个有效的关键词数组
      if (validKeywords.length === 0 && validTranslationKeywords.length === 0) {
        throw new Error('必须提供至少一个有效的关键词数组');
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
            keywords: validKeywords.length > 0 ? validKeywords : undefined,
            translation_keywords:
              validTranslationKeywords.length > 0 ? validTranslationKeywords : undefined,
            ...(chapter_id ? { chapter_id } : {}),
          } as ActionInfo['data'],
        });
      }

      // 收集所有匹配的段落
      const allResults: Map<string, ParagraphSearchResult> = new Map();

      // 如果提供了原文关键词，搜索原文
      if (validKeywords.length > 0) {
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
          if (allResults.size >= max_paragraphs * 2) {
            // 乘以2是为了给后续的翻译文本搜索留出空间
            break;
          }
        }
      }

      // 如果提供了翻译关键词，需要搜索翻译文本
      // 如果同时提供了两种关键词，需要过滤出同时满足两个条件的段落
      if (validTranslationKeywords.length > 0) {
        // 如果同时提供了两种关键词，需要过滤出同时满足两个条件的段落
        if (validKeywords.length > 0) {
          // 过滤结果：只保留同时满足翻译关键词条件的段落
          // 首先确保包含这些段落的章节都已加载
          const chaptersNeeded = new Set<string>();
          for (const result of allResults.values()) {
            const chapter = result.chapter;
            if (chapter.content === undefined) {
              chaptersNeeded.add(chapter.id);
            }
          }

          // 加载需要的章节
          if (chaptersNeeded.size > 0) {
            const chapterIds = Array.from(chaptersNeeded);
            const contentsMap = await ChapterContentService.loadChapterContentsBatch(chapterIds);
            for (const chapterId of chapterIds) {
              const chapter = book.volumes
                ?.flatMap((v) => v.chapters || [])
                .find((c) => c.id === chapterId);
              if (chapter) {
                const content = contentsMap.get(chapterId);
                chapter.content = content || [];
                chapter.contentLoaded = true;
              }
            }
          }

          const filteredResults: Map<string, ParagraphSearchResult> = new Map();
          const translationKeywordLower = validTranslationKeywords.map((k) => k.toLowerCase());

          for (const [paragraphId, result] of allResults.entries()) {
            const paragraph = result.paragraph;
            if (!paragraph.translations || paragraph.translations.length === 0) {
              continue;
            }

            // 检查翻译文本中是否包含任一翻译关键词
            const hasTranslationKeyword = paragraph.translations.some((t) =>
              translationKeywordLower.some((kw) => t.translation?.toLowerCase().includes(kw)),
            );

            if (hasTranslationKeyword) {
              filteredResults.set(paragraphId, result);
            }
          }

          allResults.clear();
          for (const [id, result] of filteredResults.entries()) {
            allResults.set(id, result);
          }
        } else {
          // 只提供了翻译关键词，需要遍历所有段落
          const chaptersToLoad: { chapter: Chapter; vIndex: number; cIndex: number }[] = [];

          // 如果提供了 chapter_id，需要找到该章节的位置
          let targetVolumeIndex: number | null = null;
          let targetChapterIndex: number | null = null;

          if (chapter_id && book.volumes) {
            for (let vIndex = 0; vIndex < book.volumes.length; vIndex++) {
              const volume = book.volumes[vIndex];
              if (volume && volume.chapters) {
                const cIndex = volume.chapters.findIndex((c) => c.id === chapter_id);
                if (cIndex !== -1) {
                  targetVolumeIndex = vIndex;
                  targetChapterIndex = cIndex;
                  break;
                }
              }
            }
          }

          // 收集需要加载的章节
          if (!book.volumes) {
            return JSON.stringify({
              success: true,
              message: '书籍没有卷',
              replaced_count: 0,
            });
          }

          const startVolumeIndex = chapter_id && targetVolumeIndex !== null ? targetVolumeIndex : 0;
          const endVolumeIndex =
            chapter_id && targetVolumeIndex !== null ? targetVolumeIndex : book.volumes.length - 1;

          for (let vIndex = startVolumeIndex; vIndex <= endVolumeIndex; vIndex++) {
            const volume = book.volumes[vIndex];
            if (!volume || !volume.chapters) continue;

            if (chapter_id && targetVolumeIndex !== null && vIndex !== targetVolumeIndex) {
              continue;
            }

            const startChapterIndex =
              chapter_id && targetChapterIndex !== null ? targetChapterIndex : 0;
            const endChapterIndex =
              chapter_id && targetChapterIndex !== null
                ? targetChapterIndex
                : volume.chapters.length - 1;

            for (let cIndex = startChapterIndex; cIndex <= endChapterIndex; cIndex++) {
              const chapter = volume.chapters[cIndex];
              if (!chapter) continue;

              if (chapter.content === undefined) {
                chaptersToLoad.push({ chapter, vIndex, cIndex });
              }
            }
          }

          // 批量加载需要的章节
          if (chaptersToLoad.length > 0) {
            const chapterIds = chaptersToLoad.map((item) => item.chapter.id);
            const contentsMap = await ChapterContentService.loadChapterContentsBatch(chapterIds);

            for (const { chapter } of chaptersToLoad) {
              const content = contentsMap.get(chapter.id);
              chapter.content = content || [];
              chapter.contentLoaded = true;
            }
          }

          // 搜索翻译文本
          if (!book.volumes) {
            return JSON.stringify({
              success: true,
              message: '书籍没有卷',
              replaced_count: 0,
            });
          }

          const translationKeywordLower = validTranslationKeywords.map((k) => k.toLowerCase());
          const searchStartVolumeIndex =
            chapter_id && targetVolumeIndex !== null ? targetVolumeIndex : 0;
          const searchEndVolumeIndex =
            chapter_id && targetVolumeIndex !== null ? targetVolumeIndex : book.volumes.length - 1;

          for (let vIndex = searchStartVolumeIndex; vIndex <= searchEndVolumeIndex; vIndex++) {
            const volume = book.volumes[vIndex];
            if (!volume || !volume.chapters) continue;

            if (chapter_id && targetVolumeIndex !== null && vIndex !== targetVolumeIndex) {
              continue;
            }

            const searchStartChapterIndex =
              chapter_id && targetChapterIndex !== null ? targetChapterIndex : 0;
            const searchEndChapterIndex =
              chapter_id && targetChapterIndex !== null
                ? targetChapterIndex
                : volume.chapters.length - 1;

            for (let cIndex = searchStartChapterIndex; cIndex <= searchEndChapterIndex; cIndex++) {
              const chapter = volume.chapters[cIndex];
              if (!chapter) continue;

              if (chapter.content === undefined) {
                const content = await ChapterContentService.loadChapterContent(chapter.id);
                chapter.content = content || [];
                chapter.contentLoaded = true;
              }

              if (chapter.content) {
                for (let pIndex = 0; pIndex < chapter.content.length; pIndex++) {
                  if (allResults.size >= max_paragraphs) {
                    break;
                  }

                  const paragraph = chapter.content[pIndex];
                  if (!paragraph) {
                    continue;
                  }

                  // 如果只搜索翻译文本，段落必须有翻译
                  if (!paragraph.translations || paragraph.translations.length === 0) {
                    // 如果 only_with_translation 为 false，且只提供了翻译关键词，仍然跳过（因为无法匹配）
                    // 如果 only_with_translation 为 true，也需要跳过（因为没有翻译）
                    continue;
                  }

                  // 检查翻译文本中是否包含任一翻译关键词
                  const hasTranslationKeyword = paragraph.translations.some((t) =>
                    translationKeywordLower.some((kw) => t.translation?.toLowerCase().includes(kw)),
                  );

                  if (hasTranslationKeyword && !allResults.has(paragraph.id)) {
                    allResults.set(paragraph.id, {
                      paragraph,
                      paragraphIndex: pIndex,
                      chapter,
                      chapterIndex: cIndex,
                      volume,
                      volumeIndex: vIndex,
                    });
                  }
                }
              }

              if (allResults.size >= max_paragraphs) {
                break;
              }
            }

            if (allResults.size >= max_paragraphs) {
              break;
            }
          }
        }
      }

      // 转换为数组并限制数量
      const results = Array.from(allResults.values()).slice(0, max_paragraphs);

      // 过滤掉空段落或仅包含符号的段落
      const validResults = results.filter((result) => !isEmptyOrSymbolOnly(result.paragraph.text));

      // 搜索相关记忆（使用提供的 keywords 或 translation_keywords）
      let relatedMemories: Array<{ id: string; summary: string }> = [];
      if (include_memory && bookId) {
        const searchKeywords: string[] = [];
        if (validKeywords.length > 0) {
          searchKeywords.push(...validKeywords);
        }
        if (validTranslationKeywords.length > 0) {
          searchKeywords.push(...validTranslationKeywords);
        }
        if (searchKeywords.length > 0) {
          relatedMemories = await searchRelatedMemories(bookId, searchKeywords, 5);
        }
      }

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
        ...(include_memory && relatedMemories.length > 0 ? { related_memories: relatedMemories } : {}),
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
              description:
                '正则表达式模式（字符串格式）。例如："\\d+年" 匹配包含数字和"年"的文本，"[あ-ん]+" 匹配平假名等。',
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
      if (
        !regex_pattern ||
        typeof regex_pattern !== 'string' ||
        regex_pattern.trim().length === 0
      ) {
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
            ...(chapter_id ? { chapter_id } : {}),
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
            include_memory: {
              type: 'boolean',
              description: '是否在响应中包含相关的记忆信息（默认 true）',
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
      const { paragraph_id, include_memory = true } = args;
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

      // 搜索相关记忆（从段落文本中提取关键词）
      let relatedMemories: Array<{ id: string; summary: string }> = [];
      if (include_memory && bookId && paragraph.text) {
        const keywords = extractKeywordsFromParagraph(paragraph.text, 20);
        if (keywords.length > 0) {
          relatedMemories = await searchRelatedMemories(bookId, keywords, 5);
        }
      }

      return JSON.stringify({
        success: true,
        paragraph_id: paragraph.id,
        paragraph_text: paragraph.text,
        selected_translation_id: paragraph.selectedTranslationId || '',
        translation_history: translationHistory,
        total_count: translationHistory.length,
        ...(include_memory && relatedMemories.length > 0 ? { related_memories: relatedMemories } : {}),
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
        translation: translation.trim(),
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
          '批量替换段落翻译中的关键词部分。根据关键词在原文或翻译文本中查找段落，并只替换匹配的关键词部分（保留翻译文本的其他内容）。支持同时搜索原文和翻译文本，如果同时提供两者，则只替换同时满足两个条件的段落。用于批量修正翻译中的错误或统一翻译风格。重要：工具会智能地只替换匹配的关键词部分，而不是替换整个翻译文本。例如：翻译"大姐abc"中的"大姐"会被替换为"姐姐"，结果变为"姐姐abc"。如果只提供原文关键词（没有翻译关键词），由于无法精确对应，会替换整个翻译文本。',
        parameters: {
          type: 'object',
          properties: {
            keywords: {
              type: 'array',
              items: {
                type: 'string',
              },
              description:
                '关键词数组（可选），用于在翻译文本中搜索包含任一关键词的段落（OR 逻辑）。如果与 original_keywords 同时提供，则段落必须同时满足两个条件。',
            },
            original_keywords: {
              type: 'array',
              items: {
                type: 'string',
              },
              description:
                '原文关键词数组（可选），用于在原文中搜索包含任一关键词的段落（OR 逻辑）。如果与 keywords 同时提供，则段落必须同时满足两个条件。',
            },
            replacement_text: {
              type: 'string',
              description:
                '替换文本，用于替换匹配的关键词部分（不是替换整个翻译）。例如：如果关键词是"大姐"，替换文本是"姐姐"，则"大姐abc"会被替换为"姐姐abc"。如果只提供原文关键词（没有翻译关键词），会替换整个翻译文本。',
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
          required: ['replacement_text'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const {
        keywords,
        original_keywords,
        replacement_text,
        chapter_id,
        replace_all_translations = false,
        max_replacements = 100,
      } = args;
      if (!replacement_text || typeof replacement_text !== 'string') {
        throw new Error('替换文本不能为空');
      }

      // 验证至少提供一个关键词数组
      if (
        (!keywords || !Array.isArray(keywords) || keywords.length === 0) &&
        (!original_keywords || !Array.isArray(original_keywords) || original_keywords.length === 0)
      ) {
        throw new Error('必须提供 keywords 或 original_keywords 至少一个关键词数组');
      }

      // 过滤掉空字符串
      const validKeywords =
        keywords && Array.isArray(keywords)
          ? keywords.filter((k) => k && typeof k === 'string' && k.trim().length > 0)
          : [];
      const validOriginalKeywords =
        original_keywords && Array.isArray(original_keywords)
          ? original_keywords.filter((k) => k && typeof k === 'string' && k.trim().length > 0)
          : [];

      // 验证至少有一个有效的关键词数组
      if (validKeywords.length === 0 && validOriginalKeywords.length === 0) {
        throw new Error('必须提供至少一个有效的关键词数组');
      }

      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      // 注意：不在这里发送 read action，批量替换完成后会发送一个汇总的 update action

      // 收集所有匹配的段落
      const allResults: Map<string, ParagraphSearchResult> = new Map();

      // 如果提供了 chapter_id，需要找到该章节的位置
      let targetVolumeIndex: number | null = null;
      let targetChapterIndex: number | null = null;

      if (chapter_id && book.volumes) {
        // 查找目标章节的位置
        for (let vIndex = 0; vIndex < book.volumes.length; vIndex++) {
          const volume = book.volumes[vIndex];
          if (volume && volume.chapters) {
            const cIndex = volume.chapters.findIndex((c) => c.id === chapter_id);
            if (cIndex !== -1) {
              targetVolumeIndex = vIndex;
              targetChapterIndex = cIndex;
              break;
            }
          }
        }

        // 如果找不到指定的章节，返回空结果
        if (targetVolumeIndex === null || targetChapterIndex === null) {
          return JSON.stringify({
            success: true,
            message: '未找到指定的章节',
            replaced_count: 0,
            keywords: validKeywords.length > 0 ? validKeywords : undefined,
            original_keywords: validOriginalKeywords.length > 0 ? validOriginalKeywords : undefined,
          });
        }
      }

      // 收集需要加载的章节（批量加载优化）
      const chaptersToLoad: { chapter: Chapter; vIndex: number; cIndex: number }[] = [];

      // 第一遍：收集需要加载的章节
      if (!book.volumes) {
        return JSON.stringify({
          success: true,
          message: '书籍没有卷',
          replaced_count: 0,
          keywords: validKeywords.length > 0 ? validKeywords : undefined,
          original_keywords: validOriginalKeywords.length > 0 ? validOriginalKeywords : undefined,
        });
      }

      const startVolumeIndex = chapter_id && targetVolumeIndex !== null ? targetVolumeIndex : 0;
      const endVolumeIndex =
        chapter_id && targetVolumeIndex !== null ? targetVolumeIndex : book.volumes.length - 1;

      for (let vIndex = startVolumeIndex; vIndex <= endVolumeIndex; vIndex++) {
        const volume = book.volumes[vIndex];
        if (!volume || !volume.chapters) continue;

        // 如果指定了章节，只处理目标卷
        if (chapter_id && targetVolumeIndex !== null && vIndex !== targetVolumeIndex) {
          continue;
        }

        // 确定章节范围：如果指定了章节，只处理该章节；否则处理所有章节
        const startChapterIndex =
          chapter_id && targetChapterIndex !== null ? targetChapterIndex : 0;
        const endChapterIndex =
          chapter_id && targetChapterIndex !== null
            ? targetChapterIndex
            : volume.chapters.length - 1;

        // 遍历章节
        for (let cIndex = startChapterIndex; cIndex <= endChapterIndex; cIndex++) {
          const chapter = volume.chapters[cIndex];
          if (!chapter) continue;

          // 如果需要加载，添加到列表
          if (chapter.content === undefined) {
            chaptersToLoad.push({ chapter, vIndex, cIndex });
          }
        }
      }

      // 批量加载需要的章节
      if (chaptersToLoad.length > 0) {
        const chapterIds = chaptersToLoad.map((item) => item.chapter.id);
        const contentsMap = await ChapterContentService.loadChapterContentsBatch(chapterIds);

        // 更新章节内容
        for (const { chapter } of chaptersToLoad) {
          const content = contentsMap.get(chapter.id);
          chapter.content = content || [];
          chapter.contentLoaded = true;
        }
      }

      // 第二遍：在加载的章节中搜索翻译文本
      if (!book.volumes) {
        return JSON.stringify({
          success: true,
          message: '书籍没有卷',
          replaced_count: 0,
          keywords: validKeywords.length > 0 ? validKeywords : undefined,
          original_keywords: validOriginalKeywords.length > 0 ? validOriginalKeywords : undefined,
        });
      }

      const searchStartVolumeIndex =
        chapter_id && targetVolumeIndex !== null ? targetVolumeIndex : 0;
      const searchEndVolumeIndex =
        chapter_id && targetVolumeIndex !== null ? targetVolumeIndex : book.volumes.length - 1;

      for (let vIndex = searchStartVolumeIndex; vIndex <= searchEndVolumeIndex; vIndex++) {
        const volume = book.volumes[vIndex];
        if (!volume || !volume.chapters) continue;

        // 如果指定了章节，只处理目标卷
        if (chapter_id && targetVolumeIndex !== null && vIndex !== targetVolumeIndex) {
          continue;
        }

        // 确定章节范围：如果指定了章节，只搜索该章节；否则搜索所有章节
        const searchStartChapterIndex =
          chapter_id && targetChapterIndex !== null ? targetChapterIndex : 0;
        const searchEndChapterIndex =
          chapter_id && targetChapterIndex !== null
            ? targetChapterIndex
            : volume.chapters.length - 1;

        // 遍历章节
        for (let cIndex = searchStartChapterIndex; cIndex <= searchEndChapterIndex; cIndex++) {
          const chapter = volume.chapters[cIndex];
          if (!chapter) continue;

          // 如果仍未加载，按需加载（可能是在第一遍之后添加的新章节）
          if (chapter.content === undefined) {
            const content = await ChapterContentService.loadChapterContent(chapter.id);
            chapter.content = content || [];
            chapter.contentLoaded = true;
          }

          // 搜索段落（在翻译文本中搜索）
          if (chapter.content) {
            for (let pIndex = 0; pIndex < chapter.content.length; pIndex++) {
              // 如果已达到最大返回数量，停止搜索
              if (allResults.size >= max_replacements) {
                break;
              }

              const paragraph = chapter.content[pIndex];
              if (!paragraph) {
                continue;
              }

              // 检查原文中是否包含关键词（如果提供了 original_keywords）
              let matchesOriginalText = true;
              if (validOriginalKeywords.length > 0) {
                const paragraphText = paragraph.text || '';
                matchesOriginalText = validOriginalKeywords.some((kw) =>
                  containsWholeKeyword(paragraphText, kw),
                );
              }

              // 检查翻译文本中是否包含关键词（如果提供了 keywords）
              let matchesTranslationText = true;
              if (validKeywords.length > 0) {
                // 如果提供了翻译关键词，段落必须有翻译
                if (!paragraph.translations || paragraph.translations.length === 0) {
                  continue;
                }
                matchesTranslationText = paragraph.translations.some((t) =>
                  validKeywords.some((kw) => containsWholeKeyword(t.translation || '', kw)),
                );
              } else {
                // 如果没有提供翻译关键词，但提供了原文关键词，段落仍然需要有翻译才能替换
                if (!paragraph.translations || paragraph.translations.length === 0) {
                  continue;
                }
              }

              // 如果同时提供了两种关键词，段落必须同时满足两个条件
              // 如果只提供了一种，只需满足那一个条件
              if (matchesOriginalText && matchesTranslationText && !allResults.has(paragraph.id)) {
                allResults.set(paragraph.id, {
                  paragraph,
                  paragraphIndex: pIndex,
                  chapter,
                  chapterIndex: cIndex,
                  volume,
                  volumeIndex: vIndex,
                });
              }
            }
          }

          // 如果已达到最大返回数量，停止搜索章节
          if (allResults.size >= max_replacements) {
            break;
          }
        }

        // 如果已达到最大返回数量，停止搜索卷
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
          keywords: validKeywords.length > 0 ? validKeywords : undefined,
          original_keywords: validOriginalKeywords.length > 0 ? validOriginalKeywords : undefined,
        });
      }

      // 执行替换操作
      const replacedParagraphs: Array<{
        paragraph_id: string;
        chapter_id: string;
        old_translations: Translation[];
        new_translation: string;
      }> = [];

      for (const result of results) {
        const { paragraph } = result;

        if (!paragraph.translations || paragraph.translations.length === 0) {
          continue;
        }

        // 保存完整的翻译对象以便恢复（包括 id, translation, aiModelId）
        const oldTranslations: Translation[] = [];

        // 找到匹配的关键词（用于替换）
        let matchedKeyword: string | null = null;

        // 如果提供了翻译关键词，找到匹配的关键词
        if (validKeywords.length > 0) {
          for (const translation of paragraph.translations) {
            for (const keyword of validKeywords) {
              if (containsWholeKeyword(translation.translation || '', keyword)) {
                matchedKeyword = keyword;
                break;
              }
            }
            if (matchedKeyword) break;
          }
        }

        // 如果没有找到匹配的翻译关键词，但提供了原文关键词，使用原文关键词
        // 注意：这种情况下，我们假设原文关键词对应的翻译部分就是整个翻译文本
        // 但实际上更合理的做法是只替换匹配的部分，但由于无法精确对应，我们使用替换文本
        if (!matchedKeyword && validOriginalKeywords.length > 0) {
          // 对于原文关键词，我们无法精确知道翻译中对应的部分
          // 所以如果只提供了原文关键词，我们替换整个翻译
          // 但如果同时提供了翻译关键词，应该优先使用翻译关键词
          matchedKeyword = null; // 使用 null 表示替换整个翻译
        }

        // 执行替换的函数
        const performReplacement = (translation: Translation) => {
          const oldTranslation = translation.translation || '';

          if (matchedKeyword) {
            // 替换匹配的关键词部分
            translation.translation = replaceWholeKeyword(
              oldTranslation,
              matchedKeyword,
              replacement_text.trim(),
            );
          } else {
            // 如果没有匹配的关键词（只有原文关键词），替换整个翻译
            translation.translation = replacement_text.trim();
          }
        };

        if (replace_all_translations) {
          // 替换所有翻译版本
          for (const translation of paragraph.translations) {
            // 检查 translation 对象是否有效
            if (!translation || !translation.id) {
              continue;
            }
            // 保存完整的翻译对象（深拷贝）
            oldTranslations.push({
              id: translation.id,
              translation: translation.translation || '',
              aiModelId: translation.aiModelId || '',
            });
            performReplacement(translation);
          }
        } else {
          // 只替换选中的翻译版本
          if (paragraph.selectedTranslationId) {
            const selectedTranslation = paragraph.translations.find(
              (t) => t.id === paragraph.selectedTranslationId,
            );
            if (selectedTranslation && selectedTranslation.id) {
              // 保存完整的翻译对象（深拷贝）
              oldTranslations.push({
                id: selectedTranslation.id,
                translation: selectedTranslation.translation || '',
                aiModelId: selectedTranslation.aiModelId || '',
              });
              performReplacement(selectedTranslation);
            }
          } else {
            // 如果没有选中的翻译，替换第一个翻译
            const firstTranslation = paragraph.translations[0];
            if (firstTranslation && firstTranslation.id) {
              // 保存完整的翻译对象（深拷贝）
              oldTranslations.push({
                id: firstTranslation.id,
                translation: firstTranslation.translation || '',
                aiModelId: firstTranslation.aiModelId || '',
              });
              performReplacement(firstTranslation);
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
        }
      }

      // 更新书籍（保存更改）
      await booksStore.updateBook(bookId, { volumes: book.volumes });

      // 报告批量替换操作（单个汇总 action，而不是每个替换一个）
      if (onAction && replacedParagraphs.length > 0) {
        // 计算总替换数量（包括所有翻译版本）
        const totalTranslationCount = replacedParagraphs.reduce(
          (sum, p) => sum + p.old_translations.length,
          0,
        );

        onAction({
          type: 'update',
          entity: 'translation',
          data: {
            tool_name: 'batch_replace_translations',
            replaced_paragraph_count: replacedParagraphs.length,
            replaced_translation_count: totalTranslationCount,
            ...(validKeywords.length > 0 ? { keywords: validKeywords } : {}),
            ...(validOriginalKeywords.length > 0
              ? { original_keywords: validOriginalKeywords }
              : {}),
            replacement_text: replacement_text.trim(),
            replace_all_translations,
          },
          // 保存所有被替换的翻译数据以便恢复
          previousData: {
            replaced_paragraphs: replacedParagraphs.map((p) => ({
              paragraph_id: p.paragraph_id,
              chapter_id: p.chapter_id,
              old_translations: p.old_translations,
            })),
          },
        });
      }

      return JSON.stringify({
        success: true,
        message: `成功替换 ${replacedParagraphs.length} 个段落的翻译`,
        replaced_count: replacedParagraphs.length,
        keywords: validKeywords.length > 0 ? validKeywords : undefined,
        original_keywords: validOriginalKeywords.length > 0 ? validOriginalKeywords : undefined,
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
