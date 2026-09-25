import axios from 'axios';
import { ProxyService } from 'src/services/proxy-service';
import { isElectron } from 'src/utils/platform';
import { runAbortable } from 'src/utils/abortable-operation';
import { BlockedResponseError, HttpStatusError } from 'src/services/proxy-fetch-plan';
import { FirecrawlClient } from 'src/services/firecrawl/firecrawl-client';
import type { ScraperPageSnapshot } from '../types';
import { isChallengePage } from './challenge-detection';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const ACCEPT_HTML = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8';
const ACCEPT_LANGUAGE = 'ja,en-US;q=0.9,en;q=0.8';
const FETCH_TIMEOUT_MS = 60000;

/** 通过 Electron 的 net 模块获取页面 */
async function fetchViaElectron(
  proxiedUrl: string,
  originalUrl: string,
  extraHeaders: Record<string, string> = {},
): Promise<ScraperPageSnapshot> {
  if (!window.electronAPI?.fetch) {
    throw new Error('Electron API 未正确加载，请检查 preload 脚本');
  }
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: ACCEPT_HTML,
    'Accept-Language': ACCEPT_LANGUAGE,
    'Accept-Encoding': 'gzip, deflate, br',
    Referer: new URL(originalUrl).origin,
    ...extraHeaders,
  };
  const response = await window.electronAPI.fetch(proxiedUrl, {
    method: 'GET',
    headers,
    timeout: FETCH_TIMEOUT_MS,
  });
  if (response.status >= 400) throw new HttpStatusError(response.status);
  if (response.data && isChallengePage(response.data)) {
    throw new BlockedResponseError('Electron 直连');
  }
  if (response.data)
    return {
      html: response.data,
      requestUrl: originalUrl,
      transportUrl: proxiedUrl,
      status: response.status,
      contentType: response.headers['content-type'] ?? 'text/html',
    };
  throw new Error('返回的内容为空');
}

/** axios 头部 content-type 的多种形态统一转为字符串 */
function normalizeContentType(
  raw: string | number | boolean | string[] | undefined | null,
): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.join(', ');
  if (typeof raw === 'number' || raw === true) return String(raw);
  return '';
}

/** 响应是否疑似 JSON 包装的代理响应 */
function looksLikeJsonProxyResponse(contentType: string, dataStr: string): boolean {
  return contentType.includes('application/json') || dataStr.trim().startsWith('{');
}

/** 构建 axios 请求头；浏览器经外部代理时用 x-cors-headers 转发站点头 */
function buildAxiosHeaders(
  proxiedUrl: string,
  originalUrl: string,
  isBrowser: boolean,
  extraHeaders: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: ACCEPT_HTML,
    'Accept-Language': ACCEPT_LANGUAGE,
  };
  if (isBrowser) {
    const usesExternalProxy = proxiedUrl !== originalUrl && !proxiedUrl.startsWith('/api/');
    if (usesExternalProxy && Object.keys(extraHeaders).length > 0) {
      headers['x-cors-headers'] = JSON.stringify(extraHeaders);
    }
    return headers;
  }
  return {
    ...headers,
    'User-Agent': USER_AGENT,
    'Accept-Encoding': 'gzip, deflate, br',
    Referer: originalUrl.startsWith('https://')
      ? new URL(originalUrl).origin
      : 'https://kakuyomu.jp/',
    ...extraHeaders,
  };
}

