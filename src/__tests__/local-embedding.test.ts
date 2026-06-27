import { describe, test, expect, afterEach } from 'bun:test';
import { isLocalEmbeddingEffectivelyEnabled } from 'src/utils/local-embedding';
import { isMobileDevice, setPlatformOverride } from 'src/utils/platform';

describe('isLocalEmbeddingEffectivelyEnabled', () => {
  afterEach(() => setPlatformOverride(null));

  test('手机端:无论 storedValue 是什么,都返回 false', () => {
    setPlatformOverride({ is: { mobile: true, desktop: false } });
    expect(isMobileDevice()).toBe(true);
    expect(isLocalEmbeddingEffectivelyEnabled(true)).toBe(false);
    expect(isLocalEmbeddingEffectivelyEnabled(false)).toBe(false);
    expect(isLocalEmbeddingEffectivelyEnabled(undefined)).toBe(false);
  });

  test('桌面端:透传 storedValue(undefined / false / true 都如实返回)', () => {
    setPlatformOverride({ is: { mobile: false, desktop: true } });
    expect(isMobileDevice()).toBe(false);
    expect(isLocalEmbeddingEffectivelyEnabled(true)).toBe(true);
    expect(isLocalEmbeddingEffectivelyEnabled(false)).toBe(false);
    expect(isLocalEmbeddingEffectivelyEnabled(undefined)).toBe(false);
  });

  test('Platform 缺失或异常:回落为桌面行为(不阻断功能)', () => {
    setPlatformOverride(undefined);
    expect(isMobileDevice()).toBe(false);
    expect(isLocalEmbeddingEffectivelyEnabled(true)).toBe(true);
  });
});
