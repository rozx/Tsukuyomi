import { describe, expect, it } from 'vitest';
import {
  importStepAction,
  importStepStates,
  STEP_SECTION,
} from 'src/composables/import-page/import-steps';

describe('导入三步：来源 → 整理 → 导入', () => {
  it('没有来源时停在第一步', () => {
    expect(importStepStates({ sourceCount: 0, taskState: 'draft' })).toEqual({
      current: 'sources',
      done: { sources: false, organize: false, import: false },
    });
  });

  it('有来源、还没生成方案时停在整理', () => {
    for (const taskState of ['draft', 'running', 'paused', 'waiting_user', 'failed'] as const) {
      expect(importStepStates({ sourceCount: 2, taskState }).current).toBe('organize');
    }
  });

  it('方案已生成（可预览 / 导入中）时停在导入；导入完成后三步都完成', () => {
    expect(importStepStates({ sourceCount: 1, taskState: 'ready' })).toEqual({
      current: 'import',
      done: { sources: true, organize: true, import: false },
    });
    expect(importStepStates({ sourceCount: 1, taskState: 'applying' }).current).toBe('import');
    expect(importStepStates({ sourceCount: 1, taskState: 'applied' })).toEqual({
      current: 'import',
      done: { sources: true, organize: true, import: true },
    });
  });

  it('每一步对应工作台的一个分区', () => {
    expect(STEP_SECTION).toEqual({ sources: 'sources', organize: 'draft', import: 'plan' });
  });
});

describe('每一步底部的主按钮', () => {
  const idle = { running: false, canContinue: true, sourceCount: 1, chapterCount: 0 };

  it('来源：让月詠开始整理；没有来源或不能运行时不可点', () => {
    expect(importStepAction({ ...idle, section: 'sources' })).toEqual({
      kind: 'continue',
      disabled: false,
    });
    expect(importStepAction({ ...idle, section: 'sources', sourceCount: 0 })).toEqual({
      kind: 'continue',
      disabled: true,
    });
    expect(importStepAction({ ...idle, section: 'sources', canContinue: false })).toEqual({
      kind: 'continue',
      disabled: true,
    });
  });

  it('整理：已有章节时生成导入方案，还没有章节时继续整理', () => {
    expect(importStepAction({ ...idle, section: 'draft', chapterCount: 3 })).toEqual({
      kind: 'preview',
      disabled: false,
    });
    expect(importStepAction({ ...idle, section: 'draft' })).toEqual({
      kind: 'continue',
      disabled: false,
    });
  });

  it('整理：中途暂停或还有待执行的调用时，即使已有章节也先继续整理', () => {
    expect(
      importStepAction({ ...idle, section: 'draft', chapterCount: 3, resumable: true }),
    ).toEqual({ kind: 'continue', disabled: false });
    expect(
      importStepAction({
        ...idle,
        section: 'draft',
        chapterCount: 3,
        resumable: true,
        canContinue: false,
      }),
    ).toEqual({ kind: 'continue', disabled: true });
  });

  it('运行中：来源与整理都显示暂停', () => {
    for (const section of ['sources', 'draft'] as const) {
      expect(
        importStepAction({ ...idle, section, running: true, chapterCount: 3, canContinue: false }),
      ).toEqual({ kind: 'pause', disabled: false });
    }
  });

  it('导入：方案页自带确认导入，不再显示底部主按钮', () => {
    expect(importStepAction({ ...idle, section: 'plan', chapterCount: 3 })).toBeNull();
  });
});
