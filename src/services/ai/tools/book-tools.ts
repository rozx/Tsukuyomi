import type { MessageKey } from 'src/i18n/types';
import { translateText } from 'src/i18n/translate';
import { toolErrorJson, caughtToolErrorJson } from './tool-feedback';
import type { AppLocale } from 'src/models/locale';
import { toolDefinition } from './tool-localization';
import { describeTool } from './tool-localization';
import { BookService } from 'src/services/book-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { ChapterService } from 'src/services/chapter-service';
import { useBooksStore } from 'src/stores/books';
import { getLanguageTranslation, getNameTranslation } from 'src/services/localization/selection';
import { titleOriginal } from 'src/services/localization/title-edit';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';
import { parseToolArgs, type ToolDefinition, type ToolContext } from './types';
import type { Chapter, Novel, Volume } from 'src/models/novel';
import { searchRelatedMemoriesHybrid } from './memory-helper';

/**
 * 统一的 JSON 错误响应构造器
 */

/**
 * 统一的 bookId 校验 + 加载：若缺失返回 error JSON，否则返回 book。
 * 多个工具处理器共享此前置样板。
 */
async function resolveBookByIdOrError(
  bookId: string | null | undefined,
  uiLocale: AppLocale = 'zh-CN',
): Promise<{ kind: 'error'; json: string } | { kind: 'ok'; bookId: string; book: Novel }> {
  if (!bookId) {
    return {
      kind: 'error',
      json: toolErrorJson('BOOK_ID_REQUIRED', 'aiEntityFeedback.bookRequired', uiLocale),
    };
  }
  const book = await BookService.getBookById(bookId);
  if (!book) {
    return {
      kind: 'error',
      json: toolErrorJson('BOOK_NOT_FOUND', 'aiEntityFeedback.bookMissing', uiLocale, {
        id: bookId,
      }),
    };
  }
  return { kind: 'ok', bookId, book };
}

/**
 * 处理 chapter.content 的懒加载：从 IndexedDB 按需读取并回填
 */
async function ensureChapterContentLoaded(chapter: Chapter): Promise<void> {
  if (chapter.content !== undefined) return;
  const content = await ChapterContentService.loadChapterContent(chapter.id);
  chapter.content = content || [];
  chapter.contentLoaded = true;
}

/**
 * 计算章节的段落总数和已翻译数
 */
function countChapterTranslationStats(
  chapter: Chapter,
  language: AppLocale = 'zh-CN',
): {
  paragraphCount: number;
  translatedCount: number;
} {
  const content = chapter.content || [];
  const translatedCount = content.filter((p) =>
    Boolean(getLanguageTranslation(p, language)),
  ).length;
  return { paragraphCount: content.length, translatedCount };
}

/**
 * 将章节 / 卷信息格式化为工具响应中常用的结构
 */
function formatChapterTitleFields(
  chapter: Chapter,
  language: AppLocale = 'zh-CN',
): {
  title_original: string;
  title_translation: string;
} {
  if (typeof chapter.title === 'string') {
    return { title_original: chapter.title, title_translation: '' };
  }
  return {
    title_original: chapter.title.original,
    title_translation: getNameTranslation(chapter.title, language)?.translation ?? '',
  };
}

interface VolumeLike {
  id: string;
  title: Volume['title'];
}

function formatVolumeResponse(
  volume: VolumeLike | undefined | null,
  language: AppLocale = 'zh-CN',
): { id: string; title: string; title_translation: string } | null {
  if (!volume) return null;
  if (typeof volume.title === 'string') {
    return { id: volume.id, title: volume.title, title_translation: '' };
  }
  return {
    id: volume.id,
    title: volume.title.original || '',
    title_translation: getNameTranslation(volume.title, language)?.translation ?? '',
  };
}

/**
 * 使用章节标题做一次混合记忆搜索（若启用 include_memory）
 */
async function fetchChapterRelatedMemories(
  bookId: string,
  chapter: Chapter,
  includeMemory: boolean,
): Promise<Array<{ id: string; summary: string }>> {
  if (!includeMemory || !bookId) return [];
  const titleOriginal = typeof chapter.title === 'string' ? chapter.title : chapter.title.original;
  return searchRelatedMemoriesHybrid(
    bookId,
    [{ type: 'chapter', id: chapter.id }],
    titleOriginal ? [titleOriginal] : [],
    5,
  );
}

function summarizeChapterForBookInfo(
  c: Chapter,
  language: AppLocale = 'zh-CN',
): {
  title: string;
  translation: string | undefined;
} {
  if (typeof c.title === 'string') {
    return { title: c.title, translation: '' };
  }
  return {
    title: c.title.original,
    translation: getNameTranslation(c.title, language)?.translation,
  };
}

function summarizeVolumeForBookInfo(
  v: Volume,
  language: AppLocale = 'zh-CN',
): {
  title: string;
  translation: string | undefined;
  chapter_count: number;
  chapters: Array<{ title: string; translation: string | undefined }> | undefined;
} {
  const title = typeof v.title === 'string' ? v.title : v.title.original;
  const translation =
    typeof v.title === 'string' ? '' : getNameTranslation(v.title, language)?.translation;
  return {
    title,
    translation,
    chapter_count: v.chapters?.length || 0,
    chapters: v.chapters?.map((c) => summarizeChapterForBookInfo(c, language)),
  };
}

function buildBookInfoStats(book: Novel): {
  total_volumes: number;
  total_chapters: number;
  total_terms: number;
  total_characters: number;
} {
  return {
    total_volumes: book.volumes?.length || 0,
    total_chapters: book.volumes?.reduce((acc, v) => acc + (v.chapters?.length || 0), 0) || 0,
    total_terms: book.terminologies?.length || 0,
    total_characters: book.characterSettings?.length || 0,
  };
}

