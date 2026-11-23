import { fuzzyMatchIndexes } from 'src/services/library-query/keyword-match';
import type { AppLocale } from 'src/models/locale';
import type { Chapter, CharacterSetting, Paragraph, Terminology } from 'src/models/novel';
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
  type ChapterTitleRef,
} from 'src/services/library-query/chunk-context';
import { findRepeatedPassages } from 'src/services/library-query/repeated-passages';
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
 * 限到这个数之后，取一块正好对应一次提交和一次复核。
 */
const DEFAULT_CHUNK_PARAGRAPH_LIMIT = 50;
const MAX_CHUNK_PARAGRAPH_LIMIT = 200;
/**
 * 默认字符预算的上限（原文字数）。书籍的分块大小可以设到 50000，那是给站内翻译用的；
 * 长段落的文体里 50 段就有一万多字，带上译文后响应同样会超出客户端的输出上限。
 * 书籍设得更小时按书籍的来；Agent 明确传入 chunk_size 时不受这个上限约束。
 */
const DEFAULT_CHUNK_CHARACTER_LIMIT = 4000;

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

function formatChapterTitle(title: ChapterTitleRef) {
  return {
    chapter_id: title.chapter.id,
    title_original: title.original,
    title_translation: title.translation,
  };
}

/** compact 模式下术语只给名称与译法：同一章的后续块里这些说明都是重复的 */
function formatChunkTerm(term: Terminology, language: AppLocale, compact: boolean) {
  const full = formatTermSummary(term, language);
  return compact ? { id: full.id, name: full.name, translation: full.translation } : full;
}

