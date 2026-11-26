import type { AppLocale } from 'src/models/locale';
import type { Chapter, Paragraph } from 'src/models/novel';
import { scanChapters, selectedTranslationText } from './paragraph-scan';

/**
 * 找出「与前文同文」的段落：回忆、首尾呼应、前后篇里原样重复的句子，前文已经译过时
 * 把那份译文带出来，译者才知道这句话之前是怎么译的。
 *
 * 只认原文完全相同（忽略空白）的段落，并且只回看本章前文与最近若干章：
 * 更早的章节、只是相近的句子要靠全书搜索去找。
 */

/** 回看之前多少章。每取一块都会读这些章节的正文，范围控制在正文缓存（100 章）之内 */
export const REPEAT_LOOKBACK_CHAPTERS = 30;
/**
 * 去掉空白、标点与符号后至少这么多个字才算：「……アンデッド？」「ええ、もちろんですわ」
 * 这类短应答本来就到处重复，译法也随语境变化
 */
const MIN_REPEAT_LENGTH = 10;
/**
 * 文字少于这么多个字的算短句。短句在前文里两处译法不同，说明它的译法随语境变化
 * （「こちらこそ、よろしくお願いいたします」之类的客套话），带出来也没法照搬，不列出；
 * 长句前文译法不一时仍给出最近的一处，回忆、复述的长句要与它保持一致
 */
const SHORT_LINE_LENGTH = 24;
/** 一次最多列出多少处，超出时保留较长的段落 */
const MAX_REPEATED_PASSAGES = 10;

export interface RepeatedPassage {
  /** 本块里的段落 */
  paragraphId: string;
  /** 前文同文段落所在的章节 */
  chapter: Chapter;
  /** 前文同文段落在该章节里的序号 */
  index: number;
  earlierParagraphId: string;
  /** 前文同文段落当前选用的译文 */
  translation: string;
}

interface EarlierOccurrence {
  chapter: Chapter;
  index: number;
  paragraph: Paragraph;
  translation: string;
}

interface RepeatKey {
  /** 比较用的写法：去掉全部空白 */
  key: string;
  /** 去掉空白、标点与符号后的字数 */
  length: number;
}

const NON_CONTENT = /[\s\p{P}\p{S}]/gu;

const compareKey = (text: string): string => text.replace(/\s+/g, '');

/** 比较用的写法与文字数；文字太少（含只有符号）时返回 null（不参与比较） */
function repeatKey(text: string): RepeatKey | null {
  const length = Array.from(text.replace(NON_CONTENT, '')).length;
  return length >= MIN_REPEAT_LENGTH ? { key: compareKey(text), length } : null;
}

/** 短句要看前文两处的译法是否一致，长句只要最近的一处 */
const occurrencesNeeded = (length: number): number => (length < SHORT_LINE_LENGTH ? 2 : 1);

/** 两处译法是否相同（忽略空白） */
const sameTranslation = (a: string, b: string): boolean => compareKey(a) === compareKey(b);

/**
 * 从后往前扫一章，给还没找够出处的写法记下前文出现的位置；从最近的位置开始扫，
 * 所以每个写法先记下的就是离得最近的一处。
 * @param pending 还没找够出处的写法 → 需要几处出处；找够的会从中删去
 * @returns 是否所有写法都已找够出处
 */
function collectFromChapter(
  chapter: Chapter,
  paragraphs: readonly Paragraph[],
  endIndex: number,
  language: AppLocale,
  pending: Map<string, number>,
  found: Map<string, EarlierOccurrence[]>,
): boolean {
  for (let index = Math.min(endIndex, paragraphs.length) - 1; index >= 0; index--) {
    const paragraph = paragraphs[index]!;
    // pending 里只有够长的写法，这里只需比较写法
    const key = compareKey(paragraph.text);
    const needed = pending.get(key);
    if (needed === undefined) continue;
    const translation = selectedTranslationText(paragraph, language);
    if (!translation.trim()) continue;
    const occurrences = found.get(key) ?? [];
    occurrences.push({ chapter, index, paragraph, translation });
    found.set(key, occurrences);
    if (occurrences.length >= needed) {
      pending.delete(key);
      if (pending.size === 0) return true;
    }
  }
  return false;
}

/** 这个写法应当带出的前文译法：没有出处，或短句前文译法不一时为 null */
function pickEarlier(
  occurrences: readonly EarlierOccurrence[] | undefined,
  length: number,
): EarlierOccurrence | null {
  const [nearest, second] = occurrences ?? [];
  if (!nearest) return null;
  if (length < SHORT_LINE_LENGTH && second) {
    return sameTranslation(nearest.translation, second.translation) ? nearest : null;
  }
  return nearest;
}

export async function findRepeatedPassages(options: {
  /** 本块的段落 */
  targets: readonly Paragraph[];
  currentChapter: Chapter;
  currentParagraphs: readonly Paragraph[];
  /** 本章里序号小于它的段落算前文 */
  beforeIndex: number;
  /** 按卷章顺序排在本章之前的章节 */
  previousChapters: readonly Chapter[];
  language: AppLocale;
}): Promise<RepeatedPassage[]> {
  const keyed = options.targets.flatMap((paragraph) => {
    const repeat = repeatKey(paragraph.text);
    return repeat ? [{ paragraph, ...repeat }] : [];
  });
  if (keyed.length === 0) return [];

  const pending = new Map(keyed.map((entry) => [entry.key, occurrencesNeeded(entry.length)]));
  const found = new Map<string, EarlierOccurrence[]>();
  let done = collectFromChapter(
    options.currentChapter,
    options.currentParagraphs,
    options.beforeIndex,
    options.language,
    pending,
    found,
  );
  if (!done) {
    const recent = options.previousChapters.slice(-REPEAT_LOOKBACK_CHAPTERS).reverse();
    for await (const { chapter, paragraphs } of scanChapters(recent)) {
      done = collectFromChapter(
        chapter,
        paragraphs,
        paragraphs.length,
        options.language,
        pending,
        found,
      );
      if (done) break;
    }
  }

  const matches = keyed.flatMap(({ paragraph, key, length }, order) => {
    const earlier = pickEarlier(found.get(key), length);
    // 本段已有译文且与前文一致时没有可对照的差异
    if (!earlier || selectedTranslationText(paragraph, options.language) === earlier.translation) {
      return [];
    }
    return [{ order, length, paragraphId: paragraph.id, earlier }];
  });
  const kept =
    matches.length > MAX_REPEATED_PASSAGES
      ? [...matches]
          .sort((a, b) => b.length - a.length || a.order - b.order)
          .slice(0, MAX_REPEATED_PASSAGES)
          .sort((a, b) => a.order - b.order)
      : matches;
  return kept.map(({ paragraphId, earlier }) => ({
    paragraphId,
    chapter: earlier.chapter,
    index: earlier.index,
    earlierParagraphId: earlier.paragraph.id,
    translation: earlier.translation,
  }));
}