/**
 * 构造 get_book_info 工具返回的结构（书籍元信息 + 卷章结构 + 统计）
 */
function buildGetBookInfoPayload(
  book: Novel,
  language: AppLocale = 'zh-CN',
  uiLocale: AppLocale = 'zh-CN',
): {
  id: string;
  title: string;
  author: string;
  description: string;
  tags: string[];
  notes: Array<{ id: string; text: string; createdAt: Date }>;
  structure: Array<{
    title: string;
    translation: string | undefined;
    chapter_count: number;
    chapters: Array<{ title: string; translation: string | undefined }> | undefined;
  }>;
  stats: {
    total_volumes: number;
    total_chapters: number;
    total_terms: number;
    total_characters: number;
  };
} {
  const notes =
    book.notes?.map((n) => ({
      id: n.id,
      text: n.text,
      createdAt: n.createdAt,
    })) || [];

  const structure = book.volumes?.map((v) => summarizeVolumeForBookInfo(v, language)) || [];

  return {
    id: book.id,
    title: book.title,
    author: book.author || translateText(uiLocale, 'aiBookFeedback.unknown'),
    description: book.description || translateText(uiLocale, 'aiBookFeedback.none'),
    tags: book.tags || [],
    notes,
    structure,
    stats: buildBookInfoStats(book),
  };
}

/**
 * 若开启 include_memory 则按书名/作者拉一次混合记忆搜索,否则返回空数组
 */
async function maybeFetchBookRelatedMemories(
  book: Novel,
  bookId: string | null | undefined,
  includeMemory: boolean,
): Promise<Array<{ id: string; summary: string }>> {
  if (!includeMemory || !bookId) return [];
  const keywords: string[] = [];
  if (book.title) keywords.push(book.title);
  if (book.author) keywords.push(book.author);
  return searchRelatedMemoriesHybrid(bookId, [{ type: 'book', id: bookId }], keywords, 5);
}

interface BookInfoSnapshot {
  description?: string;
  tags?: string[];
  author?: string;
  alternateTitles?: string[];
}

/**
 * 保存书籍元信息原值，用于撤销
 */
function snapshotBookInfoForUndo(book: Novel): BookInfoSnapshot {
  const snapshot: BookInfoSnapshot = {};
  if (book.description !== undefined) snapshot.description = book.description;
  if (book.tags !== undefined) snapshot.tags = [...book.tags];
  if (book.author !== undefined) snapshot.author = book.author;
  if (book.alternateTitles !== undefined) snapshot.alternateTitles = [...book.alternateTitles];
  return snapshot;
}

/**
 * 将 update_book_info 的参数转换为可传入 booksStore.updateBook 的 Partial<Novel>
 */
function buildBookInfoUpdates(params: {
  description?: string | undefined;
  tags?: string[] | undefined;
  author?: string | undefined;
  alternate_titles?: string[] | undefined;
}): Partial<Novel> {
  const updates: Partial<Novel> = {};
  if (params.description !== undefined) {
    updates.description = params.description.trim() || undefined;
  }
  if (params.tags !== undefined) {
    updates.tags = params.tags.length > 0 ? params.tags : undefined;
  }
  if (params.author !== undefined) {
    updates.author = params.author.trim() || undefined;
  }
  if (params.alternate_titles !== undefined) {
    updates.alternateTitles =
      params.alternate_titles.length > 0 ? params.alternate_titles : undefined;
  }
  return updates;
}

/**
 * 收集用户可读的已更新字段中文标签
 */
function collectUpdatedFieldLabels(
  params: {
    description?: string | undefined;
    tags?: string[] | undefined;
    author?: string | undefined;
    alternate_titles?: string[] | undefined;
  },
  uiLocale: AppLocale,
): string[] {
  const labels: string[] = [];
  if (params.description !== undefined)
    labels.push(translateText(uiLocale, 'aiBookFeedback.description'));
  if (params.tags !== undefined) labels.push(translateText(uiLocale, 'aiBookFeedback.tags'));
  if (params.author !== undefined) labels.push(translateText(uiLocale, 'aiBookFeedback.author'));
  if (params.alternate_titles !== undefined)
    labels.push(translateText(uiLocale, 'aiBookFeedback.aliases'));
  return labels;
}

/**
 * 字符串字段的 old/new 对比（缺省回退到「无」）
 */
function describeStringFieldDiff(
  previous: string | undefined,
  current: string | undefined,
  uiLocale: AppLocale,
): { old: string; new: string } {
  return {
    old: previous || translateText(uiLocale, 'aiBookFeedback.none'),
    new: current || translateText(uiLocale, 'aiBookFeedback.none'),
  };
}

/**
 * 数组字段的 old/new 对比（缺省回退到空数组）
 */
function describeArrayFieldDiff<T>(
  previous: T[] | undefined,
  current: T[] | undefined,
): { old: T[]; new: T[] } {
  return { old: previous || [], new: current || [] };
}

/**
 * 构建返回体中 updated_fields 的 old/new 对比结构
 */
function buildBookInfoUpdatedFieldsDiff(
  params: {
    description?: string | undefined;
    tags?: string[] | undefined;
    author?: string | undefined;
    alternate_titles?: string[] | undefined;
    previousData: BookInfoSnapshot;
    updates: Partial<Novel>;
  },
  uiLocale: AppLocale,
): Record<string, unknown> {
  const { description, tags, author, alternate_titles, previousData, updates } = params;
  return {
    ...(description !== undefined
      ? {
          description: describeStringFieldDiff(
            previousData.description,
            updates.description,
            uiLocale,
          ),
        }
      : {}),
    ...(tags !== undefined
      ? { tags: describeArrayFieldDiff(previousData.tags, updates.tags) }
      : {}),
    ...(author !== undefined
      ? { author: describeStringFieldDiff(previousData.author, updates.author, uiLocale) }
      : {}),
    ...(alternate_titles !== undefined
      ? {
          alternate_titles: describeArrayFieldDiff(
            previousData.alternateTitles,
            updates.alternateTitles,
          ),
        }
      : {}),
  };
}

