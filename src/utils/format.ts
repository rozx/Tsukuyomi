import type { AppLocale } from 'src/models/locale';
import { translateText } from 'src/i18n/translate';
/**
 * 格式化数字为易读格式
 * @param count 数字
 * @returns 格式化后的字符串（如：1.5k, 10.2万）
 */
function formatNumber(count: number | null, locale: AppLocale = 'zh-CN'): string {
  if (count === null) return '-';
  if (count === 0) return '0';
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (locale === 'en-US')
    return count < 1000000 ? `${(count / 1000).toFixed(1)}k` : `${(count / 1000000).toFixed(1)}m`;
  return `${(count / 10000).toFixed(1)}${locale === 'zh-TW' ? '萬' : '万'}`;
}

/**
 * 格式化字符数显示
 * @param count 字符数
 * @returns 格式化后的字符串（如：3.2k 字, 6.7万 字）
 */
/** 聊天消息等处的时:分，按界面语言的区域格式显示。 */
export function formatClockTime(timestamp: number, locale: AppLocale): string {
  return new Date(timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

export function formatCharCount(count: number | null, locale: AppLocale = 'zh-CN'): string {
  const formatted = formatNumber(count, locale);
  return formatted === '-' ? '-' : `${formatted}`;
}

/**
 * 格式化字数显示（别名，与 formatCharCount 相同）
 * @param count 字数
 * @returns 格式化后的字符串
 */
export function formatWordCount(count: number | null, locale: AppLocale = 'zh-CN'): string {
  return formatCharCount(count, locale);
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
  locale: AppLocale = 'zh-CN',
): string {
  const date = new Date(timestamp);
  const now = nowMs !== undefined ? new Date(nowMs) : new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return translateText(locale, 'memoryUi.justNow');
  if (minutes < 60)
    return translateText(locale, minutes === 1 ? 'memoryUi.minuteAgo' : 'memoryUi.minutesAgo', {
      count: minutes,
    });
  if (hours < 24)
    return translateText(locale, hours === 1 ? 'memoryUi.hourAgo' : 'memoryUi.hoursAgo', {
      count: hours,
    });
  if (days < 7)
    return translateText(locale, days === 1 ? 'memoryUi.dayAgo' : 'memoryUi.daysAgo', {
      count: days,
    });
  return fallback(date);
}

/**
 * 书籍列表显示用的相对日期：今天 / 昨天 / N 天前 / N 周前 / N 个月前，
 * 超过一年回落到 `YYYY-MM-DD`（zh-CN 短日期）。
 *
 * 与 `formatRelativeTime` 不同的是：这里以"天"为最小粒度、不显示小时/分钟，
 * 适合书库卡片、首页"最近阅读"等粗粒度时间展示。
 */
export function formatRelativeBookDate(date: Date | string, locale: AppLocale = 'zh-CN'): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days <= 0) return translateText(locale, 'libraryUi.today');
  if (days === 1) return translateText(locale, 'libraryUi.yesterday');
  if (days < 7) return translateText(locale, 'libraryUi.daysAgo', { count: days });
  if (days < 30) {
    const count = Math.floor(days / 7);
    return translateText(locale, count === 1 ? 'libraryUi.weekAgo' : 'libraryUi.weeksAgo', {
      count,
    });
  }
  if (days < 365) {
    const count = Math.floor(days / 30);
    return translateText(locale, count === 1 ? 'libraryUi.monthAgo' : 'libraryUi.monthsAgo', {
      count,
    });
  }
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * 格式化文件大小为易读字符串（B / KB / MB / GB）。
 * @param bytes 字节数
 * @param fractionDigits 小数位数，默认 2
 * @returns 格式化后的字符串（如：1.50 KB, 2.34 MB）
 */
export function formatFileSize(bytes: number, fractionDigits = 2): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(fractionDigits)} ${sizes[i]}`;
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
 * @param locale 界面语言
 * @returns 格式化后的相对时间字符串
 */
export function formatRelativeTime(
  timestamp: number | undefined | null,
  nowMs?: number,
  locale: AppLocale = 'zh-CN',
): string {
  if (!timestamp || timestamp === 0) {
    return translateText(locale, 'syncUi.time.never');
  }
  return formatRelativeTimeWithFallback(
    timestamp,
    (date) =>
      date.toLocaleDateString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    nowMs,
    locale,
  );
}
