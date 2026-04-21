import type { Terminology, CharacterSetting } from 'src/models/novel';
import { getCharacterNameVariants } from './novel-utils';

// 转义正则表达式特殊字符
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 去除文本中的注音（括号内的假名）
 * 例如：鵜（う）飼（かい）→ 鵜飼
 * @param text 原始文本
 * @returns 去除注音后的文本
 */
export function removeFurigana(text: string): string {
  return text.replace(/[（(][^）)]*[）)]/g, '');
}

/**
 * 去除注音并返回位置映射
 * 映射：去除注音后的文本中的每个位置对应到原始文本中的位置
 * @param text 原始文本
 * @returns { textWithoutFurigana: string, positionMap: number[], lengthMap: number[] }
 */
export interface FuriganaMapResult {
  textWithoutFurigana: string;
  positionMap: number[];
  lengthMap: number[];
}

/**
 * 去除注音并返回位置映射
 * 映射：去除注音后的文本中的每个位置对应到原始文本中的位置
 * @param text 原始文本
 * @returns { textWithoutFurigana: string, positionMap: number[], lengthMap: number[] }
 */
function removeFuriganaWithMap(text: string): FuriganaMapResult {
  const textWithoutFurigana: string[] = [];
  const positionMap: number[] = []; // 去除注音后文本中的每个位置对应的原始文本位置
  const lengthMap: number[] = []; // 去除注音后文本中的每个位置对应的原始文本长度
  let originalIndex = 0;

  while (originalIndex < text.length) {
    const char = text[originalIndex];
    if (!char) break;

    // 检查是否是注音的开始
    if (char === '（' || char === '(') {
      // 找到注音的结束
      const endIndex = text.indexOf(char === '（' ? '）' : ')', originalIndex);
      if (endIndex !== -1) {
        // 跳过整个注音（不添加到 textWithoutFurigana）
        // 但需要记录下一个字符的位置映射
        originalIndex = endIndex + 1;
        continue;
      }
    }

    // 不是注音，添加到结果中
    textWithoutFurigana.push(char);
    positionMap.push(originalIndex);

    // 计算这个字符到下一个非注音字符之间的长度（包括注音）
    let charLength = 1;
    let nextIndex = originalIndex + 1;
    while (nextIndex < text.length) {
      const nextChar = text[nextIndex];
      if (nextChar === '（' || nextChar === '(') {
        // 找到注音的结束
        const furiganaEndIndex = text.indexOf(nextChar === '（' ? '）' : ')', nextIndex);
        if (furiganaEndIndex !== -1) {
          // 包含注音的长度
          charLength += furiganaEndIndex - nextIndex + 1;
          nextIndex = furiganaEndIndex + 1;
        } else {
          break;
        }
      } else {
        // 下一个非注音字符，停止
        break;
      }
    }
    lengthMap.push(charLength);

    originalIndex++;
  }

  return {
    textWithoutFurigana: textWithoutFurigana.join(''),
    positionMap,
    lengthMap,
  };
}

/**
 * 根据位置/长度映射，将去注音文本中的正则匹配位置还原到原始文本。
 * @param text 原始文本
 * @param matchedText 去注音文本里匹配到的子串
 * @param matchIndex 去注音文本里的匹配起点
 * @param positionMap 去注音 → 原始位置映射
 * @param lengthMap 去注音 → 原始长度映射（含注音）
 */
function mapMatchToOriginal(
  text: string,
  matchedText: string,
  matchIndex: number,
  positionMap: number[],
  lengthMap: number[],
): { originalIndex: number; originalLength: number; matchedOriginalText: string } {
  const originalIndex = positionMap[matchIndex] ?? matchIndex;
  let originalLength = 0;
  for (let i = 0; i < matchedText.length; i++) {
    originalLength += lengthMap[matchIndex + i] ?? 1;
  }
  const matchedOriginalText = text.substring(originalIndex, originalIndex + originalLength);
  return { originalIndex, originalLength, matchedOriginalText };
}

