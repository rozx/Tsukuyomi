import { describe, expect, it } from 'vitest';
import './setup';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';

describe('AI 执行语言快照', () => {
  it('捕获独立 UI 和目标语言，并发快照不可被后续修改污染', () => {
    const first = captureExecutionLanguages('en-US', 'zh-CN');
    const second = captureExecutionLanguages('zh-CN', 'en-US');
    expect(first).toEqual({ uiLocale: 'en-US', targetLanguage: 'zh-CN' });
    expect(second).toEqual({ uiLocale: 'zh-CN', targetLanguage: 'en-US' });
    expect(() => Object.assign(first, { targetLanguage: 'zh-TW' })).toThrow();
    expect(first.targetLanguage).toBe('zh-CN');
    expect(captureExecutionLanguages('zh-TW')).toEqual({
      uiLocale: 'zh-TW',
      targetLanguage: 'zh-TW',
    });
  });
  it('非法执行语言被拒绝，不回退覆盖另一语言', () => {
    expect(() => captureExecutionLanguages('fr-FR' as never)).toThrow('INVALID_EXECUTION_LANGUAGE');
    expect(() => captureExecutionLanguages('en-US', 'fr-FR' as never)).toThrow(
      'INVALID_EXECUTION_LANGUAGE',
    );
  });
});
