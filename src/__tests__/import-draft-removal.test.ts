import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { ImportDraftService } from '../services/import/import-draft-service';
import { ImportRepository } from '../services/import/import-repository';
import { ImportContentService } from '../services/import/import-content-service';
import { draft } from './import-fixtures';
import { ImportPlanService } from '../services/import/import-plan-service';
import { ImportApplicationService } from '../services/import/import-application-service';
import { ImportLibraryReader } from '../services/import/import-library-reader';
import { webLocksFixture } from './web-locks-fixture';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function fixture() {
  const input = await draft('需要保留的来源原文');
  await ImportDraftService.edit(
    input.taskId,
    {
      baseDraftRevision: 1,
      operations: [
        { op: 'upsert_volume', id: 'v2', title: '第二卷' },
        { op: 'upsert_volume', id: 'empty', title: '空卷' },
        { op: 'upsert_chapter', chapter: { ...input.chapter, id: 'c2', title: '第二章' } },
        {
          op: 'upsert_chapter',
          chapter: { ...input.chapter, id: 'c3', title: '第三章', volumeId: 'v2' },
        },
      ],
    },
    { actor: 'user' },
  );
  return input;
}

describe('删除导入草稿卷章', () => {
  it('月詠仍在运行时拒绝用户删除，包含尚在收尾的运行', async () => {
    const input = await fixture();
    await ImportRepository.mutateTask(input.taskId, (task) => {
      task.state = 'running';
      return Promise.resolve();
    });
    await expect(
      ImportDraftService.edit(
        input.taskId,
        { baseDraftRevision: 2, operations: [{ op: 'clear_structure' }] },
        { actor: 'user' },
      ),
    ).rejects.toThrow('TASK_BUSY');
    await ImportRepository.mutateTask(input.taskId, (task) => {
      task.state = 'paused';
      task.run = { taskId: task.id, runId: 'finishing', runEpoch: task.runEpoch, modelId: 'm' };
      return Promise.resolve();
    });
    await expect(
      ImportDraftService.edit(
        input.taskId,
        {
          baseDraftRevision: 2,
          operations: [{ op: 'remove_chapter', chapterId: input.chapter.id }],
        },
        { actor: 'user' },
      ),
    ).rejects.toThrow('TASK_BUSY');
    expect((await ImportRepository.getTask(input.taskId))!.draft.chapters).toHaveLength(3);
  });

  it('空卷可删除，清空空草稿可重复执行，无效目标不会留下部分删除', async () => {
    const input = await fixture();
    await expect(
      ImportDraftService.edit(
        input.taskId,
        {
          baseDraftRevision: 2,
          operations: [
            { op: 'remove_volume', volumeId: 'draft-v' },
            { op: 'remove_volume', volumeId: 'missing' },
          ],
        },
        { actor: 'user' },
      ),
    ).rejects.toThrow('INVALID_OPERATION');
    expect((await ImportRepository.getTask(input.taskId))!.draft.chapters).toHaveLength(3);
    const empty = await ImportDraftService.edit(
      input.taskId,
      { baseDraftRevision: 2, operations: [{ op: 'remove_volume', volumeId: 'empty' }] },
      { actor: 'user' },
    );
    expect(empty.chapters).toHaveLength(3);
    await ImportDraftService.edit(
      input.taskId,
      { baseDraftRevision: 3, operations: [{ op: 'clear_structure' }] },
      { actor: 'user' },
    );
    const repeated = await ImportDraftService.edit(
      input.taskId,
      { baseDraftRevision: 4, operations: [{ op: 'clear_structure' }] },
      { actor: 'user' },
    );
    expect(repeated.chapters).toEqual([]);
    expect(repeated.volumes).toEqual([]);
  });

  it('删除草稿使旧方案失效，清空已应用的草稿不删除书库或撤销记录', async () => {
    vi.stubGlobal('navigator', { locks: webLocksFixture() });
    const input = await draft('已导入的正文');
    const application = new ImportApplicationService();
    const plan = await ImportPlanService.preview(input.taskId, 1);
    await ImportDraftService.edit(
      input.taskId,
      { baseDraftRevision: 1, operations: [{ op: 'remove_volume', volumeId: 'draft-v' }] },
      { actor: 'user' },
    );
    await expect(
      application.apply(await application.confirmApply(input.taskId, plan.id)),
    ).rejects.toThrow('PLAN_STALE');
    const fresh = await draft('另一个已导入的正文');
    const appliedPlan = await ImportPlanService.preview(fresh.taskId, 1);
    await application.apply(await application.confirmApply(fresh.taskId, appliedPlan.id));
    const before = await ImportLibraryReader.readBook(appliedPlan.targetBookId);
    const task = (await ImportRepository.getTask(fresh.taskId))!;
    await ImportDraftService.edit(
      fresh.taskId,
      { baseDraftRevision: task.draft.revision, operations: [{ op: 'clear_structure' }] },
      { actor: 'user' },
    );
    expect(await ImportLibraryReader.readBook(appliedPlan.targetBookId)).toEqual(before);
    expect(
      (await application.revert(await application.confirmRevert(fresh.taskId, appliedPlan.id)))
        .state,
    ).toBe('reverted');
  });

  it('删除单章保留同卷其他章节和来源原文', async () => {
    const input = await fixture();
    const result = await ImportDraftService.edit(
      input.taskId,
      {
        baseDraftRevision: 2,
        operations: [{ op: 'remove_chapter', chapterId: input.chapter.id }],
      },
      { actor: 'user' },
    );
    expect(result.chapters.map((chapter) => chapter.id)).toEqual(['c2', 'c3']);
    expect(result.volumes).toHaveLength(3);
    expect(await ImportContentService.resolve(input.taskId, input.ref)).toBe('需要保留的来源原文');
  });

  it('删除整卷同时删除卷内章节，保留其他卷、元信息和来源', async () => {
    const input = await fixture();
    const before = (await ImportRepository.getTask(input.taskId))!.draft;
    const result = await ImportDraftService.edit(
      input.taskId,
      {
        baseDraftRevision: 2,
        operations: [{ op: 'remove_volume', volumeId: 'draft-v' }],
      },
      { actor: 'user' },
    );
    expect(result.volumes.map((volume) => volume.id)).toEqual(['v2', 'empty']);
    expect(result.chapters.map((chapter) => chapter.id)).toEqual(['c3']);
    expect(result.metadata).toEqual(before.metadata);
    expect((await ImportRepository.listSources(input.taskId)).items).toHaveLength(1);
  });

  it('清空所有卷章支持上百章，保留书籍信息、导入目标与来源', async () => {
    const input = await fixture();
    await ImportRepository.mutateTask(input.taskId, (task) => {
      task.draft.chapters = Array.from({ length: 200 }, (_, i) => ({
        ...task.draft.chapters[0]!,
        id: `c${i}`,
      }));
      return Promise.resolve();
    });
    const before = (await ImportRepository.getTask(input.taskId))!.draft;
    const result = await ImportDraftService.edit(
      input.taskId,
      {
        baseDraftRevision: 2,
        operations: [{ op: 'clear_structure' }],
      },
      { actor: 'user' },
    );
    expect(result.chapters).toEqual([]);
    expect(result.volumes).toEqual([]);
    expect(result.metadata).toEqual(before.metadata);
    expect(result.target).toEqual(before.target);
    expect(result.novelScope).toEqual(before.novelScope);
    expect(await ImportContentService.resolve(input.taskId, input.ref)).toBe('需要保留的来源原文');
  });
});
