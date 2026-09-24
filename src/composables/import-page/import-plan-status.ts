/**
 * 导入方案的整体状态：决定方案页头部的状态标签、说明，以及能否生成或确认导入。
 */
import type { ImportPlan } from 'src/models/import';

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
}

type Base = Omit<ImportPlanStatus, 'canPreview' | 'canApply'>;

function describePlan(plan: ImportPlan, input: StatusInput): Base {
  const pending =
    plan.conflicts.length + (plan.replacements ?? []).filter((entry) => !entry.confirmed).length;
  if (input.applied)
    return {
      kind: 'applied',
      label: '已导入',
      severity: 'success',
      message: '这个方案已写入书库。书籍没有后续修改前，可以在下方导入记录中撤销。',
      pending,
    };
  if (plan.draftRevision !== input.draftRevision)
    return {
      kind: 'stale',
      label: '已过时',
      severity: 'warn',
      message: '草稿在生成方案后又有修改，请重新生成方案再确认。',
      pending,
    };
  if (pending)
    return {
      kind: 'conflicts',
      label: `待处理 ${pending} 项`,
      severity: 'warn',
      message: '处理下方的待处理项后才能导入，每次处理都会更新草稿并重新生成方案。',
      pending,
    };
  if (plan.summary && !plan.summary.hasChanges)
    return {
      kind: 'unchanged',
      label: '无变化',
      severity: 'secondary',
      message: '方案与书库现状一致，没有需要写入的内容。',
      pending,
    };
  return {
    kind: 'ready',
    label: '可以导入',
    severity: 'success',
    message: '检查下方的变化，确认无误后导入。确认前不会写入书库。',
    pending,
  };
}

export function importPlanStatus(input: StatusInput): ImportPlanStatus {
  const canPreview = !input.blocked;
  if (!input.plan)
    return {
      kind: 'none',
      label: '尚未生成',
      severity: 'secondary',
      message: input.blocked || '整理好草稿后生成方案，检查实际变化再决定是否导入。',
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
