import { bookToolContext, fuzzyMatches } from './tool-feedback';
import { toolDefinition } from './tool-localization';
import { translateText } from 'src/i18n/translate';
import { LocalizedError } from 'src/utils/localized-error';
import { describeTool } from './tool-localization';
import { TerminologyService } from 'src/services/terminology-service';
import type { AppLocale } from 'src/models/locale';
import { getNameTranslation } from 'src/services/localization/selection';
import { useBooksStore } from 'src/stores/books';
import type { Terminology, Novel } from 'src/models/novel';
import type { ToolDefinition } from './types';
import { cloneDeep } from 'lodash';
import { findUniqueTermsInText } from 'src/utils/text-matcher';
import { searchRelatedMemoriesHybrid } from './memory-helper';
import {
  filterEntitiesForChapter,
  requireValidKeywords,
  resolveBookSync,
} from './chapter-scope-helpers';

/** 回退搜索最大返回条目数，避免 token 膨胀 */
const MAX_FALLBACK_RESULTS = 10;

/** 保存后的语言槽由事务生成，响应读取持久化后的对象。 */
function savedTerm(bookId: string, id: string): Terminology {
  const term = useBooksStore()
    .getBookById(bookId)
    ?.terminologies?.find((value) => value.id === id);
  if (!term) throw new LocalizedError('TERM_WRITE_REJECTED', 'aiEntityFeedback.termWriteRejected');
  return term;
}

/**
 * 构造 list_terms 工具的统一响应体（含分章/全量标记）
 */
function buildListTermsResponse(
  terms: Terminology[],
  book: Novel,
  chapter_id: string | undefined,
  all_chapters: boolean,
  language: AppLocale,
) {
  return {
    success: true,
    terms: terms.map((term) => ({
      id: term.id,
      name: term.name,
      translation: getNameTranslation(term, language)?.translation ?? '',
      description: term.description,
    })),
    total: terms.length,
    all_terms_count: book.terminologies?.length || 0,
    ...(chapter_id ? { chapter_id } : {}),
    ...(all_chapters ? { all_chapters: true } : {}),
  };
}

