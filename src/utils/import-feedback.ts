import type {
  ImportDraftRemoval,
  ImportOperation,
  ImportPlan,
  ImportTask,
} from 'src/models/import';
import type { AppLocale } from 'src/models/locale';
import type { MessageKey } from 'src/i18n/types';
import { translateText } from 'src/i18n/translate';
import { conciseErrorText } from 'src/services/import/import-error-text';
import { importNoticeText } from 'src/services/import/import-error';

export interface ImportFeedback {
  severity: 'success' | 'error' | 'info' | 'warn';
  summary: string;
  detail?: string;
}

const ACTION_NAMES = {
  create: 'importUi.feedback.action.create',
  rename: 'importUi.feedback.action.rename',
  delete: 'importUi.feedback.action.delete',
  'add-source': 'importUi.feedback.action.addSource',
  'remove-source': 'importUi.feedback.action.removeSource',
  'edit-draft': 'importUi.feedback.action.editDraft',
  'delete-draft': 'importUi.feedback.action.deleteDraft',
  metadata: 'importUi.feedback.action.metadata',
  'choose-novel': 'importUi.feedback.action.chooseNovel',
  answer: 'importUi.feedback.action.answer',
  resolve: 'importUi.feedback.action.resolve',
  preview: 'importUi.feedback.action.preview',
  apply: 'importUi.feedback.action.apply',
  revert: 'importUi.feedback.action.revert',
  run: 'importUi.feedback.action.run',
  pause: 'importUi.feedback.action.pause',
  compact: 'importUi.feedback.action.compact',
} as const satisfies Record<string, MessageKey>;
export type ImportAction = keyof typeof ACTION_NAMES;

const SUCCESS_MESSAGES: Partial<Record<ImportAction, MessageKey>> = {
  create: 'importUi.feedback.success.create',
  rename: 'importUi.feedback.success.rename',
  delete: 'importUi.feedback.success.delete',
  'add-source': 'importUi.feedback.success.addSource',
  'remove-source': 'importUi.feedback.success.removeSource',
  'edit-draft': 'importUi.feedback.success.editDraft',
  metadata: 'importUi.feedback.success.metadata',
  'choose-novel': 'importUi.feedback.success.chooseNovel',
  answer: 'importUi.feedback.success.answer',
  compact: 'importUi.feedback.success.compact',
};

/** 通知文字按生成时的界面语言显示（通知是一次性的，不持久化后重投影）。 */
export function importSuccess(
  action: ImportAction,
  locale: AppLocale = 'zh-CN',
): ImportFeedback | undefined {
  const key = SUCCESS_MESSAGES[action];
  return key
    ? {
        severity: 'success',
        summary: translateText(locale, key),
        ...(action === 'add-source'
          ? { detail: translateText(locale, 'importUi.feedback.addSourceDetail') }
          : {}),
      }
    : undefined;
}

export function importFailure(
  action: ImportAction,
  error: string,
  locale: AppLocale = 'zh-CN',
): ImportFeedback {
  return {
    severity: 'error',
    summary: translateText(locale, 'importUi.feedback.failed', {
      action: translateText(locale, ACTION_NAMES[action]),
    }),
    detail: conciseErrorText(error.replace(/^[A-Z_]+:\s*/, ''), locale),
  };
}

const REMOVAL_SUMMARIES = {
  remove_chapter: 'importUi.feedback.removal.chapter',
  remove_volume: 'importUi.feedback.removal.volume',
  clear_structure: 'importUi.feedback.removal.structure',
} as const satisfies Record<ImportDraftRemoval['op'], MessageKey>;

export function importDraftRemovalFeedback(
  removal: ImportDraftRemoval,
  locale: AppLocale = 'zh-CN',
): ImportFeedback {
  return { severity: 'success', summary: translateText(locale, REMOVAL_SUMMARIES[removal.op]) };
}

export function importApplicationFeedback(
  operation: ImportOperation,
  locale: AppLocale = 'zh-CN',
): ImportFeedback {
  const t = (key: MessageKey, values?: Record<string, string | number>) =>
    translateText(locale, key, values);
  const reverting = operation.state === 'reverted';
  const summary = t(reverting ? 'importUi.feedback.reverted' : 'importUi.feedback.applied');
  if (operation.pendingMaintenance.length)
    return { severity: 'warn', summary, detail: t('importUi.feedback.maintenancePending') };
  return {
    severity: 'success',
    summary,
    detail: reverting
      ? t('importUi.feedback.revertedDetail')
      : t('importUi.feedback.appliedDetail', {
          count: operation.plan.summary?.selectedChapters ?? operation.plan.chapters.length,
          partial: operation.plan.summary?.partial ? t('importUi.feedback.partialSuffix') : '',
        }),
  };
}

export function importPlanFeedback(plan: ImportPlan, locale: AppLocale = 'zh-CN'): ImportFeedback {
  const t = (key: MessageKey, values?: Record<string, string | number>) =>
    translateText(locale, key, values);
  return plan.conflicts.length
    ? {
        severity: 'warn',
        summary: t('importUi.feedback.planPending'),
        detail: t('importUi.feedback.planPendingDetail', { count: plan.conflicts.length }),
      }
    : {
        severity: 'success',
        summary: t('importUi.feedback.planReady'),
        detail: t('importUi.feedback.planReadyDetail'),
      };
}

export function importRunFeedback(
  task: ImportTask,
  locale: AppLocale = 'zh-CN',
): ImportFeedback | undefined {
  const t = (key: MessageKey) => translateText(locale, key);
  if (task.state === 'ready')
    return {
      severity: 'success',
      summary: t('importUi.feedback.runReady'),
      detail: t('importUi.feedback.runReadyDetail'),
    };
  if (task.state === 'waiting_user')
    return {
      severity: 'info',
      summary: t('importUi.feedback.runWaiting'),
      detail: t('importUi.feedback.runWaitingDetail'),
    };
  if (task.state === 'failed')
    return importFailure(
      'run',
      task.lastError
        ? importNoticeText(task.lastError, locale)
        : t('importUi.feedback.runFailedDetail'),
      locale,
    );
  if (task.lastError && ['CONTEXT_LIMIT', 'TOOL_LIMIT'].includes(task.lastError.code))
    return {
      severity: 'warn',
      summary: t('importUi.feedback.runPaused'),
      detail: importNoticeText(task.lastError, locale),
    };
  return undefined;
}

export function importPauseFeedback(task: ImportTask, locale: AppLocale = 'zh-CN'): ImportFeedback {
  const t = (key: MessageKey) => translateText(locale, key);
  return task.state === 'pausing'
    ? {
        severity: 'info',
        summary: t('importUi.feedback.pausing'),
        detail: t('importUi.feedback.pausingDetail'),
      }
    : {
        severity: 'info',
        summary: t('importUi.feedback.paused'),
        detail: t('importUi.feedback.pausedDetail'),
      };
}
