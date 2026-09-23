import type { ImportRunContext } from 'src/models/import';
import type {
  ImportDraftBatch,
  ImportDraftBatchInput,
  ImportDraftBatchSummary,
} from 'src/models/import-draft-batch';
import { ImportRepository, checkImportRun } from './import-repository';
import type { ImportTaskMutationOptions } from './import-repository';
import { ImportParsingClient } from './import-parsing-client';
import { prepareDraftBatchChanges } from './import-draft-batch-selection';
import { invalidateImportPreview } from './import-draft-service';
import { importTransactionValidator } from './import-draft-validation';
import { ImportLibraryReader } from './import-library-reader';

type Finish = ImportTaskMutationOptions<ImportDraftBatchSummary>['finish'];

export class ImportDraftBatchService {
  constructor(private readonly parser = new ImportParsingClient()) {}

  async prepare(
    run: ImportRunContext,
    input: ImportDraftBatchInput,
    finish?: Finish,
    signal?: AbortSignal,
  ): Promise<ImportDraftBatchSummary> {
    const task = await ImportRepository.getTask(run.taskId);
    if (!task) throw new Error('TASK_NOT_FOUND: 导入任务不存在');
    checkImportRun(task, run);
    if (task.draft.revision !== input.base_draft_revision)
      throw new Error('DRAFT_CHANGED: 草稿已变化，请重新预览');
    const changes = await prepareDraftBatchChanges(task.id, task.draft, input, this.parser, signal);
    const batchId = crypto.randomUUID();
    const summary: ImportDraftBatchSummary = {
      success: true,
      batchId,
      draftRevision: task.draft.revision,
      affected: changes.chapters.length + changes.volumes.length,
      matches: changes.matches,
      examples: changes.examples,
    };
    const batch: ImportDraftBatch = {
      input,
      chapters: changes.chapters,
      volumes: changes.volumes,
      summary,
    };
    return ImportRepository.mutateTask(
      task.id,
      async (current, tx) => {
        if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
        if (current.draft.revision !== input.base_draft_revision)
          throw new Error('DRAFT_CHANGED: 草稿已变化，请重新预览');
        await tx.objectStore('import-resources').add({
          id: batchId,
          taskId: task.id,
          sourceId: '',
          kind: 'draft-edit-batch',
          batch,
          createdAt: Date.now(),
        });
        return summary;
      },
      { run, ...(finish ? { finish } : {}) },
    );
  }

  async apply(
    run: ImportRunContext,
    batchId: string,
    finish?: Finish,
    signal?: AbortSignal,
  ): Promise<ImportDraftBatchSummary> {
    const task = await ImportRepository.getTask(run.taskId);
    if (!task) throw new Error('TASK_NOT_FOUND: 导入任务不存在');
    const books = new Map();
    if (task.draft.target.kind === 'existing') {
      const id = task.draft.target.bookId;
      books.set(id, await ImportLibraryReader.readBook(id));
    }
    return ImportRepository.mutateTask(
      run.taskId,
      async (current, tx) => {
        if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
        const resource = await tx.objectStore('import-resources').get(batchId);
        if (resource?.taskId !== run.taskId || resource.kind !== 'draft-edit-batch')
          throw new Error('BATCH_NOT_FOUND: 草稿批次不存在或不属于当前任务');
        const batch = resource.batch;
        if (batch.appliedRevision !== undefined)
          return { ...batch.summary, draftRevision: batch.appliedRevision };
        if (current.draft.revision !== batch.input.base_draft_revision)
          throw new Error('DRAFT_CHANGED: 草稿已变化，请重新预览');
        const validator = importTransactionValidator(run.taskId, tx, books);
        for (const chapter of batch.chapters) {
          if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
          const { match, ...editable } = chapter;
          const checked = await validator.chapter(current.draft, editable, 'agent');
          const index = current.draft.chapters.findIndex((c) => c.id === chapter.id);
          current.draft.chapters[index] = {
            ...checked,
            inferredTitle: chapter.inferredTitle,
            inferredStructure: chapter.inferredStructure,
            ...(match ? { match } : {}),
          };
        }
        for (const volume of batch.volumes) {
          const index = current.draft.volumes.findIndex((v) => v.id === volume.id);
          current.draft.volumes[index] = volume;
        }
        if (batch.summary.affected) {
          current.draft.revision++;
          invalidateImportPreview(current);
        }
        if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
        batch.appliedRevision = current.draft.revision;
        await tx.objectStore('import-resources').put(resource);
        return { ...batch.summary, draftRevision: current.draft.revision };
      },
      { run, ...(finish ? { finish } : {}) },
    );
  }
}
