import { describe, expect, it } from 'vitest';
import { importPlanStatus } from 'src/composables/import-page/import-plan-status';
import type { ImportPlan } from 'src/models/import';

function plan(partial: Partial<ImportPlan> = {}): ImportPlan {
  return {
    draftRevision: 3,
    conflicts: [],
    replacements: [],
    summary: {
      selectedChapters: 2,
      insertedParagraphs: 10,
      revisedParagraphs: 0,
      movedParagraphs: 0,
      removedParagraphs: 0,
      clearedParagraphs: 0,
      clearedVersions: 0,
      hasChanges: true,
      partial: false,
    },
    ...partial,
  } as ImportPlan;
}

const base = { draftRevision: 3, applied: false, blocked: '' };

describe('导入方案状态', () => {
  it('没有方案时提示生成；被运行或问题阻塞时说明原因', () => {
    expect(importPlanStatus({ ...base, plan: null })).toMatchObject({
      kind: 'none',
      canApply: false,
      canPreview: true,
    });
    const blocked = importPlanStatus({ ...base, plan: null, blocked: '请先回答月詠的问题' });
    expect(blocked).toMatchObject({ kind: 'none', canPreview: false });
    expect(blocked.message).toContain('请先回答');
  });

  it('草稿与方案版本一致、无冲突、有变化时可以导入', () => {
    expect(importPlanStatus({ ...base, plan: plan() })).toMatchObject({
      kind: 'ready',
      canApply: true,
      canPreview: true,
    });
  });

  it('草稿在生成后修改则方案过时，不能导入', () => {
    expect(importPlanStatus({ ...base, draftRevision: 4, plan: plan() })).toMatchObject({
      kind: 'stale',
      canApply: false,
    });
  });

  it('冲突与未确认的多段替换合计为待处理项', () => {
    const status = importPlanStatus({
      ...base,
      plan: plan({
        conflicts: [{ code: 'CHAPTER_MATCH_REQUIRED', message: 'x' }],
        replacements: [
          { signature: 'a', confirmed: false },
          { signature: 'b', confirmed: true },
        ] as NonNullable<ImportPlan['replacements']>,
      }),
    });
    expect(status).toMatchObject({ kind: 'conflicts', pending: 2, canApply: false });
    expect(status.label).toContain('2');
  });

  it('方案与书库一致时没有可导入的变化', () => {
    const summary = { ...plan().summary!, hasChanges: false };
    expect(importPlanStatus({ ...base, plan: plan({ summary }) })).toMatchObject({
      kind: 'unchanged',
      canApply: false,
    });
  });

  it('已导入的方案即使草稿版本随后变化也显示已导入，不再显示过时', () => {
    expect(
      importPlanStatus({ ...base, draftRevision: 5, applied: true, plan: plan() }),
    ).toMatchObject({ kind: 'applied', canApply: false });
  });

  it('运行中或等待回答时可导入的方案也暂不能确认', () => {
    const status = importPlanStatus({ ...base, plan: plan(), blocked: '月詠正在整理' });
    expect(status).toMatchObject({ kind: 'ready', canApply: false, canPreview: false });
    expect(status.message).toContain('月詠正在整理');
  });
});
