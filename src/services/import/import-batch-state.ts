import type { ImportChapterBatch, ImportChapterBatchItem } from 'src/models/import-batch';
import type { ImportResource, ImportRunContext, ImportTask } from 'src/models/import';
import { ImportRepository } from './import-repository';
import type { ImportTransaction } from './import-repository';
import { ImportDraftValidator } from './import-draft-validation';
import type { ImportExtractionService } from './import-extraction-service';
import { canonicalStringify } from 'src/utils/canonical-json';

type BatchResource = Extract<ImportResource, { kind: 'chapter-batch' }>;
type Prepared = Awaited<ReturnType<ImportExtractionService['prepareExtraction']>>;

function batchValidator(taskId: string, tx: ImportTransaction): ImportDraftValidator {
  return new ImportDraftValidator(
    taskId,
    {
      resource: (key) => tx.objectStore('import-resources').get(key),
      source: (key) => tx.objectStore('import-sources').get(key),
    },
    new Map(),
  );
}

export function chapterBatchProgress(batch: ImportChapterBatch) {
  return {
    batchId: batch.id,
    total: batch.items.length,
    ready: batch.items.filter((item) => item.status === 'ready').length,
    failed: batch.items.filter((item) => item.status === 'failed').length,
    pending: batch.items.filter((item) => item.status === 'pending').length,
  };
}

export function chapterBatchSummary(batch: ImportChapterBatch) {
  const issues = batch.items.filter((item) => item.error || item.warnings?.length);
  return {
    success: true,
    ...chapterBatchProgress(batch),
    draftRevision: batch.draftRevision,
    issueCount: issues.length,
    issues: issues.slice(0, 10).map((item) => ({
      chapterId: item.chapter.id,
      title: item.chapter.title,
      sourceId: item.sourceId,
      ...(item.error
        ? { error: { code: item.error.code, message: item.error.message.slice(0, 300) } }
        : {}),
      ...(item.warnings?.length
        ? { warnings: item.warnings.slice(0, 3).map((w) => w.slice(0, 200)) }
        : {}),
    })),
  };
}

function requireBatch(resource: ImportResource | undefined, taskId: string): BatchResource {
  if (resource?.taskId !== taskId || resource.kind !== 'chapter-batch')
    throw new Error('BATCH_NOT_FOUND: 批次不存在或不属于当前任务');
  return resource;
}

export async function readChapterBatch(taskId: string, id: string) {
  return requireBatch(await ImportRepository.getResource(taskId, id), taskId).batch;
}

async function transactionBatch(tx: ImportTransaction, taskId: string, id: string) {
  return requireBatch(await tx.objectStore('import-resources').get(id), taskId);
}

function assertBatchDraft(task: ImportTask, batch: ImportChapterBatch): void {
  if (task.draft.revision !== batch.draftRevision)
    throw new Error('DRAFT_CHANGED: 草稿已变化，批次已停止；请重读草稿后继续');
  if (task.draft.novelScope.revision !== batch.scopeRevision)
    throw new Error('SOURCE_SCOPE: 小说范围已改变，请重新检查批次');
}

function assertReservedChapter(task: ImportTask, item: ImportChapterBatchItem): number {
  const index = task.draft.chapters.findIndex((chapter) => chapter.id === item.chapter.id);
  if (
    index < 0 ||
    canonicalStringify(task.draft.chapters[index]) !== canonicalStringify(item.chapter)
  )
    throw new Error('DRAFT_CHANGED: 批次章节已被编辑或删除，请单独整理该章节');
  return index;
}

export async function checkChapterBatchActive(run: ImportRunContext, id: string): Promise<void> {
  await ImportRepository.mutateTask(
    run.taskId,
    async (task, tx) => {
      assertBatchDraft(task, (await transactionBatch(tx, task.id, id)).batch);
    },
    { run },
  );
}

export async function startChapterBatch(
  run: ImportRunContext,
  id: string,
  callId: string,
  revision: number,
  retryFailed: boolean,
) {
  return ImportRepository.mutateTask(
    run.taskId,
    async (task, tx) => {
      const resource = await transactionBatch(tx, task.id, id);
      const batch = resource.batch;
      if (batch.runCallId !== callId) {
        if (task.draft.revision !== revision) throw new Error('DRAFT_CHANGED: 请先读取最新草稿');
        batch.draftRevision = revision;
      }
      assertBatchDraft(task, batch);
      const validator = batchValidator(task.id, tx);
      for (const item of batch.items) {
        if (item.status === 'ready' || (item.status === 'failed' && !retryFailed)) continue;
        assertReservedChapter(task, item);
        await validator.batchSource(task.draft, item.sourceId);
        if (batch.runCallId !== callId && item.status === 'failed') item.status = 'pending';
      }
      batch.runCallId = callId;
      task.batchProgress = chapterBatchProgress(batch);
      await tx.objectStore('import-resources').put(resource);
      return batch;
    },
    { run },
  );
}

/** 每章内容、草稿和批次进度一起提交，失败事务不会留下半个章节。 */
export async function saveBatchChapter(
  run: ImportRunContext,
  id: string,
  index: number,
  prepared: Prepared,
) {
  await ImportRepository.saveStep(run.taskId, {
    ...prepared,
    run,
    update: async (task, tx) => {
      const resource = await transactionBatch(tx, task.id, id);
      const batch = resource.batch;
      assertBatchDraft(task, batch);
      const item = batch.items[index]!;
      const chapterIndex = assertReservedChapter(task, item);
      const result = prepared.results[0]!;
      const validator = batchValidator(task.id, tx);
      await validator.batchSource(task.draft, item.sourceId);
      if (result.success && result.contentId) {
        item.chapter = await validator.chapter(
          task.draft,
          {
            ...item.chapter,
            inferredStructure: false,
            status: 'ready',
            content: [{ kind: 'extraction', resourceId: result.contentId }],
          },
          'agent',
        );
        item.contentId = result.contentId;
        item.characters = result.totalCharacters ?? 0;
        item.warnings = result.warnings ?? [];
        delete item.error;
        item.status = 'ready';
      } else {
        item.status = 'failed';
        item.chapter = { ...item.chapter, status: 'failed' };
        item.error = result.error ?? { code: 'SOURCE_FAILED', message: '未取得正文' };
      }
      task.draft.chapters[chapterIndex] = item.chapter;
      task.draft.revision++;
      batch.draftRevision = task.draft.revision;
      task.batchProgress = chapterBatchProgress(batch);
      await tx.objectStore('import-resources').put(resource);
    },
    events: [
      { kind: 'progress', data: { batchId: id, index, success: prepared.results[0]?.success } },
    ],
  });
}
