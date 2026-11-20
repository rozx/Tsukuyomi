import {
  moveChapters,
  moveChaptersParameters,
  readMoveChaptersRequest,
  type MoveChaptersFailureCode,
} from 'src/services/library-structure/move-chapters';
import { describeTool } from 'src/services/ai/tools/tool-localization';
import { withBuiltinGuidance } from './shared-descriptions';
import { v4 } from 'uuid';
import type { AppLocale } from 'src/models/locale';
import { isAppLocale } from 'src/models/locale';
import type { Chapter, Novel, Volume } from 'src/models/novel';
import { getLanguageTranslation, getNameTranslation } from 'src/services/localization/selection';
import { titleOriginal } from 'src/services/localization/title-edit';
import { scanChapters } from 'src/services/library-query/paragraph-scan';
import { useBooksStore } from 'src/stores/books';
import { generateShortId } from 'src/utils/id-generator';
import { agentMcpError, type AgentMcpToolSpec } from '../types';
import {
  parseNonNegativeInt,
  readStringList,
  readTrimmedString,
  resolveBookFromArgs,
} from './helpers';
import {
  countChaptersInVolumes,
  createEmptyVolume,
  linesToParagraphs,
  readSourceUrl,
  textToParagraphs,
} from './library-helpers';
import { importBookFromUrlTool } from './url-import';

interface ChapterInput {
  title: string;
  text?: string;
  paragraphs?: string[];
  web_url?: string;
}

function formatTitle(
  title: Volume['title'] | Chapter['title'],
  language: AppLocale,
): { original: string; translation: string } {
  if (typeof title === 'string') {
    return { original: title, translation: '' };
  }
  return {
    original: title.original,
    translation: getNameTranslation(title, language)?.translation ?? '',
  };
}

const INVALID_WEB_URL_MESSAGE = 'web_url must be an http or https URL.';

/** 解析章节列表；格式不对时返回 null，章节的 web_url 不是 http(s) 网址时返回 'invalid_url' */
function parseChapterInputs(raw: unknown): ChapterInput[] | null | 'invalid_url' {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const result: ChapterInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const rec = item as Record<string, unknown>;
    const title = readTrimmedString(rec.title);
    if (!title) return null;
    // 空字符串是空行，与站内导入一样保留
    const paragraphs = Array.isArray(rec.paragraphs)
      ? rec.paragraphs.filter((p): p is string => typeof p === 'string')
      : undefined;
    const text = typeof rec.text === 'string' ? rec.text : undefined;
    if (!paragraphs && text === undefined) return null;
    const webUrl = readSourceUrl(rec.web_url);
    if (!webUrl.ok) return 'invalid_url';
    result.push({
      title,
      ...(text !== undefined ? { text } : {}),
      ...(paragraphs ? { paragraphs } : {}),
      ...(webUrl.url ? { web_url: webUrl.url } : {}),
    });
  }
  return result;
}

function buildChapterEntity(input: ChapterInput, now: Date): Chapter {
  const content =
    input.paragraphs && input.paragraphs.length > 0
      ? linesToParagraphs(input.paragraphs)
      : textToParagraphs(input.text ?? '');
  return {
    id: generateShortId(),
    title: {
      original: input.title,
      translation: { id: generateShortId(), translation: '', aiModelId: '' },
    },
    ...(input.web_url ? { webUrl: input.web_url } : {}),
    content,
    contentLoaded: true,
    createdAt: now,
    lastEdited: now,
  };
}

