import type { ImportRunContext } from 'src/models/import';
import type { ImportExtractionService } from './import-extraction-service';
import {
  chapterBatchSummary,
  checkChapterBatchActive,
  readChapterBatch,
  saveBatchChapter,
  startChapterBatch,
} from './import-batch-state';

export async function runChapterBatch(
  run: ImportRunContext,
  input: { batch_id: string; base_draft_revision: number; retry_failed?: boolean },
  callId: string,
  extraction: ImportExtractionService,
  signal?: AbortSignal,
  notify?: () => void,
) {
  const batch = await startChapterBatch(
    run,
    input.batch_id,
    callId,
    input.base_draft_revision,
    input.retry_failed === true,
  );
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  let next = 0;
  let failure: Error | undefined;
  const worker = async () => {
    try {
      while (next < batch.items.length) {
        const index = next++;
        const item = batch.items[index]!;
        if (item.status !== 'pending') continue;
        controller.signal.throwIfAborted();
        await checkChapterBatchActive(run, batch.id);
        controller.signal.throwIfAborted();
        const prepared = await extraction.prepareExtraction(
          run.taskId,
          [
            {
              sourceId: item.sourceId,
              ...(item.snapshotId ? { snapshotId: item.snapshotId } : {}),
              rules: batch.rules,
            },
          ],
          controller.signal,
        );
        controller.signal.throwIfAborted();
        await saveBatchChapter(run, batch.id, index, prepared);
        notify?.();
      }
    } catch (error) {
      failure ??=
        error instanceof Error || error instanceof DOMException ? error : new Error(String(error));
      controller.abort(error);
    }
  };
  try {
    await Promise.allSettled(Array.from({ length: Math.min(3, batch.items.length) }, worker));
    if (failure) throw failure;
    controller.signal.throwIfAborted();
  } finally {
    signal?.removeEventListener('abort', abort);
  }
  return chapterBatchSummary(await readChapterBatch(run.taskId, batch.id));
}
