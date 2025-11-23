import type { Terminology, CharacterSetting } from 'src/types/novel';
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
export function matchTermsInText(
  text: string,
  terms: Terminology[],
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
 * @returns 匹配结果数组
 */
export function matchCharactersInText(
  text: string,
  characters: CharacterSetting[],
): MatchResult<CharacterSetting>[] {
  if (!text || !characters || characters.length === 0) {
    return [];
  }

  const matches: MatchResult<CharacterSetting>[] = [];
  
  // 创建名称变体到角色的映射
  const nameToCharacterMap = new Map<string, CharacterSetting>();
  const validNames = new Set<string>();

  for (const char of characters) {
    // 获取所有名称变体（包括全名、去空格版本、分割部分）
    const allNames = new Set([
      ...getCharacterNameVariants(char.name),
      ...(char.aliases?.flatMap((a) => getCharacterNameVariants(a.name)) || []),
    ]);

    for (const name of allNames) {
      if (name && name.trim()) {
        const trimmedName = name.trim();
        validNames.add(trimmedName);
        // 如果同一个名字对应多个角色，这里会覆盖。
        // 在实际应用中，通常按长度优先匹配，如果名字完全一样，可能需要更复杂的逻辑，
        // 但这里简化为最后一个覆盖，或者我们可以保留第一个。
        // 考虑到 ParagraphCard 之前的逻辑是覆盖，这里保持一致。
        if (!nameToCharacterMap.has(trimmedName)) {
            nameToCharacterMap.set(trimmedName, char);
        }
      }
    }
  }

  if (validNames.size === 0) return [];

  // 按长度降序排序
  const sortedNames = Array.from(validNames).sort((a, b) => b.length - a.length);
  const namePatterns = sortedNames.map((name) => escapeRegex(name)).join('|');
  const regex = new RegExp(`(${namePatterns})`, 'g');

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const matchedText = match[0];
    const char = nameToCharacterMap.get(matchedText);
    if (char) {
      matches.push({
        item: char,
        matchedName: matchedText,
        index: match.index,
        length: matchedText.length,
        type: 'character',
      });
    }
  }

  return matches;
}

/**
 * 查找并处理所有匹配项（术语和角色），解决重叠问题，返回用于高亮的节点列表
 * @param text 文本
 * @param terms 术语列表
 * @param characters 角色列表
 * @returns 高亮节点数组
 */
export function parseTextForHighlighting(
  text: string,
  terms: Terminology[] = [],
  characters: CharacterSetting[] = [],
): HighlightNode[] {
  if (!text) return [];

  const allMatches: MatchResult<Terminology | CharacterSetting>[] = [
    ...matchTermsInText(text, terms),
    ...matchCharactersInText(text, characters),
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
  matches.forEach(m => uniqueMap.set(m.item.id, m.item));
  return Array.from(uniqueMap.values());
}

/**
 * 获取文本中包含的所有唯一角色
 * @param text 文本
 * @param characters 角色列表
 * @returns 唯一的角色列表
 */
export function findUniqueCharactersInText(text: string, characters: CharacterSetting[]): CharacterSetting[] {
  const matches = matchCharactersInText(text, characters);
  const uniqueMap = new Map<string, CharacterSetting>();
  matches.forEach(m => uniqueMap.set(m.item.id, m.item));
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
    .filter(n => n && n.trim())
    .map(n => n.trim())
    .sort((a, b) => b.length - a.length);
  
  if (sortedNames.length === 0) return 0;

  const namePatterns = sortedNames.map(n => escapeRegex(n)).join('|');
  const regex = new RegExp(`(${namePatterns})`, 'g');
  
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