const MOVE_CHAPTERS_ERRORS: Record<MoveChaptersFailureCode, string> = {
  BOOK_NOT_FOUND: 'Book not found.',
  CHAPTER_IDS_REQUIRED: 'chapter_ids must be a non-empty array of chapter IDs.',
  CHAPTER_NOT_FOUND: 'A chapter in chapter_ids does not exist in this book.',
  DUPLICATE_CHAPTER: 'chapter_ids contains the same chapter more than once.',
  VOLUME_NOT_FOUND: 'target_volume_id does not exist in this book.',
  ANCHOR_NOT_FOUND: 'The chapter given in before_chapter_id / after_chapter_id does not exist.',
  ANCHOR_IS_MOVED: 'A chapter being moved cannot be used as before_chapter_id / after_chapter_id.',
  TARGET_CONFLICT:
    'Conflicting positioning: use only one of before_chapter_id, after_chapter_id and new_volume_title, and target_volume_id must be the volume of the positioning chapter.',
  TARGET_REQUIRED:
    'The chapters come from different volumes: say where they go with target_volume_id, before_chapter_id, after_chapter_id or new_volume_title.',
};

/** 决定 get_book 要列出哪些章节：可限定某一卷、只取末尾若干章，或完全不列 */
function selectListedChapters(
  volumes: readonly Volume[],
  options: { volumeId: string; recentCount: number; includeChapters: boolean },
): Set<string> {
  if (!options.includeChapters) return new Set();
  const ids = volumes
    .filter((vol) => !options.volumeId || vol.id === options.volumeId)
    .flatMap((vol) => (vol.chapters ?? []).map((ch) => ch.id));
  return new Set(options.recentCount > 0 ? ids.slice(-options.recentCount) : ids);
}

/** 各章的段落数与已译段落数（空段落不计）；正文不在内存里的章节分批读取 */
async function countChapterStats(chapters: readonly Chapter[], language: AppLocale) {
  const stats = new Map<string, { paragraph_count: number; translated_count: number }>();
  for await (const { chapter, paragraphs } of scanChapters(chapters)) {
    const nonEmpty = paragraphs.filter((p) => p.text.trim().length > 0);
    stats.set(chapter.id, {
      paragraph_count: nonEmpty.length,
      translated_count: nonEmpty.filter((p) =>
        Boolean(getLanguageTranslation(p, language)?.translation.trim()),
      ).length,
    });
  }
  return stats;
}

type ChapterStats = Awaited<ReturnType<typeof countChapterStats>>;

/**
 * 一卷的翻译进度：已译完、译了一部分、还没开始的章节数，以及按顺序第一个没译完的章节。
 * 没有正文的章节不计入任何一类。
 */
function summarizeVolumeProgress(volume: Volume, stats: ChapterStats) {
  let translated = 0;
  let inProgress = 0;
  let untranslated = 0;
  let firstUntranslated: { chapter_id: string; title_original: string } | null = null;
  for (const ch of volume.chapters ?? []) {
    const stat = stats.get(ch.id);
    if (!stat || stat.paragraph_count === 0) continue;
    if (stat.translated_count >= stat.paragraph_count) {
      translated += 1;
      continue;
    }
    if (stat.translated_count > 0) inProgress += 1;
    else untranslated += 1;
    firstUntranslated ??= { chapter_id: ch.id, title_original: titleOriginal(ch.title) };
  }
  return {
    translated_chapter_count: translated,
    in_progress_chapter_count: inProgress,
    untranslated_chapter_count: untranslated,
    first_untranslated_chapter: firstUntranslated,
  };
}

/**
 * 从参数里取出要修改的书籍信息。只包含调用方传入的字段；
 * 空字符串或空数组表示清空该字段。
 */
function buildBookInfoPatch(args: Record<string, unknown>): {
  updates: Partial<Novel>;
  updatedFields: string[];
} {
  const updates: Partial<Novel> = {};
  const updatedFields: string[] = [];
  if (typeof args.author === 'string') {
    updates.author = args.author.trim() || undefined;
    updatedFields.push('author');
  }
  if (typeof args.description === 'string') {
    updates.description = args.description.trim() || undefined;
    updatedFields.push('description');
  }
  if (Array.isArray(args.tags)) {
    const tags = readStringList(args.tags);
    updates.tags = tags.length > 0 ? tags : undefined;
    updatedFields.push('tags');
  }
  if (Array.isArray(args.alternate_titles)) {
    const titles = readStringList(args.alternate_titles);
    updates.alternateTitles = titles.length > 0 ? titles : undefined;
    updatedFields.push('alternate_titles');
  }
  return { updates, updatedFields };
}

