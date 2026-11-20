import type { AppLocale } from 'src/models/locale';
import type { Chapter, Paragraph } from 'src/models/novel';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { getLanguageTranslation } from 'src/services/localization/selection';
import { fuzzyMatchIndexes } from './keyword-match';

/**
 * 跨章节扫描段落：搜索与词频统计。站内 Agent 的工具与外部 Agent（MCP）的工具共用这一份。
 *
 * 扫描是确定性的线性扫描：正文不在内存里的章节分批从存储读取，不依赖全文索引是否建好。
 */

/** 每批从存储读取的章节数：全书扫描时分批读，避免一次把整本书的正文都放进内存 */
const CHAPTER_LOAD_BATCH = 40;

export type ParagraphSearchTarget = 'original' | 'translation' | 'both';

/** 搜索词不是合法的正则表达式 */
export class InvalidSearchPatternError extends Error {
  constructor(detail: string) {
    super(`Invalid regular expression: ${detail}`);
    this.name = 'InvalidSearchPatternError';
  }
}

/** 按顺序逐章给出段落；正文不在内存里的章节分批从存储读取 */
export async function* scanChapters(
  chapters: readonly Chapter[],
): AsyncGenerator<{ chapter: Chapter; paragraphs: Paragraph[] }> {
  for (let start = 0; start < chapters.length; start += CHAPTER_LOAD_BATCH) {
    const batch = chapters.slice(start, start + CHAPTER_LOAD_BATCH);
    const missingIds = batch.filter((ch) => ch.content === undefined).map((ch) => ch.id);
    const loaded =
      missingIds.length > 0
        ? await ChapterContentService.loadChapterContentsBatch(missingIds)
        : new Map<string, Paragraph[] | undefined>();
    for (const chapter of batch) {
      yield { chapter, paragraphs: chapter.content ?? loaded.get(chapter.id) ?? [] };
    }
  }
}

/** 段落在指定语言下当前选用的译文；没有时为空字符串 */
export function selectedTranslationText(paragraph: Paragraph, language: AppLocale): string {
  return getLanguageTranslation(paragraph, language)?.translation ?? '';
}

export interface ParagraphSearchQuery {
  query: string;
  /** 把 query 当作正则表达式（与 fuzzy 互斥，由调用方保证） */
  regex?: boolean;
  /** 模糊匹配：写法略有出入也算命中 */
  fuzzy?: boolean;
  caseSensitive?: boolean;
  searchIn: ParagraphSearchTarget;
  limit: number;
  /** 跳过前面多少条命中 */
  offset: number;
}

export interface ParagraphSearchHit {
  chapter: Chapter;
  /** 段落在章节里的序号 */
  index: number;
  paragraph: Paragraph;
  /** 当前选用的译文；没有时为空字符串 */
  translation: string;
}

function compileExactMatcher(query: ParagraphSearchQuery): (text: string) => boolean {
  if (query.regex) {
    try {
      const pattern = new RegExp(query.query, query.caseSensitive ? '' : 'i');
      return (text) => pattern.test(text);
    } catch (error) {
      throw new InvalidSearchPatternError(error instanceof Error ? error.message : String(error));
    }
  }
  if (query.caseSensitive) return (text) => text.includes(query.query);
  const lowered = query.query.toLowerCase();
  return (text) => text.toLowerCase().includes(lowered);
}

/** 一章里命中的段落序号 */
function matchChapterParagraphs(
  paragraphs: readonly Paragraph[],
  language: AppLocale,
  query: ParagraphSearchQuery,
  exact: (text: string) => boolean,
): Set<number> {
  const textsOf = (paragraph: Paragraph): string[] => [
    query.searchIn !== 'translation' ? paragraph.text : '',
    query.searchIn !== 'original' ? selectedTranslationText(paragraph, language) : '',
  ];
  if (query.fuzzy) {
    return new Set(
      fuzzyMatchIndexes(paragraphs, textsOf, query.query, {
        caseSensitive: query.caseSensitive === true,
      }),
    );
  }
  const hits = new Set<number>();
  paragraphs.forEach((paragraph, index) => {
    if (textsOf(paragraph).some((text) => text.length > 0 && exact(text))) hits.add(index);
  });
  return hits;
}

