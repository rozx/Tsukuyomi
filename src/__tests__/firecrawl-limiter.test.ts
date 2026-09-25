import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestLimiter } from 'src/services/firecrawl/firecrawl-limiter';

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('RequestLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('并发数不超过上限，释放后放行下一个等待者', async () => {
    const limiter = new RequestLimiter({ concurrency: 2, windowMs: 60_000, maxPerWindow: 100 });
    const acquired: number[] = [];
    const releases: Array<() => void> = [];
    for (let i = 0; i < 4; i++) {
      void limiter.acquire().then((release) => {
        acquired.push(i);
        releases.push(release);
      });
    }
    await flush();
    expect(acquired).toEqual([0, 1]);

    releases[0]!();
    await flush();
    expect(acquired).toEqual([0, 1, 2]);
  });

  it('滑动窗口内请求数不超过上限，窗口滑过后放行', async () => {
    const limiter = new RequestLimiter({ concurrency: 10, windowMs: 1_000, maxPerWindow: 2 });
    const acquired: number[] = [];
    for (let i = 0; i < 3; i++) {
      void limiter.acquire().then((release) => {
        acquired.push(i);
        release();
      });
    }
    await flush();
    expect(acquired).toEqual([0, 1]);

    await vi.advanceTimersByTimeAsync(999);
    expect(acquired).toEqual([0, 1]);
    await vi.advanceTimersByTimeAsync(1);
    expect(acquired).toEqual([0, 1, 2]);
  });

  it('等待中的调用方取消后移出队列，不占用名额', async () => {
    const limiter = new RequestLimiter({ concurrency: 1, windowMs: 60_000, maxPerWindow: 100 });
    const first = await limiter.acquire();
    const controller = new AbortController();
    const cancelled = limiter.acquire(controller.signal);
    const acquired: string[] = [];
    void limiter.acquire().then(() => acquired.push('third'));

    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });

    first();
    await flush();
    expect(acquired).toEqual(['third']);
  });

  it('已取消的信号直接拒绝，不入队', async () => {
    const limiter = new RequestLimiter({ concurrency: 1, windowMs: 60_000, maxPerWindow: 100 });
    const controller = new AbortController();
    controller.abort();
    await expect(limiter.acquire(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('release 重复调用只释放一次', async () => {
    const limiter = new RequestLimiter({ concurrency: 1, windowMs: 60_000, maxPerWindow: 100 });
    const release = await limiter.acquire();
    release();
    release();
    const acquired: number[] = [];
    void limiter.acquire().then(() => acquired.push(1));
    void limiter.acquire().then(() => acquired.push(2));
    await flush();
    expect(acquired).toEqual([1]);
  });

  it('pauseFor：暂停期间不放行任何请求（即使有空闲名额），到期后恢复', async () => {
    const limiter = new RequestLimiter({ concurrency: 2, windowMs: 60_000, maxPerWindow: 100 });
    limiter.pauseFor(3_000);
    const acquired: number[] = [];
    void limiter.acquire().then((release) => {
      acquired.push(1);
      release();
    });
    await flush();
    await vi.advanceTimersByTimeAsync(2_999);
    expect(acquired).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(acquired).toEqual([1]);
  });

  it('pauseFor 只会延长、不会缩短已有暂停', async () => {
    const limiter = new RequestLimiter({ concurrency: 2, windowMs: 60_000, maxPerWindow: 100 });
    limiter.pauseFor(5_000);
    limiter.pauseFor(1_000);
    const acquired: number[] = [];
    void limiter.acquire().then(() => acquired.push(1));
    await vi.advanceTimersByTimeAsync(4_999);
    expect(acquired).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(acquired).toEqual([1]);
  });

  it('pauseRemainingMs 报告剩余暂停时间，未暂停时为 0', async () => {
    const limiter = new RequestLimiter({ concurrency: 2, windowMs: 60_000, maxPerWindow: 100 });
    expect(limiter.pauseRemainingMs()).toBe(0);
    limiter.pauseFor(3_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(limiter.pauseRemainingMs()).toBe(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(limiter.pauseRemainingMs()).toBe(0);
  });
});
