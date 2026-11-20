import { describe, expect, it } from 'vitest';
import { createCoalescedTask } from 'src/utils/coalesced-task';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => (resolve = yes));
  return { promise, resolve };
}

describe('createCoalescedTask', () => {
  it('运行中再次请求时不丢弃：当前一轮结束后只补跑一次', async () => {
    const gates = [deferred(), deferred()];
    let runs = 0;
    const task = createCoalescedTask(async () => {
      runs += 1;
      await gates[runs - 1]!.promise;
    });
    const first = task.run();
    void task.run();
    void task.run();
    expect(runs).toBe(1);
    gates[0]!.resolve();
    await first;
    await Promise.resolve();
    expect(runs).toBe(2);
    gates[1]!.resolve();
    await task.idle();
    expect(runs).toBe(2);
  });

  it('空闲时请求立即运行；isRunning 反映状态', async () => {
    let runs = 0;
    const task = createCoalescedTask(async () => {
      runs += 1;
      await Promise.resolve();
    });
    const pending = task.run();
    expect(task.isRunning()).toBe(true);
    await pending;
    await task.idle();
    expect(task.isRunning()).toBe(false);
    expect(runs).toBe(1);
  });

  it('一轮抛错不影响补跑', async () => {
    let runs = 0;
    const task = createCoalescedTask(() => {
      runs += 1;
      return runs === 1 ? Promise.reject(new Error('boom')) : Promise.resolve();
    });
    const first = task.run();
    void task.run();
    await expect(first).rejects.toThrow('boom');
    await task.idle();
    expect(runs).toBe(2);
  });
});
