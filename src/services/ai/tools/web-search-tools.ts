import type webFeedback from 'src/i18n/zh-CN/web-feedback';
import { agentText } from 'src/i18n/translate';
import { toolErrorJson } from './tool-feedback';
import { validToolQuery } from './tool-feedback';
import { describeTool, stringToolParameter, toolDefinition } from './tool-localization';
import axios from 'axios';
import type { ToolDefinition, ToolContext } from './types';
import { GlobalConfig } from 'src/services/global-config-cache';
import { FirecrawlClient } from 'src/services/firecrawl/firecrawl-client';
import {
  FirecrawlError,
  FirecrawlQuotaError,
  FirecrawlRateLimitError,
  FirecrawlTargetError,
  FirecrawlEmptyContentError,
} from 'src/services/firecrawl/firecrawl-errors';

/**
 * 网络搜索 / 网页读取：配置 Tavily Key 时优先 Tavily，Tavily 出错（额度 / 限速 / 5xx / 网络 / Key 无效）
 * 或未配置时，若开启 Firecrawl 回退则改用 Firecrawl。结果形状与提供方无关，并标注 provider。
 */

const TAVILY_API_URL = 'https://api.tavily.com';
const WEBPAGE_TEXT_LIMIT = 50000;
const SEARCH_RESULT_LIMIT = 5;

type Provider = 'tavily' | 'firecrawl';

type WebFeedbackKey = keyof typeof webFeedback.aiWebFeedback;

/** 自有失败说明的身份（aiWebFeedback 下的 key 与参数）。 */
export interface WebFeedbackEntry {
  key: WebFeedbackKey;
  values: Record<string, string | number>;
}

/**
 * 失败说明的结构化身份，供导入工作台按界面语言重新投影；返回给模型的 JSON 中不包含它。
 * error 缺省表示错误原因为外部原始诊断，保持原文。
 */
export interface WebFailureFeedback {
  error?: WebFeedbackEntry;
  message: WebFeedbackEntry;
}

interface SearchResultItem {
  title: string;
  snippet: string;
  url: string;
}

interface SearchWebResult {
  success: boolean;
  provider?: Provider;
  results?: SearchResultItem[];
  answer?: string;
  error?: string;
  error_code?: string;
  message?: string;
  feedback?: WebFailureFeedback;
}

interface FetchWebpageResult {
  success: boolean;
  provider?: Provider;
  title?: string;
  content?: string;
  text?: string;
  error?: string;
  error_code?: string;
  message?: string;
  feedback?: WebFailureFeedback;
}

/** 返回给模型的 JSON：去掉仅供界面重投影的结构化身份。 */
function modelJson(result: SearchWebResult | FetchWebpageResult): string {
  const { feedback, ...rest } = result;
  void feedback;
  return JSON.stringify(rest);
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 判断错误是否为 Tavily API Key 鉴权失败（401 / unauthorized）
 */
function isUnauthorizedError(error: unknown, errorMessage: string): boolean {
  return (
    errorMessage.includes('401') ||
    errorMessage.includes('unauthorized') ||
    (axios.isAxiosError(error) && error.response?.status === 401)
  );
}

/**
 * Tavily 错误是否可回退 Firecrawl：Key 无效、额度（432/433）、限速、5xx、网络 / 超时。
 * 其它 4xx（如请求参数错误）不回退。
 */
function isTavilyFallbackEligible(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  if (status === undefined) return true;
  return status === 401 || status === 429 || status === 432 || status === 433 || status >= 500;
}

/**
 * 校验字符串是否为合法 URL
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 从 HTML 原文中提取 <title>，未命中时回退到 fallback
 */
function extractHtmlTitle(rawContent: string, fallback: string): string {
  const titleMatch = rawContent.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    return titleMatch[1].trim();
  }
  return fallback;
}

/** Firecrawl 失败时给 AI 的说明：区分额度（有 Key / keyless）、限速与目标网页错误 */
function webFailure(
  code: string,
  errorKey: WebFeedbackKey,
  messageKey: WebFeedbackKey,
  values: Record<string, string | number> = {},
) {
  return {
    success: false as const,
    error_code: code,
    error: agentText(`aiWebFeedback.${errorKey}`, values),
    message: agentText(`aiWebFeedback.${messageKey}`, values),
    feedback: { error: { key: errorKey, values }, message: { key: messageKey, values } },
  };
}

