/**
 * 并发控制工具函数
 * 用于限制同时执行的异步操作数量，避免超过 API 限制
 */

/**
 * 并发执行异步任务，限制同时执行的任务数量
 * @param tasks 异步任务数组
 * @param limit 最大并发数，默认 3
 * @param onProgress 进度回调函数，参数为 (completed, total)
 * @returns Promise，解析为所有任务的结果数组
 */
export async function runWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number = 3,
  onProgress?: (completed: number, total: number) => void,
): Promise<Array<{ success: boolean; result?: T; error?: Error; index: number }>> {
  const results: Array<{ success: boolean; result?: T; error?: Error; index: number }> = [];
  const executing: Promise<void>[] = [];
  let completed = 0;

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    if (!task) {
      continue;
    }
    const index = i;

    // 创建任务 Promise
    const promise = (async () => {
      try {
        const result = await task();
        results[index] = { success: true, result, index };
      } catch (error) {
        results[index] = {
          success: false,
          error: error instanceof Error ? error : new Error('Unknown error'),
          index,
        };
      } finally {
        completed++;
        if (onProgress) {
          onProgress(completed, tasks.length);
        }
      }
    })();

    // 将任务添加到执行队列
    const executingPromise = promise.then(() => {
      // 任务完成后，从执行队列中移除
      const idx = executing.indexOf(executingPromise);
      if (idx > -1) {
        void executing.splice(idx, 1);
      }
    });
    executing.push(executingPromise);

    // 如果达到并发限制，等待至少一个任务完成
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  // 等待所有剩余任务完成
  await Promise.all(executing);

  // 按原始顺序返回结果，过滤掉可能的 undefined 值
  return results
    .filter(
      (result): result is { success: boolean; result?: T; error?: Error; index: number } =>
        result !== undefined,
    )
    .sort((a, b) => a.index - b.index);
}
