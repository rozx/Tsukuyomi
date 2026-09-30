import { afterEach, describe, expect, it, vi } from 'vitest';
import { agentText } from '../i18n/translate';
import './setup';
import axios, { AxiosError, AxiosHeaders } from 'axios';
import { webSearchTools, searchWeb } from '../services/ai/tools/web-search-tools';
import { GlobalConfig } from '../services/global-config-cache';
import { FirecrawlClient } from '../services/firecrawl/firecrawl-client';
import {
  FirecrawlError,
  FirecrawlQuotaError,
  FirecrawlRateLimitError,
  FirecrawlTargetError,
  FirecrawlEmptyContentError,
} from '../services/firecrawl/firecrawl-errors';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';

afterEach(() => vi.restoreAllMocks());
function setup(fallback: boolean) {
  vi.spyOn(GlobalConfig, 'ensureInitialized').mockResolvedValue();
  vi.spyOn(GlobalConfig, 'getTavilyApiKey').mockReturnValue('');
  vi.spyOn(GlobalConfig, 'getFirecrawlFallbackEnabled').mockReturnValue(fallback);
}
describe('网页工具自有反馈为简中单源', () => {
  it('结构化Firecrawl HTTP失败的自有前缀为简中，诊断作为原文保留', async () => {
    setup(true);
    vi.spyOn(FirecrawlClient, 'search').mockRejectedValue(
      new FirecrawlError('Firecrawl 请求失败: 503 provider 原始诊断', 503, 'provider 原始诊断'),
    );
    const result = await searchWeb('query', undefined, 'en-US');
    expect(result.error_code).toBe('FIRECRAWL_HTTP_FAILED');
    expect(result.error).toBe(agentText('aiWebFeedback.httpError', { status: 503 }));
    expect(result.message).toBe(
      agentText('aiWebFeedback.httpMessage', { status: 503, detail: 'provider 原始诊断' }),
    );
  });

  it('英文网页读取保留来源标题/内容，格式与空提取反馈为简中单源', async () => {
    setup(false);
    const fetch = webSearchTools.find((tool) => tool.definition.function.name === 'fetch_webpage')!;
    const context = { languages: captureExecutionLanguages('en-US') };
    expect(JSON.parse(await fetch.handler({ url: 'invalid URL' }, context)).error_code).toBe(
      'WEB_URL_INVALID',
    );
    vi.spyOn(GlobalConfig, 'getTavilyApiKey').mockReturnValue('fixture');
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { results: [] } });
    const empty = JSON.parse(await fetch.handler({ url: 'https://source.test/{raw}' }, context));
    expect(empty.error_code).toBe('WEB_EXTRACT_EMPTY');
    expect(empty.message).toContain('https://source.test/{raw}');
    expect(empty.message).toMatch(/\p{Script=Han}/u);
    vi.spyOn(axios, 'post').mockResolvedValue({
      data: { results: [{ rawContent: '<title>来源标题</title><p>原文内容</p>' }] },
    });
    const page = JSON.parse(await fetch.handler({ url: 'https://source.test/' }, context));
    expect(page.title).toBe('来源标题');
    expect(page.content).toBe('<title>来源标题</title><p>原文内容</p>');
    expect(page.provider).toBe('tavily');
  });
  it('Tavily鉴权失败的搜索与网页说明在三种执行语言下相同并保持固定code', async () => {
    setup(false);
    vi.spyOn(GlobalConfig, 'getTavilyApiKey').mockReturnValue('fixture');
    vi.spyOn(axios, 'post').mockRejectedValue(
      new AxiosError(
        'provider 401',
        'ERR_BAD_RESPONSE',
        undefined,
        {},
        {
          status: 401,
          statusText: '',
          data: '',
          config: { headers: new AxiosHeaders() },
          headers: {},
        },
      ),
    );
    for (const locale of ['zh-CN', 'zh-TW', 'en-US'] as const) {
      for (const tool of webSearchTools) {
        const result = JSON.parse(
          await tool.handler(
            tool.definition.function.name === 'search_web'
              ? { query: 'query' }
              : { url: 'https://source.test/' },
            { languages: captureExecutionLanguages(locale) },
          ),
        );
        expect(result.error_code).toBe('TAVILY_UNAUTHORIZED');
        expect(result.message).toMatch(/Tavily API Key/);
        expect(result.message).toMatch(/\p{Script=Han}/u);
      }
    }
  });

  for (const locale of ['zh-CN', 'zh-TW', 'en-US'] as const) {
    it(`${locale} 必填及配置失败有稳定 code`, async () => {
      setup(false);
      const search = webSearchTools.find((tool) => tool.definition.function.name === 'search_web')!;
      const fetch = webSearchTools.find(
        (tool) => tool.definition.function.name === 'fetch_webpage',
      )!;
      const context = { languages: captureExecutionLanguages(locale) };
      expect(JSON.parse(await search.handler({}, context)).error_code).toBe('WEB_QUERY_REQUIRED');
      expect(JSON.parse(await fetch.handler({}, context)).error_code).toBe('WEB_URL_REQUIRED');
      const result = JSON.parse(await search.handler({ query: 'ユーザー {raw}|query' }, context));
      expect(result.error_code).toBe('WEB_SEARCH_NOT_CONFIGURED');
      expect(result.message).toBe(agentText('aiWebFeedback.searchConfigure'));
    });
  }
  for (const [error, code] of [
    [new FirecrawlQuotaError(true), 'FIRECRAWL_QUOTA_EXHAUSTED'],
    [new FirecrawlRateLimitError(), 'FIRECRAWL_RATE_LIMITED'],
    [new FirecrawlTargetError(403), 'FIRECRAWL_TARGET_FAILED'],
    [new FirecrawlEmptyContentError(), 'FIRECRAWL_EMPTY_CONTENT'],
  ] as const) {
    it(`${code} 英文执行也用简中解释并保留错误身份`, async () => {
      setup(true);
      vi.spyOn(FirecrawlClient, 'search').mockRejectedValue(error);
      const result = await searchWeb('query', undefined, 'en-US');
      expect(result.error_code).toBe(code);
      expect(result.error).toMatch(/\p{Script=Han}/u);
      expect(result.message).toMatch(/\p{Script=Han}/u);
    });
  }
  it('等配置初始化期间更换上下文也保留开始时语言，查询与外部诊断原样', async () => {
    setup(false);
    vi.spyOn(GlobalConfig, 'getTavilyApiKey').mockReturnValue('fixture');
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    vi.spyOn(GlobalConfig, 'ensureInitialized').mockImplementation(async () => {
      entered.resolve();
      await release.promise;
    });
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('provider 原始诊断 {x}|raw'));
    const tool = webSearchTools.find((entry) => entry.definition.function.name === 'search_web')!;
    const context = { languages: captureExecutionLanguages('en-US') };
    const pending = tool.handler({ query: '用户 query {x}|raw' }, context);
    await entered.promise;
    context.languages = captureExecutionLanguages('zh-CN');
    release.resolve();
    const result = JSON.parse(await pending);
    expect(result.error_code).toBe('WEB_SEARCH_FAILED');
    expect(result.error).toBe('provider 原始诊断 {x}|raw');
    expect(result.message).toContain('用户 query {x}|raw');
    expect(result.message).toMatch(/^网络搜索暂时不可用/);
  });
});