/**
 * 将一组名称构建成按长度降序的交替正则，优先匹配较长名称。
 */
function buildNameAlternationRegex(validNames: Set<string>): RegExp {
  const sortedNames = Array.from(validNames).sort((a, b) => b.length - a.length);
  const namePatterns = sortedNames.map((name) => escapeRegex(name)).join('|');
  return new RegExp(`(${namePatterns})`, 'g');
}

export interface MatchResult<T> {
  item: T;
  matchedName: string;
  index: number;
  length: number;
  type: 'term' | 'character';
  matchedText?: string; // 原始文本中的匹配内容（包含注音）
}

export interface HighlightNode {
  type: 'text' | 'term' | 'character';
  content: string;
  term?: Terminology;
  character?: CharacterSetting;
  characters?: CharacterSetting[]; // 当文本匹配多个角色时，包含所有匹配的角色
}

/**
 * 在文本中查找术语
 * @param text 文本
 * @param terms 术语列表
 * @returns 匹配结果数组
 */
/**
 * 在文本中查找术语
 * @param text 文本
 * @param terms 术语列表
 * @param parsedText 可选的预解析文本（避免重复解析）
 * @returns 匹配结果数组
 */
export function matchTermsInText(
  text: string,
  terms: Terminology[],
  parsedText?: FuriganaMapResult,
): MatchResult<Terminology>[] {
  if (!text || !terms || terms.length === 0) {
    return [];
  }

  const matches: MatchResult<Terminology>[] = [];

  // 创建名称到术语的映射
  const termMap = new Map<string, Terminology>();
  // 过滤掉无效名称并去重
  const validNames = new Set<string>();

  for (const term of terms) {
    if (term.name && term.name.trim()) {
      const trimmedName = term.name.trim();
      validNames.add(trimmedName);
      termMap.set(trimmedName, term);
    }
  }

  if (validNames.size === 0) return [];

  // 按长度降序排序，优先匹配较长的名称
  const regex = buildNameAlternationRegex(validNames);

  // 在去除注音的文本中匹配，并使用位置映射
  const { textWithoutFurigana, positionMap, lengthMap } = parsedText || removeFuriganaWithMap(text);

  let match: RegExpExecArray | null;
  while ((match = regex.exec(textWithoutFurigana)) !== null) {
    const matchedText = match[0];
    const term = termMap.get(matchedText);
    if (term) {
      // 使用位置映射将匹配位置转换回原始文本中的位置（含注音长度）
      const { originalIndex, originalLength, matchedOriginalText } = mapMatchToOriginal(
        text,
        matchedText,
        match.index,
        positionMap,
        lengthMap,
      );
      matches.push({
        item: term,
        matchedName: matchedText,
        index: originalIndex,
        length: originalLength,
        type: 'term',
        matchedText: matchedOriginalText,
      });
    }
  }

  return matches;
}

/**
 * 在文本中查找角色（包括别名和变体）
 * @param text 文本
 * @param characters 角色列表
 * @param contextScores 可选的上下文得分（用于消歧义），通常是整章或整卷的统计
 * @returns 匹配结果数组
 */
/**
 * 内部辅助函数：扫描文本中的角色匹配
 */
