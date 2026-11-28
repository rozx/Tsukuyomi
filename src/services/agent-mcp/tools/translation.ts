import { fuzzyMatchIndexes } from 'src/services/library-query/keyword-match';
import type { AppLocale } from 'src/models/locale';
import type { Chapter, CharacterSetting, Novel, Paragraph, Terminology } from 'src/models/novel';
import type { AgentMcpWriteMode } from 'src/models/settings';
import {
  buildChunks,
  resolveRuntimeTaskChunkSize,
  resolveTaskChunkSize,
} from 'src/services/ai/tasks/utils/chunk-formatter';
import {
  buildChapterSemanticQuery,
  resolveSpecialInstructionsForTask,
  selectRelevantMemoriesForChunk,
} from 'src/services/ai/tasks/utils/context-builder';
import {
  MAX_PARAGRAPH_ID_EDIT_DISTANCE,
  checkOriginalTextPrefix,
  findBestParagraphIdMatch,
} from 'src/services/ai/tools/translation-batch-validation';
import type { ParagraphTranslationEdit } from 'src/services/localization/paragraph-edit';
import { getLanguageTranslation, getNameTranslation } from 'src/services/localization/selection';
import { titleOriginal } from 'src/services/localization/title-edit';
import { useBooksStore } from 'src/stores/books';
import { generateShortId } from 'src/utils/id-generator';
import {
  collectChunkEntities,
  collectPreviousChapterTail,
  collectRecentChapterTitles,
  collectTranslatedBefore,
  listChaptersBefore,
  type ContinuityParagraph,
  type PreviousChapterTail,
} from 'src/services/library-query/chunk-context';
import {
  findRepeatedPassages,
  type RepeatedPassage,
} from 'src/services/library-query/repeated-passages';
import {
  collectTranslationStyleHints,
  type TranslationStyleHints,
} from 'src/services/library-query/translation-style';
import { isEmptyParagraph } from 'src/utils/text-utils';
import { buildExternalTranslationModelId } from 'src/utils/translation-model-label';
import { agentMcpError, type AgentMcpExecutionContext, type AgentMcpToolSpec } from '../types';
import {
  formatCharacterSummary,
  formatTermSummary,
  FUZZY_PROPERTY,
  loadChapterParagraphs,
  parseLimit,
  parseNonNegativeInt,
  readTrimmedString,
  resolveBookAndChapterFromArgs,
} from './helpers';

/**
 * 一块默认最多多少段。字符预算（书籍的分块大小）是按站内翻译定的，短段落多的章节一块能有
 * 一两百段：响应容易超出 Agent 客户端的单次输出上限，也远多于一次提交适合带的段数。
 * 限到这个数之后，取一块正好对应一次提交和一次复核。响应的大小另由字节预算控制
 * （DEFAULT_RESPONSE_BYTE_BUDGET），段数上限只管一次提交的规模：40 段时网文的短段落、
 * compact 的续块明明还装得下，一章也要拆成五六块，所以放宽到 60。
 */
const DEFAULT_CHUNK_PARAGRAPH_LIMIT = 60;
const MAX_CHUNK_PARAGRAPH_LIMIT = 200;
/**
 * 默认字符预算的上限（原文字数）。书籍的分块大小可以设到 50000，那是给站内翻译用的；
 * 长段落的文体里 40 段就有一万多字，带上译文后响应同样会超出客户端的输出上限。
 * 书籍设得更小时按书籍的来；Agent 明确传入 chunk_size 时不受这个上限约束。
 */
const DEFAULT_CHUNK_CHARACTER_LIMIT = 4000;

/**
 * 整个响应（JSON 的 UTF-8 字节数）默认的预算。Antigravity 等客户端把超过 10 KiB 的工具结果
 * 存成文件，Agent 要多一轮读取；中日文每字 3 字节，正文之外还有角色、术语、记忆和上一章末尾，
 * 只按段数或原文字数都控制不住。先放上下文，剩下的空间再装段落：第一块自然少几段，
 * compact 的续块与短段落多的章节能多装。
 */
const DEFAULT_RESPONSE_BYTE_BUDGET = 9000;
const MIN_RESPONSE_BYTE_BUDGET = 2000;
const MAX_RESPONSE_BYTE_BUDGET = 1_000_000;
/** 并入章末尾巴时允许超出字节预算的比例（默认 9450 字节，仍低于 10 KiB） */
const TAIL_BYTE_RATIO = 1.05;

const utf8 = new TextEncoder();
const jsonByteLength = (value: unknown): number => utf8.encode(JSON.stringify(value)).length;

/**
 * 去掉空白、标点与符号后不超过这么多个字的段落算极短段落（「えっ？」「……」、弹幕式的短行），
 * 按半段计入段数上限：它们几乎不占响应和提交的体积，按整段算会让一章拆成很多块。
 */
const SHORT_PARAGRAPH_TEXT_LENGTH = 8;
const SHORT_PARAGRAPH_WEIGHT = 0.5;
const NON_CONTENT = /[\s\p{P}\p{S}]/gu;

/**
 * 这一块之后只剩很少几段时并入这一块，省掉一轮只有十来段的「取块 → 提交」。
 * 剩下的段数（按段数配额折算）不超过段数上限的四分之一、并入后合计不超过字符预算的
 * 1.25 倍时才并入；并入后整个响应的字节数另由 buildTranslationChunk 检查（TAIL_BYTE_RATIO）。
 */
const TAIL_PARAGRAPH_RATIO = 0.25;
const TAIL_CHARACTER_RATIO = 1.25;

function paragraphWeight(paragraph: Paragraph): number {
  const length = Array.from(paragraph.text.replace(NON_CONTENT, '')).length;
  return length <= SHORT_PARAGRAPH_TEXT_LENGTH ? SHORT_PARAGRAPH_WEIGHT : 1;
}

const totalWeight = (paragraphs: readonly Paragraph[]) =>
  paragraphs.reduce((sum, p) => sum + paragraphWeight(p), 0);

const totalLength = (paragraphs: readonly Paragraph[]) =>
  paragraphs.reduce((sum, p) => sum + p.text.length, 0);

