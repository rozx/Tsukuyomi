import {
  ChapterService,
  bulkLoadMissingChapters,
  ensureSingleChapterContentLoaded,
  type ParagraphSearchResult,
} from 'src/services/chapter-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { useBooksStore } from 'src/stores/books';
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
import type { Translation, Chapter, Novel, Volume } from 'src/models/novel';
import type {
  ToolDefinition,
  ToolHandler,
  ActionInfo,
  ToolContext,
  ChunkBoundaries,
} from './types';
import { searchRelatedMemoriesHybrid } from './memory-helper';

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
 * 工具处理器前置校验：bookId 非空 + 从 store 取书。
 * 用于 paragraph-tools 里近十个处理器共用的入口样板，失败时抛出错误。
 */
function resolveBookOrThrow(bookId: string | null | undefined): Novel {
  if (!bookId) {
    throw new Error('书籍 ID 不能为空');
  }
  const booksStore = useBooksStore();
  const book = booksStore.getBookById(bookId);
  if (!book) {
    throw new Error(`书籍不存在: ${bookId}`);
  }
  return book;
}

/**
 * 工具处理器前置校验，同时返回 booksStore 用于后续 updateBook。
 */
function resolveBookAndStoreOrThrow(bookId: string | null | undefined): {
  book: Novel;
  booksStore: ReturnType<typeof useBooksStore>;
} {
  if (!bookId) {
    throw new Error('书籍 ID 不能为空');
  }
  const booksStore = useBooksStore();
  const book = booksStore.getBookById(bookId);
  if (!book) {
    throw new Error(`书籍不存在: ${bookId}`);
  }
  return { book, booksStore };
}

/**
 * 异步定位段落位置，若找不到返回 JSON 错误字符串供调用方直接返回。
 * 用于「定位段落失败 → 统一错误响应」模式。
 */
async function findParagraphLocationOrErrorJson(
  book: Novel,
  paragraphId: string,
): Promise<{ kind: 'error'; json: string } | { kind: 'ok'; location: ParagraphLocation }> {
  const location = await ChapterService.findParagraphLocationAsync(book, paragraphId);
  if (!location) {
    return {
      kind: 'error',
      json: JSON.stringify({ success: false, error: `段落不存在: ${paragraphId}` }),
    };
  }
  return { kind: 'ok', location };
}

/**
 * 一次性完成 "检查 paragraph_id + 取 book + 定位段落" 的前置样板。
 * 多个只读工具（get_paragraph_info / get_paragraph_position 等）共用。
 */
async function resolveBookAndParagraphOrError(
  bookId: string | null | undefined,
  paragraphId: string,
): Promise<
  | { kind: 'error'; json: string }
  | { kind: 'ok'; book: Novel; location: ParagraphLocation }
> {
  if (!paragraphId) {
    throw new Error('段落 ID 不能为空');
  }
  const book = resolveBookOrThrow(bookId);
  const locationResult = await findParagraphLocationOrErrorJson(book, paragraphId);
  if (locationResult.kind === 'error') return { kind: 'error', json: locationResult.json };
  return { kind: 'ok', book, location: locationResult.location };
}

/**
 * 构造只接受 `{ paragraph_id }` 的工具 JSON Schema，description 由调用方提供。
 * 用于 get_paragraph_info / get_paragraph_memory 等只读工具的参数声明。
 *
 * - `translationIdDescription` 不为空时追加 required `translation_id`
 * - `withIncludeMemory` 为 true 时追加可选 `include_memory: boolean`
 */
function buildParagraphIdSchema(
  translationIdDescription?: string,
  withIncludeMemory: boolean = false,
): {
  type: 'object';
  properties: Record<string, { type: string; description: string }>;
  required: string[];
} {
  const properties: Record<string, { type: string; description: string }> = {
    paragraph_id: { type: 'string', description: '段落 ID' },
  };
  const required = ['paragraph_id'];
  if (translationIdDescription) {
    properties.translation_id = { type: 'string', description: translationIdDescription };
    required.push('translation_id');
  }
  if (withIncludeMemory) {
    properties.include_memory = {
      type: 'boolean',
      description: '是否在响应中包含相关的记忆信息（默认 true）',
    };
  }
  return { type: 'object', properties, required };
}

/** findParagraphLocationAsync 的返回类型别名，便于 helper 复用 */
type ParagraphLocation = NonNullable<
  Awaited<ReturnType<typeof ChapterService.findParagraphLocationAsync>>
>;

/**
 * 从段落翻译数组中挑当前选中的翻译文本；缺失时回退到第一条、再回退到空串。
 */
function resolveSelectedTranslationText(paragraph: {
  translations: Translation[];
  selectedTranslationId?: string;
}): string {
  return (
    paragraph.translations.find((t) => t.id === paragraph.selectedTranslationId)?.translation ||
    paragraph.translations[0]?.translation ||
    ''
  );
}

/**
 * 精简版的段落负载（只有 id / text / translation / paragraph_index），
 * 用于 get_paragraph_position 的 previous_paragraphs / next_paragraphs 等场景。
 */
function buildMinimalParagraphPayload(result: ParagraphSearchResult): {
  id: string;
  text: string;
  translation: string;
  paragraph_index: number;
} {
  return {
    id: result.paragraph.id,
    text: result.paragraph.text,
    translation: resolveSelectedTranslationText(result.paragraph),
    paragraph_index: toDisplayParagraphIndex(result.paragraphIndex),
  };
}

/**
 * 把 ParagraphSearchResult 映射为工具响应中统一的 paragraph 负载。
 * 用于 get_previous_paragraphs / get_next_paragraphs / find_paragraph_by_keywords /
 * search_paragraphs_by_regex 四处的 `paragraphs: validResults.map(...)` 样板。
 */