/** 章节标题 / 卷标题的展示用类型（兼容旧字符串格式与新对象格式） */
type DisplayableTitle = Chapter['title'];

/**
 * 从标题中取原文（旧字符串格式直接返回，新格式取 original）
 */
function extractTitleOriginal(title: DisplayableTitle): string {
  return typeof title === 'string' ? title : title.original || '';
}

/**
 * 从标题中取译文（旧字符串格式无译文，新格式取 translation.translation）
 */
function extractTitleTranslation(title: DisplayableTitle, language: AppLocale = 'zh-CN'): string {
  return typeof title === 'string' ? '' : (getNameTranslation(title, language)?.translation ?? '');
}

/**
 * 将单个章节映射为 list_chapters / list_chapters_by_volume 使用的简化结构
 */
function buildChapterListItem(
  chapter: Chapter,
  language: AppLocale = 'zh-CN',
): {
  id: string;
  title_original: string;
  title_translation: string;
} | null {
  if (!chapter) return null;
  return {
    id: chapter.id,
    title_original: extractTitleOriginal(chapter.title),
    title_translation: extractTitleTranslation(chapter.title, language),
  };
}

/**
 * 将整本书的章节扁平化为 list_chapters 工具使用的简化结构
 */
function flattenBookChaptersForList(
  book: Novel,
  language: AppLocale = 'zh-CN',
): Array<{ id: string; title_original: string; title_translation: string }> {
  const result: Array<{ id: string; title_original: string; title_translation: string }> = [];
  if (!book.volumes) return result;
  for (const volume of book.volumes) {
    if (!volume || !volume.chapters) continue;
    for (const chapter of volume.chapters) {
      const item = buildChapterListItem(chapter, language);
      if (item) result.push(item);
    }
  }
  return result;
}

/**
 * 根据 chapter_id 在书籍卷章结构中定位章节及所属卷
 */
function locateChapterInBook(
  book: Novel,
  chapterId: string,
): { chapter: Chapter; volume: VolumeLike } | null {
  if (!book.volumes) return null;
  for (const vol of book.volumes) {
    if (!vol.chapters) continue;
    const found = vol.chapters.find((ch) => ch.id === chapterId);
    if (found) return { chapter: found, volume: vol };
  }
  return null;
}

/**
 * 对章节段落做分页切片，返回切片后的段落数据与分页元信息
 */
function paginateChapterParagraphs(
  chapter: Chapter,
  offset: number,
  limit: number,
  paragraphCount: number,
  language: AppLocale = 'zh-CN',
): {
  paragraphs: Array<{
    id: string;
    text: string;
    translation: string;
    hasTranslation: boolean;
    translationCount: number;
  }>;
  chapterContent: string;
  effectiveOffset: number;
  effectiveEnd: number;
  hasMore: boolean;
} {
  const effectiveOffset = Math.min(offset, paragraphCount);
  const effectiveEnd = Math.min(effectiveOffset + limit, paragraphCount);
  const slicedParagraphs = chapter.content?.slice(effectiveOffset, effectiveEnd) || [];
  const paragraphs = slicedParagraphs.map((para) => {
    const selectedTranslation = getLanguageTranslation(para, language);
    return {
      id: para.id,
      text: para.text,
      translation: selectedTranslation?.translation || '',
      hasTranslation: !!selectedTranslation,
      translationCount:
        para.translations?.filter((value) => (value.language ?? 'zh-CN') === language).length || 0,
    };
  });
  return {
    paragraphs,
    chapterContent: slicedParagraphs.map((p) => p.text).join('\n'),
    effectiveOffset,
    effectiveEnd,
    hasMore: effectiveEnd < paragraphCount,
  };
}

/**
 * 构造相邻章节（前/后一章）工具：参数 schema 完全一致，只有名称与错误文案不同。
 * 统一成一个工厂可消除两个 tool 定义里 schema 段的重复。
 */
function buildAdjacentChapterTool(spec: {
  name: 'get_previous_chapter' | 'get_next_chapter';
  direction: 'previous' | 'next';
  notFoundError: MessageKey;
  errorMessage: MessageKey;
}): ToolDefinition {
  return {
    definition: toolDefinition(spec.name, {
      type: 'object',
      properties: {
        chapter_id: {
          type: 'string',
          description: describeTool(spec.name + '.parameters.properties.chapter_id'),
        },
        include_memory: {
          type: 'boolean',
          description: describeTool(spec.name + '.parameters.properties.include_memory'),
        },
        summary_only: {
          type: 'boolean',
          description: describeTool(spec.name + '.parameters.properties.summary_only'),
        },
        limit: {
          type: 'number',
          description: describeTool(spec.name + '.parameters.properties.limit'),
        },
        offset: {
          type: 'number',
          description: describeTool(spec.name + '.parameters.properties.offset'),
        },
      },
      required: ['chapter_id'],
    }),
    handler: async (args, { bookId, onAction, languages }) =>
      handleAdjacentChapterTool(
        args,
        bookId,
        onAction,
        {
          direction: spec.direction,
          toolName: spec.name,
          notFoundError: spec.notFoundError,
          errorMessage: spec.errorMessage,
        },
        languages?.targetLanguage ?? 'zh-CN',
        languages?.uiLocale ?? 'zh-CN',
      ),
  };
}

/**
 * 按方向取相邻章节（前一章 / 后一章），统一 ChapterService 调用
 */