/** 按顺序取到段数配额用完为止；第一段总会取到（配额至少为 1，每段最多计 1） */
function takeWithinParagraphQuota(paragraphs: readonly Paragraph[], quota: number): Paragraph[] {
  const taken: Paragraph[] = [];
  let used = 0;
  for (const paragraph of paragraphs) {
    const weight = paragraphWeight(paragraph);
    if (used + weight > quota) break;
    used += weight;
    taken.push(paragraph);
  }
  return taken;
}

function absorbShortTail(
  chunk: Paragraph[],
  candidates: readonly Paragraph[],
  maxParagraphs: number,
  chunkSize: number,
): Paragraph[] {
  // 这一块是候选段落的开头一段，其后的就是剩下的
  const tail = candidates.slice(chunk.length);
  if (tail.length === 0 || totalWeight(tail) > Math.floor(maxParagraphs * TAIL_PARAGRAPH_RATIO)) {
    return chunk;
  }
  return totalLength(chunk) + totalLength(tail) <= chunkSize * TAIL_CHARACTER_RATIO
    ? [...chunk, ...tail]
    : chunk;
}

interface FailedBatchItem {
  paragraph_id: string;
  error_code: string;
  error: string;
}

async function persistChapterTitleTranslation(
  bookId: string,
  chapter: Chapter,
  targetLanguage: AppLocale,
  titleTranslation: string,
  externalModelId: string,
  keepChapterLoaded: boolean,
): Promise<void> {
  const booksStore = useBooksStore();
  await booksStore.editTitle(
    bookId,
    targetLanguage,
    {
      kind: 'chapter',
      id: chapter.id,
      expectedOriginal: titleOriginal(chapter.title),
      translation: titleTranslation,
      aiModelId: externalModelId,
    },
    targetLanguage,
  );
  if (keepChapterLoaded) {
    await booksStore.refreshBookFromStorage(bookId, chapter.id);
  }
}

function isTranslatedForLanguage(paragraph: Paragraph, language: AppLocale): boolean {
  const tr = getLanguageTranslation(paragraph, language);
  return Boolean(tr && tr.translation.trim().length > 0);
}

function countChapterProgress(paragraphs: readonly Paragraph[], language: AppLocale) {
  let total = 0;
  let translated = 0;
  let firstUntranslatedIndex: number | null = null;
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]!;
    if (isEmptyParagraph(p.text)) continue;
    total += 1;
    if (isTranslatedForLanguage(p, language)) {
      translated += 1;
    } else if (firstUntranslatedIndex === null) {
      firstUntranslatedIndex = i;
    }
  }
  return {
    total,
    translated,
    remainingUntranslated: total - translated,
    firstUntranslatedIndex,
  };
}

function collectCandidateParagraphs(
  allParagraphs: readonly Paragraph[],
  cursor: number,
  mode: 'untranslated' | 'all',
  targetLanguage: AppLocale,
): { candidates: Paragraph[]; indexById: Map<string, number> } {
  const indexById = new Map<string, number>();
  const candidates: Paragraph[] = [];
  for (let i = cursor; i < allParagraphs.length; i++) {
    const p = allParagraphs[i]!;
    if (isEmptyParagraph(p.text)) continue;
    if (mode === 'untranslated' && isTranslatedForLanguage(p, targetLanguage)) continue;
    indexById.set(p.id, i);
    candidates.push(p);
  }
  return { candidates, indexById };
}

function findNextCursor(
  allParagraphs: readonly Paragraph[],
  lastOriginalIdx: number,
  mode: 'untranslated' | 'all',
  targetLanguage: AppLocale,
): number | null {
  for (let i = lastOriginalIdx + 1; i < allParagraphs.length; i++) {
    const p = allParagraphs[i]!;
    if (isEmptyParagraph(p.text)) continue;
    if (mode === 'untranslated' && isTranslatedForLanguage(p, targetLanguage)) continue;
    return i;
  }
  return null;
}

function getChapterTitleTranslation(chapter: Chapter, language: AppLocale): string {
  if (typeof chapter.title !== 'object') return '';
  return getNameTranslation(chapter.title, language)?.translation ?? '';
}

/**
 * 翻译块里每条术语与角色的说明最多带这么多字。说明常常是大段的剧情简介，一块命中十来个角色时
 * 光说明就有几千字，新章节的第一块（不能用 compact）容易超出 Agent 客户端内联显示的上限。
 */
const CHUNK_DESCRIPTION_LIMIT = 150;
/** 一块里说明合计最多带这么多字：命中的条目多时，长说明的截短长度随之收紧 */
const CHUNK_DESCRIPTION_BUDGET = 600;
/** 条目再多，每条说明也至少保留这么多字 */
const MIN_CHUNK_DESCRIPTION_LIMIT = 40;

/**
 * 每条说明的截短长度：短说明照常带全，剩下的预算由长说明平分，
 * 结果限制在 MIN_CHUNK_DESCRIPTION_LIMIT..CHUNK_DESCRIPTION_LIMIT 之间。
 */
function resolveDescriptionLimit(descriptions: readonly string[]): number {
  const lengths = descriptions.map((d) => Array.from(d).length).sort((a, b) => a - b);
  let remaining = CHUNK_DESCRIPTION_BUDGET;
  for (let i = 0; i < lengths.length; i++) {
    const share = remaining / (lengths.length - i);
    const length = lengths[i]!;
    if (length > share) {
      return Math.max(
        MIN_CHUNK_DESCRIPTION_LIMIT,
        Math.min(CHUNK_DESCRIPTION_LIMIT, Math.floor(share)),
      );
    }
    remaining -= length;
  }
  return CHUNK_DESCRIPTION_LIMIT;
}

/** 说明过长时只留开头并标明；全文可用 list_terms / list_characters 读取 */
function clipDescription<T extends { description: string }>(
  summary: T,
  limit: number,
): T & { description_truncated?: true } {
  const chars = Array.from(summary.description);
  if (chars.length <= limit) return summary;
  return {
    ...summary,
    description: `${chars.slice(0, limit).join('')}…`,
    description_truncated: true,
  };
}

/** 说明的截短长度；null 表示不带说明（compact，或 include_descriptions: false） */
type DescriptionLimit = number | null;

