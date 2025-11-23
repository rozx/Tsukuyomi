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

  // 4. 解决名称歧义
  // 对于每个名字，选择得分最高的角色。如果得分相同，保留原始顺序（定义的优先顺序）
  const resolvedNameMap = new Map<string, CharacterSetting>();

  for (const [name, possibleChars] of nameToCharsMap.entries()) {
    if (!possibleChars || possibleChars.length === 0) continue;

    if (possibleChars.length === 1) {
      const char = possibleChars[0];
      if (char) resolvedNameMap.set(name, char);
    } else {
      // 复制数组以进行排序，避免修改原始 Map 中的数组
      const sortedChars = [...possibleChars].sort((a, b) => {
        // 综合得分 = 上下文得分（如果存在） + 本地得分
        // 如果提供了上下文得分，通常上下文得分权重更高或更准确反映全局情况
        const contextScoreA = contextScores?.get(a.id) || 0;
        const contextScoreB = contextScores?.get(b.id) || 0;
        const localScoreA = localScores.get(a.id) || 0;
        const localScoreB = localScores.get(b.id) || 0;

        // 简单相加
        const scoreA = contextScoreA + localScoreA;
        const scoreB = contextScoreB + localScoreB;

        return scoreB - scoreA;
      });
      // 取最高分者
      const winner = sortedChars[0];
      if (winner) resolvedNameMap.set(name, winner);
    }
  }

  // 5. 构建最终结果
  const matches: MatchResult<CharacterSetting>[] = [];
  for (const raw of rawMatches) {
    const char = resolvedNameMap.get(raw.name);
    if (char) {
      matches.push({
        item: char,
        matchedName: raw.name,
        index: raw.index,
        length: raw.length,
        type: 'character',
      });
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

  // 解决重叠问题
  // 1. 按索引排序
  // 2. 索引相同时按长度降序排序（优先保留较长的匹配）
  allMatches.sort((a, b) => {
    if (a.index !== b.index) {
      return a.index - b.index;
    }
    return b.length - a.length;
  });

  // 过滤重叠匹配
  const filteredMatches: MatchResult<Terminology | CharacterSetting>[] = [];
  for (let i = 0; i < allMatches.length; i++) {
    const current = allMatches[i];
    if (!current) continue;

    let hasOverlap = false;

    for (const existing of filteredMatches) {
      const currentEnd = current.index + current.length;
      const existingEnd = existing.index + existing.length;

      // 检查是否有重叠
      if (
        (current.index >= existing.index && current.index < existingEnd) ||
        (currentEnd > existing.index && currentEnd <= existingEnd) ||
        (current.index <= existing.index && currentEnd >= existingEnd)
      ) {
        hasOverlap = true;
        break;
      }
    }

    if (!hasOverlap) {
      filteredMatches.push(current);
    }
  }

  // 再次按索引排序（确保顺序正确）
  filteredMatches.sort((a, b) => a.index - b.index);

  // 构建节点数组
  const nodes: HighlightNode[] = [];
  let lastIndex = 0;

  for (const match of filteredMatches) {
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
      nodes.push({
        type: 'character',
        content: match.matchedName,
        character: match.item as CharacterSetting,
      });
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
 * @param text 文本
 * @param characters 角色列表
 * @param contextScores 可选的上下文得分
 * @returns 唯一的角色列表
 */
export function findUniqueCharactersInText(
  text: string,
  characters: CharacterSetting[],
  contextScores?: Map<string, number>,
): CharacterSetting[] {
  const matches = matchCharactersInText(text, characters, contextScores);
  const uniqueMap = new Map<string, CharacterSetting>();
  matches.forEach((m) => uniqueMap.set(m.item.id, m.item));
  return Array.from(uniqueMap.values());
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
