import type { MessageKey } from 'src/i18n/types';
import { LocalizedError } from 'src/utils/localized-error';

/**
 * Firecrawl 访问层错误类型。调用方按类型区分：额度耗尽需终止批次，
 * 目标站错误需携带目标状态码，限速错误可提示稍后重试。
 * 均为带错误码的自有错误：默认说明为简中，展示处按界面语言重新渲染。
 */

export class FirecrawlError extends LocalizedError {
  constructor(
    code: string,
    messageKey: MessageKey,
    values: Record<string, string | number> = {},
    readonly status?: number,
    readonly diagnostic?: string,
  ) {
    super(code, messageKey, values);
    this.name = 'FirecrawlError';
  }

  /** Firecrawl 接口本身返回失败状态；第三方诊断原文作为参数保留 */
  static http(status: number, diagnostic: string): FirecrawlError {
    return diagnostic
      ? new FirecrawlError(
          'FIRECRAWL_HTTP_FAILED',
          'bookUi.fetch.firecrawlFailedDetail',
          { status, detail: diagnostic },
          status,
          diagnostic,
        )
      : new FirecrawlError(
          'FIRECRAWL_HTTP_FAILED',
          'bookUi.fetch.firecrawlFailed',
          { status },
          status,
          diagnostic,
        );
  }
}

/** 额度耗尽：402，或 keyless 按 IP 每日限额 */
export class FirecrawlQuotaError extends FirecrawlError {
  constructor(readonly keyless: boolean) {
    super(
      'FIRECRAWL_QUOTA',
      keyless ? 'bookUi.fetch.firecrawlQuotaKeyless' : 'bookUi.fetch.firecrawlQuota',
    );
    this.name = 'FirecrawlQuotaError';
  }
}

/** 限速重试耗尽 */
export class FirecrawlRateLimitError extends FirecrawlError {
  constructor() {
    super('FIRECRAWL_RATE_LIMITED', 'bookUi.fetch.firecrawlRateLimited', {}, 429);
    this.name = 'FirecrawlRateLimitError';
  }
}

/** Firecrawl 返回成功，但目标网页本身返回错误状态码 */
export class FirecrawlTargetError extends FirecrawlError {
  constructor(readonly targetStatus: number) {
    super('FIRECRAWL_TARGET_FAILED', 'bookUi.fetch.firecrawlTarget', { status: targetStatus });
    this.name = 'FirecrawlTargetError';
  }
}

/** Firecrawl 返回成功，但请求的内容格式为空 */
export class FirecrawlEmptyContentError extends FirecrawlError {
  constructor() {
    super('FIRECRAWL_EMPTY_CONTENT', 'bookUi.fetch.firecrawlEmpty');
    this.name = 'FirecrawlEmptyContentError';
  }
}