/** 不带说明时术语只给名称与译法：同一章的后续块里这些说明都是重复的 */
function formatChunkTerm(term: Terminology, language: AppLocale, limit: DescriptionLimit) {
  const full = formatTermSummary(term, language);
  return limit === null
    ? { id: full.id, name: full.name, translation: full.translation }
    : clipDescription(full, limit);
}

/**
 * 不带说明时角色仍保留性别与说话风格：后续块才出场的角色同样需要口吻，
 * 说话风格空着时 Agent 也能看出需要补全。
 */
function formatChunkCharacter(
  char: CharacterSetting,
  language: AppLocale,
  limit: DescriptionLimit,
) {
  const full = formatCharacterSummary(char, language);
  if (limit !== null) return clipDescription(full, limit);
  const { description: _description, ...rest } = full;
  return rest;
}

/** compact 模式下省略的元数据：同一章的续块里它们与第一块相同 */
const COMPACT_OMITTED_METADATA = [
  'chapter_title_original',
  'chapter_title_translation',
  'target_language',
  'enable_original_text_validation',
  'mode',
] as const;

/** compact 模式下为空时省略的字段：缺少即表示没有 */
const COMPACT_OPTIONAL_LISTS = [
  'context_before',
  'matched_terms',
  'matched_characters',
  'possible_terms',
  'possible_characters',
  'repeated_passages',
  'memories',
] as const;

/**
 * compact 模式的响应：去掉续块里重复的元数据、为空的列表、为 null 的 previous_chapter_tail
 * 与空的特殊指令。段落、进度与续取用的字段（paragraphs、completed、has_more、next_cursor）
 * 总是保留，空的 paragraphs 本身就表示没有可处理的段落。
 */
function compactChunkPayload<T extends Record<string, unknown>>(payload: T): Partial<T> {
  const result: Record<string, unknown> = { ...payload };
  for (const key of COMPACT_OMITTED_METADATA) delete result[key];
  for (const key of COMPACT_OPTIONAL_LISTS) {
    const value = result[key];
    if (Array.isArray(value) && value.length === 0) delete result[key];
  }
  if (result.previous_chapter_tail === null) delete result.previous_chapter_tail;
  if (result.special_instructions === '') delete result.special_instructions;
  return result as Partial<T>;
}

function resolveBatchItemId(
  rawId: string,
  paragraphById: Map<string, Paragraph>,
  allowedIds: Set<string>,
  warnings: string[],
): { ok: true; id: string } | { ok: false; failure: FailedBatchItem } {
  if (paragraphById.has(rawId)) return { ok: true, id: rawId };
  const match = findBestParagraphIdMatch(rawId, allowedIds, MAX_PARAGRAPH_ID_EDIT_DISTANCE);
  if (match.type === 'matched') {
    warnings.push(`Corrected paragraph_id "${rawId}" -> "${match.matchedId}"`);
    return { ok: true, id: match.matchedId };
  }
  if (match.type === 'ambiguous') {
    return {
      ok: false,
      failure: {
        paragraph_id: rawId,
        error_code: 'AMBIGUOUS_PARAGRAPH_ID',
        error: `Ambiguous paragraph_id "${rawId}", candidates: ${match.candidateIds.join(', ')}`,
      },
    };
  }
  return {
    ok: false,
    failure: {
      paragraph_id: rawId,
      error_code: 'INVALID_PARAGRAPH_ID',
      error: `Paragraph not found in chapter: ${rawId}`,
    },
  };
}

/** 按写入方式生成一条译文修改：追加为新版本并选用，或就地修改当前选用的版本 */
export function buildEditForParagraph(
  targetParagraph: Paragraph,
  translatedText: string,
  writeMode: AgentMcpWriteMode,
  targetLanguage: AppLocale,
  externalModelId: string,
): ParagraphTranslationEdit {
  const currentSelected = getLanguageTranslation(targetParagraph, targetLanguage);
  if (writeMode === 'overwrite' && currentSelected) {
    return {
      type: 'update',
      paragraphId: targetParagraph.id,
      originalText: targetParagraph.text,
      translationId: currentSelected.id,
      text: translatedText,
    };
  }
  return {
    type: 'append',
    paragraphId: targetParagraph.id,
    originalText: targetParagraph.text,
    translation: {
      id: generateShortId(),
      translation: translatedText,
      aiModelId: externalModelId,
      language: targetLanguage,
    },
    selectNew: true,
  };
}

function parseSingleSubmissionItem(
  raw: unknown,
  index: number,
  options: {
    paragraphById: Map<string, Paragraph>;
    allowedIds: Set<string>;
    seenIds: Set<string>;
    enablePrefixValidation: boolean;
    writeMode: AgentMcpWriteMode;
    targetLanguage: AppLocale;
    externalModelId: string;
    warnings: string[];
  },
): { edit?: ParagraphTranslationEdit; failure?: FailedBatchItem } {
  if (!raw || typeof raw !== 'object') {
    return {
      failure: {
        paragraph_id: `#${index}`,
        error_code: 'EMPTY_PARAGRAPH_ITEM',
        error: 'Paragraph item must be an object.',
      },
    };
  }
  const rec = raw as Record<string, unknown>;
  const rawId = readTrimmedString(rec.paragraph_id);
  const translatedText = typeof rec.translated_text === 'string' ? rec.translated_text : '';
  if (!rawId) {
    return {
      failure: {
        paragraph_id: `#${index}`,
        error_code: 'MISSING_PARAGRAPH_ID',
        error: 'paragraph_id is required.',
      },
    };
  }
  if (!translatedText.trim()) {
    return {
      failure: {
        paragraph_id: rawId,
        error_code: 'MISSING_TRANSLATION',
        error: 'translated_text must be non-empty.',
      },
    };
  }

  const resolved = resolveBatchItemId(
    rawId,
    options.paragraphById,
    options.allowedIds,
    options.warnings,
  );
  if (!resolved.ok) return { failure: resolved.failure };
  if (options.seenIds.has(resolved.id)) {
    return {
      failure: {
        paragraph_id: resolved.id,
        error_code: 'DUPLICATE_PARAGRAPHS',
        error: `Duplicate paragraph_id in batch: ${resolved.id}`,
      },
    };
  }
  options.seenIds.add(resolved.id);

  const targetParagraph = options.paragraphById.get(resolved.id)!;
  if (options.enablePrefixValidation) {
    const prefix = readTrimmedString(rec.original_text_prefix);
    const prefixCheck = checkOriginalTextPrefix(prefix, targetParagraph.text.trim());
    if (prefixCheck.warning) {
      options.warnings.push(
        `Paragraph ${resolved.id}: original_text_prefix exceeds recommended length (${prefixCheck.warning.limit}).`,
      );
    }
    if (prefixCheck.failure) {
      return {
        failure: {
          paragraph_id: resolved.id,
          error_code: prefixCheck.failure.errorCode,
          error: `Original text prefix validation failed (${prefixCheck.failure.errorCode}) for paragraph ${resolved.id}.`,
        },
      };
    }
  }

  return {
    edit: buildEditForParagraph(
      targetParagraph,
      translatedText,
      options.writeMode,
      options.targetLanguage,
      options.externalModelId,
    ),
  };
}

