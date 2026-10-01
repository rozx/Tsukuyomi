import { describe, expect, it } from 'vitest';
import './setup';
import { formatRelativeTime, formatRelativeTimeWithFallback } from '../utils/format';
import type { AppLocale } from '../models/locale';
const format = formatRelativeTimeWithFallback as (
  time: number,
  fallback: (date: Date) => string,
  now?: number,
  locale?: AppLocale,
) => string;
describe('记忆相对时间语言', () => {
  it('保留分段阈值与日期回退，英文时间不带中文单位', () => {
    const now = 2000000000000;
    expect(format(now - 30000, () => 'raw date', now, 'en-US')).toBe('Just now');
    expect(format(now - 60000, () => 'raw date', now, 'en-US')).toBe('1 minute ago');
    expect(format(now - 7200000, () => 'raw date', now, 'zh-TW')).toBe('2 小時前');
    expect(format(now - 8 * 86400000, () => 'raw date', now, 'en-US')).toBe('raw date');
  });

  it('同步时间的"从未"与日期回退跟随界面语言', () => {
    const now = 2000000000000;
    expect(formatRelativeTime(0, now, 'en-US')).toBe('Never');
    expect(formatRelativeTime(null, now, 'zh-TW')).toBe('從未');
    expect(formatRelativeTime(now - 30 * 86400000, now, 'en-US')).not.toMatch(/[一-鿿]/);
    expect(formatRelativeTime(0, now)).toBe('从未');
  });
});