function getAdjacentChapter(book: Novel, chapterId: string, direction: 'previous' | 'next') {
  return direction === 'previous'
    ? ChapterService.getPreviousChapter(book, chapterId)
    : ChapterService.getNextChapter(book, chapterId);
}

/**
 * 发送相邻章节工具的读取操作回调（onAction 为空时跳过）
 */
function emitAdjacentReadAction(
  onAction: ToolContext['onAction'],
  chapterId: string,
  chapterTitle: string,
  toolName: 'get_previous_chapter' | 'get_next_chapter',
): void {
  if (!onAction) return;
  onAction({
    type: 'read',
    entity: 'chapter',
    data: {
      chapter_id: chapterId,
      chapter_title: chapterTitle,
      tool_name: toolName,
    },
  });
}

/**
 * 相邻章节（前/后一章）工具的共享处理函数
 */
async function handleAdjacentChapterTool(
  args: Record<string, unknown>,
  bookId: string | undefined,
  onAction: ToolContext['onAction'],
  config: {
    direction: 'previous' | 'next';
    toolName: 'get_previous_chapter' | 'get_next_chapter';
    notFoundError: MessageKey;
    errorMessage: MessageKey;
  },
  language: AppLocale = 'zh-CN',
  uiLocale: AppLocale = 'zh-CN',
): Promise<string> {
  const parsedArgs = parseToolArgs<{
    chapter_id: string;
    include_memory?: boolean;
    summary_only?: boolean;
    limit?: number;
    offset?: number;
  }>(args);
  if (!bookId) {
    return toolErrorJson('BOOK_ID_REQUIRED', 'aiEntityFeedback.bookRequired', uiLocale);
  }
  const { chapter_id, include_memory = true, summary_only = false } = parsedArgs;
  if (!chapter_id) {
    return toolErrorJson('CHAPTER_ID_REQUIRED', 'aiEntityFeedback.chapterRequired', uiLocale);
  }
  const { limit, offset } = resolveChapterPaging(parsedArgs);

  try {
    const book = await BookService.getBookById(bookId);
    if (!book) {
      return toolErrorJson('BOOK_NOT_FOUND', 'aiEntityFeedback.bookMissing', uiLocale, {
        id: bookId,
      });
    }

    const adjacentInfo = getAdjacentChapter(book, chapter_id, config.direction);
    if (!adjacentInfo) {
      return toolErrorJson('ADJACENT_CHAPTER_NOT_FOUND', config.notFoundError, uiLocale);
    }

    const { chapter, volume } = adjacentInfo;
    const chapterTitle = getChapterDisplayTitle(chapter, undefined, language);

    emitAdjacentReadAction(onAction, chapter.id, chapterTitle, config.toolName);

    // 如果章节内容未加载，从 IndexedDB 加载（summary_only 模式跳过 content 读取）
    // 分页：与 get_chapter_info 一致，按 offset/limit 切片，防止超长章节塞爆工具结果
    let page: ReturnType<typeof paginateChapterParagraphs> | undefined;
    if (!summary_only) {
      await ensureChapterContentLoaded(chapter);
      page = paginateChapterParagraphs(
        chapter,
        offset,
        limit,
        chapter.content?.length || 0,
        language,
      );
    }

    const { paragraphCount, translatedCount } = countChapterTranslationStats(chapter, language);
    const relatedMemories = await fetchChapterRelatedMemories(bookId, chapter, include_memory);

    return JSON.stringify(
      buildAdjacentChapterResponse(
        {
          chapter,
          volume,
          page,
          limit,
          paragraphCount,
          translatedCount,
          relatedMemories,
          includeMemory: include_memory,
        },
        language,
      ),
    );
  } catch (error) {
    return caughtToolErrorJson(error, uiLocale, 'ADJACENT_CHAPTER_FAILED', config.errorMessage);
  }
}

/**
 * 渲染相邻章节（前/后一章）工具的统一响应体。
 * page 存在时（非 summary_only）返回分页后的内容切片与分页元信息。
 */
function buildAdjacentChapterResponse(
  params: {
    chapter: Chapter;
    volume: VolumeLike | null | undefined;
    page: ReturnType<typeof paginateChapterParagraphs> | undefined;
    limit: number;
    paragraphCount: number;
    translatedCount: number;
    relatedMemories: Array<{ id: string; summary: string }>;
    includeMemory: boolean;
  },
  language: AppLocale = 'zh-CN',
): Record<string, unknown> {
  const titleFields = formatChapterTitleFields(params.chapter, language);
  return {
    success: true,
    chapter: {
      id: params.chapter.id,
      title: getChapterDisplayTitle(params.chapter, undefined, language),
      ...titleFields,
      content: params.page?.chapterContent ?? '',
      paragraphCount: params.paragraphCount,
      translatedCount: params.translatedCount,
      ...(params.page
        ? {
            pagination: {
              offset: params.page.effectiveOffset,
              limit: params.limit,
              returned: params.page.paragraphs.length,
              hasMore: params.page.hasMore,
              nextOffset: params.page.hasMore ? params.page.effectiveEnd : null,
            },
          }
        : {}),
      volume: formatVolumeResponse(params.volume ?? null, language),
    },
    ...(params.includeMemory && params.relatedMemories.length > 0
      ? { related_memories: params.relatedMemories }
      : {}),
  };
}

/**
 * 将单个卷映射为 list_chapters_by_volume 工具使用的结构（含章节列表与计数）
 */
function summarizeVolumeForChapterList(
  volume: Volume,
  language: AppLocale = 'zh-CN',
): {
  id: string;
  title_original: string;
  title_translation: string;
  chapters: Array<{ id: string; title_original: string; title_translation: string }>;
  chapterCount: number;
} {
  const chapters = (volume.chapters || []).map((chapter) => ({
    id: chapter.id,
    title_original: extractTitleOriginal(chapter.title),
    title_translation: extractTitleTranslation(chapter.title, language),
  }));
  return {
    id: volume.id,
    title_original: extractTitleOriginal(volume.title),
    title_translation: extractTitleTranslation(volume.title, language),
    chapters,
    chapterCount: chapters.length,
  };
}