/** compact 模式下角色只给名称、译法与别名译法，省略性别、描述与说话风格 */
function formatChunkCharacter(char: CharacterSetting, language: AppLocale, compact: boolean) {
  const full = formatCharacterSummary(char, language);
  return compact
    ? { id: full.id, name: full.name, translation: full.translation, aliases: full.aliases }
    : full;
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

async function executeGetTranslationChunk(
  args: Record<string, unknown>,
  ctx: AgentMcpExecutionContext,
) {
  const resolved = resolveBookAndChapterFromArgs(args, ctx);
  if (!resolved.ok) return resolved.error;
  const { book, chapter, targetLanguage } = resolved;

  const mode = args.mode === 'all' ? 'all' : 'untranslated';
  const cursor = parseNonNegativeInt(args.cursor, 0);
  const contextBeforeCount = Math.min(10, parseNonNegativeInt(args.context_before, 3));
  const chunkSize =
    args.chunk_size !== undefined
      ? resolveRuntimeTaskChunkSize(Number(args.chunk_size))
      : Math.min(resolveTaskChunkSize(book.translationChunkSize), DEFAULT_CHUNK_CHARACTER_LIMIT);
  const taskType =
    args.task_type === 'polish' || args.task_type === 'proofreading'
      ? args.task_type
      : 'translation';
  const compact = args.compact === true;
  const maxParagraphs = parseLimit(
    // 0 与非法值都按默认值处理
    Number(args.max_paragraphs) >= 1 ? args.max_paragraphs : undefined,
    DEFAULT_CHUNK_PARAGRAPH_LIMIT,
    MAX_CHUNK_PARAGRAPH_LIMIT,
  );

  const allParagraphs = await loadChapterParagraphs(chapter);
  const progress = countChapterProgress(allParagraphs, targetLanguage);
  let { candidates, indexById } = collectCandidateParagraphs(
    allParagraphs,
    cursor,
    mode,
    targetLanguage,
  );
  // untranslated 模式下，若游标之后无候选但章节前部仍有未翻/失败段，自动回绕到最早未翻段，绝不误报 completed: true
  if (
    candidates.length === 0 &&
    mode === 'untranslated' &&
    progress.remainingUntranslated > 0 &&
    progress.firstUntranslatedIndex !== null
  ) {
    ({ candidates, indexById } = collectCandidateParagraphs(
      allParagraphs,
      progress.firstUntranslatedIndex,
      mode,
      targetLanguage,
    ));
  }

  // 与上一章的衔接、命中的术语和角色都与站内翻译共用 library-query/chunk-context
  const previousChapters = listChaptersBefore(book, chapter.id);
  const basePayload = {
    book_id: book.id,
    chapter_id: chapter.id,
    chapter_title_original: titleOriginal(chapter.title),
    chapter_title_translation: getChapterTitleTranslation(chapter, targetLanguage),
    target_language: targetLanguage,
    enable_original_text_validation: Boolean(book.enableOriginalTextValidation),
    mode,
    special_instructions: resolveSpecialInstructionsForTask(book, chapter, taskType) ?? '',
    chapter_total_count: progress.total,
    chapter_translated_count: progress.translated,
    remaining_untranslated_count: progress.remainingUntranslated,
    ...(compact
      ? {}
      : {
          recent_chapter_titles: collectRecentChapterTitles(previousChapters, targetLanguage).map(
            formatChapterTitle,
          ),
        }),
  };

  if (candidates.length === 0) {
    return {
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
  }

  const chunks = buildChunks(candidates, chunkSize, (p) => p.text);
  const candidateMap = new Map(candidates.map((p) => [p.id, p]));
  const chunkParagraphs = chunks[0]!.paragraphIds
    .slice(0, maxParagraphs)
    .map((id) => candidateMap.get(id))
    .filter((p): p is Paragraph => Boolean(p));

  const firstOriginalIdx = indexById.get(chunkParagraphs[0]!.id) ?? 0;
  const lastOriginalIdx = indexById.get(chunkParagraphs[chunkParagraphs.length - 1]!.id) ?? 0;
  const chunkText = chunkParagraphs.map((p) => p.text).join('\n');

  // 与站内翻译用同一套匹配（姓名拆分、注音归一化），并且只把本块命中的术语和角色交给记忆打分：
  // 关键词得分是「命中数 ÷ 传入的实体数」，传全书的设定会把得分稀释到阈值以下
  const {
    terms: matchedTerms,
    characters: matchedCharacters,
    nearTerms,
    nearCharacters,
  } = collectChunkEntities(book, chunkText);
  const selectedMemories = await selectRelevantMemoriesForChunk(
    book.id,
    chunkText,
    matchedTerms,
    matchedCharacters,
    buildChapterSemanticQuery(chapter, targetLanguage),
    targetLanguage,
  );

  const contextBefore = collectTranslatedBefore(
    allParagraphs,
    firstOriginalIdx,
    contextBeforeCount,
    targetLanguage,
  );
  const previousTail =
    contextBefore.length === 0
      ? await collectPreviousChapterTail(
          previousChapters[previousChapters.length - 1],
          contextBeforeCount,
          targetLanguage,
        )
      : null;
  const nextInOrder = findNextCursor(allParagraphs, lastOriginalIdx, mode, targetLanguage);
  // 回忆、首尾呼应、前后篇里原样重复的句子：带上前文的译法，紧邻的 context_before 看不到它们
  const repeatedPassages = await findRepeatedPassages({
    targets: chunkParagraphs,
    currentChapter: chapter,
    currentParagraphs: allParagraphs,
    beforeIndex: firstOriginalIdx,
    previousChapters,
    language: targetLanguage,
  });

  return {
    ...basePayload,
    completed: false,
    // 这一块之后是否还有下一块：all 模式看章末，untranslated 模式看本块之外是否还有未译段落
    has_more:
      mode === 'all'
        ? nextInOrder !== null
        : progress.remainingUntranslated > chunkParagraphs.length,
    paragraphs: chunkParagraphs.map((p) => ({
      index: indexById.get(p.id) ?? 0,
      id: p.id,
      text: p.text,
      ...(mode === 'all'
        ? { current_translation: getLanguageTranslation(p, targetLanguage)?.translation ?? null }
        : {}),
    })),
    context_before: contextBefore,
    previous_chapter_tail: previousTail
      ? { ...formatChapterTitle(previousTail.title), paragraphs: previousTail.paragraphs }
      : null,
    matched_terms: matchedTerms.map((term) => formatChunkTerm(term, targetLanguage, compact)),
    matched_characters: matchedCharacters.map((char) =>
      formatChunkCharacter(char, targetLanguage, compact),
    ),
    // 原文写法与名称接近但不完全相同（错字、异写）：不是确定命中，由 Agent 自行确认
    possible_terms: nearTerms.map((match) => ({
      ...formatChunkTerm(match.item, targetLanguage, compact),
      text_in_source: match.matchedText,
    })),
    possible_characters: nearCharacters.map((match) => ({
      ...formatChunkCharacter(match.item, targetLanguage, compact),
      text_in_source: match.matchedText,
    })),
    repeated_passages: repeatedPassages.map((passage) => ({
      paragraph_id: passage.paragraphId,
      chapter_id: passage.chapter.id,
      title_original: titleOriginal(passage.chapter.title),
      index: passage.index,
      translation: passage.translation,
    })),
    memories: selectedMemories.memories.map((m) => ({
      id: m.id,
      summary: m.summary,
      content: m.content,
    })),
    // untranslated 模式返回当前最早未翻索引，确保即使调用方直接透传该游标也不会跳过本块中提交失败的段落
    next_cursor: mode === 'untranslated' ? progress.firstUntranslatedIndex : nextInOrder,
  };
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
      'Fetch the next chunk of paragraphs to translate or review, bundled with preceding translated context (context_before; for the first chunk of a chapter, previous_chapter_tail carries the end of the previous chapter instead), recent_chapter_titles for title formatting, matched terms and characters (plus possible_terms / possible_characters: near matches where the source spelling differs slightly, e.g. a typo; text_in_source shows the spelling, confirm before applying), repeated_passages (paragraphs of this chunk whose source text also appears, already translated, earlier in this chapter or in the previous 30 chapters, such as flashbacks and callbacks, with that earlier translation; only exact repeats of 10+ characters, so search_paragraphs is still needed for older or merely similar lines), top relevant memories, special instructions, target language, and continuation cursor. A chunk holds at most 50 paragraphs and about 4000 source characters by default, sized to be translated and submitted in one submit_translations call. has_more tells whether another chunk follows this one; completed is true only when the call returned no paragraphs (nothing left in this mode), so always process the returned paragraphs first.',
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
            'Maximum paragraphs in this chunk (default 50, max 200); the chunk ends at whichever of this and chunk_size is reached first. Lower it if responses get truncated by your client.',
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
        compact: {
          type: 'boolean',
          description:
            'Smaller response for follow-up chunks of a chapter you already started (default false): omits recent_chapter_titles and reduces terms/characters to name, translation (and character aliases), dropping descriptions and speaking styles. Paragraphs, context, memories and special instructions are unchanged.',
        },
      },
      required: ['chapter_id'],
    },
    execute: executeGetTranslationChunk,
  },
  {
    name: 'submit_translations',
    description:
      'Validate and persist a batch of paragraph translations (and optional chapter title translation) to the local library, refreshing the live UI immediately. Submit one chunk from get_translation_chunk per call (at most 50 paragraphs by default); send calls one after another, waiting for each result. Submissions to the same book are applied one at a time, so parallel calls gain nothing.',
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
