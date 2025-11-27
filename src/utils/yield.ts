/**
 * 让出主线程的工具函数
 * 用于在批量处理时避免阻塞 UI
 */

/**
 * 让出主线程，允许浏览器处理其他任务（如 UI 更新）
 * 使用 setTimeout 将任务推迟到下一个事件循环
 * @param ms 延迟时间（毫秒），默认 0
 * @returns Promise，在指定时间后解析
 */
export function yieldToEventLoop(ms: number = 0): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 分批处理数组，每批之间让出主线程
 * @param items 要处理的数组
 * @param batchSize 每批处理的元素数量，默认 5
 * @param processor 处理函数，接收当前批次的数组和起始索引
 * @param yieldMs 每批之间的延迟时间（毫秒），默认 0
 * @returns Promise，在所有批次处理完成后解析
 */
export async function processInBatches<T, R>(
  items: T[],
  processor: (batch: T[], startIndex: number) => Promise<R> | R,
  batchSize: number = 5,
  yieldMs: number = 0,
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const result = await processor(batch, i);
    results.push(result);
    
    // 如果不是最后一批，让出主线程
    if (i + batchSize < items.length) {
      await yieldToEventLoop(yieldMs);
    }
  }
  
  return results;
}

/**
 * 分批处理数组中的每个元素，每批之间让出主线程
 * 与 processInBatches 不同，这个函数对每个元素单独处理，而不是对整个批次处理
 * @param items 要处理的数组
 * @param processor 处理函数，接收单个元素和索引
 * @param batchSize 每批处理的元素数量，默认 5
 * @param yieldMs 每批之间的延迟时间（毫秒），默认 0
 * @returns Promise，在所有元素处理完成后解析为结果数组
 */
export async function processItemsInBatches<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R> | R,
  batchSize: number = 5,
  yieldMs: number = 0,
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(
      batch.map((item, batchIndex) => processor(item, i + batchIndex))
    );
    
    results.push(...batchResults);
    
    // 如果不是最后一批，让出主线程
    if (i + batchSize < items.length) {
      await yieldToEventLoop(yieldMs);
    }
  }
  
  return results;
}