export const terminologyTools: ToolDefinition[] = [
  {
    definition: toolDefinition('create_term', {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: describeTool('create_term.parameters.properties.name'),
        },
        translation: {
          type: 'string',
          description: describeTool('create_term.parameters.properties.translation'),
        },
        description: {
          type: 'string',
          description: describeTool('create_term.parameters.properties.description'),
        },
      },
      required: ['name', 'translation'],
    }),
    handler: async (args, context) => {
      const { bookId, onAction, uiLocale, language } = bookToolContext(context);
      const { name, translation, description } = args as {
        name: string;
        translation: string;
        description?: string;
      };
      if (!name?.trim() || !translation?.trim()) {
        throw new LocalizedError(
          'TERM_FIELDS_REQUIRED',
          'aiEntityFeedback.termNameAndTranslation',
          {},
          uiLocale,
        );
      }

      const created = await TerminologyService.addTerminology(
        bookId,
        {
          name: name.trim(),
          translation: translation.trim(),
          ...(description !== undefined ? { description } : {}),
        },
        language,
      );

      const term = savedTerm(bookId, created.id);

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
        message: translateText(uiLocale, 'aiEntityFeedback.termCreated'),
        term: {
          id: term.id,
          name: term.name,
          translation: getNameTranslation(term, language)?.translation ?? '',
          description: term.description,
        },
      });
    },
  },
  {
    definition: toolDefinition('get_term', {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: describeTool('get_term.parameters.properties.name'),
        },
        include_memory: {
          type: 'boolean',
          description: describeTool('get_term.parameters.properties.include_memory'),
        },
      },
      required: ['name'],
    }),
    handler: async (args, context) => {
      const { bookId, onAction, uiLocale, language } = bookToolContext(context);
      const rawArgs = args as { name: string; include_memory?: boolean };
      const { include_memory = true } = rawArgs;
      // 类型守卫：确保 name 为有效字符串
      const name = typeof rawArgs.name === 'string' ? rawArgs.name.trim() : '';
      if (!name) {
        throw new LocalizedError(
          'TERM_NAME_REQUIRED',
          'aiEntityFeedback.termNameRequired',
          {},
          uiLocale,
        );
      }

      const book = resolveBookSync(bookId, uiLocale);

      const term = book.terminologies?.find((t) => t.name === name);

      if (!term) {
        // Fallback search
        const keywordLower = name.toLowerCase();
        const allTerms = book.terminologies || [];
        const fallbackMatches = allTerms.filter((t) => {
          if (t.name.toLowerCase().includes(keywordLower)) return true;
          if (getNameTranslation(t, language)?.translation.toLowerCase().includes(keywordLower))
            return true;
          return false;
        });

        if (fallbackMatches.length > 0) {
          if (onAction) {
            onAction({
              type: 'read',
              entity: 'term',
              data: {
                name,
                tool_name: 'get_term (fallback search)',
              },
            });
          }

          // 限制返回条目数，避免 token 膨胀
          const { items: limitedMatches, ...matchSummary } = fuzzyMatches(
            fallbackMatches,
            MAX_FALLBACK_RESULTS,
            uiLocale,
            name,
          );

          return JSON.stringify({
            ...matchSummary,
            terms: limitedMatches.map((t) => ({
              id: t.id,
              name: t.name,
              translation: getNameTranslation(t, language)?.translation ?? '',
              description: t.description,
            })),
          });
        }

        return JSON.stringify({
          success: false,
          error_code: 'TERM_NOT_FOUND',
          message: translateText(uiLocale, 'aiEntityFeedback.termNoMatch', { name }),
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
          relatedMemories = await searchRelatedMemoriesHybrid(
            bookId,
            [{ type: 'term', id: term.id }],
            [name],
            5,
          );
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
          translation: getNameTranslation(term, language)?.translation ?? '',
          description: term.description,
        },
        ...(include_memory && relatedMemories.length > 0
          ? { related_memories: relatedMemories }
          : {}),
      });
    },
  },
  {
    definition: toolDefinition('update_term', {
      type: 'object',
      properties: {
        term_id: {
          type: 'string',
          description: describeTool('update_term.parameters.properties.term_id'),
        },
        translation: {
          type: 'string',
          description: describeTool('update_term.parameters.properties.translation'),
        },
        description: {
          type: 'string',
          description: describeTool('update_term.parameters.properties.description'),
        },
      },
      required: ['term_id'],
    }),
    handler: async (args, context) => {
      const { bookId, onAction, uiLocale, language } = bookToolContext(context);
      const { term_id, translation, description } = args as {
        term_id: string;
        translation?: string;
        description?: string;
      };
      if (!term_id) {
        throw new LocalizedError(
          'TERM_ID_REQUIRED',
          'aiEntityFeedback.termIdRequired',
          {},
          uiLocale,
        );
      }

      if (translation !== undefined && translation !== '' && !translation.trim()) {
        throw new LocalizedError(
          'TERM_TRANSLATION_REQUIRED',
          'aiEntityFeedback.termTranslationRequired',
          {},
          uiLocale,
        );
      }

      // 在更新前获取原始数据，用于 revert
      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      const previousTerm = book?.terminologies?.find((t) => t.id === term_id);
      const previousData = previousTerm ? cloneDeep(previousTerm) : undefined;

      const updates: {
        translation?: string;
        description?: string;
      } = {};

      if (translation !== undefined) {
        updates.translation = translation.trim();
      }
      if (description !== undefined) {
        updates.description = description;
      }

      const changed = await TerminologyService.updateTerminology(
        bookId,
        term_id,
        updates,
        language,
      );

      const term = savedTerm(bookId, changed.id);

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
        message: translateText(uiLocale, 'aiEntityFeedback.termUpdated'),
        term: {
          id: term.id,
          name: term.name,
          translation: getNameTranslation(term, language)?.translation ?? '',
          description: term.description,
        },
      });
    },
  },
  {
    definition: toolDefinition('delete_term', {
      type: 'object',
      properties: {
        term_id: {
          type: 'string',
          description: describeTool('delete_term.parameters.properties.term_id'),
        },
      },
      required: ['term_id'],
    }),
    handler: async (args, context) => {
      const { bookId, onAction, uiLocale } = bookToolContext(context);
      const { term_id } = args as {
        term_id: string;
      };
      if (!term_id) {
        throw new LocalizedError(
          'TERM_ID_REQUIRED',
          'aiEntityFeedback.termIdRequired',
          {},
          uiLocale,
        );
      }

      // 在删除前获取术语信息，以便在 toast 中显示详细信息和 revert
      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      const term = book?.terminologies?.find((t) => t.id === term_id);
      const previousData = term ? cloneDeep(term) : undefined;

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
        message: translateText(uiLocale, 'aiEntityFeedback.termDeleted'),
      });
    },
  },
  {
    definition: toolDefinition('list_terms', {
      type: 'object',
      properties: {
        chapter_id: {
          type: 'string',
          description: describeTool('list_terms.parameters.properties.chapter_id'),
        },
        all_chapters: {
          type: 'boolean',
          description: describeTool('list_terms.parameters.properties.all_chapters'),
        },
        limit: {
          type: 'number',
          description: describeTool('list_terms.parameters.properties.limit'),
        },
      },
      required: [],
    }),
    handler: async (args, context) => {
      const { bookId, onAction, uiLocale, language } = bookToolContext(context);
      const {
        chapter_id,
        all_chapters = false,
        limit,
      } = args as {
        chapter_id?: string;
        all_chapters?: boolean;
        limit?: number;
      };
      const book = resolveBookSync(bookId);

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

      // 如果 all_chapters 为 false 且提供了 chapter_id，按章节文本过滤
      if (!all_chapters && chapter_id) {
        terms = await filterEntitiesForChapter(book, chapter_id, terms, findUniqueTermsInText);
      }

      if (limit && limit > 0) {
        terms = terms.slice(0, limit);
      }

      return JSON.stringify(
        buildListTermsResponse(terms, book, chapter_id, all_chapters, language),
      );
    },
  },
  {
    definition: toolDefinition('search_terms_by_keywords', {
      type: 'object',
      properties: {
        keywords: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: describeTool('search_terms_by_keywords.parameters.properties.keywords'),
        },
        translation_only: {
          type: 'boolean',
          description: describeTool(
            'search_terms_by_keywords.parameters.properties.translation_only',
          ),
        },
        include_memory: {
          type: 'boolean',
          description: describeTool(
            'search_terms_by_keywords.parameters.properties.include_memory',
          ),
        },
      },
      required: ['keywords'],
    }),
    handler: async (args, context) => {
      const { bookId, onAction, uiLocale, language } = bookToolContext(context);
      const {
        keywords,
        translation_only = false,
        include_memory = true,
      } = args as {
        keywords: string[];
        translation_only?: boolean;
        include_memory?: boolean;
      };
      const validKeywords = requireValidKeywords(keywords);

      const book = resolveBookSync(bookId);

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
          getNameTranslation(term, language)?.translation.toLowerCase().includes(keyword),
        );

        if (translation_only) {
          // 如果设置了只返回有翻译的，则必须同时有翻译且匹配
          return translationMatch && getNameTranslation(term, language)?.translation;
        }

        // 否则只要名称或翻译匹配任一关键词即可（OR 逻辑）
        return nameMatch || translationMatch;
      });

      // 搜索相关记忆
      let relatedMemories: Array<{ id: string; summary: string }> = [];
      if (include_memory && bookId) {
        const attachments = filteredTerms.map((term) => ({
          type: 'term' as const,
          id: term.id,
        }));
        relatedMemories = await searchRelatedMemoriesHybrid(bookId, attachments, validKeywords, 5);
      }

      return JSON.stringify({
        success: true,
        terms: filteredTerms.map((term: Terminology) => ({
          id: term.id,
          name: term.name,
          translation: getNameTranslation(term, language)?.translation ?? '',
          description: term.description,
        })),
        count: filteredTerms.length,
        ...(include_memory && relatedMemories.length > 0
          ? { related_memories: relatedMemories }
          : {}),
      });
    },
  },
  {
    definition: toolDefinition('get_occurrences_by_keywords', {
      type: 'object',
      properties: {
        keywords: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: describeTool('get_occurrences_by_keywords.parameters.properties.keywords'),
        },
      },
      required: ['keywords'],
    }),
    handler: async (args, context) => {
      const { bookId, onAction, uiLocale } = bookToolContext(context);
      const { keywords } = args as {
        keywords: string[];
      };
      if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        throw new LocalizedError(
          'KEYWORDS_REQUIRED',
          'aiEntityFeedback.keywordsRequired',
          {},
          uiLocale,
        );
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
