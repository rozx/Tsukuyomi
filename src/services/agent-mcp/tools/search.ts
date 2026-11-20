import type { AppLocale } from 'src/models/locale';
import type { Chapter, Novel, Paragraph } from 'src/models/novel';
import type { AgentMcpWriteMode } from 'src/models/settings';
import { BookService } from 'src/services/book-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { ChapterEmbeddingService } from 'src/services/chapter-embedding-service';
import { EmbeddingService } from 'src/services/embedding-service';
import type {
  ChapterTranslationEditGroup,
  ParagraphTranslationEdit,
} from 'src/services/localization/paragraph-edit';
import { getLanguageTranslation } from 'src/services/localization/selection';
import { titleOriginal } from 'src/services/localization/title-edit';
import { useSettingsStore } from 'src/stores/settings';
import { isLocalEmbeddingEffectivelyEnabled } from 'src/utils/local-embedding';
import { buildExternalTranslationModelId } from 'src/utils/translation-model-label';
import {
  agentMcpError,
  type AgentMcpExecutionContext,
  type AgentMcpToolError,
  type AgentMcpToolSpec,
} from '../types';
import {
  findChapterInBook,
  FUZZY_PROPERTY,
  fuzzyMatchIndexes,
  parseLimit,
  parseNonNegativeInt,
  readStringList,
  readTrimmedString,
  refreshBookKeepingOpenChapter,
  resolveBookFromArgs,
} from './helpers';
import { buildEditForParagraph } from './translation';

type SearchTarget = 'original' | 'translation' | 'both';

/** 每批从存储读取的章节数：全书扫描时分批读，避免一次把整本书的正文都放进内存 */
const CHAPTER_LOAD_BATCH = 40;
const MAX_KEYWORDS = 20;
const MAX_CHAPTERS_PER_KEYWORD = 20;
const REPLACE_SAMPLE_COUNT = 10;

interface ScanScope {
  book: Novel;
  targetLanguage: AppLocale;
  chapters: Chapter[];
}

/** 确定扫描范围：给了 chapter_id 就只扫该章节，否则按卷章顺序扫全书 */
function resolveScanScope(
  args: Record<string, unknown>,
  ctx: AgentMcpExecutionContext,
): { ok: true; scope: ScanScope } | { ok: false; error: AgentMcpToolError } {
  const resolved = resolveBookFromArgs(args, ctx);
  if (!resolved.ok) return resolved;
  const { book, targetLanguage } = resolved;

  const chapterId = readTrimmedString(args.chapter_id);
  if (chapterId) {
    const chapter = findChapterInBook(book, chapterId);
    if (!chapter) {
      return {
        ok: false,
        error: agentMcpError('CHAPTER_NOT_FOUND', `Chapter not found: ${chapterId}`),
      };
    }
    return { ok: true, scope: { book, targetLanguage, chapters: [chapter] } };
  }
  const chapters = (book.volumes ?? []).flatMap((volume) => volume.chapters ?? []);
  return { ok: true, scope: { book, targetLanguage, chapters } };
}

/** 按顺序逐章给出段落；正文不在内存里的章节分批从存储读取 */
async function* scanChapters(
  chapters: readonly Chapter[],
): AsyncGenerator<{ chapter: Chapter; paragraphs: Paragraph[] }> {
  for (let start = 0; start < chapters.length; start += CHAPTER_LOAD_BATCH) {
    const batch = chapters.slice(start, start + CHAPTER_LOAD_BATCH);
    const missingIds = batch.filter((ch) => ch.content === undefined).map((ch) => ch.id);
    const loaded =
      missingIds.length > 0
        ? await ChapterContentService.loadChapterContentsBatch(missingIds)
        : new Map<string, Paragraph[] | undefined>();
    for (const chapter of batch) {
      yield { chapter, paragraphs: chapter.content ?? loaded.get(chapter.id) ?? [] };
    }
  }
}

