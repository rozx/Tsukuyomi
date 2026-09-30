import { describe, expect, it } from 'vitest';
import './setup';
import { formatRelativeTimeWithFallback } from '../utils/format';
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
});
