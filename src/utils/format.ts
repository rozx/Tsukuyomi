/**
 * 格式化数字为易读格式
 * @param count 数字
 * @returns 格式化后的字符串（如：1.5k, 10.2万）
 */
function formatNumber(count: number | null): string {
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
 * 相对时间 + 自定义 fallback 的共享核心实现。
 * 距今 < 7 天按"刚刚 / N 分钟前 / N 小时前 / N 天前"展示；
 * 超过则调用 `fallback` 自定义远期格式。
 */
export function formatRelativeTimeWithFallback(
  timestamp: number,
  fallback: (date: Date) => string,
  nowMs?: number,
): string {
  const date = new Date(timestamp);
  const now = nowMs !== undefined ? new Date(nowMs) : new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  return fallback(date);
}

/**
 * 书籍列表显示用的相对日期：今天 / 昨天 / N 天前 / N 周前 / N 个月前，
 * 超过一年回落到 `YYYY-MM-DD`（zh-CN 短日期）。
 *
 * 与 `formatRelativeTime` 不同的是：这里以"天"为最小粒度、不显示小时/分钟，
 * 适合书库卡片、首页"最近阅读"等粗粒度时间展示。
 */
export function formatRelativeBookDate(date: Date | string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * 将日期格式化为 YYYY-MM-DD 字符串。无效日期或空值返回空字符串。
 */
export function formatDate(date: Date | string | undefined | null): string {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  return formatRelativeTimeWithFallback(
    timestamp,
    (date) =>
      date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    nowMs,
  );
}

