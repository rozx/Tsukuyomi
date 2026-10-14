import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { fetchScraperPage } from 'src/services/scraper/core/page-transport';
import { useSettingsStore } from 'src/stores/settings';

const page = (n: number) => `https://kakuyomu.jp/works/1/episodes/${n}`;

function axiosStatusError(status: number) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, statusText: '', headers: {}, data: '' },
  });
}

beforeEach(async () => {
  await useSettingsStore().updateSettings({
    proxyEnabled: true,
    proxyUrl: 'https://cors.rozx.moe/?{url}',
    proxySiteMapping: {},
    firecrawlFallbackEnabled: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('网页抓取经站点请求队列', () => {
  it('同一站点：上一个请求未结束时不发下一个', async () => {
    const pending: Array<() => void> = [];
    const get = vi.spyOn(axios, 'get').mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.push(() =>
            resolve({ status: 200, data: '<html>ok</html>', headers: {}, request: {} }),
          );
        }),
    );
    const first = fetchScraperPage(page(1));
    const second = fetchScraperPage(page(2));
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(get).toHaveBeenCalledTimes(1);

    pending.shift()!();
    await first;
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2), { timeout: 3_000 });
    pending.shift()!();
    await second;
  }, 10_000);

  it('连续 3 次 403：第 3 次即报站点限流，第 4 次不发请求', async () => {
    const get = vi.spyOn(axios, 'get').mockRejectedValue(axiosStatusError(403));
    for (let i = 0; i < 2; i++) {
      await expect(fetchScraperPage(page(i))).rejects.toMatchObject({ code: 'FETCH_SITE_REFUSED' });
    }
    await expect(fetchScraperPage(page(2))).rejects.toMatchObject({
      code: 'FETCH_SITE_RATE_LIMITED',
      values: { host: 'kakuyomu.jp' },
    });
    expect(get).toHaveBeenCalledTimes(3);

    await expect(fetchScraperPage(page(9))).rejects.toMatchObject({
      code: 'FETCH_SITE_RATE_LIMITED',
    });
    expect(get).toHaveBeenCalledTimes(3);
  }, 10_000);

  it('一章 429 重试两次只计一次拒绝', async () => {
    const get = vi
      .spyOn(axios, 'get')
      .mockRejectedValueOnce(axiosStatusError(429))
      .mockRejectedValueOnce(axiosStatusError(429))
      .mockRejectedValue(axiosStatusError(403));
    await expect(fetchScraperPage(page(1))).rejects.toMatchObject({ code: 'FETCH_SITE_REFUSED' });
    expect(get).toHaveBeenCalledTimes(2);
    await expect(fetchScraperPage(page(2))).rejects.toMatchObject({ code: 'FETCH_SITE_REFUSED' });
  }, 15_000);
});