function scanCharacterMatches(
  text: string,
  characters: CharacterSetting[],
  parsedText?: FuriganaMapResult,
) {
  if (!text || !characters || characters.length === 0) {
    return {
      rawMatches: [],
      localScores: new Map<string, number>(),
      nameToCharsMap: new Map<string, CharacterSetting[]>(),
    };
  }

  // 1. 构建名称到角色的映射（一对多）
  const nameToCharsMap = new Map<string, CharacterSetting[]>();
  const validNames = new Set<string>();

  for (const char of characters) {
    // 主名称使用完整变体生成（含姓名拆分）；别名只做精确匹配和去注音，不做拆分
    const aliasNames: string[] = (char.aliases || []).flatMap((a) => {
      const trimmed = a.name?.trim();
      if (!trimmed) return [];
      const noFurigana = removeFurigana(trimmed);
      return noFurigana !== trimmed ? [trimmed, noFurigana] : [trimmed];
    });
    const allNames = new Set([...getCharacterNameVariants(char.name), ...aliasNames]);

    for (const name of allNames) {
      if (name && name.trim()) {
        const trimmedName = name.trim();
        validNames.add(trimmedName);

        if (!nameToCharsMap.has(trimmedName)) {
          nameToCharsMap.set(trimmedName, []);
        }
        nameToCharsMap.get(trimmedName)?.push(char);
      }
    }
  }

  if (validNames.size === 0) {
    return {
      rawMatches: [],
      localScores: new Map<string, number>(),
      nameToCharsMap,
    };
  }

  // 2. 准备正则匹配
  const regex = buildNameAlternationRegex(validNames);

  // 在去除注音的文本中匹配，并使用位置映射
  const { textWithoutFurigana, positionMap, lengthMap } = parsedText || removeFuriganaWithMap(text);

  // 3. 扫描匹配并计算得分
  const rawMatches: { name: string; index: number; length: number; matchedText: string }[] = [];
  const localScores = new Map<string, number>();

  let match: RegExpExecArray | null;
  while ((match = regex.exec(textWithoutFurigana)) !== null) {
    const matchedText = match[0];
    const { originalIndex, originalLength, matchedOriginalText } = mapMatchToOriginal(
      text,
      matchedText,
      match.index,
      positionMap,
      lengthMap,
    );
    rawMatches.push({
      name: matchedText,
      index: originalIndex,
      length: originalLength,
      matchedText: matchedOriginalText,
    });

    const possibleChars = nameToCharsMap.get(matchedText);
    if (possibleChars) {
      for (const char of possibleChars) {
        const currentScore = localScores.get(char.id) || 0;
        localScores.set(char.id, currentScore + 1);
      }
    }
  }

  return { rawMatches, localScores, nameToCharsMap };
}

/**
 * 在文本中查找角色（包括别名和变体）
 * @param text 文本
 * @param characters 角色列表
 * @param contextScores 可选的上下文得分（用于消歧义），通常是整章或整卷的统计
 * @param parsedText 可选的预解析文本
 * @returns 匹配结果数组
 */
/**
 * 按（上下文得分 + 本地得分）的合计降序排序。
 * 同时被 matchCharactersInText 的候选排序和 calculateCharacterScores 的位置列表排序共用。
 */
function compareByCombinedScore(
  a: { id: string },
  b: { id: string },
  contextScores: Map<string, number> | undefined,
  localScores: Map<string, number>,
): number {
  const contextScoreA = contextScores?.get(a.id) || 0;
  const contextScoreB = contextScores?.get(b.id) || 0;
  const localScoreA = localScores.get(a.id) || 0;
  const localScoreB = localScores.get(b.id) || 0;
  return contextScoreB + localScoreB - (contextScoreA + localScoreA);
}

export function matchCharactersInText(
  text: string,
  characters: CharacterSetting[],
  contextScores?: Map<string, number>,
  parsedText?: FuriganaMapResult,
): MatchResult<CharacterSetting>[] {
  const { rawMatches, localScores, nameToCharsMap } = scanCharacterMatches(
    text,
    characters,
    parsedText,
  );

  if (rawMatches.length === 0) return [];

  // 4. 构建最终结果 - 包含所有匹配的角色，而不只是得分最高的
  // 对于每个匹配位置，返回所有可能的角色
  const matches: MatchResult<CharacterSetting>[] = [];

  for (const raw of rawMatches) {
    const possibleChars = nameToCharsMap.get(raw.name);
    if (possibleChars && possibleChars.length > 0) {
      // 如果有多个可能的角色，按得分排序（用于后续显示顺序）
      // 但返回所有匹配的角色，而不仅仅是得分最高的
      const sortedChars = [...possibleChars].sort((a, b) =>
        compareByCombinedScore(a, b, contextScores, localScores),
      );

      // 为每个匹配的角色创建一个 MatchResult
      for (const char of sortedChars) {
        matches.push({
          item: char,
          matchedName: raw.name,
          index: raw.index,
          length: raw.length,
          type: 'character',
          matchedText: raw.matchedText,
        });
      }
    }
  }

  return matches;
}

