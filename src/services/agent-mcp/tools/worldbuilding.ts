import { withBuiltinGuidance } from './shared-descriptions';
import { matchByKeywords } from 'src/services/library-query/keyword-match';
import type { AppLocale } from 'src/models/locale';
import {
  getDataManagementRules,
  getMemoryWorkflowRules,
} from 'src/services/ai/tasks/prompts/common';
import { mergeInstructions } from 'src/services/ai/tools/special-instruction-tools';
import { describeTool, stringToolParameter } from 'src/services/ai/tools/tool-localization';
import type { Memory } from 'src/models/memory';
import type { CharacterSetting } from 'src/models/novel';
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
  FUZZY_PROPERTY,
  paginate,
  parseLimit,
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

type AliasInput = { id?: string; name: string; translation?: string };

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

/**
 * 算出要写入的别名列表。aliases 整体替换；append_aliases 在此基础上（没给 aliases 时
 * 在已有别名上）追加，名称已存在的改写它的译名。返回 undefined 表示别名不变。
 * 沿用的已有别名只带 id、不带译名，保留它在其他语言下的译名。
 */
function resolveAliasUpdate(
  existing: CharacterSetting | undefined,
  replace: Array<{ name: string; translation: string }> | undefined,
  append: Array<{ name: string; translation: string }> | undefined,
): AliasInput[] | undefined {
  if (!append || append.length === 0) return replace;
  const merged: AliasInput[] =
    replace ??
    (existing?.aliases ?? []).map((alias) => ({
      ...(alias.id ? { id: alias.id } : {}),
      name: alias.name,
    }));
  for (const alias of append) {
    const index = merged.findIndex((entry) => entry.name === alias.name);
    if (index >= 0) merged[index] = { ...merged[index]!, translation: alias.translation };
    else merged.push(alias);
  }
  return merged;
}

/** 解析出的条目：更新时 name、translation 都可以省略（保留原值），id 与 name 至少给一个 */
interface NamedEntityItem {
  rec: Record<string, unknown>;
  id: string;
  name: string;
  translation: string | undefined;
}

function parseNamedEntityItem(
  item: unknown,
): { ok: true; item: NamedEntityItem } | { ok: false; failure: UpsertItemResult } {
  if (!item || typeof item !== 'object') {
    return { ok: false, failure: { name: '', action: 'failed', error: 'Item must be an object.' } };
  }
  const rec = item as Record<string, unknown>;
  const id = readTrimmedString(rec.id);
  const name = readTrimmedString(rec.name);
  // 空字符串的译名按省略处理：清空译名没有意义，误传时也不会把译名抹掉
  const translation = readTrimmedString(rec.translation) || undefined;
  if (!id && !name) {
    return {
      ok: false,
      failure: { name, action: 'failed', error: 'Give id or name to identify the entry.' },
    };
  }
  return { ok: true, item: { rec, id, name, translation } };
}

/**
 * 找出要更新的已有条目。给了 id 就只按 id 找：按「id 或名称」一起找时，
 * 名称撞上排在前面的另一个条目，会把内容写到那个条目上。
 * id 找不到时返回 missingId，不退回按名称匹配。
 */
function findUpsertTarget<T extends { id: string; name: string }>(
  entries: readonly T[],
  id: string,
  name: string,
): { existing: T | undefined; missingId: boolean } {
  if (!id) return { existing: entries.find((entry) => entry.name === name), missingId: false };
  const existing = entries.find((entry) => entry.id === id);
  return { existing, missingId: !existing };
}

const missingIdFailure = (name: string, id: string): UpsertItemResult => ({
  name,
  action: 'failed',
  error: `No entry with id ${id}. Omit id to update by name or create a new entry.`,
});

/**
 * 新增或按补丁更新一个术语 / 角色：省略的字段保留原值。
 * 新建时名称与译名都必须给；更新时都可以省略。
 */
