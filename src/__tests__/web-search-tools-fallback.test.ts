import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios, { AxiosError, AxiosHeaders } from 'axios';
import { GlobalConfig } from 'src/services/global-config-cache';
import { FirecrawlClient } from 'src/services/firecrawl/firecrawl-client';
import {
  FirecrawlQuotaError,
  FirecrawlRateLimitError,
  FirecrawlTargetError,
} from 'src/services/firecrawl/firecrawl-errors';
import { searchWeb, webSearchTools } from 'src/services/ai/tools/web-search-tools';

let tavilyKey: string | undefined;
let fallbackEnabled: boolean;

beforeEach(() => {
  tavilyKey = 'tvly-abc';
  fallbackEnabled = true;
  vi.spyOn(GlobalConfig, 'ensureInitialized').mockResolvedValue(undefined);
  vi.spyOn(GlobalConfig, 'getTavilyApiKey').mockImplementation(() => tavilyKey);
  vi.spyOn(GlobalConfig, 'getFirecrawlFallbackEnabled').mockImplementation(() => fallbackEnabled);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function tavilyError(status: number | undefined) {
  return new AxiosError(
    status ? `Request failed with status code ${status}` : 'Network Error',
    status ? 'ERR_BAD_RESPONSE' : 'ERR_NETWORK',
    undefined,
    {},
    status
      ? { status, statusText: '', headers: {}, config: { headers: new AxiosHeaders() }, data: {} }
      : undefined,
  );
}

const FIRECRAWL_RESULTS = [
  { title: '理不尽な孫の手', url: 'https://ja.wikipedia.org/wiki/x', snippet: '作家' },
];

async function fetchWebpageTool(url: string) {
  const tool = webSearchTools.find((t) => t.definition.function.name === 'fetch_webpage')!;
  return JSON.parse(await tool.handler({ url }, {} as never)) as Record<string, unknown>;
}

describe('search_web 提供方顺序', () => {
  it('Tavily 成功：不调用 Firecrawl，标记 provider tavily', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({
      data: { results: [{ title: 't', content: 'c', url: 'https://a.test' }], answer: 'ans' },
    });
    const firecrawl = vi.spyOn(FirecrawlClient, 'search');
    const result = await searchWeb('q');
    expect(result).toEqual({
      success: true,
      provider: 'tavily',
      results: [{ title: 't', snippet: 'c', url: 'https://a.test' }],
      answer: 'ans',
    });
    expect(firecrawl).not.toHaveBeenCalled();
  });

  it('Tavily 成功但零结果：不回退', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { results: [] } });
    const firecrawl = vi.spyOn(FirecrawlClient, 'search');
    expect((await searchWeb('q')).success).toBe(true);
    expect(firecrawl).not.toHaveBeenCalled();
  });

  it.each([432, 433, 429, 500, 401, undefined])(
    'Tavily 出错（%s）且回退开启：改用 Firecrawl',
    async (status) => {
      vi.spyOn(axios, 'post').mockRejectedValue(tavilyError(status));
      const firecrawl = vi.spyOn(FirecrawlClient, 'search').mockResolvedValue(FIRECRAWL_RESULTS);
      const result = await searchWeb('無職転生 作者');
      expect(firecrawl).toHaveBeenCalledWith('無職転生 作者', { limit: 5 });
      expect(result).toEqual({ success: true, provider: 'firecrawl', results: FIRECRAWL_RESULTS });
    },
  );

  it('Tavily 400（请求错误）不回退', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(tavilyError(400));
    const firecrawl = vi.spyOn(FirecrawlClient, 'search');
    expect((await searchWeb('q')).success).toBe(false);
    expect(firecrawl).not.toHaveBeenCalled();
  });

  it('回退关闭：返回 Tavily 错误', async () => {
    fallbackEnabled = false;
    vi.spyOn(axios, 'post').mockRejectedValue(tavilyError(500));
    const firecrawl = vi.spyOn(FirecrawlClient, 'search');
    const result = await searchWeb('q');
    expect(result.success).toBe(false);
    expect(firecrawl).not.toHaveBeenCalled();
  });

  it('无 Tavily Key、回退开启：直接 Firecrawl', async () => {
    tavilyKey = undefined;
    const post = vi.spyOn(axios, 'post');
    vi.spyOn(FirecrawlClient, 'search').mockResolvedValue(FIRECRAWL_RESULTS);
    const result = await searchWeb('q');
    expect(post).not.toHaveBeenCalled();
    expect(result.provider).toBe('firecrawl');
    expect('answer' in result).toBe(false);
  });

  it('无 Tavily Key、回退关闭：未配置错误', async () => {
    tavilyKey = undefined;
    fallbackEnabled = false;
    const result = await searchWeb('q');
    expect(result.success).toBe(false);
    expect(result.error).toContain('未配置');
  });

  it('把取消信号传给 Firecrawl', async () => {
    tavilyKey = undefined;
    const controller = new AbortController();
    const firecrawl = vi.spyOn(FirecrawlClient, 'search').mockResolvedValue([]);
    await searchWeb('q', controller.signal);
    expect(firecrawl).toHaveBeenCalledWith('q', { limit: 5, signal: controller.signal });
  });
});

