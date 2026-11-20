import type { ToastMessageWithHistoryOptions } from 'src/composables/useToastHistory';
import { countUniqueActions } from 'src/composables/book-details/useActionInfoToast';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { AppLocale } from 'src/models/locale';
import type { TaskQueueItem, TaskQueueKind } from 'src/models/task-queue';
import type { ChapterTaskRunResult } from 'src/services/chapter-task/chapter-task-executor';
import { translateText } from 'src/i18n/translate';
import { localizedErrorMessage } from 'src/utils/localized-error';

/**
 * 批量任务（翻译 / 润色 / 校对全章）完成后的详情文案：「成功处理 N 个段落」，
 * AI 执行了术语 / 角色操作时附加「并执行了 X 个术语操作、Y 个角色操作」。
 */
function bulkTaskCompletionDetail(
  kind: TaskQueueKind,
  count: number,
  actions: ActionInfo[] | undefined,
  locale: AppLocale,
): string {
  const detail = translateText(locale, `bookUi.chapterTask.${kind}BulkDetail`, { count });
  const actionList = actions ?? [];
  if (actionList.length === 0) return detail;
  const { terms, characters } = countUniqueActions(actionList);
  const parts: string[] = [];
  if (terms > 0) parts.push(translateText(locale, 'bookUi.chapterTask.termActions', { count: terms }));
  if (characters > 0)
    parts.push(translateText(locale, 'bookUi.chapterTask.characterActions', { count: characters }));
  if (parts.length === 0) return detail;
  return translateText(locale, 'bookUi.chapterTask.actionsSuffix', {
    detail,
    parts: parts.join(translateText(locale, 'bookUi.chapterTask.actionsJoin')),
  });
}

/** 手动来源任务完成时的提示 */
export function completionToast(
  item: TaskQueueItem,
  result: ChapterTaskRunResult,
  locale: AppLocale,
): ToastMessageWithHistoryOptions {
  if (result.targetCount === 0 && item.kind === 'translation') {
    return {
      severity: 'info',
      summary: translateText(locale, 'bookUi.chapterTask.nothingToTranslate'),
      detail: translateText(locale, 'bookUi.chapterTask.allTranslated'),
      life: 3000,
    };
  }
  return {
    severity: 'success',
    summary: translateText(locale, `bookUi.chapterTask.${item.kind}Done`),
    detail: bulkTaskCompletionDetail(item.kind, result.appliedCount, result.actions, locale),
    life: 3000,
  };
}

/** 手动来源任务失败时的提示 */
export function failureToast(
  item: TaskQueueItem,
  error: unknown,
  locale: AppLocale,
): ToastMessageWithHistoryOptions {
  return {
    severity: 'error',
    summary: translateText(locale, `bookUi.chapterTask.${item.kind}Failed`),
    detail: localizedErrorMessage(error, locale, 'bookUi.chapterTask.unknownError'),
    life: 5000,
  };
}

/** 手动来源任务被停止时的提示 */
export function cancelledToast(
  item: TaskQueueItem,
  locale: AppLocale,
): ToastMessageWithHistoryOptions {
  return {
    severity: 'warn',
    summary: translateText(locale, 'appUi.taskToast.cancelled'),
    detail: translateText(locale, `taskQueueUi.kind.${item.kind}`),
    life: 3000,
  };
}

/** 翻译中途停止或失败、但已保存部分段落时的提示 */
export function partialSaveToast(
  aborted: boolean,
  appliedCount: number,
  locale: AppLocale,
): ToastMessageWithHistoryOptions {
  return {
    severity: aborted ? 'info' : 'warn',
    summary: translateText(
      locale,
      aborted ? 'bookUi.chapterTask.cancelledPartial' : 'bookUi.chapterTask.interruptedPartial',
    ),
    detail: translateText(locale, 'bookUi.chapterTask.savedPartialDetail', { count: appliedCount }),
    life: 5000,
  };
}

/** 「全部停止」只提示一次 */
export function stoppedAllToast(count: number, locale: AppLocale): ToastMessageWithHistoryOptions {
  return {
    severity: 'info',
    summary: translateText(locale, 'taskQueueUi.stoppedAll', { count }),
    life: 3000,
  };
}

export interface BatchStats {
  done: number;
  failed: number;
  cancelled: number;
}

/** 批量任务全部结束时的汇总提示 */
export function batchSummaryToast(
  stats: BatchStats,
  locale: AppLocale,
): ToastMessageWithHistoryOptions {
  return {
    severity: stats.failed > 0 ? 'warn' : 'success',
    summary: translateText(locale, 'taskQueueUi.batchSummary'),
    detail: translateText(locale, 'taskQueueUi.batchSummaryDetail', {
      done: stats.done,
      failed: stats.failed,
      cancelled: stats.cancelled,
    }),
    life: 5000,
  };
}
