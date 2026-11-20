import { withBuiltinGuidance } from './shared-descriptions';
import type { AppLocale } from 'src/models/locale';
import type { Chapter, Novel, Paragraph } from 'src/models/novel';
import type { AgentMcpWriteMode } from 'src/models/settings';
import { BookService } from 'src/services/book-service';
import { ChapterEmbeddingService } from 'src/services/chapter-embedding-service';
import {
  InvalidSearchPatternError,
  countKeywordOccurrences,
  scanChapters,
  searchParagraphs,
  selectedTranslationText,
  type ParagraphSearchTarget,
} from 'src/services/library-query/paragraph-scan';
import { EmbeddingService } from 'src/services/embedding-service';
import type {
  ChapterTranslationEditGroup,
  ParagraphTranslationEdit,
} from 'src/services/localization/paragraph-edit';
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
  parseLimit,
  parseNonNegativeInt,
  readStringList,
  readTrimmedString,
  refreshBookKeepingOpenChapter,
  resolveBookFromArgs,
} from './helpers';
import { buildEditForParagraph } from './translation';

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

function parseSearchTarget(value: unknown, fallback: ParagraphSearchTarget): ParagraphSearchTarget {
  return value === 'original' || value === 'translation' || value === 'both' ? value : fallback;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  const resolved = resolveScanScope(args, ctx);
  if (!resolved.ok) return resolved.error;
  const { book, targetLanguage, chapters } = resolved.scope;

  const searchIn = parseSearchTarget(args.search_in, 'both');
  const offset = parseNonNegativeInt(args.offset, 0);
  let result: Awaited<ReturnType<typeof searchParagraphs>>;
  try {
    // 搜索本身与站内工具共用 library-query/paragraph-scan
    result = await searchParagraphs(chapters, targetLanguage, {
      query,
      regex: useRegex,
      fuzzy,
      caseSensitive: args.case_sensitive === true,
      searchIn,
      limit: parseLimit(args.limit, 20, 100),
      offset,
    });
  } catch (error) {
    if (error instanceof InvalidSearchPatternError) {
      return agentMcpError('INVALID_REGEX', error.message);
    }
    throw error;
  }

  return {
    book_id: book.id,
    target_language: targetLanguage,
    query,
    regex: useRegex,
    fuzzy,
    search_in: searchIn,
    searched_chapter_count: chapters.length,
    matches: result.hits.map((hit) => ({
      chapter_id: hit.chapter.id,
      chapter_title: titleOriginal(hit.chapter.title),
      index: hit.index,
      id: hit.paragraph.id,
      text: hit.paragraph.text,
      translation: hit.translation || null,
    })),
    has_more: result.hasMore,
    next_offset: result.hasMore ? offset + result.hits.length : null,
  };
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

  // 统计本身与站内工具共用 library-query/paragraph-scan
  const tallies = await countKeywordOccurrences(chapters, targetLanguage, {
    keywords,
    searchIn,
    fuzzy,
  });

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
      chapter_count: tally.chapters.length,
      // 出现最多的章节排在前面；次数相同时保持章节顺序
      chapters: tally.chapters
        .map(({ chapter, count }) => ({
          chapter_id: chapter.id,
          chapter_title: titleOriginal(chapter.title),
          count,
        }))
        .sort((x, y) => y.count - x.count)
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

/** 续传位置：下一次从哪一章的哪一段开始 */
interface ReplaceStart {
  chapterId: string;
  paragraphId: string;
}

/** 续传位置写成「章节 ID:段落 ID」；格式不对或章节不在范围内时返回 null */
function parseReplaceCursor(cursor: string, scope: ScanScope): ReplaceStart | null {
  const separator = cursor.lastIndexOf(':');
  if (separator <= 0 || separator === cursor.length - 1) return null;
  const chapterId = cursor.slice(0, separator);
  if (!scope.chapters.some((chapter) => chapter.id === chapterId)) return null;
  return { chapterId, paragraphId: cursor.slice(separator + 1) };
}

/**
 * 扫描范围内需要替换的段落，最多收集 maxParagraphs 条。
 * 还有剩余时给出 nextCursor，下一次从那一段继续：替换内容里包含查找内容时
 * （如「王」→「王子」），从头再扫会把已经替换过的段落再替换一遍。
 */
async function planReplacements(
  scope: ScanScope,
  options: {
    find: string;
    replaceWith: string;
    caseSensitive: boolean;
    originalContains: string;
    maxParagraphs: number;
    startAt: ReplaceStart | undefined;
  },
): Promise<
  | { ok: true; planned: PlannedReplacement[]; nextCursor: string | null; skippedEmpty: number }
  | { ok: false }
> {
  const pattern = new RegExp(escapeRegExp(options.find), options.caseSensitive ? 'g' : 'gi');
  const originalNeedle = options.originalContains.toLowerCase();
  const planned: PlannedReplacement[] = [];
  let skippedEmpty = 0;
  const { startAt } = options;
  const chapters = startAt
    ? scope.chapters.slice(scope.chapters.findIndex((chapter) => chapter.id === startAt.chapterId))
    : scope.chapters;
  /** 还没走到续传位置时，要找的那一段 */
  let resumeAt = startAt?.paragraphId;

  for await (const { chapter, paragraphs } of scanChapters(chapters)) {
    let remaining = paragraphs;
    if (resumeAt !== undefined) {
      const index = paragraphs.findIndex((paragraph) => paragraph.id === resumeAt);
      // 续传位置的段落已经不在这一章里（章节被改动过）：让调用方重新预览，而不是猜一个位置
      if (index < 0) return { ok: false };
      remaining = paragraphs.slice(index);
      resumeAt = undefined;
    }
    for (const paragraph of remaining) {
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
        return { ok: true, planned, nextCursor: `${chapter.id}:${paragraph.id}`, skippedEmpty };
      }
      planned.push({ chapterId: chapter.id, paragraph, before, after, count });
    }
  }
  return { ok: true, planned, nextCursor: null, skippedEmpty };
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
  const invalidCursor = () =>
    agentMcpError(
      'INVALID_CURSOR',
      'cursor does not point to a paragraph in the searched chapters. Pass the next_cursor of the previous call unchanged and keep the same chapter_id; if the chapter was edited since, start over with dry_run=true.',
    );
  const cursor = readTrimmedString(args.cursor);
  const startAt = cursor ? parseReplaceCursor(cursor, scope) : undefined;
  if (startAt === null) return invalidCursor();

  const plan = await planReplacements(scope, {
    find,
    replaceWith,
    caseSensitive: args.case_sensitive !== false,
    originalContains: readTrimmedString(args.original_contains),
    maxParagraphs: parseLimit(args.max_paragraphs, 200, 1000),
    startAt,
  });
  if (!plan.ok) return invalidCursor();
  const { planned, nextCursor, skippedEmpty } = plan;

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
    has_more: nextCursor !== null,
    // 还有剩余时，下一次调用把它作为 cursor 传入，从停下的位置继续
    next_cursor: nextCursor,
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
    description: withBuiltinGuidance(
      'count_occurrences',
      'Count how often each keyword appears across the whole book (or one chapter), with paragraph count and per-chapter distribution. Counts the original text by default; set search_in="translation" to count the currently selected translations (e.g. how many places still use an old rendering).',
    ),
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
            'Maximum paragraphs to change in one call (default 200, max 1000). When has_more is true, call again with cursor set to the returned next_cursor.',
        },
        cursor: {
          type: 'string',
          description:
            'Continue from where the previous call stopped: pass its next_cursor unchanged, with the same find, replace_with and chapter_id. Always use it to continue — calling again without it starts from the beginning, which replaces the same text twice when replace_with contains find (e.g. "王" → "王子").',
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
    description: withBuiltinGuidance(
      'search_chapters',
      'Find the chapters most relevant to a natural-language question (semantic + keyword ranking), e.g. "the chapter where they first reach the tower". Requires local embedding to be enabled in Tsukuyomi; otherwise use search_paragraphs.',
    ),
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
