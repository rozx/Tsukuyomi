/**
 * 格式化数字为易读格式
 * @param count 数字
 * @returns 格式化后的字符串（如：1.5k, 10.2万）
 */
export function formatNumber(count: number | null): string {
  if (count === null) return '-';
  if (count === 0) return '0';
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 10000).toFixed(1)}万`;
}

/**
 * 格式化字符数显示
 * @param count 字符数
 * @returns 格式化后的字符串（如：3.2k 字, 6.7万 字）
 */
export function formatCharCount(count: number | null): string {
  const formatted = formatNumber(count);
  return formatted === '-' ? '-' : `${formatted}`;
}

/**
 * 格式化字数显示（别名，与 formatCharCount 相同）
 * @param count 字数
 * @returns 格式化后的字符串
 */
export function formatWordCount(count: number | null): string {
  return formatCharCount(count);
}

