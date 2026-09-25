/**
 * Firecrawl 访问层错误类型。调用方按类型区分：额度耗尽需终止批次，
 * 目标站错误需携带目标状态码，限速错误可提示稍后重试。
 */

export class FirecrawlError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'FirecrawlError';
  }
}

/** 额度耗尽：402，或 keyless 按 IP 每日限额 */
export class FirecrawlQuotaError extends FirecrawlError {
  constructor(readonly keyless: boolean) {
    super(
      keyless
        ? 'Firecrawl 免费额度（按 IP 每日限额）已用尽，可在设置 → API Keys 配置 Firecrawl Key'
        : 'Firecrawl 额度已用尽，请在设置 → API Keys 中检查额度',
    );
    this.name = 'FirecrawlQuotaError';
  }
}

/** 限速重试耗尽 */
export class FirecrawlRateLimitError extends FirecrawlError {
  constructor() {
    super('Firecrawl 请求过于频繁，请稍后重试', 429);
    this.name = 'FirecrawlRateLimitError';
  }
}

/** Firecrawl 返回成功，但目标网页本身返回错误状态码 */
export class FirecrawlTargetError extends FirecrawlError {
  constructor(readonly targetStatus: number) {
    super(`目标网站返回错误: ${targetStatus}（经 Firecrawl）`);
    this.name = 'FirecrawlTargetError';
  }
}

/** Firecrawl 返回成功，但请求的内容格式为空 */
export class FirecrawlEmptyContentError extends FirecrawlError {
  constructor() {
    super('Firecrawl 返回的内容为空');
    this.name = 'FirecrawlEmptyContentError';
  }
}
