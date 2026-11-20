import type { AppLocale } from 'src/models/locale';
import type { Chapter, CharacterSetting, Novel, Paragraph, Terminology } from 'src/models/novel';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { getLanguageTranslation, getNameTranslation } from 'src/services/localization/selection';
import { titleOriginal } from 'src/services/localization/title-edit';
import {
  findNearCharactersInText,
  findNearTermsInText,
  findUniqueCharactersInText,
  findUniqueTermsInText,
  type NearNameMatch,
} from 'src/utils/text-matcher';
import { isEmptyOrSymbolOnly } from 'src/utils/text-utils';

/**
 * 翻译一段文字时需要的上下文：命中的术语与角色、写法接近的「可能相关」条目，
 * 以及与上一章的衔接。站内翻译任务与外部 Agent（MCP）的翻译块共用这一份。
 */

/** 新章节对齐标题格式时，带上之前多少章的标题 */
const RECENT_TITLE_COUNT = 5;

export interface ChunkEntities {
  /** 原文里确切出现的术语 */
  terms: Terminology[];
  /** 原文里确切出现的角色（含姓、名单独出现与别名） */
  characters: CharacterSetting[];
  /** 写法接近但不完全相同的术语：可能是原文的错字或异写 */
  nearTerms: NearNameMatch<Terminology>[];
  /** 写法接近但不完全相同的角色 */
  nearCharacters: NearNameMatch<CharacterSetting>[];
}

/** 找出一段原文涉及的术语与角色：确切命中的，以及写法接近的「可能相关」条目 */
export function collectChunkEntities(
  book: Pick<Novel, 'terminologies' | 'characterSettings'>,
  chunkText: string,
): ChunkEntities {
  const allTerms = book.terminologies ?? [];
  const allCharacters = book.characterSettings ?? [];
  return {
    terms: findUniqueTermsInText(chunkText, allTerms),
    characters: findUniqueCharactersInText(chunkText, allCharacters),
    nearTerms: findNearTermsInText(chunkText, allTerms, allCharacters),
    nearCharacters: findNearCharactersInText(chunkText, allCharacters, allTerms),
  };
}

/** 作为衔接的一段已译文字 */
export interface ContinuityParagraph {
  /** 段落在章节里的序号 */
  index: number;
  id: string;
  original: string;
  translation: string;
}

/**
 * 取某个位置之前、最靠近它的若干已译段落（按阅读顺序）。
 * 空段落和只有符号的段落（分隔线等）不算正文，不占名额；没有译文的段落跳过。
 */
export function collectTranslatedBefore(
  paragraphs: readonly Paragraph[],
  beforeIndex: number,
  count: number,
  language: AppLocale,
): ContinuityParagraph[] {
  const collected: ContinuityParagraph[] = [];
  for (let i = beforeIndex - 1; i >= 0 && collected.length < count; i--) {
    const paragraph = paragraphs[i]!;
    if (isEmptyOrSymbolOnly(paragraph.text)) continue;
    const translation = getLanguageTranslation(paragraph, language)?.translation ?? '';
    if (!translation.trim()) continue;
    collected.unshift({ index: i, id: paragraph.id, original: paragraph.text, translation });
  }
  return collected;
}

export interface ChapterTitleRef {
  chapter: Chapter;
  original: string;
  /** 目标语言下的标题译名；没有时为空字符串 */
  translation: string;
}

function describeChapterTitle(chapter: Chapter, language: AppLocale): ChapterTitleRef {
  return {
    chapter,
    original: titleOriginal(chapter.title),
    translation:
      typeof chapter.title === 'object'
        ? (getNameTranslation(chapter.title, language)?.translation ?? '')
        : '',
  };
}

/** 按卷章顺序排在指定章节之前的全部章节 */
export function listChaptersBefore(book: Pick<Novel, 'volumes'>, chapterId: string): Chapter[] {
  const all = (book.volumes ?? []).flatMap((volume) => volume.chapters ?? []);
  const index = all.findIndex((chapter) => chapter.id === chapterId);
  return index > 0 ? all.slice(0, index) : [];
}

/** 之前最近几章里已有译名的标题，供新章节对齐标题格式（数字全半角、「话」的写法等） */
export function collectRecentChapterTitles(
  previous: readonly Chapter[],
  language: AppLocale,
): ChapterTitleRef[] {
  return previous
    .map((chapter) => describeChapterTitle(chapter, language))
    .filter((title) => title.translation.length > 0)
    .slice(-RECENT_TITLE_COUNT);
}

export interface PreviousChapterTail {
  title: ChapterTitleRef;
  paragraphs: ContinuityParagraph[];
}

/**
 * 上一章末尾的已译段落：让语气、标点习惯与章末固定用语能延续到新的一章。
 * 上一章不存在或没有译文时返回 null。
 */
export async function collectPreviousChapterTail(
  previous: Chapter | undefined,
  count: number,
  language: AppLocale,
): Promise<PreviousChapterTail | null> {
  if (!previous || count <= 0) return null;
  const paragraphs =
    previous.content ?? (await ChapterContentService.loadChapterContent(previous.id)) ?? [];
  const tail = collectTranslatedBefore(paragraphs, paragraphs.length, count, language);
  if (tail.length === 0) return null;
  return { title: describeChapterTitle(previous, language), paragraphs: tail };
}
