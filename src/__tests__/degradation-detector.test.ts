import { describe, expect, it } from 'bun:test';
import { detectRepeatingCharacters } from '../services/ai/degradation-detector';

describe('AI降级检测工具', () => {
  it('当原文同样高重复时不应判定为降级', () => {
    const original = '成功した'.repeat(40);
    const translation = '成功了'.repeat(40);

    const result = detectRepeatingCharacters(translation, original);
    expect(result).toBe(false);
  });

  it('原文正常但译文严重重复时应判定为降级', () => {
    const original = '这是一个正常的句子，包含不同的内容。'.repeat(5);
    const translation = '失败了'.repeat(40);

    const result = detectRepeatingCharacters(translation, original);
    expect(result).toBe(true);
  });
});

