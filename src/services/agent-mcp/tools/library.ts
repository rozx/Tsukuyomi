import { v4 } from 'uuid';
import type { AppLocale } from 'src/models/locale';
import { isAppLocale } from 'src/models/locale';
import type { Chapter, Novel, Volume } from 'src/models/novel';
import { getLanguageTranslation, getNameTranslation } from 'src/services/localization/selection';
import { titleOriginal } from 'src/services/localization/title-edit';
import { useBooksStore } from 'src/stores/books';
import { generateShortId } from 'src/utils/id-generator';
import { agentMcpError, type AgentMcpToolSpec } from '../types';
import { loadChapterParagraphs, readTrimmedString, resolveBookFromArgs } from './helpers';
import {
  buildParagraphs,
  countChaptersInVolumes,
  createEmptyVolume,
  splitTextToParagraphLines,
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

function parseChapterInputs(raw: unknown): ChapterInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const result: ChapterInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const rec = item as Record<string, unknown>;
    const title = readTrimmedString(rec.title);
    if (!title) return null;
    const paragraphs = Array.isArray(rec.paragraphs)
      ? rec.paragraphs.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      : undefined;
    const text = typeof rec.text === 'string' ? rec.text : undefined;
    if (!paragraphs && text === undefined) return null;
    const webUrl = readTrimmedString(rec.web_url);
    result.push({
      title,
      ...(text !== undefined ? { text } : {}),
      ...(paragraphs ? { paragraphs } : {}),
      ...(webUrl ? { web_url: webUrl } : {}),
    });
  }
  return result;
}

function buildChapterEntity(input: ChapterInput, now: Date): Chapter {
  const lines =
    input.paragraphs && input.paragraphs.length > 0
      ? input.paragraphs
      : splitTextToParagraphLines(input.text ?? '');
  const content = buildParagraphs(lines);
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
      'Get full metadata, volumes, chapters, and per-chapter translation progress for a book.',
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
        include_chapter_stats: {
          type: 'boolean',
          description:
            'Whether to compute paragraph/translated counts for each chapter (default true).',
        },
      },
    },
    execute: async (args, ctx) => {
      const bookRes = resolveBookFromArgs(args, ctx);
      if (!bookRes.ok) return bookRes.error;
      const { book, targetLanguage } = bookRes;

      const includeStats = args.include_chapter_stats !== false;
      const volumes = book.volumes ?? [];
      let totalChapters = 0;

      const formattedVolumes = [];
      for (const vol of volumes) {
        const chapters = vol.chapters ?? [];
        totalChapters += chapters.length;
        const formattedChapters = [];
        for (const ch of chapters) {
          let paragraphCount: number | undefined;
          let translatedCount: number | undefined;
          if (includeStats) {
            const content = await loadChapterParagraphs(ch);
            const nonEmpty = content.filter((p) => p.text.trim().length > 0);
            paragraphCount = nonEmpty.length;
            translatedCount = nonEmpty.filter((p) =>
              Boolean(getLanguageTranslation(p, targetLanguage)?.translation.trim()),
            ).length;
          }
          const chTitle = formatTitle(ch.title, targetLanguage);
          formattedChapters.push({
            id: ch.id,
            title_original: chTitle.original,
            title_translation: chTitle.translation,
            ...(paragraphCount !== undefined ? { paragraph_count: paragraphCount } : {}),
            ...(translatedCount !== undefined ? { translated_count: translatedCount } : {}),
            ...(ch.webUrl ? { web_url: ch.webUrl } : {}),
          });
        }
        const volTitle = formatTitle(vol.title, targetLanguage);
        formattedVolumes.push({
          id: vol.id,
          title_original: volTitle.original,
          title_translation: volTitle.translation,
          chapters: formattedChapters,
        });
      }

      return {
        id: book.id,
        title: book.title,
        author: book.author ?? '',
        description: book.description ?? '',
        tags: book.tags ?? [],
        target_language: targetLanguage,
        enable_original_text_validation: Boolean(book.enableOriginalTextValidation),
        translation_chunk_size: book.translationChunkSize ?? null,
        volume_count: formattedVolumes.length,
        chapter_count: totalChapters,
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
        web_url: { type: 'string', description: 'Optional source URL.' },
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

      const rawLang = typeof args.target_language === 'string' ? args.target_language : 'zh-CN';
      const targetLanguage: AppLocale = isAppLocale(rawLang) ? rawLang : 'zh-CN';
      const now = new Date();
      const volumes: Volume[] = [];

      if (args.chapters !== undefined) {
        const parsed = parseChapterInputs(args.chapters);
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

      const webUrl = readTrimmedString(args.web_url);
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
        webUrl: webUrl ? [webUrl] : undefined,
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
                description: 'Raw chapter text split into paragraphs by line breaks.',
              },
              paragraphs: {
                type: 'array',
                items: { type: 'string' },
                description: 'Pre-split array of paragraph strings.',
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
