import axios from 'axios';
import { GlobalConfig } from 'src/services/global-config-cache';
import {
  FirecrawlEmptyContentError,
  FirecrawlError,
  FirecrawlQuotaError,
  FirecrawlRateLimitError,
  FirecrawlTargetError,
} from './firecrawl-errors';
import { RequestLimiter } from './firecrawl-limiter';

/**
 * Firecrawl API 客户端（网页抓取回退与 AI 网络工具共用）。
 *
 * - 有 Key 时只用 Key；无 Key 时走 keyless（按 IP 每日限额），绝不在 Key 失败后降级为 keyless
 * - 所有请求经同一个限流器；429 按 Retry-After 有限重试
 * - 额度耗尽后进入锁存：后续请求不发网络请求直接失败（见 design.md D2/D3）
 */

const API_BASE = 'https://api.firecrawl.dev/v2';
/** Firecrawl 服务端单次抓取超时 */
const SERVER_TIMEOUT_MS = 60_000;
/** 客户端 HTTP 超时须长于服务端超时；排队时间不计入（出队后才发请求） */
const HTTP_TIMEOUT_MS = 75_000;
const MAX_429_RETRIES = 3;
/** 429 未给出等待时间时的暂停：3 次重试合计覆盖一分钟的限速窗口 */
const DEFAULT_RETRY_AFTER_MS = 20_000;
const MAX_RETRY_AFTER_MS = 60_000;
/** keyless 429 的等待时间超过该值视为日限额 */
const KEYLESS_DAILY_RETRY_AFTER_MS = 120_000;
/** 文案判断只认明确的「每日」字样：限速文案本身也含 keyless / free，不能作为依据 */
const KEYLESS_DAILY_PATTERN = /daily|per day/i;
/** 没有给出等待时间时的额度锁存时长 */
const QUOTA_LATCH_MS = 60 * 60_000;

/**
 * 只限并发（免费档并发浏览器为 2）；不设固定的每分钟上限，以免付费档（每分钟 100–5000 次）
 * 被免费档的 10 次拖慢。免费档 / keyless 超速时由 Firecrawl 返回 429，整个队列按其等待时间暂停。
 */
const LIMITER_OPTIONS = {
  concurrency: 2,
  windowMs: 60_000,
  maxPerWindow: Number.POSITIVE_INFINITY,
};

type ScrapeFormat = 'rawHtml' | 'markdown';

interface ScrapeOptions {
  format: ScrapeFormat;
  onlyMainContent?: boolean;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface FirecrawlScrapeResult {
  content: string;
  statusCode: number;
  url?: string;
  title?: string;
}

export interface FirecrawlSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export type FirecrawlCreditUsage =
  | { kind: 'ok'; remainingCredits: number; planCredits: number; billingPeriodEnd?: string }
  | { kind: 'invalid-key' };

interface HttpReply {
  status: number;
  data: unknown;
  headers?: Record<string, unknown>;
}

let limiter = new RequestLimiter(LIMITER_OPTIONS);
let quotaLatch: { key: string | undefined; until: number } | null = null;

export function __resetFirecrawlClientForTesting(): void {
  limiter = new RequestLimiter(LIMITER_OPTIONS);
  quotaLatch = null;
}

function currentKey(): string | undefined {
  const key = GlobalConfig.getFirecrawlApiKey()?.trim();
  return key ? key : undefined;
}

function authHeaders(key: string | undefined): Record<string, string> {
  return key ? { Authorization: `Bearer ${key}` } : {};
}

function assertNotLatched(key: string | undefined): void {
  if (!quotaLatch) return;
  const expired = Date.now() >= quotaLatch.until;
  if (expired || quotaLatch.key !== key) {
    quotaLatch = null;
    return;
  }
  throw new FirecrawlQuotaError(key === undefined);
}

/** 锁存额度耗尽状态：持续到 Firecrawl 给出的等待时间，未给出时 60 分钟 */
function setQuotaLatch(key: string | undefined, reply: HttpReply): void {
  quotaLatch = { key, until: Date.now() + (retryAfterMs(reply) ?? QUOTA_LATCH_MS) };
}

function errorText(data: unknown): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const error = (data as { error?: unknown }).error;
    if (typeof error === 'string') return error;
  }
  return '';
}