type ChunkMode = 'untranslated' | 'all';

interface ChunkOptions {
  mode: ChunkMode;
  cursor: number;
  contextBeforeCount: number;
  chunkSize: number;
  taskType: 'translation' | 'polish' | 'proofreading';
  compact: boolean;
  includeDescriptions: boolean;
  maxParagraphs: number;
  byteBudget: number;
}

function parseByteBudget(raw: unknown): number {
  const value = Number(raw);
  if (raw === undefined || raw === null || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_RESPONSE_BYTE_BUDGET;
  }
  return Math.min(MAX_RESPONSE_BYTE_BUDGET, Math.max(MIN_RESPONSE_BYTE_BUDGET, Math.trunc(value)));
}

function parseChunkOptions(args: Record<string, unknown>, book: Novel): ChunkOptions {
  const compact = args.compact === true;
  return {
    mode: args.mode === 'all' ? 'all' : 'untranslated',
    cursor: parseNonNegativeInt(args.cursor, 0),
    contextBeforeCount: Math.min(10, parseNonNegativeInt(args.context_before, 3)),
    chunkSize:
      args.chunk_size !== undefined
        ? resolveRuntimeTaskChunkSize(Number(args.chunk_size))
        : Math.min(resolveTaskChunkSize(book.translationChunkSize), DEFAULT_CHUNK_CHARACTER_LIMIT),
    taskType:
      args.task_type === 'polish' || args.task_type === 'proofreading'
        ? args.task_type
        : 'translation',
    compact,
    includeDescriptions: !compact && args.include_descriptions !== false,
    maxParagraphs: parseLimit(
      // 0 与非法值都按默认值处理
      Number(args.max_paragraphs) >= 1 ? args.max_paragraphs : undefined,
      DEFAULT_CHUNK_PARAGRAPH_LIMIT,
      MAX_CHUNK_PARAGRAPH_LIMIT,
    ),
    byteBudget: parseByteBudget(args.max_response_bytes),
  };
}

/** 本块要用到的上下文：按段数与字符预算取出的最大一块算一次，裁短后沿用 */
interface ChunkContext {
  contextBefore: ContinuityParagraph[];
  previousTail: PreviousChapterTail | null;
  styleHints: TranslationStyleHints | null;
  memories: Array<{ id: string; summary: string; content: string }>;
  repeatedPassages: RepeatedPassage[];
}

interface ChunkState {
  book: Novel;
  language: AppLocale;
  options: ChunkOptions;
  allParagraphs: Paragraph[];
  indexById: Map<string, number>;
  progress: ReturnType<typeof countChapterProgress>;
  basePayload: Record<string, unknown>;
  context: ChunkContext;
}

function formatChunkParagraph(paragraph: Paragraph, state: ChunkState) {
  return {
    index: state.indexById.get(paragraph.id) ?? 0,
    id: paragraph.id,
    text: paragraph.text,
    ...(state.options.mode === 'all'
      ? {
          current_translation:
            getLanguageTranslation(paragraph, state.language)?.translation ?? null,
        }
      : {}),
  };
}

/** 上一章末尾只用来对齐语气与标点：不带段落 ID 与序号，省下响应体积 */
function formatPreviousTail(tail: PreviousChapterTail | null) {
  if (!tail) return null;
  return {
    chapter_id: tail.title.chapter.id,
    title_original: tail.title.original,
    title_translation: tail.title.translation,
    paragraphs: tail.paragraphs.map((p) => ({ original: p.original, translation: p.translation })),
  };
}

/** 本块命中的术语与角色，以及说明的截短长度 */
function formatChunkEntities(state: ChunkState, chunkText: string) {
  const { language } = state;
  const { terms, characters, nearTerms, nearCharacters } = collectChunkEntities(
    state.book,
    chunkText,
  );
  const limit: DescriptionLimit = state.options.includeDescriptions
    ? resolveDescriptionLimit(
        [
          ...terms,
          ...characters,
          ...nearTerms.map((m) => m.item),
          ...nearCharacters.map((m) => m.item),
        ].map((entity) => entity.description ?? ''),
      )
    : null;
  return {
    matched_terms: terms.map((term) => formatChunkTerm(term, language, limit)),
    matched_characters: characters.map((char) => formatChunkCharacter(char, language, limit)),
    // 原文写法与名称接近但不完全相同（错字、异写）：不是确定命中，由 Agent 自行确认
    possible_terms: nearTerms.map((match) => ({
      ...formatChunkTerm(match.item, language, limit),
      text_in_source: match.matchedText,
    })),
    possible_characters: nearCharacters.map((match) => ({
      ...formatChunkCharacter(match.item, language, limit),
      text_in_source: match.matchedText,
    })),
  };
}

