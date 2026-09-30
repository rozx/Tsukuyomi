import { importCancelled, importError } from './import-error';

import type { ImportBatchInput, ImportChapterBatch } from 'src/models/import-batch';
import type { ImportResource, ImportRunContext } from 'src/models/import';
import { ImportRepository } from './import-repository';
import type { ImportTaskMutationOptions } from './import-repository';
import { importTransactionValidator } from './import-draft-validation';
import { invalidateImportPreview } from './import-draft-service';
import { batchSourceIds, filterChapterBatchInput } from './import-batch-sources';
import { chapterBatchProgress } from './import-batch-state';

export class ImportChapterBatchService {
  static async prepare(
    run: ImportRunContext,
    input: ImportBatchInput,
    finish: ImportTaskMutationOptions<Record<string, unknown>>['finish'],
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    input = await filterChapterBatchInput(run.taskId, input, signal);
    return ImportRepository.mutateTask(
      run.taskId,
      async (task, tx) => {
        if (signal?.aborted) throw importCancelled('cancelled');
        if (task.draft.revision !== input.base_draft_revision)
          throw importError('DRAFT_CHANGED', 'draftChangedTheDraftChangedRereadIt', {});
        if (!task.draft.volumes.some((volume) => volume.id === input.volume_id))
          throw importError(
            'INVALID_OPERATION',
            'invalidOperationTheDestinationVolumeDoesNotExist',
            {},
          );
        const ids = await batchSourceIds(run.taskId, input, tx);
        if (!ids.length || ids.length > 500 || new Set(ids).size !== ids.length)
          throw importError('BATCH_LIMIT', 'batchLimitABatchRequiresDistinctSources', {});
        const validator = importTransactionValidator(run.taskId, tx);
        const batch: ImportChapterBatch = {
          id: crypto.randomUUID(),
          rules: input.rules ?? {},
          draftRevision: task.draft.revision + 1,
          scopeRevision: task.draft.novelScope.revision,
          items: [],
        };
        for (const id of ids) {
          const source = await validator.batchSource(task.draft, id);
          if (task.draft.chapters.some((chapter) => chapter.sourceIds.includes(id)))
            throw importError(
              'SOURCE_OVERLAP',
              'sourceOverlapTheSourceAlreadyHasDraftChapters',
              {},
            );
          if (!source.name.trim() || source.name.length > 500)
            throw importError('METADATA_LIMIT', 'metadataLimitTheSourceNameIsUnsuitableAs', {});
          const chapter = {
            id: crypto.randomUUID(),
            volumeId: input.volume_id,
            title: source.name,
            inferredTitle: false,
            inferredStructure: true,
            selected: true,
            content: [],
            sourceIds: [id],
            status: 'pending' as const,
          };
          batch.items.push({
            sourceId: id,
            ...(source.currentSnapshotId ? { snapshotId: source.currentSnapshotId } : {}),
            chapter,
            status: 'pending',
          });
          task.draft.chapters.push(chapter);
        }
        task.draft.revision++;
        invalidateImportPreview(task);
        task.batchProgress = chapterBatchProgress(batch);
        const resource: ImportResource = {
          id: batch.id,
          taskId: task.id,
          sourceId: ids[0]!,
          createdAt: Date.now(),
          kind: 'chapter-batch',
          batch,
        };
        await tx.objectStore('import-resources').add(resource);
        return { success: true, ...task.batchProgress, draftRevision: task.draft.revision };
      },
      { run, ...(finish ? { finish } : {}) },
    );
  }
}
