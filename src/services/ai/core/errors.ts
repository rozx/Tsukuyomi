import { translateText } from 'src/i18n/translate';
import type { AppLocale } from 'src/models/locale';
import { LocalizedError } from 'src/utils/localized-error';

/**
 * AI 返回空响应时抛出的错误
 */
export class AIEmptyResponseError extends Error {
  constructor() {
    super('AI 返回的文本为空');
    this.name = 'AIEmptyResponseError';
  }
}

/**
 * AI 输出重复字符（降级）时抛出的错误；重试判断依据类型，不依据本地化文案。
 */
export class AIDegradationError extends Error {
  constructor(uiLocale: AppLocale) {
    super(translateText(uiLocale, 'aiRun.degraded'));
    this.name = 'AIDegradationError';
  }
}

export function isAIDegradationError(error: unknown): error is AIDegradationError {
  return error instanceof Error && error.name === 'AIDegradationError';
}

/**
 * 按执行语言生成取消错误；name 固定为 AbortError，供 isCancelledError 可靠识别。
 */
export function createCancelledError(uiLocale: AppLocale): Error {
  const error = new Error(translateText(uiLocale, 'aiRun.cancelRequest'));
  error.name = 'AbortError';
  return error;
}

/**
 * 任务收尾时的错误说明。provider 层没有执行语言，已知错误类型在此按执行语言说明；
 * 其余错误保留原始信息作为诊断详情。
 */
export function describeAIError(error: unknown, uiLocale: AppLocale, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (error.name === 'AIEmptyResponseError') return translateText(uiLocale, 'aiRun.emptyText');
  if (error instanceof LocalizedError) return error.messageFor(uiLocale);
  return error.message;
}
