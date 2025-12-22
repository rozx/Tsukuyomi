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

  it('短文本（不足窗口大小）且高重复时也应判定为降级', () => {
    const original = '原文仅出现一次。';
    const translation = '失败了'.repeat(30); // 约 90 个字符，小于默认窗口 100

    const result = detectRepeatingCharacters(translation, original);
    expect(result).toBe(true);
  });

  it('输出长度远超原文且高度重复时应判定为降级（即使原文也重复）', () => {
    const original = '成功した'.repeat(33); // ~132 字符
    const translation = '成功了'.repeat(200); // ~600 字符，约 4.5 倍

    const result = detectRepeatingCharacters(translation, original);
    expect(result).toBe(true);
  });

  it('输出长度在合理范围内且原文也重复时不应判定为降级', () => {
    const original = '成功した'.repeat(40); // ~160 字符
    const translation = '成功了'.repeat(50); // ~150 字符，约 0.94 倍

    const result = detectRepeatingCharacters(translation, original);
    expect(result).toBe(false);
  });

  it('原文和译文都重复约25次时不应判定为降级（用户报告的问题）', () => {
    const original = '成功した'.repeat(25); // ~100 字符
    const translation = '成功了'.repeat(25); // ~75 字符

    const result = detectRepeatingCharacters(translation, original);
    expect(result).toBe(false);
  });

  it('原文和译文都重复约30次时不应判定为降级（用户报告的新问题）', () => {
    const original = '成功した'.repeat(30); // ~120 字符
    const translation = '成功了'.repeat(30); // ~90 字符

    const result = detectRepeatingCharacters(translation, original);
    expect(result).toBe(false);
  });

  it('原文33次重复带句号，译文30次重复不应判定为降级（用户报告的新问题2）', () => {
    const original =
      '成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した。';
    const translation =
      '成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了';

    const result = detectRepeatingCharacters(translation, original);
    expect(result).toBe(false);
  });

  it('原文带ID前缀格式，译文30次重复不应判定为降级（模拟实际翻译场景）', () => {
    // 模拟实际的 chunkText 格式：[ID: xxx] 原文\n\n
    const originalText =
      '成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した。';
    const chunkText = `[ID: abc12345] ${originalText}\n\n`;
    const translation =
      '成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了';

    const result = detectRepeatingCharacters(translation, chunkText);
    expect(result).toBe(false);
  });

  it('原文33次重复带句号，译文30次重复带空格前缀不应判定为降级', () => {
    const original =
      '成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した。';
    const translation =
      ' 成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了';

    const result = detectRepeatingCharacters(translation, original);
    expect(result).toBe(false);
  });

  it('用户报告：译文30次重复，原文33次重复带句号，不应判定为降级', () => {
    const original =
      '成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した。';
    const translation =
      '成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了成功了';

    const result = detectRepeatingCharacters(translation, original);
    expect(result).toBe(false);
  });

  it('译文400+次重复应判定为降级（即使原文也重复，因为长度远超原文）', () => {
    const original =
      '成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した。';
    const translation = '成功了'.repeat(400); // ~1200 字符，约 9 倍

    const result = detectRepeatingCharacters(translation, original);
    expect(result).toBe(true);
  });

  it('带ID前缀的原文，译文400+次重复应判定为降级（模拟实际场景）', () => {
    const originalText =
      '成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した。';
    const chunkText = `[ID: abc12345] ${originalText}\n\n`;
    const translation = '成功了'.repeat(400); // ~1200 字符

    const result = detectRepeatingCharacters(translation, chunkText);
    expect(result).toBe(true);
  });

  it('JSON包装的译文400+次重复应判定为降级（模拟AI实际输出）', () => {
    const originalText =
      '成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した。';
    const chunkText = `[ID: abc12345] ${originalText}\n\n`;
    // 模拟AI实际输出：带JSON包装的翻译
    const repeatedText = '成功了'.repeat(400);
    const jsonOutput = `{"status": "working", "translations": [{"id": "abc12345", "translation": "${repeatedText}"}]}`;

    const result = detectRepeatingCharacters(jsonOutput, chunkText);
    expect(result).toBe(true);
  });

  it('没有原文时，400+次重复应判定为降级', () => {
    const translation = '成功了'.repeat(400); // ~1200 字符

    const result = detectRepeatingCharacters(translation, undefined);
    expect(result).toBe(true);
  });

  it('原文为空字符串时，400+次重复应判定为降级', () => {
    const translation = '成功了'.repeat(400); // ~1200 字符

    const result = detectRepeatingCharacters(translation, '');
    expect(result).toBe(true);
  });

  it('多段落原文（总长度大于译文），译文高重复应判定为降级', () => {
    // 模拟多段落的原文：每段都是高重复文本
    const para1 =
      '[ID: p1] 成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した成功した。\n\n';
    const para2 =
      '[ID: p2] 失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した失敗した。\n\n';
    const para3 =
      '[ID: p3] 終わった終わった終わった終わった終わった終わった終わった終わった終わった終わった終わった終わった終わった終わった終わった終わった終わった終わった終わった終わった終わった終わった終わった終わった終わった終わった終わった。\n\n';
    const chunkText = para1 + para2 + para3;
    const translation = '成功了'.repeat(400); // ~1200 字符

    // 即使原文更长，如果译文高度重复也应检测到
    const result = detectRepeatingCharacters(translation, chunkText);
    expect(result).toBe(true);
  });

  it('原文长度大于译文但原文也高重复时，译文极端重复仍应判定为降级', () => {
    // 原文：5段高重复文本，总长度 ~750 字符
    const originalPara = '成功した'.repeat(33) + '。';
    const chunkText =
      `[ID: p1] ${originalPara}\n\n` +
      `[ID: p2] ${originalPara}\n\n` +
      `[ID: p3] ${originalPara}\n\n` +
      `[ID: p4] ${originalPara}\n\n` +
      `[ID: p5] ${originalPara}\n\n`;
    const translation = '成功了'.repeat(400); // ~1200 字符

    // 虽然原文也高重复，但译文长度相对于原文过长，应检测到
    const result = detectRepeatingCharacters(translation, chunkText);
    expect(result).toBe(true);
  });
});

