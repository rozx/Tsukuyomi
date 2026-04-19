import type { ActionInfo } from 'src/services/ai/tools/types';
import type { MessageAction } from 'src/stores/chat-sessions';
import type { ActionDetail, ActionDetailsContext } from './action-info/types';
import { appendNamedEntityDetails } from './action-info/named-entity-details';
import { appendTranslationDetails } from './action-info/translation-details';
import { appendMemoryDetails } from './action-info/memory-details';
import {
  appendAskUserBatchDetails,
  appendSearchDetails,
  appendTodoDetails,
  appendWebDetails,
} from './action-info/simple-details';
import { appendReadDetails } from './action-info/read-details';
import {
  appendChapterUpdateDetails,
  appendNavigateDetails,
} from './action-info/navigation-and-update-details';
import {
  buildAskUserFields,
  buildBatchReplaceFields,
  buildChapterUpdateFields,
  buildHelpDocNavigateFields,
  buildMemoryFields,
  buildNavigateFields,
  buildReadFields,
  buildSearchFields,
  buildTodoFields,
  buildTranslationFields,
  buildWebFields,
  extractActionName,
} from './action-info/action-field-builders';

export type { ActionDetail, ActionDetailsContext } from './action-info/types';

/**
 * 操作类型标签映射
 */
export const ACTION_LABELS: Record<MessageAction['type'], string> = {
  create: '创建',
  update: '更新',
  delete: '删除',
  web_search: '网络搜索',
  web_fetch: '网页获取',
  read: '读取',
  navigate: '导航',
  ask: '提问',
  search: '搜索',
};

/**
 * 实体类型标签映射
 */
export const ENTITY_LABELS: Record<MessageAction['entity'], string> = {
  term: '术语',
  character: '角色',
  web: '网络',
  translation: '翻译',
  chapter: '章节',
  paragraph: '段落',
  book: '书籍',
  memory: '记忆',
  todo: '待办事项',
  user: '用户',
  help_doc: '帮助文档',
};

/**
 * 将 ActionInfo 转换为 MessageAction
 * 按 type / entity / tool_name 分派到各 builder，汇总各自产出的字段。
 */
export function createMessageActionFromActionInfo(action: ActionInfo): MessageAction {
  const actionName = extractActionName(action.data);
  return {
    type: action.type,
    entity: action.entity,
    timestamp: Date.now(),
    ...(actionName ? { name: actionName } : {}),
    ...buildWebFields(action),
    ...buildTranslationFields(action),
    ...buildBatchReplaceFields(action),
    ...buildReadFields(action),
    ...buildSearchFields(action),
    ...buildMemoryFields(action),
    ...buildTodoFields(action),
    ...buildNavigateFields(action),
    ...buildHelpDocNavigateFields(action),
    ...buildAskUserFields(action),
    ...buildChapterUpdateFields(action),
  };
}

/**
 * 格式化时间戳为本地时间字符串。
 */
function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * 获取操作详细信息（用于 popover 显示）
 * 按 action 的 type / entity / tool_name 分发到对应的 append* 构建器。
 */
export function getActionDetails(
  action: MessageAction,
  context: ActionDetailsContext,
): ActionDetail[] {
  const details: ActionDetail[] = [
    { label: '操作类型', value: ACTION_LABELS[action.type] },
    { label: '实体类型', value: ENTITY_LABELS[action.entity] },
  ];

  if (action.name) {
    details.push({ label: '名称', value: action.name });
  }

  if (action.type === 'ask' && action.entity === 'user' && action.tool_name === 'ask_user_batch') {
    appendAskUserBatchDetails(details, action);
  }

  appendNamedEntityDetails(details, action, context);

  if (action.type === 'web_search' || action.type === 'web_fetch') {
    appendWebDetails(details, action);
  }

  if (action.entity === 'todo') {
    appendTodoDetails(details, action);
  }

  if (action.entity === 'translation') {
    appendTranslationDetails(details, action, context);
  }

  if (action.entity === 'memory') {
    appendMemoryDetails(details, action);
  }

  if (action.type === 'read') {
    appendReadDetails(details, action, context);
  }

  if (action.type === 'search') {
    appendSearchDetails(details, action);
  }

  if (action.type === 'update' && action.entity === 'chapter') {
    appendChapterUpdateDetails(details, action, context);
  }

  if (action.type === 'navigate') {
    appendNavigateDetails(details, action, context);
  }

  details.push({ label: '操作时间', value: formatTimestamp(action.timestamp) });

  return details;
}