function secondsToMs(raw: unknown): number | undefined {
  const seconds = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN;
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

/** 等待时间：优先 Retry-After 头，其次响应体 retry_after_seconds（keyless 限额用后者） */
function retryAfterMs(reply: HttpReply): number | undefined {
  const body = reply.data as { retry_after_seconds?: unknown } | undefined;
  return secondsToMs(reply.headers?.['retry-after']) ?? secondsToMs(body?.retry_after_seconds);
}

/** keyless 每日额度用尽：响应体 reason 为 credits、文案明确写每日，或等待时间很长 */
function isKeylessDailyLimit(reply: HttpReply): boolean {
  const body = reply.data as { reason?: unknown } | undefined;
  const retryAfter = retryAfterMs(reply);
  return (
    body?.reason === 'credits' ||
    KEYLESS_DAILY_PATTERN.test(errorText(reply.data)) ||
    (retryAfter !== undefined && retryAfter > KEYLESS_DAILY_RETRY_AFTER_MS)
  );
}

type ReplyOutcome = 'ok' | 'quota' | 'retry' | 'rate-limit' | 'error';

/**
 * 对响应应用策略（锁存额度 / 暂停队列）并给出结果。必须在释放限流名额之前调用，
 * 否则排队中的下一个请求会在暂停或锁存生效前抢先发出。
 */
function applyReplyPolicy(reply: HttpReply, key: string | undefined, attempt: number): ReplyOutcome {
  if (reply.status >= 200 && reply.status < 300) return 'ok';
  // 浏览器控制台只显示状态码；记录 Firecrawl 返回的原因，便于区分限速 / 并发 / 日限额
  console.warn(`[Firecrawl] 返回 ${reply.status}`, {
    mode: key === undefined ? 'keyless' : 'api-key',
    attempt: attempt + 1,
    error: errorText(reply.data) || undefined,
    reason: (reply.data as { reason?: unknown } | undefined)?.reason,
    retryAfterMs: retryAfterMs(reply),
  });
  if (reply.status === 402 || (reply.status === 429 && key === undefined && isKeylessDailyLimit(reply))) {
    setQuotaLatch(key, reply);
    return 'quota';
  }
  if (reply.status !== 429) return 'error';
  // 重试耗尽：只有明确的日额度信号才算额度耗尽（上面已处理），普通短期 429 仍是限速
  if (attempt >= MAX_429_RETRIES) return 'rate-limit';
  // 暂停整个队列，而不是各请求各自等待后同时重试（避免连锁 429）
  limiter.pauseFor(Math.min(retryAfterMs(reply) ?? DEFAULT_RETRY_AFTER_MS, MAX_RETRY_AFTER_MS));
  return 'retry';
}

/**
 * 经限流器发送 POST，处理 402 / 429 / 其它非 2xx，返回 2xx 响应体。
 */
async function postWithPolicy(
  path: string,
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const key = currentKey();
  for (let attempt = 0; ; attempt++) {
    assertNotLatched(key);
    const release = await limiter.acquire(signal);
    let reply: HttpReply;
    let outcome: ReplyOutcome;
    try {
      // 排队期间其它请求可能已触发额度锁存：获准后再检查一次
      assertNotLatched(key);
      reply = (await axios.post(`${API_BASE}${path}`, body, {
        headers: { 'Content-Type': 'application/json', ...authHeaders(key) },
        timeout: HTTP_TIMEOUT_MS,
        validateStatus: () => true,
        ...(signal ? { signal } : {}),
      })) as HttpReply;
      outcome = applyReplyPolicy(reply, key, attempt);
    } finally {
      release();
    }

    if (outcome === 'ok') return reply.data;
    if (outcome === 'retry') continue;
    if (outcome === 'quota') throw new FirecrawlQuotaError(key === undefined);
    if (outcome === 'rate-limit') throw new FirecrawlRateLimitError();
    const detail = errorText(reply.data);
    throw new FirecrawlError(
      `Firecrawl 请求失败: ${reply.status}${detail ? ` ${detail}` : ''}`,
      reply.status,
    );
  }
}

interface ScrapePayload {
  data?: {
    rawHtml?: unknown;
    markdown?: unknown;
    metadata?: { statusCode?: unknown; url?: unknown; sourceURL?: unknown; title?: unknown };
  };
}

async function scrape(url: string, options: ScrapeOptions): Promise<FirecrawlScrapeResult> {
  const { format, onlyMainContent = false, headers, signal } = options;
  const payload = (await postWithPolicy(
    '/scrape',
    {
      url,
      formats: [format],
      maxAge: 0,
      onlyMainContent,
      timeout: SERVER_TIMEOUT_MS,
      ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
    },
    signal,
  )) as ScrapePayload;

  const metadata = payload.data?.metadata ?? {};
  const statusCode = typeof metadata.statusCode === 'number' ? metadata.statusCode : 200;
  if (statusCode >= 400) throw new FirecrawlTargetError(statusCode);
  const content = payload.data?.[format];
  if (typeof content !== 'string' || content.length === 0) throw new FirecrawlEmptyContentError();
  const finalUrl = typeof metadata.url === 'string' ? metadata.url : undefined;
  const title = typeof metadata.title === 'string' ? metadata.title : undefined;
  return {
    content,
    statusCode,
    ...(finalUrl ? { url: finalUrl } : {}),
    ...(title ? { title } : {}),
  };
}

async function search(
  query: string,
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<FirecrawlSearchResult[]> {
  const { limit = 5, signal } = options;
  const payload = (await postWithPolicy(
    '/search',
    { query, limit, timeout: SERVER_TIMEOUT_MS },
    signal,
  )) as { data?: { web?: Array<{ title?: unknown; url?: unknown; description?: unknown }> } };
  return (payload.data?.web ?? []).flatMap((item) =>
    typeof item.url === 'string'
      ? [
          {
            title: typeof item.title === 'string' ? item.title : item.url,
            url: item.url,
            snippet: typeof item.description === 'string' ? item.description : '',
          },
        ]
      : [],
  );
}

/**
 * 查询指定 Key 的额度（不经限流器，不消耗额度）。当前 Key 仍有额度时解除锁存。
 */
async function getCreditUsage(key: string): Promise<FirecrawlCreditUsage> {
  const reply = (await axios.get(`${API_BASE}/team/credit-usage`, {
    headers: authHeaders(key),
    timeout: 30_000,
    validateStatus: () => true,
  })) as HttpReply;
  if (reply.status === 401) return { kind: 'invalid-key' };
  if (reply.status < 200 || reply.status >= 300) {
    throw new FirecrawlError(`额度查询失败: ${reply.status}`, reply.status);
  }
  const data = (reply.data as { data?: Record<string, unknown> }).data ?? {};
  const remainingCredits = Number(data.remainingCredits ?? 0);
  const planCredits = Number(data.planCredits ?? 0);
  if (remainingCredits > 0 && quotaLatch?.key === key) quotaLatch = null;
  return {
    kind: 'ok',
    remainingCredits,
    planCredits,
    ...(typeof data.billingPeriodEnd === 'string'
      ? { billingPeriodEnd: data.billingPeriodEnd }
      : {}),
  };
}

/** 队列因 429 暂停的剩余时间（毫秒），供界面显示「等待 Firecrawl 限速」 */
function pauseRemainingMs(): number {
  return limiter.pauseRemainingMs();
}

export const FirecrawlClient = { scrape, search, getCreditUsage, pauseRemainingMs };
