import type { ImportOperation, ImportPlan, ImportTask } from 'src/models/import';
import { conciseErrorText } from 'src/services/import/import-error-text';

export interface ImportFeedback {
  severity: 'success' | 'error' | 'info' | 'warn';
  summary: string;
  detail?: string;
}

const ACTION_NAMES = {
  create: '创建导入任务',
  rename: '重命名任务',
  delete: '删除导入任务',
  'add-source': '添加来源',
  'edit-draft': '保存草稿',
  metadata: '更新书籍信息',
  'choose-novel': '选择小说',
  answer: '保存回答',
  resolve: '处理导入冲突',
  preview: '生成导入方案',
  apply: '导入',
  revert: '撤销导入',
  run: '整理导入草稿',
  pause: '暂停导入',
  compact: '压缩对话',
} as const;
export type ImportAction = keyof typeof ACTION_NAMES;

const SUCCESS_MESSAGES: Partial<Record<ImportAction, string>> = {
  create: '导入任务已创建',
  rename: '任务名称已保存',
  delete: '导入任务已删除',
  'add-source': '来源已添加',
  'edit-draft': '草稿已保存',
  metadata: '书籍信息已更新',
  'choose-novel': '已选择本次小说',
  answer: '回答已保存',
  compact: '对话已压缩',
};

export function importSuccess(action: ImportAction): ImportFeedback | undefined {
  const summary = SUCCESS_MESSAGES[action];
  return summary
    ? {
        severity: 'success',
        summary,
        ...(action === 'add-source' ? { detail: '来源已登记，可让月詠继续读取和整理。' } : {}),
      }
    : undefined;
}

export function importFailure(action: ImportAction, error: string): ImportFeedback {
  return {
    severity: 'error',
    summary: `${ACTION_NAMES[action]}失败`,
    detail: conciseErrorText(error.replace(/^[A-Z_]+:\s*/, '')),
  };
}

export function importApplicationFeedback(operation: ImportOperation): ImportFeedback {
  const reverting = operation.state === 'reverted';
  const summary = reverting ? '已撤销导入' : '导入成功';
  if (operation.pendingMaintenance.length)
    return {
      severity: 'warn',
      summary,
      detail: '书库变更已保存，部分缓存或索引维护尚未完成。',
    };
  return {
    severity: 'success',
    summary,
    detail: reverting
      ? '已恢复本次导入前的书库状态。'
      : `已将 ${operation.plan.summary?.selectedChapters ?? operation.plan.chapters.length} 章写入书库${operation.plan.summary?.partial ? '，本次为部分导入' : ''}。`,
  };
}

export function importPlanFeedback(plan: ImportPlan): ImportFeedback {
  return plan.conflicts.length
    ? {
        severity: 'warn',
        summary: '导入方案仍有待处理项',
        detail: `有 ${plan.conflicts.length} 项需要处理，请检查方案。`,
      }
    : {
        severity: 'success',
        summary: '导入方案已生成',
        detail: '请检查方案并确认后再写入书库。',
      };
}

export function importRunFeedback(task: ImportTask): ImportFeedback | undefined {
  if (task.state === 'ready')
    return { severity: 'success', summary: '导入草稿已就绪', detail: '请检查导入方案并确认应用。' };
  if (task.state === 'waiting_user')
    return {
      severity: 'info',
      summary: '导入任务需要你的回答',
      detail: '请在导入对话区完成必要选择后继续。',
    };
  if (task.state === 'failed')
    return importFailure('run', task.lastError?.message ?? '请查看任务中的错误详情。');
  if (task.lastError && ['CONTEXT_LIMIT', 'TOOL_LIMIT'].includes(task.lastError.code))
    return {
      severity: 'warn',
      summary: '导入整理已暂停',
      detail: task.lastError.message,
    };
  return undefined;
}

export function importPauseFeedback(task: ImportTask): ImportFeedback {
  return task.state === 'pausing'
    ? {
        severity: 'info',
        summary: '正在暂停导入任务',
        detail: '正在等待当前操作结束，已保存的进度会保留。',
      }
    : { severity: 'info', summary: '导入任务已暂停', detail: '已保存进度，可以稍后继续。' };
}