/** 按选定的段落组装响应；compact 时去掉续块里重复和为空的字段 */
function assembleChunk(state: ChunkState, selected: readonly Paragraph[]): Record<string, unknown> {
  const { options, progress, context } = state;
  const lastIndex = state.indexById.get(selected[selected.length - 1]!.id) ?? 0;
  const nextInOrder = findNextCursor(state.allParagraphs, lastIndex, options.mode, state.language);
  const selectedIds = new Set(selected.map((p) => p.id));
  const payload = {
    ...state.basePayload,
    completed: false,
    // 这一块之后是否还有下一块：all 模式看章末，untranslated 模式看本块之外是否还有未译段落
    has_more:
      options.mode === 'all'
        ? nextInOrder !== null
        : progress.remainingUntranslated > selected.length,
    paragraphs: selected.map((p) => formatChunkParagraph(p, state)),
    context_before: context.contextBefore,
    previous_chapter_tail: formatPreviousTail(context.previousTail),
    ...(context.styleHints ? { style_hints: context.styleHints } : {}),
    ...formatChunkEntities(state, selected.map((p) => p.text).join('\n')),
    repeated_passages: context.repeatedPassages
      .filter((passage) => selectedIds.has(passage.paragraphId))
      .map((passage) => ({
        paragraph_id: passage.paragraphId,
        chapter_id: passage.chapter.id,
        title_original: titleOriginal(passage.chapter.title),
        index: passage.index,
        translation: passage.translation,
      })),
    memories: context.memories,
    // untranslated 模式返回当前最早未翻索引，确保即使调用方直接透传该游标也不会跳过本块中提交失败的段落
    next_cursor: options.mode === 'untranslated' ? progress.firstUntranslatedIndex : nextInOrder,
  };
  return options.compact ? compactChunkPayload(payload) : payload;
}

/**
 * 段落之外的部分放不下时，从这一块的开头起按字节装段落，直到装满预算（至少一段）。
 * 段落之外的体积按裁短前算：裁短后命中的术语、角色只会更少，实际只会更小。
 */
function fitParagraphsToBudget(
  state: ChunkState,
  fullPayload: Record<string, unknown>,
  paragraphs: readonly Paragraph[],
): Paragraph[] {
  let used = jsonByteLength(fullPayload) - jsonByteLength(fullPayload.paragraphs) + 2;
  const kept: Paragraph[] = [];
  for (const paragraph of paragraphs) {
    const size = jsonByteLength(formatChunkParagraph(paragraph, state)) + (kept.length > 0 ? 1 : 0);
    if (kept.length > 0 && used + size > state.options.byteBudget) break;
    used += size;
    kept.push(paragraph);
  }
  return kept;
}

async function loadChunkContext(
  book: Novel,
  chapter: Chapter,
  language: AppLocale,
  options: ChunkOptions,
  allParagraphs: Paragraph[],
  chunk: readonly Paragraph[],
  firstIndex: number,
): Promise<ChunkContext> {
  const previousChapters = listChaptersBefore(book, chapter.id);
  const chunkText = chunk.map((p) => p.text).join('\n');
  // 与站内翻译用同一套匹配（姓名拆分、注音归一化），并且只把本块命中的术语和角色交给记忆打分：
  // 关键词得分是「命中数 ÷ 传入的实体数」，传全书的设定会把得分稀释到阈值以下
  const { terms, characters } = collectChunkEntities(book, chunkText);
  const selectedMemories = await selectRelevantMemoriesForChunk(
    book.id,
    chunkText,
    terms,
    characters,
    buildChapterSemanticQuery(chapter, language),
    language,
  );
  const contextBefore = collectTranslatedBefore(
    allParagraphs,
    firstIndex,
    options.contextBeforeCount,
    language,
  );
  return {
    contextBefore,
    previousTail:
      contextBefore.length === 0
        ? await collectPreviousChapterTail(
            previousChapters[previousChapters.length - 1],
            options.contextBeforeCount,
            language,
          )
        : null,
    // 书籍没写标点约定时，Agent 靠它对齐前文的写法；续块已经看过，不再重复统计
    styleHints: options.compact
      ? null
      : await collectTranslationStyleHints(allParagraphs, previousChapters, language),
    memories: selectedMemories.memories.map((m) => ({
      id: m.id,
      summary: m.summary,
      content: m.content,
    })),
    // 回忆、首尾呼应、前后篇里原样重复的句子：带上前文的译法，紧邻的 context_before 看不到它们
    repeatedPassages: await findRepeatedPassages({
      targets: chunk,
      currentChapter: chapter,
      currentParagraphs: allParagraphs,
      beforeIndex: firstIndex,
      previousChapters,
      language,
    }),
  };
}

/** 从游标起的候选段落；untranslated 模式下游标之后没有、章节前部仍有未译段时回绕到最早的未译段 */
function collectChunkCandidates(
  allParagraphs: readonly Paragraph[],
  options: ChunkOptions,
  progress: ReturnType<typeof countChapterProgress>,
  language: AppLocale,
) {
  const found = collectCandidateParagraphs(allParagraphs, options.cursor, options.mode, language);
  // 绝不在还有未翻/失败段时误报 completed: true
  if (
    found.candidates.length === 0 &&
    options.mode === 'untranslated' &&
    progress.remainingUntranslated > 0 &&
    progress.firstUntranslatedIndex !== null
  ) {
    return collectCandidateParagraphs(
      allParagraphs,
      progress.firstUntranslatedIndex,
      options.mode,
      language,
    );
  }
  return found;
}

