/**
 * Firecrawl API 响应样本。
 *
 * 错误体形状来自官方错误目录（https://docs.firecrawl.dev/api-reference/errors，2026-09 查阅）：
 * 非 2xx 统一为 `{ success: false, error: string, details?: unknown }`。
 * keyless 日额度用尽的真实响应为 429 + 响应体 `reason: "credits"` 与 `retry_after_seconds`，
 * 文案本身含 keyless / free 字样，不能据此判断（短期限速的文案也可能相同）。
 */

export const SCRAPE_OK_RAW_HTML = {
  success: true,
  data: {
    rawHtml:
      '<html><head><title>第6話</title></head><body><div id="honbun"><p id="1">本文</p></div></body></html>',
    metadata: {
      title: '第6話',
      sourceURL: 'https://syosetu.org/novel/375522/6.html',
      url: 'https://syosetu.org/novel/375522/6.html',
      statusCode: 200,
      contentType: 'text/html',
    },
  },
};

export const SCRAPE_OK_MARKDOWN = {
  success: true,
  data: {
    markdown: '# Example Domain\n\nThis domain is for use in documentation examples.',
    metadata: {
      title: 'Example Domain',
      sourceURL: 'https://example.com',
      url: 'https://example.com/',
      statusCode: 200,
    },
  },
};

export const SCRAPE_TARGET_404 = {
  success: true,
  data: {
    rawHtml: '<html><body>Not Found</body></html>',
    metadata: { sourceURL: 'https://syosetu.org/novel/0/1.html', statusCode: 404 },
  },
};

export const SCRAPE_EMPTY = {
  success: true,
  data: {
    rawHtml: '',
    metadata: { sourceURL: 'https://syosetu.org/novel/375522/6.html', statusCode: 200 },
  },
};

export const ERROR_402 = { success: false, error: 'Payment Required: Insufficient credits' };

export const ERROR_429_RATE = { success: false, error: 'Rate limit exceeded' };

/** 真实响应（2026-09-24 捕获）：keyless 每日额度用尽，等待时间在响应体而非 Retry-After 头 */
export const ERROR_429_KEYLESS_DAILY = {
  success: false,
  error:
    "You've hit Firecrawl's keyless free tier rate limit. To continue now, create a free API key at https://www.firecrawl.dev/signin.\n\nThen authenticate with:\nAuthorization: Bearer YOUR_API_KEY",
  reason: 'credits',
  retry_after_seconds: 81741,
};

/** keyless 短期限速（文案同样含 keyless / free，但 reason 不是 credits 且等待很短） */
export const ERROR_429_KEYLESS_SHORT = {
  success: false,
  error: "You've hit Firecrawl's keyless free tier rate limit.",
  reason: 'rate',
  retry_after_seconds: 30,
};

export const ERROR_401 = { success: false, error: 'Unauthorized: Invalid token' };

export const CREDIT_USAGE_OK = {
  success: true,
  data: {
    remainingCredits: 480,
    planCredits: 500,
    billingPeriodStart: '2026-09-01T00:00:00Z',
    billingPeriodEnd: '2026-10-01T00:00:00Z',
  },
};

export const SEARCH_OK = {
  success: true,
  data: {
    web: [
      {
        url: 'https://ja.wikipedia.org/wiki/理不尽な孫の手',
        title: '理不尽な孫の手 - Wikipedia',
        description: '日本のライトノベル作家。代表作は『無職転生』。',
        position: 1,
      },
    ],
  },
};
