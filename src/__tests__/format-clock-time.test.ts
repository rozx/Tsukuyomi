import { describe, expect, it } from 'vitest';
import './setup';
import { formatClockTime } from '../utils/format';

describe('聊天消息时间按界面语言格式化', () => {
  const at = new Date(2026, 0, 2, 15, 4).getTime();
  it('三种界面语言各用自己的区域格式', () => {
    for (const locale of ['zh-CN', 'zh-TW', 'en-US'] as const) {
      expect(formatClockTime(at, locale)).toBe(
        new Date(at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
      );
    }
    expect(formatClockTime(at, 'en-US')).toMatch(/PM/);
  });
});