async function upsertNamedEntity<E extends { id: string; name: string }, F extends object>(
  item: unknown,
  options: {
    entries: () => readonly E[];
    /** 名称、译名以外要写入的字段（未传的字段不出现） */
    fields: (rec: Record<string, unknown>, existing: E | undefined) => F;
    update: (
      existing: E,
      payload: { name?: string; translation?: string } & F,
    ) => Promise<{ id: string; name: string }>;
    create: (payload: { name: string; translation: string } & F) => Promise<{
      id: string;
      name: string;
    }>;
  },
): Promise<UpsertItemResult> {
  const parsed = parseNamedEntityItem(item);
  if (!parsed.ok) return parsed.failure;
  const { rec, id, name, translation } = parsed.item;

  try {
    const { existing, missingId } = findUpsertTarget(options.entries(), id, name);
    if (missingId) return missingIdFailure(name, id);
    const fields = options.fields(rec, existing);
    if (existing) {
      const updated = await options.update(existing, {
        ...(name ? { name } : {}),
        ...(translation !== undefined ? { translation } : {}),
        ...fields,
      });
      return { id: updated.id, name: updated.name, action: 'updated' };
    }
    if (!name || translation === undefined) {
      return {
        name,
        action: 'failed',
        error: 'No existing entry matched: both name and translation are required to create one.',
      };
    }
    const created = await options.create({ name, translation, ...fields });
    return { id: created.id, name: created.name, action: 'created' };
  } catch (error) {
    return {
      name,
      action: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function upsertSingleTerm(
  bookId: string,
  language: AppLocale,
  item: unknown,
): Promise<UpsertItemResult> {
  return upsertNamedEntity(item, {
    entries: () => useBooksStore().getBookById(bookId)?.terminologies ?? [],
    fields: (rec) => {
      const description = readOptionalTrimmedString(rec.description);
      return description !== undefined ? { description } : {};
    },
    update: (existing, payload) =>
      TerminologyService.updateTerminology(bookId, existing.id, payload, language),
    create: (payload) => TerminologyService.addTerminology(bookId, payload, language),
  });
}

function upsertSingleCharacter(
  bookId: string,
  language: AppLocale,
  item: unknown,
): Promise<UpsertItemResult> {
  return upsertNamedEntity(item, {
    entries: () => useBooksStore().getBookById(bookId)?.characterSettings ?? [],
    fields: (rec, existing: CharacterSetting | undefined) => {
      const sex = parseSex(rec.sex);
      const description = readOptionalTrimmedString(rec.description);
      const speakingStyle = readOptionalTrimmedString(rec.speaking_style);
      const aliases = resolveAliasUpdate(
        existing,
        parseAliases(rec.aliases),
        parseAliases(rec.append_aliases),
      );
      return {
        ...(sex !== undefined ? { sex } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(speakingStyle !== undefined ? { speakingStyle } : {}),
        ...(aliases !== undefined ? { aliases } : {}),
      };
    },
    update: (existing, payload) =>
      CharacterSettingService.updateCharacterSetting(bookId, existing.id, payload, language),
    create: (payload) => CharacterSettingService.addCharacterSetting(bookId, payload, language),
  });
}

/** upsert_terms / upsert_characters 共用的补丁语义说明 */
const UPSERT_PATCH_NOTE =
  'Updates are patches: fields you omit keep their stored values, so to change one field send only the id (or exact name) and that field; an empty string clears description or speaking_style. Creating a new entry needs both name and translation.';

/** 参数名与书籍 / 章节上的字段 */
const INSTRUCTION_ARG_FIELDS = [
  ['translation_instructions', 'translationInstructions'],
  ['polish_instructions', 'polishInstructions'],
  ['proofreading_instructions', 'proofreadingInstructions'],
] as const;

type InstructionField = (typeof INSTRUCTION_ARG_FIELDS)[number][1];
type InstructionMode = 'append' | 'replace';

/** 不传 mode 时整体替换（与加入 mode 之前的行为一致）；不认识的值返回 null */
function parseInstructionMode(raw: unknown): InstructionMode | null {
  if (raw === undefined) return 'replace';
  return raw === 'append' || raw === 'replace' ? raw : null;
}

/**
 * 按写入方式算出要写入的字段。replace 时空字符串表示清除；append 时空内容记为 emptyAppend，
 * 由调用方报错，避免什么也没追加却回报成功。
 */
function buildSpecialInstructionPatch(
  args: Record<string, unknown>,
  current: Partial<Record<InstructionField, string | undefined>>,
  mode: InstructionMode,
) {
  const patch: Partial<Record<InstructionField, string | undefined>> = {};
  const written: Record<string, string> = {};
  let hasAny = false;
  let emptyAppend = false;
  for (const [argKey, field] of INSTRUCTION_ARG_FIELDS) {
    const value = args[argKey];
    if (typeof value !== 'string') continue;
    hasAny = true;
    if (mode === 'append' && !value.trim()) {
      emptyAppend = true;
      continue;
    }
    const next = mergeInstructions(current[field] ?? '', value, mode);
    patch[field] = next || undefined;
    written[argKey] = next;
  }
  return { hasAny, emptyAppend, patch, written };
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

/** 设定很多的书一次列出全部会很大：支持分页，精简输出只保留翻译时认名字需要的字段 */
const LIST_PAGING_PROPERTIES = {
  fuzzy: FUZZY_PROPERTY,
  limit: {
    type: 'number',
    description: 'Maximum entries to return (default: all, max 500).',
  },
  offset: {
    type: 'number',
    description: 'Number of entries to skip; pass next_offset from the previous call.',
  },
  compact: {
    type: 'boolean',
    description:
      'Return only id, name, translation (and aliases for characters), without descriptions. Use for large books.',
  },
};

function executeListEntity<T extends object>(
  args: Record<string, unknown>,
  ctx: AgentMcpExecutionContext,
  resultKey: 'terms' | 'characters',
  compactKeys: ReadonlyArray<keyof T>,
  listItems: (
    book: NonNullable<ReturnType<ReturnType<typeof useBooksStore>['getBookById']>>,
    language: AppLocale,
  ) => T[],
  /** 每个条目参与关键词匹配的文字 */
  searchTexts: (item: T) => string[],
) {
  const resolved = resolveBookFromArgs(args, ctx);
  if (!resolved.ok) return resolved.error;
  const { book, targetLanguage } = resolved;
  const keyword = readTrimmedString(args.keyword);
  // 与站内工具共用同一套匹配：精确保持原有顺序，模糊按接近程度排序
  const matched = matchByKeywords(listItems(book, targetLanguage), searchTexts, [keyword], {
    fuzzy: args.fuzzy === true,
  });
  const { page, ...paging } = paginate(matched, args, { defaultLimit: null, maxLimit: 500 });
  const entries =
    args.compact === true
      ? page.map((item) => Object.fromEntries(compactKeys.map((key) => [key, item[key]])))
      : page;
  return {
    book_id: book.id,
    target_language: targetLanguage,
    ...paging,
    [resultKey]: entries,
  };
}

export const agentMcpWorldbuildingTools: AgentMcpToolSpec[] = [
  {
    name: 'list_terms',
    description:
      'List or keyword-filter terminology entries for a book. For books with many entries, use limit/offset and compact=true.',
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
        ...LIST_PAGING_PROPERTIES,
      },
    },
    execute: (args, ctx) =>
      executeListEntity(
        args,
        ctx,
        'terms',
        ['id', 'name', 'translation'],
        (book, language) =>
          (book.terminologies ?? []).map((term) => formatTermSummary(term, language)),
        (term) => [term.name, term.translation, term.description],
      ),
  },
  {
    name: 'upsert_terms',
    // 何时该建术语、每个术语只留一个译名等要求，取自站内 create_term 的同一份说明
    description: withBuiltinGuidance(
      'upsert_terms',
      `Batch-create or idempotently update terminology entries (matched by id or exact name). ${UPSERT_PATCH_NOTE}`,
    ),
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
          description:
            'Terminology items to create or update. Give id or name; omitted fields are kept.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Existing term ID (omit to match by name).' },
              name: stringToolParameter('create_term.parameters.properties.name'),
              translation: stringToolParameter('create_term.parameters.properties.translation'),
              description: stringToolParameter('create_term.parameters.properties.description'),
            },
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
      'List or keyword-filter character settings (including aliases and speaking style) for a book. For books with many entries, use limit/offset and compact=true.',
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
        ...LIST_PAGING_PROPERTIES,
      },
    },
    execute: (args, ctx) =>
      executeListEntity(
        args,
        ctx,
        'characters',
        ['id', 'name', 'translation', 'aliases'],
        (book, language) =>
          (book.characterSettings ?? []).map((char) => formatCharacterSummary(char, language)),
        (char) => [
          char.name,
          char.translation,
          char.description,
          ...char.aliases.flatMap((alias) => [alias.name, alias.translation]),
        ],
      ),
  },
  {
    name: 'upsert_characters',
    // 术语与角色如何分工、全名与别名怎么放等要求，取自站内的数据管理规则
    description: `Batch-create or idempotently update character settings (matched by id or exact name). ${UPSERT_PATCH_NOTE} aliases replaces the whole alias list; append_aliases adds aliases (or retranslates one with the same name) and keeps the rest. ${getDataManagementRules('external')}`,
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
          description:
            'Character items to create or update. Give id or name; omitted fields are kept.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Existing character ID (omit to match by name).' },
              name: stringToolParameter('create_character.parameters.properties.name'),
              translation: stringToolParameter(
                'create_character.parameters.properties.translation',
              ),
              sex: {
                type: 'string',
                enum: ['male', 'female', 'other'],
                description: describeTool('create_character.parameters.properties.sex'),
              },
              description: stringToolParameter(
                'create_character.parameters.properties.description',
              ),
              speaking_style: stringToolParameter(
                'create_character.parameters.properties.speaking_style',
              ),
              aliases: {
                type: 'array',
                description: describeTool('create_character.parameters.properties.aliases'),
                items: {
                  type: 'object',
                  properties: {
                    name: stringToolParameter(
                      'create_character.parameters.properties.aliases.items.properties.name',
                    ),
                    translation: stringToolParameter(
                      'create_character.parameters.properties.aliases.items.properties.translation',
                    ),
                  },
                  required: ['name', 'translation'],
                },
              },
              append_aliases: {
                type: 'array',
                description:
                  'Aliases to add while keeping the existing ones; an alias whose name already exists gets the new translation. Use this instead of aliases to add a nickname or form of address found during review.',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Alias as written in the source text.' },
                    translation: { type: 'string', description: 'Translation of the alias.' },
                  },
                  required: ['name', 'translation'],
                },
              },
            },
          },
        },
      },
      required: ['characters'],
    },
    execute: (args, ctx) => executeUpsertBatch(args, ctx, 'characters', upsertSingleCharacter),
  },
  {
    name: 'search_memories',
    description: withBuiltinGuidance(
      'search_memories',
      'Search book memories using Tsukuyomi hybrid semantic + keyword retrieval, ranked by relevance with a score per result (or list recent memories when query is omitted). Returns every memory with some match, best first; judge relevance from the score and content.',
    ),
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
      const limit = parseLimit(args.limit, 10, 30);
      const describe = (m: Memory) => ({
        id: m.id,
        summary: m.summary,
        content: m.content,
        updated_at: m.updatedAt ?? m.lastAccessedAt,
      });

      if (!query) {
        const recent = await MemoryService.getRecentMemories(
          book.id,
          limit,
          'lastAccessedAt',
          false,
        );
        return { book_id: book.id, query, memories: recent.map(describe) };
      }
      // 主动搜索由 Agent 自己判断相关性：按分数排序返回，不套用翻译注入时的严格阈值
      const scored = await MemoryService.searchMemoriesWithScores(
        book.id,
        query,
        limit,
        book.targetLanguage ?? 'zh-CN',
        { ranked: true },
      );
      return {
        book_id: book.id,
        query,
        memories: scored.map(({ memory, breakdown }) => ({
          ...describe(memory),
          score: Math.round(breakdown.total * 1000) / 1000,
        })),
      };
    },
  },
  {
    name: 'upsert_memory',
    // 记忆只记可复用的翻译决定、不记剧情等要求，取自站内的记忆管理规则
    description: `Create a new book memory or update an existing memory by memory_id. ${getMemoryWorkflowRules('external')}`,
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
        summary: stringToolParameter('create_memory.parameters.properties.summary'),
        content: stringToolParameter('create_memory.parameters.properties.content'),
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

      const includeContent = args.include_content === true;
      // 按创建时间从新到旧，同一时刻按 ID 排，保证翻页顺序稳定
      const all = (await MemoryService.getAllMemories(book.id)).sort(
        (a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id),
      );
      const { page, ...paging } = paginate(all, args, { defaultLimit: 50, maxLimit: 200 });
      return {
        book_id: book.id,
        ...paging,
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
    description: withBuiltinGuidance(
      'delete_terms',
      'Delete terminology entries by ID (get IDs from list_terms). Existing translations are not changed. Confirm with the user before deleting.',
    ),
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
    description: withBuiltinGuidance(
      'delete_memories',
      'Delete book memories by ID (get IDs from list_memories or search_memories). Confirm with the user before deleting.',
    ),
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
    description: withBuiltinGuidance(
      'get_special_instructions',
      'Read book-level and optional chapter-level translation, polish, and proofreading special instructions.',
    ),
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
    description: withBuiltinGuidance(
      'update_special_instructions',
      'Update book-level (or chapter-level when chapter_id is provided) translation, polish, or proofreading special instructions. Each given field is replaced by default; pass mode "append" to add a rule after the existing ones. The response returns the full text now stored for each field written.',
    ),
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
        mode: {
          type: 'string',
          enum: ['append', 'replace'],
          description:
            "replace (default) overwrites each given field with the new text (an empty string clears it); append adds the new text as a new line after that field's existing instructions, keeping them.",
        },
      },
    },
    execute: async (args, ctx) => {
      const resolved = resolveBookFromArgs(args, ctx);
      if (!resolved.ok) return resolved.error;
      const { book, targetLanguage } = resolved;

      const mode = parseInstructionMode(args.mode);
      if (!mode) {
        return agentMcpError('INVALID_ARGS', 'mode must be "append" or "replace".');
      }
      const chapterId = readTrimmedString(args.chapter_id);
      const chapter = chapterId ? findChapterInBook(book, chapterId) : null;
      if (chapterId && !chapter) {
        return agentMcpError('CHAPTER_NOT_FOUND', `Chapter not found: ${chapterId}`);
      }

      const { hasAny, emptyAppend, patch, written } = buildSpecialInstructionPatch(
        args,
        chapter ?? book,
        mode,
      );
      if (!hasAny) {
        return agentMcpError(
          'INVALID_ARGS',
          'Provide at least one of translation_instructions, polish_instructions, or proofreading_instructions.',
        );
      }
      if (emptyAppend) {
        return agentMcpError('INVALID_ARGS', 'mode "append" needs non-empty instructions.');
      }

      const booksStore = useBooksStore();
      if (chapter) {
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
        return {
          book_id: book.id,
          scope: 'chapter',
          chapter_id: chapter.id,
          mode,
          instructions: written,
          updated: true,
        };
      }

      await booksStore.updateBook(book.id, patch);
      return { book_id: book.id, scope: 'book', mode, instructions: written, updated: true };
    },
  },
];