/** 错误原因为外部原始诊断（保持原文）时，只有说明带有自有身份。 */
function rawFailure(
  code: string,
  detail: string,
  messageKey: WebFeedbackKey,
  values: Record<string, string | number>,
) {
  return {
    success: false as const,
    error_code: code,
    error: detail,
    message: agentText(`aiWebFeedback.${messageKey}`, values),
    feedback: { message: { key: messageKey, values } },
  };
}
function firecrawlFailure(error: unknown): SearchWebResult {
  if (error instanceof FirecrawlQuotaError)
    return webFailure(
      'FIRECRAWL_QUOTA_EXHAUSTED',
      'quota',
      error.keyless ? 'quotaKeyless' : 'quotaKey',
    );
  if (error instanceof FirecrawlRateLimitError)
    return webFailure('FIRECRAWL_RATE_LIMITED', 'rate', 'retryLater');
  if (error instanceof FirecrawlTargetError)
    return webFailure('FIRECRAWL_TARGET_FAILED', 'targetError', 'targetMessage', {
      status: error.targetStatus,
    });
  if (error instanceof FirecrawlEmptyContentError)
    return webFailure('FIRECRAWL_EMPTY_CONTENT', 'empty', 'empty');
  if (
    error instanceof FirecrawlError &&
    error.status !== undefined &&
    error.diagnostic !== undefined
  ) {
    return webFailure('FIRECRAWL_HTTP_FAILED', 'httpError', 'httpMessage', {
      status: error.status,
      detail: error.diagnostic,
    });
  }
  const detail = errorMessageOf(error);
  return rawFailure('FIRECRAWL_FAILED', detail, 'failed', { detail });
}

