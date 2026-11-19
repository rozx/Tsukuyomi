import type { AppLocale } from 'src/models/locale';
import { CharacterSettingService } from 'src/services/character-setting-service';
import { MemoryService } from 'src/services/memory-service';
import { TerminologyService } from 'src/services/terminology-service';
import { titleOriginal } from 'src/services/localization/title-edit';
import { useBooksStore } from 'src/stores/books';
import { agentMcpError, type AgentMcpExecutionContext, type AgentMcpToolSpec } from '../types';
import {
  findChapterInBook,
  formatCharacterSummary,
  formatTermSummary,
  readOptionalTrimmedString,
  readTrimmedString,
  resolveBookFromArgs,
} from './helpers';

interface UpsertItemResult {
  id?: string;
  name: string;
  action: 'created' | 'updated' | 'failed';
  error?: string;
}

function parseSex(raw: unknown): 'male' | 'female' | 'other' | undefined {
  if (raw === 'male' || raw === 'female' || raw === 'other') return raw;
  return undefined;
}

function parseAliases(raw: unknown): Array<{ name: string; translation: string }> | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter((a): a is Record<string, unknown> => Boolean(a && typeof a === 'object'))
    .map((a) => ({
      name: readTrimmedString(a.name),
      translation: readTrimmedString(a.translation),
    }))
    .filter((a) => a.name.length > 0 && a.translation.length > 0);
}

function parseNamedEntityItem(
  item: unknown,
):
  | { ok: true; rec: Record<string, unknown>; id: string; name: string; translation: string }
  | { ok: false; failure: UpsertItemResult } {
  if (!item || typeof item !== 'object') {
    return { ok: false, failure: { name: '', action: 'failed', error: 'Item must be an object.' } };
  }
  const rec = item as Record<string, unknown>;
  const id = readTrimmedString(rec.id);
  const name = readTrimmedString(rec.name);
  const translation = readTrimmedString(rec.translation);
  if (!name || !translation) {
    return {
      ok: false,
      failure: { name, action: 'failed', error: 'Both name and translation must be non-empty.' },
    };
  }
  return { ok: true, rec, id, name, translation };
}

