import './setup';
import { describe, test, expect } from 'bun:test';
import {
  verifyParagraphCompleteness,
  type VerificationResult,
} from 'src/services/ai/tasks/utils/response-parser';

describe('verifyParagraphCompleteness', () => {
  test('全部段落已翻译时返回 allComplete: true', () => {
    const expectedIds = ['p1', 'p2', 'p3'];
    const received = new Map([
      ['p1', '翻译1'],
      ['p2', '翻译2'],
      ['p3', '翻译3'],
    ]);

    const result: VerificationResult = verifyParagraphCompleteness(expectedIds, received);

    expect(result.allComplete).toBe(true);
    expect(result.missingIds).toEqual([]);
  });

  test('部分段落缺失时返回 allComplete: false 并列出缺失 ID', () => {
    const expectedIds = ['p1', 'p2', 'p3', 'p4'];
    const received = new Map([
      ['p1', '翻译1'],
      ['p3', '翻译3'],
    ]);

    const result = verifyParagraphCompleteness(expectedIds, received);

    expect(result.allComplete).toBe(false);
    expect(result.missingIds).toEqual(['p2', 'p4']);
  });

  test('空的期望列表应返回 allComplete: true', () => {
    const result = verifyParagraphCompleteness([], new Map());

    expect(result.allComplete).toBe(true);
    expect(result.missingIds).toEqual([]);
  });

  test('所有段落都缺失时全部列出', () => {
    const expectedIds = ['p1', 'p2'];
    const received = new Map<string, string>();

    const result = verifyParagraphCompleteness(expectedIds, received);

    expect(result.allComplete).toBe(false);
    expect(result.missingIds).toEqual(['p1', 'p2']);
  });

  test('received 中有多余的段落不影响结果', () => {
    const expectedIds = ['p1'];
    const received = new Map([
      ['p1', '翻译1'],
      ['p99', '翻译99'],
    ]);

    const result = verifyParagraphCompleteness(expectedIds, received);

    expect(result.allComplete).toBe(true);
    expect(result.missingIds).toEqual([]);
  });
});