function buildParagraphPayload(result: ParagraphSearchResult): {
  id: string;
  text: string;
  translation: string;
  chapter: { id: string; title: string; title_translation: string };
  volume: { id: string; title: string; title_translation: string };
  paragraph_index: number;
  chapter_index: number;
  volume_index: number;
} {
  return {
    id: result.paragraph.id,
    text: result.paragraph.text,
    translation: resolveSelectedTranslationText(result.paragraph),
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

/**
 * 从首个命中段落中提取关键词，搜索相关记忆；返回空数组表示无需附加。
 * 共用于 get_previous_paragraphs / get_next_paragraphs 等 tool 的 related_memories 分支。
 */
async function loadRelatedMemoriesFromFirstParagraph(
  bookId: string | null | undefined,
  includeMemory: boolean,
  firstParagraphText: string | undefined,
): Promise<Array<{ id: string; summary: string }>> {
  if (!includeMemory || !bookId || !firstParagraphText) {
    return [];
  }
  const keywords = extractKeywordsFromParagraph(firstParagraphText, 20);
  if (keywords.length === 0) return [];
  return searchRelatedMemoriesHybrid(bookId, [], keywords, 5);
}

/**
 * 将段落的 translations 映射为工具响应里统一的结构（含 aiModelName / isSelected）。
 */
function buildTranslationListPayload(
  paragraph: { translations?: Translation[]; selectedTranslationId?: string },
): Array<{
  id: string;
  translation: string;
  aiModelId: string;
  aiModelName: string;
  isSelected: boolean;
}> {
  const aiModelsStore = useAIModelsStore();
  return (
    paragraph.translations?.map((t) => ({
      id: t.id,
      translation: t.translation,
      aiModelId: t.aiModelId,
      aiModelName: aiModelsStore.getModelById(t.aiModelId)?.name || '未知模型',
      isSelected: t.id === paragraph.selectedTranslationId,
    })) || []
  );
}

/**
 * 查找段落的 translationIndex，失败时返回 error JSON。
 * 供 update_translation / remove_translation 共用。
 */
function findTranslationIndexOrError(
  paragraph: ParagraphLocation['paragraph'],
  translationId: string,
): { kind: 'error'; json: string } | { kind: 'ok'; index: number; translation: Translation } {
  if (!paragraph.translations || paragraph.translations.length === 0) {
    return { kind: 'error', json: JSON.stringify({ success: false, error: '段落没有翻译历史' }) };
  }
  const index = paragraph.translations.findIndex((t) => t.id === translationId);
  if (index === -1) {
    return {
      kind: 'error',
      json: JSON.stringify({ success: false, error: `翻译 ID 不存在: ${translationId}` }),
    };
  }
  const translation = paragraph.translations[index];
  if (!translation) {
    return {
      kind: 'error',
      json: JSON.stringify({ success: false, error: `无法找到目标翻译` }),
    };
  }
  return { kind: 'ok', index, translation };
}

/**
 * add_translation / update_translation 共用的前置：
 * 取书 + 定位段落 + 空段落拦截。成功时返回 book / booksStore / paragraph。
 */
async function resolveParagraphForWriteOrError(
  bookId: string | null | undefined,
  paragraphId: string,
  emptyParagraphError: string,
): Promise<
  | { kind: 'error'; json: string }
  | {
      kind: 'ok';
      bookId: string;
      book: Novel;
      booksStore: ReturnType<typeof useBooksStore>;
      paragraph: ParagraphLocation['paragraph'];
    }
> {
  const { book, booksStore } = resolveBookAndStoreOrThrow(bookId);
  const locationResult = await findParagraphLocationOrErrorJson(book, paragraphId);
  if (locationResult.kind === 'error') return { kind: 'error', json: locationResult.json };
  const { paragraph } = locationResult.location;
  if (isEmptyParagraph(paragraph.text)) {
    return {
      kind: 'error',
      json: JSON.stringify({ success: false, error: emptyParagraphError }),
    };
  }
  return { kind: 'ok', bookId: bookId as string, book, booksStore, paragraph };
}

/**
 * select_translation / remove_translation 共用的前置校验：
 * 校验输入、加载书和段落、验证 translations 非空，并返回已定位的 translation。
 * 返回 'error' 时调用方直接把 json 作为响应。
 */
async function resolveParagraphTranslationForUpdate(
  bookId: string | null | undefined,
  paragraphId: string,
  translationId: string,
): Promise<
  | { kind: 'error'; json: string }
  | {
      kind: 'ok';
      bookId: string;
      book: Novel;
      booksStore: ReturnType<typeof useBooksStore>;
      paragraph: ParagraphLocation['paragraph'];
    }
> {
  if (!paragraphId || !translationId) {
    throw new Error('段落 ID 和翻译 ID 不能为空');
  }
  const { book, booksStore } = resolveBookAndStoreOrThrow(bookId);
  const locationResult = await findParagraphLocationOrErrorJson(book, paragraphId);
  if (locationResult.kind === 'error') return { kind: 'error', json: locationResult.json };
  return {
    kind: 'ok',
    bookId: bookId as string,
    book,
    booksStore,
    paragraph: locationResult.location.paragraph,
  };
}

/**
 * get_paragraph_info / get_translation_history 等 `{ paragraph_id, include_memory? }` 只读工具
 * 的统一前置：解构参数 + resolveBookAndParagraphOrError。
 * 返回 { kind: 'error', json } 时调用方直接 return json。
 */
async function resolveParagraphIdReadArgs(
  args: unknown,
  bookId: string | null | undefined,
): Promise<
  | { kind: 'error'; json: string }
  | {
      kind: 'ok';
      paragraph_id: string;
      include_memory: boolean;
      book: Novel;
      location: ParagraphLocation;
    }
> {
  const { paragraph_id, include_memory = true } = args as {
    paragraph_id: string;
    include_memory?: boolean;
  };
  const resolved = await resolveBookAndParagraphOrError(bookId, paragraph_id);
  if (resolved.kind === 'error') return { kind: 'error', json: resolved.json };
  return {
    kind: 'ok',
    paragraph_id,
    include_memory,
    book: resolved.book,
    location: resolved.location,
  };
}

/**
 * select_translation / remove_translation 等 `{ paragraph_id, translation_id }` 工具的
 * 统一前置：解构参数、走 resolveParagraphTranslationForUpdate、再把常用字段摊开返回。
 * 返回 { kind: 'error', json } 时调用方直接 return json。
 */
async function resolveTranslationIdToolArgs(
  args: unknown,
  bookId: string | null | undefined,
): Promise<
  | { kind: 'error'; json: string }
  | {
      kind: 'ok';
      paragraph_id: string;
      translation_id: string;
      book: Novel;
      booksStore: ReturnType<typeof useBooksStore>;
      paragraph: ParagraphLocation['paragraph'];
      resolvedBookId: string;
    }
> {
  const { paragraph_id, translation_id } = args as {
    paragraph_id: string;
    translation_id: string;
  };
  const resolved = await resolveParagraphTranslationForUpdate(bookId, paragraph_id, translation_id);
  if (resolved.kind === 'error') return { kind: 'error', json: resolved.json };
  return {
    kind: 'ok',
    paragraph_id,
    translation_id,
    book: resolved.book,
    booksStore: resolved.booksStore,
    paragraph: resolved.paragraph,
    resolvedBookId: resolved.bookId,
  };
}

/**
 * get_previous_paragraphs / get_next_paragraphs 的共享 handler 工厂。
 * 两者除「段落获取方向」和 tool_name 外完全一致。
 */
function buildDirectionalParagraphsHandler(
  toolName: 'get_previous_paragraphs' | 'get_next_paragraphs',
  fetchResults: (
    book: Novel,
    paragraphId: string,
    count: number,
  ) => Promise<ParagraphSearchResult[]>,
): ToolHandler {
  return async (args, { bookId, onAction }) => {
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

    const book = resolveBookOrThrow(bookId);

    if (onAction) {
      onAction({
        type: 'read',
        entity: 'paragraph',
        data: {
          paragraph_id,
          tool_name: toolName,
        },
      });
    }

    const results = await fetchResults(book, paragraph_id, count);
    const validResults = results.filter((result) => !isEmptyOrSymbolOnly(result.paragraph.text));

    const relatedMemories = await loadRelatedMemoriesFromFirstParagraph(
      bookId,
      include_memory,
      validResults[0]?.paragraph?.text,
    );

    return JSON.stringify({
      success: true,
      paragraphs: validResults.map(buildParagraphPayload),
      count: validResults.length,
      ...(include_memory && relatedMemories.length > 0
        ? { related_memories: relatedMemories }
        : {}),
    });
  };
}

/**
 * 转义正则特殊字符，生成可直接拼进 RegExp 的字面量片段。
 * 被 replaceWholeKeyword / containsWholeKeyword 共用。
 */
function escapeRegex(keyword: string): string {
  return keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 依据关键词 / 文本是否含 CJK、关键词是否是纯英文单词，归一化为三种匹配策略。
 * 被 replaceWholeKeyword / containsWholeKeyword 共用，以消除两处重复的分支判定。
 */
type WholeKeywordStrategy = 'english' | 'cjk' | 'latin';

function pickWholeKeywordStrategy(text: string, keyword: string): WholeKeywordStrategy {
  const keywordHasCJK = hasCJK(keyword);
  const isEnglishWord = /^[a-zA-Z]+$/.test(keyword);
  if (isEnglishWord && !keywordHasCJK) {
    return 'english';
  }
  if (keywordHasCJK || hasCJK(text)) {
    return 'cjk';
  }
  return 'latin';
}

/**
 * `english` 策略下的完整词边界正则：前后允许文本边界、非字母数字、或 CJK 字符。
 * `flags` 控制全局 / 大小写等；replace 用 'giu'，test 用 'iu'。
 */
function buildEnglishBoundaryPattern(escapedKeyword: string, flags: string): RegExp {
  return new RegExp(
    `(^|[^a-zA-Z0-9]|[${CJK_CHAR_CLASS}])${escapedKeyword}([^a-zA-Z0-9]|[${CJK_CHAR_CLASS}]|$)`,
    flags,
  );
}

/**
 * `cjk` 策略下的「前后非 CJK / 文本边界」正则。CJK 子串在 CJK 字符中间的匹配由 fallback 处理。
 */
function buildCJKBoundaryPattern(escapedKeyword: string, flags: string): RegExp {
  return new RegExp(`(^|[^${CJK_CHAR_CLASS}])${escapedKeyword}([^${CJK_CHAR_CLASS}]|$)`, flags);
}

/**
 * `latin` 策略下的 Unicode 字母 / 数字边界正则（主要覆盖英文以外的纯拉丁语系文本）。
 */
function buildLatinBoundaryPattern(escapedKeyword: string, flags: string): RegExp {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapedKeyword}([^\\p{L}\\p{N}]|$)`, flags);
}

/**
 * 判断关键词在 CJK 上下文里某一次命中的前后字符是否属于「可匹配」组合。
 * 抽出后，手动扫描循环不再承担条件展开的认知负担。
 */
function isCJKContextBoundaryMatch(text: string, index: number, keywordLength: number): boolean {
  const beforeChar: string = index > 0 ? (text[index - 1] ?? '') : '';
  const afterChar: string =
    index + keywordLength < text.length ? (text[index + keywordLength] ?? '') : '';

  const beforeIsBoundary = index === 0 || !isCJK(beforeChar);
  const afterIsBoundary = index + keywordLength === text.length || !isCJK(afterChar);
  const beforeIsCJK = index > 0 && isCJK(beforeChar);
  const afterIsCJK = index + keywordLength < text.length && isCJK(afterChar);

  return (
    (beforeIsBoundary && afterIsBoundary) ||
    (beforeIsCJK && afterIsCJK) ||
    (beforeIsBoundary && afterIsCJK) ||
    (beforeIsCJK && afterIsBoundary)
  );
}

/**
 * CJK fallback：手动扫描 `text` 中所有 `keyword` 出现位置，命中「可匹配」组合时写替换。
 * 只在正则方案未命中时调用，保持原有行为（replaceWholeKeyword 用）。
 */
function manualReplaceCJK(text: string, keyword: string, replacement: string): string {
  let searchIndex = 0;
  const parts: string[] = [];
  let lastIndex = 0;

  while (true) {
    const index = text.indexOf(keyword, searchIndex);
    if (index === -1) break;

    if (isCJKContextBoundaryMatch(text, index, keyword.length)) {
      if (index > lastIndex) {
        parts.push(text.substring(lastIndex, index));
      }
      parts.push(replacement);
      lastIndex = index + keyword.length;
    }
    searchIndex = index + 1;
  }

  if (parts.length === 0) {
    return text;
  }
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  return parts.join('');
}

/**
 * CJK fallback（containsWholeKeyword 用）：扫描命中组合只要任一匹配即返回 true。
 */
function manualContainsCJK(text: string, keyword: string): boolean {
  let searchIndex = 0;
  while (true) {
    const index = text.indexOf(keyword, searchIndex);
    if (index === -1) return false;
    if (isCJKContextBoundaryMatch(text, index, keyword.length)) {
      return true;
    }
    searchIndex = index + 1;
  }
}

/**
 * replace 回调：把命中位置的前后边界字符原样保留，关键词本身替换为 replacement。
 */
function replaceKeepingBoundaries(
  replacement: string,
): (match: string, before: string, after: string) => string {
  return (_match, before, after) => (before || '') + replacement + (after || '');
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

  const escapedKeyword = escapeRegex(keyword);
  const strategy = pickWholeKeywordStrategy(text, keyword);

  if (strategy === 'english') {
    return text.replace(
      buildEnglishBoundaryPattern(escapedKeyword, 'giu'),
      replaceKeepingBoundaries(replacement),
    );
  }

  if (strategy === 'latin') {
    return text.replace(
      buildLatinBoundaryPattern(escapedKeyword, 'giu'),
      replaceKeepingBoundaries(replacement),
    );
  }

  // strategy === 'cjk'
  const regexResult = text.replace(
    buildCJKBoundaryPattern(escapedKeyword, 'giu'),
    replaceKeepingBoundaries(replacement),
  );
  if (regexResult !== text) {
    return regexResult;
  }
  return manualReplaceCJK(text, keyword, replacement);
}

/**
 * 尝试构造 CJK 场景下的后顾 / 前瞻正则（若运行时不支持则返回 null）。
 * 独立出来只为给 containsWholeKeyword 降低一层 try/catch 带来的认知复杂度。
 */
function tryBuildCJKLookaroundPattern(escapedKeyword: string): RegExp | null {
  try {
    const pattern = new RegExp(
      `(?<=[${CJK_CHAR_CLASS}]|^)${escapedKeyword}(?=[${CJK_CHAR_CLASS}]|$)`,
      'iu',
    );
    // 触发一次以在不支持 lookbehind 的运行时抛错。
    pattern.test('test');
    return pattern;
  } catch {
    return null;
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

  const escapedKeyword = escapeRegex(keyword);
  const strategy = pickWholeKeywordStrategy(text, keyword);

  if (strategy === 'english') {
    return buildEnglishBoundaryPattern(escapedKeyword, 'iu').test(text);
  }

  if (strategy === 'latin') {
    return buildLatinBoundaryPattern(escapedKeyword, 'iu').test(text);
  }

  // strategy === 'cjk'
  if (buildCJKBoundaryPattern(escapedKeyword, 'iu').test(text)) {
    return true;
  }
  const lookaround = tryBuildCJKLookaroundPattern(escapedKeyword);
  if (lookaround && lookaround.test(text)) {
    return true;
  }
  return manualContainsCJK(text, keyword);
}

/**
 * add_translation 的模型 ID 解析：优先用显式参数，其次沿用已有翻译模型，最后回退默认模型
 */
function resolveModelIdForAddTranslation(
  paragraph: ParagraphLocation['paragraph'],
  aiModelId: string | undefined,
  aiModelsStore: ReturnType<typeof useAIModelsStore>,
): { kind: 'ok'; modelId: string } | { kind: 'error'; json: string } {
  if (aiModelId) return { kind: 'ok', modelId: aiModelId };
  const existingModelId = paragraph.translations?.[0]?.aiModelId;
  if (existingModelId) return { kind: 'ok', modelId: existingModelId };
  const defaultModel = aiModelsStore.getDefaultModelForTask('translation');
  if (!defaultModel) {
    return {
      kind: 'error',
      json: JSON.stringify({
        success: false,
        error: '未找到可用的 AI 模型，请提供 ai_model_id 参数',
      }),
    };
  }
  return { kind: 'ok', modelId: defaultModel.id };
}

/**
 * add_translation 添加后设置 selectedTranslationId：set_as_selected 时直接选中新翻译，
 * 否则若原本无选中且存在翻译则自动选中第一条
 */
function applySelectionAfterAdd(
  paragraph: ParagraphLocation['paragraph'],
  newTranslationId: string,
  setAsSelected: boolean,
  updatedTranslations: Translation[],
): void {
  if (setAsSelected) {
    paragraph.selectedTranslationId = newTranslationId;
    return;
  }
  if (!paragraph.selectedTranslationId && updatedTranslations.length > 0) {
    paragraph.selectedTranslationId = updatedTranslations[0]?.id || '';
  }
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

      const resolved = await resolveBookAndParagraphOrError(bookId, paragraph_id);
      if (resolved.kind === 'error') return resolved.json;
      const book = resolved.book;
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
        response.previous_paragraphs = validPreviousResults.map(buildMinimalParagraphPayload);
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
        response.next_paragraphs = validNextResults.map(buildMinimalParagraphPayload);
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
        // fallow-ignore-next-line code-duplication
        parameters: buildParagraphIdSchema(undefined, true),
      },
    },
    handler: async (args, { bookId, onAction }) => {
      const readArgs = await resolveParagraphIdReadArgs(args, bookId);
      if (readArgs.kind === 'error') return readArgs.json;
      const { paragraph_id, include_memory, location } = readArgs;
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
      const translations = buildTranslationListPayload(paragraph);

      // 搜索相关记忆（从段落文本中提取关键词）
      const relatedMemories = await loadRelatedMemoriesFromFirstParagraph(
        bookId,
        include_memory,
        paragraph.text,
      );

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
          paragraphIndex: toDisplayParagraphIndex(location.paragraphIndex),
          chapterIndex: location.chapterIndex,
          volumeIndex: location.volumeIndex,
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
    handler: buildDirectionalParagraphsHandler(
      'get_previous_paragraphs',
      (book, paragraphId, count) =>
        ChapterService.getPreviousParagraphsAsync(book, paragraphId, count),
    ),
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
    handler: buildDirectionalParagraphsHandler(
      'get_next_paragraphs',
      (book, paragraphId, count) =>
        ChapterService.getNextParagraphsAsync(book, paragraphId, count),
    ),
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
    handler: async (args, { bookId, onAction }) => {
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

      // 校验并规范化关键词
      const { validKeywords, validTranslationKeywords } = normalizeFindKeywords(
        keywords,
        translation_keywords,
      );

      const book = resolveBookOrThrow(bookId);
      const resolvedBookId = bookId as string;

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

      // 第一阶段：用原文关键词搜索（优先索引、失败回退线性）
      if (validKeywords.length > 0) {
        await searchByOriginalKeywords({
          bookId: resolvedBookId,
          book,
          validKeywords,
          chapter_id,
          max_paragraphs,
          only_with_translation,
          allResults,
        });
      }

      // 第二阶段：按翻译关键词进一步过滤 / 搜索
      if (validTranslationKeywords.length > 0) {
        if (validKeywords.length > 0) {
          await filterResultsByTranslationKeywords(book, allResults, validTranslationKeywords);
        } else {
          const noVolumes = await searchByTranslationKeywordsOnly({
            book,
            validTranslationKeywords,
            chapter_id,
            max_paragraphs,
            allResults,
          });
          if (noVolumes) {
            return JSON.stringify({
              success: true,
              message: '书籍没有卷',
              replaced_count: 0,
            });
          }
        }
      }

      // 转换为数组并限制数量
      const results = Array.from(allResults.values()).slice(0, max_paragraphs);

      // 过滤掉空段落或仅包含符号的段落
      const validResults = results.filter((result) => !isEmptyOrSymbolOnly(result.paragraph.text));

      // 搜索相关记忆（使用提供的 keywords 或 translation_keywords）
      const relatedMemories = await lookupRelatedMemoriesForFind({
        bookId,
        include_memory,
        validKeywords,
        validTranslationKeywords,
      });

      return JSON.stringify({
        success: true,
        paragraphs: validResults.map(buildParagraphPayload),
        count: validResults.length,
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

      const book = resolveBookOrThrow(bookId);

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
        paragraphs: validResults.map(buildParagraphPayload),
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
        // fallow-ignore-next-line code-duplication
        parameters: buildParagraphIdSchema(undefined, true),
      },
    },
    handler: async (args, { bookId, onAction }) => {
      const readArgs = await resolveParagraphIdReadArgs(args, bookId);
      if (readArgs.kind === 'error') return readArgs.json;
      const { paragraph_id, include_memory } = readArgs;
      const { paragraph } = readArgs.location;

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

      // 构建完整的翻译历史信息（叠加 index / isLatest）
      const translationsBase = buildTranslationListPayload(paragraph);
      const total = translationsBase.length;
      const translationHistory = translationsBase.map((t, index) => ({
        ...t,
        index: index + 1, // 从1开始的索引
        isLatest: index === total - 1, // 是否是最新的翻译
      }));

      // 搜索相关记忆（从段落文本中提取关键词）
      const relatedMemories = await loadRelatedMemoriesFromFirstParagraph(
        bookId,
        include_memory,
        paragraph.text,
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

      const resolved = await resolveParagraphForWriteOrError(
        bookId,
        paragraph_id,
        '无法更新空段落的翻译',
      );
      if (resolved.kind === 'error') return resolved.json;
      const { book, booksStore, paragraph, bookId: resolvedBookId } = resolved;

      // 查找要更新的翻译
      const tRes = findTranslationIndexOrError(paragraph, translation_id);
      if (tRes.kind === 'error') return tRes.json;
      const translationToUpdate = tRes.translation;

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
        parameters: buildParagraphIdSchema('要选择的翻译 ID（必须是该段落翻译历史中存在的翻译ID）'),
      },
    },
    // fallow-ignore-next-line code-duplication
    handler: async (args, { bookId, onAction }) => {
      const resolvedArgs = await resolveTranslationIdToolArgs(args, bookId);
      if (resolvedArgs.kind === 'error') return resolvedArgs.json;
      const { paragraph_id, translation_id, book, booksStore, paragraph, resolvedBookId } =
        resolvedArgs;

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
      const tRes = findTranslationIndexOrError(paragraph, translation_id);
      if (tRes.kind === 'error') return tRes.json;
      const translation = tRes.translation;

      // 保存原始选中的翻译ID
      const originalSelectedId = paragraph.selectedTranslationId || '';

      // 更新选中的翻译ID
      paragraph.selectedTranslationId = translation_id;

      // 更新书籍（保存更改）
      // 注意：章节内容保存会启用 skipIfUnchanged，并用“序列化快照”检测变化（含就地修改）。
      await booksStore.updateBook(resolvedBookId, { volumes: book.volumes });

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
      if (!paragraph_id || !translation) {
        throw new Error('段落 ID 和翻译内容不能为空');
      }

      const resolved = await resolveParagraphForWriteOrError(
        bookId,
        paragraph_id,
        '无法为空段落添加翻译',
      );
      if (resolved.kind === 'error') return resolved.json;
      const { book, booksStore, paragraph, bookId: resolvedBookId } = resolved;
      const aiModelsStore = useAIModelsStore();

      // 确定使用的 AI 模型 ID
      const modelRes = resolveModelIdForAddTranslation(paragraph, ai_model_id, aiModelsStore);
      if (modelRes.kind === 'error') return modelRes.json;
      const modelId = modelRes.modelId;

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
      const existingTranslations = paragraph.translations || [];
      const existingTranslationIds = existingTranslations.map((t) => t.id);
      const idGenerator = new UniqueIdGenerator(existingTranslationIds);
      const newTranslation: Translation = {
        id: idGenerator.generate(),
        translation: translation,
        aiModelId: modelId,
      };

      // 添加翻译（使用 ChapterService 的辅助方法，自动限制最多5个）
      const updatedTranslations = ChapterService.addParagraphTranslation(
        existingTranslations,
        newTranslation,
      );

      // 更新段落的翻译数组
      paragraph.translations = updatedTranslations;

      // 如果设置为选中，更新选中的翻译 ID；否则在无选中时自动选中第一条
      applySelectionAfterAdd(paragraph, newTranslation.id, set_as_selected, updatedTranslations);

      // 更新书籍（保存更改）
      // 注意：章节内容保存会启用 skipIfUnchanged，并用"序列化快照"检测变化（含就地修改）。
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
        parameters: buildParagraphIdSchema('要删除的翻译 ID（必须是该段落翻译历史中存在的翻译ID）'),
      },
    },
    // fallow-ignore-next-line code-duplication
    handler: async (args, { bookId, onAction }) => {
      const resolvedArgs = await resolveTranslationIdToolArgs(args, bookId);
      if (resolvedArgs.kind === 'error') return resolvedArgs.json;
      const { paragraph_id, translation_id, book, booksStore, paragraph, resolvedBookId } =
        resolvedArgs;

      // 验证翻译是否存在
      const tRes = findTranslationIndexOrError(paragraph, translation_id);
      if (tRes.kind === 'error') return tRes.json;
      const translationIndex = tRes.index;
      const translationToDelete = tRes.translation;

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
      await booksStore.updateBook(resolvedBookId, { volumes: book.volumes });

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
    handler: async (args, { bookId, onAction }) => {
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

      // 验证并规范化输入的关键词数组
      const { validKeywords, validOriginalKeywords } = normalizeReplaceKeywords(
        keywords,
        original_keywords,
      );

      const { book, booksStore } = resolveBookAndStoreOrThrow(bookId);
      const resolvedBookId = bookId as string;

      // 注意：不在这里发送 read action，批量替换完成后会发送一个汇总的 update action

      const emptyReplaceResponse = (message: string): string =>
        JSON.stringify({
          success: true,
          message,
          replaced_count: 0,
          keywords: validKeywords.length > 0 ? validKeywords : undefined,
          original_keywords: validOriginalKeywords.length > 0 ? validOriginalKeywords : undefined,
        });

      // 如果提供了 chapter_id，定位目标章节；若找不到则提前返回
      const target = locateTargetChapter(book, chapter_id);
      if (chapter_id && !target) {
        return emptyReplaceResponse('未找到指定的章节');
      }
      const targetVolumeIndex = target?.volumeIndex ?? null;
      const targetChapterIndex = target?.chapterIndex ?? null;

      if (!book.volumes) {
        return emptyReplaceResponse('书籍没有卷');
      }

      // 第一遍：批量加载需要的章节内容
      await preloadReplaceRange(book, chapter_id, targetVolumeIndex, targetChapterIndex);

      // 收集所有匹配的段落
      const allResults: Map<string, ParagraphSearchResult> = new Map();

      const runLinearSearch = async (): Promise<string | null> => {
        if (!book.volumes) {
          return emptyReplaceResponse('书籍没有卷');
        }
        await collectLinearReplaceMatches({
          book,
          chapter_id,
          targetVolumeIndex,
          targetChapterIndex,
          validKeywords,
          validOriginalKeywords,
          maxReplacements: max_replacements,
          allResults,
        });
        return null;
      };

      // 第二遍：优先使用全文索引定位段落
      const indexSucceeded = await collectIndexReplaceMatches({
        bookId: resolvedBookId,
        book,
        chapter_id,
        validKeywords,
        validOriginalKeywords,
        maxReplacements: max_replacements,
        allResults,
      });

      if (!indexSucceeded || allResults.size < max_replacements) {
        const fallbackResult = await runLinearSearch();
        if (fallbackResult) {
          return fallbackResult;
        }
      }

      // 转换为数组并限制数量
      const results = Array.from(allResults.values()).slice(0, max_replacements);

      if (results.length === 0) {
        return emptyReplaceResponse('未找到匹配的段落');
      }

      // 执行替换操作
      const replacedParagraphs = applyKeywordReplacements({
        results,
        validKeywords,
        validOriginalKeywords,
        replacementText: replacement_text,
        replaceAllTranslations: replace_all_translations,
      });

      // 更新书籍（保存更改）
      // 注意：章节内容保存会启用 skipIfUnchanged，并用“序列化快照”检测变化（含就地修改）。
      await booksStore.updateBook(resolvedBookId, { volumes: book.volumes });

      // 报告批量替换操作（单个汇总 action，而不是每个替换一个）
      if (onAction && replacedParagraphs.length > 0) {
        emitReplaceAction({
          onAction,
          replacedParagraphs,
          validKeywords,
          validOriginalKeywords,
          replacementText: replacement_text,
          replaceAllTranslations: replace_all_translations,
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

/**
 * 过滤字符串数组中的空值 / 非字符串值，返回 trim 后非空的项
 */
function filterValidKeywords(input: unknown): string[] {
  if (!input || !Array.isArray(input)) return [];
  return input.filter((k): k is string => !!k && typeof k === 'string' && k.trim().length > 0);
}

/**
 * 校验 find_paragraph_by_keywords 的关键词参数
 */
function normalizeFindKeywords(
  keywords: unknown,
  translationKeywords: unknown,
): { validKeywords: string[]; validTranslationKeywords: string[] } {
  const hasKeywords = Array.isArray(keywords) && keywords.length > 0;
  const hasTranslation = Array.isArray(translationKeywords) && translationKeywords.length > 0;
  if (!hasKeywords && !hasTranslation) {
    throw new Error('必须提供 keywords 或 translation_keywords 至少一个关键词数组');
  }
  const validKeywords = filterValidKeywords(keywords);
  const validTranslationKeywords = filterValidKeywords(translationKeywords);
  if (validKeywords.length === 0 && validTranslationKeywords.length === 0) {
    throw new Error('必须提供至少一个有效的关键词数组');
  }
  return { validKeywords, validTranslationKeywords };
}

/**
 * 用原文关键词在 book 中搜索段落：优先使用全文索引，索引失败时线性回退
 */
async function searchByOriginalKeywords(params: {
  bookId: string;
  book: Novel;
  validKeywords: string[];
  chapter_id: string | undefined;
  max_paragraphs: number;
  only_with_translation: boolean;
  allResults: Map<string, ParagraphSearchResult>;
}): Promise<void> {
  const {
    bookId,
    book,
    validKeywords,
    chapter_id,
    max_paragraphs,
    only_with_translation,
    allResults,
  } = params;
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
    for (const result of indexResults) {
      if (!allResults.has(result.paragraph.id)) {
        allResults.set(result.paragraph.id, result);
      }
    }
  } catch (error) {
    console.warn('Full-text index search failed, falling back to linear search:', error);
    for (const keyword of validKeywords) {
      // 使用优化的异步方法，按需加载章节内容（只加载需要搜索的章节）
      const results = await ChapterService.searchParagraphsByKeywordAsync(
        book,
        keyword,
        chapter_id || undefined,
        max_paragraphs * validKeywords.length,
        only_with_translation,
      );
      for (const result of results) {
        if (!allResults.has(result.paragraph.id)) {
          allResults.set(result.paragraph.id, result);
        }
      }
      // 乘以 2 是为了给后续的翻译文本搜索留出空间
      if (allResults.size >= max_paragraphs * 2) break;
    }
  }
}

/**
 * 判断段落翻译是否命中给定关键词（小写）。
 * 任一翻译包含任一关键词即视为命中；段落无翻译直接返回 false。
 */
function matchesTranslationKeyword(
  paragraph: { translations?: Array<{ translation?: string | null }> | undefined | null },
  translationKeywordLower: string[],
): boolean {
  if (!paragraph.translations || paragraph.translations.length === 0) return false;
  return paragraph.translations.some((t) =>
    translationKeywordLower.some((kw) => t.translation?.toLowerCase().includes(kw)),
  );
}

/**
 * 在 replace_range 指定的卷范围内迭代，统一处理卷级前置校验（有效卷、chapter_id 过滤、
 * 提前退出条件）。调用方通过 `onVolume` 接收已就绪的 { volume, vIndex, startC, endC }。
 */
async function iterateReplaceRangeVolumes(params: {
  book: Novel;
  chapter_id: string | undefined;
  targetVolumeIndex: number | null;
  targetChapterIndex: number | null;
  shouldStop: () => boolean;
  onVolume: (ctx: {
    volume: Volume;
    vIndex: number;
    startC: number;
    endC: number;
  }) => Promise<void>;
}): Promise<void> {
  const { book, chapter_id, targetVolumeIndex, targetChapterIndex, shouldStop, onVolume } = params;
  if (!book.volumes) return;
  const range = resolveReplaceRange(book, chapter_id, targetVolumeIndex, targetChapterIndex);
  for (let vIndex = range.startVolumeIndex; vIndex <= range.endVolumeIndex; vIndex++) {
    if (shouldStop()) break;
    const volume = book.volumes[vIndex];
    if (!volume || !volume.chapters) continue;
    if (chapter_id && targetVolumeIndex !== null && vIndex !== targetVolumeIndex) continue;
    const startC = range.startChapterIndex ?? 0;
    const endC = range.endChapterIndex ?? volume.chapters.length - 1;
    await onVolume({ volume, vIndex, startC, endC });
  }
}

/**
 * 若 allResults 中的章节尚未加载内容，批量加载所需章节
 */
async function ensureChaptersLoaded(
  book: Novel,
  allResults: Map<string, ParagraphSearchResult>,
): Promise<void> {
  const chaptersNeeded = new Set<string>();
  for (const result of allResults.values()) {
    if (result.chapter.content === undefined) {
      chaptersNeeded.add(result.chapter.id);
    }
  }
  if (chaptersNeeded.size === 0) return;
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

/**
 * 根据翻译关键词过滤已收集的段落（原文关键词同时生效的场景）
 */
async function filterResultsByTranslationKeywords(
  book: Novel,
  allResults: Map<string, ParagraphSearchResult>,
  validTranslationKeywords: string[],
): Promise<void> {
  await ensureChaptersLoaded(book, allResults);
  const translationKeywordLower = validTranslationKeywords.map((k) => k.toLowerCase());
  const filtered: Map<string, ParagraphSearchResult> = new Map();
  for (const [paragraphId, result] of allResults) {
    if (matchesTranslationKeyword(result.paragraph, translationKeywordLower)) {
      filtered.set(paragraphId, result);
    }
  }
  allResults.clear();
  for (const [id, result] of filtered) {
    allResults.set(id, result);
  }
}

const MAX_FIND_CHAPTERS_TO_LOAD = 50;

/**
 * 扫描单个卷内未加载的章节，写入 chaptersToLoad；返回 true 表示已达 MAX_FIND_CHAPTERS_TO_LOAD 上限。
 */
function collectVolumeChaptersToLoad(
  volume: Volume,
  vIndex: number,
  startChapterIndex: number,
  endChapterIndex: number,
  chaptersToLoad: { chapter: Chapter; vIndex: number; cIndex: number }[],
): boolean {
  if (!volume.chapters) return false;
  for (let cIndex = startChapterIndex; cIndex <= endChapterIndex; cIndex++) {
    const chapter = volume.chapters[cIndex];
    if (!chapter) continue;
    if (chapter.content !== undefined) continue;
    if (chaptersToLoad.length >= MAX_FIND_CHAPTERS_TO_LOAD) {
      console.warn(`[paragraphTools] 搜索章节过多，限制在前 ${MAX_FIND_CHAPTERS_TO_LOAD} 章`);
      return true;
    }
    chaptersToLoad.push({ chapter, vIndex, cIndex });
  }
  return false;
}

/**
 * 是否限定到某个具体卷 / 章（chapter_id 与目标索引同时存在）
 */
function isScopedToIndex(chapter_id: string | undefined, targetIndex: number | null): boolean {
  return !!(chapter_id && targetIndex !== null);
}

/**
 * 解析搜索范围：限定时退化为单点 [target, target]，否则使用全书/全卷范围
 */
function resolveScopedRange(
  scoped: boolean,
  target: number,
  fallbackStart: number,
  fallbackEnd: number,
): { start: number; end: number } {
  return scoped ? { start: target, end: target } : { start: fallbackStart, end: fallbackEnd };
}

/**
 * 收集仅用翻译关键词搜索时需要加载的章节
 */
function collectTranslationSearchChapters(
  book: Novel,
  chapter_id: string | undefined,
  targetVolumeIndex: number | null,
  targetChapterIndex: number | null,
): { chapter: Chapter; vIndex: number; cIndex: number }[] {
  const chaptersToLoad: { chapter: Chapter; vIndex: number; cIndex: number }[] = [];
  if (!book.volumes) return chaptersToLoad;

  const scopedToVolume = isScopedToIndex(chapter_id, targetVolumeIndex);
  const volumeRange = resolveScopedRange(
    scopedToVolume,
    targetVolumeIndex ?? 0,
    0,
    book.volumes.length - 1,
  );

  for (let vIndex = volumeRange.start; vIndex <= volumeRange.end; vIndex++) {
    const volume = book.volumes[vIndex];
    if (!volume || !volume.chapters) continue;
    if (scopedToVolume && vIndex !== targetVolumeIndex) continue;

    const scopedToChapter = isScopedToIndex(chapter_id, targetChapterIndex);
    const chapterRange = resolveScopedRange(
      scopedToChapter,
      targetChapterIndex ?? 0,
      0,
      volume.chapters.length - 1,
    );

    if (
      collectVolumeChaptersToLoad(
        volume,
        vIndex,
        chapterRange.start,
        chapterRange.end,
        chaptersToLoad,
      )
    ) {
      return chaptersToLoad;
    }
  }
  return chaptersToLoad;
}

/**
 * 在范围内扫描翻译文本，匹配的段落写入 allResults
 */
async function scanVolumesForTranslationKeyword(params: {
  book: Novel;
  chapter_id: string | undefined;
  targetVolumeIndex: number | null;
  targetChapterIndex: number | null;
  translationKeywordLower: string[];
  max_paragraphs: number;
  allResults: Map<string, ParagraphSearchResult>;
}): Promise<void> {
  const {
    book,
    chapter_id,
    targetVolumeIndex,
    targetChapterIndex,
    translationKeywordLower,
    max_paragraphs,
    allResults,
  } = params;
  await iterateReplaceRangeVolumes({
    book,
    chapter_id,
    targetVolumeIndex,
    targetChapterIndex,
    shouldStop: () => allResults.size >= max_paragraphs,
    onVolume: async ({ volume, vIndex, startC, endC }) => {
      await scanVolumeForTranslationKeyword({
        volume,
        vIndex,
        startC,
        endC,
        translationKeywordLower,
        max_paragraphs,
        allResults,
      });
    },
  });
}

/**
 * 在单个卷内扫描翻译关键词
 */
async function scanVolumeForTranslationKeyword(params: {
  volume: Volume;
  vIndex: number;
  startC: number;
  endC: number;
  translationKeywordLower: string[];
  max_paragraphs: number;
  allResults: Map<string, ParagraphSearchResult>;
}): Promise<void> {
  const {
    volume,
    vIndex,
    startC,
    endC,
    translationKeywordLower,
    max_paragraphs,
    allResults,
  } = params;
  for (let cIndex = startC; cIndex <= endC; cIndex++) {
    if (allResults.size >= max_paragraphs) break;
    const chapter = volume.chapters?.[cIndex];
    if (!chapter) continue;
    await ensureSingleChapterContentLoaded(chapter);
    if (!chapter.content) continue;
    collectTranslationMatchesInChapter({
      chapter,
      cIndex,
      volume,
      vIndex,
      translationKeywordLower,
      max_paragraphs,
      allResults,
    });
  }
}

/**
 * 在单个章节中扫描翻译关键词匹配
 */
function collectTranslationMatchesInChapter(params: {
  chapter: Chapter;
  cIndex: number;
  volume: Volume;
  vIndex: number;
  translationKeywordLower: string[];
  max_paragraphs: number;
  allResults: Map<string, ParagraphSearchResult>;
}): void {
  const { chapter, cIndex, volume, vIndex, translationKeywordLower, max_paragraphs, allResults } =
    params;
  const content = chapter.content;
  if (!content) return;
  for (let pIndex = 0; pIndex < content.length; pIndex++) {
    if (allResults.size >= max_paragraphs) return;
    const paragraph = content[pIndex];
    if (!paragraph) continue;
    if (!matchesTranslationKeyword(paragraph, translationKeywordLower)) continue;
    if (!allResults.has(paragraph.id)) {
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

/**
 * 仅提供翻译关键词时的搜索路径：加载候选章节并扫描。返回 true 表示书籍没有卷需要上层提前返回
 */
async function searchByTranslationKeywordsOnly(params: {
  book: Novel;
  validTranslationKeywords: string[];
  chapter_id: string | undefined;
  max_paragraphs: number;
  allResults: Map<string, ParagraphSearchResult>;
}): Promise<boolean> {
  const { book, validTranslationKeywords, chapter_id, max_paragraphs, allResults } = params;
  if (!book.volumes) return true;

  const target = locateTargetChapter(book, chapter_id);
  const targetVolumeIndex = target?.volumeIndex ?? null;
  const targetChapterIndex = target?.chapterIndex ?? null;

  const chaptersToLoad = collectTranslationSearchChapters(
    book,
    chapter_id,
    targetVolumeIndex,
    targetChapterIndex,
  );
  await bulkLoadMissingChapters(chaptersToLoad);

  const translationKeywordLower = validTranslationKeywords.map((k) => k.toLowerCase());
  await scanVolumesForTranslationKeyword({
    book,
    chapter_id,
    targetVolumeIndex,
    targetChapterIndex,
    translationKeywordLower,
    max_paragraphs,
    allResults,
  });
  return false;
}

/**
 * find_paragraph_by_keywords 的相关记忆查询
 */
async function lookupRelatedMemoriesForFind(params: {
  bookId: string | undefined;
  include_memory: boolean;
  validKeywords: string[];
  validTranslationKeywords: string[];
}): Promise<Array<{ id: string; summary: string }>> {
  const { bookId, include_memory, validKeywords, validTranslationKeywords } = params;
  if (!include_memory || !bookId) return [];
  const searchKeywords: string[] = [...validKeywords, ...validTranslationKeywords];
  if (searchKeywords.length === 0) return [];
  return searchRelatedMemoriesHybrid(bookId, [], searchKeywords, 5);
}

/**
 * 验证 batch_replace_translations 关键词参数并返回规范化结果
 */
function normalizeReplaceKeywords(
  keywords: unknown,
  originalKeywords: unknown,
): { validKeywords: string[]; validOriginalKeywords: string[] } {
  const hasKeywords = Array.isArray(keywords) && keywords.length > 0;
  const hasOriginal = Array.isArray(originalKeywords) && originalKeywords.length > 0;
  if (!hasKeywords && !hasOriginal) {
    throw new Error('必须提供 keywords 或 original_keywords 至少一个关键词数组');
  }
  const validKeywords = filterValidKeywords(keywords);
  const validOriginalKeywords = filterValidKeywords(originalKeywords);
  if (validKeywords.length === 0 && validOriginalKeywords.length === 0) {
    throw new Error('必须提供至少一个有效的关键词数组');
  }
  return { validKeywords, validOriginalKeywords };
}

/**
 * 定位指定 chapter_id 在 book.volumes 中的 (vIndex, cIndex)
 */
function locateTargetChapter(
  book: Novel,
  chapterId: string | undefined,
): { volumeIndex: number; chapterIndex: number } | null {
  if (!chapterId || !book.volumes) return null;
  for (let vIndex = 0; vIndex < book.volumes.length; vIndex++) {
    const volume = book.volumes[vIndex];
    const chapters = volume?.chapters;
    if (!chapters) continue;
    const cIndex = chapters.findIndex((c) => c.id === chapterId);
    if (cIndex !== -1) return { volumeIndex: vIndex, chapterIndex: cIndex };
  }
  return null;
}

/**
 * 计算替换时需要遍历的卷 / 章节索引范围
 */
function resolveReplaceRange(
  book: Novel,
  chapterId: string | undefined,
  targetVolumeIndex: number | null,
  targetChapterIndex: number | null,
): {
  startVolumeIndex: number;
  endVolumeIndex: number;
  startChapterIndex: number | null;
  endChapterIndex: number | null;
} {
  const hasTarget = !!chapterId && targetVolumeIndex !== null;
  const volumes = book.volumes ?? [];
  return {
    startVolumeIndex: hasTarget ? targetVolumeIndex! : 0,
    endVolumeIndex: hasTarget ? targetVolumeIndex! : volumes.length - 1,
    startChapterIndex: hasTarget && targetChapterIndex !== null ? targetChapterIndex : null,
    endChapterIndex: hasTarget && targetChapterIndex !== null ? targetChapterIndex : null,
  };
}

/**
 * 预加载替换范围内所有未加载的章节内容
 */
async function preloadReplaceRange(
  book: Novel,
  chapterId: string | undefined,
  targetVolumeIndex: number | null,
  targetChapterIndex: number | null,
): Promise<void> {
  if (!book.volumes) return;
  const range = resolveReplaceRange(book, chapterId, targetVolumeIndex, targetChapterIndex);
  const chaptersToLoad: { chapter: Chapter; vIndex: number; cIndex: number }[] = [];

  for (let vIndex = range.startVolumeIndex; vIndex <= range.endVolumeIndex; vIndex++) {
    const volume = book.volumes[vIndex];
    if (!volume || !volume.chapters) continue;
    if (chapterId && targetVolumeIndex !== null && vIndex !== targetVolumeIndex) continue;

    const startC = range.startChapterIndex ?? 0;
    const endC = range.endChapterIndex ?? volume.chapters.length - 1;
    for (let cIndex = startC; cIndex <= endC; cIndex++) {
      const chapter = volume.chapters[cIndex];
      if (!chapter) continue;
      if (chapter.content === undefined) {
        chaptersToLoad.push({ chapter, vIndex, cIndex });
      }
    }
  }

  await bulkLoadMissingChapters(chaptersToLoad);
}

/**
 * 检查段落是否同时满足原文 / 翻译两侧的关键词过滤条件
 * 返回 null 表示不匹配（需要跳过）
 */
function evaluateKeywordMatch(
  paragraph: { text?: string; translations?: Translation[] },
  validKeywords: string[],
  validOriginalKeywords: string[],
): boolean | null {
  const matchesOriginal =
    validOriginalKeywords.length === 0 ||
    validOriginalKeywords.some((kw) => containsWholeKeyword(paragraph.text || '', kw));

  if (validKeywords.length > 0) {
    if (!paragraph.translations || paragraph.translations.length === 0) return null;
    const matchesTranslation = paragraph.translations.some((t) =>
      validKeywords.some((kw) => containsWholeKeyword(t.translation || '', kw)),
    );
    return matchesOriginal && matchesTranslation;
  }

  // 仅原文关键词：仍要求段落存在翻译，否则无法替换
  if (!paragraph.translations || paragraph.translations.length === 0) return null;
  return matchesOriginal;
}

/**
 * 使用全文索引服务收集匹配段落；索引失败或无可用关键词时返回 false
 */
async function collectIndexReplaceMatches(params: {
  bookId: string;
  book: Novel;
  chapter_id: string | undefined;
  validKeywords: string[];
  validOriginalKeywords: string[];
  maxReplacements: number;
  allResults: Map<string, ParagraphSearchResult>;
}): Promise<boolean> {
  const {
    bookId,
    book,
    chapter_id,
    validKeywords,
    validOriginalKeywords,
    maxReplacements,
    allResults,
  } = params;
  try {
    const { FullTextIndexService } = await import('src/services/full-text-index-service');
    const searchKeywords = [...validOriginalKeywords, ...validKeywords];
    if (searchKeywords.length === 0) return true;

    const indexResults = await FullTextIndexService.search(bookId, searchKeywords, {
      ...(chapter_id ? { chapterId: chapter_id } : {}),
      maxResults: maxReplacements * 2,
      onlyWithTranslation: validKeywords.length > 0,
      searchInOriginal: validOriginalKeywords.length > 0,
      searchInTranslations: validKeywords.length > 0,
      novel: book,
    });

    // 过滤结果：检查是否同时满足两个条件（如果提供了两种关键词）
    // 注意：FullTextIndexService.search 已支持传入 novel 引用，这里拿到的 paragraph/chapter
    // 应与当前 booksStore 中的 book 保持同一引用，可直接修改并保存。
    for (const result of indexResults) {
      if (allResults.size >= maxReplacements) break;
      const paragraph = result.paragraph;
      if (isEmptyParagraph(paragraph.text)) continue;
      const matched = evaluateKeywordMatch(paragraph, validKeywords, validOriginalKeywords);
      if (matched && !allResults.has(paragraph.id)) {
        allResults.set(paragraph.id, result);
      }
    }
    return true;
  } catch (error) {
    console.warn('Full-text index search failed, falling back to linear search:', error);
    return false;
  }
}

/**
 * 对范围内的所有章节执行线性扫描，补充/替代索引匹配结果
 */
async function collectLinearReplaceMatches(params: {
  book: Novel;
  chapter_id: string | undefined;
  targetVolumeIndex: number | null;
  targetChapterIndex: number | null;
  validKeywords: string[];
  validOriginalKeywords: string[];
  maxReplacements: number;
  allResults: Map<string, ParagraphSearchResult>;
}): Promise<void> {
  const {
    book,
    chapter_id,
    targetVolumeIndex,
    targetChapterIndex,
    validKeywords,
    validOriginalKeywords,
    maxReplacements,
    allResults,
  } = params;
  await iterateReplaceRangeVolumes({
    book,
    chapter_id,
    targetVolumeIndex,
    targetChapterIndex,
    shouldStop: () => allResults.size >= maxReplacements,
    onVolume: async ({ volume, vIndex, startC, endC }) => {
      const chapters = volume.chapters;
      if (!chapters) return;
      for (let cIndex = startC; cIndex <= endC; cIndex++) {
        if (allResults.size >= maxReplacements) break;
        const chapter = chapters[cIndex];
        if (!chapter) continue;
        await ensureSingleChapterContentLoaded(chapter);
        if (!chapter.content) continue;
        scanChapterForReplaceMatches({
          chapter,
          cIndex,
          volume,
          vIndex,
          validKeywords,
          validOriginalKeywords,
          maxReplacements,
          allResults,
        });
      }
    },
  });
}

/**
 * 扫描单个章节，将匹配的段落写入 allResults
 */
function scanChapterForReplaceMatches(params: {
  chapter: Chapter;
  cIndex: number;
  volume: Volume;
  vIndex: number;
  validKeywords: string[];
  validOriginalKeywords: string[];
  maxReplacements: number;
  allResults: Map<string, ParagraphSearchResult>;
}): void {
  const {
    chapter,
    cIndex,
    volume,
    vIndex,
    validKeywords,
    validOriginalKeywords,
    maxReplacements,
    allResults,
  } = params;
  const content = chapter.content;
  if (!content) return;
  for (let pIndex = 0; pIndex < content.length; pIndex++) {
    if (allResults.size >= maxReplacements) return;
    const paragraph = content[pIndex];
    if (!paragraph) continue;
    if (isEmptyParagraph(paragraph.text)) continue;

    const matched = evaluateKeywordMatch(paragraph, validKeywords, validOriginalKeywords);
    if (matched && !allResults.has(paragraph.id)) {
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

interface ReplacedParagraphRecord {
  paragraph_id: string;
  chapter_id: string;
  old_selected_translation_id: string;
  old_translations: Translation[];
  new_translation: string;
}

/**
 * 在候选翻译中找到第一个包含给定关键词集的关键词
 */
function findMatchedKeyword(
  translations: Translation[],
  keywords: string[],
): string | null {
  for (const translation of translations) {
    for (const keyword of keywords) {
      if (containsWholeKeyword(translation.translation || '', keyword)) {
        return keyword;
      }
    }
  }
  return null;
}

/**
 * 对单个段落执行关键词替换，返回该段落的替换记录（若无任何替换则返回 null）
 */
function replaceParagraphTranslations(
  result: ParagraphSearchResult,
  params: {
    validKeywords: string[];
    validOriginalKeywords: string[];
    replacementText: string;
    replaceAllTranslations: boolean;
  },
): ReplacedParagraphRecord | null {
  const { paragraph } = result;
  if (!paragraph.translations || paragraph.translations.length === 0) return null;

  // 依次尝试翻译关键词、原文关键词（后者用于数字、专有名词等场景）
  const matchedKeyword =
    (params.validKeywords.length > 0
      ? findMatchedKeyword(paragraph.translations, params.validKeywords)
      : null) ??
    (params.validOriginalKeywords.length > 0
      ? findMatchedKeyword(paragraph.translations, params.validOriginalKeywords)
      : null);

  if (!matchedKeyword) return null;
  const keywordToReplace = matchedKeyword;
  const replacement = params.replacementText.trim();

  const oldSelectedTranslationId = paragraph.selectedTranslationId || '';
  const oldTranslations: Translation[] = [];

  const performReplacement = (translation: Translation) => {
    translation.translation = replaceWholeKeyword(
      translation.translation || '',
      keywordToReplace,
      replacement,
    );
  };

  const snapshot = (t: Translation): Translation => ({
    id: t.id,
    translation: t.translation || '',
    aiModelId: t.aiModelId || '',
  });

  if (params.replaceAllTranslations) {
    for (const translation of paragraph.translations) {
      if (!translation || !translation.id) continue;
      oldTranslations.push(snapshot(translation));
      performReplacement(translation);
    }
  } else if (paragraph.selectedTranslationId) {
    const selected = paragraph.translations.find((t) => t.id === paragraph.selectedTranslationId);
    if (selected && selected.id) {
      oldTranslations.push(snapshot(selected));
      performReplacement(selected);
    }
  } else {
    const first = paragraph.translations[0];
    if (first && first.id) {
      oldTranslations.push(snapshot(first));
      performReplacement(first);
      paragraph.selectedTranslationId = first.id;
    }
  }

  if (oldTranslations.length === 0) return null;
  return {
    paragraph_id: paragraph.id,
    chapter_id: result.chapter.id,
    old_selected_translation_id: oldSelectedTranslationId,
    old_translations: oldTranslations,
    new_translation: replacement,
  };
}

/**
 * 对所有候选段落执行替换并收集结果
 */
function applyKeywordReplacements(params: {
  results: ParagraphSearchResult[];
  validKeywords: string[];
  validOriginalKeywords: string[];
  replacementText: string;
  replaceAllTranslations: boolean;
}): ReplacedParagraphRecord[] {
  const replaced: ReplacedParagraphRecord[] = [];
  for (const result of params.results) {
    const record = replaceParagraphTranslations(result, {
      validKeywords: params.validKeywords,
      validOriginalKeywords: params.validOriginalKeywords,
      replacementText: params.replacementText,
      replaceAllTranslations: params.replaceAllTranslations,
    });
    if (record) replaced.push(record);
  }
  return replaced;
}

/**
 * 发送批量替换的汇总 action（包括撤销所需的 previousData）
 */
function emitReplaceAction(params: {
  onAction: (action: ActionInfo) => void;
  replacedParagraphs: ReplacedParagraphRecord[];
  validKeywords: string[];
  validOriginalKeywords: string[];
  replacementText: string;
  replaceAllTranslations: boolean;
}): void {
  const totalTranslationCount = params.replacedParagraphs.reduce(
    (sum, p) => sum + p.old_translations.length,
    0,
  );
  params.onAction({
    type: 'update',
    entity: 'translation',
    data: {
      tool_name: 'batch_replace_translations',
      replaced_paragraph_count: params.replacedParagraphs.length,
      replaced_translation_count: totalTranslationCount,
      ...(params.validKeywords.length > 0 ? { keywords: params.validKeywords } : {}),
      ...(params.validOriginalKeywords.length > 0
        ? { original_keywords: params.validOriginalKeywords }
        : {}),
      replacement_text: params.replacementText.trim(),
      replace_all_translations: params.replaceAllTranslations,
    } as ActionInfo['data'],
    previousData: {
      replaced_paragraphs: params.replacedParagraphs.map((p) => ({
        paragraph_id: p.paragraph_id,
        chapter_id: p.chapter_id,
        old_selected_translation_id: p.old_selected_translation_id,
        old_translations: p.old_translations,
      })),
    },
  });
}