/** 通过 axios 获取页面；浏览器与 Node 环境分别构建可发送的请求头 */
async function fetchViaAxios(
  proxiedUrl: string,
  originalUrl: string,
  isBrowser: boolean,
  extraHeaders: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<ScraperPageSnapshot> {
  const headers = buildAxiosHeaders(proxiedUrl, originalUrl, isBrowser, extraHeaders);
  const response = await axios.get(proxiedUrl, {
    timeout: FETCH_TIMEOUT_MS, // 与代理服务器超时一致
    headers,
    ...(signal ? { signal } : {}),
    validateStatus: (status) => status >= 200 && status < 400,
  });
  if (response.status >= 400) {
    throw new Error(`目标网站返回错误: ${response.status}`);
  }
  if (!response.data) throw new Error('返回的内容为空');

  // 某些代理服务返回 JSON 包装，需要拆出实际 HTML
  const contentType = normalizeContentType(
    response.headers['content-type'] as string | number | boolean | string[] | undefined | null,
  );
  const dataStr = typeof response.data === 'string' ? response.data : String(response.data);
  const html = looksLikeJsonProxyResponse(contentType, dataStr)
    ? (extractHtmlFromJsonProxyResponse(response.data, dataStr) ?? response.data)
    : response.data;
  if (typeof html !== 'string') throw new Error('页面响应不是可解析的文本');
  if (isChallengePage(html)) throw new BlockedResponseError(proxiedUrl);
  const responseUrl =
    proxiedUrl === originalUrl && typeof response.request?.responseURL === 'string'
      ? (response.request.responseURL as string)
      : undefined;
  return {
    html,
    requestUrl: originalUrl,
    transportUrl: proxiedUrl,
    status: response.status,
    contentType,
    ...(responseUrl ? { responseUrl } : {}),
  };
}

/** 经 Firecrawl 抓取页面原始 HTML（回退或 firecrawl 映射），站点附加请求头经 Firecrawl 转发 */
async function fetchViaFirecrawl(
  originalUrl: string,
  extraHeaders: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<ScraperPageSnapshot> {
  const result = await FirecrawlClient.scrape(originalUrl, {
    format: 'rawHtml',
    ...(Object.keys(extraHeaders).length > 0 ? { headers: extraHeaders } : {}),
    ...(signal ? { signal } : {}),
  });
  return {
    html: result.content,
    requestUrl: originalUrl,
    transportUrl: `firecrawl:${originalUrl}`,
    status: result.statusCode,
    contentType: 'text/html',
    ...(result.url && result.url !== originalUrl ? { responseUrl: result.url } : {}),
  };
}

/**
 * 从 JSON 包装的代理响应中解析出 HTML。支持 contents/data 字段；若实际是 HTML
 * 被误识别为 JSON，也回退返回。无法识别时返回 null 以继续原样返回 data。
 */
function extractHtmlFromJsonProxyResponse(rawData: unknown, dataStr: string): string | null {
  try {
    const jsonData = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
    if (jsonData && typeof jsonData === 'object') {
      const obj = jsonData as { contents?: unknown; data?: unknown };
      // AllOrigins：内容在 contents
      if (typeof obj.contents === 'string') return obj.contents;
      // 其他代理：内容在 data
      if (typeof obj.data === 'string') return obj.data;
      // cors.lol 可能直接返回 HTML，却把 Content-Type 标为 JSON
      if (dataStr.includes('<html') || dataStr.includes('<!DOCTYPE')) return dataStr;
      console.error('[BaseScraper] JSON 响应中未找到 HTML 内容', {
        keys: Object.keys(obj),
        jsonPreview: JSON.stringify(obj).substring(0, 500),
      });
    }
  } catch {
    // 不是有效的 JSON，可能是 HTML 被误判为 JSON → 回到调用方返回原始 data
  }
  return null;
}

/** 将 axios 错误归一化为用户友好的 Error */
function normalizeFetchError(error: unknown): Error {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      return new Error(
        `获取页面失败: ${error.response.status} ${error.response.statusText || error.message}`,
      );
    }
    if (error.request) return new Error('网络连接失败，请检查网络设置');
    return new Error(`请求配置错误: ${error.message}`);
  }
  return error instanceof Error ? error : new Error('获取页面时发生未知错误');
}

/** 共用现有代理链路，只读取指定页面，不发现或跟随后续页面。 */
export async function fetchScraperPage(
  url: string,
  options: {
    signal?: AbortSignal;
    extraHeaders?: Record<string, string>;
    skipExternalProxy?: boolean;
  } = {},
): Promise<ScraperPageSnapshot> {
  const electron = isElectron();
  const browser = typeof window !== 'undefined' && !electron;
  try {
    return await runAbortable(options.signal, () =>
      ProxyService.executeWithAutoSwitch(
        url,
        (proxiedUrl) =>
          runAbortable(options.signal, () =>
            electron
              ? fetchViaElectron(proxiedUrl, url, options.extraHeaders)
              : fetchViaAxios(proxiedUrl, url, browser, options.extraHeaders, options.signal),
          ),
        {
          skipExternalProxy: options.skipExternalProxy ?? false,
          skipInternalProxy: electron,
          firecrawl: () => fetchViaFirecrawl(url, options.extraHeaders, options.signal),
          ...(options.signal ? { signal: options.signal } : {}),
        },
      ),
    );
  } catch (error) {
    if (options.signal?.aborted)
      throw options.signal.reason ?? new DOMException('操作已取消', 'AbortError');
    throw normalizeFetchError(error);
  }
}
