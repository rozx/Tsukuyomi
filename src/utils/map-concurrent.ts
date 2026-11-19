/**
 * 有界并发处理，结果保留输入顺序。
 * 任一任务失败后不再启动新任务，等在途任务结束再抛出该错误。
 */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  process: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let stopped = false;
  const workerCount = Math.min(Math.max(1, Math.trunc(concurrency)), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (!stopped && nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = await process(items[index]!);
      } catch (error) {
        stopped = true;
        throw error;
      }
    }
  });
  const settled = await Promise.allSettled(workers);
  for (const result of settled) {
    if (result.status === 'rejected') throw result.reason;
  }
  return results;
}
