import './setup';
import { describe, expect, it } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import {
  BlockedResponseError,
  HttpStatusError,
  classifyFetchFailure,
  resolveFetchPlan,
  type FetchPlanInput,
} from 'src/services/proxy-fetch-plan';

const CORS = 'https://cors.rozx.moe/?{url}';
const OTHER = 'https://other.proxy/?u={url}';
const KAKUYOMU = 'https://kakuyomu.jp/works/1/episodes/2';
const SYOSETU = 'https://syosetu.org/novel/375522/6.html';

const wrap = (template: string, url: string) => template.replace('{url}', encodeURIComponent(url));

function input(overrides: Partial<FetchPlanInput> = {}): FetchPlanInput {
  return {
    url: KAKUYOMU,
    isElectron: false,
    proxyEnabled: true,
    defaultProxyUrl: CORS,
    siteProxies: [],
    firecrawlFallbackEnabled: true,
    ...overrides,
  };
}

describe('resolveFetchPlan', () => {
  it('Web 代理开启、无映射：默认代理 + Firecrawl 回退', () => {
    expect(resolveFetchPlan(input())).toEqual({
      firecrawlFirst: false,
      attempts: [wrap(CORS, KAKUYOMU)],
      firecrawlFallback: true,
    });
  });

  it('Web 代理开启、CORS 映射：按映射顺序，不含未映射的默认代理', () => {
    expect(resolveFetchPlan(input({ siteProxies: [OTHER, CORS] })).attempts).toEqual([
      wrap(OTHER, KAKUYOMU),
      wrap(CORS, KAKUYOMU),
    ]);
  });

  it('firecrawl 在映射首位且回退开启：直接走 Firecrawl，不做首要尝试', () => {
    expect(resolveFetchPlan(input({ url: SYOSETU, siteProxies: ['firecrawl', CORS] }))).toEqual({
      firecrawlFirst: true,
      attempts: [],
      firecrawlFallback: false,
    });
  });

  it('firecrawl 映射但回退关闭：跳过令牌，用其余 CORS 条目', () => {
    expect(
      resolveFetchPlan(
        input({ url: SYOSETU, siteProxies: ['firecrawl', CORS], firecrawlFallbackEnabled: false }),
      ),
    ).toEqual({ firecrawlFirst: false, attempts: [wrap(CORS, SYOSETU)], firecrawlFallback: false });
  });

  it('映射只有 firecrawl 且回退关闭：退回默认代理', () => {
    expect(
      resolveFetchPlan(
        input({ url: SYOSETU, siteProxies: ['firecrawl'], firecrawlFallbackEnabled: false }),
      ).attempts,
    ).toEqual([wrap(CORS, SYOSETU)]);
  });

  it('令牌不在首位时不会被当作 URL 模板', () => {
    const plan = resolveFetchPlan(input({ url: SYOSETU, siteProxies: [CORS, 'firecrawl'] }));
    expect(plan.firecrawlFirst).toBe(false);
    expect(plan.attempts).toEqual([wrap(CORS, SYOSETU)]);
    expect(plan.attempts.join()).not.toContain('firecrawl');
  });

  it('Web 代理关闭：内部 /api/ 路径，仍保留 Firecrawl 回退', () => {
    expect(resolveFetchPlan(input({ proxyEnabled: false }))).toEqual({
      firecrawlFirst: false,
      attempts: ['/api/kakuyomu/works/1/episodes/2'],
      firecrawlFallback: true,
    });
  });

  it('Web 代理关闭、非内置站点：直连原始 URL', () => {
    expect(resolveFetchPlan(input({ proxyEnabled: false, url: 'https://x.test/a' })).attempts).toEqual([
      'https://x.test/a',
    ]);
  });

  it('Electron：忽略存储的 proxyEnabled 与默认代理，直连原始 URL', () => {
    expect(resolveFetchPlan(input({ isElectron: true, skipInternalProxy: true }))).toEqual({
      firecrawlFirst: false,
      attempts: [KAKUYOMU],
      firecrawlFallback: true,
    });
  });

  it('Electron：忽略 CORS 映射条目，但 firecrawl 首位映射仍生效', () => {
    expect(
      resolveFetchPlan(input({ isElectron: true, siteProxies: [CORS] })).attempts,
    ).toEqual([KAKUYOMU]);
    expect(
      resolveFetchPlan(input({ isElectron: true, siteProxies: ['firecrawl', CORS] })).firecrawlFirst,
    ).toBe(true);
  });

  it('skipExternalProxy：不包装 CORS，仍保留 Firecrawl 回退', () => {
    expect(
      resolveFetchPlan(
        input({ url: 'https://novel18.syosetu.com/n1/', skipExternalProxy: true, siteProxies: [CORS] }),
      ),
    ).toEqual({
      firecrawlFirst: false,
      attempts: ['/api/novel18/n1/'],
      firecrawlFallback: true,
    });
  });

  it('回退关闭：firecrawlFallback 为 false', () => {
    expect(resolveFetchPlan(input({ firecrawlFallbackEnabled: false })).firecrawlFallback).toBe(false);
  });

  it('/api/ 相对路径原样使用', () => {
    expect(resolveFetchPlan(input({ url: '/api/kakuyomu/x' })).attempts).toEqual(['/api/kakuyomu/x']);
  });
});

function axiosStatusError(status: number): AxiosError {
  return new AxiosError(
    `Request failed with status code ${status}`,
    'ERR_BAD_REQUEST',
    undefined,
    {},
    { status, statusText: '', headers: {}, config: { headers: new AxiosHeaders() }, data: '' },
  );
}

describe('classifyFetchFailure', () => {
  it.each([403])('%i → blocked（不重试，直接回退）', (status) => {
    expect(classifyFetchFailure(axiosStatusError(status))).toBe('blocked');
    expect(classifyFetchFailure(new HttpStatusError(status))).toBe('blocked');
  });

  it.each([408, 429, 500, 502, 503, 504])('%i → transient（重试一次后视为被拦截）', (status) => {
    expect(classifyFetchFailure(axiosStatusError(status))).toBe('transient');
    expect(classifyFetchFailure(new HttpStatusError(status))).toBe('transient');
  });

  it.each([400, 401, 404, 410])('%i → fatal（不回退）', (status) => {
    expect(classifyFetchFailure(axiosStatusError(status))).toBe('fatal');
    expect(classifyFetchFailure(new HttpStatusError(status))).toBe('fatal');
  });

  it('质询页 → blocked', () => {
    expect(classifyFetchFailure(new BlockedResponseError('challenge'))).toBe('blocked');
  });

  it('无响应的网络 / CORS 错误 → transient', () => {
    expect(classifyFetchFailure(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe('transient');
    expect(classifyFetchFailure(new AxiosError('timeout of 60000ms exceeded', 'ECONNABORTED'))).toBe(
      'transient',
    );
  });

  it('消息型网络错误（Electron / fetch）→ transient', () => {
    expect(classifyFetchFailure(new Error('timeout'))).toBe('transient');
    expect(classifyFetchFailure(new Error('net::ERR_CONNECTION_RESET'))).toBe('transient');
    expect(classifyFetchFailure(new TypeError('Failed to fetch'))).toBe('transient');
  });

  it('其它错误 → fatal（不消耗额度）', () => {
    expect(classifyFetchFailure(new Error('返回的内容为空'))).toBe('fatal');
  });

  it('取消 → abort', () => {
    expect(classifyFetchFailure(new DOMException('操作已取消', 'AbortError'))).toBe('abort');
  });
});
