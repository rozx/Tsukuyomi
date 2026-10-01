import { translateText } from 'src/i18n/translate';
import type { AppLocale } from 'src/models/locale';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { MessageKey } from 'src/i18n/types';

/** AI 任务状态变化时弹出的 toast（固定文案按界面语言渲染，模型名与错误原文保持原样）。 */
export interface TaskStatusToast {
  severity: 'error' | 'warn';
  summary: string;
  detail: string;
  life: number;
}

const TASK_TYPE_KEYS = {
  translation: 'appUi.taskTypes.translation',
  proofreading: 'appUi.taskTypes.proofreading',
  polish: 'appUi.taskTypes.polish',
  termsTranslation: 'appUi.taskTypes.termsTranslation',
  assistant: 'appUi.taskTypes.assistant',
  config: 'appUi.taskTypes.config',
  other: 'appUi.taskTypes.other',
} as const satisfies Record<AIProcessingTask['type'], MessageKey>;

function taskTypeLabel(type: AIProcessingTask['type'], locale: AppLocale): string {
  const key = TASK_TYPE_KEYS[type];
  // 历史任务可能带有未知类型，按原值显示
  return key ? translateText(locale, key) : type;
}

export function taskErrorToast(task: AIProcessingTask, locale: AppLocale): TaskStatusToast {
  return {
    severity: 'error',
    summary: translateText(locale, 'appUi.taskToast.failed'),
    detail: translateText(locale, 'appUi.taskToast.failedDetail', {
      model: task.modelName,
      type: taskTypeLabel(task.type, locale),
      message: task.message || translateText(locale, 'appUi.taskToast.unknownError'),
    }),
    life: 5000,
  };
}

function cancelToast(detail: string, locale: AppLocale): TaskStatusToast {
  return {
    severity: 'warn',
    summary: translateText(locale, 'appUi.taskToast.cancelled'),
    detail,
    life: 3000,
  };
}

function cancelDetail(task: AIProcessingTask, locale: AppLocale): string {
  return translateText(locale, 'appUi.taskToast.cancelledDetail', {
    model: task.modelName,
    type: taskTypeLabel(task.type, locale),
  });
}

/** 多个助手任务同时取消时合并为一条提示，其余任务逐条提示。 */
export function taskCancelToasts(
  cancelledTasks: AIProcessingTask[],
  locale: AppLocale,
): TaskStatusToast[] {
  const assistant = cancelledTasks.filter((t) => t.type === 'assistant');
  const others = cancelledTasks.filter((t) => t.type !== 'assistant');
  const toasts: TaskStatusToast[] = [];
  const [firstAssistant] = assistant;
  if (assistant.length > 1) {
    const detail = translateText(locale, 'appUi.taskToast.assistantCancelled', {
      count: assistant.length,
    });
    toasts.push(cancelToast(detail, locale));
  } else if (firstAssistant) {
    toasts.push(cancelToast(cancelDetail(firstAssistant, locale), locale));
  }
  for (const task of others) toasts.push(cancelToast(cancelDetail(task, locale), locale));
  return toasts;
}
