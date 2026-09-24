import { ImportParsingClient } from '../services/import/import-parsing-client';
import { ImportWorkerFixture } from './import-worker-fixture';
import { describe, expect, it } from 'vitest';
import './setup';
import { draft } from './import-fixtures';
import { ImportDraftBatchService } from '../services/import/import-draft-batch';
import { ImportDraftService } from '../services/import/import-draft-service';
import { ImportRepository } from '../services/import/import-repository';
import { ImportPreviewService } from '../services/import/import-preview-service';
import { getDB } from '../utils/indexed-db';
import type { ImportRunContext } from '../models/import';

async function fixture() {
  const value = await draft('甲广告乙广告丙😀\n正文');
  const task = (await ImportRepository.getTask(value.taskId))!;
  const run: ImportRunContext = { taskId: task.id, runId: 'run', runEpoch: 1, modelId: 'm' };
  await (await getDB()).put('import-tasks', { ...task, state: 'running', run, runEpoch: 1 });
  return {
    ...value,
    run,
    service: new ImportDraftBatchService(
      new ImportParsingClient(() => new ImportWorkerFixture() as unknown as Worker),
    ),
  };
}

describe('草稿批量清理与标题修改', () => {
  it('先预览再一次性清理多章，重复执行不重做；第二轮清理仍引用正确原文', async () => {
    const { taskId, run, service, chapter } = await fixture();
    await ImportDraftService.edit(
      taskId,
      {
        baseDraftRevision: 1,
        operations: [
          {
            op: 'upsert_chapter',
            chapter: {
              ...chapter,
              id: 'c2',
              title: '第二章',
              inferredTitle: false,
              inferredStructure: false,
            },
          },
        ],
      },
      { run, actor: 'user' },
    );
    const prepared = await service.prepare(run, {
      base_draft_revision: 2,
      target: 'body',
      scope: {},
      pattern: { mode: 'literal', pattern: '广告' },
      action: 'remove_matches',
    });
    expect(prepared).toMatchObject({ affected: 2, matches: 4, draftRevision: 2 });
    expect((await ImportPreviewService.chapter(taskId, chapter.id)).paragraphs[0]?.text).toContain(
      '广告',
    );
    const applied = await service.apply(run, prepared.batchId);
    expect(applied).toMatchObject({ affected: 2, draftRevision: 3 });
    expect(
      (await ImportRepository.getTask(taskId))?.draft.chapters.find((c) => c.id === 'c2'),
    ).toMatchObject({ inferredTitle: false, inferredStructure: false });
    expect((await ImportPreviewService.chapter(taskId, chapter.id)).paragraphs[0]?.text).toBe(
      '甲乙丙😀',
    );
    expect(await service.apply(run, prepared.batchId)).toMatchObject({ draftRevision: 3 });
    const second = await service.prepare(run, {
      base_draft_revision: 3,
      target: 'body',
      scope: { chapter_ids: [chapter.id] },
      pattern: { mode: 'literal', pattern: '乙丙' },
      action: 'remove_matches',
    });
    await service.apply(run, second.batchId);
    expect((await ImportPreviewService.chapter(taskId, chapter.id)).paragraphs[0]?.text).toBe(
      '甲😀',
    );
    expect((await ImportPreviewService.chapter(taskId, 'c2')).paragraphs[0]?.text).toBe('甲乙丙😀');
    expect(await (await getDB()).count('books')).toBe(0);
  });
  it('按卷、选中状态和标题正则筛选；标题支持捕获组，卷标题同样可批量替换', async () => {
    const { taskId, run, service, chapter } = await fixture();
    await ImportDraftService.edit(
      taskId,
      {
        baseDraftRevision: 1,
        operations: [
          { op: 'upsert_chapter', chapter: { ...chapter, title: '第12章 标题' } },
          {
            op: 'upsert_chapter',
            chapter: { ...chapter, id: 'c2', title: '第13章 保留', selected: false },
          },
        ],
      },
      { run },
    );
    const prepared = await service.prepare(run, {
      base_draft_revision: 2,
      target: 'chapter_title',
      scope: {
        volume_ids: ['draft-v'],
        selected_only: true,
        title: { mode: 'regex', pattern: '^第' },
      },
      pattern: { mode: 'regex', pattern: '^第(\\d+)章' },
      action: 'replace',
      replacement: 'Chapter $1',
    });
    expect(prepared.affected).toBe(1);
    await service.apply(run, prepared.batchId);
    expect((await ImportRepository.getTask(taskId))?.draft.chapters.map((c) => c.title)).toEqual([
      'Chapter 12 标题',
      '第13章 保留',
    ]);
    const volumes = await service.prepare(run, {
      base_draft_revision: 3,
      target: 'volume_title',
      scope: {},
      pattern: { mode: 'regex', pattern: '^卷(.*)$' },
      action: 'replace',
      replacement: '第$1卷',
    });
    await service.apply(run, volumes.batchId);
    expect((await ImportRepository.getTask(taskId))?.draft.volumes[0]?.title).toBe('第一卷');
  });

  it('旧预览、其他任务及停止运行不能应用；零命中不增加版本，整章清空会拒绝', async () => {
    const { taskId, run, service, chapter } = await fixture();
    const input = {
      base_draft_revision: 1,
      target: 'body' as const,
      scope: {},
      pattern: { mode: 'literal' as const, pattern: '广告' },
      action: 'remove_matches' as const,
    };
    const prepared = await service.prepare(run, input);
    const other = await fixture();
    await expect(service.apply(other.run, prepared.batchId)).rejects.toThrow('BATCH_NOT_FOUND');
    await ImportDraftService.edit(
      taskId,
      {
        baseDraftRevision: 1,
        operations: [{ op: 'upsert_chapter', chapter: { ...chapter, title: '用户改名' } }],
      },
      { actor: 'user' },
    );
    await expect(service.apply(run, prepared.batchId)).rejects.toThrow('DRAFT_CHANGED');
    const noMatch = await service.prepare(run, {
      ...input,
      base_draft_revision: 2,
      pattern: { mode: 'literal', pattern: '不存在' },
    });
    expect(await service.apply(run, noMatch.batchId)).toMatchObject({
      affected: 0,
      draftRevision: 2,
    });
    await expect(
      service.prepare(run, {
        ...input,
        base_draft_revision: 2,
        pattern: { mode: 'regex', pattern: '.+', flags: 's' },
      }),
    ).rejects.toThrow('EMPTY_CONTENT');
    await expect(
      service.prepare(run, {
        ...input,
        base_draft_revision: 2,
        scope: { chapter_ids: ['foreign'] },
      }),
    ).rejects.toThrow('INVALID_SCOPE');
    expect((await ImportRepository.getTask(taskId))?.draft.revision).toBe(2);
    const pending = await service.prepare(run, { ...input, base_draft_revision: 2 });
    await ImportRepository.mutateTask(taskId, (task) => {
      task.state = 'paused';
      delete task.run;
      return Promise.resolve();
    });
    await expect(service.apply(run, pending.batchId)).rejects.toThrow('RUN_STALE');
  });

  it('200 章只提交一个草稿版本，已移除来源仍可清理保存的正文', async () => {
    const { taskId, run, service, chapter, source } = await fixture();
    for (let offset = 0; offset < 2; offset++) {
      await ImportDraftService.edit(
        taskId,
        {
          baseDraftRevision: offset + 1,
          operations: Array.from({ length: 100 }, (_, i) => ({
            op: 'upsert_chapter' as const,
            chapter: { ...chapter, id: `c${offset * 100 + i}` },
          })),
        },
        { run },
      );
    }
    const prepared = await service.prepare(run, {
      base_draft_revision: 3,
      target: 'body',
      scope: { title: { mode: 'regex', pattern: '^原章$' } },
      pattern: { mode: 'regex', pattern: '广告' },
      action: 'remove_matches',
    });
    expect(prepared).toMatchObject({ affected: 201, matches: 402 });
    expect(prepared.examples).toHaveLength(5);
    const db = await getDB();
    await db.put('import-sources', {
      ...(await ImportRepository.getSource(taskId, source.id)),
      removedAt: Date.now(),
    });
    expect(await service.apply(run, prepared.batchId)).toMatchObject({
      draftRevision: 4,
      affected: 201,
    });
    expect((await ImportPreviewService.chapter(taskId, 'c199')).paragraphs[0]?.text).toBe(
      '甲乙丙😀',
    );
  });

  it('应用前取消不会保存任何修改', async () => {
    const { taskId, run, service } = await fixture();
    const prepared = await service.prepare(run, {
      base_draft_revision: 1,
      target: 'body',
      scope: {},
      pattern: { mode: 'literal', pattern: '广告' },
      action: 'remove_matches',
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      service.apply(run, prepared.batchId, undefined, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect((await ImportRepository.getTask(taskId))?.draft.revision).toBe(1);
  });
});