async function buildTranslationChunk(args: Record<string, unknown>, ctx: AgentMcpExecutionContext) {
  const resolved = resolveBookAndChapterFromArgs(args, ctx);
  if (!resolved.ok) return resolved.error;
  const { book, chapter, targetLanguage } = resolved;
  const options = parseChunkOptions(args, book);

  const allParagraphs = await loadChapterParagraphs(chapter);
  const progress = countChapterProgress(allParagraphs, targetLanguage);
  const { candidates, indexById } = collectChunkCandidates(
    allParagraphs,
    options,
    progress,
    targetLanguage,
  );

  const basePayload = {
    book_id: book.id,
    chapter_id: chapter.id,
    chapter_title_original: titleOriginal(chapter.title),
    chapter_title_translation: getChapterTitleTranslation(chapter, targetLanguage),
    target_language: targetLanguage,
    enable_original_text_validation: Boolean(book.enableOriginalTextValidation),
    mode: options.mode,
    special_instructions: resolveSpecialInstructionsForTask(book, chapter, options.taskType) ?? '',
    chapter_total_count: progress.total,
    chapter_translated_count: progress.translated,
    remaining_untranslated_count: progress.remainingUntranslated,
    ...(options.compact
      ? {}
      : {
          // 只用来对齐标题格式：不带章节 ID
          recent_chapter_titles: collectRecentChapterTitles(
            listChaptersBefore(book, chapter.id),
            targetLanguage,
          ).map((title) => ({
            title_original: title.original,
            title_translation: title.translation,
          })),
        }),
  };

  if (candidates.length === 0) {
    const done = {
      ...basePayload,
      completed: true,
      has_more: false,
      paragraphs: [],
      context_before: [],
      previous_chapter_tail: null,
      matched_terms: [],
      matched_characters: [],
      possible_terms: [],
      possible_characters: [],
      repeated_passages: [],
      memories: [],
      next_cursor: null,
    };
    return options.compact ? compactChunkPayload(done) : done;
  }

  // 先按段数配额与字符预算取出最大的一块（含并入的章末尾巴），上下文按它算一次
  const candidateMap = new Map(candidates.map((p) => [p.id, p]));
  const quota = takeWithinParagraphQuota(
    buildChunks(candidates, options.chunkSize, (p) => p.text)[0]!
      .paragraphIds.map((id) => candidateMap.get(id))
      .filter((p): p is Paragraph => Boolean(p)),
    options.maxParagraphs,
  );
  const upper = absorbShortTail(quota, candidates, options.maxParagraphs, options.chunkSize);
  const state: ChunkState = {
    book,
    language: targetLanguage,
    options,
    allParagraphs,
    indexById,
    progress,
    basePayload,
    context: await loadChunkContext(
      book,
      chapter,
      targetLanguage,
      options,
      allParagraphs,
      upper,
      indexById.get(upper[0]!.id) ?? 0,
    ),
  };

  // 再按整个响应的字节预算收口：并入尾巴时可略微超出，超出更多就不并入并裁短
  const full = assembleChunk(state, upper);
  const limit =
    upper.length > quota.length
      ? Math.floor(options.byteBudget * TAIL_BYTE_RATIO)
      : options.byteBudget;
  if (jsonByteLength(full) <= limit) return full;
  return assembleChunk(state, fitParagraphsToBudget(state, full, quota));
}

async function executeSubmitTranslations(
  args: Record<string, unknown>,
  ctx: AgentMcpExecutionContext,
) {
  const resolved = resolveBookAndChapterFromArgs(args, ctx);
  if (!resolved.ok) return resolved.error;
  if (!Array.isArray(args.paragraphs) || args.paragraphs.length === 0) {
    return agentMcpError('EMPTY_PARAGRAPH_LIST', 'paragraphs must be a non-empty array.');
  }

  const { book, chapter, targetLanguage } = resolved;
  const writeMode: AgentMcpWriteMode =
    args.write_mode === 'overwrite' || args.write_mode === 'append'
      ? args.write_mode
      : ctx.defaultWriteMode;
  const externalModelId = buildExternalTranslationModelId(
    ctx.channel,
    typeof args.model_label === 'string' ? args.model_label : undefined,
  );

  const allParagraphs = await loadChapterParagraphs(chapter);
  const paragraphById = new Map(allParagraphs.map((p) => [p.id, p]));
  const allowedIds = new Set(paragraphById.keys());
  const seenIds = new Set<string>();
  const failedItems: FailedBatchItem[] = [];
  const warnings: string[] = [];
  const edits: ParagraphTranslationEdit[] = [];

  for (let i = 0; i < args.paragraphs.length; i++) {
    const parsed = parseSingleSubmissionItem(args.paragraphs[i], i, {
      paragraphById,
      allowedIds,
      seenIds,
      enablePrefixValidation: book.enableOriginalTextValidation === true,
      writeMode,
      targetLanguage,
      externalModelId,
      warnings,
    });
    if (parsed.failure) failedItems.push(parsed.failure);
    if (parsed.edit) edits.push(parsed.edit);
  }

  const booksStore = useBooksStore();
  let updatedParagraphs = allParagraphs;
  if (edits.length > 0) {
    updatedParagraphs = await booksStore.editParagraphTranslations(
      book.id,
      chapter.id,
      targetLanguage,
      edits,
      targetLanguage,
    );
  }

  let chapterTitleUpdated = false;
  const titleTranslation = readTrimmedString(args.chapter_title_translation);
  if (titleTranslation) {
    await persistChapterTitleTranslation(
      book.id,
      chapter,
      targetLanguage,
      titleTranslation,
      externalModelId,
      true,
    );
    chapterTitleUpdated = true;
  }

  const progress = countChapterProgress(updatedParagraphs, targetLanguage);
  return {
    book_id: book.id,
    chapter_id: chapter.id,
    target_language: targetLanguage,
    write_mode: writeMode,
    model_id: externalModelId,
    saved_count: edits.length,
    failed_items: failedItems,
    warnings,
    chapter_title_updated: chapterTitleUpdated,
    chapter_total_count: progress.total,
    chapter_translated_count: progress.translated,
    remaining_untranslated_count: progress.remainingUntranslated,
    next_cursor: progress.firstUntranslatedIndex,
  };
}