/**
 * 计算文本中各角色的出现得分（不返回匹配详情，仅用于统计上下文）
 * @param text 文本
 * @param characters 角色列表
 * @returns Map<characterId, score>
 */
/**
 * 计算文本中各角色的出现得分（不返回匹配详情，仅用于统计上下文）
 * @param text 文本
 * @param characters 角色列表
 * @param parsedText 可选的预解析文本
 * @returns Map<characterId, score>
 */
export function calculateCharacterScores(
  text: string,
  characters: CharacterSetting[],
  parsedText?: FuriganaMapResult,
): Map<string, number> {
  // 复用扫描逻辑
  return scanCharacterMatches(text, characters, parsedText).localScores;
}

/**
 * 查找并处理所有匹配项（术语和角色），解决重叠问题，返回用于高亮的节点列表
 * @param text 文本
 * @param terms 术语列表
 * @param characters 角色列表
 * @param contextScores 可选的上下文得分
 * @returns 高亮节点数组
 */
export function parseTextForHighlighting(
  text: string,
  terms: Terminology[] = [],
  characters: CharacterSetting[] = [],
  contextScores?: Map<string, number>,
): HighlightNode[] {
  if (!text) return [];

  // 预解析注音，避免多次解析
  const parsedText = removeFuriganaWithMap(text);

  const allMatches: MatchResult<Terminology | CharacterSetting>[] = [
    ...matchTermsInText(text, terms, parsedText),
    ...matchCharactersInText(text, characters, contextScores, parsedText),
  ];

  if (allMatches.length === 0) {
    return [{ type: 'text', content: text }];
  }

  // 统计本地角色命中次数，用于同位置多角色的排序
  const localScores = computeLocalCharacterScores(allMatches);

  // 先按 index 升序、同 index 下长度降序（优先保留较长匹配）
  allMatches.sort((a, b) => (a.index !== b.index ? a.index - b.index : b.length - a.length));

  // 合并相同位置（相同 index + length）的多角色匹配
  const positionMap = groupMatchesByPosition(allMatches);

  // 对每个位置的角色列表按「上下文 + 本地」得分降序排序
  sortCharactersWithinPosition(positionMap, contextScores, localScores);

  // 过滤不同位置之间的重叠
  const filteredMatches = filterOverlappingMatches(positionMap);

  return buildHighlightNodes(text, filteredMatches);
}

/** 统计 character 类型匹配的出现次数 */
function computeLocalCharacterScores(
  allMatches: MatchResult<Terminology | CharacterSetting>[],
): Map<string, number> {
  const localScores = new Map<string, number>();
  for (const match of allMatches) {
    if (match.type !== 'character') continue;
    const char = match.item as CharacterSetting;
    localScores.set(char.id, (localScores.get(char.id) || 0) + 1);
  }
  return localScores;
}

interface PositionEntry {
  match: MatchResult<Terminology | CharacterSetting>;
  characters: CharacterSetting[];
}

/** 按 index-length 合并相同位置的多角色匹配；术语位置不合并 */
function groupMatchesByPosition(
  allMatches: MatchResult<Terminology | CharacterSetting>[],
): Map<string, PositionEntry> {
  const positionMap = new Map<string, PositionEntry>();
  for (const match of allMatches) {
    const positionKey = `${match.index}-${match.length}`;
    if (match.type === 'character') {
      const char = match.item as CharacterSetting;
      const existing = positionMap.get(positionKey);
      if (existing) {
        const charIdSet = new Set(existing.characters.map((c) => c.id));
        if (!charIdSet.has(char.id)) existing.characters.push(char);
      } else {
        positionMap.set(positionKey, { match, characters: [char] });
      }
    } else {
      positionMap.set(positionKey, { match, characters: [] });
    }
  }
  return positionMap;
}

