import { describe, test, expect, afterEach, mock } from 'bun:test';

describe('isLocalEmbeddingEffectivelyEnabled', () => {
  afterEach(() => {
    mock.restore();
  });

  test('手机端:无论 storedValue 是什么,都返回 false', async () => {
    mock.module('quasar', () => ({
      Platform: { is: { mobile: true, desktop: false } },
    }));
    const { isLocalEmbeddingEffectivelyEnabled } = await import('src/utils/local-embedding');
    const { isMobileDevice } = await import('src/utils/platform');

    expect(isMobileDevice()).toBe(true);
    expect(isLocalEmbeddingEffectivelyEnabled(true)).toBe(false);
    expect(isLocalEmbeddingEffectivelyEnabled(false)).toBe(false);
    expect(isLocalEmbeddingEffectivelyEnabled(undefined)).toBe(false);
  });

  test('桌面端:透传 storedValue(undefined / false / true 都如实返回)', async () => {
    mock.module('quasar', () => ({
      Platform: { is: { mobile: false, desktop: true } },
    }));
    const { isLocalEmbeddingEffectivelyEnabled } = await import('src/utils/local-embedding');
    const { isMobileDevice } = await import('src/utils/platform');

    expect(isMobileDevice()).toBe(false);
    expect(isLocalEmbeddingEffectivelyEnabled(true)).toBe(true);
    expect(isLocalEmbeddingEffectivelyEnabled(false)).toBe(false);
    expect(isLocalEmbeddingEffectivelyEnabled(undefined)).toBe(false);
  });

  test('Platform 缺失或异常:回落为桌面行为(不阻断功能)', async () => {
    mock.module('quasar', () => ({
      Platform: undefined,
    }));
    const { isLocalEmbeddingEffectivelyEnabled } = await import('src/utils/local-embedding');
    const { isMobileDevice } = await import('src/utils/platform');

    expect(isMobileDevice()).toBe(false);
    expect(isLocalEmbeddingEffectivelyEnabled(true)).toBe(true);
  });
});
