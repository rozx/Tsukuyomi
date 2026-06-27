import type { ActionInfo } from 'src/services/ai/tools/types';

/**
 * 生产性工具集合（用于状态循环检测）
 * 这些工具调用表示 AI 正在积极获取上下文信息
 */
export const PRODUCTIVE_TOOLS = new Set([
  'list_terms',
  'list_characters',
  'list_memories',
  'search_memories',
  'get_chapter_info',
  'get_book_info',
  'get_term',
  'get_character',
  'get_memory',
]);

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
 * 判断 action 是否为 create / update 且匹配指定 entity
 */
function isCreateOrUpdateEntity(action: ActionInfo, entity: ActionInfo['entity']): boolean {
  return (action.type === 'create' || action.type === 'update') && action.entity === entity;
}

/**
 * 收集 create / update 的命名实体（术语 / 角色）
 */
function collectNamedEntities(
  actions: ActionInfo[],
  entity: 'term' | 'character',
): Array<{ name: string; translation: string }> {
  const out: Array<{ name: string; translation: string }> = [];
  for (const action of actions) {
    if (isCreateOrUpdateEntity(action, entity) && 'name' in action.data) {
      const data = action.data as { name: string; translation?: string };
      out.push({ name: data.name, translation: extractTranslation(data.translation) });
    }
  }
  return out;
}

/**
 * 收集 create 的记忆
 */
function collectCreatedMemories(actions: ActionInfo[]): Array<{ id: string; summary: string }> {
  const out: Array<{ id: string; summary: string }> = [];
  for (const action of actions) {
    if (
      action.type === 'create' &&
      action.entity === 'memory' &&
      'summary' in action.data &&
      'id' in action.data
    ) {
      const data = action.data as { id: string; summary?: string };
      out.push({ id: data.id, summary: data.summary || '' });
    }
  }
  return out;
}

/**
 * 仅在存在更新时构造 PlanningContextUpdate（保持可选属性语义）
 */
function buildPlanningContextUpdate(
  newTerms: Array<{ name: string; translation: string }>,
  newCharacters: Array<{ name: string; translation: string }>,
  updatedMemories: Array<{ id: string; summary: string }>,
): PlanningContextUpdate | undefined {
  if (newTerms.length === 0 && newCharacters.length === 0 && updatedMemories.length === 0) {
    return undefined;
  }
  return {
    ...(newTerms.length > 0 ? { newTerms } : {}),
    ...(newCharacters.length > 0 ? { newCharacters } : {}),
    ...(updatedMemories.length > 0 ? { updatedMemories } : {}),
  };
}

/**
 * 检测规划上下文是否需要更新
 * @param actions 收集的 actions
 * @returns 规划上下文更新信息（如果需要更新）
 */
export function detectPlanningContextUpdate(
  actions: ActionInfo[],
): PlanningContextUpdate | undefined {
  return buildPlanningContextUpdate(
    collectNamedEntities(actions, 'term'),
    collectNamedEntities(actions, 'character'),
    collectCreatedMemories(actions),
  );
}
