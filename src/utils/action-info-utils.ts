import type { ActionInfo } from 'src/services/ai/tools/types';
import type { MessageAction } from 'src/stores/chat-sessions';
import type { AppLocale } from 'src/models/locale';
import { translateText } from 'src/i18n/translate';
import type { ActionDetail, ActionDetailsContext } from './action-info/types';
import { detailText } from './action-info/types';
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
 * 操作类型标签（按界面语言渲染；存储只保留 type 代码）
 */
export function actionTypeLabel(locale: AppLocale, type: MessageAction['type']): string {
  return translateText(locale, `activityUi.action.${type}`);
}

/**
 * 实体类型标签（按界面语言渲染；存储只保留 entity 代码）
 */
export function entityTypeLabel(locale: AppLocale, entity: MessageAction['entity']): string {
  return translateText(locale, `activityUi.entity.${entity}`);
}

/**
 * 「操作 + 实体」摘要，如「创建术语」/「Create term」
 */
export function actionSummaryLabel(
  locale: AppLocale,
  type: MessageAction['type'],
  entity: MessageAction['entity'],
): string {
  return translateText(locale, 'activityUi.actionSummary', {
    action: actionTypeLabel(locale, type),
    entity: entityTypeLabel(locale, entity),
  });
}

/**
 * 将 ActionInfo 转换为 MessageAction
 * 按 type / entity / tool_name 分派到各 builder，汇总各自产出的字段。
 */
export function createMessageActionFromActionInfo(action: ActionInfo): MessageAction {
  const actionName = extractActionName(action.data);
  const language = action.execution?.languages.targetLanguage;
  return {
    type: action.type,
    entity: action.entity,
    timestamp: Date.now(),
    ...(language ? { language } : {}),
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
function formatTimestamp(timestamp: number, locale: AppLocale): string {
  return new Date(timestamp).toLocaleString(locale, {
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
  locale: AppLocale = 'zh-CN',
): ActionDetail[] {
  const timeDetail = (): ActionDetail => ({
    label: detailText(locale, 'time'),
    value: formatTimestamp(action.timestamp, locale),
  });
  if (action.nameIsDescription) {
    // 说明与结构化详情是写入时的历史自由文本，原样展示；只重绘自有固定标签
    return [
      { label: detailText(locale, 'description'), value: action.name ?? '' },
      ...(action.descriptionDetails ?? []),
      timeDetail(),
    ];
  }
  const details: ActionDetail[] = [
    { label: detailText(locale, 'actionType'), value: actionTypeLabel(locale, action.type) },
    { label: detailText(locale, 'entityType'), value: entityTypeLabel(locale, action.entity) },
  ];

  if (action.name) {
    details.push({ label: detailText(locale, 'name'), value: action.name });
  }

  if (action.type === 'ask' && action.entity === 'user' && action.tool_name === 'ask_user_batch') {
    appendAskUserBatchDetails(details, action, locale);
  }

  appendNamedEntityDetails(details, action, context, locale);

  if (action.type === 'web_search' || action.type === 'web_fetch') {
    appendWebDetails(details, action, locale);
  }

  if (action.entity === 'todo') {
    appendTodoDetails(details, action, locale);
  }

  if (action.entity === 'translation') {
    appendTranslationDetails(details, action, context, locale);
  }

  if (action.entity === 'memory') {
    appendMemoryDetails(details, action, locale);
  }

  if (action.type === 'read') {
    appendReadDetails(details, action, context, locale);
  }

  if (action.type === 'search') {
    appendSearchDetails(details, action, locale);
  }

  if (action.type === 'update' && action.entity === 'chapter') {
    appendChapterUpdateDetails(details, action, context, locale);
  }

  if (action.type === 'navigate') {
    appendNavigateDetails(details, action, context, locale);
  }

  details.push(timeDetail());

  return details;
}
