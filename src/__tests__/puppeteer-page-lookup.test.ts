import './setup';
import { describe, expect, it, vi } from 'vitest';
import { findPageWithRetry } from '../../src-electron/puppeteer-page-lookup';

const notFound = () =>
  new Error('Unable to find puppeteer Page from BrowserWindow. Please report this.');

function lookupSequence<T>(results: Array<T | Error>) {
  let calls = 0;
  const lookup = vi.fn(() => {
    const result = results[Math.min(calls, results.length - 1)];
    calls += 1;
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
  });
  return lookup;
}

describe('findPageWithRetry', () => {
  it('首次就找到页面时直接返回，不等待', async () => {
    const lookup = lookupSequence(['page']);
    const wait = vi.fn(() => Promise.resolve());

    await expect(findPageWithRetry(lookup, { wait })).resolves.toBe('page');
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('新窗口 target 尚未被 Puppeteer 发现时按间隔重试，直到找到', async () => {
    const lookup = lookupSequence([notFound(), notFound(), 'page']);
    const wait = vi.fn(() => Promise.resolve());

    await expect(findPageWithRetry(lookup, { wait, delayMs: 50 })).resolves.toBe('page');
    expect(lookup).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(50);
  });

  it('其他错误不重试，原样抛出', async () => {
    const failure = new Error('Protocol error: Target closed');
    const lookup = lookupSequence([failure, 'page']);
    const wait = vi.fn(() => Promise.resolve());

    await expect(findPageWithRetry(lookup, { wait })).rejects.toBe(failure);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('重试次数用尽后抛出最后一次的错误', async () => {
    const last = notFound();
    const lookup = lookupSequence([notFound(), notFound(), last]);
    const wait = vi.fn(() => Promise.resolve());

    await expect(findPageWithRetry(lookup, { wait, attempts: 3 })).rejects.toBe(last);
    expect(lookup).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it('attempts 为 1 时只查找一次', async () => {
    const failure = notFound();
    const lookup = lookupSequence([failure, 'page']);
    const wait = vi.fn(() => Promise.resolve());

    await expect(findPageWithRetry(lookup, { wait, attempts: 1 })).rejects.toBe(failure);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('非 Error 的拒绝值不重试', async () => {
    // 故意用字符串拒绝，模拟第三方库抛出非 Error 的情况
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const lookup = vi.fn(() => Promise.reject('Unable to find puppeteer Page'));
    const wait = vi.fn(() => Promise.resolve());

    await expect(findPageWithRetry(lookup, { wait })).rejects.toBe('Unable to find puppeteer Page');
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});
