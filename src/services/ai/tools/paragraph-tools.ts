import { ChapterService, type ParagraphSearchResult } from 'src/services/chapter-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import type { useBooksStore } from 'src/stores/books';
import { useAIModelsStore } from 'src/stores/ai-models';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';
import {
  isEmptyParagraph,
  CJK_CHAR_CLASS,
  hasCJK,
  isCJK,
  isEmptyOrSymbolOnly,
} from 'src/utils/text-utils';
import { UniqueIdGenerator } from 'src/utils/id-generator';
import type { Novel, Paragraph, Translation } from 'src/models/novel';
import type { ToolDefinition, ActionInfo, ToolContext } from './types';
import { searchRelatedMemoriesHybrid } from './memory-helper';
import {
  collectChapterLocationsInRange,
  ensureChaptersLoaded,
  filterValidKeywords,
  resolveBook,
  resolveBookAndParagraphLocation,
  resolveSearchRange,
} from './paragraph-search-helpers';
import { buildChapterTitleSummary, buildVolumeTitleSummary } from './title-helpers';

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

  // 先按常见分隔符分割（如空格、标点等），然后再清理每个部分
  const parts = truncated.split(/[\s、。，．！？]+/).filter((p) => p.length > 0);

  if (parts.length === 0) {
    return [];
  }

  // 清理每个部分（移除残留的标点符号和空白字符）
  const cleanedParts = parts
    .map((p) => p.replace(/[、。，．！？\s]+/g, '').trim())
    .filter((p) => p.length > 0);

  if (cleanedParts.length === 0) {
    return [];
  }

  // 如果只有一个部分，直接返回
  if (cleanedParts.length === 1) {
    return [cleanedParts[0]!];
  }

  // 返回前几个部分（最多3个）
  return cleanedParts.slice(0, 3);
}

/**
 * 将段落索引转换为展示索引（从 1 开始）
 */
function toDisplayParagraphIndex(paragraphIndex: number): number {
  return paragraphIndex + 1;
}

/**
 * 选取段落的展示翻译文本：优先当前选中版本，其次第一条翻译，最后回退空字符串。
 * 被 `toSearchResponseItem` / `previous_paragraphs` / `next_paragraphs` 等多处共享。
 */
function pickDisplayTranslation(paragraph: Paragraph): string {
  return (
    paragraph.translations.find((t) => t.id === paragraph.selectedTranslationId)?.translation ||
    paragraph.translations[0]?.translation ||
    ''
  );
}

/**
 * 构造段落翻译条目的基础结构（id / translation / aiModelId / aiModelName / isSelected）。
 * 被 `get_paragraph_info` 与 `get_translation_history` 共享；后者在返回时额外追加
 * index / isLatest 字段，调用方按需展开。
 */
function buildTranslationBaseEntry(
  translation: Translation,
  paragraph: Paragraph,
  aiModelsStore: ReturnType<typeof useAIModelsStore>,
): {
  id: string;
  translation: string;
  aiModelId: string;
  aiModelName: string;
  isSelected: boolean;
} {
  return {
    id: translation.id,
    translation: translation.translation,
    aiModelId: translation.aiModelId,
    aiModelName: aiModelsStore.getModelById(translation.aiModelId)?.name || '未知模型',
    isSelected: translation.id === paragraph.selectedTranslationId,
  };
}

/**
 * 基于段落文本提取关键词并查询相关记忆。
 * 多个工具（get_paragraph_info / get_translation_history / get_previous_paragraphs /
 * get_next_paragraphs）共享同一套「从段落文本提取关键词 → 混合记忆搜索」流程。
 * include_memory=false、bookId 缺失、text 为空、关键词为空等场景统一返回空数组。
 */
async function fetchRelatedMemoriesFromParagraphText(
  bookId: string | undefined,
  text: string | undefined,
  includeMemory: boolean,
): Promise<Array<{ id: string; summary: string }>> {
  if (!includeMemory || !bookId || !text) {
    return [];
  }
  const keywords = extractKeywordsFromParagraph(text, 20);
  if (keywords.length === 0) {
    return [];
  }
  return searchRelatedMemoriesHybrid(bookId, [], keywords, 5);
}

/**
 * 将段落搜索结果序列化为工具返回的 JSON 字符串。
 * 被邻近段落查询 / 关键词搜索等多个工具共享的响应结构。
 * @param validResults 已经过空段落过滤的搜索结果
 * @param includeMemory 是否启用记忆联查
 * @param relatedMemories 已查询好的相关记忆（调用方负责决定关键词来源）
 */
/**
 * 将 ParagraphSearchResult 序列化为工具返回 JSON 里的段落条目（含 chapter/volume 标题与翻译）。
 */
function toSearchResponseItem(result: ParagraphSearchResult) {
  return {
    id: result.paragraph.id,
    text: result.paragraph.text,
    translation: pickDisplayTranslation(result.paragraph),
    chapter: {
      id: result.chapter.id,
      title:
        typeof result.chapter.title === 'string'
          ? result.chapter.title
          : result.chapter.title.original,
      title_translation:
        typeof result.chapter.title === 'string'
          ? ''
          : result.chapter.title.translation?.translation || '',
    },
    volume: {
      id: result.volume.id,
      title:
        typeof result.volume.title === 'string'
          ? result.volume.title
          : result.volume.title.original,
      title_translation:
        typeof result.volume.title === 'string'
          ? ''
          : result.volume.title.translation?.translation || '',
    },
    paragraph_index: toDisplayParagraphIndex(result.paragraphIndex),
    chapter_index: result.chapterIndex,
    volume_index: result.volumeIndex,
  };
}

