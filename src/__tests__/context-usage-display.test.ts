import './setup';
import { describe, expect, it } from 'vitest';
import { formatContextUsage } from '../utils/context-usage-display';

describe('上下文用量显示', () => {
  it.each([
    [{ tokens: 42000, estimated: false }, 128000, '42,000', 33, '33% · 42,000 / 128,000'],
    [{ tokens: 42000, estimated: true }, 128000, '≈42,000', 33, '33% · ≈42,000 / 128,000'],
    [{ tokens: 42000, estimated: true }, undefined, '≈42,000', undefined, '≈42,000 Tokens'],
  ] as const)(
    '实测、估算及未知窗口的显示 %j',
    (measurement, window, tokenLabel, percentage, label) => {
      expect(formatContextUsage(measurement, window)).toEqual({ tokenLabel, percentage, label });
    },
  );
});
