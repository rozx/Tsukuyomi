/**
 * 将未知值安全转换为可展示的文本，避免对象退化成 `[object Object]`。
 */
function stringifyUnknown(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean' ||
    typeof value === 'symbol'
  ) {
    return String(value);
  }
  if (value === null || value === undefined) return fallback;

  try {
    return JSON.stringify(value) || fallback;
  } catch {
    return fallback;
  }
}

/**
 * 从任意错误值中提取稳定、可读的消息。
 */
export function getErrorMessage(error: unknown, fallback = '未知错误'): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return stringifyUnknown(error.message, fallback);
  }
  return stringifyUnknown(error, fallback);
}

/**
 * 将任意错误值规范化为 Error 实例。
 */
export function toError(error: unknown, fallback = '未知错误'): Error {
  return error instanceof Error ? error : new Error(getErrorMessage(error, fallback));
}