async function upsertSingleTerm(
  bookId: string,
  language: AppLocale,
  item: unknown,
): Promise<UpsertItemResult> {
  const parsed = parseNamedEntityItem(item);
  if (!parsed.ok) return parsed.failure;
  const { rec, id, name, translation } = parsed;
  const description = readOptionalTrimmedString(rec.description);

  try {
    const freshBook = useBooksStore().getBookById(bookId);
    const existing = (freshBook?.terminologies ?? []).find(
      (t) => (id && t.id === id) || t.name === name,
    );
    const payload = {
      name,
      translation,
      ...(description !== undefined ? { description } : {}),
    };
    if (existing) {
      const updated = await TerminologyService.updateTerminology(
        bookId,
        existing.id,
        payload,
        language,
      );
      return { id: updated.id, name: updated.name, action: 'updated' };
    }
    const created = await TerminologyService.addTerminology(bookId, payload, language);
    return { id: created.id, name: created.name, action: 'created' };
  } catch (error) {
    return {
      name,
      action: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function upsertSingleCharacter(
  bookId: string,
  language: AppLocale,
  item: unknown,
): Promise<UpsertItemResult> {
  const parsed = parseNamedEntityItem(item);
  if (!parsed.ok) return parsed.failure;
  const { rec, id, name, translation } = parsed;

  const sex = parseSex(rec.sex);
  const description = readOptionalTrimmedString(rec.description);
  const speakingStyle = readOptionalTrimmedString(rec.speaking_style);
  const aliases = parseAliases(rec.aliases);
  const payload = {
    name,
    translation,
    ...(sex !== undefined ? { sex } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(speakingStyle !== undefined ? { speakingStyle } : {}),
    ...(aliases !== undefined ? { aliases } : {}),
  };

  try {
    const freshBook = useBooksStore().getBookById(bookId);
    const existing = (freshBook?.characterSettings ?? []).find(
      (c) => (id && c.id === id) || c.name === name,
    );
    if (existing) {
      const updated = await CharacterSettingService.updateCharacterSetting(
        bookId,
        existing.id,
        payload,
        language,
      );
      return { id: updated.id, name: updated.name, action: 'updated' };
    }
    const created = await CharacterSettingService.addCharacterSetting(bookId, payload, language);
    return { id: created.id, name: created.name, action: 'created' };
  } catch (error) {
    return {
      name,
      action: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildSpecialInstructionPatch(args: Record<string, unknown>) {
  const patch: {
    translationInstructions?: string | undefined;
    polishInstructions?: string | undefined;
    proofreadingInstructions?: string | undefined;
  } = {};
  let hasAny = false;
  if (typeof args.translation_instructions === 'string') {
    patch.translationInstructions = args.translation_instructions.trim() || undefined;
    hasAny = true;
  }
  if (typeof args.polish_instructions === 'string') {
    patch.polishInstructions = args.polish_instructions.trim() || undefined;
    hasAny = true;
  }
  if (typeof args.proofreading_instructions === 'string') {
    patch.proofreadingInstructions = args.proofreading_instructions.trim() || undefined;
    hasAny = true;
  }
  return { hasAny, patch };
}

async function executeUpsertBatch(
  args: Record<string, unknown>,
  ctx: AgentMcpExecutionContext,
  arrayKey: 'terms' | 'characters',
  upsertItem: (bookId: string, language: AppLocale, item: unknown) => Promise<UpsertItemResult>,
) {
  const resolved = resolveBookFromArgs(args, ctx);
  if (!resolved.ok) return resolved.error;
  const items = args[arrayKey];
  if (!Array.isArray(items) || items.length === 0) {
    return agentMcpError('INVALID_ARGS', `${arrayKey} must be a non-empty array.`);
  }
  const results: UpsertItemResult[] = [];
  for (const item of items) {
    results.push(await upsertItem(resolved.book.id, resolved.targetLanguage, item));
  }
  return { book_id: resolved.book.id, results };
}

function matchesKeyword(keyword: string, texts: readonly string[]): boolean {
  if (!keyword) return true;
  return texts.some((value) => value.toLowerCase().includes(keyword));
}

function executeListEntity<T>(
  args: Record<string, unknown>,
  ctx: AgentMcpExecutionContext,
  resultKey: 'terms' | 'characters',
  selectItems: (
    book: NonNullable<ReturnType<ReturnType<typeof useBooksStore>['getBookById']>>,
    language: AppLocale,
    keyword: string,
  ) => T[],
) {
  const resolved = resolveBookFromArgs(args, ctx);
  if (!resolved.ok) return resolved.error;
  const { book, targetLanguage } = resolved;
  const keyword = readTrimmedString(args.keyword).toLowerCase();
  return {
    book_id: book.id,
    target_language: targetLanguage,
    [resultKey]: selectItems(book, targetLanguage, keyword),
  };
}

export const agentMcpWorldbuildingTools: AgentMcpToolSpec[] = [
  {
    name: 'list_terms',
    description: 'List or keyword-filter terminology entries for a book.',
    category: 'worldbuilding',
    permission: 'read_only',
    readOnlyHint: true,
    requiresBookStore: true,
    inputSchema: {
      type: 'object',
      properties: {
        book_id: { type: 'string', description: 'Target book ID (optional if a book is open).' },
        keyword: {
          type: 'string',
          description: 'Optional case-insensitive filter on name/translation/description.',
        },
      },
    },
    execute: (args, ctx) =>
      executeListEntity(args, ctx, 'terms', (book, language, keyword) =>
        (book.terminologies ?? [])
          .map((term) => formatTermSummary(term, language))
          .filter((term) =>
            matchesKeyword(keyword, [term.name, term.translation, term.description]),
          ),
      ),
  },
  {
    name: 'upsert_terms',
    description:
      'Batch-create or idempotently update terminology entries (matched by id or exact name).',
    category: 'worldbuilding',
    permission: 'translate_and_edit',
    readOnlyHint: false,
    requiresBookStore: true,
    inputSchema: {
      type: 'object',
      properties: {
        book_id: { type: 'string', description: 'Target book ID (optional if a book is open).' },
        terms: {
          type: 'array',
          description: 'Terminology items to create or update.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              translation: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['name', 'translation'],
          },
        },
      },
      required: ['terms'],
    },
    execute: (args, ctx) => executeUpsertBatch(args, ctx, 'terms', upsertSingleTerm),
  },
  {
    name: 'list_characters',
    description:
      'List or keyword-filter character settings (including aliases and speaking style) for a book.',
    category: 'worldbuilding',
    permission: 'read_only',
    readOnlyHint: true,
    requiresBookStore: true,
    inputSchema: {
      type: 'object',
      properties: {
        book_id: { type: 'string', description: 'Target book ID (optional if a book is open).' },
        keyword: {
          type: 'string',
          description: 'Optional case-insensitive filter on name/translation/alias.',
        },
      },
    },
    execute: (args, ctx) =>
      executeListEntity(args, ctx, 'characters', (book, language, keyword) =>
        (book.characterSettings ?? [])
          .map((char) => formatCharacterSummary(char, language))
          .filter((char) =>
            matchesKeyword(keyword, [
              char.name,
              char.translation,
              char.description,
              ...char.aliases.flatMap((a) => [a.name, a.translation]),
            ]),
          ),
      ),
  },
  {
    name: 'upsert_characters',
    description:
      'Batch-create or idempotently update character settings (matched by id or exact name).',
    category: 'worldbuilding',
    permission: 'translate_and_edit',
    readOnlyHint: false,
    requiresBookStore: true,
    inputSchema: {
      type: 'object',
      properties: {
        book_id: { type: 'string', description: 'Target book ID (optional if a book is open).' },
        characters: {
          type: 'array',
          description: 'Character items to create or update.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              translation: { type: 'string' },
              sex: { type: 'string', enum: ['male', 'female', 'other'] },
              description: { type: 'string' },
              speaking_style: { type: 'string' },
              aliases: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    translation: { type: 'string' },
                  },
                  required: ['name', 'translation'],
                },
              },
            },
            required: ['name', 'translation'],
          },
        },
      },
      required: ['characters'],
    },
    execute: (args, ctx) => executeUpsertBatch(args, ctx, 'characters', upsertSingleCharacter),
  },
  {
    name: 'search_memories',
    description:
      'Search book memories using Tsukuyomi hybrid semantic + keyword retrieval (or list recent memories when query is omitted).',
    category: 'worldbuilding',
    permission: 'read_only',
    readOnlyHint: true,
    requiresBookStore: true,
    inputSchema: {
      type: 'object',
      properties: {
        book_id: { type: 'string', description: 'Target book ID (optional if a book is open).' },
        query: { type: 'string', description: 'Natural language query or keywords.' },
        limit: { type: 'number', description: 'Maximum results to return (default 10, max 30).' },
      },
    },
    execute: async (args, ctx) => {
      const resolved = resolveBookFromArgs(args, ctx);
      if (!resolved.ok) return resolved.error;
      const { book } = resolved;

      const query = readTrimmedString(args.query);
      const rawLimit = Number(args.limit);
      const limit =
        Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(30, Math.trunc(rawLimit)) : 10;

      const memories = query
        ? (await MemoryService.searchMemories(book.id, query, book.targetLanguage)).slice(0, limit)
        : await MemoryService.getRecentMemories(book.id, limit, 'lastAccessedAt', false);

      return {
        book_id: book.id,
        query,
        memories: memories.map((m) => ({
          id: m.id,
          summary: m.summary,
          content: m.content,
          updated_at: m.updatedAt ?? m.lastAccessedAt,
        })),
      };
    },
  },
  {
    name: 'upsert_memory',
    description: 'Create a new book memory or update an existing memory by memory_id.',
    category: 'worldbuilding',
    permission: 'translate_and_edit',
    readOnlyHint: false,
    requiresBookStore: true,
    inputSchema: {
      type: 'object',
      properties: {
        book_id: { type: 'string', description: 'Target book ID (optional if a book is open).' },
        memory_id: {
          type: 'string',
          description: 'Existing memory ID to update (omit to create new).',
        },
        summary: { type: 'string', description: 'Short summary of the plot point or world fact.' },
        content: { type: 'string', description: 'Detailed memory content.' },
      },
      required: ['summary', 'content'],
    },
    execute: async (args, ctx) => {
      const resolved = resolveBookFromArgs(args, ctx);
      if (!resolved.ok) return resolved.error;
      const { book } = resolved;

      const memoryId = readTrimmedString(args.memory_id);
      const summary = readTrimmedString(args.summary);
      const content = readTrimmedString(args.content);
      if (!summary || !content) {
        return agentMcpError('INVALID_ARGS', 'Both summary and content must be non-empty.');
      }

      if (memoryId) {
        const updated = await MemoryService.updateMemory(book.id, memoryId, content, summary);
        return { book_id: book.id, id: updated.id, action: 'updated', summary: updated.summary };
      }
      const created = await MemoryService.createMemory(book.id, content, summary);
      return { book_id: book.id, id: created.id, action: 'created', summary: created.summary };
    },
  },
  {
    name: 'get_special_instructions',
    description:
      'Read book-level and optional chapter-level translation, polish, and proofreading special instructions.',
    category: 'worldbuilding',
    permission: 'read_only',
    readOnlyHint: true,
    requiresBookStore: true,
    inputSchema: {
      type: 'object',
      properties: {
        book_id: { type: 'string', description: 'Target book ID (optional if a book is open).' },
        chapter_id: {
          type: 'string',
          description: 'Optional chapter ID to include chapter-level instructions.',
        },
      },
    },
    execute: (args, ctx) => {
      const resolved = resolveBookFromArgs(args, ctx);
      if (!resolved.ok) return resolved.error;
      const { book } = resolved;

      const chapterId = readTrimmedString(args.chapter_id);
      let chapterSection: Record<string, string> | undefined;
      if (chapterId) {
        const chapter = findChapterInBook(book, chapterId);
        if (!chapter) {
          return agentMcpError('CHAPTER_NOT_FOUND', `Chapter not found: ${chapterId}`);
        }
        chapterSection = {
          chapter_id: chapter.id,
          translation_instructions: chapter.translationInstructions ?? '',
          polish_instructions: chapter.polishInstructions ?? '',
          proofreading_instructions: chapter.proofreadingInstructions ?? '',
        };
      }

      return {
        book_id: book.id,
        book: {
          translation_instructions: book.translationInstructions ?? '',
          polish_instructions: book.polishInstructions ?? '',
          proofreading_instructions: book.proofreadingInstructions ?? '',
        },
        ...(chapterSection ? { chapter: chapterSection } : {}),
      };
    },
  },
  {
    name: 'update_special_instructions',
    description:
      'Update book-level (or chapter-level when chapter_id is provided) translation, polish, or proofreading special instructions.',
    category: 'worldbuilding',
    permission: 'translate_and_edit',
    readOnlyHint: false,
    requiresBookStore: true,
    inputSchema: {
      type: 'object',
      properties: {
        book_id: { type: 'string', description: 'Target book ID (optional if a book is open).' },
        chapter_id: {
          type: 'string',
          description:
            'Optional chapter ID; if provided, updates chapter-level instructions instead of book-level.',
        },
        translation_instructions: { type: 'string' },
        polish_instructions: { type: 'string' },
        proofreading_instructions: { type: 'string' },
      },
    },
    execute: async (args, ctx) => {
      const resolved = resolveBookFromArgs(args, ctx);
      if (!resolved.ok) return resolved.error;
      const { book, targetLanguage } = resolved;

      const { hasAny, patch } = buildSpecialInstructionPatch(args);
      if (!hasAny) {
        return agentMcpError(
          'INVALID_ARGS',
          'Provide at least one of translation_instructions, polish_instructions, or proofreading_instructions.',
        );
      }

      const booksStore = useBooksStore();
      const chapterId = readTrimmedString(args.chapter_id);
      if (chapterId) {
        const chapter = findChapterInBook(book, chapterId);
        if (!chapter) {
          return agentMcpError('CHAPTER_NOT_FOUND', `Chapter not found: ${chapterId}`);
        }
        await booksStore.editTitle(
          book.id,
          targetLanguage,
          {
            kind: 'chapter',
            id: chapter.id,
            expectedOriginal: titleOriginal(chapter.title),
            updates: patch,
          },
          targetLanguage,
        );
        return { book_id: book.id, scope: 'chapter', chapter_id: chapter.id, updated: true };
      }

      await booksStore.updateBook(book.id, patch);
      return { book_id: book.id, scope: 'book', updated: true };
    },
  },
];
