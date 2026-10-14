import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestQueue } from 'src/services/network/request-queue';
import { createSiteLanePolicy, siteLane } from 'src/services/scraper/core/site-request-lanes';
import {
  BlockedResponseError,
  HttpStatusError,
  SITE_RATE_LIMITED_CODE,
  SiteRateLimitedError,
} from 'src/services/proxy-fetch-plan';

const KAKUYOMU = 'https://kakuyomu.jp/works/1/episodes/2';

function siteQueue() {
  const queue = new RequestQueue({ concurrency: 4 });
  queue.define('site:', createSiteLanePolicy({ minIntervalMs: 0 }));
  return queue;
}

async function fail(queue: RequestQueue, error: Error) {
  await expect(queue.run(siteLane(KAKUYOMU), () => Promise.reject(error))).rejects.toBe(error);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('站点请求 lane', () => {
  it('lane 按目标主机名划分，与经过哪个代理无关', () => {
    expect(siteLane(KAKUYOMU)).toBe('site:kakuyomu.jp');
    expect(siteLane('https://kakuyomu.jp/works/9')).toBe(siteLane(KAKUYOMU));
    expect(siteLane('not a url')).toBe('site:unknown');
  });

  it('默认策略：同站串行，至少间隔 1 秒，连续 3 次拒绝熔断 5 分钟', () => {
    expect(createSiteLanePolicy()).toMatchObject({
      concurrency: 1,
      minIntervalMs: 1_000,
      breaker: { tripAfter: 3, cooldownMs: 300_000 },
    });
  });

  it.each([
    ['403', new HttpStatusError(403)],
    ['429', new HttpStatusError(429)],
    ['反爬质询页', new BlockedResponseError('x')],
  ])('%s 计入拒绝，第 3 次即抛 SiteRateLimitedError，之后不再发送', async (_name, error) => {
    const queue = siteQueue();
    for (let i = 0; i < 2; i++) await fail(queue, error);

    const tripped = await queue
      .run(siteLane(KAKUYOMU), () => Promise.reject(error))
      .catch((e: unknown) => e);

    expect(tripped).toBeInstanceOf(SiteRateLimitedError);
    expect(tripped).toMatchObject({
      code: SITE_RATE_LIMITED_CODE,
      messageKey: 'bookUi.fetch.siteRateLimited',
      values: { host: 'kakuyomu.jp', minutes: 5 },
    });
    const request = vi.fn(() => Promise.resolve());
    await expect(queue.run(siteLane(KAKUYOMU), request)).rejects.toBeInstanceOf(
      SiteRateLimitedError,
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('拒绝之间夹着网络错误或 404 时不算连续，不熔断', async () => {
    const queue = siteQueue();
    await fail(queue, new HttpStatusError(403));
    await fail(queue, new Error('Network Error'));
    await fail(queue, new HttpStatusError(404));
    await fail(queue, new HttpStatusError(429));
    await fail(queue, new BlockedResponseError('x'));
    const request = vi.fn(() => Promise.resolve('ok'));
    await expect(queue.run(siteLane(KAKUYOMU), request)).resolves.toBe('ok');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('桌面版熔断文案不建议「改用桌面版」', async () => {
    (window as unknown as { electronAPI?: unknown }).electronAPI = { isElectron: true };
    try {
      const queue = siteQueue();
      for (let i = 0; i < 2; i++) await fail(queue, new HttpStatusError(403));
      const tripped = await queue
        .run(siteLane(KAKUYOMU), () => Promise.reject(new HttpStatusError(403)))
        .catch((e: unknown) => e);
      expect(tripped).toMatchObject({ messageKey: 'bookUi.fetch.siteRateLimitedDesktop' });
      expect((tripped as Error).message).not.toContain('桌面版');
    } finally {
      delete (window as unknown as { electronAPI?: unknown }).electronAPI;
    }
  });

  it.each([
    ['404', new HttpStatusError(404)],
    ['503', new HttpStatusError(503)],
    ['网络错误', new Error('Network Error')],
  ])('%s 不计入拒绝', async (_name, error) => {
    const queue = siteQueue();
    for (let i = 0; i < 5; i++) await fail(queue, error);
    await expect(queue.run(siteLane(KAKUYOMU), () => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('剩余冷却分钟数向上取整', async () => {
    const queue = siteQueue();
    for (let i = 0; i < 2; i++) await fail(queue, new HttpStatusError(403));
    await expect(
      queue.run(siteLane(KAKUYOMU), () => Promise.reject(new HttpStatusError(403))),
    ).rejects.toBeInstanceOf(SiteRateLimitedError);
    await vi.advanceTimersByTimeAsync(4 * 60_000 + 1);
    const error = await queue.run(siteLane(KAKUYOMU), () => Promise.resolve()).catch((e) => e);
    expect(error).toMatchObject({ values: { minutes: 1 } });
  });
});