function buildParagraphSearchResponse(
  validResults: ParagraphSearchResult[],
  includeMemory: boolean,
  relatedMemories: Array<{ id: string; summary: string }>,
): string {
  return JSON.stringify({
    success: true,
    paragraphs: validResults.map(toSearchResponseItem),
    count: validResults.length,
    ...(includeMemory && relatedMemories.length > 0
      ? { related_memories: relatedMemories }
      : {}),
  });
}

/**
 * `select_translation` / `remove_translation` 共享的前置流程：
 * 校验参数 → 查找书籍 → 定位目标段落。
 * 返回 discriminated union：ok=true 提供调用方继续处理需要的上下文，
 * ok=false 携带可直接返回给工具的 JSON 字符串（段落不存在的软失败）。
 * 硬错误（bookId / id 为空、书不存在）仍以 throw 抛出。
 *
 * 注意：不做 translations 非空校验 —— 两个调用方相对于 onAction 的顺序
 * 不同，需要各自保留原有副作用顺序。
 */
async function resolveTranslationTarget(
  bookId: string | undefined,
  args: Record<string, unknown>,
): Promise<
  | {
      ok: true;
      bookId: string;
      book: Novel;
      paragraph: Paragraph;
      paragraph_id: string;
      translation_id: string;
      booksStore: ReturnType<typeof useBooksStore>;
    }
  | { ok: false; response: string }
> {
  const { paragraph_id, translation_id } = args as {
    paragraph_id: string;
    translation_id: string;
  };
  if (!paragraph_id || !translation_id) {
    throw new Error('段落 ID 和翻译 ID 不能为空');
  }

  const resolved = await resolveBookAndParagraphLocation(bookId, paragraph_id);
  if (!resolved.ok) {
    return resolved;
  }

  return {
    ok: true,
    bookId: resolved.bookId,
    book: resolved.book,
    paragraph: resolved.location.paragraph,
    paragraph_id,
    translation_id,
    booksStore: resolved.booksStore,
  };
}

/**
 * `update_translation` / `remove_translation` 共享的翻译查找+校验流程：
 * 校验段落是否存在翻译历史 → 按 id 定位目标翻译。
 * 返回 discriminated union：ok=true 提供索引与条目，
 * ok=false 携带可直接返回给工具的 JSON 字符串（软失败）。
 */
function locateTranslationById(
  paragraph: Paragraph,
  translation_id: string,
  action: 'update' | 'delete',
):
  | { ok: true; index: number; translation: Translation }
  | { ok: false; response: string } {
  if (!paragraph.translations || paragraph.translations.length === 0) {
    return {
      ok: false,
      response: JSON.stringify({
        success: false,
        error: `段落没有翻译历史`,
      }),
    };
  }

  const index = paragraph.translations.findIndex((t) => t.id === translation_id);
  if (index === -1) {
    return {
      ok: false,
      response: JSON.stringify({
        success: false,
        error: `翻译 ID 不存在: ${translation_id}`,
      }),
    };
  }

  const translation = paragraph.translations[index];
  if (!translation) {
    // 非软失败场景，理论上 findIndex 命中则元素必然存在，
    // 这里仅是 TypeScript 的 noUncheckedIndexedAccess 防御。
    const verb = action === 'update' ? '更新' : '删除';
    return {
      ok: false,
      response: JSON.stringify({
        success: false,
        error: `无法找到要${verb}的翻译`,
      }),
    };
  }

  return { ok: true, index, translation };
}

/**
 * `get_previous_paragraphs` 与 `get_next_paragraphs` 共享的参数 schema。
 * 两者接受完全相同的 paragraph_id / count / include_memory 参数。
 */
const NEIGHBOR_PARAGRAPHS_PARAMETERS: ToolDefinition['definition']['function']['parameters'] = {
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
};

/**
 * `get_previous_paragraphs` 与 `get_next_paragraphs` 共享的处理逻辑。
 * 两者除了调用的 ChapterService 方法以及上报的 tool_name 外完全一致。
 */
async function handleNeighborParagraphs(
  args: Record<string, unknown>,
  context: ToolContext,
  options: {
    toolName: 'get_previous_paragraphs' | 'get_next_paragraphs';
    fetch: (
      book: Parameters<typeof ChapterService.getPreviousParagraphsAsync>[0],
      paragraphId: string,
      count: number,
    ) => Promise<ParagraphSearchResult[]>;
  },
): Promise<string> {
  const { bookId: rawBookId, onAction } = context;
  const {
    paragraph_id,
    count = 3,
    include_memory = true,
  } = args as {
    paragraph_id: string;
    count?: number;
    include_memory?: boolean;
  };
  if (!paragraph_id) {
    throw new Error('段落 ID 不能为空');
  }

  const { bookId, book } = resolveBook(rawBookId);

  // 检查起始段落是否在块边界内
  // if (!isParagraphInChunk(paragraph_id, chunkBoundaries)) {
  //   return getOutOfBoundsError(chunkBoundaries);
  // }

  // 报告读取操作
  if (onAction) {
    onAction({
      type: 'read',
      entity: 'paragraph',
      data: {
        paragraph_id,
        tool_name: options.toolName,
      },
    });
  }

  // 使用优化的异步方法，按需加载章节内容
  const results = await options.fetch(book, paragraph_id, count);

  // 过滤掉空段落或仅包含符号的段落
  const validResults = results.filter((result) => !isEmptyOrSymbolOnly(result.paragraph.text));

  // 移除块边界限制，允许跨 chunk 获取上下文
  // validResults = filterResultsByChunkBoundary(validResults, chunkBoundaries);

  // 如果过滤后没有结果，说明请求超出了块边界
  // if (chunkBoundaries && validResults.length === 0) {
  //   return getOutOfBoundsError(chunkBoundaries);
  // }

  // 搜索相关记忆（从第一个段落的文本中提取关键词）
  const relatedMemories = await fetchRelatedMemoriesFromParagraphText(
    bookId,
    validResults[0]?.paragraph?.text,
    include_memory,
  );

  return buildParagraphSearchResponse(validResults, include_memory, relatedMemories);
}