describe('Firecrawl 失败信息', () => {
  beforeEach(() => {
    tavilyKey = undefined;
  });

  it('keyless 日限额：提示可配置 Firecrawl 或 Tavily Key', async () => {
    vi.spyOn(FirecrawlClient, 'search').mockRejectedValue(new FirecrawlQuotaError(true));
    const result = await searchWeb('q');
    expect(result.success).toBe(false);
    expect(result.message).toContain('每日');
    expect(result.message).toContain('Firecrawl');
    expect(result.message).toContain('Tavily');
  });

  it('有 Key 额度耗尽：提示检查额度', async () => {
    vi.spyOn(FirecrawlClient, 'search').mockRejectedValue(new FirecrawlQuotaError(false));
    expect((await searchWeb('q')).message).toContain('检查额度');
  });

  it('限速：提示稍后重试', async () => {
    vi.spyOn(FirecrawlClient, 'search').mockRejectedValue(new FirecrawlRateLimitError());
    expect((await searchWeb('q')).message).toContain('稍后');
  });
});

describe('fetch_webpage', () => {
  it('Tavily 成功：provider tavily', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({
      data: { results: [{ rawContent: '<title>T</title><p>正文</p>' }] },
    });
    const result = await fetchWebpageTool('https://a.test/');
    expect(result).toMatchObject({ success: true, provider: 'tavily', title: 'T' });
  });

  it('Tavily 5xx → Firecrawl markdown，标题取元数据，文本截断到 50000', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(tavilyError(502));
    const scrape = vi.spyOn(FirecrawlClient, 'scrape').mockResolvedValue({
      content: 'x'.repeat(60000),
      statusCode: 200,
      title: 'Example Domain',
    });
    const result = await fetchWebpageTool('https://example.com/');
    expect(scrape).toHaveBeenCalledWith('https://example.com/', {
      format: 'markdown',
      onlyMainContent: true,
    });
    expect(result.success).toBe(true);
    expect(result.provider).toBe('firecrawl');
    expect(result.title).toBe('Example Domain');
    expect((result.text as string).length).toBe(50000);
  });

  it('无 Tavily Key：直接 Firecrawl；无标题时回退为 URL', async () => {
    tavilyKey = undefined;
    vi.spyOn(FirecrawlClient, 'scrape').mockResolvedValue({ content: '正文', statusCode: 200 });
    const result = await fetchWebpageTool('https://example.com/');
    expect(result).toMatchObject({
      success: true,
      provider: 'firecrawl',
      title: 'https://example.com/',
      text: '正文',
    });
  });

  it('目标网页错误：返回 success false 与状态码', async () => {
    tavilyKey = undefined;
    vi.spyOn(FirecrawlClient, 'scrape').mockRejectedValue(new FirecrawlTargetError(404));
    const result = await fetchWebpageTool('https://example.com/missing');
    expect(result.success).toBe(false);
    expect(result.message).toContain('404');
  });
});
