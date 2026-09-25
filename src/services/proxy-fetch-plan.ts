import { FIRECRAWL_MAPPING_TOKEN } from 'src/constants/proxy';

/**
 * 网页抓取尝试链的纯函数部分：决定本次抓取依次请求哪些 URL、是否直接走 Firecrawl，
 * 以及把失败归类为「瞬时 / 被拦截 / 致命」。执行逻辑见 ProxyService.executeWithAutoSwitch。
 */

const INTERNAL_PROXY_HOSTS: Record<string, string> = {
  'kakuyomu.jp': '/api/kakuyomu',
  'ncode.syosetu.com': '/api/ncode',
  'novel18.syosetu.com': '/api/novel18',
  'syosetu.org': '/api/syosetu',
  'p.sda1.dev': '/api/sda1',
};

export interface FetchPlanInput {
  url: string;
  isElectron: boolean;
  proxyEnabled: boolean;
  defaultProxyUrl: string;
  /** 该根域名已启用映射的条目（可含 firecrawl 令牌），未映射或已禁用时为空 */
  siteProxies: string[];
  firecrawlFallbackEnabled: boolean;
  skipProxy?: boolean;
  skipInternalProxy?: boolean;
  skipExternalProxy?: boolean;
}

export interface FetchPlan {
  /** 映射首位为 firecrawl 且回退开启：跳过首要尝试直接走 Firecrawl（失败不再尝试 CORS） */
  firecrawlFirst: boolean;
  /** 首要尝试依次请求的 URL（CORS 包装 URL、内部 /api/ 路径或原始 URL） */
  attempts: string[];
  /** 首要尝试被拦截时是否回退 Firecrawl */
  firecrawlFallback: boolean;
}

function buildInternalProxyPath(originalUrl: string): string | null {
  try {
    const urlObj = new URL(originalUrl);
    const prefix = INTERNAL_PROXY_HOSTS[urlObj.hostname];
    if (!prefix) return null;
    return `${prefix}${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
  } catch {
    return null;
  }
}

function wrapWithProxy(template: string, originalUrl: string): string {
  return template.replace('{url}', encodeURIComponent(originalUrl));
}

/** 不经外部 CORS 代理时的请求 URL：Web 可用内部 /api/ 路径，否则直连 */
function directAttempt(input: FetchPlanInput): string {
  if (input.skipInternalProxy || input.isElectron) return input.url;
  return buildInternalProxyPath(input.url) ?? input.url;
}

function corsAttempts(input: FetchPlanInput, corsEntries: string[]): string[] {
  const useCors =
    !input.isElectron && input.proxyEnabled && !input.skipExternalProxy && !input.skipProxy;
  if (!useCors) return [];
  const templates = corsEntries.length > 0 ? corsEntries : [input.defaultProxyUrl];
  return templates
    .filter((template) => template && template.trim())
    .map((template) => wrapWithProxy(template, input.url));
}

export function resolveFetchPlan(input: FetchPlanInput): FetchPlan {
  if (input.url.startsWith('/api/') || input.skipProxy) {
    return { firecrawlFirst: false, attempts: [input.url], firecrawlFallback: false };
  }
  const firecrawlFallback = input.firecrawlFallbackEnabled;
  if (firecrawlFallback && input.siteProxies[0] === FIRECRAWL_MAPPING_TOKEN) {
    return { firecrawlFirst: true, attempts: [], firecrawlFallback: false };
  }
  const corsEntries = input.siteProxies.filter((entry) => entry !== FIRECRAWL_MAPPING_TOKEN);
  const cors = corsAttempts(input, corsEntries);
  return {
    firecrawlFirst: false,
    attempts: cors.length > 0 ? cors : [directAttempt(input)],
    firecrawlFallback,
  };
}

/** 携带 HTTP 状态码的抓取错误（Electron 抓取与非 axios 路径使用） */
export class HttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`目标网站返回错误: ${status}`);
    this.name = 'HttpStatusError';
  }
}

/** 响应成功但内容是反爬质询页 */
export class BlockedResponseError extends Error {
  constructor(reason: string) {
    super(`目标网站返回了反爬质询页（${reason}）`);
    this.name = 'BlockedResponseError';
  }
}

export type FetchFailureKind = 'transient' | 'blocked' | 'fatal' | 'abort';

const TRANSIENT_MESSAGE_KEYWORDS: readonly string[] = [
  'network',
  'failed to fetch',
  'err_failed',
  'net::',
  'timeout',
  'timed out',
  'econnrefused',
  'econnreset',
  'enotfound',
  'socket hang up',
  'cors',
];

const TRANSIENT_AXIOS_CODES: readonly string[] = [
  'ERR_NETWORK',
  'ECONNABORTED',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
];

function statusOf(error: unknown): number | undefined {
  if (error instanceof HttpStatusError) return error.status;
  if (error && typeof error === 'object' && 'isAxiosError' in error) {
    return (error as { response?: { status?: number } }).response?.status;
  }
  return undefined;
}

function classifyStatus(status: number): FetchFailureKind {
  if (status === 403) return 'blocked';
  if (status === 408 || status === 429 || status >= 500) return 'transient';
  return 'fatal';
}

export function classifyFetchFailure(error: unknown): FetchFailureKind {
  if (error instanceof DOMException && error.name === 'AbortError') return 'abort';
  if (error instanceof BlockedResponseError) return 'blocked';
  const status = statusOf(error);
  if (status !== undefined) return classifyStatus(status);
  if (error && typeof error === 'object' && 'isAxiosError' in error) {
    const code = (error as { code?: string }).code;
    if (code === 'ERR_CANCELED') return 'abort';
    if (code && TRANSIENT_AXIOS_CODES.includes(code)) return 'transient';
  }
  if (!(error instanceof Error)) return 'fatal';
  const message = error.message.toLowerCase();
  return TRANSIENT_MESSAGE_KEYWORDS.some((keyword) => message.includes(keyword))
    ? 'transient'
    : 'fatal';
}