/**
 * 构造 list_chapters_by_volume 工具的响应体（按 volume_ids 过滤卷并汇总）
 */
function buildListChaptersByVolumeResponse(
  book: Novel,
  volume_ids: string[],
  language: AppLocale = 'zh-CN',
): {
  success: true;
  volumes: Array<{
    id: string;
    title_original: string;
    title_translation: string;
    chapters: Array<{ id: string; title_original: string; title_translation: string }>;
    chapterCount: number;
  }>;
  totalVolumes: number;
  totalChapters: number;
} {
  const volumes: Array<{
    id: string;
    title_original: string;
    title_translation: string;
    chapters: Array<{ id: string; title_original: string; title_translation: string }>;
    chapterCount: number;
  }> = [];
  if (book.volumes) {
    for (const volume of book.volumes) {
      if (volume_ids.includes(volume.id)) {
        volumes.push(summarizeVolumeForChapterList(volume, language));
      }
    }
  }
  return {
    success: true,
    volumes,
    totalVolumes: volumes.length,
    totalChapters: volumes.reduce((acc, v) => acc + v.chapterCount, 0),
  };
}

/**
 * 解析 get_chapter_info 的分页参数：limit 默认 30（裁剪到 1-200），offset 默认 0
 */
function resolveChapterPaging(parsedArgs: { limit?: number; offset?: number }): {
  limit: number;
  offset: number;
} {
  const rawLimit = typeof parsedArgs.limit === 'number' ? parsedArgs.limit : 30;
  const rawOffset = typeof parsedArgs.offset === 'number' ? parsedArgs.offset : 0;
  return {
    limit: Math.max(1, Math.min(200, Math.floor(rawLimit))),
    offset: Math.max(0, Math.floor(rawOffset)),
  };
}

/**
 * 构造 get_chapter_info 工具的响应体（章节元信息 + 分页段落 + 可选记忆）
 */
function buildGetChapterInfoResponse(
  params: {
    chapter: Chapter;
    chapterTitle: string;
    titleFields: ReturnType<typeof formatChapterTitleFields>;
    page: ReturnType<typeof paginateChapterParagraphs>;
    paragraphCount: number;
    translatedCount: number;
    limit: number;
    volume: VolumeLike | null | undefined;
    relatedMemories: Array<{ id: string; summary: string }>;
    includeMemory: boolean;
  },
  language: AppLocale = 'zh-CN',
): Record<string, unknown> {
  const {
    chapter,
    chapterTitle,
    titleFields,
    page,
    paragraphCount,
    translatedCount,
    limit,
    volume,
    relatedMemories,
    includeMemory,
  } = params;
  return {
    success: true,
    chapter: {
      id: chapter.id,
      title: chapterTitle,
      ...titleFields,
      content: page.chapterContent,
      paragraphCount,
      translatedCount,
      paragraphs: page.paragraphs,
      pagination: {
        offset: page.effectiveOffset,
        limit,
        returned: page.paragraphs.length,
        hasMore: page.hasMore,
        nextOffset: page.hasMore ? page.effectiveEnd : null,
      },
      volume: formatVolumeResponse(volume ?? null, language),
    },
    ...(includeMemory && relatedMemories.length > 0 ? { related_memories: relatedMemories } : {}),
  };
}

/**
 * 判断 update_book_info 是否至少提供了一个要更新的字段
 */
function hasAnyBookInfoUpdate(params: {
  description?: string | undefined;
  tags?: string[] | undefined;
  author?: string | undefined;
  alternate_titles?: string[] | undefined;
}): boolean {
  return (
    params.description !== undefined ||
    params.tags !== undefined ||
    params.author !== undefined ||
    params.alternate_titles !== undefined
  );
}

/**
 * 构造 update_book_info 操作回调的 data（仅包含实际提供的字段）
 */
function buildUpdateBookInfoActionData(
  description: string | undefined,
  tags: string[] | undefined,
  author: string | undefined,
  alternate_titles: string[] | undefined,
  updates: Partial<Novel>,
  bookId: string | undefined,
) {
  return {
    book_id: bookId,
    tool_name: 'update_book_info',
    ...(description !== undefined ? { description: updates.description } : {}),
    ...(tags !== undefined ? { tags: updates.tags } : {}),
    ...(author !== undefined ? { author: updates.author } : {}),
    ...(alternate_titles !== undefined ? { alternate_titles: updates.alternateTitles } : {}),
  };
}

