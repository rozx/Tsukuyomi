import type { AppLocale } from 'src/models/locale';
import { agentText, translateText } from 'src/i18n/translate';
import type { TaskStatus, TaskType } from '../utils/task-types';
import { MAX_TRANSLATION_BATCH_SIZE } from 'src/services/ai/constants';
export function taskPromptLabel(task: TaskType, locale: AppLocale): string {
  return agentText(`aiState.labels.${task}`);
}
export function statusCall(status: TaskStatus): string {
  return `update_task_status(${JSON.stringify({ status })})`;
}
export function getPlanningLoopPrompt(
  taskType: TaskType,
  brief: boolean,
  loop: boolean,
  locale: AppLocale = 'zh-CN',
): string {
  return agentText(
    loop ? 'aiState.planningLoop' : brief ? 'aiState.briefContinue' : 'aiState.planningContinue',
    loop
      ? { task: taskPromptLabel(taskType, locale), transition: statusCall('working') }
      : brief
        ? {}
        : { transition: statusCall('working') },
  );
}
export function getWorkingLoopPrompt(taskType: TaskType, locale: AppLocale = 'zh-CN'): string {
  const changed =
    taskType === 'translation'
      ? ''
      : agentText('aiState.noChanges', { transition: statusCall('end') });
  return agentText('aiState.workingLoop', {
    task: taskPromptLabel(taskType, locale),
    max: MAX_TRANSLATION_BATCH_SIZE,
    changed,
  });
}
export function getWorkingFinishedPrompt(taskType: TaskType, locale: AppLocale = 'zh-CN'): string {
  return agentText('aiState.finished', {
    task: taskPromptLabel(taskType, locale),
    transition: statusCall(taskType === 'translation' ? 'review' : 'end'),
    note: taskType === 'translation' ? '' : agentText('aiState.noReview'),
  });
}
export function getWorkingContinuePrompt(taskType: TaskType, locale: AppLocale = 'zh-CN'): string {
  return agentText('aiState.continue', {
    task: taskPromptLabel(taskType, locale),
    transition: statusCall(taskType === 'translation' ? 'review' : 'end'),
  });
}
export function getMissingParagraphsPrompt(
  taskType: TaskType,
  ids: string[],
  locale: AppLocale = 'zh-CN',
): string {
  return agentText('aiState.missing', {
    task: taskPromptLabel(taskType, locale),
    count: ids.length,
    ids: ids.map((id) => JSON.stringify(id)).join(', '),
    max: MAX_TRANSLATION_BATCH_SIZE,
  });
}
export function getReviewLoopPrompt(_taskType: TaskType, locale: AppLocale = 'zh-CN'): string {
  return agentText('aiState.reviewLoop', { transition: statusCall('end') });
}
export function getStatusRestrictedToolPrompt(
  tool: string,
  status: TaskStatus,
  taskType?: TaskType,
  locale: AppLocale = 'zh-CN',
): string {
  return agentText('aiState.restricted', {
    tool,
    status,
    stages: taskType === 'translation' ? 'planning / review' : 'planning',
  });
}
export function getUnauthorizedToolPrompt(
  taskType: TaskType,
  tool: string,
  locale: AppLocale = 'zh-CN',
): string {
  return agentText('aiState.unauthorized', {
    tool,
    task: taskPromptLabel(taskType, locale),
  });
}
export function getToolLimitReachedPrompt(
  tool: string,
  limit: number,
  locale: AppLocale = 'zh-CN',
): string {
  return agentText('aiState.limit', { tool, limit });
}
export function getBriefPlanningToolWarningPrompt(locale: AppLocale = 'zh-CN'): string {
  return agentText('aiState.repeated');
}