/** 对每个位置内 ≥2 个角色按（上下文 + 本地）得分降序排序 */
function sortCharactersWithinPosition(
  positionMap: Map<string, PositionEntry>,
  contextScores: Map<string, number> | undefined,
  localScores: Map<string, number>,
): void {
  for (const entry of positionMap.values()) {
    if (entry.characters.length > 1) {
      // 按得分降序排序（出现次数多的在前）
      entry.characters.sort((a, b) =>
        compareByCombinedScore(a, b, contextScores, localScores),
      );
    }
  }
}

/** 判断两段 [start, end) 区间是否重叠（允许相邻） */
function rangesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return (
    (startA >= startB && startA < endB) ||
    (endA > startB && endA <= endB) ||
    (startA <= startB && endA >= endB)
  );
}

/** 过滤不同位置之间的重叠（保留先出现的匹配） */
function filterOverlappingMatches(positionMap: Map<string, PositionEntry>): PositionEntry[] {
  const filteredMatches: PositionEntry[] = [];
  for (const entry of positionMap.values()) {
    const currentEnd = entry.match.index + entry.match.length;
    const hasOverlap = filteredMatches.some((existing) => {
      const existingEnd = existing.match.index + existing.match.length;
      // 允许相同位置的多角色
      if (entry.match.index === existing.match.index && entry.match.length === existing.match.length) {
        return false;
      }
      return rangesOverlap(entry.match.index, currentEnd, existing.match.index, existingEnd);
    });
    if (!hasOverlap) filteredMatches.push(entry);
  }
  filteredMatches.sort((a, b) => a.match.index - b.match.index);
  return filteredMatches;
}

/** 将匹配区间与其间的普通文本组装成 HighlightNode 数组 */
function buildHighlightNodes(text: string, filteredMatches: PositionEntry[]): HighlightNode[] {
  const nodes: HighlightNode[] = [];
  let lastIndex = 0;
  for (const entry of filteredMatches) {
    const match = entry.match;
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', content: text.substring(lastIndex, match.index) });
    }
    if (match.type === 'term') {
      nodes.push(buildTermNode(text, match as MatchResult<Terminology>, entry.characters));
    } else if (entry.characters.length > 0) {
      nodes.push(
        buildCharacterNode(text, match as MatchResult<CharacterSetting>, entry.characters),
      );
    }
    lastIndex = match.index + match.length;
  }
  if (lastIndex < text.length) {
    nodes.push({ type: 'text', content: text.substring(lastIndex) });
  }
  return nodes;
}

/** 构造 term 节点，使用 matchedText（若存在）否则回退到原文切片 */
function buildTermNode(
  text: string,
  match: MatchResult<Terminology>,
  characters: CharacterSetting[],
): HighlightNode {
  const content =
    match.matchedText ||
    Array.from(text).slice(match.index, match.index + match.length).join('');
  return {
    type: 'term',
    content,
    term: match.item,
    ...(characters.length > 0 ? { characters } : {}),
  };
}

/** 构造 character 节点；首个角色进 character 字段以向后兼容 */
function buildCharacterNode(
  text: string,
  match: MatchResult<CharacterSetting>,
  characters: CharacterSetting[],
): HighlightNode {
  const content =
    match.matchedText ||
    Array.from(text).slice(match.index, match.index + match.length).join('');
  const firstCharacter = characters[0];
  return {
    type: 'character',
    content,
    ...(firstCharacter ? { character: firstCharacter } : {}),
    characters,
  };
}

