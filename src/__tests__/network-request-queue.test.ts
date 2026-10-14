import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestQueue } from 'src/services/network/request-queue';
import type { LanePolicy } from 'src/services/network/request-queue';

class Refused extends Error {}
class Tripped extends Error {
  constructor(
    readonly lane: string,
    readonly remainingMs: number,
  ) {
    super(`tripped ${lane}`);
  }
}

const BREAKER: NonNullable<LanePolicy['breaker']> = {
  tripAfter: 3,
  cooldownMs: 300_000,
  isRefusal: (error) => error instanceof Refused,
  trippedError: (lane, remainingMs) => new Tripped(lane, remainingMs),
};

function queueWith(policy: LanePolicy) {
  const queue = new RequestQueue({ concurrency: 4 });
  queue.define('site:', policy);
  return queue;
}

const refuse = () => Promise.reject(new Refused('403'));

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

async function refuseTimes(queue: RequestQueue, lane: string, times: number) {
  for (let i = 0; i < times; i++) {
    const refused = expect(queue.run(lane, refuse)).rejects.toBeInstanceOf(Refused);
    await vi.runAllTimersAsync();
    await refused;
  }
}

/** 连续被拒到阈值：触发熔断的那次请求本身就抛 trippedError */
async function trip(queue: RequestQueue, lane: string) {
  await refuseTimes(queue, lane, 2);
  const tripped = expect(queue.run(lane, refuse)).rejects.toBeInstanceOf(Tripped);
  await vi.runAllTimersAsync();
  await tripped;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RequestQueue 分道与限流', () => {
  it('按前缀匹配策略：同一 lane 串行，相邻请求开始至少间隔 minIntervalMs', async () => {
    const queue = queueWith({ concurrency: 1, minIntervalMs: 1_000 });
    const started: number[] = [];
    const runs = [1, 2, 3].map((n) =>
      queue.run('site:kakuyomu.jp', () => {
        started.push(n);
        return Promise.resolve(n);
      }),
    );
    await flush();
    expect(started).toEqual([1]);
    await vi.advanceTimersByTimeAsync(999);
    expect(started).toEqual([1]);
    await vi.advanceTimersByTimeAsync(1);
    expect(started).toEqual([1, 2]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(started).toEqual([1, 2, 3]);
    await expect(Promise.all(runs)).resolves.toEqual([1, 2, 3]);
  });

  it('上一个请求未结束时不放行下一个（concurrency 1）', async () => {
    const queue = queueWith({ concurrency: 1 });
    let finishFirst!: () => void;
    const started: number[] = [];
    void queue.run('site:a', () => {
      started.push(1);
      return new Promise<void>((resolve) => (finishFirst = resolve));
    });
    void queue.run('site:a', () => {
      started.push(2);
      return Promise.resolve();
    });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(started).toEqual([1]);
    finishFirst();
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual([1, 2]);
  });

  it('同一前缀下的不同 lane 互不阻塞', async () => {
    const queue = queueWith({ concurrency: 1, minIntervalMs: 1_000 });
    const started: string[] = [];
    void queue.run('site:a', () => {
      started.push('a');
      return Promise.resolve();
    });
    void queue.run('site:b', () => {
      started.push('b');
      return Promise.resolve();
    });
    await flush();
    expect(started).toEqual(['a', 'b']);
  });

  it('未定义前缀的 lane 使用默认策略', async () => {
    const queue = queueWith({ concurrency: 1 });
    const started: number[] = [];
    for (const n of [1, 2, 3]) {
      void queue.run('other', () => {
        started.push(n);
        return new Promise(() => {});
      });
    }
    await flush();
    expect(started).toEqual([1, 2, 3]);
  });

  it('排队中的请求可被取消，且不发送', async () => {
    const queue = queueWith({ concurrency: 1, minIntervalMs: 1_000 });
    await queue.run('site:a', () => Promise.resolve());
    const controller = new AbortController();
    const request = vi.fn(() => Promise.resolve());
    const pending = queue.run('site:a', request, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
    await vi.runAllTimersAsync();
    expect(request).not.toHaveBeenCalled();
  });

  it('pause 暂停整条 lane，pauseRemainingMs 返回剩余时间', async () => {
    const queue = queueWith({ concurrency: 2 });
    queue.pause('site:a', 10_000);
    expect(queue.pauseRemainingMs('site:a')).toBe(10_000);
    expect(queue.pauseRemainingMs('site:b')).toBe(0);
    const started: number[] = [];
    void queue.run('site:a', () => {
      started.push(1);
      return Promise.resolve();
    });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(started).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(started).toEqual([1]);
  });

  it('acquire 返回 release，供自带重试策略的调用方使用', async () => {
    const queue = queueWith({ concurrency: 1 });
    const release = await queue.acquire('site:a');
    let second = false;
    void queue.acquire('site:a').then(() => (second = true));
    await flush();
    expect(second).toBe(false);
    release();
    await flush();
    expect(second).toBe(true);
  });
});

describe('RequestQueue 熔断', () => {
  it('第 tripAfter 次拒绝即熔断：该次请求抛 trippedError，之后不再发送', async () => {
    const queue = queueWith({ concurrency: 1, breaker: BREAKER });
    await refuseTimes(queue, 'site:a', 2);
    const third = vi.fn(refuse);
    await expect(queue.run('site:a', third)).rejects.toMatchObject({
      lane: 'site:a',
      remainingMs: 300_000,
    });
    expect(third).toHaveBeenCalledTimes(1);
    const request = vi.fn(() => Promise.resolve('ok'));

    const error = await queue.run('site:a', request).catch((e: unknown) => e);

    expect(request).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(Tripped);
    expect(error).toMatchObject({ lane: 'site:a', remainingMs: 300_000 });
  });

  it('成功请求清零连续拒绝计数', async () => {
    const queue = queueWith({ concurrency: 1, breaker: BREAKER });
    await refuseTimes(queue, 'site:a', 2);
    await expect(queue.run('site:a', () => Promise.resolve('ok'))).resolves.toBe('ok');
    await refuseTimes(queue, 'site:a', 2);
    await expect(queue.run('site:a', () => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('非拒绝类错误不计数', async () => {
    const queue = queueWith({ concurrency: 1, breaker: BREAKER });
    for (let i = 0; i < 5; i++) {
      await expect(queue.run('site:a', () => Promise.reject(new Error('404')))).rejects.toThrow(
        '404',
      );
    }
    await expect(queue.run('site:a', () => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('非拒绝类错误打断连续拒绝：计数清零', async () => {
    const queue = queueWith({ concurrency: 1, breaker: BREAKER });
    await refuseTimes(queue, 'site:a', 2);
    await expect(queue.run('site:a', () => Promise.reject(new Error('404')))).rejects.toThrow(
      '404',
    );
    await refuseTimes(queue, 'site:a', 2);
    await expect(queue.run('site:a', () => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('取消不算站点的响应：既不计数也不清零', async () => {
    const queue = queueWith({ concurrency: 1, breaker: BREAKER });
    await refuseTimes(queue, 'site:a', 2);
    const aborted = new DOMException('操作已取消', 'AbortError');
    await expect(queue.run('site:a', () => Promise.reject(aborted))).rejects.toBe(aborted);
    await expect(queue.run('site:a', refuse)).rejects.toBeInstanceOf(Tripped);
  });

  it('熔断只影响该 lane', async () => {
    const queue = queueWith({ concurrency: 1, breaker: BREAKER });
    await trip(queue, 'site:a');
    await expect(queue.run('site:b', () => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('排队中的请求在熔断后拿到名额时不再发送', async () => {
    const queue = queueWith({ concurrency: 1, minIntervalMs: 1_000, breaker: BREAKER });
    await refuseTimes(queue, 'site:a', 2);
    const queued = vi.fn(() => Promise.resolve('ok'));
    const third = expect(queue.run('site:a', refuse)).rejects.toBeInstanceOf(Tripped);
    const fourth = expect(queue.run('site:a', queued)).rejects.toBeInstanceOf(Tripped);
    await vi.runAllTimersAsync();
    await third;
    await fourth;
    expect(queued).not.toHaveBeenCalled();
  });

  it('排队者收到的熔断错误不清零计数：冷却后试探再被拒仍立即重新熔断', async () => {
    const queue = queueWith({ concurrency: 1, minIntervalMs: 1_000, breaker: BREAKER });
    await refuseTimes(queue, 'site:a', 2);
    const third = expect(queue.run('site:a', refuse)).rejects.toBeInstanceOf(Tripped);
    const waiter = expect(queue.run('site:a', () => Promise.resolve('ok'))).rejects.toBeInstanceOf(
      Tripped,
    );
    await vi.runAllTimersAsync();
    await third;
    await waiter;
    await vi.advanceTimersByTimeAsync(300_000);

    await expect(queue.run('site:a', refuse)).rejects.toBeInstanceOf(Tripped);
  });

  it('冷却结束后放行一次试探：再被拒立即重新熔断', async () => {
    const queue = queueWith({ concurrency: 1, breaker: BREAKER });
    await trip(queue, 'site:a');
    await vi.advanceTimersByTimeAsync(300_000);

    const probe = vi.fn(refuse);
    await expect(queue.run('site:a', probe)).rejects.toBeInstanceOf(Tripped);
    expect(probe).toHaveBeenCalledTimes(1);

    const request = vi.fn(() => Promise.resolve('ok'));
    await expect(queue.run('site:a', request)).rejects.toBeInstanceOf(Tripped);
    expect(request).not.toHaveBeenCalled();
  });

  it('冷却结束后试探成功即恢复', async () => {
    const queue = queueWith({ concurrency: 1, breaker: BREAKER });
    await trip(queue, 'site:a');
    await vi.advanceTimersByTimeAsync(300_000);

    await expect(queue.run('site:a', () => Promise.resolve('ok'))).resolves.toBe('ok');
    await refuseTimes(queue, 'site:a', 2);
    await expect(queue.run('site:a', () => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('reset 清空所有 lane 的运行状态，保留策略', async () => {
    const queue = queueWith({ concurrency: 1, breaker: BREAKER });
    await trip(queue, 'site:a');
    queue.pause('site:b', 10_000);
    queue.reset();
    await expect(queue.run('site:a', () => Promise.resolve('ok'))).resolves.toBe('ok');
    expect(queue.pauseRemainingMs('site:b')).toBe(0);
    await trip(queue, 'site:a');
    await expect(queue.run('site:a', () => Promise.resolve())).rejects.toBeInstanceOf(Tripped);
  });

  it('reset(lane) 只清空该 lane', async () => {
    const queue = queueWith({ concurrency: 1, breaker: BREAKER });
    await trip(queue, 'site:a');
    queue.pause('site:b', 10_000);
    queue.reset('site:a');
    await expect(queue.run('site:a', () => Promise.resolve('ok'))).resolves.toBe('ok');
    expect(queue.pauseRemainingMs('site:b')).toBe(10_000);
  });
});
