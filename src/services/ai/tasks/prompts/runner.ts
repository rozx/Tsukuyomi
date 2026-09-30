import { agentText } from 'src/i18n/translate';
import type { TaskStatus, TaskType } from '../utils/task-types';
import { MAX_TRANSLATION_BATCH_SIZE } from 'src/services/ai/constants';
export function taskPromptLabel(task: TaskType): string {
  return agentText(`aiState.labels.${task}`);
}
export function statusCall(status: TaskStatus): string {
  return `update_task_status(${JSON.stringify({ status })})`;
}
export function getPlanningLoopPrompt(taskType: TaskType, brief: boolean, loop: boolean): string {
  return agentText(
    loop ? 'aiState.planningLoop' : brief ? 'aiState.briefContinue' : 'aiState.planningContinue',
    loop
      ? { task: taskPromptLabel(taskType), transition: statusCall('working') }
      : brief
        ? {}
        : { transition: statusCall('working') },
  );
}
export function getWorkingLoopPrompt(taskType: TaskType): string {
  const changed =
    taskType === 'translation'
      ? ''
      : agentText('aiState.noChanges', { transition: statusCall('end') });
  return agentText('aiState.workingLoop', {
    task: taskPromptLabel(taskType),
    max: MAX_TRANSLATION_BATCH_SIZE,
    changed,
  });
}
export function getWorkingFinishedPrompt(taskType: TaskType): string {
  return agentText('aiState.finished', {
    task: taskPromptLabel(taskType),
    transition: statusCall(taskType === 'translation' ? 'review' : 'end'),
    note: taskType === 'translation' ? '' : agentText('aiState.noReview'),
  });
}
export function getWorkingContinuePrompt(taskType: TaskType): string {
  return agentText('aiState.continue', {
    task: taskPromptLabel(taskType),
    transition: statusCall(taskType === 'translation' ? 'review' : 'end'),
  });
}
export function getMissingParagraphsPrompt(taskType: TaskType, ids: string[]): string {
  return agentText('aiState.missing', {
    task: taskPromptLabel(taskType),
    count: ids.length,
    ids: ids.map((id) => JSON.stringify(id)).join(', '),
    max: MAX_TRANSLATION_BATCH_SIZE,
  });
}
export function getReviewLoopPrompt(_taskType: TaskType): string {
  return agentText('aiState.reviewLoop', { transition: statusCall('end') });
}
export function getStatusRestrictedToolPrompt(
  tool: string,
  status: TaskStatus,
  taskType?: TaskType,
): string {
  return agentText('aiState.restricted', {
    tool,
    status,
    stages: taskType === 'translation' ? 'planning / review' : 'planning',
  });
}
export function getUnauthorizedToolPrompt(taskType: TaskType, tool: string): string {
  return agentText('aiState.unauthorized', {
    tool,
    task: taskPromptLabel(taskType),
  });
}
export function getToolLimitReachedPrompt(tool: string, limit: number): string {
  return agentText('aiState.limit', { tool, limit });
}
export function getBriefPlanningToolWarningPrompt(): string {
  return agentText('aiState.repeated');
}
