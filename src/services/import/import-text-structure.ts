import { validateImportToolArguments } from './import-tool-arguments';
import { importStructureSchema } from './import-structure-tools';
import type { ImportRunContext } from 'src/models/import';
import type {
  ImportStructureInput,
  ImportStructureSummary,
  ImportTextStructureBatch,
} from 'src/models/import-text-structure';
import { ImportRepository } from './import-repository';
import type { ImportTaskMutationOptions } from './import-repository';
import { ImportParsingClient } from './import-parsing-client';
import { structureContent } from './import-structure-content';
import { buildStructurePlan } from './import-structure-plan';
import { invalidateImportPreview } from './import-draft-service';
import { validateStructurePlan } from './import-structure-validation';

type Finish = ImportTaskMutationOptions<ImportStructureSummary>['finish'];
function active(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('拆章已取消', 'AbortError');
}

export class ImportTextStructureService {
  constructor(private readonly parser = new ImportParsingClient()) {}

  async prepare(
    run: ImportRunContext,
    input: ImportStructureInput,
    finish?: Finish,
    signal?: AbortSignal,
  ): Promise<ImportStructureSummary> {
    active(signal);
    validateImportToolArguments(importStructureSchema, input);
    const task = await ImportRepository.getDraftTask(run, input.base_draft_revision);
    const resource = await ImportRepository.getResource(run.taskId, input.resource_id);
    if (resource?.kind !== 'extraction')
      throw new Error('INVALID_CONTENT_REF: 请指定已保存的正文提取资源');
    const snapshot = await ImportRepository.getResource(run.taskId, resource.snapshotId);
    const format = snapshot?.kind === 'snapshot' && snapshot.inspection?.format;
    if (!['text', 'markdown'].includes(format || '') || resource.separator !== '')
      throw new Error('UNSUPPORTED_FORMAT: 文本拆章仅支持 TXT／Markdown 提取结果');
    const source = await ImportRepository.getSource(run.taskId, resource.sourceId);
    if (source.currentSnapshotId !== resource.snapshotId)
      throw new Error('SOURCE_CHANGED: 来源快照已变化，请重新提取和预览');
    if (source.purpose === 'metadata-only')
      throw new Error('METADATA_ONLY: 元信息来源不能作为正文');
    const { value } = await this.parser.run(
      {
        kind: 'structure',
        text: structureContent(resource).text,
        format: format as 'text' | 'markdown',
        rules: input.rules,
      },
      signal ? { signal } : {},
    );
    const batch = buildStructurePlan(resource, value, input, task.draft, source.name);
    return ImportRepository.mutateTask(
      run.taskId,
      async (current, tx) => {
        active(signal);
        if (current.draft.revision !== input.base_draft_revision)
          throw new Error('DRAFT_CHANGED: 草稿已变化，请重新预览');
        await validateStructurePlan(current, tx, batch);
        active(signal);
        await tx.objectStore('import-resources').add({
          id: batch.summary.batchId,
          taskId: run.taskId,
          sourceId: source.id,
          kind: 'text-structure-batch',
          batch,
          createdAt: Date.now(),
        });
        return batch.summary;
      },
      { run, ...(finish ? { finish } : {}) },
    );
  }

  private async batch(taskId: string, batchId: string): Promise<ImportTextStructureBatch> {
    const resource = await ImportRepository.getResource(taskId, batchId);
    if (resource?.kind !== 'text-structure-batch')
      throw new Error('BATCH_NOT_FOUND: 文本结构方案不存在');
    return resource.batch;
  }

  async read(
    taskId: string,
    batchId: string,
    view: 'chapters' | 'excluded' = 'chapters',
    offset = 0,
    limit = 50,
  ) {
    if (
      !['chapters', 'excluded'].includes(view) ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new Error('INVALID_PAGE: 拆章方案分页无效');
    const batch = await this.batch(taskId, batchId);
    const items = view === 'chapters' ? batch.items : batch.excluded;
    return {
      ...batch.summary,
      rules: batch.input.rules,
      replaceChapterIds: batch.input.replace_chapter_ids ?? [],
      view,
      offset,
      total: items.length,
      items: items.slice(offset, offset + limit),
      ...(offset + limit < items.length ? { nextOffset: offset + limit } : {}),
      ...(batch.appliedRevision !== undefined
        ? { applied: true, draftRevision: batch.appliedRevision }
        : {}),
    };
  }

  async apply(
    run: ImportRunContext,
    batchId: string,
    finish?: Finish,
    signal?: AbortSignal,
  ): Promise<ImportStructureSummary> {
    return ImportRepository.mutateTask(
      run.taskId,
      async (current, tx) => {
        active(signal);
        const resource = await tx.objectStore('import-resources').get(batchId);
        if (resource?.taskId !== run.taskId || resource.kind !== 'text-structure-batch')
          throw new Error('BATCH_NOT_FOUND: 文本结构方案不存在或不属于当前任务');
        const batch = resource.batch;
        if (batch.appliedRevision !== undefined)
          return { ...batch.summary, applied: true, draftRevision: batch.appliedRevision };
        if (current.draft.revision !== batch.input.base_draft_revision)
          throw new Error('DRAFT_CHANGED: 草稿已变化，请重新预览');
        const chapters = await validateStructurePlan(current, tx, batch);
        for (const volume of batch.volumes)
          if (!current.draft.volumes.some((v) => v.id === volume.id))
            current.draft.volumes.push(volume);
        const replaced = new Set(batch.input.replace_chapter_ids ?? []);
        const first = current.draft.chapters.findIndex((c) => replaced.has(c.id));
        const before = current.draft.chapters
          .slice(0, first < 0 ? current.draft.chapters.length : first)
          .filter((c) => !replaced.has(c.id));
        const after =
          first < 0 ? [] : current.draft.chapters.slice(first).filter((c) => !replaced.has(c.id));
        current.draft.chapters = [...before, ...chapters, ...after];
        current.draft.revision++;
        invalidateImportPreview(current);
        batch.appliedRevision = current.draft.revision;
        active(signal);
        await tx.objectStore('import-resources').put(resource);
        return { ...batch.summary, applied: true, draftRevision: current.draft.revision };
      },
      { run, ...(finish ? { finish } : {}) },
    );
  }
}
