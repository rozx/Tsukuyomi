import type { AppLocale } from 'src/models/locale';
import type { Chapter, Novel, Paragraph } from 'src/models/novel';
import type { AgentMcpWriteMode } from 'src/models/settings';
import {
  buildChunks,
  resolveRuntimeTaskChunkSize,
  resolveTaskChunkSize,
} from 'src/services/ai/tasks/utils/chunk-formatter';
import {
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
import { isEmptyParagraph } from 'src/utils/text-utils';
import { buildExternalTranslationModelId } from 'src/utils/translation-model-label';
import { agentMcpError, type AgentMcpExecutionContext, type AgentMcpToolSpec } from '../types';
import {
  formatCharacterSummary,
  formatTermSummary,
  loadChapterParagraphs,
  readTrimmedString,
  resolveBookAndChapterFromArgs,
} from './helpers';

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

function parseNonNegativeInt(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.trunc(num);
}

function matchRelevantTerms(book: Novel, chunkText: string, language: AppLocale) {
  const lowerChunk = chunkText.toLowerCase();
  return (book.terminologies ?? [])
    .filter((term) => term.name.trim().length > 0 && lowerChunk.includes(term.name.toLowerCase()))
    .map((term) => formatTermSummary(term, language));
}

function matchRelevantCharacters(book: Novel, chunkText: string, language: AppLocale) {
  const lowerChunk = chunkText.toLowerCase();
  return (book.characterSettings ?? [])
    .filter((char) => {
      if (char.name.trim().length > 0 && lowerChunk.includes(char.name.toLowerCase())) return true;
      return (char.aliases ?? []).some(
        (alias) => alias.name.trim().length > 0 && lowerChunk.includes(alias.name.toLowerCase()),
      );
    })
    .map((char) => formatCharacterSummary(char, language));
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

function collectContextBefore(
  allParagraphs: readonly Paragraph[],
  firstOriginalIdx: number,
  count: number,
  targetLanguage: AppLocale,
) {
  const contextBefore: Array<{ index: number; id: string; original: string; translation: string }> =
    [];
  for (let i = firstOriginalIdx - 1; i >= 0 && contextBefore.length < count; i--) {
    const p = allParagraphs[i]!;
    if (isEmptyParagraph(p.text)) continue;
    const tr = getLanguageTranslation(p, targetLanguage);
    if (!tr || !tr.translation.trim()) continue;
    contextBefore.unshift({
      index: i,
      id: p.id,
      original: p.text,
      translation: tr.translation,
    });
  }
  return contextBefore;
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

function buildEditForParagraph(
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
      : resolveTaskChunkSize(book.translationChunkSize);
  const taskType =
    args.task_type === 'polish' || args.task_type === 'proofreading'
      ? args.task_type
      : 'translation';

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
  };

  if (candidates.length === 0) {
    return {
      ...basePayload,
      completed: true,
      paragraphs: [],
      context_before: [],
      matched_terms: [],
      matched_characters: [],
      memories: [],
      next_cursor: null,
    };
  }

  const chunks = buildChunks(candidates, chunkSize, (p) => p.text);
  const candidateMap = new Map(candidates.map((p) => [p.id, p]));
  const chunkParagraphs = chunks[0]!.paragraphIds
    .map((id) => candidateMap.get(id))
    .filter((p): p is Paragraph => Boolean(p));

  const firstOriginalIdx = indexById.get(chunkParagraphs[0]!.id) ?? 0;
  const lastOriginalIdx = indexById.get(chunkParagraphs[chunkParagraphs.length - 1]!.id) ?? 0;
  const chunkText = chunkParagraphs.map((p) => p.text).join('\n');

  const selectedMemories = await selectRelevantMemoriesForChunk(
    book.id,
    chunkText,
    book.terminologies,
    book.characterSettings,
    undefined,
    targetLanguage,
  );

  return {
    ...basePayload,
    completed: false,
    paragraphs: chunkParagraphs.map((p) => ({
      index: indexById.get(p.id) ?? 0,
      id: p.id,
      text: p.text,
      ...(mode === 'all'
        ? { current_translation: getLanguageTranslation(p, targetLanguage)?.translation ?? null }
        : {}),
    })),
    context_before: collectContextBefore(
      allParagraphs,
      firstOriginalIdx,
      contextBeforeCount,
      targetLanguage,
    ),
    matched_terms: matchRelevantTerms(book, chunkText, targetLanguage),
    matched_characters: matchRelevantCharacters(book, chunkText, targetLanguage),
    memories: selectedMemories.memories.map((m) => ({
      id: m.id,
      summary: m.summary,
      content: m.content,
    })),
    // untranslated 模式返回当前最早未翻索引，确保即使调用方直接透传该游标也不会跳过本块中提交失败的段落
    next_cursor:
      mode === 'untranslated'
        ? progress.firstUntranslatedIndex
        : findNextCursor(allParagraphs, lastOriginalIdx, mode, targetLanguage),
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
      'Fetch the next chunk of paragraphs to translate or review, bundled with preceding translated context, matched terms, character settings, top relevant memories, special instructions, target language, and continuation cursor.',
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
            'Optional character budget for this chunk (defaults to book translationChunkSize).',
        },
        context_before: {
          type: 'number',
          description:
            'Number of already-translated preceding paragraphs to include for continuity (default 3, max 10).',
        },
        task_type: {
          type: 'string',
          enum: ['translation', 'polish', 'proofreading'],
          description: 'Which special instruction set to resolve (default translation).',
        },
      },
      required: ['chapter_id'],
    },
    execute: executeGetTranslationChunk,
  },
  {
    name: 'submit_translations',
    description:
      'Validate and persist a batch of paragraph translations (and optional chapter title translation) to the local library, refreshing the live UI immediately.',
    category: 'translation',
    permission: 'translate_and_edit',
    readOnlyHint: false,
    requiresBookStore: true,
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
            'append adds a new translation version and selects it (default); overwrite revises the currently selected version in place (falls back to append if untranslated).',
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
      'Read paragraphs from a chapter by index range or keyword filter, including current translation and optional translation history.',
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
        start_index: { type: 'number', description: 'Starting paragraph index (default 0).' },
        limit: {
          type: 'number',
          description: 'Maximum paragraphs to return (default 50, max 200).',
        },
        keyword: {
          type: 'string',
          description: 'Optional case-insensitive substring filter on original or translation.',
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

      const startIndex = parseNonNegativeInt(args.start_index, 0);
      const limit = Math.min(200, Math.max(1, parseNonNegativeInt(args.limit, 50)));
      const keyword = readTrimmedString(args.keyword).toLowerCase();
      const includeHistory = args.include_history === true;

      const allParagraphs = await loadChapterParagraphs(chapter);
      const matched: Array<Record<string, unknown>> = [];

      for (let i = startIndex; i < allParagraphs.length && matched.length < limit; i++) {
        const p = allParagraphs[i]!;
        const selected = getLanguageTranslation(p, targetLanguage);
        if (keyword) {
          const hitOriginal = p.text.toLowerCase().includes(keyword);
          const hitTranslation = (selected?.translation ?? '').toLowerCase().includes(keyword);
          if (!hitOriginal && !hitTranslation) continue;
        }
        matched.push({
          index: i,
          id: p.id,
          text: p.text,
          selected_translation: selected
            ? {
                id: selected.id,
                translation: selected.translation,
                ai_model_id: selected.aiModelId,
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
        });
      }

      return {
        book_id: book.id,
        chapter_id: chapter.id,
        target_language: targetLanguage,
        total_paragraphs: allParagraphs.length,
        paragraphs: matched,
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
