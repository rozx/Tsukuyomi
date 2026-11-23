import type { AppLocale } from 'src/models/locale';
import type { Chapter, Paragraph } from 'src/models/novel';
import { isSymbolOnly } from 'src/utils/text-utils';
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
/** 去掉空白后至少这么多个字才算：「はい」「……」这类短句本来就到处重复，译法也随语境变化 */
const MIN_REPEAT_LENGTH = 10;
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

/** 比较用的写法：去掉全部空白；太短或只有符号时返回 null（不参与比较） */
function repeatKey(text: string): string | null {
  const key = text.replace(/\s+/g, '');
  return key.length >= MIN_REPEAT_LENGTH && !isSymbolOnly(key) ? key : null;
}

/**
 * 从后往前扫一章，记下还没找到出处的写法；从最近的位置开始扫，所以先记下的就是离得最近的一处。
 * @returns 是否所有写法都已找到出处
 */
function collectFromChapter(
  chapter: Chapter,
  paragraphs: readonly Paragraph[],
  endIndex: number,
  language: AppLocale,
  wanted: ReadonlySet<string>,
  found: Map<string, EarlierOccurrence>,
): boolean {
  for (let index = Math.min(endIndex, paragraphs.length) - 1; index >= 0; index--) {
    const paragraph = paragraphs[index]!;
    const key = repeatKey(paragraph.text);
    if (!key || !wanted.has(key) || found.has(key)) continue;
    const translation = selectedTranslationText(paragraph, language);
    if (!translation.trim()) continue;
    found.set(key, { chapter, index, paragraph, translation });
    if (found.size === wanted.size) return true;
  }
  return false;
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
    const key = repeatKey(paragraph.text);
    return key ? [{ paragraph, key }] : [];
  });
  if (keyed.length === 0) return [];

  const wanted = new Set(keyed.map((entry) => entry.key));
  const found = new Map<string, EarlierOccurrence>();
  let done = collectFromChapter(
    options.currentChapter,
    options.currentParagraphs,
    options.beforeIndex,
    options.language,
    wanted,
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
        wanted,
        found,
      );
      if (done) break;
    }
  }

  const matches = keyed.flatMap(({ paragraph, key }, order) => {
    const earlier = found.get(key);
    // 本段已有译文且与前文一致时没有可对照的差异
    if (!earlier || selectedTranslationText(paragraph, options.language) === earlier.translation) {
      return [];
    }
    return [{ order, length: key.length, paragraphId: paragraph.id, earlier }];
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