async function tavilySearch(
  apiKey: string,
  query: string,
  signal?: AbortSignal,
): Promise<SearchWebResult> {
  const response = await axios.post(
    `${TAVILY_API_URL}/search`,
    {
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: SEARCH_RESULT_LIMIT,
      include_answer: true,
      include_raw_content: false,
      include_images: false,
    },
    {
      timeout: 30000,
      ...(signal ? { signal } : {}),
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
  const results: SearchResultItem[] =
    response.data.results?.map((result: any) => ({
      title: result.title,
      snippet: result.content,
      url: result.url,
    })) || [];
  return {
    success: true,
    provider: 'tavily',
    results,
    ...(response.data.answer ? { answer: response.data.answer } : {}),
  };
}

function tavilySearchFailure(error: unknown, query: string): SearchWebResult {
  const detail = errorMessageOf(error);
  if (isUnauthorizedError(error, detail))
    return webFailure('TAVILY_UNAUTHORIZED', 'keyInvalid', 'checkSearchKey');
  return rawFailure('WEB_SEARCH_FAILED', detail, 'searchFailed', { detail, query });
}

async function firecrawlSearch(query: string, signal?: AbortSignal): Promise<SearchWebResult> {
  try {
    const results = await FirecrawlClient.search(query, {
      limit: SEARCH_RESULT_LIMIT,
      ...(signal ? { signal } : {}),
    });
    return { success: true, provider: 'firecrawl', results };
  } catch (error) {
    if (signal?.aborted) throw error;
    console.error('[WebSearch] ❌ Firecrawl 搜索失败', { query, error: errorMessageOf(error) });
    return firecrawlFailure(error);
  }
}

/**
 * 网络搜索（助手 search_web 与导入 agent 元信息搜索共用）
 */
export async function searchWeb(query: string, signal?: AbortSignal): Promise<SearchWebResult> {
  await GlobalConfig.ensureInitialized({ ensureSettings: true, ensureBooks: false });
  const apiKey = GlobalConfig.getTavilyApiKey();
  const fallbackEnabled = GlobalConfig.getFirecrawlFallbackEnabled();

  if (apiKey) {
    try {
      return await tavilySearch(apiKey, query, signal);
    } catch (error) {
      console.error('[WebSearch] ❌ Tavily 搜索失败', { query, error: errorMessageOf(error) });
      if (!fallbackEnabled || !isTavilyFallbackEligible(error)) {
        return tavilySearchFailure(error, query);
      }
    }
  } else if (!fallbackEnabled) {
    return webFailure('WEB_SEARCH_NOT_CONFIGURED', 'searchMissing', 'searchConfigure');
  }
  return firecrawlSearch(query, signal);
}

async function tavilyExtract(apiKey: string, url: string): Promise<FetchWebpageResult> {
  const response = await axios.post(
    `${TAVILY_API_URL}/extract`,
    {
      api_key: apiKey,
      urls: [url],
      extract_depth: 'basic',
      include_images: false,
    },
    {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
  // Tavily extract 返回 results 数组，取第一个结果
  const firstResult = response.data.results?.[0];
  if (!firstResult) {
    return webFailure('WEB_EXTRACT_EMPTY', 'extractEmpty', 'extractMessage', { url });
  }
  const rawContent = firstResult.rawContent || '';
  const text = rawContent
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    success: true,
    provider: 'tavily',
    title: extractHtmlTitle(rawContent, url),
    text: text.substring(0, WEBPAGE_TEXT_LIMIT),
    content: rawContent,
  };
}

function tavilyExtractFailure(error: unknown, url: string): FetchWebpageResult {
  const detail = errorMessageOf(error);
  if (isUnauthorizedError(error, detail))
    return webFailure('TAVILY_UNAUTHORIZED', 'keyInvalid', 'checkFetchKey');
  return rawFailure('WEB_FETCH_FAILED', detail, 'fetchFailed', { url, detail });
}

async function firecrawlExtract(url: string): Promise<FetchWebpageResult> {
  try {
    const page = await FirecrawlClient.scrape(url, { format: 'markdown', onlyMainContent: true });
    return {
      success: true,
      provider: 'firecrawl',
      title: page.title || url,
      text: page.content.substring(0, WEBPAGE_TEXT_LIMIT),
    };
  } catch (error) {
    console.error('[WebPage] ❌ Firecrawl 网页读取失败', { url, error: errorMessageOf(error) });
    return firecrawlFailure(error);
  }
}

/**
 * 读取指定网页内容（Tavily Extract 优先，按条件回退 Firecrawl）
 */
async function fetchWebpage(url: string): Promise<FetchWebpageResult> {
  if (!isValidUrl(url)) {
    return webFailure('WEB_URL_INVALID', 'urlInvalid', 'urlParse', {
      url,
    });
  }
  await GlobalConfig.ensureInitialized({ ensureSettings: true, ensureBooks: false });
  const apiKey = GlobalConfig.getTavilyApiKey();
  const fallbackEnabled = GlobalConfig.getFirecrawlFallbackEnabled();

  if (apiKey) {
    try {
      return await tavilyExtract(apiKey, url);
    } catch (error) {
      console.error('[WebPage] ❌ Tavily 网页获取失败', { url, error: errorMessageOf(error) });
      if (!fallbackEnabled || !isTavilyFallbackEligible(error)) {
        return tavilyExtractFailure(error, url);
      }
    }
  } else if (!fallbackEnabled) {
    return webFailure('WEB_FETCH_NOT_CONFIGURED', 'fetchMissing', 'fetchConfigure');
  }
  return firecrawlExtract(url);
}

export const webSearchTools: ToolDefinition[] = [
  {
    definition: toolDefinition('search_web', {
      type: 'object',
      properties: {
        query: stringToolParameter('search_web.parameters.properties.query'),
      },
      required: ['query'],
    }),
    handler: async (args, context: ToolContext) => {
      const { query } = args;
      const { onAction } = context;

      if (!validToolQuery(query, 'WebSearch')) {
        return toolErrorJson('WEB_QUERY_REQUIRED', 'aiWebFeedback.queryRequired');
      }

      const result = await searchWeb(query, undefined);

      // 报告操作
      if (onAction) {
        onAction({
          type: 'web_search',
          entity: 'web',
          data: {
            query,
            results: result.results || [],
          },
        });
      }

      return modelJson(result);
    },
  },
  {
    definition: toolDefinition('fetch_webpage', {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: describeTool('fetch_webpage.parameters.properties.url'),
        },
      },
      required: ['url'],
    }),
    handler: async (args, context: ToolContext) => {
      const { url } = args;
      const { onAction } = context;

      if (!url || typeof url !== 'string') {
        console.error('[WebPage] ❌ 无效的 URL', {
          url,
          urlType: typeof url,
        });
        return toolErrorJson('WEB_URL_REQUIRED', 'aiWebFeedback.urlRequired');
      }

      const result = await fetchWebpage(url);

      // 报告操作
      if (onAction) {
        const actionData: { url: string; title?: string; success: boolean } = {
          url,
          success: result.success,
        };
        if (result.title) {
          actionData.title = result.title;
        }
        onAction({
          type: 'web_fetch',
          entity: 'web',
          data: actionData,
        });
      }

      return modelJson(result);
    },
  },
];