/**
 * 在文本中替换完整的关键词（作为独立词，不是其他词的一部分）
 * @param text 要替换的文本
 * @param keyword 要替换的关键词
 * @param replacement 替换文本
 * @returns 替换后的文本
 */
function classifyKeywordContext(
  text: string,
  keyword: string,
): { isEnglishWord: boolean; containsCJK: boolean; textHasCJK: boolean; escapedKeyword: string } {
  return {
    isEnglishWord: /^[a-zA-Z]+$/.test(keyword),
    containsCJK: hasCJK(keyword),
    textHasCJK: hasCJK(text),
    escapedKeyword: keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  };
}

function buildEnglishWordPattern(escapedKeyword: string, flags: string): RegExp {
  return new RegExp(
    `(^|[^a-zA-Z0-9]|[${CJK_CHAR_CLASS}])${escapedKeyword}([^a-zA-Z0-9]|[${CJK_CHAR_CLASS}]|$)`,
    flags,
  );
}

function buildCjkPattern(escapedKeyword: string, flags: string): RegExp {
  return new RegExp(
    `(^|[^${CJK_CHAR_CLASS}])${escapedKeyword}([^${CJK_CHAR_CLASS}]|$)`,
    flags,
  );
}

function buildAsciiWordPattern(escapedKeyword: string, flags: string): RegExp {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapedKeyword}([^\\p{L}\\p{N}]|$)`, flags);
}

function boundaryTypesAt(text: string, keyword: string, index: number): {
  isValidBoundary: boolean;
} {
  const beforeChar = index > 0 ? (text[index - 1] ?? '') : '';
  const afterChar =
    index + keyword.length < text.length ? (text[index + keyword.length] ?? '') : '';
  const beforeIsBoundary = index === 0 || !isCJK(beforeChar);
  const afterIsBoundary = index + keyword.length === text.length || !isCJK(afterChar);
  const beforeIsCJK = index > 0 && isCJK(beforeChar);
  const afterIsCJK = index + keyword.length < text.length && isCJK(afterChar);
  return {
    isValidBoundary:
      (beforeIsBoundary && afterIsBoundary) ||
      (beforeIsCJK && afterIsCJK) ||
      (beforeIsBoundary && afterIsCJK) ||
      (beforeIsCJK && afterIsBoundary),
  };
}

function replaceKeywordInCjkFallback(text: string, keyword: string, replacement: string): string {
  const parts: string[] = [];
  let lastIndex = 0;
  let searchIndex = 0;
  let anyMatch = false;
  while (true) {
    const index = text.indexOf(keyword, searchIndex);
    if (index === -1) break;
    if (boundaryTypesAt(text, keyword, index).isValidBoundary) {
      if (index > lastIndex) parts.push(text.substring(lastIndex, index));
      parts.push(replacement);
      lastIndex = index + keyword.length;
      anyMatch = true;
    }
    searchIndex = index + 1;
  }
  if (!anyMatch) return text;
  if (lastIndex < text.length) parts.push(text.substring(lastIndex));
  return parts.join('');
}

// fallow-ignore-next-line unused-export
export function replaceWholeKeyword(text: string, keyword: string, replacement: string): string {
  if (!text || !keyword) return text;
  const { isEnglishWord, containsCJK, textHasCJK, escapedKeyword } = classifyKeywordContext(
    text,
    keyword,
  );

  const applyBoundaryReplace = (pattern: RegExp) =>
    text.replace(pattern, (_match, before, after) => `${before || ''}${replacement}${after || ''}`);

  if (isEnglishWord && !containsCJK) {
    return applyBoundaryReplace(buildEnglishWordPattern(escapedKeyword, 'giu'));
  }
  if (!containsCJK && !textHasCJK) {
    return applyBoundaryReplace(buildAsciiWordPattern(escapedKeyword, 'giu'));
  }
  const firstPass = applyBoundaryReplace(buildCjkPattern(escapedKeyword, 'giu'));
  if (firstPass !== text) return firstPass;
  return replaceKeywordInCjkFallback(text, keyword, replacement);
}

/**
 * 检查文本中是否包含完整的关键词（作为独立词，不是其他词的一部分）
 * @param text 要搜索的文本
 * @param keyword 关键词
 * @returns 如果文本中包含完整的关键词，返回 true
 */
function tryCjkLookbehindPattern(escapedKeyword: string): RegExp | null {
  try {
    const p = new RegExp(
      `(?<=[${CJK_CHAR_CLASS}]|^)${escapedKeyword}(?=[${CJK_CHAR_CLASS}]|$)`,
      'iu',
    );
    p.test('test');
    return p;
  } catch {
    return null;
  }
}

function containsKeywordInCjkFallback(text: string, keyword: string): boolean {
  let searchIndex = 0;
  while (true) {
    const index = text.indexOf(keyword, searchIndex);
    if (index === -1) return false;
    if (boundaryTypesAt(text, keyword, index).isValidBoundary) return true;
    searchIndex = index + 1;
  }
}

export function containsWholeKeyword(text: string, keyword: string): boolean {
  if (!text || !keyword) return false;
  const { isEnglishWord, containsCJK, textHasCJK, escapedKeyword } = classifyKeywordContext(
    text,
    keyword,
  );

  if (isEnglishWord && !containsCJK) {
    return buildEnglishWordPattern(escapedKeyword, 'iu').test(text);
  }
  if (!containsCJK && !textHasCJK) {
    return buildAsciiWordPattern(escapedKeyword, 'iu').test(text);
  }
  if (buildCjkPattern(escapedKeyword, 'iu').test(text)) return true;
  const lookbehindPattern = tryCjkLookbehindPattern(escapedKeyword);
  if (lookbehindPattern && lookbehindPattern.test(text)) return true;
  return containsKeywordInCjkFallback(text, keyword);
}

export const paragraphTools: ToolDefinition[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_paragraph_position',
        description:
          '获取段落在章节中的位置信息，包括段落在章节中的索引、章节中段落的总数，以及可选的前后段落。用于了解当前段落在章节中的位置，方便进行上下文分析。',
        parameters: {
          type: 'object',
          properties: {
            paragraph_id: {
              type: 'string',
              description: '段落 ID',
            },
            include_previous: {
              type: 'boolean',
              description: '是否包含前 x 个段落（默认 false）',
            },
            include_next: {
              type: 'boolean',
              description: '是否包含后 x 个段落（默认 false）',
            },
            previous_count: {
              type: 'number',
              description: '前段落数量（默认 3）',
            },
            next_count: {
              type: 'number',
              description: '后段落数量（默认 3）',
            },
          },
          required: ['paragraph_id'],
        },
      },
    },
    handler: async (args, { bookId, onAction, chunkBoundaries: _chunkBoundaries }) => {
      if (!bookId) {
        throw new Error('书籍 ID 不能为空');
      }
      const {
        paragraph_id,
        include_previous = false,
        include_next = false,
        previous_count = 3,
        next_count = 3,
      } = args as {
        paragraph_id: string;
        include_previous?: boolean;
        include_next?: boolean;
        previous_count?: number;
        next_count?: number;
      };
      // 检查段落是否在块边界内 (Removed restriction to allow context view)
      // if (!isParagraphInChunk(paragraph_id, chunkBoundaries)) {
      //   return getOutOfBoundsError(chunkBoundaries);
      // }

      const resolved = await resolveBookAndParagraphLocation(bookId, paragraph_id);
      if (!resolved.ok) {
        return resolved.response;
      }

      const { book } = resolved;
      const {
        paragraph,
        chapter,
        paragraphIndex,
        chapterIndex: _chapterIndex,
        volume: _volume,
        volumeIndex: _volumeIndex,
      } = resolved.location;

      // 报告读取操作
      if (onAction) {
        onAction({
          type: 'read',
          entity: 'paragraph',
          data: {
            paragraph_id,
            chapter_id: chapter.id,
            tool_name: 'get_paragraph_position',
          },
        });
      }

      // 计算章节中段落的总数
      const totalParagraphs = chapter.content?.length || 0;

      const displayParagraphIndex = toDisplayParagraphIndex(paragraphIndex);

      // 构建响应
      const response: {
        success: true;
        paragraph_id: string;
        chapter_id: string;
        chapter_title: string;
        paragraph_index: number;
        total_paragraphs: number;
        progress_percentage: number;
        previous_paragraphs?: Array<{
          id: string;
          text: string;
          translation: string;
          paragraph_index: number;
        }>;
        next_paragraphs?: Array<{
          id: string;
          text: string;
          translation: string;
          paragraph_index: number;
        }>;
      } = {
        success: true,
        paragraph_id: paragraph.id,
        chapter_id: chapter.id,
        chapter_title: getChapterDisplayTitle(chapter),
        paragraph_index: displayParagraphIndex,
        total_paragraphs: totalParagraphs,
        progress_percentage:
          totalParagraphs > 0 ? Math.round((displayParagraphIndex / totalParagraphs) * 100) : 0,
      };

      // 可选：获取前 x 个段落（受块边界限制）
      if (include_previous) {
        const previousResults = await ChapterService.getPreviousParagraphsAsync(
          book,
          paragraph_id,
          previous_count,
        );
        // 过滤掉空段落或仅包含符号的段落
        const validPreviousResults = previousResults.filter(
          (result) => !isEmptyOrSymbolOnly(result.paragraph.text),
        );
        // 移除块边界过滤
        // validPreviousResults = filterResultsByChunkBoundary(validPreviousResults, chunkBoundaries);
        response.previous_paragraphs = validPreviousResults.map((result) => ({
          id: result.paragraph.id,
          text: result.paragraph.text,
          translation: pickDisplayTranslation(result.paragraph),
          paragraph_index: toDisplayParagraphIndex(result.paragraphIndex),
        }));
      }

      // 可选：获取后 x 个段落（受块边界限制）
      if (include_next) {
        const nextResults = await ChapterService.getNextParagraphsAsync(
          book,
          paragraph_id,
          next_count,
        );
        // 过滤掉空段落或仅包含符号的段落
        const validNextResults = nextResults.filter(
          (result) => !isEmptyOrSymbolOnly(result.paragraph.text),
        );
        // 移除块边界过滤
        // validNextResults = filterResultsByChunkBoundary(validNextResults, chunkBoundaries);
        response.next_paragraphs = validNextResults.map((result) => ({
          id: result.paragraph.id,
          text: result.paragraph.text,
          translation: pickDisplayTranslation(result.paragraph),
          paragraph_index: toDisplayParagraphIndex(result.paragraphIndex),
        }));
      }

      return JSON.stringify(response);
    },
  },
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
      const { paragraph_id, include_memory = true } = args as {
        paragraph_id: string;
        include_memory?: boolean;
      };

      const resolved = await resolveBookAndParagraphLocation(bookId, paragraph_id);
      if (!resolved.ok) {
        return resolved.response;
      }

      const { paragraph, chapter, volume } = resolved.location;
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
        paragraph.translations?.map((t) => buildTranslationBaseEntry(t, paragraph, aiModelsStore)) ||
        [];

      // 搜索相关记忆（从段落文本中提取关键词）
      const relatedMemories = await fetchRelatedMemoriesFromParagraphText(
        bookId,
        paragraph.text,
        include_memory,
      );

      return JSON.stringify({
        success: true,
        paragraph: {
          id: paragraph.id,
          text: paragraph.text,
          selectedTranslationId: paragraph.selectedTranslationId || '',
          translations,
          chapter: buildChapterTitleSummary(chapter),
          volume: buildVolumeTitleSummary(volume),
          paragraphIndex: toDisplayParagraphIndex(resolved.location.paragraphIndex),
          chapterIndex: resolved.location.chapterIndex,
          volumeIndex: resolved.location.volumeIndex,
        },
        ...(include_memory && relatedMemories.length > 0
          ? { related_memories: relatedMemories }
          : {}),
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
        parameters: NEIGHBOR_PARAGRAPHS_PARAMETERS,
      },
    },
    handler: async (args, context) =>
      handleNeighborParagraphs(args, context, {
        toolName: 'get_previous_paragraphs',
        fetch: (book, paragraphId, count) =>
          ChapterService.getPreviousParagraphsAsync(book, paragraphId, count),
      }),
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_next_paragraphs',
        description:
          '获取指定段落之后的若干个段落。用于查看当前段落之后的上下文，帮助理解文本的连贯性。',
        parameters: NEIGHBOR_PARAGRAPHS_PARAMETERS,
      },
    },
    handler: async (args, context) =>
      handleNeighborParagraphs(args, context, {
        toolName: 'get_next_paragraphs',
        fetch: (book, paragraphId, count) =>
          ChapterService.getNextParagraphsAsync(book, paragraphId, count),
      }),
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'find_paragraph_by_keywords',
        description:
          '根据多个关键词查找包含任一关键词的段落。用于在翻译过程中查找特定内容或验证翻译的一致性。支持在原文或翻译文本中搜索，如果同时提供两者，则只返回同时满足两个条件的段落。支持多个关键词，返回包含任一关键词的段落（OR 逻辑）。[警告] **敬语翻译**：翻译敬语时，必须**首先**使用 search_memories 搜索记忆中关于该角色敬语翻译的相关信息，**然后**再使用此工具搜索该角色在之前段落中的翻译，以确保翻译一致性。如果提供 chapter_id 参数，则仅在指定章节内搜索；如果不提供，则搜索所有章节。',
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
    handler: async (args, { bookId: rawBookId, onAction }) => {
      const {
        keywords,
        translation_keywords,
        chapter_id,
        max_paragraphs = 1,
        only_with_translation = false,
        include_memory = true,
      } = args as {
        keywords?: string[];
        translation_keywords?: string[];
        chapter_id?: string;
        max_paragraphs?: number;
        only_with_translation?: boolean;
        include_memory?: boolean;
      };

      // 验证至少提供一个关键词数组
      if (
        (!keywords || !Array.isArray(keywords) || keywords.length === 0) &&
        (!translation_keywords ||
          !Array.isArray(translation_keywords) ||
          translation_keywords.length === 0)
      ) {
        throw new Error('必须提供 keywords 或 translation_keywords 至少一个关键词数组');
      }

      const validKeywords = filterValidKeywords(keywords);
      const validTranslationKeywords = filterValidKeywords(translation_keywords);

      if (validKeywords.length === 0 && validTranslationKeywords.length === 0) {
        throw new Error('必须提供至少一个有效的关键词数组');
      }

      const { bookId, book } = resolveBook(rawBookId);

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

      // 尝试使用全文索引搜索原文
      if (validKeywords.length > 0) {
        try {
          const { FullTextIndexService } = await import('src/services/full-text-index-service');
          const indexResults = await FullTextIndexService.search(bookId, validKeywords, {
            ...(chapter_id ? { chapterId: chapter_id } : {}),
            maxResults: max_paragraphs * validKeywords.length * 2, // 增加搜索数量以应对去重和后续过滤
            onlyWithTranslation: only_with_translation,
            searchInOriginal: true,
            searchInTranslations: false,
            // 传入当前 book 引用，确保返回的段落/章节对象与 booksStore 一致
            novel: book,
          });

          // 将结果添加到 Map 中，使用段落 ID 作为 key 去重
          for (const result of indexResults) {
            if (!allResults.has(result.paragraph.id)) {
              allResults.set(result.paragraph.id, result);
            }
          }
        } catch (error) {
          // 如果索引不可用，回退到线性搜索
          console.warn('Full-text index search failed, falling back to linear search:', error);
          for (const keyword of validKeywords) {
            // 使用优化的异步方法，按需加载章节内容（只加载需要搜索的章节）
            const results = await ChapterService.searchParagraphsByKeywordAsync(
              book,
              keyword,
              chapter_id || undefined,
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
          // 限制处理的章节数量，防止在没有 chapter_id 且索引失败时性能过低
          const MAX_CHAPTERS_TO_LOAD = 50;

          const searchRange = resolveSearchRange(book, chapter_id);
          if (!searchRange) {
            return JSON.stringify({ success: true, message: '书籍没有卷', replaced_count: 0 });
          }

          const locations = collectChapterLocationsInRange(book, searchRange);
          const toLoad = locations
            .filter((loc) => loc.chapter.content === undefined)
            .slice(0, MAX_CHAPTERS_TO_LOAD);
          if (locations.filter((loc) => loc.chapter.content === undefined).length > MAX_CHAPTERS_TO_LOAD) {
            console.warn(`[paragraphTools] 搜索章节过多，限制在前 ${MAX_CHAPTERS_TO_LOAD} 章`);
          }
          await ensureChaptersLoaded(toLoad.map((loc) => loc.chapter));

          const translationKeywordLower = validTranslationKeywords.map((k) => k.toLowerCase());
          const paragraphHasTranslationKeyword = (paragraph: { translations?: Translation[] }) =>
            !!paragraph.translations?.some((t) =>
              translationKeywordLower.some((kw) => t.translation?.toLowerCase().includes(kw)),
            );

          outer: for (const location of locations) {
            const { chapter, chapterIndex: cIndex, volume, volumeIndex: vIndex } = location;
            if (chapter.content === undefined) {
              const content = await ChapterContentService.loadChapterContent(chapter.id);
              chapter.content = content || [];
              chapter.contentLoaded = true;
            }
            if (!chapter.content) continue;

            for (let pIndex = 0; pIndex < chapter.content.length; pIndex++) {
              if (allResults.size >= max_paragraphs) break outer;

              const paragraph = chapter.content[pIndex];
              if (!paragraph) continue;
              if (!paragraph.translations || paragraph.translations.length === 0) continue;
              if (allResults.has(paragraph.id)) continue;
              if (!paragraphHasTranslationKeyword(paragraph)) continue;

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
          relatedMemories = await searchRelatedMemoriesHybrid(bookId, [], searchKeywords, 5);
        }
      }

      return buildParagraphSearchResponse(validResults, include_memory, relatedMemories);
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
    handler: async (args, { bookId: rawBookId, onAction }) => {
      const {
        regex_pattern,
        chapter_id,
        max_paragraphs = 1,
        only_with_translation = false,
        search_in_translation = false,
      } = args as {
        regex_pattern: string;
        chapter_id?: string;
        max_paragraphs?: number;
        only_with_translation?: boolean;
        search_in_translation?: boolean;
      };
      if (
        !regex_pattern ||
        typeof regex_pattern !== 'string' ||
        regex_pattern.trim().length === 0
      ) {
        throw new Error('正则表达式模式不能为空');
      }

      const { bookId, book } = resolveBook(rawBookId);

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
        chapter_id || undefined,
        max_paragraphs,
        only_with_translation,
        search_in_translation,
      );

      // 过滤掉空段落或仅包含符号的段落
      const validResults = results.filter((result) => !isEmptyOrSymbolOnly(result.paragraph.text));

      return JSON.stringify({
        success: true,
        paragraphs: validResults.map(toSearchResponseItem),
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
      const { paragraph_id, include_memory = true } = args as {
        paragraph_id: string;
        include_memory?: boolean;
      };

      const resolved = await resolveBookAndParagraphLocation(bookId, paragraph_id);
      if (!resolved.ok) {
        return resolved.response;
      }

      const aiModelsStore = useAIModelsStore();
      const { paragraph } = resolved.location;

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
      const totalTranslations = paragraph.translations?.length || 0;
      const translationHistory =
        paragraph.translations?.map((t, index) => ({
          ...buildTranslationBaseEntry(t, paragraph, aiModelsStore),
          index: index + 1, // 从1开始的索引
          isLatest: index === totalTranslations - 1, // 是否是最新的翻译
        })) || [];

      // 搜索相关记忆（从段落文本中提取关键词）
      const relatedMemories = await fetchRelatedMemoriesFromParagraphText(
        bookId,
        paragraph.text,
        include_memory,
      );

      return JSON.stringify({
        success: true,
        paragraph_id: paragraph.id,
        paragraph_text: paragraph.text,
        selected_translation_id: paragraph.selectedTranslationId || '',
        translation_history: translationHistory,
        total_count: translationHistory.length,
        ...(include_memory && relatedMemories.length > 0
          ? { related_memories: relatedMemories }
          : {}),
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
      const { paragraph_id, translation_id, new_translation } = args as {
        paragraph_id: string;
        translation_id: string;
        new_translation: string;
      };
      if (!paragraph_id || !translation_id || !new_translation) {
        throw new Error('段落 ID、翻译 ID 和新翻译内容不能为空');
      }

      const resolved = await resolveBookAndParagraphLocation(bookId, paragraph_id);
      if (!resolved.ok) {
        return resolved.response;
      }

      const { bookId: resolvedBookId, book, booksStore } = resolved;
      const { paragraph } = resolved.location;

      // 检查是否为空段落
      if (isEmptyParagraph(paragraph.text)) {
        return JSON.stringify({
          success: false,
          error: '无法更新空段落的翻译',
        });
      }

      // 查找要更新的翻译
      const locateResult = locateTranslationById(paragraph, translation_id, 'update');
      if (!locateResult.ok) {
        return locateResult.response;
      }
      const translationToUpdate = locateResult.translation;
      // 保存原始翻译用于撤销
      const originalTranslation = { ...translationToUpdate };

      // 更新翻译内容（原样保存，不进行任何处理）
      // 缩进过滤会在显示和导出时应用
      translationToUpdate.translation = new_translation;

      // 更新书籍（保存更改）
      // 注意：booksStore.updateBook 会调用 BookService.saveBook，章节内容保存会启用 skipIfUnchanged。
      // ChapterContentService 使用“序列化快照”检测变化（含就地修改），既能正确持久化修改，也能避免未修改内容的重复写入。
      await booksStore.updateBook(resolvedBookId, { volumes: book.volumes });

      // 报告操作
      if (onAction) {
        onAction({
          type: 'update',
          entity: 'translation',
          data: {
            paragraph_id,
            translation_id,
            old_translation: originalTranslation.translation,
            new_translation: new_translation,
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
        new_translation: new_translation,
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
    handler: async (args, context) => {
      const { onAction } = context;
      const resolved = await resolveTranslationTarget(context.bookId, args);
      if (!resolved.ok) {
        return resolved.response;
      }
      const { bookId, book, paragraph, paragraph_id, translation_id, booksStore } = resolved;

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
      // 注意：章节内容保存会启用 skipIfUnchanged，并用“序列化快照”检测变化（含就地修改）。
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
      const {
        paragraph_id,
        translation,
        ai_model_id,
        set_as_selected = true,
      } = args as {
        paragraph_id: string;
        translation: string;
        ai_model_id?: string;
        set_as_selected?: boolean;
      };
      if (!translation) {
        throw new Error('段落 ID 和翻译内容不能为空');
      }

      const resolved = await resolveBookAndParagraphLocation(bookId, paragraph_id);
      if (!resolved.ok) {
        return resolved.response;
      }

      const { bookId: resolvedBookId, book, booksStore } = resolved;
      const aiModelsStore = useAIModelsStore();
      const { paragraph } = resolved.location;

      // 检查是否为空段落
      if (isEmptyParagraph(paragraph.text)) {
        return JSON.stringify({
          success: false,
          error: '无法为空段落添加翻译',
        });
      }

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

      // 创建新的翻译对象（原样保存，不进行任何处理）
      // 缩进过滤会在显示和导出时应用
      const existingTranslationIds = paragraph.translations?.map((t) => t.id) || [];
      const idGenerator = new UniqueIdGenerator(existingTranslationIds);
      const newTranslation: Translation = {
        id: idGenerator.generate(),
        translation: translation,
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
      // 注意：章节内容保存会启用 skipIfUnchanged，并用“序列化快照”检测变化（含就地修改）。
      await booksStore.updateBook(resolvedBookId, { volumes: book.volumes });

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
    handler: async (args, context) => {
      const { onAction } = context;
      const resolved = await resolveTranslationTarget(context.bookId, args);
      if (!resolved.ok) {
        return resolved.response;
      }
      const { bookId, book, paragraph, paragraph_id, translation_id, booksStore } = resolved;

      // 验证翻译是否存在
      const locateResult = locateTranslationById(paragraph, translation_id, 'delete');
      if (!locateResult.ok) {
        return locateResult.response;
      }
      const { index: translationIndex, translation: translationToDelete } = locateResult;

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
      // 注意：章节内容保存会启用 skipIfUnchanged，并用“序列化快照”检测变化（含就地修改）。
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
          '批量替换段落翻译中的关键词部分。根据关键词在原文或翻译文本中查找段落，并只替换匹配的关键词部分（保留翻译文本的其他内容）。支持同时搜索原文和翻译文本，如果同时提供两者，则只替换同时满足两个条件的段落。用于批量修正翻译中的错误或统一翻译风格。重要：工具只会替换匹配的关键词部分，不会替换整个翻译文本。例如：翻译"大姐abc"中的"大姐"会被替换为"姐姐"，结果变为"姐姐abc"。如果只提供原文关键词（没有翻译关键词），工具会在翻译文本中查找对应的关键词进行替换；如果找不到匹配的关键词，则跳过该段落。',
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
                '替换文本，用于替换匹配的关键词部分（不是替换整个翻译）。例如：如果关键词是"大姐"，替换文本是"姐姐"，则"大姐abc"会被替换为"姐姐abc"。如果只提供原文关键词（没有翻译关键词），工具会在翻译文本中查找对应的关键词进行替换；如果找不到匹配的关键词，则跳过该段落。',
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
    handler: async (args, { bookId: rawBookId, onAction }) => {
      const {
        keywords,
        original_keywords,
        replacement_text,
        chapter_id,
        replace_all_translations = false,
        max_replacements = 100,
      } = args as {
        keywords?: string[];
        original_keywords?: string[];
        replacement_text: string;
        chapter_id?: string;
        replace_all_translations?: boolean;
        max_replacements?: number;
      };
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

      const validKeywords = filterValidKeywords(keywords);
      const validOriginalKeywords = filterValidKeywords(original_keywords);

      if (validKeywords.length === 0 && validOriginalKeywords.length === 0) {
        throw new Error('必须提供至少一个有效的关键词数组');
      }

      const { bookId, book, booksStore } = resolveBook(rawBookId);

      const buildEmptyResult = (message: string): string =>
        JSON.stringify({
          success: true,
          message,
          replaced_count: 0,
          keywords: validKeywords.length > 0 ? validKeywords : undefined,
          original_keywords: validOriginalKeywords.length > 0 ? validOriginalKeywords : undefined,
        });

      const searchRange = resolveSearchRange(book, chapter_id);
      if (!searchRange) {
        return buildEmptyResult(chapter_id ? '未找到指定的章节' : '书籍没有卷');
      }
      // 收集所有匹配的段落
      const allResults: Map<string, ParagraphSearchResult> = new Map();

      // 批量预加载范围内的所有章节
      const chapterLocations = collectChapterLocationsInRange(book, searchRange);
      await ensureChaptersLoaded(chapterLocations.map((loc) => loc.chapter));

      const paragraphMatchesReplacementCriteria = (paragraph: {
        text?: string;
        translations?: Translation[];
      }): boolean => {
        if (isEmptyParagraph(paragraph.text)) return false;

        // 无论哪种关键词，替换要求段落必须有翻译
        if (!paragraph.translations || paragraph.translations.length === 0) {
          return false;
        }

        // 原文关键词匹配
        if (validOriginalKeywords.length > 0) {
          const text = paragraph.text || '';
          if (!validOriginalKeywords.some((kw) => containsWholeKeyword(text, kw))) {
            return false;
          }
        }

        // 翻译关键词匹配
        if (validKeywords.length > 0) {
          const hasMatch = paragraph.translations.some((t) =>
            validKeywords.some((kw) => containsWholeKeyword(t.translation || '', kw)),
          );
          if (!hasMatch) return false;
        }

        return true;
      };

      const runLinearSearch = async (): Promise<void> => {
        for (const location of chapterLocations) {
          if (allResults.size >= max_replacements) break;

          const { chapter, chapterIndex: cIndex, volume, volumeIndex: vIndex } = location;
          if (chapter.content === undefined) {
            const content = await ChapterContentService.loadChapterContent(chapter.id);
            chapter.content = content || [];
            chapter.contentLoaded = true;
          }

          if (!chapter.content) continue;

          for (let pIndex = 0; pIndex < chapter.content.length; pIndex++) {
            if (allResults.size >= max_replacements) break;

            const paragraph = chapter.content[pIndex];
            if (!paragraph) continue;
            if (allResults.has(paragraph.id)) continue;
            if (!paragraphMatchesReplacementCriteria(paragraph)) continue;

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
      };

      // 第二遍：在加载的章节中搜索翻译文本
      // 尝试使用全文索引
      let shouldRunLinearSearch = false;
      try {
        const { FullTextIndexService } = await import('src/services/full-text-index-service');
        const searchKeywords: string[] = [];
        if (validOriginalKeywords.length > 0) {
          searchKeywords.push(...validOriginalKeywords);
        }
        if (validKeywords.length > 0) {
          searchKeywords.push(...validKeywords);
        }

        if (searchKeywords.length > 0) {
          const indexResults = await FullTextIndexService.search(bookId, searchKeywords, {
            ...(chapter_id ? { chapterId: chapter_id } : {}),
            maxResults: max_replacements * 2, // 获取更多结果以便后续过滤
            onlyWithTranslation: validKeywords.length > 0, // 如果搜索翻译关键词，只返回有翻译的段落
            searchInOriginal: validOriginalKeywords.length > 0,
            searchInTranslations: validKeywords.length > 0,
            // 传入当前 book 引用，确保返回的段落/章节对象与 booksStore 一致
            novel: book,
          });

          // 过滤结果：检查是否同时满足两个条件（如果提供了两种关键词）
          // 注意：FullTextIndexService.search 已支持传入 novel 引用，这里拿到的 paragraph/chapter
          // 应与当前 booksStore 中的 book 保持同一引用，可直接修改并保存。
          for (const result of indexResults) {
            if (allResults.size >= max_replacements) break;
            if (allResults.has(result.paragraph.id)) continue;
            if (!paragraphMatchesReplacementCriteria(result.paragraph)) continue;
            allResults.set(result.paragraph.id, result);
          }
        }
      } catch (error) {
        // 如果索引不可用，回退到线性搜索
        console.warn('Full-text index search failed, falling back to linear search:', error);
        shouldRunLinearSearch = true;
      }

      if (shouldRunLinearSearch || allResults.size < max_replacements) {
        await runLinearSearch();
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
        old_selected_translation_id: string;
        old_translations: Translation[];
        new_translation: string;
      }> = [];

      for (const result of results) {
        const { paragraph } = result;

        if (!paragraph.translations || paragraph.translations.length === 0) {
          continue;
        }

        // 保存段落原始选中翻译 ID（用于撤销时完整恢复）
        const oldSelectedTranslationId = paragraph.selectedTranslationId || '';

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

        // 如果没有找到匹配的翻译关键词，但提供了原文关键词
        // 尝试在翻译文本中查找原文关键词（可能在某些情况下相同，如数字、专有名词等）
        if (!matchedKeyword && validOriginalKeywords.length > 0) {
          for (const translation of paragraph.translations) {
            for (const originalKeyword of validOriginalKeywords) {
              if (containsWholeKeyword(translation.translation || '', originalKeyword)) {
                matchedKeyword = originalKeyword;
                break;
              }
            }
            if (matchedKeyword) break;
          }
        }

        // 如果没有找到任何匹配的关键词，跳过这个段落（不替换整个段落）
        if (!matchedKeyword) {
          continue;
        }

        // 此时 matchedKeyword 一定不为 null，保存为常量以确保类型安全
        const keywordToReplace = matchedKeyword;

        // 执行替换的函数（只替换匹配的关键词部分）
        const performReplacement = (translation: Translation) => {
          const oldTranslation = translation.translation || '';

          // 只替换匹配的关键词部分，不替换整个翻译
          translation.translation = replaceWholeKeyword(
            oldTranslation,
            keywordToReplace,
            replacement_text.trim(),
          );
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
            old_selected_translation_id: oldSelectedTranslationId,
            old_translations: oldTranslations,
            new_translation: replacement_text.trim(),
          });
        }
      }

      // 更新书籍（保存更改）
      // 注意：章节内容保存会启用 skipIfUnchanged，并用“序列化快照”检测变化（含就地修改）。
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
              old_selected_translation_id: p.old_selected_translation_id,
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
