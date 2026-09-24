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
        if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
        if (task.draft.revision !== input.base_draft_revision)
          throw new Error('DRAFT_CHANGED: 草稿已变化，请重新读取');
        if (!task.draft.volumes.some((volume) => volume.id === input.volume_id))
          throw new Error('INVALID_OPERATION: 目标卷不存在');
        const ids = await batchSourceIds(run.taskId, input, tx);
        if (!ids.length || ids.length > 500 || new Set(ids).size !== ids.length)
          throw new Error('BATCH_LIMIT: 一次批处理须包含 1–500 个不同来源');
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
            throw new Error('SOURCE_OVERLAP: 来源已有草稿章节，请使用原章节编辑或重试原批次');
          if (!source.name.trim() || source.name.length > 500)
            throw new Error('METADATA_LIMIT: 来源名称不适合作为章节标题，请先单独整理');
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
