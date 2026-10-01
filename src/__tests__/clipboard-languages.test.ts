import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { copyTextWithToast } from '../utils/clipboard';
import type { AppLocale } from '../models/locale';
afterEach(() => vi.restoreAllMocks());
describe('剪贴板通用反馈语言', () => {
  it('显式英文生成固定反馈且复制内容不变', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const add = vi.fn();
    const copy = copyTextWithToast as (
      text: string,
      toast: { add: typeof add },
      options: { locale: AppLocale },
    ) => Promise<void>;
    await copy('用户URL原文', { add }, { locale: 'en-US' });
    expect(writeText).toHaveBeenCalledWith('用户URL原文');
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ summary: 'Copied', detail: 'Copied to clipboard' }),
    );
  });
});
