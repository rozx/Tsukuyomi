import type { BookSyncChangeset, SyncFailure } from 'src/models/book-sync';
import { BookSyncService } from 'src/services/book-sync/book-sync-service';
import { agentMcpError, type AgentMcpToolError, type AgentMcpToolSpec } from '../types';
import { resolveBookFromArgs } from './helpers';

type BookSyncSession = Awaited<ReturnType<typeof BookSyncService.openSession>>;

const MISSING_SOURCE_HINT =
  'This book has no usable update source (no supported source URL or saved update recipe). Ask the user to set it up from the book update panel in the app, or add new chapters manually with add_chapters.';
const INVALID_SOURCE_HINT =
  'The saved update source can no longer be replayed. Ask the user to repair it from the book update panel in the app, or add new chapters manually with add_chapters.';

function errorCodeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code ? code : undefined;
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function summarizeFailures(failures: readonly SyncFailure[]) {
  return failures.map((failure) => ({
    url: failure.url,
    code: failure.code,
    message: failure.message,
  }));
}

/** 打开会话并完成检查；来源缺失或失效时返回结构化错误而不是抛出 */
async function openAndCheck(
  bookId: string,
  deep: boolean,
): Promise<
  | { ok: true; session: BookSyncSession; changes: BookSyncChangeset }
  | { ok: false; error: AgentMcpToolError }
> {
  let session: BookSyncSession;
  try {
    session = await BookSyncService.openSession({ target: { bookId } });
  } catch (error) {
    const code = errorCodeOf(error);
    return {
      ok: false,
      error:
        code === 'RECIPE_MISSING'
          ? agentMcpError('UPDATE_SOURCE_MISSING', MISSING_SOURCE_HINT, { book_id: bookId })
          : agentMcpError(code ?? 'BOOK_UPDATE_FAILED', errorMessageOf(error), {
              book_id: bookId,
            }),
    };
  }

  try {
    const changes = deep ? await session.deepCheck() : await session.quickCheck();
    if (changes.status === 'invalid') {
      const failure = changes.failed[0];
      return {
        ok: false,
        error: agentMcpError(
          'UPDATE_SOURCE_INVALID',
          `${failure?.message ? `${failure.message} ` : ''}${INVALID_SOURCE_HINT}`,
          { book_id: bookId, ...(failure ? { reason_code: failure.code } : {}) },
        ),
      };
    }
    return { ok: true, session, changes };
  } catch (error) {
    return {
      ok: false,
      error: agentMcpError(errorCodeOf(error) ?? 'BOOK_UPDATE_FAILED', errorMessageOf(error), {
        book_id: bookId,
      }),
    };
  }
}

function readUrls(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

export const agentMcpBookUpdateTools: AgentMcpToolSpec[] = [
  {
    name: 'check_book_updates',
    description:
      'Check the source site of a book for updates. The quick check (default) lists chapters that are new on the site and counts imported chapters whose site date is newer; set deep to true to also compare the text of imported chapters and report which ones changed. Does not change chapter content.',
    category: 'library',
    permission: 'translate_and_edit',
    readOnlyHint: false,
    requiresBookStore: true,
    inputSchema: {
      type: 'object',
      properties: {
        book_id: {
          type: 'string',
          description: 'Book ID (optional if a book is currently open).',
        },
        deep: {
          type: 'boolean',
          description:
            'Also fetch and compare the text of already imported chapters (slower). Default false.',
        },
      },
    },
    execute: async (args, ctx) => {
      const resolved = resolveBookFromArgs(args, ctx);
      if (!resolved.ok) return resolved.error;
      const bookId = resolved.book.id;
      const deep = args.deep === true;

      const checked = await openAndCheck(bookId, deep);
      if (!checked.ok) return checked.error;
      const { changes } = checked;

      return {
        book_id: bookId,
        check: deep ? 'deep' : 'quick',
        has_updates:
          changes.new.length > 0 || changes.updated.length > 0 || changes.dateNewer.length > 0,
        new_chapters: changes.new.map((chapter) => ({ url: chapter.url, title: chapter.title })),
        updated_chapters: changes.updated.map((chapter) => ({
          chapter_id: chapter.chapterId,
          url: chapter.url,
          title: chapter.title,
          revised_paragraphs: chapter.revised,
          inserted_paragraphs: chapter.inserted,
          removed_paragraphs: chapter.removed,
          cleared_translation_versions: chapter.clearedVersions,
        })),
        // 站点日期较新但正文尚未比对的已导入章节；deep 检查后归零
        pending_compare_count: changes.dateNewer.length,
        skipped_count: changes.skipped.length,
        failed: summarizeFailures(changes.failed),
      };
    },
  },
  {
    name: 'apply_book_updates',
    description:
      'Import updates from the source site into a book. By default only chapters that are new on the site are imported. Set include_updated to true to also apply text changes to already imported chapters — revised paragraphs lose their existing translations, so confirm with the user first. Use urls to limit the import to specific chapters reported by check_book_updates.',
    category: 'library',
    permission: 'translate_and_edit',
    readOnlyHint: false,
    requiresBookStore: true,
    inputSchema: {
      type: 'object',
      properties: {
        book_id: {
          type: 'string',
          description: 'Book ID (optional if a book is currently open).',
        },
        urls: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Chapter URLs to import, taken from check_book_updates. Omit to import every new chapter.',
        },
        include_updated: {
          type: 'boolean',
          description:
            'Also compare and apply text changes to already imported chapters. Default false.',
        },
      },
    },
    execute: async (args, ctx) => {
      const resolved = resolveBookFromArgs(args, ctx);
      if (!resolved.ok) return resolved.error;
      const bookId = resolved.book.id;
      const includeUpdated = args.include_updated === true;

      const checked = await openAndCheck(bookId, includeUpdated);
      if (!checked.ok) return checked.error;
      const { session, changes } = checked;

      const available = [
        ...changes.new.map((chapter) => chapter.url),
        ...(includeUpdated ? changes.updated.map((chapter) => chapter.url) : []),
      ];
      const requested = readUrls(args.urls);
      let urls = available;
      if (requested !== undefined) {
        const allowed = new Set(available);
        const unknown = requested.filter((url) => !allowed.has(url));
        if (requested.length === 0 || unknown.length > 0) {
          return agentMcpError(
            'INVALID_ARGS',
            'urls must be a non-empty list of chapter URLs reported by check_book_updates (set include_updated to true to apply changed chapters).',
            { book_id: bookId, unknown_urls: unknown },
          );
        }
        urls = available.filter((url) => requested.includes(url));
      }

      // 按日期看已变化但本次不处理的已导入章节数，提示 Agent 还有内容没跟上
      const skippedUpdatedCount = includeUpdated ? 0 : changes.dateNewer.length;

      if (urls.length === 0) {
        return {
          book_id: bookId,
          status: 'up_to_date',
          applied_count: 0,
          applied_urls: [],
          skipped_updated_count: skippedUpdatedCount,
          failed: [],
        };
      }

      try {
        const result = await session.apply({ urls });
        return {
          book_id: bookId,
          status: result.status,
          applied_count: result.appliedUrls.length,
          applied_urls: result.appliedUrls,
          skipped_updated_count: skippedUpdatedCount,
          failed: summarizeFailures(result.failed),
        };
      } catch (error) {
        return agentMcpError(errorCodeOf(error) ?? 'BOOK_UPDATE_FAILED', errorMessageOf(error), {
          book_id: bookId,
        });
      }
    },
  },
];
