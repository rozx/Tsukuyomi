import { describe, expect, it } from 'vitest';
import './setup';
import { repairReason } from '../composables/book-sync/book-sync-handoff';
import { importError, serializeImportError } from '../services/import/import-error';

const CJK = /[぀-ヿ一-鿿]/;

describe('配方修复原因的执行语言', () => {
  it('缺少配方时以执行语言生成固定说明，不写死简中', () => {
    const english = repairReason(null, 'en-US');
    expect(english.length).toBeGreaterThan(0);
    expect(CJK.test(english)).toBe(false);
    expect(repairReason(null, 'zh-TW')).not.toBe(repairReason(null, 'zh-CN'));
  });

  it('配方失效的自有失败说明按执行语言投影，外部诊断保留原文', () => {
    const owned = serializeImportError(
      importError('RECIPE_CHANGED', 'recipeChangedReopen'),
      'RECIPE_CHANGED',
    );
    const english = repairReason({ status: 'invalid', failed: [{ ...owned, url: '' }] }, 'en-US');
    expect(english.length).toBeGreaterThan(0);
    expect(CJK.test(english)).toBe(false);
    const external = { code: 'CONTENT_FETCH_FAILED', message: 'HTTP 503 upstream', url: 'x' };
    expect(repairReason({ status: 'invalid', failed: [external] }, 'en-US')).toContain(
      'HTTP 503 upstream',
    );
  });

  it('失效但没有失败记录时使用执行语言的通用说明', () => {
    const english = repairReason({ status: 'invalid', failed: [] }, 'en-US');
    expect(english.length).toBeGreaterThan(0);
    expect(CJK.test(english)).toBe(false);
  });
});
