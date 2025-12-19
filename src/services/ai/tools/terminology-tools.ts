import { TerminologyService } from 'src/services/terminology-service';
import { normalizeTranslationQuotes } from 'src/utils/translation-normalizer';
import { useBooksStore } from 'src/stores/books';
import type { Terminology } from 'src/models/novel';
import type { ToolDefinition } from './types';
import { cloneDeep } from 'lodash';
import { getChapterContentText, ensureChapterContentLoaded } from 'src/utils/novel-utils';
import { findUniqueTermsInText } from 'src/utils/text-matcher';
import type { Chapter } from 'src/models/novel';
import { searchRelatedMemories } from './memory-helper';

export const terminologyTools: ToolDefinition[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'create_term',
        description: '创建新术语。当翻译过程中遇到新的术语时，可以使用此工具创建术语记录。',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: '术语名称（日文原文）',
            },
            translation: {
              type: 'string',
              description: '术语的中文翻译',
            },
            description: {
              type: 'string',
              description: '术语的详细描述（可选）',
            },
          },
          required: ['name', 'translation'],
        },
      },
    },
    handler: async (args, { bookId, onAction, onToast }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { name, translation, description } = args;
      if (!name || !translation) {
        throw new Error('术语名称和翻译不能为空');
      }

      const term = await TerminologyService.addTerminology(bookId, {
        name,
        translation: normalizeTranslationQuotes(translation),
        description,
      });

      // 通过 onAction 回调传递操作信息，统一由 handleActionInfoToast 处理 toast
      // 不再直接调用 showToolToast，避免重复显示 toast
      if (onAction) {
        onAction({
          type: 'create',
          entity: 'term',
          data: term,
        });
      }

      return JSON.stringify({
        success: true,
        message: '术语创建成功',
        term: {
          id: term.id,
          name: term.name,
          translation: term.translation.translation,
          description: term.description,
        },
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_term',
        description:
          '根据术语名称获取术语信息。在翻译过程中，如果遇到已存在的术语，可以使用此工具查询其翻译。⚠️ **重要**：查询术语信息时，必须**先**使用此工具或 search_terms_by_keywords 查询术语数据库，**只有在数据库中没有找到时**才可以使用 search_memory_by_keywords 搜索记忆。',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: '术语名称（日文原文）',
            },
            include_memory: {
              type: 'boolean',
              description: '是否在响应中包含相关的记忆信息（默认 true）',
            },
          },
          required: ['name'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { name, include_memory = true } = args;
      if (!name) {
        throw new Error('术语名称不能为空');
      }

      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      const term = book.terminologies?.find((t) => t.name === name);

      if (!term) {
        return JSON.stringify({
          success: false,
          message: `术语 "${name}" 不存在`,
        });
      }

      // 报告读取操作
      if (onAction) {
        onAction({
          type: 'read',
          entity: 'term',
          data: {
            name,
            tool_name: 'get_term',
          },
        });
      }

      // 搜索相关记忆
      let relatedMemories: Array<{ id: string; summary: string }> = [];
      if (include_memory && bookId) {
        try {
          relatedMemories = await searchRelatedMemories(bookId, [name], 5);
        } catch (error) {
          // 静默失败，不影响主要功能
          console.warn('Failed to search related memories:', error);
        }
      }

      return JSON.stringify({
        success: true,
        term: {
          id: term.id,
          name: term.name,
          translation: term.translation.translation,
          description: term.description,
        },
        ...(include_memory && relatedMemories.length > 0 ? { related_memories: relatedMemories } : {}),
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'update_term',
        description:
          '更新现有术语的翻译或描述。⚠️ **重要**：当发现术语的翻译需要修正时（如翻译错误、格式错误等），**必须**使用此工具进行更新，而不是仅仅告诉用户问题所在。',
        parameters: {
          type: 'object',
          properties: {
            term_id: {
              type: 'string',
              description: '术语 ID（从 get_term 或 list_terms 获取）',
            },
            translation: {
              type: 'string',
              description: '新的翻译文本（可选）',
            },
            description: {
              type: 'string',
              description: '新的描述（可选，设置为空字符串可删除描述）',
            },
          },
          required: ['term_id'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { term_id, translation, description } = args;
      if (!term_id) {
        throw new Error('术语 ID 不能为空');
      }

      // 在更新前获取原始数据，用于 revert
      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      const previousTerm = book?.terminologies?.find((t) => t.id === term_id);
      const previousData = previousTerm ? (cloneDeep(previousTerm)) : undefined;

      const updates: {
        translation?: string;
        description?: string;
      } = {};

      if (translation !== undefined) {
        updates.translation = normalizeTranslationQuotes(translation);
      }
      if (description !== undefined) {
        updates.description = description;
      }

      const term = await TerminologyService.updateTerminology(bookId, term_id, updates);

      if (onAction) {
        onAction({
          type: 'update',
          entity: 'term',
          data: term,
          ...(previousData !== undefined ? { previousData } : {}),
        });
      }

      return JSON.stringify({
        success: true,
        message: '术语更新成功',
        term: {
          id: term.id,
          name: term.name,
          translation: term.translation.translation,
          description: term.description,
        },
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'delete_term',
        description: '删除术语。当确定某个术语不再需要时，可以使用此工具删除。',
        parameters: {
          type: 'object',
          properties: {
            term_id: {
              type: 'string',
              description: '术语 ID（从 get_term 或 list_terms 获取）',
            },
          },
          required: ['term_id'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const { term_id } = args;
      if (!term_id) {
        throw new Error('术语 ID 不能为空');
      }

      // 在删除前获取术语信息，以便在 toast 中显示详细信息和 revert
      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      const term = book?.terminologies?.find((t) => t.id === term_id);
      const previousData = term ? (cloneDeep(term)) : undefined;

      await TerminologyService.deleteTerminology(bookId, term_id);

      if (onAction) {
        onAction({
          type: 'delete',
          entity: 'term',
          data: term ? { id: term_id, name: term.name } : { id: term_id },
          ...(previousData !== undefined ? { previousData } : {}),
        });
      }

      return JSON.stringify({
        success: true,
        message: '术语删除成功',
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'list_terms',
        description:
          '列出术语。可以通过 chapter_id 参数指定章节（只返回该章节中出现的术语），或设置 all_chapters=true 列出所有章节的术语。如果不提供 chapter_id 且 all_chapters 为 false，则返回所有术语。在翻译开始前，可以使用此工具获取相关术语，以便在翻译时保持一致性。',
        parameters: {
          type: 'object',
          properties: {
            chapter_id: {
              type: 'string',
              description:
                '章节 ID（可选）。如果提供，只返回在该章节中出现的术语。如果不提供且 all_chapters 为 false，则返回所有术语。',
            },
            all_chapters: {
              type: 'boolean',
              description:
                '是否列出所有章节的术语（默认 false）。如果为 true，忽略 chapter_id 参数，返回所有术语。',
            },
            limit: {
              type: 'number',
              description: '返回的术语数量限制（可选，默认返回所有）',
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
      const { chapter_id, all_chapters = false, limit } = args;
      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        throw new Error(`书籍不存在: ${bookId}`);
      }

      // 报告读取操作
      if (onAction) {
        onAction({
          type: 'read',
          entity: 'term',
          data: {
            tool_name: 'list_terms',
            chapter_id,
          },
        });
      }

      let terms: Terminology[] = book.terminologies || [];

      // 如果 all_chapters 为 false，需要按章节过滤
      if (!all_chapters) {
        // 如果提供了 chapter_id，使用文本匹配方法（与章节工具栏相同的方法）
        if (chapter_id) {
          // 查找章节
          let foundChapter: Chapter | null = null;
          for (const volume of book.volumes || []) {
            for (const chapter of volume.chapters || []) {
              if (chapter.id === chapter_id) {
                foundChapter = chapter;
                break;
              }
            }
            if (foundChapter) break;
          }

          if (foundChapter) {
            // 确保章节内容已加载
            const chapterWithContent = await ensureChapterContentLoaded(foundChapter);
            // 获取章节文本内容
            const chapterText = getChapterContentText(chapterWithContent);
            if (chapterText) {
              // 使用文本匹配方法查找在该章节中出现的术语（与章节工具栏相同的方法）
              terms = findUniqueTermsInText(chapterText, terms);
            } else {
              // 如果章节没有内容，返回空数组
              terms = [];
            }
          } else {
            // 如果找不到章节，返回空数组
            terms = [];
          }
        }
        // 如果没有提供 chapter_id，保持现有行为（返回所有）
      }

      if (limit && limit > 0) {
        terms = terms.slice(0, limit);
      }

      return JSON.stringify({
        success: true,
        terms: terms.map((term) => ({
          id: term.id,
          name: term.name,
          translation: term.translation.translation,
          description: term.description,
        })),
        total: terms.length,
        all_terms_count: book.terminologies?.length || 0,
        ...(chapter_id ? { chapter_id } : {}),
        ...(all_chapters ? { all_chapters: true } : {}),
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'search_terms_by_keywords',
        description:
          '根据多个关键词搜索术语。可以搜索术语名称或翻译。支持多个关键词，返回包含任一关键词的术语（OR 逻辑）。支持可选参数 translationOnly 只返回有翻译的术语。⚠️ **重要**：查询术语信息时，必须**先**使用此工具或 get_term 查询术语数据库，**只有在数据库中没有找到时**才可以使用 search_memory_by_keywords 搜索记忆。',
        parameters: {
          type: 'object',
          properties: {
            keywords: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: '搜索关键词数组（返回包含任一关键词的术语）',
            },
            translation_only: {
              type: 'boolean',
              description: '是否只返回有翻译的术语（默认 false）',
            },
            include_memory: {
              type: 'boolean',
              description: '是否在响应中包含相关的记忆信息（默认 true）',
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
      const { keywords, translation_only = false, include_memory = true } = args;
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
          entity: 'term',
          data: {
            tool_name: 'search_terms_by_keywords',
            keywords: validKeywords,
          },
        });
      }

      const allTerms = book.terminologies || [];
      const keywordsLower = validKeywords.map((k) => k.toLowerCase());

      const filteredTerms = allTerms.filter((term) => {
        // 搜索术语名称
        const nameMatch = keywordsLower.some((keyword) =>
          term.name.toLowerCase().includes(keyword),
        );
        // 搜索翻译
        const translationMatch = keywordsLower.some((keyword) =>
          term.translation?.translation?.toLowerCase().includes(keyword),
        );

        if (translation_only) {
          // 如果设置了只返回有翻译的，则必须同时有翻译且匹配
          return translationMatch && term.translation?.translation;
        }

        // 否则只要名称或翻译匹配任一关键词即可（OR 逻辑）
        return nameMatch || translationMatch;
      });

      // 搜索相关记忆
      let relatedMemories: Array<{ id: string; summary: string }> = [];
      if (include_memory && bookId) {
        relatedMemories = await searchRelatedMemories(bookId, validKeywords, 5);
      }

      return JSON.stringify({
        success: true,
        terms: filteredTerms.map((term: Terminology) => ({
          id: term.id,
          name: term.name,
          translation: term.translation.translation,
          description: term.description,
        })),
        count: filteredTerms.length,
        ...(include_memory && relatedMemories.length > 0 ? { related_memories: relatedMemories } : {}),
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_occurrences_by_keywords',
        description:
          '根据提供的关键词获取其在书籍各章节中的出现次数。用于统计特定词汇在文本中的分布情况，帮助理解词汇的使用频率和上下文。',
        parameters: {
          type: 'object',
          properties: {
            keywords: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: '关键词数组，可以包含一个或多个关键词',
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
      const { keywords } = args;
      if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        throw new Error('关键词数组不能为空');
      }

      // 报告读取操作
      if (onAction) {
        onAction({
          type: 'read',
          entity: 'term',
          data: {
            tool_name: 'get_occurrences_by_keywords',
            keywords: keywords.filter((k) => k && typeof k === 'string' && k.trim().length > 0),
          },
        });
      }

      const occurrencesMap = await TerminologyService.getOccurrencesByKeywords(bookId, keywords);

      // 将 Map 转换为对象数组
      const occurrences = Array.from(occurrencesMap.entries()).map(([keyword, occurrences]) => ({
        keyword,
        occurrences: occurrences.map((occ) => ({
          chapterId: occ.chapterId,
          count: occ.count,
        })),
        total_count: occurrences.reduce((sum, occ) => sum + occ.count, 0),
      }));

      return JSON.stringify({
        success: true,
        occurrences,
        total_keywords: occurrences.length,
      });
    },
  },
];