/**
 * 带记忆化的高亮解析
 *
 * 使用 WeakMap 缓存 (terms, characters) 到每个文本解析结果的映射：
 * - 外层 WeakMap<Terminology[]> — 按术语数组引用索引
 * - 中层 WeakMap<CharacterSetting[]> — 按角色数组引用索引
 * - 内层 Map<text, HighlightNode[]> — 实际的解析结果缓存（带 FIFO 淘汰）
 *
 * 当上游稳定了术语/角色数组引用（见 BookDetailsPage 中的 stableTerminologies），
 * 同一章节的所有段落在后续重渲染时都能命中缓存，彻底消除高亮重解析开销。
 * 当术语/角色变化时，旧的 WeakMap 条目会被自动 GC。
 *
 * 注意：避免传入临时字面量数组（如 `props.terms || []`），否则会绕过缓存。
 */
const PARSE_HIGHLIGHT_CACHE_MAX = 5000;
const parseHighlightMemo = new WeakMap<
  Terminology[],
  WeakMap<CharacterSetting[], Map<string, HighlightNode[]>>
>();

export function parseTextForHighlightingMemoized(
  text: string,
  terms: Terminology[],
  characters: CharacterSetting[],
): HighlightNode[] {
  if (!text) return [];

  let charsMap = parseHighlightMemo.get(terms);
  if (!charsMap) {
    charsMap = new WeakMap<CharacterSetting[], Map<string, HighlightNode[]>>();
    parseHighlightMemo.set(terms, charsMap);
  }

  let textMap = charsMap.get(characters);
  if (!textMap) {
    textMap = new Map<string, HighlightNode[]>();
    charsMap.set(characters, textMap);
  }

  const cached = textMap.get(text);
  if (cached) return cached;

  const result = parseTextForHighlighting(text, terms, characters);

  // FIFO 淘汰：避免内存无限增长
  if (textMap.size >= PARSE_HIGHLIGHT_CACHE_MAX) {
    const firstKey = textMap.keys().next().value;
    if (firstKey !== undefined) {
      textMap.delete(firstKey);
    }
  }
  textMap.set(text, result);
  return result;
}

/**
 * 获取文本中包含的所有唯一术语
 * @param text 文本
 * @param terms 术语列表
 * @returns 唯一的术语列表
 */
export function findUniqueTermsInText(text: string, terms: Terminology[]): Terminology[] {
  const matches = matchTermsInText(text, terms);
  const uniqueMap = new Map<string, Terminology>();
  matches.forEach((m) => uniqueMap.set(m.item.id, m.item));
  return Array.from(uniqueMap.values());
}

/**
 * 获取文本中包含的所有唯一角色
 * 当同一文本可以匹配多个角色时，会返回所有匹配的角色（而不仅仅是得分最高的）
 * @param text 文本
 * @param characters 角色列表
 * @param contextScores 可选的上下文得分
 * @returns 唯一的角色列表（按出现次数排序，出现次数多的在前）
 */
export function findUniqueCharactersInText(
  text: string,
  characters: CharacterSetting[],
  contextScores?: Map<string, number>,
): CharacterSetting[] {
  // matchCharactersInText 现在会返回所有匹配的角色，包括同一文本匹配多个角色的情况
  const matches = matchCharactersInText(text, characters, contextScores);

  // 计算每个角色的出现次数（用于排序）
  const characterCounts = new Map<string, number>();
  const characterMap = new Map<string, CharacterSetting>();

  // 遍历所有匹配，提取唯一角色并统计出现次数
  // 如果同一文本匹配多个角色，所有匹配的角色都会被包含
  matches.forEach((m) => {
    const charId = m.item.id;
    characterMap.set(charId, m.item);
    characterCounts.set(charId, (characterCounts.get(charId) || 0) + 1);
  });

  // 按出现次数排序（出现次数多的在前）
  const uniqueCharacters = Array.from(characterMap.values()).sort((a, b) => {
    const countA = characterCounts.get(a.id) || 0;
    const countB = characterCounts.get(b.id) || 0;

    // 如果出现次数相同，使用上下文得分作为次要排序依据
    if (countA === countB) {
      const contextScoreA = contextScores?.get(a.id) || 0;
      const contextScoreB = contextScores?.get(b.id) || 0;
      return contextScoreB - contextScoreA;
    }

    return countB - countA;
  });

  return uniqueCharacters;
}

