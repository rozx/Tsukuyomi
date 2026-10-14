import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestQueue } from '../services/network/request-queue';
import { createCrossTabLanes } from '../services/network/cross-tab-lanes';
import type { CrossTabLaneDeps, LockRequester } from '../services/network/cross-tab-lanes';
import { createSiteLanePolicy } from '../services/scraper/core/site-request-lanes';
import { HttpStatusError, SiteRateLimitedError } from '../services/proxy-fetch-plan';

const LANE = 'site:kakuyomu.jp';

/** 同名锁按先来后到串行的最小实现；等待中被取消时立即拒绝并让出位置 */
function fakeLocks(): LockRequester {
  const tails = new Map<string, Promise<void>>();
  return {
    request<T>(name: string, options: { signal?: AbortSignal }, callback: () => Promise<T>) {
      const signal = options.signal;
      if (signal?.aborted) return Promise.reject(signal.reason as Error);
      const prev = tails.get(name) ?? Promise.resolve();
      let done!: () => void;
      tails.set(name, new Promise<void>((resolve) => (done = resolve)));
      return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(signal!.reason as Error);
        signal?.addEventListener('abort', onAbort, { once: true });
        void prev.then(() => {
          signal?.removeEventListener('abort', onAbort);
          if (signal?.aborted) return done();
          callback().then(resolve, reject).finally(done);
        });
      });
    },
  };
}

/** 同一浏览器的多个标签页：共享锁与 localStorage，各自持有一份 RequestQueue */
function browser(deps: Partial<CrossTabLaneDeps> = {}) {
  const shared: CrossTabLaneDeps = { locks: fakeLocks(), storage: localStorage, ...deps };
  return () => {
    const queue = new RequestQueue({ concurrency: 4 });
    queue.define(
      'site:',
      createSiteLanePolicy({ minIntervalMs: 1_000, crossTab: createCrossTabLanes(shared) }),
    );
    return queue;
  };
}

const refuse = () => Promise.reject(new HttpStatusError(403));

async function settle<T>(promise: Promise<T>): Promise<unknown> {
  const result = promise.catch((e: unknown) => e);
  await vi.runAllTimersAsync();
  return result;
}

/** 在 tab 上连续被拒 times 次（默认 2 次：差一次熔断） */
async function refuseTimes(tab: RequestQueue, times = 2) {
  for (let i = 0; i < times; i++) await settle(tab.run(LANE, refuse));
}

const KEY = 'tsukuyomi:request-lane:' + LANE;

