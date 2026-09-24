import { RetryError } from 'ai';

/** 部分兼容端点的错误 JSON 不满足 SDK 厂商 schema，仍保留厂商原文。 */
export function providerError(error: unknown): Error {
  if (RetryError.isInstance(error)) return providerError(error.lastError);
  if (!(error instanceof Error)) return new Error(String(error));
  if ('responseBody' in error && typeof error.responseBody === 'string') {
    let detail = error.responseBody;
    try {
      const parsed = JSON.parse(detail) as { error?: { message?: unknown }; message?: unknown };
      const message = parsed.error?.message ?? parsed.message;
      if (typeof message === 'string') detail = message;
    } catch {
      /* 非 JSON 的错误响应也保留原文。 */
    }
    if (detail && !error.message.includes(detail))
      error.message = [error.message, detail].filter(Boolean).join(': ');
  }
  return error;
}