export const agentMcpLibraryTools: AgentMcpToolSpec[] = [
  {
    name: 'list_books',
    description:
      'List all books in the local Tsukuyomi library with ID, title, author, target language, volume/chapter counts, and tags.',
    category: 'library',
    permission: 'read_only',
    readOnlyHint: true,
    requiresBookStore: true,
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute: () => {
      const booksStore = useBooksStore();
      return {
        books: booksStore.books.map((book) => ({
          id: book.id,
          title: book.title,
          author: book.author ?? '',
          target_language: book.targetLanguage ?? 'zh-CN',
          tags: book.tags ?? [],
          starred: Boolean(book.starred),
          volume_count: book.volumes?.length ?? 0,
          chapter_count: countChaptersInVolumes(book.volumes),
          term_count: book.terminologies?.length ?? 0,
          character_count: book.characterSettings?.length ?? 0,
          last_edited: book.lastEdited?.toISOString?.() ?? String(book.lastEdited),
        })),
      };
    },
  },
  {
    name: 'get_book',
    description:
      'Get metadata, volumes, chapters, and per-chapter translation progress for a book. Each volume also reports translated_chapter_count, in_progress_chapter_count, untranslated_chapter_count (chapters without text are not counted) and first_untranslated_chapter, so include_chapters=false is enough to see where translation stands. For long books, narrow the chapter list with recent_chapters (only the latest N chapters), volume_id (one volume), or include_chapters=false (volume outline only) instead of fetching the whole table of contents.',
    category: 'library',
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
        volume_id: {
          type: 'string',
          description: 'Only list the chapters of this volume (other volumes are summarized).',
        },
        recent_chapters: {
          type: 'number',
          description: 'Only list the last N chapters of the book (or of volume_id when given).',
        },
        include_chapters: {
          type: 'boolean',
          description:
            'Set false to return only the volume outline with chapter counts (default true).',
        },
        include_chapter_stats: {
          type: 'boolean',
          description:
            'Whether to compute paragraph/translated counts for each listed chapter and the per-volume progress (default true). This reads every chapter of the book; set false for a fast structure-only listing.',
        },
        include_urls: {
          type: 'boolean',
          description: 'Include each listed chapter source web_url (default false).',
        },
        include_description: {
          type: 'boolean',
          description:
            'Set false to leave out the book synopsis, which can be long (default true).',
        },
      },
    },
    execute: async (args, ctx) => {
      const bookRes = resolveBookFromArgs(args, ctx);
      if (!bookRes.ok) return bookRes.error;
      const { book, targetLanguage } = bookRes;
      const volumes = book.volumes ?? [];

      const volumeId = readTrimmedString(args.volume_id);
      if (volumeId && !volumes.some((vol) => vol.id === volumeId)) {
        return agentMcpError('VOLUME_NOT_FOUND', `Volume not found: ${volumeId}`);
      }
      const listed = selectListedChapters(volumes, {
        volumeId,
        recentCount: parseNonNegativeInt(args.recent_chapters, 0),
        includeChapters: args.include_chapters !== false,
      });
      const includeStats = args.include_chapter_stats !== false;
      const includeUrls = args.include_urls === true;
      // 进度统计要读正文：分批读取，长篇不必一章一章单独读。
      // 各卷的进度按整卷统计，所以即使只列出部分章节也要读全书
      const stats = includeStats
        ? await countChapterStats(
            volumes.flatMap((vol) => vol.chapters ?? []),
            targetLanguage,
          )
        : null;

      const formattedVolumes = [];
      for (const vol of volumes) {
        const formattedChapters = [];
        for (const ch of vol.chapters ?? []) {
          if (!listed.has(ch.id)) continue;
          const chTitle = formatTitle(ch.title, targetLanguage);
          formattedChapters.push({
            id: ch.id,
            title_original: chTitle.original,
            title_translation: chTitle.translation,
            ...(stats?.get(ch.id) ?? {}),
            ...(includeUrls && ch.webUrl ? { web_url: ch.webUrl } : {}),
          });
        }
        const volTitle = formatTitle(vol.title, targetLanguage);
        formattedVolumes.push({
          id: vol.id,
          title_original: volTitle.original,
          title_translation: volTitle.translation,
          chapter_count: vol.chapters?.length ?? 0,
          ...(stats ? summarizeVolumeProgress(vol, stats) : {}),
          // 没有列出章节的卷只给概览，不带空的 chapters 数组
          ...(args.include_chapters !== false ? { chapters: formattedChapters } : {}),
        });
      }

      return {
        id: book.id,
        title: book.title,
        author: book.author ?? '',
        ...(args.include_description !== false ? { description: book.description ?? '' } : {}),
        tags: book.tags ?? [],
        alternate_titles: book.alternateTitles ?? [],
        target_language: targetLanguage,
        enable_original_text_validation: Boolean(book.enableOriginalTextValidation),
        translation_chunk_size: book.translationChunkSize ?? null,
        volume_count: formattedVolumes.length,
        chapter_count: countChaptersInVolumes(volumes),
        returned_chapter_count: listed.size,
        volumes: formattedVolumes,
      };
    },
  },
  {
    name: 'create_book',
    description:
      'Create a new novel in the local Tsukuyomi library with metadata and optional initial chapters.',
    category: 'library',
    permission: 'translate_and_edit',
    readOnlyHint: false,
    requiresBookStore: true,
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Book title.' },
        author: { type: 'string', description: 'Author name.' },
        description: { type: 'string', description: 'Book synopsis.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags.' },
        target_language: {
          type: 'string',
          enum: ['zh-CN', 'zh-TW', 'en-US'],
          description: 'Target translation language (default zh-CN).',
        },
        web_url: { type: 'string', description: 'Optional source URL (http or https).' },
        volume_title: {
          type: 'string',
          description: 'Optional initial volume title when providing chapters.',
        },
        chapters: {
          type: 'array',
          description: 'Optional initial chapters to create immediately.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              text: { type: 'string' },
              paragraphs: { type: 'array', items: { type: 'string' } },
              web_url: { type: 'string' },
            },
            required: ['title'],
          },
        },
      },
      required: ['title'],
    },
    execute: async (args) => {
      const title = readTrimmedString(args.title);
      if (!title) {
        return agentMcpError('INVALID_ARGS', 'Book title must be a non-empty string.');
      }
      const webUrl = readSourceUrl(args.web_url);
      if (!webUrl.ok) return agentMcpError('INVALID_ARGS', INVALID_WEB_URL_MESSAGE);

      const rawLang = typeof args.target_language === 'string' ? args.target_language : 'zh-CN';
      const targetLanguage: AppLocale = isAppLocale(rawLang) ? rawLang : 'zh-CN';
      const now = new Date();
      const volumes: Volume[] = [];

      if (args.chapters !== undefined) {
        const parsed = parseChapterInputs(args.chapters);
        if (parsed === 'invalid_url') return agentMcpError('INVALID_ARGS', INVALID_WEB_URL_MESSAGE);
        if (!parsed) {
          return agentMcpError(
            'INVALID_ARGS',
            'Each chapter must include a non-empty title and either text or paragraphs.',
          );
        }
        volumes.push(
          createEmptyVolume(
            readTrimmedString(args.volume_title),
            parsed.map((ch) => buildChapterEntity(ch, now)),
          ),
        );
      }

      const book: Novel = {
        id: v4(),
        title,
        author: readTrimmedString(args.author) || undefined,
        description: readTrimmedString(args.description) || undefined,
        tags: Array.isArray(args.tags)
          ? args.tags
              .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
              .map((t) => t.trim())
          : undefined,
        webUrl: webUrl.url ? [webUrl.url] : undefined,
        targetLanguage,
        volumes,
        terminologies: [],
        characterSettings: [],
        createdAt: now,
        lastEdited: now,
      };

      await useBooksStore().addBook(book);

      return {
        book_id: book.id,
        title: book.title,
        target_language: targetLanguage,
        volume_count: volumes.length,
        chapter_count: countChaptersInVolumes(volumes),
      };
    },
  },
  {
    name: 'add_chapters',
    description:
      'Batch-add chapters (from plain text or paragraph arrays) to an existing volume or a newly created volume in a book.',
    category: 'library',
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
        volume_id: {
          type: 'string',
          description: 'Existing volume ID to append chapters to.',
        },
        volume_title: {
          type: 'string',
          description:
            'Volume title to match or create if volume_id is omitted (defaults to last existing volume or localized default volume title).',
        },
        chapters: {
          type: 'array',
          description: 'Ordered chapters to add.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              text: {
                type: 'string',
                description:
                  'Raw chapter text. Every line becomes one paragraph and nothing is trimmed: blank lines stay as empty paragraphs and leading indentation is kept, exactly as the built-in import does. Pass the text as it is in the source.',
              },
              paragraphs: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Pre-split paragraphs, one string per line of the source. Kept verbatim; use an empty string for a blank line.',
              },
              web_url: { type: 'string' },
            },
            required: ['title'],
          },
        },
      },
      required: ['chapters'],
    },
    execute: async (args, ctx) => {
      const bookRes = resolveBookFromArgs(args, ctx);
      if (!bookRes.ok) return bookRes.error;

      const parsedChapters = parseChapterInputs(args.chapters);
      if (parsedChapters === 'invalid_url') {
        return agentMcpError('INVALID_ARGS', INVALID_WEB_URL_MESSAGE);
      }
      if (!parsedChapters) {
        return agentMcpError(
          'INVALID_ARGS',
          'chapters must be a non-empty array where each item has title and text or paragraphs.',
        );
      }

      const { book } = bookRes;
      const now = new Date();
      const newChapters = parsedChapters.map((ch) => buildChapterEntity(ch, now));
      const existingVolumes: Volume[] = (book.volumes ?? []).map((v) => ({
        ...v,
        chapters: [...(v.chapters ?? [])],
      }));

      const requestedVolumeId = readTrimmedString(args.volume_id);
      const requestedVolumeTitle = readTrimmedString(args.volume_title);

      let targetVolume: Volume | undefined;
      if (requestedVolumeId) {
        targetVolume = existingVolumes.find((v) => v.id === requestedVolumeId);
        if (!targetVolume) {
          return agentMcpError('VOLUME_NOT_FOUND', `Volume not found: ${requestedVolumeId}`);
        }
      } else if (requestedVolumeTitle) {
        targetVolume = existingVolumes.find((v) => titleOriginal(v.title) === requestedVolumeTitle);
        if (!targetVolume) {
          targetVolume = createEmptyVolume(requestedVolumeTitle);
          existingVolumes.push(targetVolume);
        }
      } else if (existingVolumes.length > 0) {
        targetVolume = existingVolumes[existingVolumes.length - 1];
      } else {
        targetVolume = createEmptyVolume();
        existingVolumes.push(targetVolume);
      }

      targetVolume!.chapters = [...(targetVolume!.chapters ?? []), ...newChapters];
      await useBooksStore().updateBook(book.id, { volumes: existingVolumes });

      return {
        book_id: book.id,
        volume_id: targetVolume!.id,
        added_count: newChapters.length,
        chapters: newChapters.map((ch) => ({
          chapter_id: ch.id,
          title: titleOriginal(ch.title),
          paragraph_count: ch.content?.length ?? 0,
        })),
      };
    },
  },
  {
    name: 'update_book',
    description: withBuiltinGuidance(
      'update_book',
      "Update a book's author, description, tags, or alternate titles. Only the fields you pass are changed; pass an empty string or empty array to clear a field. The title and chapters are not affected.",
    ),
    category: 'library',
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
        author: { type: 'string', description: 'Author name.' },
        description: { type: 'string', description: 'Book synopsis.' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Full list of tags (replaces the existing tags).',
        },
        alternate_titles: {
          type: 'array',
          items: { type: 'string' },
          description: 'Full list of alternate titles (replaces the existing list).',
        },
      },
    },
    execute: async (args, ctx) => {
      const bookRes = resolveBookFromArgs(args, ctx);
      if (!bookRes.ok) return bookRes.error;
      const { updates, updatedFields } = buildBookInfoPatch(args);
      if (updatedFields.length === 0) {
        return agentMcpError(
          'INVALID_ARGS',
          'Provide at least one of author, description, tags, or alternate_titles.',
        );
      }

      const booksStore = useBooksStore();
      await booksStore.updateBook(bookRes.book.id, updates);
      const updated = booksStore.getBookById(bookRes.book.id) ?? bookRes.book;
      return {
        book_id: updated.id,
        title: updated.title,
        updated_fields: updatedFields,
        author: updated.author ?? '',
        description: updated.description ?? '',
        tags: updated.tags ?? [],
        alternate_titles: updated.alternateTitles ?? [],
      };
    },
  },
  {
    name: 'move_chapters',
    // 说明、参数与移动逻辑都与站内同名工具共用
    description: withBuiltinGuidance(
      'move_chapters',
      'Reorder chapters within a volume or move them to another volume (optionally a new one). Returns the new position of each moved chapter.',
    ),
    category: 'library',
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
        ...moveChaptersParameters((name) =>
          describeTool(`move_chapters.parameters.properties.${name}`),
        ),
      },
      required: ['chapter_ids'],
    },
    execute: async (args, ctx) => {
      const bookRes = resolveBookFromArgs(args, ctx);
      if (!bookRes.ok) return bookRes.error;
      const result = await moveChapters(bookRes.book.id, readMoveChaptersRequest(args));
      if (!result.ok) {
        return agentMcpError(
          result.code,
          MOVE_CHAPTERS_ERRORS[result.code],
          result.id !== undefined ? { id: result.id } : undefined,
        );
      }
      const book = useBooksStore().getBookById(bookRes.book.id) ?? bookRes.book;
      const titles = new Map(
        (book.volumes ?? []).flatMap((vol) =>
          (vol.chapters ?? []).map((ch) => [ch.id, titleOriginal(ch.title)] as const),
        ),
      );
      return {
        book_id: book.id,
        target_volume_id: result.targetVolumeId,
        created_volume: result.createdVolume,
        unchanged: result.unchanged,
        moved: result.moved.map((entry) => ({
          chapter_id: entry.chapterId,
          title_original: titles.get(entry.chapterId) ?? '',
          from_volume_id: entry.fromVolumeId,
          to_volume_id: entry.toVolumeId,
          index: entry.index,
        })),
      };
    },
  },
  importBookFromUrlTool,
  {
    name: 'delete_book',
    description:
      'Permanently delete a book and its chapters from the local library. Only available in "full" permission mode.',
    category: 'library',
    permission: 'full',
    readOnlyHint: false,
    requiresBookStore: true,
    inputSchema: {
      type: 'object',
      properties: {
        book_id: {
          type: 'string',
          description: 'Book ID to delete (must be provided explicitly).',
        },
      },
      required: ['book_id'],
    },
    execute: async (args) => {
      const bookId = readTrimmedString(args.book_id);
      if (!bookId) {
        return agentMcpError(
          'BOOK_ID_REQUIRED',
          'book_id must be provided explicitly for delete_book.',
        );
      }
      const booksStore = useBooksStore();
      const book = booksStore.getBookById(bookId);
      if (!book) {
        return agentMcpError('BOOK_NOT_FOUND', `Book not found: ${bookId}`);
      }
      const title = book.title;
      await booksStore.deleteBook(bookId);
      return {
        deleted: true,
        book_id: bookId,
        title,
      };
    },
  },
];
