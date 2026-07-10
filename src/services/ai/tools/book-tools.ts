import { BookService } from 'src/services/book-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { ChapterService } from 'src/services/chapter-service';
import { useBooksStore } from 'src/stores/books';
import { generateShortId } from 'src/utils/id-generator';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';
import { parseToolArgs, type ToolDefinition, type ToolContext } from './types';
import type { Chapter, Novel, Volume } from 'src/models/novel';
import { searchRelatedMemoriesHybrid } from './memory-helper';

/**
 * 统一的 JSON 错误响应构造器
 */
function jsonError(error: string): string {
  return JSON.stringify({ success: false, error });
}

/**
 * 统一的 bookId 校验 + 加载：若缺失返回 error JSON，否则返回 book。
 * 多个工具处理器共享此前置样板。
 */
async function resolveBookByIdOrError(
  bookId: string | null | undefined,
): Promise<
  { kind: 'error'; json: string } | { kind: 'ok'; bookId: string; book: Novel }
> {
  if (!bookId) {
    return { kind: 'error', json: jsonError('书籍 ID 不能为空') };
  }
  const book = await BookService.getBookById(bookId);
  if (!book) {
    return { kind: 'error', json: jsonError(`书籍不存在: ${bookId}`) };
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
function countChapterTranslationStats(chapter: Chapter): {
  paragraphCount: number;
  translatedCount: number;
} {
  const content = chapter.content || [];
  const translatedCount = content.filter(
    (p) => p.selectedTranslationId && p.translations && p.translations.length > 0,
  ).length;
  return { paragraphCount: content.length, translatedCount };
}

/**
 * 将章节 / 卷信息格式化为工具响应中常用的结构
 */
function formatChapterTitleFields(chapter: Chapter): {
  title_original: string;
  title_translation: string;
} {
  if (typeof chapter.title === 'string') {
    return { title_original: chapter.title, title_translation: '' };
  }
  return {
    title_original: chapter.title.original,
    title_translation: chapter.title.translation?.translation || '',
  };
}

interface VolumeLike {
  id: string;
  title: string | { original: string; translation?: { translation?: string } | null };
}

function formatVolumeResponse(
  volume: VolumeLike | undefined | null,
): { id: string; title: string; title_translation: string } | null {
  if (!volume) return null;
  if (typeof volume.title === 'string') {
    return { id: volume.id, title: volume.title, title_translation: '' };
  }
  return {
    id: volume.id,
    title: volume.title.original || '',
    title_translation: volume.title.translation?.translation || '',
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
  const titleOriginal =
    typeof chapter.title === 'string' ? chapter.title : chapter.title.original;
  return searchRelatedMemoriesHybrid(
    bookId,
    [{ type: 'chapter', id: chapter.id }],
    titleOriginal ? [titleOriginal] : [],
    5,
  );
}

/**
 * 从旧章节 title 中提取 old_original / old_translation 字段
 */
function extractExistingTitleFields(chapter: Chapter): {
  oldOriginal: string;
  oldTranslation: string;
} {
  if (typeof chapter.title === 'string') {
    return { oldOriginal: chapter.title, oldTranslation: '' };
  }
  return {
    oldOriginal: chapter.title.original,
    oldTranslation: chapter.title.translation?.translation || '',
  };
}

/**
 * 将旧格式（字符串标题）升级为新格式（带翻译对象），并合并用户输入
 */
function upgradeLegacyChapterTitle(
  oldTitleString: string,
  titleOriginal: string | undefined,
  titleTranslation: string | undefined,
): Chapter['title'] {
  if (titleOriginal && titleTranslation) {
    return {
      original: titleOriginal.trim(),
      translation: {
        id: generateShortId(),
        translation: titleTranslation.trim(),
        aiModelId: '',
      },
    };
  }
  if (titleOriginal) {
    return {
      original: titleOriginal.trim(),
      translation: { id: generateShortId(), translation: '', aiModelId: '' },
    };
  }
  if (titleTranslation) {
    return {
      original: oldTitleString,
      translation: {
        id: generateShortId(),
        translation: titleTranslation.trim(),
        aiModelId: '',
      },
    };
  }
  // 不应该到达这里，调用前已校验至少提供一个参数
  return oldTitleString;
}

/**
 * 对新格式（对象标题）应用用户输入的 original / translation 更新
 */
function mergeModernChapterTitle(
  existingTitle: Exclude<Chapter['title'], string>,
  titleOriginal: string | undefined,
  titleTranslation: string | undefined,
): Chapter['title'] {
  const existingTranslation = existingTitle.translation;
  const buildTranslation = (text: string) =>
    existingTranslation
      ? { ...existingTranslation, translation: text.trim() }
      : { id: generateShortId(), translation: text.trim(), aiModelId: '' };

  if (titleOriginal && titleTranslation) {
    return {
      original: titleOriginal.trim(),
      translation: buildTranslation(titleTranslation),
    };
  }
  if (titleOriginal) {
    return {
      original: titleOriginal.trim(),
      translation: existingTranslation,
    };
  }
  if (titleTranslation) {
    return {
      original: existingTitle.original,
      translation: buildTranslation(titleTranslation),
    };
  }
  // 不应该到达这里
  return existingTitle;
}

/**
 * 根据用户输入构造新的章节 title（兼容旧字符串格式与新对象格式）
 */
function buildUpdatedChapterTitle(
  existingTitle: Chapter['title'],
  titleOriginal: string | undefined,
  titleTranslation: string | undefined,
): Chapter['title'] {
  if (typeof existingTitle === 'string') {
    return upgradeLegacyChapterTitle(existingTitle, titleOriginal, titleTranslation);
  }
  return mergeModernChapterTitle(existingTitle, titleOriginal, titleTranslation);
}

function summarizeChapterForBookInfo(
  c: Chapter,
): { title: string; translation: string | undefined } {
  if (typeof c.title === 'string') {
    return { title: c.title, translation: '' };
  }
  return { title: c.title.original, translation: c.title.translation?.translation };
}

function summarizeVolumeForBookInfo(v: Volume): {
  title: string;
  translation: string | undefined;
  chapter_count: number;
  chapters: Array<{ title: string; translation: string | undefined }> | undefined;
} {
  const title = typeof v.title === 'string' ? v.title : v.title.original;
  const translation = typeof v.title === 'string' ? '' : v.title.translation?.translation;
  return {
    title,
    translation,
    chapter_count: v.chapters?.length || 0,
    chapters: v.chapters?.map((c) => summarizeChapterForBookInfo(c)),
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
function buildGetBookInfoPayload(book: Novel): {
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

  const structure = book.volumes?.map((v) => summarizeVolumeForBookInfo(v)) || [];

  return {
    id: book.id,
    title: book.title,
    author: book.author || '未知',
    description: book.description || '无',
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
function collectUpdatedFieldLabels(params: {
  description?: string | undefined;
  tags?: string[] | undefined;
  author?: string | undefined;
  alternate_titles?: string[] | undefined;
}): string[] {
  const labels: string[] = [];
  if (params.description !== undefined) labels.push('描述');
  if (params.tags !== undefined) labels.push('标签');
  if (params.author !== undefined) labels.push('作者');
  if (params.alternate_titles !== undefined) labels.push('别名');
  return labels;
}

/**
 * 字符串字段的 old/new 对比（缺省回退到「无」）
 */
function describeStringFieldDiff(
  previous: string | undefined,
  current: string | undefined,
): { old: string; new: string } {
  return { old: previous || '无', new: current || '无' };
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
function buildBookInfoUpdatedFieldsDiff(params: {
  description?: string | undefined;
  tags?: string[] | undefined;
  author?: string | undefined;
  alternate_titles?: string[] | undefined;
  previousData: BookInfoSnapshot;
  updates: Partial<Novel>;
}): Record<string, unknown> {
  const { description, tags, author, alternate_titles, previousData, updates } = params;
  return {
    ...(description !== undefined
      ? { description: describeStringFieldDiff(previousData.description, updates.description) }
      : {}),
    ...(tags !== undefined
      ? { tags: describeArrayFieldDiff(previousData.tags, updates.tags) }
      : {}),
    ...(author !== undefined
      ? { author: describeStringFieldDiff(previousData.author, updates.author) }
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
type DisplayableTitle = string | { original: string; translation?: { translation?: string } | null };

/**
 * 从标题中取原文（旧字符串格式直接返回，新格式取 original）
 */
function extractTitleOriginal(title: DisplayableTitle): string {
  return typeof title === 'string' ? title : title.original || '';
}

/**
 * 从标题中取译文（旧字符串格式无译文，新格式取 translation.translation）
 */
function extractTitleTranslation(title: DisplayableTitle): string {
  return typeof title === 'string' ? '' : title.translation?.translation || '';
}

/**
 * 将单个章节映射为 list_chapters / list_chapters_by_volume 使用的简化结构
 */
function buildChapterListItem(chapter: Chapter): {
  id: string;
  title_original: string;
  title_translation: string;
} | null {
  if (!chapter) return null;
  return {
    id: chapter.id,
    title_original: extractTitleOriginal(chapter.title),
    title_translation: extractTitleTranslation(chapter.title),
  };
}

/**
 * 将整本书的章节扁平化为 list_chapters 工具使用的简化结构
 */
function flattenBookChaptersForList(
  book: Novel,
): Array<{ id: string; title_original: string; title_translation: string }> {
  const result: Array<{ id: string; title_original: string; title_translation: string }> = [];
  if (!book.volumes) return result;
  for (const volume of book.volumes) {
    if (!volume || !volume.chapters) continue;
    for (const chapter of volume.chapters) {
      const item = buildChapterListItem(chapter);
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
    const selectedTranslation = para.translations?.find(
      (t) => t.id === para.selectedTranslationId,
    );
    return {
      id: para.id,
      text: para.text,
      translation: selectedTranslation?.translation || '',
      hasTranslation: !!selectedTranslation,
      translationCount: para.translations?.length || 0,
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
  description: string;
  direction: 'previous' | 'next';
  notFoundError: string;
  errorMessage: string;
}): ToolDefinition {
  return {
    definition: {
      type: 'function',
      function: {
        name: spec.name,
        description: `${spec.description}章节内容按 limit/offset 分页返回（默认 30 段，最大 200），避免超长章节一次性塞满上下文；需要更多内容时通过 offset 继续读取。`,
        parameters: {
          type: 'object',
          properties: {
            chapter_id: {
              type: 'string',
              description: '当前章节 ID',
            },
            include_memory: {
              type: 'boolean',
              description: '是否在响应中包含相关的记忆信息（默认 true）',
            },
            summary_only: {
              type: 'boolean',
              description: '如果为 true，则不返回章节内容，只返回所有的摘要信息（默认为 false）',
            },
            limit: {
              type: 'number',
              description: '返回的段落数量上限（默认 30，最大 200）。',
            },
            offset: {
              type: 'number',
              description: '起始段落索引（0-based，默认 0）。配合 limit 翻页读取。',
            },
          },
          required: ['chapter_id'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) =>
      handleAdjacentChapterTool(args, bookId, onAction, {
        direction: spec.direction,
        toolName: spec.name,
        notFoundError: spec.notFoundError,
        errorMessage: spec.errorMessage,
      }),
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
    notFoundError: string;
    errorMessage: string;
  },
): Promise<string> {
  const parsedArgs = parseToolArgs<{
    chapter_id: string;
    include_memory?: boolean;
    summary_only?: boolean;
    limit?: number;
    offset?: number;
  }>(args);
  if (!bookId) {
    return jsonError('书籍 ID 不能为空');
  }
  const { chapter_id, include_memory = true, summary_only = false } = parsedArgs;
  if (!chapter_id) {
    return jsonError('章节 ID 不能为空');
  }
  const { limit, offset } = resolveChapterPaging(parsedArgs);

  try {
    const book = await BookService.getBookById(bookId);
    if (!book) {
      return jsonError(`书籍不存在: ${bookId}`);
    }

    const adjacentInfo = getAdjacentChapter(book, chapter_id, config.direction);
    if (!adjacentInfo) {
      return jsonError(config.notFoundError);
    }

    const { chapter, volume } = adjacentInfo;
    const chapterTitle = getChapterDisplayTitle(chapter);

    emitAdjacentReadAction(onAction, chapter.id, chapterTitle, config.toolName);

    // 如果章节内容未加载，从 IndexedDB 加载（summary_only 模式跳过 content 读取）
    // 分页：与 get_chapter_info 一致，按 offset/limit 切片，防止超长章节塞爆工具结果
    let page: ReturnType<typeof paginateChapterParagraphs> | undefined;
    if (!summary_only) {
      await ensureChapterContentLoaded(chapter);
      page = paginateChapterParagraphs(chapter, offset, limit, chapter.content?.length || 0);
    }

    const { paragraphCount, translatedCount } = countChapterTranslationStats(chapter);
    const relatedMemories = await fetchChapterRelatedMemories(bookId, chapter, include_memory);

    return JSON.stringify(
      buildAdjacentChapterResponse({
        chapter,
        volume,
        page,
        limit,
        paragraphCount,
        translatedCount,
        relatedMemories,
        includeMemory: include_memory,
      }),
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : config.errorMessage);
  }
}

/**
 * 渲染相邻章节（前/后一章）工具的统一响应体。
 * page 存在时（非 summary_only）返回分页后的内容切片与分页元信息。
 */
function buildAdjacentChapterResponse(params: {
  chapter: Chapter;
  volume: VolumeLike | null | undefined;
  page: ReturnType<typeof paginateChapterParagraphs> | undefined;
  limit: number;
  paragraphCount: number;
  translatedCount: number;
  relatedMemories: Array<{ id: string; summary: string }>;
  includeMemory: boolean;
}): Record<string, unknown> {
  const titleFields = formatChapterTitleFields(params.chapter);
  return {
    success: true,
    chapter: {
      id: params.chapter.id,
      title: getChapterDisplayTitle(params.chapter),
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
      volume: formatVolumeResponse(params.volume ?? null),
    },
    ...(params.includeMemory && params.relatedMemories.length > 0
      ? { related_memories: params.relatedMemories }
      : {}),
  };
}

/**
 * 将单个卷映射为 list_chapters_by_volume 工具使用的结构（含章节列表与计数）
 */
function summarizeVolumeForChapterList(volume: Volume): {
  id: string;
  title_original: string;
  title_translation: string;
  chapters: Array<{ id: string; title_original: string; title_translation: string }>;
  chapterCount: number;
} {
  const chapters = (volume.chapters || []).map((chapter) => ({
    id: chapter.id,
    title_original: extractTitleOriginal(chapter.title),
    title_translation: extractTitleTranslation(chapter.title),
  }));
  return {
    id: volume.id,
    title_original: extractTitleOriginal(volume.title),
    title_translation: extractTitleTranslation(volume.title),
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
        volumes.push(summarizeVolumeForChapterList(volume));
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
function resolveChapterPaging(parsedArgs: {
  limit?: number;
  offset?: number;
}): { limit: number; offset: number } {
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
function buildGetChapterInfoResponse(params: {
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
}): Record<string, unknown> {
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
      volume: formatVolumeResponse(volume ?? null),
    },
    ...(includeMemory && relatedMemories.length > 0
      ? { related_memories: relatedMemories }
      : {}),
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
    definition: {
      type: 'function',
      function: {
        name: 'get_book_info',
        description:
          '获取当前书籍的详细信息，包括标题、作者、简介、标签、备注以及卷章结构摘要。当需要了解书籍背景、上下文或查看用户备注时使用此工具。',
        parameters: {
          type: 'object',
          properties: {
            include_memory: {
              type: 'boolean',
              description: '是否在响应中包含相关的记忆信息（默认 true）',
            },
          },
          required: [],
        },
      },
    },
    handler: async (args, context: ToolContext) => {
      const { bookId, onAction } = context;
      const parsedArgs = parseToolArgs<{ include_memory?: boolean }>(args);

      const resolved = await resolveBookByIdOrError(bookId);
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

        const info = buildGetBookInfoPayload(book);
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
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : '获取书籍信息失败',
        });
      }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'list_chapters',
        description:
          '获取书籍的所有章节列表，包括每个章节的 ID、原文标题、翻译标题。当需要查看所有可用章节并选择参考章节时使用此工具。支持分页（offset/limit）。如需按语义查找相关章节,请用 query_chapter。',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: '可选，限制返回的章节数量（默认返回所有章节）',
            },
            offset: {
              type: 'number',
              description: '可选，跳过的章节数量（用于分页，默认为 0）',
            },
          },
          required: [],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      const parsedArgs = parseToolArgs<{ limit?: number; offset?: number }>(args);
      const { limit, offset = 0 } = parsedArgs;

      const resolved = await resolveBookByIdOrError(bookId);
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
        const allChapters = flattenBookChaptersForList(book);
        const startIndex = offset && offset > 0 ? offset : 0;
        const endIndex = limit && limit > 0 ? startIndex + limit : undefined;
        const chapters = allChapters.slice(startIndex, endIndex);

        return JSON.stringify({
          success: true,
          chapters,
          totalCount: allChapters.length,
        });
      } catch (error) {
        return jsonError(error instanceof Error ? error.message : '获取章节列表失败');
      }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'list_chapters_by_volume',
        description:
          '获取按卷分组的书籍章节列表。当需要了解书籍的分卷结构、按卷查找章节或查看每卷包含的章节详情时使用此工具。返回结果包含卷信息和该卷下的章节列表（含ID、标题、摘要）。',
        parameters: {
          type: 'object',
          properties: {
            volume_ids: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: '要获取章节的卷 ID 列表',
            },
          },
          required: ['volume_ids'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      const parsedArgs = parseToolArgs<{ volume_ids: string[] }>(args);
      const { volume_ids } = parsedArgs;

      if (!volume_ids || !Array.isArray(volume_ids) || volume_ids.length === 0) {
        return jsonError('必须提供有效的 volume_ids 列表');
      }

      const resolved = await resolveBookByIdOrError(bookId);
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

        return JSON.stringify(buildListChaptersByVolumeResponse(book, volume_ids));
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : '获取分卷章节列表失败',
        });
      }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'query_chapter',
        description:
          '混合检索章节(语义 + 标题/正文关键词 + 在线 IDF 稀有词加权 + identifier 章号/卷号加权)。返回章节 ID、标题、匹配度、前 200 字片段预览;如需完整内容再调 `get_chapter_info`。本地嵌入未就绪时返回结构化错误,稍后重试。\n\n**最稳的三类 query**(这些都已在全书测试中验证 Top-K 命中):\n1. **标题/系列名直搜** — `第二王女` / `深渊之森攻略` / `星天 ⑥`(圈号、章号、罗马数字都正确识别)\n2. **人物 + 身份 + 具体动作 + 独特细节** — `夏洛特作为第二王女再次接近芬恩,紧张到胃痛` / `阿莉亚背着芬恩,提到和别的女人同居`\n3. **事件锚点型** — `吻痕被发现后开始审问` / `艾莉莎被给出三个选择`\n\n**中等可用**(可能要 Top2-5 二次确认):\n- 整章主题型描述\n- 中文转述日文标题(原标题字面差异大时不稳,**优先用原文标题词**或加更强锚点)\n\n**较弱**(query 改写或换思路):\n- 抽象读后感(`后宫气氛成形`、`主角让大家心理受冲击`)→ 改成 query 里实际出现的具体场面\n- 仅人名无动作细节(`阿莉亚`)→ 补具体动作 / 场景词\n- 不存在的系列词 → 别用,改用 `list_chapters` 看真实标题\n\n**通用心法**:\n- 把它当 **候选定位器**,不是精确答案:Top1 未必最佳,默认看 Top3-5\n- 不确定时 `limit` 调到 8-10,人工筛选\n- 中文 query 含的专名(角色名、地名、术语)如果在 terminologies/characters 里维护过,系统会自动跨语言归一(中→日 / 日→中)。否则用原文形态命中率更高',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                '自然语言查询(中日文皆可)。三类最稳:① 标题/系列名直搜("第二王女"、"星天 ⑥");② 人物+身份+动作+细节("夏洛特紧张到胃痛接近芬恩");③ 事件锚点("吻痕被发现后开始审问")。避免抽象读后感("后宫气氛成形")或仅人名无动作。中文 query 系统会自动跨语言归一已维护的专名,否则**优先用原文标题词**命中更稳。',
            },
            limit: {
              type: 'number',
              description: '默认 5。Top1 未必最佳 — 把它当候选定位器,默认看 Top3-5;抽象 / 不确定时调到 8-10,再用 get_chapter_info 二次确认',
            },
          },
          required: ['query'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      const parsedArgs = parseToolArgs<{ query: string; limit?: number }>(args);
      if (!bookId) {
        return JSON.stringify({ success: false, error: '书籍 ID 不能为空' });
      }
      const { query, limit = 5 } = parsedArgs;
      if (!query || typeof query !== 'string' || !query.trim()) {
        return JSON.stringify({ success: false, error: 'query 不能为空' });
      }

      try {
        const { useSettingsStore } = await import('src/stores/settings');
        const { isLocalEmbeddingEffectivelyEnabled } = await import(
          'src/utils/local-embedding'
        );
        const { isMobileDevice } = await import('src/utils/platform');
        const stored = useSettingsStore().settings.enableLocalEmbedding;
        if (!isLocalEmbeddingEffectivelyEnabled(stored)) {
          return JSON.stringify({
            success: false,
            error: isMobileDevice()
              ? '当前为移动设备,本地嵌入被强制禁用 — 请在桌面端使用此功能'
              : '本地嵌入功能未启用,请让用户在「设置 → 本地嵌入」中打开总开关',
            feature_disabled: true,
            reason: isMobileDevice() ? 'mobile_device' : 'user_disabled',
          });
        }

        const { EmbeddingService } = await import('src/services/embedding-service');
        if (!EmbeddingService.isReady()) {
          return JSON.stringify({
            success: false,
            error: '章节嵌入服务未就绪,请稍后重试或让用户在设置里完成嵌入模型下载',
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

        const { ChapterEmbeddingService } = await import(
          'src/services/chapter-embedding-service'
        );
        const matches = await ChapterEmbeddingService.queryChapters(bookId, query, limit);

        return JSON.stringify({
          success: true,
          matches,
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : '章节语义查询失败',
        });
      }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_chapter_info',
        description:
          '获取章节的详细信息，包括标题、段落列表（默认分页）、翻译进度等。章节可能很长，返回内容会按 limit/offset 分页；先用小 limit 确认方向，需要更多段落再通过 offset 继续读取，避免一次性拉整章把上下文塞满。',
        parameters: {
          type: 'object',
          properties: {
            chapter_id: {
              type: 'string',
              description: '章节 ID',
            },
            limit: {
              type: 'number',
              description: '返回的段落数量上限（默认 30，最大 200）。章节可能有上百段，默认只取前 30 段避免 context 爆炸。',
            },
            offset: {
              type: 'number',
              description: '起始段落索引（0-based，默认 0）。配合 limit 翻页读取。',
            },
            include_memory: {
              type: 'boolean',
              description: '是否在响应中包含相关的记忆信息（默认 true）',
            },
          },
          required: ['chapter_id'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      const parsedArgs = parseToolArgs<{
        chapter_id: string;
        limit?: number;
        offset?: number;
        include_memory?: boolean;
      }>(args);
      const { chapter_id, include_memory = true } = parsedArgs;
      const { limit, offset } = resolveChapterPaging(parsedArgs);
      if (!chapter_id) {
        return jsonError('章节 ID 不能为空');
      }

      const resolved = await resolveBookByIdOrError(bookId);
      if (resolved.kind === 'error') return resolved.json;
      const { book, bookId: resolvedBookId } = resolved;

      try {
        // 查找章节及其所属卷
        const located = locateChapterInBook(book, chapter_id);
        if (!located) {
          return jsonError(`章节不存在: ${chapter_id}`);
        }
        const { chapter, volume } = located;

        // 如果章节内容未加载，从 IndexedDB 加载
        await ensureChapterContentLoaded(chapter);

        const chapterTitle = getChapterDisplayTitle(chapter);

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
        const { paragraphCount, translatedCount } = countChapterTranslationStats(chapter);

        // 分页：根据 offset/limit 切片段落，避免一次性返回整章把 context 塞满
        const page = paginateChapterParagraphs(chapter, offset, limit, paragraphCount);

        // 搜索相关记忆（使用章节标题作为关键词）
        const relatedMemories = await fetchChapterRelatedMemories(
          resolvedBookId,
          chapter,
          include_memory,
        );

        const titleFields = formatChapterTitleFields(chapter);
        return JSON.stringify(
          buildGetChapterInfoResponse({
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
          }),
        );
      } catch (error) {
        return jsonError(error instanceof Error ? error.message : '获取章节信息失败');
      }
    },
  },
  buildAdjacentChapterTool({
    name: 'get_previous_chapter',
    description:
      '获取指定章节的前一个章节信息。用于查看前一个章节的标题、内容等，帮助理解上下文和保持翻译一致性。',
    direction: 'previous',
    notFoundError: '没有前一个章节（当前章节是第一个章节）',
    errorMessage: '获取前一个章节失败',
  }),
  buildAdjacentChapterTool({
    name: 'get_next_chapter',
    description:
      '获取指定章节的下一个章节信息。用于查看下一个章节的标题、内容等，帮助理解上下文和保持翻译一致性。',
    direction: 'next',
    notFoundError: '没有下一个章节（当前章节是最后一个章节）',
    errorMessage: '获取下一个章节失败',
  }),
  {
    definition: {
      type: 'function',
      function: {
        name: 'update_chapter_title',
        description:
          '更新章节的标题。可以更新原文标题（title_original）或翻译标题（title_translation）。用于修正章节标题翻译或更新原文标题。',
        parameters: {
          type: 'object',
          properties: {
            chapter_id: {
              type: 'string',
              description: '章节 ID',
            },
            title_original: {
              type: 'string',
              description: '新的原文标题（可选，如果提供则更新原文标题）',
            },
            title_translation: {
              type: 'string',
              description: '新的翻译标题（可选，如果提供则更新翻译标题）',
            },
          },
          required: ['chapter_id'],
        },
      },
    },
    handler: async (args, { bookId, onAction }) => {
      const parsedArgs = parseToolArgs<{
        chapter_id: string;
        title_original?: string;
        title_translation?: string;
      }>(args);
      if (!bookId) {
        return jsonError('书籍 ID 不能为空');
      }
      const { chapter_id, title_original, title_translation } = parsedArgs;
      if (!chapter_id) {
        return jsonError('章节 ID 不能为空');
      }
      if (!title_original && !title_translation) {
        return jsonError('必须提供 title_original 或 title_translation 至少一个参数');
      }

      try {
        const booksStore = useBooksStore();
        const book = booksStore.getBookById(bookId);
        if (!book) {
          return jsonError(`书籍不存在: ${bookId}`);
        }

        // 查找章节
        const chapterInfo = ChapterService.findChapterById(book, chapter_id);
        if (!chapterInfo) {
          return jsonError(`章节不存在: ${chapter_id}`);
        }

        const { chapter: existingChapter } = chapterInfo;
        const oldTitle = getChapterDisplayTitle(existingChapter);
        const { oldOriginal, oldTranslation } = extractExistingTitleFields(existingChapter);
        const updatedTitle = buildUpdatedChapterTitle(
          existingChapter.title,
          title_original,
          title_translation,
        );

        // 使用 ChapterService 更新章节
        const updatedVolumes = ChapterService.updateChapter(book, chapter_id, {
          title: updatedTitle,
        });

        // 保存更改
        await booksStore.updateBook(bookId, { volumes: updatedVolumes });

        // 获取更新后的章节信息
        const updatedBook = booksStore.getBookById(bookId);
        const updatedChapterInfo = updatedBook
          ? ChapterService.findChapterById(updatedBook, chapter_id)
          : null;
        const newTitle = updatedChapterInfo
          ? getChapterDisplayTitle(updatedChapterInfo.chapter)
          : oldTitle;

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
          message: '章节标题已更新',
          chapter_id,
          old_title: oldTitle,
          new_title: newTitle,
          old_title_original: oldOriginal,
          new_title_original:
            typeof updatedTitle === 'string' ? updatedTitle : updatedTitle.original,
          old_title_translation: oldTranslation,
          new_title_translation:
            typeof updatedTitle === 'string' ? '' : updatedTitle.translation?.translation || '',
        });
      } catch (error) {
        return jsonError(error instanceof Error ? error.message : '更新章节标题失败');
      }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'update_book_info',
        description:
          '更新书籍的基本信息，包括描述、标签、作者、别名等。可以同时更新多个字段，也可以只更新单个字段。用于完善书籍元数据、修正错误信息或根据用户需求调整书籍信息。',
        parameters: {
          type: 'object',
          properties: {
            description: {
              type: 'string',
              description: '书籍描述（可选，如果提供则更新描述，如果为空字符串则清除描述）',
            },
            tags: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: '书籍标签数组（可选，如果提供则更新标签）',
            },
            author: {
              type: 'string',
              description: '作者名称（可选，如果提供则更新作者，如果为空字符串则清除作者）',
            },
            alternate_titles: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: '别名数组（可选，如果提供则更新别名）',
            },
          },
          required: [],
        },
      },
    },
    handler: async (args, context: ToolContext) => {
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
        return jsonError(
          '必须至少提供一个要更新的字段（description、tags、author 或 alternate_titles）',
        );
      }

      const resolved = await resolveBookByIdOrError(bookId);
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

        const updatedFields = collectUpdatedFieldLabels({
          description,
          tags,
          author,
          alternate_titles,
        });

        return JSON.stringify({
          success: true,
          message: `书籍信息已更新：${updatedFields.join('、')}`,
          book_id: bookId,
          book_title: updatedBook?.title || book.title,
          updated_fields: buildBookInfoUpdatedFieldsDiff({
            description,
            tags,
            author,
            alternate_titles,
            previousData,
            updates,
          }),
        });
      } catch (error) {
        return jsonError(error instanceof Error ? error.message : '更新书籍信息失败');
      }
    },
  },
];
