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
  parseLimit,
  parseNonNegativeInt,
  readOptionalTrimmedString,
  readStringList,
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

interface DeleteItemResult {
  id: string;
  name?: string;
  action: 'deleted' | 'not_found' | 'failed';
  error?: string;
}

/**
 * 按 ID 批量删除：逐项查找并删除，找不到或删除失败的逐项报告，不影响其余项。
 * lookup 返回待删条目的显示名；返回 null 表示不存在。
 */
async function executeDeleteBatch(
  args: Record<string, unknown>,
  ctx: AgentMcpExecutionContext,
  idsKey: 'term_ids' | 'character_ids' | 'memory_ids',
  prepare: (bookId: string) => Promise<{
    lookup: (id: string) => string | null;
    remove: (id: string) => Promise<void>;
  }>,
) {
  const resolved = resolveBookFromArgs(args, ctx);
  if (!resolved.ok) return resolved.error;
  const ids = readStringList(args[idsKey]);
  if (ids.length === 0) {
    return agentMcpError('INVALID_ARGS', `${idsKey} must be a non-empty array of IDs.`);
  }

  const bookId = resolved.book.id;
  const { lookup, remove } = await prepare(bookId);
  const results: DeleteItemResult[] = [];
  for (const id of ids) {
    const name = lookup(id);
    if (name === null) {
      results.push({ id, action: 'not_found' });
      continue;
    }
    try {
      await remove(id);
      results.push({ id, name, action: 'deleted' });
    } catch (error) {
      results.push({
        id,
        name,
        action: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    book_id: bookId,
    deleted_count: results.filter((item) => item.action === 'deleted').length,
    results,
  };
}

/** 术语、角色都挂在书上：每次删除前从书库里取最新的一份来查找 */
function namedEntityLookup(
  bookId: string,
  kind: 'terminologies' | 'characterSettings',
): (id: string) => string | null {
  return (id) => {
    const book = useBooksStore().getBookById(bookId);
    return (book?.[kind] ?? []).find((entity) => entity.id === id)?.name ?? null;
  };
}

function deleteIdsSchema(idsKey: string, noun: string) {
  return {
    type: 'object' as const,
    properties: {
      book_id: { type: 'string', description: 'Target book ID (optional if a book is open).' },
      [idsKey]: {
        type: 'array',
        items: { type: 'string' },
        description: `IDs of the ${noun} to delete.`,
      },
    },
    required: [idsKey],
  };
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
    name: 'list_memories',
    description:
      'List all memories of a book page by page (newest first), with summaries and optionally full content. Use search_memories to find memories about a topic; use this to review or clean up everything.',
    category: 'worldbuilding',
    permission: 'read_only',
    readOnlyHint: true,
    requiresBookStore: true,
    inputSchema: {
      type: 'object',
      properties: {
        book_id: { type: 'string', description: 'Target book ID (optional if a book is open).' },
        limit: { type: 'number', description: 'Maximum memories to return (default 50, max 200).' },
        offset: {
          type: 'number',
          description: 'Number of memories to skip; pass next_offset from the previous call.',
        },
        include_content: {
          type: 'boolean',
          description: 'Include the full content of each memory (default false: summaries only).',
        },
      },
    },
    execute: async (args, ctx) => {
      const resolved = resolveBookFromArgs(args, ctx);
      if (!resolved.ok) return resolved.error;
      const { book } = resolved;

      const limit = parseLimit(args.limit, 50, 200);
      const offset = parseNonNegativeInt(args.offset, 0);
      const includeContent = args.include_content === true;
      // 按创建时间从新到旧，同一时刻按 ID 排，保证翻页顺序稳定
      const all = (await MemoryService.getAllMemories(book.id)).sort(
        (a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id),
      );
      const page = all.slice(offset, offset + limit);
      const hasMore = offset + page.length < all.length;
      return {
        book_id: book.id,
        total: all.length,
        has_more: hasMore,
        next_offset: hasMore ? offset + page.length : null,
        memories: page.map((m) => ({
          id: m.id,
          summary: m.summary,
          ...(includeContent ? { content: m.content } : {}),
          created_at: m.createdAt,
          updated_at: m.updatedAt ?? m.lastAccessedAt,
        })),
      };
    },
  },
  {
    name: 'delete_terms',
    description:
      'Delete terminology entries by ID (get IDs from list_terms). Existing translations are not changed. Confirm with the user before deleting.',
    category: 'worldbuilding',
    permission: 'translate_and_edit',
    readOnlyHint: false,
    requiresBookStore: true,
    inputSchema: deleteIdsSchema('term_ids', 'terms'),
    execute: (args, ctx) =>
      executeDeleteBatch(args, ctx, 'term_ids', (bookId) =>
        Promise.resolve({
          lookup: namedEntityLookup(bookId, 'terminologies'),
          remove: (id) => TerminologyService.deleteTerminology(bookId, id),
        }),
      ),
  },
  {
    name: 'delete_characters',
    description:
      'Delete character settings by ID (get IDs from list_characters). Existing translations are not changed. Confirm with the user before deleting.',
    category: 'worldbuilding',
    permission: 'translate_and_edit',
    readOnlyHint: false,
    requiresBookStore: true,
    inputSchema: deleteIdsSchema('character_ids', 'characters'),
    execute: (args, ctx) =>
      executeDeleteBatch(args, ctx, 'character_ids', (bookId) =>
        Promise.resolve({
          lookup: namedEntityLookup(bookId, 'characterSettings'),
          remove: (id) => CharacterSettingService.deleteCharacterSetting(bookId, id),
        }),
      ),
  },
  {
    name: 'delete_memories',
    description:
      'Delete book memories by ID (get IDs from list_memories or search_memories). Confirm with the user before deleting.',
    category: 'worldbuilding',
    permission: 'translate_and_edit',
    readOnlyHint: false,
    requiresBookStore: true,
    inputSchema: deleteIdsSchema('memory_ids', 'memories'),
    execute: (args, ctx) =>
      executeDeleteBatch(args, ctx, 'memory_ids', async (bookId) => {
        const summaries = new Map(
          (await MemoryService.getAllMemories(bookId)).map((m) => [m.id, m.summary]),
        );
        return {
          lookup: (id) => summaries.get(id) ?? null,
          remove: (id) => MemoryService.deleteMemory(bookId, id),
        };
      }),
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