/**
 * 按卷章顺序搜索段落。多找到一条就能判断「还有更多」，达到上限后不再继续扫描。
 * @throws InvalidSearchPatternError 正则表达式无法解析
 */
export async function searchParagraphs(
  chapters: readonly Chapter[],
  language: AppLocale,
  query: ParagraphSearchQuery,
): Promise<{ hits: ParagraphSearchHit[]; hasMore: boolean }> {
  const exact = compileExactMatcher(query);
  const hits: ParagraphSearchHit[] = [];
  let matchedSoFar = 0;

  for await (const { chapter, paragraphs } of scanChapters(chapters)) {
    const matched = matchChapterParagraphs(paragraphs, language, query, exact);
    for (let index = 0; index < paragraphs.length; index++) {
      if (!matched.has(index)) continue;
      matchedSoFar += 1;
      if (matchedSoFar <= query.offset) continue;
      if (hits.length >= query.limit) return { hits, hasMore: true };
      const paragraph = paragraphs[index]!;
      hits.push({
        chapter,
        index,
        paragraph,
        translation: selectedTranslationText(paragraph, language),
      });
    }
  }
  return { hits, hasMore: false };
}

export interface KeywordOccurrences {
  keyword: string;
  /** 出现次数；模糊统计时等于命中的段落数 */
  totalCount: number;
  /** 出现过该关键词的段落数 */
  paragraphCount: number;
  /** 各章节的次数，按卷章顺序 */
  chapters: Array<{ chapter: Chapter; count: number }>;
}

/** needle 在 text 中不重叠出现的次数 */
function countSubstring(text: string, needle: string): number {
  let count = 0;
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length)) {
    count += 1;
  }
  return count;
}

/**
 * 一章里各命中段落的次数。精确统计数的是不重叠的出现次数；
 * 模糊统计无法可靠地数出同一段里的多处近似写法，每个命中段落计 1 次。
 */
function countPerParagraph(
  sources: readonly string[],
  keyword: string,
  options: { fuzzy?: boolean; caseSensitive?: boolean },
): number[] {
  if (options.fuzzy) {
    return fuzzyMatchIndexes(sources, (source) => [source], keyword, {
      caseSensitive: options.caseSensitive === true,
    }).map(() => 1);
  }
  const normalize = (text: string): string => (options.caseSensitive ? text : text.toLowerCase());
  const needle = normalize(keyword);
  return sources
    .map((source) => (source ? countSubstring(normalize(source), needle) : 0))
    .filter((count) => count > 0);
}

/**
 * 一次扫描统计多个关键词的出现次数。只统计段落文字（原文或当前选用的译文），
 * 不统计章节上另外保留的原始抓取文本，避免同一段内容算两遍。
 */
export async function countKeywordOccurrences(
  chapters: readonly Chapter[],
  language: AppLocale,
  options: {
    keywords: readonly string[];
    searchIn: 'original' | 'translation';
    fuzzy?: boolean;
    caseSensitive?: boolean;
  },
): Promise<KeywordOccurrences[]> {
  const tallies: KeywordOccurrences[] = options.keywords.map((keyword) => ({
    keyword,
    totalCount: 0,
    paragraphCount: 0,
    chapters: [],
  }));

  for await (const { chapter, paragraphs } of scanChapters(chapters)) {
    const sources = paragraphs.map((paragraph) =>
      options.searchIn === 'original'
        ? paragraph.text
        : selectedTranslationText(paragraph, language),
    );
    for (const tally of tallies) {
      const counts = countPerParagraph(sources, tally.keyword, options);
      if (counts.length === 0) continue;
      const chapterTotal = counts.reduce((sum, count) => sum + count, 0);
      tally.totalCount += chapterTotal;
      tally.paragraphCount += counts.length;
      tally.chapters.push({ chapter, count: chapterTotal });
    }
  }
  return tallies;
}
