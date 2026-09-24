import { describe, expect, it } from 'vitest';
import './setup';
import { draft } from './import-fixtures';
import { ImportWorkerFixture } from './import-worker-fixture';
import { ImportParsingClient } from '../services/import/import-parsing-client';
import { ImportTextStructureService } from '../services/import/import-text-structure';
import { ImportRepository } from '../services/import/import-repository';
import { ImportContentService } from '../services/import/import-content-service';
import { ImportDraftService } from '../services/import/import-draft-service';
import { ImportSourceService } from '../services/import/import-source-service';
import { ImportExtractionService } from '../services/import/import-extraction-service';
import { getDB } from '../utils/indexed-db';
import type { ImportRunContext } from '../models/import';

async function fixture(text = '说明😀\r\n第1章 开始\r\n正文甲\r\n第2章 结束\r\n正文乙\r\n') {
  const value = await draft(text);
  const task = (await ImportRepository.getTask(value.taskId))!;
  const run: ImportRunContext = { taskId: task.id, runId: 'run', runEpoch: 1, modelId: 'm' };
  await (await getDB()).put('import-tasks', { ...task, state: 'running', run, runEpoch: 1 });
  return {
    ...value,
    run,
    service: new ImportTextStructureService(
      new ImportParsingClient(() => new ImportWorkerFixture() as unknown as Worker),
    ),
    input: {
      resource_id: value.ref.resourceId,
      base_draft_revision: 1,
      volume_id: 'draft-v',
      replace_chapter_ids: [value.chapter.id],
      rules: {
        mode: 'regex' as const,
        chapter_pattern: {
          mode: 'regex' as const,
          pattern: '^第\\d+章 (?<title>[^\\r\\n]+)',
          flags: 'm',
        },
      },
    },
  };
}