export const bookTools: ToolDefinition[] = [
  {
    definition: toolDefinition('get_book_info', {
      type: 'object',
      properties: {
        include_memory: {
          type: 'boolean',
          description: describeTool('get_book_info.parameters.properties.include_memory'),
        },
      },
      required: [],
    }),
    handler: async (args, context: ToolContext) => {
      const language = context.languages?.targetLanguage ?? 'zh-CN';
      const uiLocale = context.languages?.uiLocale ?? 'zh-CN';
      const { bookId, onAction } = context;
      const parsedArgs = parseToolArgs<{ include_memory?: boolean }>(args);

      const resolved = await resolveBookByIdOrError(bookId, uiLocale);
      if (resolved.kind === 'error') return resolved.json;
      const book = resolved.book;

      try {
        if (onAction) {
          onAction({
            type: 'read',
            entity: 'book',
            data: { book_id: bookId, tool_name: 'get_book_info' },
          });
        }

        const info = buildGetBookInfoPayload(book, language, uiLocale);
        const { include_memory = true } = parsedArgs;
        const relatedMemories = await maybeFetchBookRelatedMemories(book, bookId, include_memory);

        return JSON.stringify({
          success: true,
          book: info,
          ...(include_memory && relatedMemories.length > 0
            ? { related_memories: relatedMemories }
            : {}),
        });
      } catch (error) {
        return caughtToolErrorJson(
          error,
          uiLocale,
          'BOOK_INFO_FAILED',
          'aiBookFeedback.bookGetFailed',
        );
      }
    },
  },
  {
    definition: toolDefinition('list_chapters', {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: describeTool('list_chapters.parameters.properties.limit'),
        },
        offset: {
          type: 'number',
          description: describeTool('list_chapters.parameters.properties.offset'),
        },
      },
      required: [],
    }),
    handler: async (args, { bookId, onAction, languages }) => {
      const language = languages?.targetLanguage ?? 'zh-CN';
      const uiLocale = languages?.uiLocale ?? 'zh-CN';
      const parsedArgs = parseToolArgs<{ limit?: number; offset?: number }>(args);
      const { limit, offset = 0 } = parsedArgs;

      const resolved = await resolveBookByIdOrError(bookId, uiLocale);
      if (resolved.kind === 'error') return resolved.json;
      const book = resolved.book;

      try {
        // 报告读取操作
        if (onAction) {
          onAction({
            type: 'read',
            entity: 'chapter',
            data: {
              book_id: bookId,
              tool_name: 'list_chapters',
            },
          });
        }

        // 收集所有章节并应用分页
        const allChapters = flattenBookChaptersForList(book, language);
        const startIndex = offset && offset > 0 ? offset : 0;
        const endIndex = limit && limit > 0 ? startIndex + limit : undefined;
        const chapters = allChapters.slice(startIndex, endIndex);

        return JSON.stringify({
          success: true,
          chapters,
          totalCount: allChapters.length,
        });
      } catch (error) {
        return caughtToolErrorJson(
          error,
          uiLocale,
          'CHAPTER_LIST_FAILED',
          'aiBookFeedback.chapterListFailed',
        );
      }
    },
  },
  {
    definition: toolDefinition('list_chapters_by_volume', {
      type: 'object',
      properties: {
        volume_ids: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: describeTool('list_chapters_by_volume.parameters.properties.volume_ids'),
        },
      },
      required: ['volume_ids'],
    }),
    handler: async (args, { bookId, onAction, languages }) => {
      const language = languages?.targetLanguage ?? 'zh-CN';
      const uiLocale = languages?.uiLocale ?? 'zh-CN';
      const parsedArgs = parseToolArgs<{ volume_ids: string[] }>(args);
      const { volume_ids } = parsedArgs;

      if (!volume_ids || !Array.isArray(volume_ids) || volume_ids.length === 0) {
        return toolErrorJson('VOLUME_IDS_REQUIRED', 'aiBookFeedback.volumeIdsRequired', uiLocale);
      }

      const resolved = await resolveBookByIdOrError(bookId, uiLocale);
      if (resolved.kind === 'error') return resolved.json;
      const book = resolved.book;

      try {
        // 报告读取操作
        if (onAction) {
          onAction({
            type: 'read',
            entity: 'book',
            data: {
              book_id: bookId,
              tool_name: 'list_chapters_by_volume',
              volume_ids,
            },
          });
        }

        return JSON.stringify(buildListChaptersByVolumeResponse(book, volume_ids, language));
      } catch (error) {
        return caughtToolErrorJson(
          error,
          uiLocale,
          'VOLUME_LIST_FAILED',
          'aiBookFeedback.volumeListFailed',
        );
      }
    },
  },
  {
    definition: toolDefinition('query_chapter', {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: describeTool('query_chapter.parameters.properties.query'),
        },
        limit: {
          type: 'number',
          description: describeTool('query_chapter.parameters.properties.limit'),
        },
      },
      required: ['query'],
    }),
    handler: async (args, { bookId, onAction, languages }) => {
      const language = languages?.targetLanguage ?? 'zh-CN';
      const uiLocale = languages?.uiLocale ?? 'zh-CN';
      const parsedArgs = parseToolArgs<{ query: string; limit?: number }>(args);
      if (!bookId) {
        return toolErrorJson('BOOK_ID_REQUIRED', 'aiEntityFeedback.bookRequired', uiLocale);
      }
      const { query, limit = 5 } = parsedArgs;
      if (!query || typeof query !== 'string' || !query.trim()) {
        return toolErrorJson('QUERY_REQUIRED', 'aiBookFeedback.queryRequired', uiLocale);
      }

      try {
        const { useSettingsStore } = await import('src/stores/settings');
        const { isLocalEmbeddingEffectivelyEnabled } = await import('src/utils/local-embedding');
        const { isMobileDevice } = await import('src/utils/platform');
        const stored = useSettingsStore().settings.enableLocalEmbedding;
        if (!isLocalEmbeddingEffectivelyEnabled(stored)) {
          return JSON.stringify({
            success: false,
            error_code: 'EMBEDDING_DISABLED',
            error: isMobileDevice()
              ? translateText(uiLocale, 'aiBookFeedback.mobileDisabled')
              : translateText(uiLocale, 'aiBookFeedback.userDisabled'),
            feature_disabled: true,
            reason: isMobileDevice() ? 'mobile_device' : 'user_disabled',
          });
        }

        const { EmbeddingService } = await import('src/services/embedding-service');
        if (!EmbeddingService.isReady()) {
          return JSON.stringify({
            success: false,
            error_code: 'EMBEDDING_NOT_READY',
            error: translateText(uiLocale, 'aiBookFeedback.embeddingNotReady'),
            service_status: EmbeddingService.getStatus(),
          });
        }

        if (onAction) {
          onAction({
            type: 'search',
            entity: 'chapter',
            data: {
              book_id: bookId,
              tool_name: 'query_chapter',
              query,
            },
          });
        }

        const { ChapterEmbeddingService } = await import('src/services/chapter-embedding-service');
        const matches = await ChapterEmbeddingService.queryChapters(bookId, query, limit);

        return JSON.stringify({
          success: true,
          matches,
        });
      } catch (error) {
        return caughtToolErrorJson(
          error,
          uiLocale,
          'CHAPTER_QUERY_FAILED',
          'aiBookFeedback.queryFailed',
        );
      }
    },
  },
  {
    definition: toolDefinition('get_chapter_info', {
      type: 'object',
      properties: {
        chapter_id: {
          type: 'string',
          description: describeTool('get_chapter_info.parameters.properties.chapter_id'),
        },
        limit: {
          type: 'number',
          description: describeTool('get_chapter_info.parameters.properties.limit'),
        },
        offset: {
          type: 'number',
          description: describeTool('get_chapter_info.parameters.properties.offset'),
        },
        include_memory: {
          type: 'boolean',
          description: describeTool('get_chapter_info.parameters.properties.include_memory'),
        },
      },
      required: ['chapter_id'],
    }),
    handler: async (args, { bookId, onAction, languages }) => {
      const language = languages?.targetLanguage ?? 'zh-CN';
      const uiLocale = languages?.uiLocale ?? 'zh-CN';
      const parsedArgs = parseToolArgs<{
        chapter_id: string;
        limit?: number;
        offset?: number;
        include_memory?: boolean;
      }>(args);
      const { chapter_id, include_memory = true } = parsedArgs;
      const { limit, offset } = resolveChapterPaging(parsedArgs);
      if (!chapter_id) {
        return toolErrorJson('CHAPTER_ID_REQUIRED', 'aiEntityFeedback.chapterRequired', uiLocale);
      }

      const resolved = await resolveBookByIdOrError(bookId, uiLocale);
      if (resolved.kind === 'error') return resolved.json;
      const { book, bookId: resolvedBookId } = resolved;

      try {
        // 查找章节及其所属卷
        const located = locateChapterInBook(book, chapter_id);
        if (!located) {
          return toolErrorJson('CHAPTER_NOT_FOUND', 'aiEntityFeedback.chapterMissing', uiLocale, {
            id: chapter_id,
          });
        }
        const { chapter, volume } = located;

        // 如果章节内容未加载，从 IndexedDB 加载
        await ensureChapterContentLoaded(chapter);

        const chapterTitle = getChapterDisplayTitle(chapter, undefined, language);

        // 报告读取操作
        if (onAction) {
          onAction({
            type: 'read',
            entity: 'chapter',
            data: {
              chapter_id,
              chapter_title: chapterTitle,
              tool_name: 'get_chapter_info',
            },
          });
        }
        const { paragraphCount, translatedCount } = countChapterTranslationStats(chapter, language);

        // 分页：根据 offset/limit 切片段落，避免一次性返回整章把 context 塞满
        const page = paginateChapterParagraphs(chapter, offset, limit, paragraphCount, language);

        // 搜索相关记忆（使用章节标题作为关键词）
        const relatedMemories = await fetchChapterRelatedMemories(
          resolvedBookId,
          chapter,
          include_memory,
        );

        const titleFields = formatChapterTitleFields(chapter, language);
        return JSON.stringify(
          buildGetChapterInfoResponse(
            {
              chapter,
              chapterTitle,
              titleFields,
              page,
              paragraphCount,
              translatedCount,
              limit,
              volume,
              relatedMemories,
              includeMemory: include_memory,
            },
            language,
          ),
        );
      } catch (error) {
        return caughtToolErrorJson(
          error,
          uiLocale,
          'CHAPTER_INFO_FAILED',
          'aiBookFeedback.chapterGetFailed',
        );
      }
    },
  },
  buildAdjacentChapterTool({
    name: 'get_previous_chapter',
    direction: 'previous',
    notFoundError: 'aiBookFeedback.previousMissing',
    errorMessage: 'aiBookFeedback.previousFailed',
  }),
  buildAdjacentChapterTool({
    name: 'get_next_chapter',
    direction: 'next',
    notFoundError: 'aiBookFeedback.nextMissing',
    errorMessage: 'aiBookFeedback.nextFailed',
  }),
  {
    definition: toolDefinition('update_chapter_title', {
      type: 'object',
      properties: {
        chapter_id: {
          type: 'string',
          description: describeTool('update_chapter_title.parameters.properties.chapter_id'),
        },
        title_original: {
          type: 'string',
          description: describeTool('update_chapter_title.parameters.properties.title_original'),
        },
        title_translation: {
          type: 'string',
          description: describeTool('update_chapter_title.parameters.properties.title_translation'),
        },
      },
      required: ['chapter_id'],
    }),
    handler: async (args, { bookId, onAction, languages, aiModelId }) => {
      const language = languages?.targetLanguage ?? 'zh-CN';
      const uiLocale = languages?.uiLocale ?? 'zh-CN';
      const parsedArgs = parseToolArgs<{
        chapter_id: string;
        title_original?: string;
        title_translation?: string;
      }>(args);
      if (!bookId) {
        return toolErrorJson('BOOK_ID_REQUIRED', 'aiEntityFeedback.bookRequired', uiLocale);
      }
      const { chapter_id, title_original, title_translation } = parsedArgs;
      if (!chapter_id) {
        return toolErrorJson('CHAPTER_ID_REQUIRED', 'aiEntityFeedback.chapterRequired', uiLocale);
      }
      if (title_original === undefined && title_translation === undefined) {
        return toolErrorJson('TITLE_FIELD_REQUIRED', 'aiBookFeedback.titleRequired', uiLocale);
      }

      try {
        const booksStore = useBooksStore();
        const book = booksStore.getBookById(bookId);
        if (!book) {
          return toolErrorJson('BOOK_NOT_FOUND', 'aiEntityFeedback.bookMissing', uiLocale, {
            id: bookId,
          });
        }

        // 查找章节
        const chapterInfo = ChapterService.findChapterById(book, chapter_id);
        if (!chapterInfo) {
          return toolErrorJson('CHAPTER_NOT_FOUND', 'aiEntityFeedback.chapterMissing', uiLocale, {
            id: chapter_id,
          });
        }

        const { chapter: existingChapter } = chapterInfo;
        const displayBook = { ...book, targetLanguage: language };
        const oldTitle = getChapterDisplayTitle(existingChapter, displayBook);
        const oldOriginal = titleOriginal(existingChapter.title);
        const oldTranslation =
          typeof existingChapter.title === 'string'
            ? ''
            : (getNameTranslation(existingChapter.title, language)?.translation ?? '');
        await booksStore.editTitle(bookId, language, {
          kind: 'chapter',
          id: chapter_id,
          expectedOriginal: oldOriginal,
          ...(title_original !== undefined ? { original: title_original.trim() } : {}),
          ...(title_translation !== undefined ? { translation: title_translation.trim() } : {}),
          ...(aiModelId ? { aiModelId } : {}),
        });

        // 获取更新后的章节信息
        const updatedBook = booksStore.getBookById(bookId);
        const updatedChapterInfo = updatedBook
          ? ChapterService.findChapterById(updatedBook, chapter_id)
          : null;
        const newTitle = updatedChapterInfo
          ? getChapterDisplayTitle(updatedChapterInfo.chapter, displayBook)
          : oldTitle;

        const updatedTitle = updatedChapterInfo?.chapter.title ?? existingChapter.title;

        // 报告操作
        if (onAction) {
          onAction({
            type: 'update',
            entity: 'chapter',
            data: {
              chapter_id,
              chapter_title: newTitle,
              old_title: oldTitle,
              new_title: newTitle,
              tool_name: 'update_chapter_title',
            },
            previousData: {
              title_original: oldOriginal,
              title_translation: oldTranslation,
            },
          });
        }

        return JSON.stringify({
          success: true,
          message: translateText(uiLocale, 'aiBookFeedback.titleUpdated'),
          chapter_id,
          old_title: oldTitle,
          new_title: newTitle,
          old_title_original: oldOriginal,
          new_title_original:
            typeof updatedTitle === 'string' ? updatedTitle : updatedTitle.original,
          old_title_translation: oldTranslation,
          new_title_translation:
            typeof updatedTitle === 'string'
              ? ''
              : (getNameTranslation(updatedTitle, language)?.translation ?? ''),
        });
      } catch (error) {
        return caughtToolErrorJson(
          error,
          uiLocale,
          'CHAPTER_TITLE_UPDATE_FAILED',
          'aiBookFeedback.titleUpdateFailed',
        );
      }
    },
  },
  {
    definition: toolDefinition('update_book_info', {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: describeTool('update_book_info.parameters.properties.description'),
        },
        tags: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: describeTool('update_book_info.parameters.properties.tags'),
        },
        author: {
          type: 'string',
          description: describeTool('update_book_info.parameters.properties.author'),
        },
        alternate_titles: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: describeTool('update_book_info.parameters.properties.alternate_titles'),
        },
      },
      required: [],
    }),
    handler: async (args, context: ToolContext) => {
      const language = context.languages?.targetLanguage ?? 'zh-CN';
      const uiLocale = context.languages?.uiLocale ?? 'zh-CN';
      const { bookId, onAction } = context;
      const parsedArgs = parseToolArgs<{
        description?: string;
        tags?: string[];
        author?: string;
        alternate_titles?: string[];
      }>(args);

      const { description, tags, author, alternate_titles } = parsedArgs;

      // 检查是否至少提供了一个要更新的字段
      if (!hasAnyBookInfoUpdate({ description, tags, author, alternate_titles })) {
        return toolErrorJson('BOOK_FIELDS_REQUIRED', 'aiBookFeedback.fieldsRequired', uiLocale);
      }

      const resolved = await resolveBookByIdOrError(bookId, uiLocale);
      if (resolved.kind === 'error') return resolved.json;
      const { book, bookId: resolvedBookId } = resolved;

      try {
        const previousData = snapshotBookInfoForUndo(book);
        const updates = buildBookInfoUpdates({ description, tags, author, alternate_titles });

        // 更新书籍
        const booksStore = useBooksStore();
        await booksStore.updateBook(resolvedBookId, updates);

        // 获取更新后的书籍信息
        const updatedBook = await BookService.getBookById(resolvedBookId);

        // 报告操作
        if (onAction) {
          onAction({
            type: 'update',
            entity: 'book',
            data: buildUpdateBookInfoActionData(
              description,
              tags,
              author,
              alternate_titles,
              updates,
              bookId,
            ),
            previousData,
          });
        }

        const updatedFields = collectUpdatedFieldLabels(
          {
            description,
            tags,
            author,
            alternate_titles,
          },
          uiLocale,
        );

        return JSON.stringify({
          success: true,
          message: translateText(uiLocale, 'aiBookFeedback.bookUpdated', {
            fields: updatedFields.join(uiLocale === 'en-US' ? ', ' : '、'),
          }),
          book_id: bookId,
          book_title: updatedBook?.title || book.title,
          updated_fields: buildBookInfoUpdatedFieldsDiff(
            {
              description,
              tags,
              author,
              alternate_titles,
              previousData,
              updates,
            },
            uiLocale,
          ),
        });
      } catch (error) {
        return caughtToolErrorJson(
          error,
          uiLocale,
          'BOOK_UPDATE_FAILED',
          'aiBookFeedback.bookUpdateFailed',
        );
      }
    },
  },
];
