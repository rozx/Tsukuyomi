import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { GlobalConfig } from 'src/services/global-config-cache';
import {
  FirecrawlClient,
  __resetFirecrawlClientForTesting,
} from 'src/services/firecrawl/firecrawl-client';
import {
  FirecrawlEmptyContentError,
  FirecrawlQuotaError,
  FirecrawlRateLimitError,
  FirecrawlTargetError,
} from 'src/services/firecrawl/firecrawl-errors';
import {
  CREDIT_USAGE_OK,
  ERROR_401,
  ERROR_402,
  ERROR_429_KEYLESS_DAILY,
  ERROR_429_KEYLESS_SHORT,
  ERROR_429_RATE,
  SCRAPE_EMPTY,
  SCRAPE_OK_MARKDOWN,
  SCRAPE_OK_RAW_HTML,
  SCRAPE_TARGET_404,
  SEARCH_OK,
} from './firecrawl-fixtures';

type Reply = { status: number; data: unknown; headers?: Record<string, string> };

function reply(status: number, data: unknown, headers: Record<string, string> = {}): Reply {
  return { status, data, headers };
}

let apiKey: string | undefined;

beforeEach(() => {
  __resetFirecrawlClientForTesting();
  apiKey = undefined;
  vi.spyOn(GlobalConfig, 'getFirecrawlApiKey').mockImplementation(() => apiKey);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function mockPost(...replies: Reply[]) {
  const spy = vi.spyOn(axios, 'post');
  for (const r of replies) spy.mockResolvedValueOnce(r as never);
  return spy;
}

describe('scrape 请求形状', () => {
  it('配置 Key 时发送 Bearer 认证', async () => {
    apiKey = 'fc-abc';
    const post = mockPost(reply(200, SCRAPE_OK_RAW_HTML));
    await FirecrawlClient.scrape('https://syosetu.org/novel/375522/6.html', { format: 'rawHtml' });
    const config = post.mock.calls[0]![2] as { headers: Record<string, string> };
    expect(config.headers.Authorization).toBe('Bearer fc-abc');
  });

  it('keyless 时不带 Authorization 头', async () => {
    const post = mockPost(reply(200, SCRAPE_OK_RAW_HTML));
    await FirecrawlClient.scrape('https://syosetu.org/novel/375522/6.html', { format: 'rawHtml' });
    const config = post.mock.calls[0]![2] as { headers: Record<string, string> };
    expect('Authorization' in config.headers).toBe(false);
  });

  it('抓取用 rawHtml + maxAge 0 + onlyMainContent false + 转发请求头 + 60s 服务端超时', async () => {
    const post = mockPost(reply(200, SCRAPE_OK_RAW_HTML));
    const result = await FirecrawlClient.scrape('https://syosetu.org/novel/375522/6.html', {
      format: 'rawHtml',
      headers: { Cookie: 'over18=yes' },
    });
    const [url, body, config] = post.mock.calls[0]! as [string, Record<string, unknown>, any];
    expect(url).toBe('https://api.firecrawl.dev/v2/scrape');
    expect(body).toEqual({
      url: 'https://syosetu.org/novel/375522/6.html',
      formats: ['rawHtml'],
      maxAge: 0,
      onlyMainContent: false,
      timeout: 60000,
      headers: { Cookie: 'over18=yes' },
    });
    expect(config.timeout).toBe(75000);
    expect(result).toEqual({
      content: SCRAPE_OK_RAW_HTML.data.rawHtml,
      statusCode: 200,
      url: 'https://syosetu.org/novel/375522/6.html',
      title: '第6話',
    });
  });

  it('网页阅读用 markdown + onlyMainContent true', async () => {
    const post = mockPost(reply(200, SCRAPE_OK_MARKDOWN));
    const result = await FirecrawlClient.scrape('https://example.com', {
      format: 'markdown',
      onlyMainContent: true,
    });
    const body = post.mock.calls[0]![1] as Record<string, unknown>;
    expect(body.formats).toEqual(['markdown']);
    expect(body.onlyMainContent).toBe(true);
    expect('headers' in body).toBe(false);
    expect(result.title).toBe('Example Domain');
    expect(result.content).toContain('Example Domain');
  });

  it('已取消的信号不发请求', async () => {
    const post = mockPost(reply(200, SCRAPE_OK_RAW_HTML));
    const controller = new AbortController();
    controller.abort();
    await expect(
      FirecrawlClient.scrape('https://a.test/', { format: 'rawHtml', signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(post).not.toHaveBeenCalled();
  });

  it('排队中取消时不发请求', async () => {
    const post = vi.spyOn(axios, 'post').mockImplementation(() => new Promise(() => {}));
    void FirecrawlClient.scrape('https://a.test/1', { format: 'rawHtml' });
    void FirecrawlClient.scrape('https://a.test/2', { format: 'rawHtml' });
    const controller = new AbortController();
    const queued = FirecrawlClient.scrape('https://a.test/3', {
      format: 'rawHtml',
      signal: controller.signal,
    });
    await Promise.resolve();
    controller.abort();
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    expect(post).toHaveBeenCalledTimes(2);
  });
});

describe('scrape 响应处理', () => {
  it('目标站状态码 >= 400 视为失败并携带状态码', async () => {
    mockPost(reply(200, SCRAPE_TARGET_404));
    const error = await FirecrawlClient.scrape('https://a.test/', { format: 'rawHtml' }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(FirecrawlTargetError);
    expect((error as FirecrawlTargetError).targetStatus).toBe(404);
  });

  it('内容为空视为失败', async () => {
    mockPost(reply(200, SCRAPE_EMPTY));
    await expect(
      FirecrawlClient.scrape('https://a.test/', { format: 'rawHtml' }),
    ).rejects.toBeInstanceOf(FirecrawlEmptyContentError);
  });

  it('402 → 额度耗尽（有 Key），且不以 keyless 重试', async () => {
    apiKey = 'fc-abc';
    const post = mockPost(reply(402, ERROR_402));
    const error = await FirecrawlClient.scrape('https://a.test/', { format: 'rawHtml' }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(FirecrawlQuotaError);
    expect((error as FirecrawlQuotaError).keyless).toBe(false);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('keyless 429 且文案指向日限额 → 立即额度耗尽', async () => {
    const post = mockPost(reply(429, ERROR_429_KEYLESS_DAILY));
    const error = await FirecrawlClient.scrape('https://a.test/', { format: 'rawHtml' }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(FirecrawlQuotaError);
    expect((error as FirecrawlQuotaError).keyless).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('keyless 429 文案含 free 但 reason 非 credits 且等待短：按限速等待响应体给出的秒数后重试', async () => {
    vi.useFakeTimers();
    const post = mockPost(reply(429, ERROR_429_KEYLESS_SHORT), reply(200, SCRAPE_OK_RAW_HTML));
    const pending = FirecrawlClient.scrape('https://a.test/', { format: 'rawHtml' });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(post).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ statusCode: 200 });
  });

  it('keyless 429 且 Retry-After 超过 120 秒 → 立即额度耗尽', async () => {
    mockPost(reply(429, ERROR_429_RATE, { 'retry-after': '3600' }));
    await expect(
      FirecrawlClient.scrape('https://a.test/', { format: 'rawHtml' }),
    ).rejects.toBeInstanceOf(FirecrawlQuotaError);
  });
});

describe('429 重试', () => {
  it('遵守 Retry-After 后重试成功', async () => {
    vi.useFakeTimers();
    apiKey = 'fc-abc';
    const post = mockPost(
      reply(429, ERROR_429_RATE, { 'retry-after': '3' }),
      reply(200, SCRAPE_OK_RAW_HTML),
    );
    const pending = FirecrawlClient.scrape('https://a.test/', { format: 'rawHtml' });
    await vi.advanceTimersByTimeAsync(2999);
    expect(post).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ statusCode: 200 });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('429 暂停整个队列：其它请求在等待期结束前不发出', async () => {
    vi.useFakeTimers();
    apiKey = 'fc-abc';
    const post = vi.spyOn(axios, 'post');
    post.mockResolvedValueOnce(reply(429, ERROR_429_RATE, { 'retry-after': '3' }) as never);
    post.mockResolvedValue(reply(200, SCRAPE_OK_RAW_HTML) as never);
    const first = FirecrawlClient.scrape('https://a.test/1', { format: 'rawHtml' });
    await vi.advanceTimersByTimeAsync(0);
    const second = FirecrawlClient.scrape('https://a.test/2', { format: 'rawHtml' });
    await vi.advanceTimersByTimeAsync(2_999);
    expect(post).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all([first, second]);
    expect(post).toHaveBeenCalledTimes(3);
  });

  it('没有固定的每分钟上限：付费档不被免费档速率拖慢（仅限并发 2）', async () => {
    vi.useFakeTimers();
    apiKey = 'fc-abc';
    const post = vi.spyOn(axios, 'post').mockResolvedValue(reply(200, SCRAPE_OK_RAW_HTML) as never);
    const all = Array.from({ length: 11 }, (_, i) =>
      FirecrawlClient.scrape(`https://a.test/${i}`, { format: 'rawHtml' }),
    );
    await vi.advanceTimersByTimeAsync(0);
    await Promise.all(all);
    expect(post).toHaveBeenCalledTimes(11);
  });

  it('429 未给出等待时间时暂停 20 秒（3 次重试覆盖一分钟的限速窗口）', async () => {
    vi.useFakeTimers();
    apiKey = 'fc-abc';
    const post = mockPost(reply(429, ERROR_429_RATE), reply(200, SCRAPE_OK_RAW_HTML));
    const pending = FirecrawlClient.scrape('https://a.test/', { format: 'rawHtml' });
    await vi.advanceTimersByTimeAsync(19_999);
    expect(post).toHaveBeenCalledTimes(1);
    expect(FirecrawlClient.pauseRemainingMs()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ statusCode: 200 });
    expect(FirecrawlClient.pauseRemainingMs()).toBe(0);
  });

  it('在途请求收到 429 时，排队中的请求在暂停结束前不会借释放的名额发出', async () => {
    vi.useFakeTimers();
    apiKey = 'fc-abc';
    const post = vi.spyOn(axios, 'post');
    post.mockResolvedValueOnce(reply(429, ERROR_429_RATE, { 'retry-after': '3' }) as never);
    post.mockImplementationOnce(() => new Promise(() => {}));
    post.mockResolvedValue(reply(200, SCRAPE_OK_RAW_HTML) as never);
    void FirecrawlClient.scrape('https://a.test/1', { format: 'rawHtml' });
    void FirecrawlClient.scrape('https://a.test/2', { format: 'rawHtml' });
    const third = FirecrawlClient.scrape('https://a.test/3', { format: 'rawHtml' });
    await vi.advanceTimersByTimeAsync(2_999);
    expect(post).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(post.mock.calls.length).toBeGreaterThan(2);
    void third;
  });

  it('在途请求收到 402 时，排队中的请求不再发出而直接额度耗尽', async () => {
    apiKey = 'fc-abc';
    const post = vi.spyOn(axios, 'post');
    post.mockResolvedValueOnce(reply(402, ERROR_402) as never);
    post.mockImplementationOnce(() => new Promise(() => {}));
    post.mockResolvedValue(reply(200, SCRAPE_OK_RAW_HTML) as never);
    const first = FirecrawlClient.scrape('https://a.test/1', { format: 'rawHtml' }).catch((e) => e);
    void FirecrawlClient.scrape('https://a.test/2', { format: 'rawHtml' });
    const third = FirecrawlClient.scrape('https://a.test/3', { format: 'rawHtml' }).catch((e) => e);
    expect(await first).toBeInstanceOf(FirecrawlQuotaError);
    expect(await third).toBeInstanceOf(FirecrawlQuotaError);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('有 Key 时重试耗尽 → 限速错误', async () => {
    vi.useFakeTimers();
    apiKey = 'fc-abc';
    const post = mockPost(
      reply(429, ERROR_429_RATE, { 'retry-after': '1' }),
      reply(429, ERROR_429_RATE, { 'retry-after': '1' }),
      reply(429, ERROR_429_RATE, { 'retry-after': '1' }),
      reply(429, ERROR_429_RATE, { 'retry-after': '1' }),
    );
    const pending = FirecrawlClient.scrape('https://a.test/', { format: 'rawHtml' }).catch(
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBeInstanceOf(FirecrawlRateLimitError);
    expect(post).toHaveBeenCalledTimes(4);
  });

  it('keyless 普通 429（非日额度）重试耗尽 → 限速错误，不锁存额度', async () => {
    vi.useFakeTimers();
    mockPost(
      reply(429, ERROR_429_RATE, { 'retry-after': '1' }),
      reply(429, ERROR_429_RATE, { 'retry-after': '1' }),
      reply(429, ERROR_429_RATE, { 'retry-after': '1' }),
      reply(429, ERROR_429_RATE, { 'retry-after': '1' }),
    );
    const pending = FirecrawlClient.scrape('https://a.test/', { format: 'rawHtml' }).catch(
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBeInstanceOf(FirecrawlRateLimitError);
    mockPost(reply(200, SCRAPE_OK_RAW_HTML));
    await expect(
      FirecrawlClient.scrape('https://a.test/again', { format: 'rawHtml' }),
    ).resolves.toMatchObject({ statusCode: 200 });
  });
});

describe('额度查询', () => {
  it('返回剩余 / 套餐额度与账期结束日', async () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValueOnce(reply(200, CREDIT_USAGE_OK) as never);
    const result = await FirecrawlClient.getCreditUsage('fc-abc');
    expect(result).toEqual({
      kind: 'ok',
      remainingCredits: 480,
      planCredits: 500,
      billingPeriodEnd: '2026-10-01T00:00:00Z',
    });
    const [url, config] = get.mock.calls[0]! as [string, any];
    expect(url).toBe('https://api.firecrawl.dev/v2/team/credit-usage');
    expect(config.headers.Authorization).toBe('Bearer fc-abc');
  });

  it('401 → invalid-key 结果', async () => {
    vi.spyOn(axios, 'get').mockResolvedValueOnce(reply(401, ERROR_401) as never);
    await expect(FirecrawlClient.getCreditUsage('fc-wrong')).resolves.toEqual({
      kind: 'invalid-key',
    });
  });

  it('其他错误抛出', async () => {
    vi.spyOn(axios, 'get').mockResolvedValueOnce(reply(500, { success: false }) as never);
    await expect(FirecrawlClient.getCreditUsage('fc-abc')).rejects.toThrow();
  });
});

describe('search', () => {
  it('description 映射为 snippet，并发送 limit 与 60s 服务端超时', async () => {
    const post = mockPost(reply(200, SEARCH_OK));
    const results = await FirecrawlClient.search('無職転生 作者', { limit: 5 });
    const [url, body] = post.mock.calls[0]! as [string, Record<string, unknown>];
    expect(url).toBe('https://api.firecrawl.dev/v2/search');
    expect(body).toEqual({ query: '無職転生 作者', limit: 5, timeout: 60000 });
    expect(results).toEqual([
      {
        title: '理不尽な孫の手 - Wikipedia',
        url: 'https://ja.wikipedia.org/wiki/理不尽な孫の手',
        snippet: '日本のライトノベル作家。代表作は『無職転生』。',
      },
    ]);
  });

  it('402 → 额度耗尽', async () => {
    apiKey = 'fc-abc';
    mockPost(reply(402, ERROR_402));
    await expect(FirecrawlClient.search('q')).rejects.toBeInstanceOf(FirecrawlQuotaError);
  });
});

describe('额度锁存', () => {
  it('额度耗尽后同一 Key 的后续请求不发网络请求直接失败', async () => {
    apiKey = 'fc-abc';
    const post = mockPost(reply(402, ERROR_402));
    await FirecrawlClient.scrape('https://a.test/1', { format: 'rawHtml' }).catch(() => {});
    await expect(
      FirecrawlClient.scrape('https://a.test/2', { format: 'rawHtml' }),
    ).rejects.toBeInstanceOf(FirecrawlQuotaError);
    await expect(FirecrawlClient.search('q')).rejects.toBeInstanceOf(FirecrawlQuotaError);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('更换 Key 后解除锁存', async () => {
    apiKey = 'fc-abc';
    const post = mockPost(reply(402, ERROR_402), reply(200, SCRAPE_OK_RAW_HTML));
    await FirecrawlClient.scrape('https://a.test/1', { format: 'rawHtml' }).catch(() => {});
    apiKey = 'fc-new';
    await expect(
      FirecrawlClient.scrape('https://a.test/2', { format: 'rawHtml' }),
    ).resolves.toMatchObject({ statusCode: 200 });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('当前 Key 的额度查询显示仍有额度时解除锁存', async () => {
    apiKey = 'fc-abc';
    const post = mockPost(reply(402, ERROR_402), reply(200, SCRAPE_OK_RAW_HTML));
    await FirecrawlClient.scrape('https://a.test/1', { format: 'rawHtml' }).catch(() => {});
    vi.spyOn(axios, 'get').mockResolvedValueOnce(reply(200, CREDIT_USAGE_OK) as never);
    await FirecrawlClient.getCreditUsage('fc-abc');
    await expect(
      FirecrawlClient.scrape('https://a.test/2', { format: 'rawHtml' }),
    ).resolves.toMatchObject({ statusCode: 200 });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('keyless 日额度锁存持续到响应体给出的 retry_after_seconds', async () => {
    vi.useFakeTimers();
    const post = mockPost(reply(429, ERROR_429_KEYLESS_DAILY), reply(200, SCRAPE_OK_RAW_HTML));
    await FirecrawlClient.scrape('https://a.test/1', { format: 'rawHtml' }).catch(() => {});
    await vi.advanceTimersByTimeAsync(2 * 60 * 60_000);
    await expect(
      FirecrawlClient.scrape('https://a.test/2', { format: 'rawHtml' }),
    ).rejects.toBeInstanceOf(FirecrawlQuotaError);
    await vi.advanceTimersByTimeAsync(81741_000);
    await expect(
      FirecrawlClient.scrape('https://a.test/3', { format: 'rawHtml' }),
    ).resolves.toMatchObject({ statusCode: 200 });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('服务端给出较短等待时间时按其锁存（不强制 60 分钟）', async () => {
    vi.useFakeTimers();
    const post = mockPost(
      reply(429, { ...ERROR_429_KEYLESS_DAILY, retry_after_seconds: 300 }),
      reply(200, SCRAPE_OK_RAW_HTML),
    );
    await FirecrawlClient.scrape('https://a.test/1', { format: 'rawHtml' }).catch(() => {});
    await vi.advanceTimersByTimeAsync(299_000);
    await expect(
      FirecrawlClient.scrape('https://a.test/2', { format: 'rawHtml' }),
    ).rejects.toBeInstanceOf(FirecrawlQuotaError);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(
      FirecrawlClient.scrape('https://a.test/3', { format: 'rawHtml' }),
    ).resolves.toMatchObject({ statusCode: 200 });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('402 携带等待时间时按其锁存', async () => {
    vi.useFakeTimers();
    apiKey = 'fc-abc';
    const post = mockPost(
      reply(402, { ...ERROR_402, retry_after_seconds: 120 }),
      reply(200, SCRAPE_OK_RAW_HTML),
    );
    await FirecrawlClient.scrape('https://a.test/1', { format: 'rawHtml' }).catch(() => {});
    await vi.advanceTimersByTimeAsync(119_000);
    await expect(
      FirecrawlClient.scrape('https://a.test/2', { format: 'rawHtml' }),
    ).rejects.toBeInstanceOf(FirecrawlQuotaError);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(
      FirecrawlClient.scrape('https://a.test/3', { format: 'rawHtml' }),
    ).resolves.toMatchObject({ statusCode: 200 });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('没有等待时间的额度耗尽：60 分钟后自动解除锁存', async () => {
    vi.useFakeTimers();
    apiKey = 'fc-abc';
    const post = mockPost(reply(402, ERROR_402), reply(200, SCRAPE_OK_RAW_HTML));
    await FirecrawlClient.scrape('https://a.test/1', { format: 'rawHtml' }).catch(() => {});
    await vi.advanceTimersByTimeAsync(59 * 60_000);
    await expect(
      FirecrawlClient.scrape('https://a.test/2', { format: 'rawHtml' }),
    ).rejects.toBeInstanceOf(FirecrawlQuotaError);
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(
      FirecrawlClient.scrape('https://a.test/3', { format: 'rawHtml' }),
    ).resolves.toMatchObject({ statusCode: 200 });
    expect(post).toHaveBeenCalledTimes(2);
  });
});
