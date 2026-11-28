import type { AppLocale } from 'src/models/locale';
import type { Chapter, Paragraph } from 'src/models/novel';
import { scanChapters, selectedTranslationText } from './paragraph-scan';

/**
 * 统计已有译文的标点与格式习惯（引号、破折号、省略号、对白句末句号、数字全半角、空格）。
 * 书籍没有写明标点约定时，外部 Agent 换书开译前不用再逐个搜索前文去确认这些写法。
 *
 * 只是计数，不判断对错：特殊指令写明的规范优先。
 */

/** 最多统计多少段已有译文 */
const STYLE_SAMPLE_PARAGRAPHS = 200;
/** 本章之外最多回看之前多少章 */
const STYLE_LOOKBACK_CHAPTERS = 5;
/** 已有译文少于这么多段时统计没有意义，不给出 */
const MIN_STYLE_SAMPLE = 10;

/** 各类写法：标签 → 匹配次数的正则 */
const PATTERN_GROUPS: Record<string, Array<[label: string, pattern: RegExp]>> = {
  quotes: [
    ['「」', /「/g],
    ['『』', /『/g],
    ['“”', /“/g],
    ['‘’', /‘/g],
    ['""', /"[^"\n]*"/g],
  ],
  dashes: [
    ['——', /—{2,}/g],
    ['—', /(?<!—)—(?!—)/g],
    ['──', /─{2,}/g],
    ['―', /―+/g],
    ['--', /-{2,}/g],
  ],
  ellipses: [
    ['……', /…{2,}/g],
    ['…', /(?<!…)…(?!…)/g],
    ['...', /\.{3,}/g],
    ['。。。', /。{3,}/g],
    ['・・・', /・{3,}/g],
  ],
  // 对白结尾：「好的。」与「好的」
  dialogue_end_period: [
    ['with_period', /[。.][」』”]/g],
    ['without_period', /[\p{L}\p{N}][」』”]/gu],
  ],
  exclamation_question: [
    ['！？', /[！？]/g],
    ['!?', /[!?]/g],
  ],
  digits: [
    ['０-９', /[０-９]+/g],
    ['0-9', /[0-9]+/g],
  ],
  // 半角空格只算两侧都是非 ASCII 字符的（中文里夹的空格），英文单词间的不算
  spaces: [
    ['full_width', /\u3000/g],
    ['half_width', /(?<=\P{ASCII}) +(?=\P{ASCII})/gu],
  ],
};

export type TranslationStyleHints = { sample_paragraphs: number } & Record<
  string,
  number | Record<string, number>
>;

/** 统计一组译文；只列出出现过的写法，整类都没出现时省略该类 */
function analyzeTranslationStyle(translations: readonly string[]): TranslationStyleHints {
  const hints: TranslationStyleHints = { sample_paragraphs: translations.length };
  for (const [group, patterns] of Object.entries(PATTERN_GROUPS)) {
    const counts: Record<string, number> = {};
    for (const [label, pattern] of patterns) {
      const count = translations.reduce((sum, text) => sum + (text.match(pattern)?.length ?? 0), 0);
      if (count > 0) counts[label] = count;
    }
    if (Object.keys(counts).length > 0) hints[group] = counts;
  }
  return hints;
}

/** 有译文、且不是原样照搬（分隔线、纯符号行）的段落的译文 */
function collectSample(paragraphs: readonly Paragraph[], language: AppLocale, into: string[]) {
  for (const paragraph of paragraphs) {
    if (into.length >= STYLE_SAMPLE_PARAGRAPHS) return;
    const translation = selectedTranslationText(paragraph, language).trim();
    if (translation && translation !== paragraph.text.trim()) into.push(translation);
  }
}

/**
 * 从本章已有的译文与之前最近几章（由近及远）取样统计；样本不足时返回 null。
 * @param previousChapters 按卷章顺序排在本章之前的章节
 */
export async function collectTranslationStyleHints(
  currentParagraphs: readonly Paragraph[],
  previousChapters: readonly Chapter[],
  language: AppLocale,
): Promise<TranslationStyleHints | null> {
  const sample: string[] = [];
  collectSample(currentParagraphs, language, sample);
  const lookback = previousChapters.slice(-STYLE_LOOKBACK_CHAPTERS).reverse();
  for await (const { paragraphs } of scanChapters(lookback)) {
    if (sample.length >= STYLE_SAMPLE_PARAGRAPHS) break;
    collectSample(paragraphs, language, sample);
  }
  return sample.length >= MIN_STYLE_SAMPLE ? analyzeTranslationStyle(sample) : null;
}
