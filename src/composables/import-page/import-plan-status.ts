/**
 * 导入方案的整体状态：决定方案页头部的状态标签、说明，以及能否生成或确认导入。
 */
import type { ImportPlan } from 'src/models/import';
import type { AppLocale } from 'src/models/locale';
import { translateText } from 'src/i18n/translate';

export type ImportPlanStatusKind =
  | 'none'
  | 'applied'
  | 'stale'
  | 'conflicts'
  | 'unchanged'
  | 'ready';

export interface ImportPlanStatus {
  kind: ImportPlanStatusKind;
  label: string;
  severity: 'success' | 'warn' | 'secondary' | 'info';
  message: string;
  /** 冲突与未确认的多段替换合计。 */
  pending: number;
  canPreview: boolean;
  canApply: boolean;
}

interface StatusInput {
  plan: ImportPlan | null;
  /** 当前草稿版本。 */
  draftRevision: number;
  /** 方案对应的操作已应用到书库。 */
  applied: boolean;
  /** 不能生成或确认的原因（运行中、等待回答），空串表示不受阻。 */
  blocked: string;
  /** 状态文字的界面语言，缺省为简中。 */
  locale?: AppLocale;
}

type Base = Omit<ImportPlanStatus, 'canPreview' | 'canApply'>;

function describePlan(plan: ImportPlan, input: StatusInput): Base {
  const t = (key: Parameters<typeof translateText>[1], values?: Record<string, number>) =>
    translateText(input.locale ?? 'zh-CN', key, values);
  const pending =
    plan.conflicts.length + (plan.replacements ?? []).filter((entry) => !entry.confirmed).length;
  if (input.applied)
    return {
      kind: 'applied',
      label: t('importUi.planStatus.applied'),
      severity: 'success',
      message: t('importUi.planStatus.appliedMessage'),
      pending,
    };
  if (plan.draftRevision !== input.draftRevision)
    return {
      kind: 'stale',
      label: t('importUi.planStatus.stale'),
      severity: 'warn',
      message: t('importUi.planStatus.staleMessage'),
      pending,
    };
  if (pending)
    return {
      kind: 'conflicts',
      label: t('importUi.planStatus.conflicts', { count: pending }),
      severity: 'warn',
      message: t('importUi.planStatus.conflictsMessage'),
      pending,
    };
  if (plan.summary && !plan.summary.hasChanges)
    return {
      kind: 'unchanged',
      label: t('importUi.planStatus.unchanged'),
      severity: 'secondary',
      message: t('importUi.planStatus.unchangedMessage'),
      pending,
    };
  return {
    kind: 'ready',
    label: t('importUi.planStatus.ready'),
    severity: 'success',
    message: t('importUi.planStatus.readyMessage'),
    pending,
  };
}

export function importPlanStatus(input: StatusInput): ImportPlanStatus {
  const canPreview = !input.blocked;
  if (!input.plan)
    return {
      kind: 'none',
      label: translateText(input.locale ?? 'zh-CN', 'importUi.planStatus.none'),
      severity: 'secondary',
      message:
        input.blocked || translateText(input.locale ?? 'zh-CN', 'importUi.planStatus.noneMessage'),
      pending: 0,
      canPreview,
      canApply: false,
    };
  const base = describePlan(input.plan, input);
  const blockedMessage = input.blocked && base.kind !== 'applied' ? input.blocked : '';
  return {
    ...base,
    message: blockedMessage || base.message,
    canPreview,
    canApply: base.kind === 'ready' && !input.blocked,
  };
}