/** 基于 Map 的存储桩，可让写入 / 删除中途开始抛错 */
function flakyStorage() {
  const data = new Map<string, string>();
  const state = { failWrites: false, failRemoves: false };
  const storage = {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (state.failWrites) throw new Error('QuotaExceededError');
      data.set(k, v);
    },
    removeItem: (k: string) => {
      if (state.failRemoves) throw new Error('SecurityError');
      data.delete(k);
    },
  };
  return { storage, state };
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe('站点 lane 跨标签页协调', () => {
  it('同一站点在两个标签页间串行：前一个请求未结束时另一个标签页不发送', async () => {
    const tab = browser();
    const [a, b] = [tab(), tab()];
    let finishFirst!: () => void;
    const started: string[] = [];
    void a.run(LANE, () => {
      started.push('a');
      return new Promise<void>((resolve) => (finishFirst = resolve));
    });
    void b.run(LANE, () => {
      started.push('b');
      return Promise.resolve();
    });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(started).toEqual(['a']);
    finishFirst();
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual(['a', 'b']);
  });

  it('跨标签页保持相邻请求的最小间隔', async () => {
    const tab = browser();
    const [a, b] = [tab(), tab()];
    const started: number[] = [];
    await a.run(LANE, () => Promise.resolve(started.push(Date.now())));
    void b.run(LANE, () => Promise.resolve(started.push(Date.now())));
    await vi.advanceTimersByTimeAsync(999);
    expect(started).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(started).toHaveLength(2);
    expect(started[1]! - started[0]!).toBe(1_000);
  });

  it('不同站点跨标签页互不阻塞', async () => {
    const tab = browser();
    const [a, b] = [tab(), tab()];
    const started: string[] = [];
    void a.run(LANE, () => {
      started.push('a');
      return new Promise(() => {});
    });
    void b.run('site:syosetu.org', () => {
      started.push('b');
      return Promise.resolve();
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual(['a', 'b']);
  });

  it('一个标签页熔断后，另一个标签页在冷却期内立即拒绝且不发送', async () => {
    const tab = browser();
    const [a, b] = [tab(), tab()];
    await refuseTimes(a);
    expect(await settle(a.run(LANE, refuse))).toBeInstanceOf(SiteRateLimitedError);

    const request = vi.fn(() => Promise.resolve('ok'));
    const error = await settle(b.run(LANE, request));

    expect(error).toBeInstanceOf(SiteRateLimitedError);
    expect(error).toMatchObject({ values: { host: 'kakuyomu.jp', minutes: 5 } });
    expect(request).not.toHaveBeenCalled();
  });

  it('连续拒绝计数跨标签页累计', async () => {
    const tab = browser();
    const [a, b] = [tab(), tab()];
    await refuseTimes(a);
    expect(await settle(b.run(LANE, refuse))).toBeInstanceOf(SiteRateLimitedError);
  });

  it('另一个标签页的成功清零连续拒绝计数', async () => {
    const tab = browser();
    const [a, b] = [tab(), tab()];
    await refuseTimes(a);
    expect(await settle(b.run(LANE, () => Promise.resolve('ok')))).toBe('ok');
    for (let i = 0; i < 2; i++) {
      expect(await settle(a.run(LANE, refuse))).toBeInstanceOf(HttpStatusError);
    }
  });

  it('另一个标签页排队中的请求在熔断后拿到锁时不再发送', async () => {
    const tab = browser();
    const [a, b] = [tab(), tab()];
    await refuseTimes(a);
    await vi.advanceTimersByTimeAsync(1_000);
    const queued = vi.fn(() => Promise.resolve('ok'));
    const third = a.run(LANE, refuse).catch((e: unknown) => e);
    const fourth = b.run(LANE, queued).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    expect(await third).toBeInstanceOf(SiteRateLimitedError);
    expect(await fourth).toBeInstanceOf(SiteRateLimitedError);
    expect(queued).not.toHaveBeenCalled();
  });

  it('另一个标签页排队者收到的熔断错误不清零计数：冷却后试探再被拒仍立即重新熔断', async () => {
    const tab = browser();
    const [a, b] = [tab(), tab()];
    await refuseTimes(a);
    await vi.advanceTimersByTimeAsync(1_000);
    const third = a.run(LANE, refuse).catch((e: unknown) => e);
    const waiter = b.run(LANE, () => Promise.resolve('ok')).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    expect(await third).toBeInstanceOf(SiteRateLimitedError);
    expect(await waiter).toBeInstanceOf(SiteRateLimitedError);
    await vi.advanceTimersByTimeAsync(300_000);

    expect(await settle(b.run(LANE, refuse))).toBeInstanceOf(SiteRateLimitedError);
  });

  it('熔断后另一个标签页排队中的请求拿到锁即失败，不再等满间隔', async () => {
    const tab = browser();
    const [a, b] = [tab(), tab()];
    await refuseTimes(a);
    await vi.advanceTimersByTimeAsync(1_000);
    const trippedAt = Date.now();
    const third = a.run(LANE, refuse).catch((e: unknown) => e);
    const failedAt = b.run(LANE, () => Promise.resolve('ok')).catch(() => Date.now());
    await vi.runAllTimersAsync();
    expect(await third).toBeInstanceOf(SiteRateLimitedError);
    expect(await failedAt).toBe(trippedAt);
  });

  it('等待跨标签页锁时可取消，且不发送', async () => {
    const tab = browser();
    const [a, b] = [tab(), tab()];
    await refuseTimes(a);
    await vi.advanceTimersByTimeAsync(1_000);
    let finishFirst!: () => void;
    void a.run(LANE, () => new Promise<string>((resolve) => (finishFirst = () => resolve('ok'))));
    await vi.advanceTimersByTimeAsync(0);

    const controller = new AbortController();
    const request = vi.fn(() => Promise.resolve());
    const pending = b.run(LANE, request, controller.signal).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    expect(await pending).toMatchObject({ name: 'AbortError' });
    finishFirst();
    await vi.runAllTimersAsync();
    expect(request).not.toHaveBeenCalled();
  });

  it('冷却结束后试探成功，其他标签页也随之恢复', async () => {
    const tab = browser();
    const [a, b] = [tab(), tab()];
    await refuseTimes(a, 3);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(await settle(a.run(LANE, () => Promise.resolve('ok')))).toBe('ok');
    expect(await settle(b.run(LANE, () => Promise.resolve('ok')))).toBe('ok');
  });

  it('本地时钟回拨时，等待间隔不超过 minIntervalMs', async () => {
    const lanes = createCrossTabLanes({ locks: fakeLocks(), storage: localStorage })!;
    await lanes.exclusive(LANE, { minIntervalMs: 1_000 }, () => Promise.resolve());
    vi.setSystemTime(Date.now() - 60 * 60_000);
    const started = vi.fn(() => Promise.resolve());
    void lanes.exclusive(LANE, { minIntervalMs: 1_000 }, started);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(started).toHaveBeenCalledTimes(1);
  });

  it('localStorage 中的损坏数据按初始状态处理', async () => {
    localStorage.setItem('tsukuyomi:request-lane:' + LANE, '{not json');
    const a = browser()();
    expect(await settle(a.run(LANE, () => Promise.resolve('ok')))).toBe('ok');
  });

  it.each([
    ['负数', -1_000_000],
    ['小数', 1.5],
    ['负小数', -0.5],
    ['字符串', '2'],
  ])('持久化的拒绝计数为%s时按 0 处理：再连续拒绝 3 次即熔断', async (_name, refusals) => {
    localStorage.setItem(KEY, JSON.stringify({ refusals, trippedUntil: 0, lastStartAt: 0 }));
    const a = browser()();
    for (let i = 0; i < 2; i++) {
      expect(await settle(a.run(LANE, refuse))).toBeInstanceOf(HttpStatusError);
    }
    expect(await settle(a.run(LANE, refuse))).toBeInstanceOf(SiteRateLimitedError);
  });

  it('持久化的熔断截止时间超过一个冷却期时按一个冷却期处理', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ refusals: 3, trippedUntil: Date.now() + 24 * 60 * 60_000, lastStartAt: 0 }),
    );
    const a = browser()();
    expect(await settle(a.run(LANE, () => Promise.resolve('ok')))).toMatchObject({
      values: { minutes: 5 },
    });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(await settle(a.run(LANE, () => Promise.resolve('ok')))).toBe('ok');
  });

  it('锁外的入口检查不写回存储，不覆盖持锁标签页的结果', async () => {
    const tab = browser();
    const [a, c] = [tab(), tab()];
    let finishFirst!: () => void;
    const first = a.run(
      LANE,
      () => new Promise<string>((resolve) => (finishFirst = () => resolve('ok'))),
    );
    await vi.advanceTimersByTimeAsync(0);
    const corrupt = JSON.stringify({
      refusals: 3,
      trippedUntil: Date.now() + 24 * 60 * 60_000,
      lastStartAt: Date.now(),
    });
    localStorage.setItem(KEY, corrupt);

    const second = c.run(LANE, () => Promise.resolve('ok')).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(0);
    expect(localStorage.getItem(KEY)).toBe(corrupt);

    finishFirst();
    await vi.runAllTimersAsync();
    expect(await first).toBe('ok');
    expect(await second).toBe('ok');
  });

  it('存储中途无法写入后不再信任旧值，本标签页照常熔断', async () => {
    const { storage, state } = flakyStorage();
    const a = browser({ storage })();
    await refuseTimes(a);
    state.failWrites = true;
    expect(await settle(a.run(LANE, refuse))).toBeInstanceOf(SiteRateLimitedError);
    const request = vi.fn(() => Promise.resolve());
    expect(await settle(a.run(LANE, request))).toBeInstanceOf(SiteRateLimitedError);
    expect(request).not.toHaveBeenCalled();
  });

  it('清除共享状态失败后不再信任存储里的旧熔断', async () => {
    const { storage, state } = flakyStorage();
    const a = browser({ storage })();
    await refuseTimes(a, 3);
    state.failRemoves = true;
    a.reset(LANE);
    expect(await settle(a.run(LANE, () => Promise.resolve('ok')))).toBe('ok');
  });

  it('localStorage 不可用时退回单页行为：本标签页仍会熔断', async () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
      get length(): number {
        throw new Error('SecurityError');
      },
      key: () => {
        throw new Error('SecurityError');
      },
    };
    const a = browser({ storage: broken })();
    await refuseTimes(a);
    expect(await settle(a.run(LANE, refuse))).toBeInstanceOf(SiteRateLimitedError);
    const request = vi.fn(() => Promise.resolve());
    expect(await settle(a.run(LANE, request))).toBeInstanceOf(SiteRateLimitedError);
    expect(request).not.toHaveBeenCalled();
  });

  it('reset 同时清除共享的熔断状态', async () => {
    const tab = browser();
    const [a, b] = [tab(), tab()];
    await refuseTimes(a, 3);
    a.reset(LANE);
    expect(await settle(b.run(LANE, () => Promise.resolve('ok')))).toBe('ok');
  });

  it('reset(lane) 也清除本标签页从未请求过的站点的共享熔断', async () => {
    const tab = browser();
    const [a, b, c] = [tab(), tab(), tab()];
    await refuseTimes(a, 3);
    c.reset(LANE);
    expect(await settle(b.run(LANE, () => Promise.resolve('ok')))).toBe('ok');
  });

  it('reset() 清除所有站点的共享熔断，不影响其它 localStorage 数据', async () => {
    localStorage.setItem('other-key', 'keep');
    const tab = browser();
    const [a, b, c] = [tab(), tab(), tab()];
    await refuseTimes(a, 3);
    await settle(a.run('site:syosetu.org', () => Promise.resolve()));
    c.reset();
    expect(await settle(b.run(LANE, () => Promise.resolve('ok')))).toBe('ok');
    expect(localStorage.getItem('other-key')).toBe('keep');
  });
});

describe('createCrossTabLanes 环境检测', () => {
  it('不支持 Web Locks（如 jsdom）时返回 undefined，退回单页行为', () => {
    expect('locks' in navigator).toBe(false);
    expect(createCrossTabLanes()).toBeUndefined();
  });

  it('没有 localStorage 时返回 undefined', () => {
    expect(createCrossTabLanes({ locks: fakeLocks(), storage: undefined })).toBeUndefined();
  });

  it('默认站点策略在不支持的环境下照常工作', async () => {
    const queue = new RequestQueue({ concurrency: 4 });
    queue.define('site:', createSiteLanePolicy({ minIntervalMs: 0 }));
    await expect(queue.run(LANE, () => Promise.resolve('ok'))).resolves.toBe('ok');
  });
});