describe('文本结构方案', () => {
  it('预览不改草稿，分页可检查所有范围；一次替换并保留原文，重复应用不重做', async () => {
    const { service, input, run, taskId } = await fixture();
    const preview = await service.prepare(run, input);
    expect(preview).toMatchObject({ chapters: 3, volumes: 1, unassigned: 1, draftRevision: 1 });
    expect((await ImportRepository.getTask(taskId))?.draft.chapters.map((c) => c.title)).toEqual([
      '原章',
    ]);
    const page = await service.read(taskId, preview.batchId, 'chapters', 1, 1);
    expect(page).toMatchObject({
      total: 3,
      nextOffset: 2,
      items: [{ title: '开始', head: '正文甲\r\n' }],
    });
    expect((await service.read(taskId, preview.batchId, 'excluded', 0, 50)).items).toHaveLength(2);
    expect(await service.apply(run, preview.batchId)).toMatchObject({
      draftRevision: 2,
      applied: true,
    });
    const task = (await ImportRepository.getTask(taskId))!;
    expect(task.draft.chapters.map((c) => [c.title, c.selected])).toEqual([
      ['待归类内容', false],
      ['开始', true],
      ['结束', true],
    ]);
    const texts = await Promise.all(
      task.draft.chapters.map(async (c) =>
        (
          await Promise.all(
            c.content.map((ref) =>
              ImportContentService.resolve(
                taskId,
                ref as Extract<typeof ref, { kind: 'extraction' }>,
              ),
            ),
          )
        ).join(''),
      ),
    );
    expect(texts).toEqual(['说明😀\r\n', '正文甲\r\n', '正文乙\r\n']);
    expect(await service.apply(run, preview.batchId)).toMatchObject({ draftRevision: 2 });
    expect((await ImportRepository.getTask(taskId))?.draft.chapters).toEqual(task.draft.chapters);
    expect(await (await getDB()).count('books')).toBe(0);
  });
  it('重叠必须显式替换；另一次提取同一快照也不能绕过检查', async () => {
    const { service, input, run, taskId, source } = await fixture();
    const { replace_chapter_ids: _replace, ...append } = input;
    await expect(service.prepare(run, append)).rejects.toThrow('CONTENT_OVERLAP');
    const extracted = await new ImportExtractionService(
      new ImportParsingClient(() => undefined),
    ).prepareExtraction(taskId, [{ sourceId: source.id }]);
    await ImportRepository.saveStep(taskId, extracted);
    await expect(
      service.prepare(run, { ...append, resource_id: extracted.results[0]!.contentId! }),
    ).rejects.toThrow('CONTENT_OVERLAP');
    await expect(
      service.prepare(run, { ...input, replace_chapter_ids: ['不存在'] }),
    ).rejects.toThrow('CHAPTER_NOT_FOUND');
  });
  it('来源刷新、作品范围与元信息用途都在预览和应用时校验', async () => {
    const { service, input, run, taskId, source } = await fixture();
    const prepared = await service.prepare(run, input);
    const db = await getDB();
    const saved = await ImportRepository.getSource(taskId, source.id);
    await db.put('import-sources', { ...saved, currentSnapshotId: 'new-snapshot' });
    await expect(service.apply(run, prepared.batchId)).rejects.toThrow('SOURCE_CHANGED');
    await expect(service.prepare(run, input)).rejects.toThrow('SOURCE_CHANGED');
    await db.put('import-sources', { ...saved, purpose: 'metadata-only' });
    await expect(service.prepare(run, input)).rejects.toThrow('METADATA_ONLY');
    await db.put('import-sources', saved);
    const task = (await ImportRepository.getTask(taskId))!;
    task.draft.novelScope.candidates[0]!.sourceIds = [];
    await db.put('import-tasks', task);
    await expect(service.prepare(run, input)).rejects.toThrow('SOURCE_SCOPE');
    await expect(service.apply(run, prepared.batchId)).rejects.toThrow('SOURCE_SCOPE');
    expect((await ImportRepository.getTask(taskId))?.draft.chapters.map((c) => c.title)).toEqual([
      '原章',
    ]);
  });
  it('过期草稿、跨任务、暂停及取消不会部分保存；已移除来源仍可按保留资源整理', async () => {
    const f = await fixture();
    const p = await f.service.prepare(f.run, f.input);
    const other = await fixture();
    await expect(f.service.apply(other.run, p.batchId)).rejects.toThrow('BATCH_NOT_FOUND');
    const running = (await ImportRepository.getTask(f.taskId))!;
    const { run: _run, ...stopped } = running;
    await (await getDB()).put('import-tasks', { ...stopped, state: 'paused' });
    await ImportSourceService.remove(f.taskId, f.source.id);
    await (await getDB()).put('import-tasks', running);
    await f.service.apply(f.run, p.batchId);
    const next = await f.service.prepare(f.run, {
      ...f.input,
      base_draft_revision: 2,
      replace_chapter_ids: (await ImportRepository.getTask(f.taskId))!.draft.chapters.map(
        (c) => c.id,
      ),
    });
    await ImportDraftService.edit(
      f.taskId,
      {
        baseDraftRevision: 2,
        operations: [{ op: 'upsert_volume', id: 'draft-v', title: '用户卷名' }],
      },
      { run: f.run, actor: 'user' },
    );
    await expect(f.service.apply(f.run, next.batchId)).rejects.toThrow('DRAFT_CHANGED');
    const controller = new AbortController();
    controller.abort();
    await expect(
      other.service.prepare(other.run, other.input, undefined, controller.signal),
    ).rejects.toThrow();
    const db = await getDB();
    const task = (await ImportRepository.getTask(other.taskId))!;
    await db.put('import-tasks', { ...task, state: 'paused' });
    await expect(other.service.apply(other.run, p.batchId)).rejects.toThrow('RUN_STALE');
  });
  it('Markdown 元信息定义被记录，原文不丢失，空章保持未选中', async () => {
    const { service, input, run, taskId } = await fixture(
      '## 第一章\r\n正文😀\r\n\r\n[ref]: https://example.com\r\n\r\n## 空章\r\n## 第三章\r\n末尾',
    );
    const p = await service.prepare(run, {
      ...input,
      rules: { mode: 'markdown', chapter_level: 2 },
    });
    expect(p.empty).toBe(1);
    expect((await service.read(taskId, p.batchId, 'excluded')).items).toContainEqual(
      expect.objectContaining({ reason: 'Markdown 元信息定义' }),
    );
    await service.apply(run, p.batchId);
    const chapters = (await ImportRepository.getTask(taskId))!.draft.chapters;
    expect(chapters[1]).toMatchObject({ title: '空章', status: 'missing', selected: false });
    expect(
      (
        await Promise.all(
          chapters[0]!.content.map((ref) =>
            ImportContentService.resolve(
              taskId,
              ref as Extract<typeof ref, { kind: 'extraction' }>,
            ),
          ),
        )
      ).join(''),
    ).toBe('正文😀\r\n\r\n');
  });

  it('百章只返回少量示例，完整原文通过引用保留，分页与重试不截断', async () => {
    const chapters = Array.from(
      { length: 100 },
      (_, i) => `第${i + 1}章 标题${i + 1}\n${'正文😀'.repeat(25)}${i + 1}\n`,
    );
    const { service, input, run, taskId } = await fixture(chapters.join(''));
    const p = await service.prepare(run, input);
    expect(p).toMatchObject({ chapters: 100, unassigned: 0, empty: 0 });
    expect(p.examples).toHaveLength(5);
    expect(JSON.stringify(p).length).toBeLessThan(5000);
    const last = await service.read(taskId, p.batchId, 'chapters', 99, 100);
    expect(last.items).toHaveLength(1);
    expect(last).not.toHaveProperty('nextOffset');
    await service.apply(run, p.batchId);
    const draft = (await ImportRepository.getTask(taskId))!.draft;
    expect(draft.chapters).toHaveLength(100);
    const end = draft.chapters.at(-1)!;
    expect(
      (
        await Promise.all(
          end.content.map((ref) =>
            ImportContentService.resolve(
              taskId,
              ref as Extract<typeof ref, { kind: 'extraction' }>,
            ),
          ),
        )
      ).join(''),
    ).toBe('正文😀'.repeat(25) + '100\n');
  });
  it('保留标题也不能把只有标题的空章标为正文就绪', async () => {
    const { service, input, run, taskId } = await fixture('第1章 空\n第2章 有正文\n正文');
    const p = await service.prepare(run, {
      ...input,
      rules: { ...input.rules, include_headings: true },
    });
    expect(p.empty).toBe(1);
    await service.apply(run, p.batchId);
    expect((await ImportRepository.getTask(taskId))!.draft.chapters[0]).toMatchObject({
      status: 'missing',
      selected: false,
    });
  });
});
