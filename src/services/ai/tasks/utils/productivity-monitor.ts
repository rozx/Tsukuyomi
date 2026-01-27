import type { ActionInfo } from 'src/services/ai/tools/types';

/**
 * 生产性工具列表（用于状态循环检测）
 * 这些工具调用表示 AI 正在积极获取上下文信息
 */
export const PRODUCTIVE_TOOLS = [
  'list_terms',
  'list_characters',
  'list_memories',
  'search_memory_by_keywords',
  'get_chapter_info',
  'get_book_info',
  'get_term',
  'get_character',
  'get_memory',
  'get_recent_memories',
];

/**
 * 工具调用限制配置（基于工具类型）
 */
export const TOOL_CALL_LIMITS: Record<string, number> = {
  list_terms: 3, // 术语表最多调用 3 次
  list_characters: 3, // 角色表最多调用 3 次（允许在 planning、working、review 阶段各调用一次）
  list_memories: 3, // Memory 列表通常只需要调用一次
  get_book_info: 2, // 书籍信息最多调用 2 次
  list_chapters: 2, // 章节列表最多调用 2 次
  default: Infinity, // 其他工具无限制
};

/**
 * 规划上下文更新信息
 */
export interface PlanningContextUpdate {
  newTerms?: Array<{ name: string; translation: string }>;
  newCharacters?: Array<{ name: string; translation: string }>;
  updatedMemories?: Array<{ id: string; summary: string }>;
}

function extractTranslation(translation: unknown): string {
  if (typeof translation === 'string') {
    return translation;
  }
  if (typeof translation === 'object' && translation !== null) {
    return (translation as { text?: string }).text || '';
  }
  return '';
}

/**
 * 检测规划上下文是否需要更新
 * @param actions 收集的 actions
 * @returns 规划上下文更新信息（如果需要更新）
 */
export function detectPlanningContextUpdate(
  actions: ActionInfo[],
): PlanningContextUpdate | undefined {
  const newTerms: Array<{ name: string; translation: string }> = [];
  const newCharacters: Array<{ name: string; translation: string }> = [];
  const updatedMemories: Array<{ id: string; summary: string }> = [];

  for (const action of actions) {
    // 检测新创建的术语
    if (
      (action.type === 'create' || action.type === 'update') &&
      action.entity === 'term' &&
      'name' in action.data
    ) {
      const termData = action.data as { name: string; translation?: string };
      const translation = extractTranslation(termData.translation);
      newTerms.push({
        name: termData.name,
        translation,
      });
    }

    // 检测新创建的角色
    if (
      (action.type === 'create' || action.type === 'update') &&
      action.entity === 'character' &&
      'name' in action.data
    ) {
      const charData = action.data as { name: string; translation?: string };
      const translation = extractTranslation(charData.translation);
      newCharacters.push({
        name: charData.name,
        translation,
      });
    }

    // 检测新创建的记忆
    if (
      action.type === 'create' &&
      action.entity === 'memory' &&
      'summary' in action.data &&
      'id' in action.data
    ) {
      const memoryData = action.data as { id: string; summary?: string };
      updatedMemories.push({
        id: memoryData.id,
        summary: memoryData.summary || '',
      });
    }
  }

  // 如果有任何更新，返回更新信息
  if (newTerms.length > 0 || newCharacters.length > 0 || updatedMemories.length > 0) {
    return {
      ...(newTerms.length > 0 ? { newTerms } : {}),
      ...(newCharacters.length > 0 ? { newCharacters } : {}),
      ...(updatedMemories.length > 0 ? { updatedMemories } : {}),
    };
  }

  return undefined;
}
