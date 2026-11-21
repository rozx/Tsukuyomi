/**
 * 导入的三步流程（三端共用的引导）：来源 → 整理 → 导入。
 * 由任务状态推出每一步是否完成、当前停在哪一步，以及正在查看的分区底部该显示哪个主按钮。
 * 纯函数，便于测试；分区（section）沿用工作台的 sources / draft / plan。
 */
import type { ImportTask } from 'src/models/import';
import type { ImportSection } from './useImportPage';

export type ImportStepId = 'sources' | 'organize' | 'import';

/** 每一步对应的工作台分区 */
export const STEP_SECTION: Readonly<Record<ImportStepId, ImportSection>> = {
  sources: 'sources',
  organize: 'draft',
  import: 'plan',
};

/** 方案已生成之后的任务状态：整理这一步算完成 */
const PLANNED_STATES: ReadonlySet<ImportTask['state']> = new Set([
  'ready',
  'applying',
  'applied',
  'reverting',
  'reverted',
]);

export function importStepStates(input: { sourceCount: number; taskState: ImportTask['state'] }): {
  current: ImportStepId;
  done: Record<ImportStepId, boolean>;
} {
  const done = {
    sources: input.sourceCount > 0,
    organize: PLANNED_STATES.has(input.taskState),
    import: input.taskState === 'applied',
  };
  let current: ImportStepId = 'import';
  if (!done.sources) current = 'sources';
  else if (!done.organize) current = 'organize';
  return { current, done };
}

export interface ImportStepAction {
  /** continue：让月詠整理；pause：暂停；preview：生成导入方案 */
  kind: 'continue' | 'pause' | 'preview';
  disabled: boolean;
}

/** 正在查看的分区底部的主按钮；导入方案页自带确认导入，返回 null */
export function importStepAction(input: {
  section: ImportSection;
  running: boolean;
  canContinue: boolean;
  sourceCount: number;
  chapterCount: number;
  /** 中途暂停或还有待执行的工具调用：整理还没做完，先继续而不是生成方案 */
  resumable?: boolean;
  /** 月詠问了必填问题还没回答：与导入方案页一致，先回答才能生成方案 */
  awaitingAnswer?: boolean;
}): ImportStepAction | null {
  if (input.section !== 'sources' && input.section !== 'draft') return null;
  if (input.running) return { kind: 'pause', disabled: false };
  if (input.section === 'draft' && input.chapterCount > 0 && !input.resumable) {
    return { kind: 'preview', disabled: Boolean(input.awaitingAnswer) };
  }
  return { kind: 'continue', disabled: input.sourceCount === 0 || !input.canContinue };
}
