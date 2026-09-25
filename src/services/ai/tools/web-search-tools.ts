import axios from 'axios';
import type { ToolDefinition, ToolContext } from './types';
import { GlobalConfig } from 'src/services/global-config-cache';
import { FirecrawlClient } from 'src/services/firecrawl/firecrawl-client';
import {
  FirecrawlQuotaError,
  FirecrawlRateLimitError,
  FirecrawlTargetError,
} from 'src/services/firecrawl/firecrawl-errors';

/**
 * 网络搜索 / 网页读取：配置 Tavily Key 时优先 Tavily，Tavily 出错（额度 / 限速 / 5xx / 网络 / Key 无效）
 * 或未配置时，若开启 Firecrawl 回退则改用 Firecrawl。结果形状与提供方无关，并标注 provider。
 */

const TAVILY_API_URL = 'https://api.tavily.com';
const WEBPAGE_TEXT_LIMIT = 50000;
const SEARCH_RESULT_LIMIT = 5;

type Provider = 'tavily' | 'firecrawl';

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
  message?: string;
}

interface FetchWebpageResult {
  success: boolean;
  provider?: Provider;
  title?: string;
  content?: string;
  text?: string;
  error?: string;
  message?: string;
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
function firecrawlFailure(error: unknown): { success: false; error: string; message: string } {
  if (error instanceof FirecrawlQuotaError) {
    return {
      success: false,
      error: 'Firecrawl 额度已用尽',
      message: error.keyless
        ? 'Firecrawl 免费额度（按 IP 每日限额）已用尽。可在设置 → API Keys 中配置 Firecrawl 或 Tavily API Key 后重试。'
        : 'Firecrawl 额度已用尽，请在设置 → API Keys 中检查额度。',
    };
  }
  if (error instanceof FirecrawlRateLimitError) {
    return {
      success: false,
      error: 'Firecrawl 请求过于频繁',
      message: 'Firecrawl 请求过于频繁，请稍后再试。',
    };
  }
  if (error instanceof FirecrawlTargetError) {
    return {
      success: false,
      error: `目标网页返回错误 ${error.targetStatus}`,
      message: `目标网页返回错误 ${error.targetStatus}，无法读取该网页。`,
    };
  }
  const message = errorMessageOf(error);
  return { success: false, error: message, message: `Firecrawl 请求失败: ${message}` };
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
  const errorMessage = errorMessageOf(error);
  if (isUnauthorizedError(error, errorMessage)) {
    return {
      success: false,
      error: 'Tavily API Key 无效',
      message:
        '请检查设置的 Tavily API Key 是否正确。您可以在 https://tavily.com/ 获取有效的 API Key。',
    };
  }
  return {
    success: false,
    error: errorMessage,
    message: `网络搜索暂时不可用: ${errorMessage}。建议使用 AI 模型的内置知识库来回答关于"${query}"的问题。`,
  };
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
    return {
      success: false,
      error: '未配置网络搜索',
      message:
        '请在设置 → API Keys 中配置 Tavily API Key，或启用 Firecrawl 回退以使用网络搜索功能。',
    };
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
    return {
      success: false,
      error: '无法提取网页内容',
      message: `Tavily 无法提取网页 ${url} 的内容。该网页可能无法访问或内容为空。`,
    };
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
  const errorMessage = errorMessageOf(error);
  if (isUnauthorizedError(error, errorMessage)) {
    return {
      success: false,
      error: 'Tavily API Key 无效',
      message: '请检查设置的 Tavily API Key 是否正确。',
    };
  }
  return {
    success: false,
    error: errorMessage,
    message: `无法访问网页 ${url}: ${errorMessage}。`,
  };
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
    return {
      success: false,
      error: '无效的 URL 格式',
      message: `无法解析 URL: ${url}`,
    };
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
    return {
      success: false,
      error: '未配置网页读取',
      message:
        '请在设置 → API Keys 中配置 Tavily API Key，或启用 Firecrawl 回退以使用网页读取功能。',
    };
  }
  return firecrawlExtract(url);
}

export const webSearchTools: ToolDefinition[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'search_web',
        description:
          '搜索网络以获取最新信息或回答一般性问题。当用户询问需要最新信息、实时数据或超出 AI 模型训练数据范围的问题时，可以使用此工具。[警告] 重要：当工具返回 results 数组时，必须仔细阅读每个结果的 title 和 snippet，从中提取关键信息来回答用户的问题。如果返回了 answer 字段，直接使用该答案。只有在搜索失败（success: false）时才使用 AI 的内置知识库。',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索查询关键词或问题',
            },
          },
          required: ['query'],
        },
      },
    },
    handler: async (args, context: ToolContext) => {
      const { query } = args;
      const { onAction } = context;

      if (!query || typeof query !== 'string') {
        console.error('[WebSearch] ❌ 无效的搜索查询', {
          query,
          queryType: typeof query,
        });
        return JSON.stringify({
          success: false,
          error: '搜索查询不能为空',
        });
      }

      const result = await searchWeb(query);

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

      return JSON.stringify(result);
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'fetch_webpage',
        description:
          '直接访问指定的网页并提取其内容。当用户提供了具体的网页 URL 或需要查看特定网页的详细内容时使用此工具。工具会提取网页的标题和主要内容文本，供 AI 分析。[警告] 重要：使用此工具时，必须仔细阅读返回的 text 内容，从中提取关键信息来回答用户的问题。如果返回了 error，说明无法访问该网页。',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: '要访问的网页 URL（必须是完整的 URL，包含 http:// 或 https://）',
            },
          },
          required: ['url'],
        },
      },
    },
    handler: async (args, context: ToolContext) => {
      const { url } = args;
      const { onAction } = context;

      if (!url || typeof url !== 'string') {
        console.error('[WebPage] ❌ 无效的 URL', {
          url,
          urlType: typeof url,
        });
        return JSON.stringify({
          success: false,
          error: 'URL 不能为空',
        });
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

      return JSON.stringify(result);
    },
  },
];
