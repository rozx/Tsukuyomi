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

/**
 * 格式化时间戳为相对时间（如：刚刚、x 分钟前、x 小时前等）
 * @param timestamp 时间戳（毫秒）
 * @param nowMs 当前时间戳（毫秒，可选）。传入该参数可用于让 UI 基于响应式 now 刷新显示。
 * @returns 格式化后的相对时间字符串
 */
export function formatRelativeTime(
  timestamp: number | undefined | null,
  nowMs?: number,
): string {
  if (!timestamp || timestamp === 0) {
    return '从未';
  }
  const date = new Date(timestamp);
  const now = nowMs !== undefined ? new Date(nowMs) : new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return '刚刚';
  } else if (minutes < 60) {
    return `${minutes} 分钟前`;
  } else if (hours < 24) {
    return `${hours} 小时前`;
  } else if (days < 7) {
    return `${days} 天前`;
  } else {
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