export const agentMcpTranslationTools: AgentMcpToolSpec[] = [
  {
    name: 'get_translation_chunk',
    description:
      'Fetch the next chunk of paragraphs to translate or review, bundled with preceding translated context (context_before; for the first chunk of a chapter, previous_chapter_tail carries the end of the previous chapter instead), recent_chapter_titles for title formatting, style_hints (first chunk only: counts of the quote, dash, ellipsis, dialogue-final period, digit and space styles in up to 200 existing translations of this and the previous 5 chapters; follow the dominant style unless special_instructions say otherwise; omitted when fewer than 10 translated paragraphs exist), matched terms and characters (plus possible_terms / possible_characters: near matches where the source spelling differs slightly, e.g. a typo; text_in_source shows the spelling, confirm before applying; descriptions are cut to at most 150 characters, less when many entries match, so that together they stay around 600 characters, and marked description_truncated: true; read the full text with list_terms / list_characters before rewriting a description), repeated_passages (paragraphs of this chunk whose source text also appears, already translated, earlier in this chapter or in the previous 30 chapters, such as flashbacks and callbacks, with that earlier translation; only exact repeats with 10+ characters of text, punctuation not counted; a short line under 24 characters is left out when its two most recent earlier translations differ, since its wording follows the context; search_paragraphs is still needed for older or merely similar lines), top relevant memories, special instructions, target language, and continuation cursor. A chunk holds at most 60 paragraphs and about 4000 source characters by default, sized to be translated and submitted in one submit_translations call; a paragraph with 8 or fewer characters of text (punctuation not counted), such as a short interjection or a symbol-only line, counts as half a paragraph. The whole JSON response is also kept within max_response_bytes (default 9000 UTF-8 bytes, below the roughly 10 KiB some clients show inline before saving a result to a file): the context above is placed first and the paragraphs fill the rest, so a first chunk with many characters holds fewer paragraphs and compact follow-up chunks hold more. When the rest of the chapter after a chunk is at most a quarter of the paragraph limit, the combined chunk stays within 1.25 times the character budget and the response within 5% over max_response_bytes, it is folded in, so the last chunk can run over. has_more tells whether another chunk follows this one; completed is true only when the call returned no paragraphs (nothing left in this mode), so always process the returned paragraphs first.',
    category: 'translation',
    permission: 'read_only',
    readOnlyHint: true,
    requiresBookStore: true,
    inputSchema: {
      type: 'object',
      properties: {
        book_id: {
          type: 'string',
          description: 'Target book ID (optional if a book is currently open).',
        },
        chapter_id: { type: 'string', description: 'Target chapter ID.' },
        mode: {
          type: 'string',
          enum: ['untranslated', 'all'],
          description:
            'untranslated (default) returns only untranslated paragraphs; all returns all non-empty paragraphs.',
        },
        cursor: {
          type: 'number',
          description:
            'Starting original paragraph index in the chapter (default 0). For untranslated mode, omit cursor after submitting translations to resume from the earliest remaining untranslated paragraph.',
        },
        chunk_size: {
          type: 'number',
          description:
            'Optional source-character budget for this chunk (defaults to the book translationChunkSize, capped at 4000).',
        },
        max_paragraphs: {
          type: 'number',
          description:
            'Maximum paragraphs in this chunk (default 60, max 200; paragraphs with 8 or fewer characters of text count as half); the chunk ends at whichever of this and chunk_size is reached first. A short remainder (at most a quarter of this many paragraphs, and the combined chunk within 1.25 times the character budget) is folded into the chunk instead of becoming a tiny extra one. Lower it if responses get truncated by your client.',
        },
        context_before: {
          type: 'number',
          description:
            'Number of already-translated preceding paragraphs to include for continuity (default 3, max 10). Also the number of paragraphs taken from the end of the previous chapter when this chapter has none yet; 0 disables both.',
        },
        task_type: {
          type: 'string',
          enum: ['translation', 'polish', 'proofreading'],
          description: 'Which special instruction set to resolve (default translation).',
        },
        max_response_bytes: {
          type: 'number',
          description:
            'Size budget for the whole JSON response in UTF-8 bytes (default 9000, min 2000). Chinese and Japanese text takes 3 bytes per character. Raise it if your client shows larger tool results inline, lower it if responses still get saved to a file.',
        },
        include_descriptions: {
          type: 'boolean',
          description:
            'Include the (possibly shortened) descriptions of matched terms and characters (default true; compact never includes them). Set false to keep a first chunk small when your client stores large responses in a file; translation, sex, speaking_style and aliases are always included.',
        },
        compact: {
          type: 'boolean',
          description:
            'Smaller response for follow-up chunks of a chapter you already started (default false): omits what the first chunk already gave (recent_chapter_titles, style_hints, chapter_title_original / chapter_title_translation, target_language, enable_original_text_validation, mode) and the descriptions of terms and characters, and leaves out context_before, matched_terms, matched_characters, possible_terms, possible_characters, repeated_passages and memories when empty, previous_chapter_tail when null and special_instructions when empty: a missing field means there is none. Characters keep sex, speaking_style and aliases, so one who first appears in a later chunk still comes with a voice. Paragraphs, progress counts, has_more, completed and next_cursor are always present.',
        },
      },
      required: ['chapter_id'],
    },
    execute: buildTranslationChunk,
  },
  {
    name: 'submit_translations',
    description:
      'Validate and persist a batch of paragraph translations (and optional chapter title translation) to the local library, refreshing the live UI immediately. Submit one chunk from get_translation_chunk per call (at most 60 paragraphs by default); send calls one after another, waiting for each result. Submissions to the same book are applied one at a time, so parallel calls gain nothing; get_translation_chunk is read-only, so the next chunk can be fetched while a review correction (write_mode overwrite) is being saved.',
    category: 'translation',
    permission: 'translate_and_edit',
    readOnlyHint: false,
    requiresBookStore: true,
    serializeWritesPerBook: true,
    inputSchema: {
      type: 'object',
      properties: {
        book_id: {
          type: 'string',
          description: 'Target book ID (optional if a book is currently open).',
        },
        chapter_id: { type: 'string', description: 'Target chapter ID.' },
        paragraphs: {
          type: 'array',
          description: 'Translated paragraph items.',
          items: {
            type: 'object',
            properties: {
              paragraph_id: { type: 'string' },
              translated_text: { type: 'string' },
              original_text_prefix: {
                type: 'string',
                description:
                  'Required when book.enableOriginalTextValidation is true (leading 3-20 chars of original paragraph).',
              },
            },
            required: ['paragraph_id', 'translated_text'],
          },
        },
        write_mode: {
          type: 'string',
          enum: ['append', 'overwrite'],
          description:
            'append adds a new translation version and selects it (default); overwrite revises the currently selected version in place (falls back to append if untranslated). Use overwrite to correct a translation you submitted earlier in the same task, so the draft does not use up one of the 5 versions kept per paragraph; for polishing or proofreading existing translations keep the default unless the user asks to overwrite.',
        },
        model_label: {
          type: 'string',
          description:
            'Optional external model/agent label (e.g. "claude-opus-4", "gemini-2.5-pro").',
        },
        chapter_title_translation: {
          type: 'string',
          description: 'Optional translated title for this chapter.',
        },
      },
      required: ['chapter_id', 'paragraphs'],
    },
    execute: executeSubmitTranslations,
  },
  {
    name: 'get_chapter_paragraphs',
    description:
      'Read paragraphs from a chapter by index range or keyword filter, including current translation and optional translation history. Use skip_empty=true to ignore blank lines and from_end=true to read the end of a chapter.',
    category: 'translation',
    permission: 'read_only',
    readOnlyHint: true,
    requiresBookStore: true,
    inputSchema: {
      type: 'object',
      properties: {
        book_id: {
          type: 'string',
          description: 'Target book ID (optional if a book is currently open).',
        },
        chapter_id: { type: 'string', description: 'Target chapter ID.' },
        start_index: {
          type: 'number',
          description:
            'Starting paragraph index (default 0); pass next_start_index to continue. Ignored when from_end is true.',
        },
        limit: {
          type: 'number',
          description: 'Maximum paragraphs to return (default 50, max 200).',
        },
        keyword: {
          type: 'string',
          description: 'Optional case-insensitive substring filter on original or translation.',
        },
        fuzzy: FUZZY_PROPERTY,
        skip_empty: {
          type: 'boolean',
          description:
            'Skip blank paragraphs so that limit counts only paragraphs with text (default false).',
        },
        from_end: {
          type: 'boolean',
          description:
            'Return the last `limit` paragraphs of the chapter, still in reading order (default false).',
        },
        include_history: {
          type: 'boolean',
          description: 'Include all stored translation versions per paragraph (default false).',
        },
      },
      required: ['chapter_id'],
    },
    execute: async (args, ctx) => {
      const resolved = resolveBookAndChapterFromArgs(args, ctx);
      if (!resolved.ok) return resolved.error;
      const { book, chapter, targetLanguage } = resolved;

      const limit = parseLimit(args.limit, 50, 200);
      const keyword = readTrimmedString(args.keyword).toLowerCase();
      const includeHistory = args.include_history === true;
      const skipEmpty = args.skip_empty === true;
      const fromEnd = args.from_end === true;
      const startIndex = fromEnd ? 0 : parseNonNegativeInt(args.start_index, 0);

      const allParagraphs = await loadChapterParagraphs(chapter);
      // 模糊过滤一次算出命中的段落；精确过滤逐段判断
      const fuzzyHits =
        keyword && args.fuzzy === true
          ? new Set(
              fuzzyMatchIndexes(
                allParagraphs,
                (p) => [p.text, getLanguageTranslation(p, targetLanguage)?.translation ?? ''],
                keyword,
              ),
            )
          : null;
      // 先找出范围内符合条件的段落序号，再按方向截取
      const candidates: number[] = [];
      for (let i = startIndex; i < allParagraphs.length; i++) {
        const p = allParagraphs[i]!;
        if (skipEmpty && isEmptyParagraph(p.text)) continue;
        if (fuzzyHits) {
          if (!fuzzyHits.has(i)) continue;
        } else if (keyword) {
          const translation = getLanguageTranslation(p, targetLanguage)?.translation ?? '';
          if (
            !p.text.toLowerCase().includes(keyword) &&
            !translation.toLowerCase().includes(keyword)
          )
            continue;
        }
        candidates.push(i);
      }
      const selected = fromEnd ? candidates.slice(-limit) : candidates.slice(0, limit);
      const hasMore = candidates.length > selected.length;

      return {
        book_id: book.id,
        chapter_id: chapter.id,
        target_language: targetLanguage,
        total_paragraphs: allParagraphs.length,
        paragraphs: selected.map((i) => {
          const p = allParagraphs[i]!;
          const current = getLanguageTranslation(p, targetLanguage);
          return {
            index: i,
            id: p.id,
            text: p.text,
            selected_translation: current
              ? {
                  id: current.id,
                  translation: current.translation,
                  ai_model_id: current.aiModelId,
                }
              : null,
            ...(includeHistory
              ? {
                  translations: p.translations.map((tr) => ({
                    id: tr.id,
                    language: tr.language ?? 'zh-CN',
                    translation: tr.translation,
                    ai_model_id: tr.aiModelId,
                  })),
                }
              : {}),
          };
        }),
        has_more: hasMore,
        // 向后读时给出下一次的起点；从末尾读时更早的内容用 start_index 自行指定
        next_start_index: hasMore && !fromEnd ? selected[selected.length - 1]! + 1 : null,
      };
    },
  },
  {
    name: 'update_chapter_title',
    description: 'Update the translated title of a chapter in the book target language.',
    category: 'translation',
    permission: 'translate_and_edit',
    readOnlyHint: false,
    requiresBookStore: true,
    serializeWritesPerBook: true,
    inputSchema: {
      type: 'object',
      properties: {
        book_id: {
          type: 'string',
          description: 'Target book ID (optional if a book is currently open).',
        },
        chapter_id: { type: 'string', description: 'Target chapter ID.' },
        title_translation: { type: 'string', description: 'Translated chapter title.' },
        model_label: { type: 'string', description: 'Optional external model/agent label.' },
      },
      required: ['chapter_id', 'title_translation'],
    },
    execute: async (args, ctx) => {
      const resolved = resolveBookAndChapterFromArgs(args, ctx);
      if (!resolved.ok) return resolved.error;
      const titleTranslation = readTrimmedString(args.title_translation);
      if (!titleTranslation) {
        return agentMcpError('INVALID_ARGS', 'title_translation must be non-empty.');
      }

      const { book, chapter, targetLanguage } = resolved;
      const externalModelId = buildExternalTranslationModelId(
        ctx.channel,
        typeof args.model_label === 'string' ? args.model_label : undefined,
      );

      await persistChapterTitleTranslation(
        book.id,
        chapter,
        targetLanguage,
        titleTranslation,
        externalModelId,
        false,
      );

      return {
        book_id: book.id,
        chapter_id: chapter.id,
        title_original: titleOriginal(chapter.title),
        title_translation: titleTranslation,
        model_id: externalModelId,
      };
    },
  },
];
