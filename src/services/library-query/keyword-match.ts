import Fuse from 'fuse.js';
import { FUZZY_MATCH_THRESHOLD } from 'src/utils/text-matcher';

/**
 * 关键词匹配：站内 Agent 的工具与外部 Agent（MCP）的工具共用这一份，
 * 保证「精确」与「模糊」在两边是同一个意思。
 *
 * - 精确：不区分大小写的子串匹配。
 * - 模糊：Fuse.js 近似子串匹配，阈值与全文搜索、近似匹配一致（见 FUZZY_MATCH_THRESHOLD）。
 */
export interface KeywordMatchOptions {
  /** 写法略有出入也算命中（默认 false） */
  fuzzy?: boolean;
  /** 区分大小写（默认 false） */
  caseSensitive?: boolean;
}

/** 模糊匹配：每个命中条目的序号与得分（越小越接近） */
function fuzzyScores<T>(
  items: readonly T[],
  getTexts: (item: T) => readonly string[],
  query: string,
  options: KeywordMatchOptions,
): Array<{ index: number; score: number }> {
  if (!query || items.length === 0) return [];
  const fuse = new Fuse(
    items.map((item) => ({ texts: getTexts(item).filter((text) => text.length > 0) })),
    {
      keys: ['texts'],
      includeScore: true,
      threshold: FUZZY_MATCH_THRESHOLD,
      ignoreLocation: true,
      isCaseSensitive: options.caseSensitive === true,
    },
  );
  return fuse.search(query).map((result) => ({ index: result.refIndex, score: result.score ?? 0 }));
}

/**
 * 模糊匹配：返回命中条目的序号，最接近的排在前面。
 * getTexts 给出每个条目参与匹配的文字（任一命中即算）。
 */
export function fuzzyMatchIndexes<T>(
  items: readonly T[],
  getTexts: (item: T) => readonly string[],
  query: string,
  options: KeywordMatchOptions = {},
): number[] {
  return fuzzyScores(items, getTexts, query, options).map((hit) => hit.index);
}

/**
 * 按关键词筛选条目，任一关键词命中即算。没有有效关键词时返回全部。
 * 精确匹配保持原有顺序；模糊匹配按接近程度排序（多个关键词时取各自最好的得分）。
 */
export function matchByKeywords<T>(
  items: readonly T[],
  getTexts: (item: T) => readonly string[],
  keywords: readonly string[],
  options: KeywordMatchOptions = {},
): T[] {
  const valid = keywords.map((keyword) => keyword.trim()).filter((keyword) => keyword.length > 0);
  if (valid.length === 0) return [...items];

  if (options.fuzzy) {
    const best = new Map<number, number>();
    for (const keyword of valid) {
      for (const { index, score } of fuzzyScores(items, getTexts, keyword, options)) {
        best.set(index, Math.min(best.get(index) ?? Infinity, score));
      }
    }
    return [...best.entries()]
      .sort((a, b) => a[1] - b[1] || a[0] - b[0])
      .map(([index]) => items[index]!);
  }

  const normalize = (text: string): string => (options.caseSensitive ? text : text.toLowerCase());
  const needles = valid.map(normalize);
  return items.filter((item) =>
    getTexts(item).some((text) => {
      const haystack = normalize(text);
      return haystack.length > 0 && needles.some((needle) => haystack.includes(needle));
    }),
  );
}
