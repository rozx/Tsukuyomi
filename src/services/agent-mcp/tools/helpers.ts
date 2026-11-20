import { translateText } from 'src/i18n/translate';
import type { AppLocale } from 'src/models/locale';
import type { Chapter, CharacterSetting, Novel, Paragraph, Terminology } from 'src/models/novel';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { getNameTranslation } from 'src/services/localization/selection';
import { useBooksStore } from 'src/stores/books';
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
