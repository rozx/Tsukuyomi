import type { Terminology, CharacterSetting } from 'src/models/novel';
import { getCharacterNameVariants } from './novel-utils';

// 转义正则表达式特殊字符
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface MatchResult<T> {
  item: T;
  matchedName: string;
  index: number;
  length: number;
  type: 'term' | 'character';
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
export function matchTermsInText(text: string, terms: Terminology[]): MatchResult<Terminology>[] {
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
  const sortedNames = Array.from(validNames).sort((a, b) => b.length - a.length);
  const namePatterns = sortedNames.map((name) => escapeRegex(name)).join('|');
  const regex = new RegExp(`(${namePatterns})`, 'g');

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const matchedText = match[0];
    const term = termMap.get(matchedText);
    if (term) {
      matches.push({
        item: term,
        matchedName: matchedText,
        index: match.index,
        length: matchedText.length,
        type: 'term',
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
export function matchCharactersInText(
  text: string,
  characters: CharacterSetting[],
  contextScores?: Map<string, number>,
): MatchResult<CharacterSetting>[] {
  if (!text || !characters || characters.length === 0) {
    return [];
  }

  // 1. 构建名称到角色的映射（一对多）
  // Map<name, CharacterSetting[]>
  const nameToCharsMap = new Map<string, CharacterSetting[]>();
  const validNames = new Set<string>();

  for (const char of characters) {
    const allNames = new Set([
      ...getCharacterNameVariants(char.name),
      ...(char.aliases?.flatMap((a) => getCharacterNameVariants(a.name)) || []),
    ]);

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

  if (validNames.size === 0) return [];

  // 2. 准备正则匹配
  // 按长度降序排序，优先匹配较长的名称
  const sortedNames = Array.from(validNames).sort((a, b) => b.length - a.length);
  const namePatterns = sortedNames.map((name) => escapeRegex(name)).join('|');
  const regex = new RegExp(`(${namePatterns})`, 'g');

  // 3. 第一次扫描：记录原始匹配并计算角色在文本中的出现得分
  // 得分策略：只要角色的任意名字（包括有歧义的）出现在文本中，该角色得分+1
  const rawMatches: { name: string; index: number; length: number }[] = [];
  const localScores = new Map<string, number>(); // charId -> score

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const matchedText = match[0];
    rawMatches.push({
      name: matchedText,
      index: match.index,
      length: matchedText.length,
    });

    const possibleChars = nameToCharsMap.get(matchedText);
    if (possibleChars) {
      for (const char of possibleChars) {
        const currentScore = localScores.get(char.id) || 0;
        localScores.set(char.id, currentScore + 1);
      }
    }
  }

  // 4. 构建最终结果 - 包含所有匹配的角色，而不只是得分最高的
  // 对于每个匹配位置，返回所有可能的角色
  const matches: MatchResult<CharacterSetting>[] = [];
  
  for (const raw of rawMatches) {
    const possibleChars = nameToCharsMap.get(raw.name);
    if (possibleChars && possibleChars.length > 0) {
      // 如果有多个可能的角色，按得分排序（用于后续显示顺序）
      // 但返回所有匹配的角色，而不仅仅是得分最高的
      const sortedChars = [...possibleChars].sort((a, b) => {
        const contextScoreA = contextScores?.get(a.id) || 0;
        const contextScoreB = contextScores?.get(b.id) || 0;
        const localScoreA = localScores.get(a.id) || 0;
        const localScoreB = localScores.get(b.id) || 0;

        const scoreA = contextScoreA + localScoreA;
        const scoreB = contextScoreB + localScoreB;

        return scoreB - scoreA;
      });

      // 为每个匹配的角色创建一个 MatchResult
      for (const char of sortedChars) {
        matches.push({
          item: char,
          matchedName: raw.name,
          index: raw.index,
          length: raw.length,
          type: 'character',
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
export function calculateCharacterScores(
  text: string,
  characters: CharacterSetting[],
): Map<string, number> {
  if (!text || !characters || characters.length === 0) {
    return new Map();
  }

  const nameToCharsMap = new Map<string, CharacterSetting[]>();
  const validNames = new Set<string>();

  for (const char of characters) {
    const allNames = new Set([
      ...getCharacterNameVariants(char.name),
      ...(char.aliases?.flatMap((a) => getCharacterNameVariants(a.name)) || []),
    ]);

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

  if (validNames.size === 0) return new Map();

  const sortedNames = Array.from(validNames).sort((a, b) => b.length - a.length);
  const namePatterns = sortedNames.map((name) => escapeRegex(name)).join('|');
  const regex = new RegExp(`(${namePatterns})`, 'g');

  const scores = new Map<string, number>();

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const matchedText = match[0];
    const possibleChars = nameToCharsMap.get(matchedText);
    if (possibleChars) {
      for (const char of possibleChars) {
        const currentScore = scores.get(char.id) || 0;
        scores.set(char.id, currentScore + 1);
      }
    }
  }

  return scores;
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

  const allMatches: MatchResult<Terminology | CharacterSetting>[] = [
    ...matchTermsInText(text, terms),
    ...matchCharactersInText(text, characters, contextScores),
  ];

  if (allMatches.length === 0) {
    return [{ type: 'text', content: text }];
  }

  // 计算角色在文本中的本地出现次数（用于排序）
  const localScores = new Map<string, number>();
  for (const match of allMatches) {
    if (match.type === 'character') {
      const char = match.item as CharacterSetting;
      const currentScore = localScores.get(char.id) || 0;
      localScores.set(char.id, currentScore + 1);
    }
  }

  // 解决重叠问题并合并相同位置的多角色匹配
  // 1. 按索引排序
  // 2. 索引相同时按长度降序排序（优先保留较长的匹配）
  allMatches.sort((a, b) => {
    if (a.index !== b.index) {
      return a.index - b.index;
    }
    return b.length - a.length;
  });

  // 合并相同位置的多个角色匹配
  // Map<positionKey, { match: MatchResult, characters: CharacterSetting[] }>
  const positionMap = new Map<string, {
    match: MatchResult<Terminology | CharacterSetting>;
    characters: CharacterSetting[];
  }>();

  for (const match of allMatches) {
    const positionKey = `${match.index}-${match.length}`;
    
    if (match.type === 'character') {
      const char = match.item as CharacterSetting;
      const existing = positionMap.get(positionKey);
      
      if (existing) {
        // 如果已存在，添加角色到列表（避免重复）
        const charIdSet = new Set(existing.characters.map(c => c.id));
        if (!charIdSet.has(char.id)) {
          existing.characters.push(char);
        }
      } else {
        // 创建新条目
        positionMap.set(positionKey, {
          match,
          characters: [char],
        });
      }
    } else {
      // 术语：直接添加，不合并
      positionMap.set(positionKey, {
        match,
        characters: [],
      });
    }
  }

  // 对每个位置的角色列表按出现次数排序（上下文得分 + 本地得分）
  for (const entry of positionMap.values()) {
    if (entry.characters.length > 1) {
      entry.characters.sort((a, b) => {
        const contextScoreA = contextScores?.get(a.id) || 0;
        const contextScoreB = contextScores?.get(b.id) || 0;
        const localScoreA = localScores.get(a.id) || 0;
        const localScoreB = localScores.get(b.id) || 0;

        const scoreA = contextScoreA + localScoreA;
        const scoreB = contextScoreB + localScoreB;

        // 按得分降序排序（出现次数多的在前）
        return scoreB - scoreA;
      });
    }
  }

  // 过滤重叠匹配（不同位置之间的重叠）
  const filteredMatches: Array<{
    match: MatchResult<Terminology | CharacterSetting>;
    characters: CharacterSetting[];
  }> = [];
  
  for (const entry of positionMap.values()) {
    let hasOverlap = false;

    for (const existing of filteredMatches) {
      const currentEnd = entry.match.index + entry.match.length;
      const existingEnd = existing.match.index + existing.match.length;

      // 检查是否有重叠（但允许相同位置的多个角色）
      if (entry.match.index !== existing.match.index || entry.match.length !== existing.match.length) {
        if (
          (entry.match.index >= existing.match.index && entry.match.index < existingEnd) ||
          (currentEnd > existing.match.index && currentEnd <= existingEnd) ||
          (entry.match.index <= existing.match.index && currentEnd >= existingEnd)
        ) {
          hasOverlap = true;
          break;
        }
      }
    }

    if (!hasOverlap) {
      filteredMatches.push(entry);
    }
  }

  // 再次按索引排序（确保顺序正确）
  filteredMatches.sort((a, b) => a.match.index - b.match.index);

  // 构建节点数组
  const nodes: HighlightNode[] = [];
  let lastIndex = 0;

  for (const entry of filteredMatches) {
    const match = entry.match;
    
    // 添加匹配项前面的普通文本
    if (match.index > lastIndex) {
      nodes.push({
        type: 'text',
        content: text.substring(lastIndex, match.index),
      });
    }

    // 添加匹配项
    if (match.type === 'term') {
      nodes.push({
        type: 'term',
        content: match.matchedName,
        term: match.item as Terminology,
      });
    } else {
      // 角色匹配：包含所有匹配的角色
      const characters = entry.characters;
      if (characters.length > 0) {
        const firstCharacter = characters[0];
        nodes.push({
          type: 'character',
          content: match.matchedName,
          ...(firstCharacter ? { character: firstCharacter } : {}), // 第一个角色用于向后兼容
          characters: characters, // 所有匹配的角色
        });
      }
    }

    lastIndex = match.index + match.length;
  }

  // 添加剩余的普通文本
  if (lastIndex < text.length) {
    nodes.push({
      type: 'text',
      content: text.substring(lastIndex),
    });
  }

  return nodes;
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

/**
 * 统计名称（及其变体）在文本中出现的次数
 * 优先匹配较长的名称以避免重复计数
 * @param text 文本
 * @param names 名称列表
 * @returns 出现次数
 */
export function countNamesInText(text: string, names: string[]): number {
  if (!text || !names || names.length === 0) return 0;

  // 过滤空值并按长度降序排序
  const sortedNames = names
    .filter((n) => n && n.trim())
    .map((n) => n.trim())
    .sort((a, b) => b.length - a.length);

  if (sortedNames.length === 0) return 0;

  const namePatterns = sortedNames.map((n) => escapeRegex(n)).join('|');
  const regex = new RegExp(`(${namePatterns})`, 'g');

  const matches = text.match(regex);
  return matches ? matches.length : 0;
}
