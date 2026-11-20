import { translateText } from 'src/i18n/translate';
import type { AppLocale } from 'src/models/locale';
import type { Chapter, CharacterSetting, Novel, Paragraph, Terminology } from 'src/models/novel';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { getNameTranslation } from 'src/services/localization/selection';
import { titleOriginal } from 'src/services/localization/title-edit';
import { useBooksStore } from 'src/stores/books';
import { useContextStore } from 'src/stores/context';
import { useSettingsStore } from 'src/stores/settings';
import { agentMcpError, type AgentMcpExecutionContext, type AgentMcpToolError } from '../types';

export function resolveDefaultVolumeTitle(): string {
  return translateText(useSettingsStore().uiLocale, 'aiImportErrors.defaultVolume');
}

export async function loadChapterParagraphs(chapter: Chapter): Promise<Paragraph[]> {
  if (chapter.content !== undefined) return chapter.content;
  return (await ChapterContentService.loadChapterContent(chapter.id)) ?? [];
}

export function findChapterInBook(book: Novel, chapterId: string): Chapter | null {
  for (const vol of book.volumes ?? []) {
    for (const ch of vol.chapters ?? []) {
      if (ch.id === chapterId) return ch;
    }
  }
  return null;
}

/**
 * 从存储重新读取一本书并更新书库（批量写入之后刷新界面用）。
 * 用户正打开这本书的某一章时保持该章正文已加载。
 */
export async function refreshBookKeepingOpenChapter(bookId: string): Promise<Novel | undefined> {
  const contextStore = useContextStore();
  const openChapterId =
    contextStore.currentBookId === bookId ? contextStore.currentChapterId : null;
  return useBooksStore().refreshBookFromStorage(bookId, openChapterId ?? undefined);
}

/** 按卷章顺序列出符合条件的章节的 ID、所在卷、标题与来源网址 */
export function describeChapters(book: Novel, include: (chapter: Chapter) => boolean) {
  return (book.volumes ?? []).flatMap((volume) =>
    (volume.chapters ?? []).filter(include).map((chapter) => ({
      chapter_id: chapter.id,
      volume_id: volume.id,
      title_original: titleOriginal(chapter.title),
      ...(chapter.webUrl ? { url: chapter.webUrl } : {}),
    })),
  );
}

export function resolveBookFromArgs(
  args: Record<string, unknown>,
  ctx: AgentMcpExecutionContext,
): { ok: true; book: Novel; targetLanguage: AppLocale } | { ok: false; error: AgentMcpToolError } {
  const resolved = ctx.resolveBookId(args.book_id as string | undefined);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const book = useBooksStore().getBookById(resolved.bookId);
  if (!book) {
    return {
      ok: false,
      error: agentMcpError('BOOK_NOT_FOUND', `Book not found: ${resolved.bookId}`),
    };
  }
  return { ok: true, book, targetLanguage: book.targetLanguage ?? 'zh-CN' };
}

export function resolveBookAndChapterFromArgs(
  args: Record<string, unknown>,
  ctx: AgentMcpExecutionContext,
):
  | { ok: true; book: Novel; chapter: Chapter; targetLanguage: AppLocale }
  | { ok: false; error: AgentMcpToolError } {
  const bookRes = resolveBookFromArgs(args, ctx);
  if (!bookRes.ok) return bookRes;

  const chapterId = typeof args.chapter_id === 'string' ? args.chapter_id.trim() : '';
  if (!chapterId) {
    return { ok: false, error: agentMcpError('CHAPTER_ID_REQUIRED', 'chapter_id is required.') };
  }
  const chapter = findChapterInBook(bookRes.book, chapterId);
  if (!chapter) {
    return {
      ok: false,
      error: agentMcpError('CHAPTER_NOT_FOUND', `Chapter not found: ${chapterId}`),
    };
  }
  return {
    ok: true,
    book: bookRes.book,
    chapter,
    targetLanguage: bookRes.targetLanguage,
  };
}

export function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseNonNegativeInt(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.trunc(num);
}

/** 读取条数上限：缺省或非法时用默认值，并限制在 1..max 之间 */
export function parseLimit(value: unknown, fallback: number, max: number): number {
  return Math.min(max, Math.max(1, parseNonNegativeInt(value, fallback)));
}

/**
 * 按 limit / offset 参数分页。defaultLimit 为 null 表示不传 limit 时返回全部。
 * 返回的 total 是分页前的总数，next_offset 在没有更多时为 null。
 */
export function paginate<T>(
  items: readonly T[],
  args: Record<string, unknown>,
  options: { defaultLimit: number | null; maxLimit: number },
): { page: T[]; total: number; has_more: boolean; next_offset: number | null } {
  const offset = parseNonNegativeInt(args.offset, 0);
  const limit =
    args.limit === undefined && options.defaultLimit === null
      ? items.length
      : parseLimit(args.limit, options.defaultLimit ?? options.maxLimit, options.maxLimit);
  const page = items.slice(offset, offset + limit);
  const hasMore = offset + page.length < items.length;
  return {
    page,
    total: items.length,
    has_more: hasMore,
    next_offset: hasMore ? offset + page.length : null,
  };
}

/** 各搜索工具共用的 fuzzy 参数说明 */
export const FUZZY_PROPERTY = {
  type: 'boolean',
  description:
    'Fuzzy matching (default false = exact substring). When true, text that differs slightly from the query also matches: about one differing character per 4 characters of query, so typos and variant spellings are found. Queries shorter than 4 characters still need an exact match.',
};

/** 读取字符串数组参数：去掉首尾空白、空项与重复项 */
export function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return [...new Set(items)];
}

export function readOptionalTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined;
}

export function formatTermSummary(term: Terminology, language: AppLocale) {
  return {
    id: term.id,
    name: term.name,
    translation: getNameTranslation(term, language)?.translation ?? '',
    description: term.description ?? '',
  };
}

export function formatCharacterSummary(char: CharacterSetting, language: AppLocale) {
  return {
    id: char.id,
    name: char.name,
    translation: getNameTranslation(char, language)?.translation ?? '',
    sex: char.sex ?? null,
    description: char.description ?? '',
    speaking_style: char.speakingStyle ?? '',
    aliases: (char.aliases ?? []).map((alias) => ({
      name: alias.name,
      translation: getNameTranslation(alias, language)?.translation ?? '',
    })),
  };
}