function parseSearchTarget(value: unknown, fallback: SearchTarget): SearchTarget {
  return value === 'original' || value === 'translation' || value === 'both' ? value : fallback;
}

function selectedTranslationText(paragraph: Paragraph, language: AppLocale): string {
  return getLanguageTranslation(paragraph, language)?.translation ?? '';
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 统计 needle 在 text 中不重叠出现的次数（不区分大小写；两者需已转为小写） */
function countOccurrences(text: string, needle: string): number {
  let count = 0;
  let from = text.indexOf(needle);
  while (from !== -1) {
    count += 1;
    from = text.indexOf(needle, from + needle.length);
  }
  return count;
}

function buildTextMatcher(
  query: string,
  useRegex: boolean,
  caseSensitive: boolean,
): { ok: true; test: (text: string) => boolean } | { ok: false; error: AgentMcpToolError } {
  if (useRegex) {
    try {
      const pattern = new RegExp(query, caseSensitive ? '' : 'i');
      return { ok: true, test: (text) => pattern.test(text) };
    } catch (error) {
      return {
        ok: false,
        error: agentMcpError(
          'INVALID_REGEX',
          `Invalid regular expression: ${error instanceof Error ? error.message : String(error)}`,
        ),
      };
    }
  }
  if (caseSensitive) return { ok: true, test: (text) => text.includes(query) };
  const lowered = query.toLowerCase();
  return { ok: true, test: (text) => text.toLowerCase().includes(lowered) };
}

async function executeSearchParagraphs(
  args: Record<string, unknown>,
  ctx: AgentMcpExecutionContext,
) {
  const query = readTrimmedString(args.query);
  if (!query) return agentMcpError('INVALID_ARGS', 'query must be a non-empty string.');
  const useRegex = args.regex === true;
  const fuzzy = args.fuzzy === true;
  if (fuzzy && useRegex) {
    return agentMcpError('INVALID_ARGS', 'fuzzy and regex cannot be used together.');
  }
  const caseSensitive = args.case_sensitive === true;
  const matcher = buildTextMatcher(query, useRegex, caseSensitive);
  if (!matcher.ok) return matcher.error;

  const resolved = resolveScanScope(args, ctx);
  if (!resolved.ok) return resolved.error;
  const { book, targetLanguage, chapters } = resolved.scope;

  const searchIn = parseSearchTarget(args.search_in, 'both');
  const limit = parseLimit(args.limit, 20, 100);
  const offset = parseNonNegativeInt(args.offset, 0);

  const matches: Array<Record<string, unknown>> = [];
  let matchedSoFar = 0;
  let hasMore = false;

  scan: for await (const { chapter, paragraphs } of scanChapters(chapters)) {
    // 模糊搜索按章节一次算出命中的段落；精确搜索逐段判断
    const fuzzyHits = fuzzy
      ? new Set(
          fuzzyMatchIndexes(
            paragraphs,
            (paragraph) => [
              searchIn !== 'translation' ? paragraph.text : '',
              searchIn !== 'original' ? selectedTranslationText(paragraph, targetLanguage) : '',
            ],
            query,
            { caseSensitive },
          ),
        )
      : null;
    for (let index = 0; index < paragraphs.length; index++) {
      const paragraph = paragraphs[index]!;
      const translation = selectedTranslationText(paragraph, targetLanguage);
      const hit = fuzzyHits
        ? fuzzyHits.has(index)
        : (searchIn !== 'translation' && matcher.test(paragraph.text)) ||
          (searchIn !== 'original' && translation.length > 0 && matcher.test(translation));
      if (!hit) continue;

      matchedSoFar += 1;
      if (matchedSoFar <= offset) continue;
      // 多找到一条就够判断「还有更多」，不必扫完全书
      if (matches.length >= limit) {
        hasMore = true;
        break scan;
      }
      matches.push({
        chapter_id: chapter.id,
        chapter_title: titleOriginal(chapter.title),
        index,
        id: paragraph.id,
        text: paragraph.text,
        translation: translation || null,
      });
    }
  }

  return {
    book_id: book.id,
    target_language: targetLanguage,
    query,
    regex: useRegex,
    fuzzy,
    search_in: searchIn,
    searched_chapter_count: chapters.length,
    matches,
    has_more: hasMore,
    next_offset: hasMore ? offset + matches.length : null,
  };
}

interface KeywordTally {
  keyword: string;
  lowered: string;
  totalCount: number;
  paragraphCount: number;
  perChapter: Map<string, { title: string; count: number }>;
}

/**
 * 一章里各命中段落的出现次数。精确统计数的是不重叠的出现次数；
 * 模糊统计无法可靠地数出同一段里的多处近似写法，每个命中段落计 1 次。
 */
function countPerParagraph(
  sources: readonly string[],
  tally: KeywordTally,
  fuzzy: boolean,
): number[] {
  if (fuzzy) {
    return fuzzyMatchIndexes(sources, (source) => [source], tally.keyword).map(() => 1);
  }
  return sources
    .map((source) => (source ? countOccurrences(source.toLowerCase(), tally.lowered) : 0))
    .filter((count) => count > 0);
}

async function executeCountOccurrences(
  args: Record<string, unknown>,
  ctx: AgentMcpExecutionContext,
) {
  const keywords = readStringList(args.keywords);
  if (keywords.length === 0) {
    return agentMcpError('INVALID_ARGS', 'keywords must be a non-empty array of strings.');
  }
  if (keywords.length > MAX_KEYWORDS) {
    return agentMcpError('INVALID_ARGS', `At most ${MAX_KEYWORDS} keywords per call.`);
  }

  const resolved = resolveScanScope(args, ctx);
  if (!resolved.ok) return resolved.error;
  const { book, targetLanguage, chapters } = resolved.scope;
  // 词频只统计一侧：原文（默认）或当前选用的译文
  const searchIn = args.search_in === 'translation' ? 'translation' : 'original';
  const fuzzy = args.fuzzy === true;

  const tallies: KeywordTally[] = keywords.map((keyword) => ({
    keyword,
    lowered: keyword.toLowerCase(),
    totalCount: 0,
    paragraphCount: 0,
    perChapter: new Map(),
  }));

  for await (const { chapter, paragraphs } of scanChapters(chapters)) {
    const sources = paragraphs.map((paragraph) =>
      searchIn === 'original' ? paragraph.text : selectedTranslationText(paragraph, targetLanguage),
    );
    for (const tally of tallies) {
      const counts = countPerParagraph(sources, tally, fuzzy);
      if (counts.length === 0) continue;
      const chapterTotal = counts.reduce((sum, count) => sum + count, 0);
      tally.totalCount += chapterTotal;
      tally.paragraphCount += counts.length;
      tally.perChapter.set(chapter.id, {
        title: titleOriginal(chapter.title),
        count: chapterTotal,
      });
    }
  }

  return {
    book_id: book.id,
    target_language: targetLanguage,
    search_in: searchIn,
    fuzzy,
    searched_chapter_count: chapters.length,
    occurrences: tallies.map((tally) => ({
      keyword: tally.keyword,
      total_count: tally.totalCount,
      paragraph_count: tally.paragraphCount,
      chapter_count: tally.perChapter.size,
      // 出现最多的章节排在前面；次数相同时保持章节顺序
      chapters: [...tally.perChapter.entries()]
        .map(([chapterId, entry]) => ({
          chapter_id: chapterId,
          chapter_title: entry.title,
          count: entry.count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, MAX_CHAPTERS_PER_KEYWORD),
    })),
  };
}

interface PlannedReplacement {
  chapterId: string;
  paragraph: Paragraph;
  before: string;
  after: string;
  count: number;
}

/** 扫描范围内需要替换的段落，最多收集 maxParagraphs 条 */
async function planReplacements(
  scope: ScanScope,
  options: {
    find: string;
    replaceWith: string;
    caseSensitive: boolean;
    originalContains: string;
    maxParagraphs: number;
  },
): Promise<{ planned: PlannedReplacement[]; hasMore: boolean; skippedEmpty: number }> {
  const pattern = new RegExp(escapeRegExp(options.find), options.caseSensitive ? 'g' : 'gi');
  const originalNeedle = options.originalContains.toLowerCase();
  const planned: PlannedReplacement[] = [];
  let skippedEmpty = 0;

  for await (const { chapter, paragraphs } of scanChapters(scope.chapters)) {
    for (const paragraph of paragraphs) {
      const before = selectedTranslationText(paragraph, scope.targetLanguage);
      if (!before) continue;
      if (originalNeedle && !paragraph.text.toLowerCase().includes(originalNeedle)) continue;
      const count = before.match(pattern)?.length ?? 0;
      if (count === 0) continue;
      // 用函数形式替换，避免替换内容里的 $ 被当作占位符
      const after = before.replace(pattern, () => options.replaceWith);
      if (!after.trim()) {
        skippedEmpty += 1;
        continue;
      }
      if (planned.length >= options.maxParagraphs) {
        return { planned, hasMore: true, skippedEmpty };
      }
      planned.push({ chapterId: chapter.id, paragraph, before, after, count });
    }
  }
  return { planned, hasMore: false, skippedEmpty };
}

async function persistReplacements(
  scope: ScanScope,
  planned: readonly PlannedReplacement[],
  writeMode: AgentMcpWriteMode,
  externalModelId: string,
): Promise<void> {
  const editsByChapter = new Map<string, ParagraphTranslationEdit[]>();
  for (const item of planned) {
    const edits = editsByChapter.get(item.chapterId) ?? [];
    edits.push(
      buildEditForParagraph(
        item.paragraph,
        item.after,
        writeMode,
        scope.targetLanguage,
        externalModelId,
      ),
    );
    editsByChapter.set(item.chapterId, edits);
  }
  const groups: ChapterTranslationEditGroup[] = [...editsByChapter.entries()].map(
    ([chapterId, edits]) => ({ chapterId, edits }),
  );
  await BookService.editParagraphTranslationGroups(
    scope.book.id,
    scope.targetLanguage,
    groups,
    scope.targetLanguage,
  );
  await refreshBookKeepingOpenChapter(scope.book.id);
}

async function executeReplaceInTranslations(
  args: Record<string, unknown>,
  ctx: AgentMcpExecutionContext,
) {
  const find = typeof args.find === 'string' ? args.find : '';
  const replaceWith = typeof args.replace_with === 'string' ? args.replace_with : null;
  if (!find.trim()) return agentMcpError('INVALID_ARGS', 'find must be a non-empty string.');
  if (replaceWith === null) return agentMcpError('INVALID_ARGS', 'replace_with must be a string.');
  if (find === replaceWith) {
    return agentMcpError('INVALID_ARGS', 'find and replace_with are identical.');
  }

  const resolved = resolveScanScope(args, ctx);
  if (!resolved.ok) return resolved.error;
  const { scope } = resolved;

  const dryRun = args.dry_run === true;
  const writeMode: AgentMcpWriteMode =
    args.write_mode === 'overwrite' || args.write_mode === 'append'
      ? args.write_mode
      : ctx.defaultWriteMode;
  const { planned, hasMore, skippedEmpty } = await planReplacements(scope, {
    find,
    replaceWith,
    caseSensitive: args.case_sensitive !== false,
    originalContains: readTrimmedString(args.original_contains),
    maxParagraphs: parseLimit(args.max_paragraphs, 200, 1000),
  });

  if (!dryRun && planned.length > 0) {
    const externalModelId = buildExternalTranslationModelId(
      ctx.channel,
      typeof args.model_label === 'string' ? args.model_label : undefined,
    );
    await persistReplacements(scope, planned, writeMode, externalModelId);
  }

  const perChapter = new Map<string, number>();
  for (const item of planned) {
    perChapter.set(item.chapterId, (perChapter.get(item.chapterId) ?? 0) + 1);
  }

  return {
    book_id: scope.book.id,
    target_language: scope.targetLanguage,
    dry_run: dryRun,
    write_mode: writeMode,
    replaced_paragraph_count: planned.length,
    replacement_count: planned.reduce((sum, item) => sum + item.count, 0),
    skipped_empty_count: skippedEmpty,
    has_more: hasMore,
    chapters: [...perChapter.entries()].map(([chapterId, count]) => ({
      chapter_id: chapterId,
      paragraph_count: count,
    })),
    samples: planned.slice(0, REPLACE_SAMPLE_COUNT).map((item) => ({
      chapter_id: item.chapterId,
      id: item.paragraph.id,
      before: item.before,
      after: item.after,
    })),
  };
}

async function executeSearchChapters(args: Record<string, unknown>, ctx: AgentMcpExecutionContext) {
  const resolved = resolveBookFromArgs(args, ctx);
  if (!resolved.ok) return resolved.error;
  const { book, targetLanguage } = resolved;

  const query = readTrimmedString(args.query);
  if (!query) return agentMcpError('INVALID_ARGS', 'query must be a non-empty string.');

  if (!isLocalEmbeddingEffectivelyEnabled(useSettingsStore().settings.enableLocalEmbedding)) {
    return agentMcpError(
      'EMBEDDING_DISABLED',
      'Semantic chapter search needs local embedding, which is turned off in Tsukuyomi settings (or unavailable on this device). Ask the user to enable it, or use search_paragraphs with keywords instead.',
    );
  }
  if (!EmbeddingService.isReady()) {
    return agentMcpError(
      'EMBEDDING_NOT_READY',
      'The local embedding model is still loading. Retry shortly, or use search_paragraphs with keywords instead.',
      { status: EmbeddingService.getStatus() },
    );
  }

  const chapters = await ChapterEmbeddingService.queryChapters(
    book.id,
    query,
    parseLimit(args.limit, 5, 20),
    targetLanguage,
  );
  return { book_id: book.id, query, chapters };
}

const BOOK_ID_PROPERTY = {
  type: 'string',
  description: 'Target book ID (optional if a book is currently open).',
};

export const agentMcpSearchTools: AgentMcpToolSpec[] = [
  {
    name: 'search_paragraphs',
    description:
      'Search paragraphs across the whole book (or one chapter) by keyword or regular expression, in the original text, the currently selected translation, or both. Returns each match with its chapter, so you can find where a word or phrase appears without reading every chapter.',
    category: 'translation',
    permission: 'read_only',
    readOnlyHint: true,
    requiresBookStore: true,
    inputSchema: {
      type: 'object',
      properties: {
        book_id: BOOK_ID_PROPERTY,
        query: {
          type: 'string',
          description:
            'Keyword (substring) to look for, or a regular expression when regex=true. Set fuzzy=true to also match slightly different spellings.',
        },
        regex: {
          type: 'boolean',
          description: 'Treat query as a JavaScript regular expression (default false).',
        },
        case_sensitive: {
          type: 'boolean',
          description: 'Match case exactly (default false).',
        },
        fuzzy: FUZZY_PROPERTY,
        search_in: {
          type: 'string',
          enum: ['original', 'translation', 'both'],
          description: 'Which text to search (default both).',
        },
        chapter_id: {
          type: 'string',
          description: 'Limit the search to one chapter (omit to search the whole book).',
        },
        limit: { type: 'number', description: 'Maximum matches to return (default 20, max 100).' },
        offset: {
          type: 'number',
          description: 'Number of matches to skip; pass next_offset from the previous call.',
        },
      },
      required: ['query'],
    },
    execute: executeSearchParagraphs,
  },
  {
    name: 'count_occurrences',
    description:
      'Count how often each keyword appears across the whole book (or one chapter), with paragraph count and per-chapter distribution. Counts the original text by default; set search_in="translation" to count the currently selected translations (e.g. how many places still use an old rendering).',
    category: 'translation',
    permission: 'read_only',
    readOnlyHint: true,
    requiresBookStore: true,
    inputSchema: {
      type: 'object',
      properties: {
        book_id: BOOK_ID_PROPERTY,
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: `Keywords to count (case-insensitive, at most ${MAX_KEYWORDS}).`,
        },
        search_in: {
          type: 'string',
          enum: ['original', 'translation'],
          description: 'Which text to count in (default original).',
        },
        fuzzy: {
          ...FUZZY_PROPERTY,
          description: `${FUZZY_PROPERTY.description} In fuzzy mode each matching paragraph counts once.`,
        },
        chapter_id: {
          type: 'string',
          description: 'Limit counting to one chapter (omit to count the whole book).',
        },
      },
      required: ['keywords'],
    },
    execute: executeCountOccurrences,
  },
  {
    name: 'replace_in_translations',
    description:
      'Find and replace literal text inside the currently selected translations across the whole book (or one chapter), e.g. to apply a renamed term everywhere. Use dry_run=true first to preview. By default each changed paragraph gets a new translation version (the old one is kept); write_mode="overwrite" edits the current version in place.',
    category: 'translation',
    permission: 'translate_and_edit',
    readOnlyHint: false,
    requiresBookStore: true,
    inputSchema: {
      type: 'object',
      properties: {
        book_id: BOOK_ID_PROPERTY,
        find: { type: 'string', description: 'Literal text to find in translations.' },
        replace_with: {
          type: 'string',
          description: 'Replacement text. Paragraphs that would become blank are skipped.',
        },
        original_contains: {
          type: 'string',
          description:
            'Only touch paragraphs whose original text contains this (case-insensitive). Use it to avoid replacing unrelated uses of the same word.',
        },
        case_sensitive: {
          type: 'boolean',
          description: 'Match the case of find exactly (default true).',
        },
        chapter_id: {
          type: 'string',
          description: 'Limit the replacement to one chapter (omit for the whole book).',
        },
        dry_run: {
          type: 'boolean',
          description: 'Preview only: report what would change without writing (default false).',
        },
        max_paragraphs: {
          type: 'number',
          description:
            'Maximum paragraphs to change in one call (default 200, max 1000). When has_more is true, call again to continue.',
        },
        write_mode: {
          type: 'string',
          enum: ['append', 'overwrite'],
          description:
            'append adds a new translation version and selects it; overwrite edits the selected version in place. Defaults to the user setting.',
        },
        model_label: {
          type: 'string',
          description: 'Optional external model/agent label recorded on new versions.',
        },
      },
      required: ['find', 'replace_with'],
    },
    execute: executeReplaceInTranslations,
  },
  {
    name: 'search_chapters',
    description:
      'Find the chapters most relevant to a natural-language question (semantic + keyword ranking), e.g. "the chapter where they first reach the tower". Requires local embedding to be enabled in Tsukuyomi; otherwise use search_paragraphs.',
    category: 'library',
    permission: 'read_only',
    readOnlyHint: true,
    requiresBookStore: true,
    inputSchema: {
      type: 'object',
      properties: {
        book_id: BOOK_ID_PROPERTY,
        query: { type: 'string', description: 'Natural language description of what to find.' },
        limit: { type: 'number', description: 'Maximum chapters to return (default 5, max 20).' },
      },
      required: ['query'],
    },
    execute: executeSearchChapters,
  },
];
