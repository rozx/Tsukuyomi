import { describe, expect, it } from 'vitest';
import { formatAppVersion } from 'src/utils/app-version';

describe('formatAppVersion', () => {
  it('有提交数时显示为 x.y.z.提交数 (短 SHA)', () => {
    expect(formatAppVersion('0.18.1', '0fa51f9', '1532')).toBe('0.18.1.1532 (0fa51f9)');
  });

  it('没有提交数时只显示 x.y.z (短 SHA)', () => {
    expect(formatAppVersion('0.18.1', '0fa51f9', '')).toBe('0.18.1 (0fa51f9)');
    expect(formatAppVersion('0.18.1', '0fa51f9', undefined)).toBe('0.18.1 (0fa51f9)');
  });

  it('没有 commit 时显示 dev', () => {
    expect(formatAppVersion('0.18.1', undefined, undefined)).toBe('0.18.1 (dev)');
    expect(formatAppVersion('0.18.1', '', '')).toBe('0.18.1 (dev)');
  });

  it('提交数不是正整数时忽略', () => {
    for (const count of ['0', '-1', 'abc', '1.5']) {
      expect(formatAppVersion('0.18.1', '0fa51f9', count)).toBe('0.18.1 (0fa51f9)');
    }
  });

  it('APP_VERSION 仍带旧的第 4 段时先去掉，避免出现 x.y.z.w.提交数', () => {
    expect(formatAppVersion('0.18.1.5', '0fa51f9', '1532')).toBe('0.18.1.1532 (0fa51f9)');
    expect(formatAppVersion('0.18.1.5', '0fa51f9', undefined)).toBe('0.18.1 (0fa51f9)');
  });
});
