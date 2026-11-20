import { describe, expect, it } from 'vitest';
import { mapConcurrent } from 'src/utils/map-concurrent';

describe('mapConcurrent', () => {
  it('结果保留输入顺序，且同时在途的任务数不超过上限', async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapConcurrent([30, 5, 20, 1, 10], 2, async (delay) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, delay));
      inFlight -= 1;
      return delay * 2;
    });
    expect(results).toEqual([60, 10, 40, 2, 20]);
    expect(peak).toBe(2);
  });

  it('空输入返回空数组；并发上限小于 1 时按 1 处理', async () => {
    expect(await mapConcurrent([], 4, (value: number) => Promise.resolve(value))).toEqual([]);
    const order: number[] = [];
    await mapConcurrent([1, 2, 3], 0, (value) => {
      order.push(value);
      return Promise.resolve();
    });
    expect(order).toEqual([1, 2, 3]);
  });

  it('任一任务失败后不再启动新任务，等在途任务结束再抛出该错误', async () => {
    const started: number[] = [];
    let slowFinished = false;
    const run = mapConcurrent([1, 2, 3, 4], 2, async (value) => {
      started.push(value);
      if (value === 1) throw new Error('boom');
      await new Promise((resolve) => setTimeout(resolve, 10));
      slowFinished = true;
    });
    await expect(run).rejects.toThrow('boom');
    expect(slowFinished).toBe(true);
    expect(started).toEqual([1, 2]);
  });
});
